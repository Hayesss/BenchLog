import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { protocols, protocolVersions, type ProtocolSnapshot } from "@db/schema";
import { materialSchema, stepGroupSchema, paramSchema } from "./zodSchemas";
import { PROTOCOL_TEMPLATES } from "@contracts/protocol-templates";
import { bumpProtocolUse } from "./lib/activity";

const protocolContentInput = {
  name: z.string().min(1),
  category: z.string().default("其他"),
  color: z.string().default("#3E7C6B"),
  description: z.string().optional(),
  materials: z.array(materialSchema).default([]),
  stepGroups: z.array(stepGroupSchema).default([]),
  params: z.array(paramSchema).default([]),
  tags: z.array(z.string()).default([]),
};

function snapshotOf(p: typeof protocols.$inferSelect): ProtocolSnapshot {
  return {
    name: p.name,
    category: p.category,
    color: p.color,
    description: p.description,
    version: p.version,
    materials: p.materials,
    stepGroups: p.stepGroups,
    params: p.params,
    tags: p.tags,
  };
}

export const protocolRouter = createRouter({
  list: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(protocols)
      .where(eq(protocols.userId, ctx.user.id))
      .orderBy(desc(protocols.updatedAt)),
  ),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select()
      .from(protocols)
      .where(and(eq(protocols.id, input.id), eq(protocols.userId, ctx.user.id)));
    return rows[0] ?? null;
  }),

  create: authedQuery
    .input(z.object({ ...protocolContentInput, version: z.string().default("v1.0") }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(protocols)
        .values({ ...input, description: input.description ?? null, userId: ctx.user.id })
        .$returningId();
      const p = (
        await getDb().select().from(protocols).where(eq(protocols.id, id))
      )[0];
      await getDb().insert(protocolVersions).values({
        protocolId: id,
        userId: ctx.user.id,
        version: p.version,
        note: "初始版本",
        snapshot: snapshotOf(p),
      });
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        version: z.string().optional(),
        name: z.string().min(1).optional(),
        category: z.string().optional(),
        color: z.string().optional(),
        description: z.string().nullable().optional(),
        materials: z.array(materialSchema).optional(),
        stepGroups: z.array(stepGroupSchema).optional(),
        params: z.array(paramSchema).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      await getDb()
        .update(protocols)
        .set(clean)
        .where(and(eq(protocols.id, id), eq(protocols.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(protocolVersions)
      .where(and(eq(protocolVersions.protocolId, input.id), eq(protocolVersions.userId, ctx.user.id)));
    await getDb()
      .delete(protocols)
      .where(and(eq(protocols.id, input.id), eq(protocols.userId, ctx.user.id)));
    return { ok: true };
  }),

  /** 把当前内容快照为一个历史版本（在保存新一轮修改前调用） */
  saveVersion: authedQuery
    .input(z.object({ id: z.number(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const p = (
        await getDb()
          .select()
          .from(protocols)
          .where(and(eq(protocols.id, input.id), eq(protocols.userId, ctx.user.id)))
      )[0];
      if (!p) throw new Error("Protocol not found");
      await getDb().insert(protocolVersions).values({
        protocolId: p.id,
        userId: ctx.user.id,
        version: p.version,
        note: input.note ?? null,
        snapshot: snapshotOf(p),
      });
      return { ok: true };
    }),

  listVersions: authedQuery
    .input(z.object({ protocolId: z.number() }))
    .query(({ ctx, input }) =>
      getDb()
        .select()
        .from(protocolVersions)
        .where(
          and(
            eq(protocolVersions.protocolId, input.protocolId),
            eq(protocolVersions.userId, ctx.user.id),
          ),
        )
        .orderBy(desc(protocolVersions.createdAt)),
    ),

  incrementUse: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(protocols)
        .set({ useCount: sql`${protocols.useCount} + 1` })
        .where(and(eq(protocols.id, input.id), eq(protocols.userId, ctx.user.id)));
      bumpProtocolUse(ctx.user.id);
      return { ok: true };
    }),

  /** 星标置顶：工作台「常用方法」钉选/取消 */
  setPinned: authedQuery
    .input(z.object({ id: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(protocols)
        .set({ pinned: input.pinned, pinnedAt: input.pinned ? new Date() : null })
        .where(and(eq(protocols.id, input.id), eq(protocols.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 导入预置模板（同名跳过） */
  seedTemplates: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const existing = await db.select().from(protocols).where(eq(protocols.userId, ctx.user.id));
    const existingNames = new Set(existing.map((p) => p.name));
    let inserted = 0;
    for (const t of PROTOCOL_TEMPLATES) {
      if (existingNames.has(t.name)) continue;
      const [{ id }] = await db
        .insert(protocols)
        .values({
          userId: ctx.user.id,
          name: t.name,
          category: t.category,
          color: t.color,
          description: t.description,
          version: t.version,
          materials: t.materials,
          stepGroups: t.stepGroups,
          params: t.params,
          tags: t.tags,
        })
        .$returningId();
      await db.insert(protocolVersions).values({
        protocolId: id,
        userId: ctx.user.id,
        version: t.version,
        note: "模板初始版本",
        snapshot: {
          name: t.name,
          category: t.category,
          color: t.color,
          description: t.description,
          version: t.version,
          materials: t.materials,
          stepGroups: t.stepGroups,
          params: t.params,
          tags: t.tags,
        },
      });
      inserted++;
    }
    return { inserted };
  }),
});
