import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { recordTemplates } from "@db/schema";

/** 实验记录模板：新建记录一键预填（存为模板 / 应用模板 / 使用计数） */
export const recordTemplateRouter = createRouter({
  list: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: recordTemplates.id,
        name: recordTemplates.name,
        purpose: recordTemplates.purpose,
        tags: recordTemplates.tags,
        useCount: recordTemplates.useCount,
        updatedAt: recordTemplates.updatedAt,
      })
      .from(recordTemplates)
      .where(eq(recordTemplates.userId, ctx.user.id))
      .orderBy(desc(recordTemplates.useCount), desc(recordTemplates.updatedAt)),
  ),

  /** 应用时取完整正文（list 不带 contentHtml 以瘦身） */
  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select()
      .from(recordTemplates)
      .where(and(eq(recordTemplates.id, input.id), eq(recordTemplates.userId, ctx.user.id)));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "模板不存在" });
    return rows[0];
  }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(120),
        contentHtml: z.string().optional(),
        purpose: z.string().optional(),
        tags: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(recordTemplates)
        .values({
          userId: ctx.user.id,
          name: input.name.trim(),
          contentHtml: input.contentHtml || null,
          purpose: input.purpose || null,
          tags: input.tags,
        })
        .$returningId();
      return { id };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const res = await getDb()
      .delete(recordTemplates)
      .where(and(eq(recordTemplates.id, input.id), eq(recordTemplates.userId, ctx.user.id)));
    void res;
    return { ok: true };
  }),

  /** 应用模板：使用计数 +1（乐观自增） */
  touch: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .update(recordTemplates)
      .set({ useCount: sql`${recordTemplates.useCount} + 1` })
      .where(and(eq(recordTemplates.id, input.id), eq(recordTemplates.userId, ctx.user.id)));
    return { ok: true };
  }),
});
