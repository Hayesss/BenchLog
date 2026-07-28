import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { flows, todos, projects } from "@db/schema";
import { dateStr, flowNodeSchema } from "./zodSchemas";

export const flowRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [rows, ps] = await Promise.all([
      db.select().from(flows).where(eq(flows.userId, ctx.user.id)).orderBy(desc(flows.createdAt)),
      db.select().from(projects).where(eq(projects.userId, ctx.user.id)),
    ]);
    const pMap = new Map(ps.map((p) => [p.id, p]));
    return rows.map((f) => ({
      ...f,
      project: f.projectId ? (pMap.get(f.projectId) ?? null) : null,
    }));
  }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1),
        color: z.string().default("#3E7C6B"),
        projectId: z.number().nullable().optional(),
        protocolId: z.number().nullable().optional(),
        nodes: z.array(flowNodeSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sorted = [...input.nodes].sort((a, b) => a.date.localeCompare(b.date));
      const [{ id }] = await getDb()
        .insert(flows)
        .values({
          userId: ctx.user.id,
          name: input.name,
          color: input.color,
          projectId: input.projectId ?? null,
          protocolId: input.protocolId ?? null,
          nodes: sorted,
        })
        .$returningId();
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        projectId: z.number().nullable().optional(),
        nodes: z.array(flowNodeSchema).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, nodes, ...rest } = input;
      const data: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      );
      if (nodes) data.nodes = [...nodes].sort((a, b) => a.date.localeCompare(b.date));
      await getDb()
        .update(flows)
        .set(data)
        .where(and(eq(flows.id, id), eq(flows.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(flows).where(and(eq(flows.id, input.id), eq(flows.userId, ctx.user.id)));
    return { ok: true };
  }),
});

export const todoRouter = createRouter({
  listByRange: authedQuery
    .input(z.object({ from: dateStr, to: dateStr }))
    .query(({ ctx, input }) =>
      getDb()
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, ctx.user.id),
            gte(todos.todoDate, input.from),
            lte(todos.todoDate, input.to),
          ),
        )
        .orderBy(todos.todoDate, todos.createdAt),
    ),

  create: authedQuery
    .input(
      z.object({ todoDate: dateStr, text: z.string().min(1), recordId: z.number().nullable().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(todos)
        .values({
          userId: ctx.user.id,
          todoDate: input.todoDate,
          text: input.text,
          recordId: input.recordId ?? null,
        })
        .$returningId();
      return { id };
    }),

  toggle: authedQuery
    .input(z.object({ id: z.number(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(todos)
        .set({ done: input.done })
        .where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)));
      return { ok: true };
    }),

  update: authedQuery
    .input(
      z.object({ id: z.number(), text: z.string().min(1).optional(), todoDate: dateStr.optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await getDb()
        .update(todos)
        .set(clean)
        .where(and(eq(todos.id, id), eq(todos.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().delete(todos).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)));
    return { ok: true };
  }),
});
