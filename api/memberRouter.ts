/**
 * memberRouter（#20-II 对象级共享角色）：
 * - directory：@/共享共用的用户目录（本平台注册用户，模糊搜 name，排除自己）
 * - list/add/updateRole/remove：对象成员管理（owner 专属；member 可自行退出）
 * - sharedWithMe：共享给我的三类对象（记录/方法/生信，角色+所有者名）
 */
import { z } from "zod";
import { and, desc, eq, isNull, like, ne, or, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { shareMembers, users, records, protocols, bioinfoAnalyses } from "@db/schema";
import { assertOwner } from "./lib/collab";

const kindInput = z.enum(["record", "protocol", "analysis"]);
const targetInput = z.object({ kind: kindInput, targetId: z.number() });

/** unionId 形如 local:username 的取 username 兜底显示名 */
function displayName(u: { name: string | null; unionId: string }): string {
  if (u.name && u.name.trim()) return u.name.trim();
  return u.unionId.startsWith("local:") ? u.unionId.slice(6) : u.unionId;
}

async function namesOf(userIds: number[]): Promise<Map<number, string>> {
  if (!userIds.length) return new Map();
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, unionId: users.unionId })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((u) => [u.id, displayName(u)]));
}

export const memberRouter = createRouter({
  /** 用户目录：name/unionId 模糊匹配，排除自己，上限 8 */
  directory: authedQuery
    .input(z.object({ q: z.string().max(64).default("") }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const q = input.q.trim();
      const conds = [ne(users.id, ctx.user.id)];
      if (q) {
        const pat = `%${q}%`;
        conds.push(or(like(users.name, pat), like(users.unionId, pat))!);
      }
      const rows = await db
        .select({ id: users.id, name: users.name, unionId: users.unionId })
        .from(users)
        .where(and(...conds))
        .orderBy(users.id)
        .limit(8);
      return rows.map((u) => ({ id: u.id, name: displayName(u) }));
    }),

  /** 成员列表（owner 专属）：memberId + 显示名 + role */
  list: authedQuery.input(targetInput).query(async ({ ctx, input }) => {
    await assertOwner(ctx.user.id, input.kind, input.targetId);
    const db = getDb();
    const rows = await db
      .select()
      .from(shareMembers)
      .where(and(eq(shareMembers.kind, input.kind), eq(shareMembers.targetId, input.targetId)))
      .orderBy(shareMembers.createdAt);
    const names = await namesOf(rows.map((r) => r.memberId));
    return rows.map((r) => ({
      memberId: r.memberId,
      name: names.get(r.memberId) ?? `用户#${r.memberId}`,
      role: r.role,
      createdAt: r.createdAt,
    }));
  }),

  /** 添加/改角色（幂等 upsert；owner 专属；不能加自己） */
  add: authedQuery
    .input(
      targetInput.extend({
        memberId: z.number(),
        role: z.enum(["viewer", "editor"]).default("viewer"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // assertOwner 同时校验对象存在与所有者身份，并取回 ownerId
      await assertOwner(ctx.user.id, input.kind, input.targetId);
      if (input.memberId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能共享给自己" });
      const target = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.memberId));
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      const existing = await db
        .select()
        .from(shareMembers)
        .where(
          and(
            eq(shareMembers.kind, input.kind),
            eq(shareMembers.targetId, input.targetId),
            eq(shareMembers.memberId, input.memberId),
          ),
        );
      if (existing[0]) {
        await db
          .update(shareMembers)
          .set({ role: input.role })
          .where(eq(shareMembers.id, existing[0].id));
        return { ok: true, reused: true };
      }
      await db.insert(shareMembers).values({
        ownerId: ctx.user.id,
        kind: input.kind,
        targetId: input.targetId,
        memberId: input.memberId,
        role: input.role,
      });
      return { ok: true, reused: false };
    }),

  updateRole: authedQuery
    .input(targetInput.extend({ memberId: z.number(), role: z.enum(["viewer", "editor"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.user.id, input.kind, input.targetId);
      await getDb()
        .update(shareMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(shareMembers.kind, input.kind),
            eq(shareMembers.targetId, input.targetId),
            eq(shareMembers.memberId, input.memberId),
          ),
        );
      return { ok: true };
    }),

  /** 移除成员：owner 可移除任何人；member 可移除自己（退出共享） */
  remove: authedQuery
    .input(targetInput.extend({ memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.memberId !== ctx.user.id) {
        await assertOwner(ctx.user.id, input.kind, input.targetId);
      }
      await getDb()
        .delete(shareMembers)
        .where(
          and(
            eq(shareMembers.kind, input.kind),
            eq(shareMembers.targetId, input.targetId),
            eq(shareMembers.memberId, input.memberId),
          ),
        );
      return { ok: true };
    }),

  /** 共享给我的三类对象（按角色+更新时间倒序） */
  sharedWithMe: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const mems = await db
      .select()
      .from(shareMembers)
      .where(eq(shareMembers.memberId, ctx.user.id))
      .orderBy(desc(shareMembers.createdAt))
    ;
    if (!mems.length) return [];
    const recIds = mems.filter((m) => m.kind === "record").map((m) => m.targetId);
    const proIds = mems.filter((m) => m.kind === "protocol").map((m) => m.targetId);
    const anaIds = mems.filter((m) => m.kind === "analysis").map((m) => m.targetId);
    const [recs, pros, anas] = await Promise.all([
      recIds.length
        ? db
            .select({ id: records.id, title: records.title, userId: records.userId, updatedAt: records.updatedAt })
            .from(records)
            .where(and(inArray(records.id, recIds), isNull(records.deletedAt)))
        : Promise.resolve([]),
      proIds.length
        ? db
            .select({ id: protocols.id, name: protocols.name, userId: protocols.userId, updatedAt: protocols.updatedAt })
            .from(protocols)
            .where(and(inArray(protocols.id, proIds), isNull(protocols.deletedAt)))
        : Promise.resolve([]),
      anaIds.length
        ? db
            .select({ id: bioinfoAnalyses.id, name: bioinfoAnalyses.name, userId: bioinfoAnalyses.userId, updatedAt: bioinfoAnalyses.updatedAt })
            .from(bioinfoAnalyses)
            .where(inArray(bioinfoAnalyses.id, anaIds)) // 生信为硬删除，无软删列
        : Promise.resolve([]),
    ]);
    const recMap = new Map(recs.map((r) => [r.id, r]));
    const proMap = new Map(pros.map((p) => [p.id, p]));
    const anaMap = new Map(anas.map((a) => [a.id, a]));
    const ownerIds = [...new Set([...recs, ...pros, ...anas].map((x) => x.userId))];
    const ownerNames = await namesOf(ownerIds);
    const out: Array<{
      kind: "record" | "protocol" | "analysis";
      targetId: number;
      title: string;
      role: "viewer" | "editor";
      ownerName: string;
      updatedAt: Date;
    }> = [];
    for (const m of mems) {
      if (m.kind === "record") {
        const t = recMap.get(m.targetId);
        if (t)
          out.push({
            kind: "record",
            targetId: t.id,
            title: t.title,
            role: m.role,
            ownerName: ownerNames.get(t.userId) ?? "",
            updatedAt: t.updatedAt,
          });
      } else if (m.kind === "protocol") {
        const t = proMap.get(m.targetId);
        if (t)
          out.push({
            kind: "protocol",
            targetId: t.id,
            title: t.name,
            role: m.role,
            ownerName: ownerNames.get(t.userId) ?? "",
            updatedAt: t.updatedAt,
          });
      } else {
        const t = anaMap.get(m.targetId);
        if (t)
          out.push({
            kind: "analysis",
            targetId: t.id,
            title: t.name,
            role: m.role,
            ownerName: ownerNames.get(t.userId) ?? "",
            updatedAt: t.updatedAt,
          });
      }
    }
    return out;
  }),
});
