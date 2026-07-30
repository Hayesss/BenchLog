import { z } from "zod";
import { and, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bioinfoAnalyses, projects, records, tags } from "@db/schema";

/** 项目色：16 进制 #RRGGBB（预置色板值也落在该范围内） */
const projectColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 形式的 16 进制值");

/** 项目归属校验：返回行或抛 NOT_FOUND */
async function ownedProject(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
  return rows[0];
}

/** 每个项目的关联计数：湿实验记录数 + 生信分析数 */
async function projectCounts(userId: number) {
  const db = getDb();
  const [recCounts, anaCounts] = await Promise.all([
    db
      .select({ projectId: records.projectId, cnt: count() })
      .from(records)
      .where(eq(records.userId, userId))
      .groupBy(records.projectId),
    db
      .select({ projectId: bioinfoAnalyses.projectId, cnt: count() })
      .from(bioinfoAnalyses)
      .where(eq(bioinfoAnalyses.userId, userId))
      .groupBy(bioinfoAnalyses.projectId),
  ]);
  const recMap = new Map(recCounts.map((r) => [r.projectId, r.cnt]));
  const anaMap = new Map(anaCounts.map((r) => [r.projectId, r.cnt]));
  return { recMap, anaMap };
}

export const projectRouter = createRouter({
  /** 全量列表（含已归档，前端自行分组），每项带 {recordCount, analysisCount} */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [rows, { recMap, anaMap }] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(eq(projects.userId, ctx.user.id))
        .orderBy(desc(projects.createdAt)),
      projectCounts(ctx.user.id),
    ]);
    return rows.map((p) => ({
      ...p,
      recordCount: recMap.get(p.id) ?? 0,
      analysisCount: anaMap.get(p.id) ?? 0,
    }));
  }),
  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1),
        color: projectColorSchema.default("#3E7C6B"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(projects)
        .values({ ...input, userId: ctx.user.id })
        .$returningId();
      return { id };
    }),
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        color: projectColorSchema.optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ownedProject(ctx.user.id, id);
      await getDb()
        .update(projects)
        .set(data)
        .where(and(eq(projects.id, id), eq(projects.userId, ctx.user.id)));
      return { ok: true };
    }),
  /** 改名（管理页 inline 编辑用） */
  rename: authedQuery
    .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await ownedProject(ctx.user.id, input.id);
      await getDb()
        .update(projects)
        .set({ name: input.name })
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
      return { ok: true };
    }),
  /** 换色：限 16 进制 / 预置色板值 */
  setColor: authedQuery
    .input(z.object({ id: z.number(), color: projectColorSchema }))
    .mutation(async ({ ctx, input }) => {
      await ownedProject(ctx.user.id, input.id);
      await getDb()
        .update(projects)
        .set({ color: input.color })
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
      return { ok: true };
    }),
  /** 归档 / 取消归档：归档项退出侧边栏分组，但仍保留关联数据 */
  setArchived: authedQuery
    .input(z.object({ id: z.number(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ownedProject(ctx.user.id, input.id);
      await getDb()
        .update(projects)
        .set({ archived: input.archived })
        .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
      return { ok: true };
    }),
  /** 删除：仅当无关联记录/分析时允许，否则拒绝并提示先移走或删除关联数据 */
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await ownedProject(ctx.user.id, input.id);
    const { recMap, anaMap } = await projectCounts(ctx.user.id);
    const recordCount = recMap.get(input.id) ?? 0;
    const analysisCount = anaMap.get(input.id) ?? 0;
    if (recordCount > 0 || analysisCount > 0) {
      const parts = [
        recordCount > 0 ? `${recordCount} 条湿实验记录` : "",
        analysisCount > 0 ? `${analysisCount} 项生信分析` : "",
      ].filter(Boolean);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `项目下仍有 ${parts.join("、")}，请先移走或删除关联数据`,
      });
    }
    await getDb()
      .delete(projects)
      .where(and(eq(projects.id, input.id), eq(projects.userId, ctx.user.id)));
    return { ok: true };
  }),
});

export const tagRouter = createRouter({
  list: authedQuery.query(({ ctx }) =>
    getDb().select().from(tags).where(eq(tags.userId, ctx.user.id)).orderBy(tags.name),
  ),
  create: authedQuery
    .input(z.object({ name: z.string().min(1), color: z.string().default("#5B7C99") }))
    .mutation(async ({ ctx, input }) => {
      const name = input.name.replace(/^#/, "").trim();
      const existing = await getDb()
        .select()
        .from(tags)
        .where(and(eq(tags.userId, ctx.user.id), eq(tags.name, name)));
      if (existing.length > 0) return { id: existing[0].id };
      const [{ id }] = await getDb()
        .insert(tags)
        .values({ name, color: input.color, userId: ctx.user.id })
        .$returningId();
      return { id };
    }),
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(tags).where(and(eq(tags.id, input.id), eq(tags.userId, ctx.user.id)));
    return { ok: true };
  }),
});
