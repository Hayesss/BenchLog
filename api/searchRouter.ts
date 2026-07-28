import { z } from "zod";
import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { records, recordImages, projects, protocols, tags, flows, todos, exportLogs } from "@db/schema";
import { dateStr } from "./zodSchemas";

/** ⌘K 全局搜索：抗体货号 / 细胞系 / 标签 / 记录结论，跨所有实体 */
export const searchRouter = createRouter({
  global: authedQuery.input(z.object({ q: z.string().min(1) })).query(async ({ ctx, input }) => {
    const db = getDb();
    const q = input.q.toLowerCase();
    const hit = (s: unknown) => String(s ?? "").toLowerCase().includes(q);
    const LIMIT = 8;

    const [ps, rs, prjs, ts, fs, tds] = await Promise.all([
      db.select().from(protocols).where(eq(protocols.userId, ctx.user.id)),
      db.select().from(records).where(eq(records.userId, ctx.user.id)).orderBy(desc(records.recordDate)),
      db.select().from(projects).where(eq(projects.userId, ctx.user.id)),
      db.select().from(tags).where(eq(tags.userId, ctx.user.id)),
      db.select().from(flows).where(eq(flows.userId, ctx.user.id)),
      db.select().from(todos).where(eq(todos.userId, ctx.user.id)),
    ]);

    return {
      protocols: ps
        .filter((p) =>
          [p.name, p.category, p.description, JSON.stringify(p.materials), p.tags.join(" ")].some(hit),
        )
        .slice(0, LIMIT)
        .map((p) => ({ id: p.id, name: p.name, category: p.category, version: p.version })),
      records: rs
        .filter((r) =>
          [r.title, r.purpose, r.resultMd, r.conclusion, r.nextStep, r.tags.join(" ")].some(hit),
        )
        .slice(0, LIMIT)
        .map((r) => ({ id: r.id, title: r.title, recordDate: r.recordDate, status: r.status })),
      projects: prjs
        .filter((p) => [p.name, p.description].some(hit))
        .slice(0, LIMIT)
        .map((p) => ({ id: p.id, name: p.name, color: p.color })),
      tags: ts
        .filter((t) => hit(t.name))
        .slice(0, LIMIT)
        .map((t) => ({ id: t.id, name: t.name, color: t.color })),
      flows: fs
        .filter((f) => [f.name, JSON.stringify(f.nodes)].some(hit))
        .slice(0, LIMIT)
        .map((f) => ({ id: f.id, name: f.name, nodes: f.nodes })),
      todos: tds
        .filter((t) => hit(t.text))
        .slice(0, LIMIT)
        .map((t) => ({ id: t.id, text: t.text, todoDate: t.todoDate, done: t.done })),
    };
  }),
});

export const exportLogRouter = createRouter({
  /** 按范围取导出数据（记录全文 + 图片 + 项目/协议元信息） */
  data: authedQuery
    .input(
      z.object({
        from: dateStr.optional(),
        to: dateStr.optional(),
        projectIds: z.array(z.number()).optional(),
        recordIds: z.array(z.number()).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(records.userId, ctx.user.id)];
      if (input.from) conds.push(gte(records.recordDate, input.from));
      if (input.to) conds.push(lte(records.recordDate, input.to));
      if (input.projectIds?.length) conds.push(inArray(records.projectId, input.projectIds));
      if (input.recordIds?.length) conds.push(inArray(records.id, input.recordIds));
      const rows = await db
        .select()
        .from(records)
        .where(and(...conds))
        .orderBy(records.recordDate);
      const recIds = rows.map((r) => r.id);
      const [imgs, ps, prs] = await Promise.all([
        recIds.length
          ? db.select().from(recordImages).where(inArray(recordImages.recordId, recIds))
          : Promise.resolve([]),
        db.select().from(projects).where(eq(projects.userId, ctx.user.id)),
        db.select().from(protocols).where(eq(protocols.userId, ctx.user.id)),
      ]);
      const pMap = new Map(ps.map((p) => [p.id, p]));
      const prMap = new Map(prs.map((p) => [p.id, p]));
      const imgMap = new Map<number, typeof imgs>();
      for (const im of imgs) {
        const arr = imgMap.get(im.recordId) ?? [];
        arr.push(im);
        imgMap.set(im.recordId, arr);
      }
      return rows.map((r) => ({
        ...r,
        project: r.projectId ? (pMap.get(r.projectId) ?? null) : null,
        protocol: r.protocolId ? (prMap.get(r.protocolId) ?? null) : null,
        images: imgMap.get(r.id) ?? [],
      }));
    }),

  saveLog: authedQuery
    .input(
      z.object({
        format: z.enum(["markdown", "table", "pdf"]),
        scope: z.record(z.string(), z.unknown()),
        content: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(exportLogs)
        .values({
          userId: ctx.user.id,
          format: input.format,
          scope: input.scope,
          content: input.content ?? null,
        })
        .$returningId();
      return { id };
    }),

  list: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(exportLogs)
      .where(eq(exportLogs.userId, ctx.user.id))
      .orderBy(desc(exportLogs.createdAt))
      .limit(20),
  ),
});
