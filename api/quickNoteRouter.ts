import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { quickNotes, projects, records, todos } from "@db/schema";
import { dateStr } from "./zodSchemas";

// 注：活跃打点复用全局方案——authedQuery 中间件已对每个认证请求 bumpActive，
// 故本路由的 mutation 不再重复打点（与 recordRouter 一致）。

const kindEnum = z.enum(["idea", "result"]);

/** 归属校验：返回当前用户本人的 quick note，否则 NOT_FOUND */
async function getOwnedNote(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(quickNotes)
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)));
  const note = rows[0];
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "收集箱条目不存在" });
  return note;
}

/** 转正前置校验：条目必须仍在收集箱（inbox） */
function assertInbox(note: { status: string }) {
  if (note.status !== "inbox")
    throw new TRPCError({ code: "BAD_REQUEST", message: "该条目已转正或处理过" });
}

export const quickNoteRouter = createRouter({
  /** 收集箱列表：默认只看 inbox，可按 kind 过滤；附项目名/记录标题便于展示归属 */
  list: authedQuery
    .input(
      z
        .object({
          status: z.enum(["inbox", "done", "all"]).default("inbox"),
          kind: z.enum(["idea", "result", "all"]).default("all"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(quickNotes.userId, ctx.user.id)];
      const status = input?.status ?? "inbox";
      const kind = input?.kind ?? "all";
      if (status !== "all") conds.push(eq(quickNotes.status, status));
      if (kind !== "all") conds.push(eq(quickNotes.kind, kind));
      return getDb()
        .select({
          note: quickNotes,
          projectName: projects.name,
          recordTitle: records.title,
        })
        .from(quickNotes)
        .leftJoin(projects, eq(projects.id, quickNotes.projectId))
        .leftJoin(records, eq(records.id, quickNotes.recordId))
        .where(and(...conds))
        .orderBy(desc(quickNotes.createdAt))
        .limit(200)
        .then((rows) => rows.map((r) => ({ ...r.note, projectName: r.projectName, recordTitle: r.recordTitle })));
    }),

  /** 随手记：idea / result；可选挂项目或记录（须为本人数据） */
  create: authedQuery
    .input(
      z.object({
        kind: kindEnum,
        content: z.string().min(1).max(8000),
        projectId: z.number().optional(),
        recordId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.projectId != null) {
        const p = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));
        if (!p[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      }
      if (input.recordId != null) {
        const r = await db
          .select({ id: records.id })
          .from(records)
          .where(and(eq(records.id, input.recordId), eq(records.userId, ctx.user.id)));
        if (!r[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      }
      const [{ id }] = await db
        .insert(quickNotes)
        .values({
          userId: ctx.user.id,
          kind: input.kind,
          content: input.content,
          projectId: input.projectId ?? null,
          recordId: input.recordId ?? null,
        })
        .$returningId();
      return { id };
    }),

  /** 物理删除（归属校验后） */
  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedNote(ctx.user.id, input.id);
      await getDb()
        .delete(quickNotes)
        .where(and(eq(quickNotes.id, input.id), eq(quickNotes.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 转正为待办：内容截 500 字符进 todos.text，本条目置 done */
  convertToTodo: authedQuery
    .input(z.object({ id: z.number(), date: dateStr }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const note = await getOwnedNote(ctx.user.id, input.id);
      assertInbox(note);
      const [{ id: todoId }] = await db
        .insert(todos)
        .values({
          userId: ctx.user.id,
          todoDate: input.date,
          text: note.content.slice(0, 500),
          recordId: note.recordId ?? null,
        })
        .$returningId();
      await db
        .update(quickNotes)
        .set({ status: "done" })
        .where(eq(quickNotes.id, note.id));
      return { todoId };
    }),

  /** 转正为正式记录：idea → purpose，result → resultMd；回写 note.recordId */
  convertToRecord: authedQuery
    .input(z.object({ id: z.number(), projectId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const note = await getOwnedNote(ctx.user.id, input.id);
      assertInbox(note);
      const projectId = input.projectId ?? note.projectId ?? null;
      if (projectId != null) {
        const p = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id)));
        if (!p[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      }
      // 标题取内容第一行截 40 字符（无换行则取前 40）
      const firstLine = note.content.split("\n")[0] ?? "";
      const title = firstLine.slice(0, 40) || "收集箱记录";
      // recordDate 用服务器 UTC 日期（toISOString）：服务端无客户端时区，
      // 取舍为统一 UTC；如需客户端本地日期，调用方应自行校正后通过 convertToTodo 类接口传参。
      const recordDate = new Date().toISOString().slice(0, 10);
      const [{ id: recordId }] = await db
        .insert(records)
        .values({
          userId: ctx.user.id,
          projectId,
          title,
          recordDate,
          purpose: note.kind === "idea" ? note.content : "",
          resultMd: note.kind === "result" ? note.content : "",
          deviations: [],
          tags: ["收集箱"],
          status: "ongoing",
        })
        .$returningId();
      await db
        .update(quickNotes)
        .set({ status: "done", recordId })
        .where(eq(quickNotes.id, note.id));
      return { recordId };
    }),

  /** 追加到已有记录的 resultMd 末尾（引用块格式），note 置 done 并回写 recordId */
  appendToRecord: authedQuery
    .input(z.object({ id: z.number(), recordId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const note = await getOwnedNote(ctx.user.id, input.id);
      assertInbox(note);
      const target = await db
        .select({ id: records.id, resultMd: records.resultMd, deletedAt: records.deletedAt })
        .from(records)
        .where(and(eq(records.id, input.recordId), eq(records.userId, ctx.user.id)));
      if (!target[0] || target[0].deletedAt)
        throw new TRPCError({ code: "NOT_FOUND", message: "目标记录不存在或已删除" });
      // 追加引用块："> 快速结果 YYYY-MM-DD HH:mm" + 内容每行加 "> " 前缀（UTC 时间，与 recordDate 取舍一致）
      const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      const quoted = note.content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      const block = `\n\n> 快速结果 ${now}\n${quoted}`;
      const newMd = (target[0].resultMd ?? "") + block;
      await db.update(records).set({ resultMd: newMd }).where(eq(records.id, input.recordId));
      await db
        .update(quickNotes)
        .set({ status: "done", recordId: input.recordId })
        .where(eq(quickNotes.id, note.id));
      return { recordId: input.recordId };
    }),
});
