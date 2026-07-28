import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { projects, tags } from "@db/schema";

export const projectRouter = createRouter({
  list: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(projects)
      .where(eq(projects.userId, ctx.user.id))
      .orderBy(desc(projects.createdAt)),
  ),
  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1),
        color: z.string().default("#3E7C6B"),
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
        color: z.string().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(projects)
        .set(data)
        .where(and(eq(projects.id, id), eq(projects.userId, ctx.user.id)));
      return { ok: true };
    }),
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
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
