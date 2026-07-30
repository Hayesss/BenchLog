import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { flows, todos, projects, records } from "@db/schema";
import { dateStr, flowNodeSchema } from "./zodSchemas";
import { snapshotCurrent } from "./recordRouter";

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
  /** 今日议程：某日未完成待办 + 当日到期的流程节点（铃铛提醒数据源） */
  today: authedQuery.input(z.object({ date: dateStr })).query(async ({ ctx, input }) => {
    const db = getDb();
    const [tds, fs] = await Promise.all([
      db
        .select()
        .from(todos)
        .where(and(eq(todos.userId, ctx.user.id), eq(todos.todoDate, input.date), eq(todos.done, false)))
        .orderBy(todos.createdAt),
      db.select().from(flows).where(eq(flows.userId, ctx.user.id)),
    ]);
    const flowNodes = fs.flatMap((f) =>
      f.nodes
        .filter((n) => n.date === input.date)
        .map((n) => ({ flowId: f.id, flowName: f.name, color: f.color, name: n.name })),
    );
    return { todos: tds, flowNodes };
  }),

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

  /**
   * 把某日「已完成且未关联记录」的待办并入当日实验记录：
   * 当日已有记录 → 追加到最近更新那一条的「## 今日完成」段（段不存在则新建段；追加前留版本快照）；
   * 当日没有记录 → 新建一条。最后回写这些待办的 recordId 建立关联，已关联的不会重复整理。
   */
  summarizeToRecord: authedQuery
    .input(z.object({ date: dateStr }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const doneTodos = await db
        .select()
        .from(todos)
        .where(
          and(
            eq(todos.userId, ctx.user.id),
            eq(todos.todoDate, input.date),
            eq(todos.done, true),
            isNull(todos.recordId),
          ),
        )
        .orderBy(todos.createdAt);
      if (doneTodos.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "没有可整理的已完成待办" });
      }
      const checklist = doneTodos.map((t) => `- [x] ${t.text}`).join("\n");
      const SECTION = "## 今日完成";

      // 当日已有记录：取最近更新的一条（排除回收站；updatedAt 秒级精度，同秒时取后创建的）
      const dayRecords = await db
        .select()
        .from(records)
        .where(
          and(
            eq(records.userId, ctx.user.id),
            eq(records.recordDate, input.date),
            isNull(records.deletedAt),
          ),
        )
        .orderBy(desc(records.updatedAt), desc(records.id));

      let recordId: number;
      let appended = false;
      if (dayRecords.length > 0) {
        const rec = dayRecords[0];
        recordId = rec.id;
        appended = true;
        // 追加前留版本快照（与手动编辑保存一致）
        await snapshotCurrent(ctx.user.id, rec.id);
        const base = (rec.resultMd ?? "").trimEnd();
        let next: string;
        const segIdx = base.indexOf(SECTION);
        if (segIdx === -1) {
          // 无「今日完成」段 → 文末新建段
          next = `${base}${base ? "\n\n" : ""}${SECTION}\n\n${checklist}\n`;
        } else {
          // 已有段 → 追加到该段末尾（下一个二级标题前或文末）
          const afterIdx = base.indexOf("\n## ", segIdx + SECTION.length);
          if (afterIdx === -1) {
            next = `${base}\n${checklist}`;
          } else {
            next = `${base.slice(0, afterIdx).trimEnd()}\n${checklist}\n${base.slice(afterIdx + 1)}`;
          }
        }
        await db.update(records).set({ resultMd: next }).where(eq(records.id, rec.id));
      } else {
        // 当日没有记录 → 新建
        const [{ id }] = await db
          .insert(records)
          .values({
            userId: ctx.user.id,
            title: `${input.date} 实验记录`,
            recordDate: input.date,
            purpose: "由当日已完成待办整理生成，可继续补充细节",
            deviations: [],
            resultMd: `${SECTION}\n\n${checklist}\n`,
            tags: ["待办整理"],
            status: "done",
          })
          .$returningId();
        recordId = id;
      }

      await db
        .update(todos)
        .set({ recordId })
        .where(
          and(
            eq(todos.userId, ctx.user.id),
            inArray(
              todos.id,
              doneTodos.map((t) => t.id),
            ),
          ),
        );
      return { recordId, count: doneTodos.length, appended };
    }),
});
