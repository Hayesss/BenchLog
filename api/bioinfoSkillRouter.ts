import { z } from "zod";
import { and, desc, eq, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bioinfoSkills } from "@db/schema";

const skillFieldsInput = {
  title: z.string().min(1).max(255),
  category: z.string().default("其他"),
  language: z.string().default("Bash"),
  summary: z.string().optional(),
  code: z.string().min(1).max(200_000),
  source: z.string().max(500).optional(),
};

function normalize<T extends Record<string, unknown>>(data: T) {
  const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
  return {
    ...data,
    title: (data.title as string).trim(),
    summary: emptyToNull(data.summary) as string | null,
    source: emptyToNull(data.source) as string | null,
  };
}

export const bioinfoSkillRouter = createRouter({
  /** 列表：分类/语言/关键词筛选；code 一并返回（片段小，复制零延迟） */
  list: authedQuery
    .input(
      z
        .object({
          category: z.string().optional(),
          language: z.string().optional(),
          q: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(bioinfoSkills.userId, ctx.user.id)];
      if (input?.category) conds.push(eq(bioinfoSkills.category, input.category));
      if (input?.language) conds.push(eq(bioinfoSkills.language, input.language));
      if (input?.q?.trim()) {
        const kw = `%${input.q.trim()}%`;
        conds.push(or(like(bioinfoSkills.title, kw), like(bioinfoSkills.summary, kw), like(bioinfoSkills.code, kw))!);
      }
      return getDb()
        .select()
        .from(bioinfoSkills)
        .where(and(...conds))
        .orderBy(desc(bioinfoSkills.updatedAt));
    }),

  create: authedQuery.input(z.object(skillFieldsInput)).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb()
      .insert(bioinfoSkills)
      .values({ ...normalize(input), userId: ctx.user.id })
      .$returningId();
    return { id };
  }),

  /** 导出全部技能（JSON 备份/迁移） */
  exportAll: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        title: bioinfoSkills.title,
        category: bioinfoSkills.category,
        language: bioinfoSkills.language,
        summary: bioinfoSkills.summary,
        code: bioinfoSkills.code,
        source: bioinfoSkills.source,
      })
      .from(bioinfoSkills)
      .where(eq(bioinfoSkills.userId, ctx.user.id))
      .orderBy(desc(bioinfoSkills.updatedAt)),
  ),

  /** 批量导入（JSON 数组，逐项校验；单次 ≤200 条） */
  importMany: authedQuery
    .input(z.object({ items: z.array(z.object(skillFieldsInput)).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const rows = input.items.map((it) => ({ ...normalize(it), userId: ctx.user.id }));
      await getDb().insert(bioinfoSkills).values(rows);
      return { count: rows.length };
    }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...skillFieldsInput }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const res = await getDb()
        .update(bioinfoSkills)
        .set(normalize(data))
        .where(and(eq(bioinfoSkills.id, id), eq(bioinfoSkills.userId, ctx.user.id)));
      if ((res[0] as { affectedRows?: number }).affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "技能不存在" });
      }
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(bioinfoSkills)
      .where(and(eq(bioinfoSkills.id, input.id), eq(bioinfoSkills.userId, ctx.user.id)));
    return { ok: true };
  }),
});
