import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { records, recordImages, projects, protocols } from "@db/schema";
import { dateStr, deviationSchema, recordStatusSchema } from "./zodSchemas";

const recordFieldsInput = {
  title: z.string().min(1),
  recordDate: dateStr,
  purpose: z.string().optional(),
  projectId: z.number().nullable().optional(),
  protocolId: z.number().nullable().optional(),
  protocolVersion: z.string().nullable().optional(),
  deviations: z.array(deviationSchema).default([]),
  resultMd: z.string().optional(),
  conclusion: z.string().optional(),
  nextStep: z.string().optional(),
  status: recordStatusSchema.default("ongoing"),
  tags: z.array(z.string()).default([]),
};

async function attachMeta(userId: number, rows: (typeof records.$inferSelect)[]) {
  const db = getDb();
  const [ps, prs] = await Promise.all([
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(protocols).where(eq(protocols.userId, userId)),
  ]);
  const pMap = new Map(ps.map((p) => [p.id, p]));
  const prMap = new Map(prs.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    project: r.projectId ? (pMap.get(r.projectId) ?? null) : null,
    protocol: r.protocolId ? (prMap.get(r.protocolId) ?? null) : null,
  }));
}

export const recordRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          projectId: z.number().optional(),
          status: recordStatusSchema.optional(),
          from: dateStr.optional(),
          to: dateStr.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(records.userId, ctx.user.id)];
      if (input?.projectId) conds.push(eq(records.projectId, input.projectId));
      if (input?.status) conds.push(eq(records.status, input.status));
      if (input?.from) conds.push(gte(records.recordDate, input.from));
      if (input?.to) conds.push(lte(records.recordDate, input.to));
      const rows = await getDb()
        .select()
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.recordDate), desc(records.createdAt));
      return attachMeta(ctx.user.id, rows);
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select()
      .from(records)
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    if (!rows[0]) return null;
    const [withMeta] = await attachMeta(ctx.user.id, [rows[0]]);
    const images = await getDb()
      .select()
      .from(recordImages)
      .where(eq(recordImages.recordId, input.id))
      .orderBy(recordImages.createdAt);
    return { ...withMeta, images };
  }),

  create: authedQuery.input(z.object(recordFieldsInput)).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb()
      .insert(records)
      .values({
        ...input,
        projectId: input.projectId ?? null,
        protocolId: input.protocolId ?? null,
        protocolVersion: input.protocolVersion ?? null,
        userId: ctx.user.id,
      })
      .$returningId();
    return { id };
  }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...recordFieldsInput }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const res = await getDb()
        .update(records)
        .set({
          ...data,
          projectId: data.projectId ?? null,
          protocolId: data.protocolId ?? null,
          protocolVersion: data.protocolVersion ?? null,
        })
        .where(and(eq(records.id, id), eq(records.userId, ctx.user.id)));
      void res;
      return { ok: true };
    }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: recordStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(records)
        .set({ status: input.status })
        .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(recordImages)
      .where(and(eq(recordImages.recordId, input.id), eq(recordImages.userId, ctx.user.id)));
    await getDb()
      .delete(records)
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    return { ok: true };
  }),
});

export const imageRouter = createRouter({
  listByRecord: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(({ ctx, input }) =>
      getDb()
        .select()
        .from(recordImages)
        .where(and(eq(recordImages.recordId, input.recordId), eq(recordImages.userId, ctx.user.id)))
        .orderBy(recordImages.createdAt),
    ),

  /** base64 dataURL 上传（移动端 capture 拍照同源处理） */
  upload: authedQuery
    .input(
      z.object({
        recordId: z.number(),
        mime: z.string().regex(/^image\//),
        data: z.string().max(30_000_000), // base64 dataURL
        caption: z.string().optional(),
        kind: z.string().default("其他"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 校验记录归属
      const rec = await getDb()
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.id, input.recordId), eq(records.userId, ctx.user.id)));
      if (!rec[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      const [{ id }] = await getDb()
        .insert(recordImages)
        .values({
          userId: ctx.user.id,
          recordId: input.recordId,
          mime: input.mime,
          data: input.data,
          caption: input.caption ?? null,
          kind: input.kind,
        })
        .$returningId();
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        caption: z.string().nullable().optional(),
        kind: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await getDb()
        .update(recordImages)
        .set(clean)
        .where(and(eq(recordImages.id, id), eq(recordImages.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(recordImages)
      .where(and(eq(recordImages.id, input.id), eq(recordImages.userId, ctx.user.id)));
    return { ok: true };
  }),
});
