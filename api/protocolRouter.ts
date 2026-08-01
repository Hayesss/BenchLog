import { z } from "zod";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assertCollabReadable, assertOwner } from "./lib/collab";
import { protocols, protocolVersions, shareMembers, type ProtocolSnapshot } from "@db/schema";
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

/** 写入前校验（#20-II 协作感知）：协议未进回收站，且当前用户为所有者或 editor 成员（viewer FORBIDDEN）。
    返回协议行（含所有者 userId）。 */
async function assertProtocolWritable(userId: number, protocolId: number) {
  const rows = await getDb()
    .select({ id: protocols.id, userId: protocols.userId, deletedAt: protocols.deletedAt })
    .from(protocols)
    .where(eq(protocols.id, protocolId));
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "方法不存在" });
  if (row.deletedAt)
    throw new TRPCError({ code: "BAD_REQUEST", message: "方法已在回收站，请先恢复再操作" });
  if (row.userId !== userId) {
    const mem = await getDb()
      .select({ role: shareMembers.role })
      .from(shareMembers)
      .where(
        and(
          eq(shareMembers.kind, "protocol"),
          eq(shareMembers.targetId, protocolId),
          eq(shareMembers.memberId, userId),
        ),
      );
    if (!mem[0]) throw new TRPCError({ code: "NOT_FOUND", message: "方法不存在或无权访问" });
    if (mem[0].role === "viewer")
      throw new TRPCError({ code: "FORBIDDEN", message: "你对此方法只有查看权限" });
  }
  return row;
}

export const protocolRouter = createRouter({
  list: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(protocols)
      .where(and(eq(protocols.userId, ctx.user.id), isNull(protocols.deletedAt)))
      .orderBy(desc(protocols.updatedAt)),
  ),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    // #20-II 协作读：成员（viewer/editor）可打开，附 access 角色供前端只读态
    const rows = await getDb()
      .select()
      .from(protocols)
      .where(and(eq(protocols.id, input.id), isNull(protocols.deletedAt)));
    if (!rows[0]) return null;
    const access = await assertCollabReadable(ctx.user.id, "protocol", input.id);
    return { ...rows[0], access };
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
      await assertProtocolWritable(ctx.user.id, id);
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      await getDb().update(protocols).set(clean).where(eq(protocols.id, id));
      return { ok: true };
    }),

  /** 软删除：移入回收站（protocolVersions 保留，恢复时完整还原）；仅所有者 */
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await assertOwner(ctx.user.id, "protocol", input.id);
    await getDb()
      .update(protocols)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(protocols.id, input.id),
          eq(protocols.userId, ctx.user.id),
          isNull(protocols.deletedAt),
        ),
      );
    return { ok: true };
  }),

  /** 回收站：当前用户已删除的协议（新→旧） */
  trash: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: protocols.id,
        name: protocols.name,
        category: protocols.category,
        version: protocols.version,
        deletedAt: protocols.deletedAt,
      })
      .from(protocols)
      .where(and(eq(protocols.userId, ctx.user.id), isNotNull(protocols.deletedAt)))
      .orderBy(desc(protocols.deletedAt)),
  ),

  /** 从回收站恢复 */
  restore: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .update(protocols)
      .set({ deletedAt: null })
      .where(
        and(
          eq(protocols.id, input.id),
          eq(protocols.userId, ctx.user.id),
          isNotNull(protocols.deletedAt),
        ),
      );
    return { ok: true };
  }),

  /** 彻底删除：级联清掉 protocolVersions/members（不可恢复） */
  purge: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(shareMembers)
      .where(and(eq(shareMembers.kind, "protocol"), eq(shareMembers.targetId, input.id)));
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
      const row = await assertProtocolWritable(ctx.user.id, input.id);
      const p = (await getDb().select().from(protocols).where(eq(protocols.id, input.id)))[0];
      if (!p) throw new Error("Protocol not found");
      await getDb().insert(protocolVersions).values({
        protocolId: p.id,
        userId: row.userId,
        version: p.version,
        note: input.note ?? null,
        snapshot: snapshotOf(p),
      });
      return { ok: true };
    }),

  listVersions: authedQuery
    .input(z.object({ protocolId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertCollabReadable(ctx.user.id, "protocol", input.protocolId);
      return getDb()
        .select()
        .from(protocolVersions)
        .where(eq(protocolVersions.protocolId, input.protocolId))
        .orderBy(desc(protocolVersions.createdAt));
    }),

  incrementUse: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollabReadable(ctx.user.id, "protocol", input.id);
      await getDb()
        .update(protocols)
        .set({ useCount: sql`${protocols.useCount} + 1` })
        .where(eq(protocols.id, input.id));
      bumpProtocolUse(ctx.user.id);
      return { ok: true };
    }),

  /** 星标置顶：工作台「常用方法」钉选/取消 */
  setPinned: authedQuery
    .input(z.object({ id: z.number(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertProtocolWritable(ctx.user.id, input.id);
      await getDb()
        .update(protocols)
        .set({ pinned: input.pinned, pinnedAt: input.pinned ? new Date() : null })
        .where(eq(protocols.id, input.id));
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
