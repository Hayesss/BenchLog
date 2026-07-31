import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bioinfoAnalyses, records, shares } from "@db/schema";

// #20 协作与分享第一期：只读分享链接（仿 Benchling share read-only link）。
// create 幂等：同一目标已有未撤销链接时复用同一 token，避免链接满天飞。

const kindInput = z.enum(["record", "analysis"]);

/** 目标归属校验：本人且未软删除（生信分析表无 deletedAt 列，只校验归属） */
async function assertTargetOwned(userId: number, kind: "record" | "analysis", targetId: number) {
  const db = getDb();
  if (kind === "record") {
    const rows = await db
      .select({ id: records.id })
      .from(records)
      .where(and(eq(records.id, targetId), eq(records.userId, userId), isNull(records.deletedAt)));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
  } else {
    const rows = await db
      .select({ id: bioinfoAnalyses.id })
      .from(bioinfoAnalyses)
      .where(and(eq(bioinfoAnalyses.id, targetId), eq(bioinfoAnalyses.userId, userId)));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "分析不存在" });
  }
}

export const shareRouter = createRouter({
  /** 创建（或复用）只读分享链接 */
  create: authedQuery
    .input(z.object({ kind: kindInput, targetId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertTargetOwned(ctx.user.id, input.kind, input.targetId);
      const db = getDb();
      const existing = await db
        .select()
        .from(shares)
        .where(
          and(
            eq(shares.userId, ctx.user.id),
            eq(shares.kind, input.kind),
            eq(shares.targetId, input.targetId),
            isNull(shares.revokedAt),
          ),
        )
        .limit(1);
      if (existing[0]) return { id: existing[0].id, token: existing[0].token, createdAt: existing[0].createdAt, reused: true };
      const token = randomBytes(16).toString("hex");
      const [{ id }] = await db
        .insert(shares)
        .values({ token, userId: ctx.user.id, kind: input.kind, targetId: input.targetId })
        .$returningId();
      return { id, token, createdAt: new Date(), reused: false };
    }),

  /** 撤销：立即 404，不可恢复（再分享会生成新 token） */
  revoke: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(shares)
        .where(and(eq(shares.id, input.id), eq(shares.userId, ctx.user.id), isNull(shares.revokedAt)));
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "分享链接不存在" });
      await db.update(shares).set({ revokedAt: new Date() }).where(eq(shares.id, input.id));
      return { ok: true };
    }),

  /** 我的分享列表（含目标标题，新→旧；已撤销的也列出便于审计） */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(shares)
      .where(eq(shares.userId, ctx.user.id))
      .orderBy(desc(shares.createdAt), desc(shares.id))
      .limit(100);
    const recIds = rows.filter((r) => r.kind === "record").map((r) => r.targetId);
    const anaIds = rows.filter((r) => r.kind === "analysis").map((r) => r.targetId);
    const titleMap = new Map<string, string>();
    for (const id of recIds) {
      const [r] = await db.select({ t: records.title }).from(records).where(eq(records.id, id));
      if (r) titleMap.set(`record:${id}`, r.t);
    }
    for (const id of anaIds) {
      const [r] = await db.select({ t: bioinfoAnalyses.name }).from(bioinfoAnalyses).where(eq(bioinfoAnalyses.id, id));
      if (r) titleMap.set(`analysis:${id}`, r.t);
    }
    return rows.map((r) => ({
      id: r.id,
      token: r.token,
      kind: r.kind,
      targetId: r.targetId,
      title: titleMap.get(`${r.kind}:${r.targetId}`) ?? "（已删除）",
      createdAt: r.createdAt,
      revoked: r.revokedAt != null,
    }));
  }),
});
