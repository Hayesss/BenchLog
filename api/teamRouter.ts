/**
 * 批次#21 项目组 teamRouter：
 * 组 CRUD（建/改名的/解散 owner-only）+ 成员管理（owner 加人移除，member 自退）
 * + 库存授权（shareStock/unshareStock/myStockShares，授权人=数据所有者本人）
 */
import { z } from "zod";
import { and, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { teams, teamMembers, teamShares, users } from "@db/schema";
import { assertTeamAccess, assertTeamOwner, stockAccess, visibleStockOwnerIds } from "./lib/team";

function displayName(u: { name: string | null; unionId: string }) {
  return u.name ?? u.unionId.replace(/^local:/, "");
}

async function namesOf(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await getDb()
    .select({ id: users.id, name: users.name, unionId: users.unionId })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((u) => [u.id, displayName(u)]));
}

export const teamRouter = createRouter({
  /** 建组 */
  create: authedQuery
    .input(z.object({ name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(teams)
        .values({ name: input.name, ownerId: ctx.user.id })
        .$returningId();
      return { id };
    }),

  /** 我的组：我建的（owner）+ 我所在的（member），各附 ownerName 与成员数 */
  listMine: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const owned = await db.select().from(teams).where(eq(teams.ownerId, ctx.user.id)).orderBy(desc(teams.createdAt));
    const memRows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.memberId, ctx.user.id));
    const joined = memRows.length
      ? await db.select().from(teams).where(inArray(teams.id, memRows.map((m) => m.teamId))).orderBy(desc(teams.createdAt))
      : [];
    const all = [...owned, ...joined];
    if (!all.length) return { owned: [], joined: [] };
    const memberCounts = await db
      .select({ teamId: teamMembers.teamId, memberId: teamMembers.memberId })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, all.map((t) => t.id)));
    const countMap = new Map<number, number>();
    for (const m of memberCounts) countMap.set(m.teamId, (countMap.get(m.teamId) ?? 0) + 1);
    const ownerNames = await namesOf([...new Set(joined.map((t) => t.ownerId))]);
    return {
      owned: owned.map((t) => ({ ...t, memberCount: countMap.get(t.id) ?? 0 })),
      joined: joined.map((t) => ({
        ...t,
        memberCount: countMap.get(t.id) ?? 0,
        ownerName: ownerNames.get(t.ownerId) ?? "",
      })),
    };
  }),

  /** 组详情：成员名列表 + 组内数据授权列表（owner/member 可见） */
  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const myRole = await assertTeamAccess(ctx.user.id, input.id);
    const db = getDb();
    const [team] = await db.select().from(teams).where(eq(teams.id, input.id));
    const mems = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, input.id))
      .orderBy(teamMembers.createdAt);
    const shares = await db
      .select()
      .from(teamShares)
      .where(eq(teamShares.teamId, input.id))
      .orderBy(teamShares.createdAt);
    const names = await namesOf([
      team.ownerId,
      ...mems.map((m) => m.memberId),
      ...shares.map((s) => s.ownerId),
    ]);
    return {
      ...team,
      myRole,
      ownerName: names.get(team.ownerId) ?? "",
      members: mems.map((m) => ({
        memberId: m.memberId,
        name: names.get(m.memberId) ?? `用户#${m.memberId}`,
        createdAt: m.createdAt,
      })),
      shares: shares.map((s) => ({
        id: s.id,
        kind: s.kind,
        role: s.role,
        ownerId: s.ownerId,
        ownerName: names.get(s.ownerId) ?? "",
      })),
    };
  }),

  rename: authedQuery
    .input(z.object({ id: z.number(), name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      await assertTeamOwner(ctx.user.id, input.id);
      await getDb().update(teams).set({ name: input.name }).where(eq(teams.id, input.id));
      return { ok: true };
    }),

  /** 解散：级联成员与授权 */
  disband: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await assertTeamOwner(ctx.user.id, input.id);
    const db = getDb();
    await db.delete(teamMembers).where(eq(teamMembers.teamId, input.id));
    await db.delete(teamShares).where(eq(teamShares.teamId, input.id));
    await db.delete(teams).where(eq(teams.id, input.id));
    return { ok: true };
  }),

  /** 加成员（owner；幂等；不能加自己——组建者天然全权） */
  addMember: authedQuery
    .input(z.object({ teamId: z.number(), memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertTeamOwner(ctx.user.id, input.teamId);
      if (input.memberId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "组建者无需加入自己的组" });
      const db = getDb();
      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.memberId));
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      const [existing] = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.memberId, input.memberId)));
      if (existing) return { ok: true, reused: true };
      await db.insert(teamMembers).values({ teamId: input.teamId, memberId: input.memberId });
      return { ok: true, reused: false };
    }),

  /** 移除成员（owner 任意 / member 自退） */
  removeMember: authedQuery
    .input(z.object({ teamId: z.number(), memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.memberId !== ctx.user.id) await assertTeamOwner(ctx.user.id, input.teamId);
      else await assertTeamAccess(ctx.user.id, input.teamId);
      await getDb()
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.memberId, input.memberId)));
      return { ok: true };
    }),

  /** 用户目录（复用 member.directory 语义：模糊、排除自己、上限 8） */
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

  /**
   * 库存授权：把「我的库存」（kind 整体）授权给一个组。
   * 目标组须为我可见（我建的或我所在的）；幂等 upsert 改级别。
   */
  shareStock: authedQuery
    .input(
      z.object({
        teamId: z.number(),
        kind: z.enum(["mouseStock", "record", "protocol", "analysis"]).default("mouseStock"),
        role: z.enum(["viewer", "editor"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTeamAccess(ctx.user.id, input.teamId);
      const db = getDb();
      const [existing] = await db
        .select()
        .from(teamShares)
        .where(
          and(
            eq(teamShares.teamId, input.teamId),
            eq(teamShares.ownerId, ctx.user.id),
            eq(teamShares.kind, input.kind),
          ),
        );
      if (existing) {
        await db.update(teamShares).set({ role: input.role }).where(eq(teamShares.id, existing.id));
        return { ok: true, reused: true };
      }
      await db.insert(teamShares).values({
        teamId: input.teamId,
        ownerId: ctx.user.id,
        kind: input.kind,
        role: input.role,
      });
      return { ok: true, reused: false };
    }),

  /** 撤销授权（授权人本人） */
  unshareStock: authedQuery
    .input(z.object({ teamId: z.number(), kind: z.enum(["mouseStock", "record", "protocol", "analysis"]).default("mouseStock") }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(teamShares)
        .where(
          and(
            eq(teamShares.teamId, input.teamId),
            eq(teamShares.ownerId, ctx.user.id),
            eq(teamShares.kind, input.kind),
          ),
        );
      return { ok: true };
    }),

  /** 我的库存授权清单（Mice 页「同步到项目组」弹窗用） */
  myStockShares: authedQuery
    .input(z.object({ kind: z.enum(["mouseStock", "record", "protocol", "analysis"]).default("mouseStock") }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(teamShares)
        .where(and(eq(teamShares.ownerId, ctx.user.id), eq(teamShares.kind, input.kind)))
        .orderBy(teamShares.createdAt);
      if (!rows.length) return [];
      const ts = await db.select().from(teams).where(inArray(teams.id, rows.map((r) => r.teamId)));
      const tMap = new Map(ts.map((t) => [t.id, t.name]));
      return rows.map((r) => ({
        teamId: r.teamId,
        teamName: tMap.get(r.teamId) ?? `组#${r.teamId}`,
        role: r.role,
      }));
    }),

  /** 我可见的库存来源列表（含自己），Mice 页分组渲染用 */
  stockSources: authedQuery
    .input(z.object({ kind: z.enum(["mouseStock", "record", "protocol", "analysis"]).default("mouseStock") }))
    .query(async ({ ctx, input }) => {
      const ids = await visibleStockOwnerIds(ctx.user.id, input.kind);
      const names = await namesOf(ids);
      // 逐来源求我的访问级别（自己=owner）
      const out = [] as Array<{ ownerId: number; ownerName: string; access: "owner" | "editor" | "viewer" }>;
      for (const id of ids) {
        const access = (await stockAccess(ctx.user.id, id, input.kind))!;
        out.push({ ownerId: id, ownerName: names.get(id) ?? `用户#${id}`, access });
      }
      return out;
    }),
});
