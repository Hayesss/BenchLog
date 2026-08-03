/**
 * 批次#21 项目组权限中枢：
 * - 组模型：teams.ownerId=组建者（管人/改名/解散），team_members 成员平等
 * - 数据授权：team_shares（ownerId=数据所有者 → 组，kind 预留多域，role 全组统一）
 * - 小鼠库存域：库存以「所有者 userId」为域；可见库存集合 = 自己 ∪ 我所在组被授权的库存
 */
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { teams, teamMembers, teamShares } from "@db/schema";

export type ShareKind = "mouseStock" | "record" | "protocol" | "analysis";
export type StockRole = "owner" | "editor" | "viewer";

/** 组内身份：owner（组建者）> member > null */
export async function teamRoleOf(
  userId: number,
  teamId: number,
): Promise<"owner" | "member" | null> {
  const db = getDb();
  const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!t) return null;
  if (t.ownerId === userId) return "owner";
  const [m] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, userId)));
  return m ? "member" : null;
}

export async function assertTeamAccess(userId: number, teamId: number) {
  const role = await teamRoleOf(userId, teamId);
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "项目组不存在或无权访问" });
  return role;
}

export async function assertTeamOwner(userId: number, teamId: number) {
  const role = await teamRoleOf(userId, teamId);
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "项目组不存在或无权访问" });
  if (role !== "owner")
    throw new TRPCError({ code: "FORBIDDEN", message: "仅组建者可执行此操作" });
}

/** 我可见的库存所有者集合（含自己）：自己 ∪ 我所在组经 team_shares 授权的 ownerId */
export async function visibleStockOwnerIds(
  userId: number,
  kind: ShareKind = "mouseStock",
): Promise<number[]> {
  const db = getDb();
  const myTeams = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.memberId, userId));
  const ownedTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.ownerId, userId));
  const teamIds = [...new Set([...myTeams.map((x) => x.teamId), ...ownedTeams.map((x) => x.id)])];
  if (!teamIds.length) return [userId];
  const shares = await db
    .select({ ownerId: teamShares.ownerId })
    .from(teamShares)
    .where(and(inArray(teamShares.teamId, teamIds), eq(teamShares.kind, kind)));
  return [...new Set([userId, ...shares.map((s) => s.ownerId)])];
}

/** 我对某库存（按其所有者定位）的访问级别：owner > editor > viewer > null（多组授权取最高） */
export async function stockAccess(
  userId: number,
  stockOwnerId: number,
  kind: ShareKind = "mouseStock",
): Promise<StockRole | null> {
  if (userId === stockOwnerId) return "owner";
  const db = getDb();
  const myTeams = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.memberId, userId));
  const ownedTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.ownerId, userId));
  const teamIds = [...new Set([...myTeams.map((x) => x.teamId), ...ownedTeams.map((x) => x.id)])];
  if (!teamIds.length) return null;
  const shares = await db
    .select({ role: teamShares.role })
    .from(teamShares)
    .where(
      and(
        inArray(teamShares.teamId, teamIds),
        eq(teamShares.ownerId, stockOwnerId),
        eq(teamShares.kind, kind),
      ),
    );
  if (shares.some((s) => s.role === "editor")) return "editor";
  if (shares.length) return "viewer";
  return null;
}

export async function assertStockReadable(
  userId: number,
  stockOwnerId: number,
  kind: ShareKind = "mouseStock",
) {
  const access = await stockAccess(userId, stockOwnerId, kind);
  if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "库存不存在或无权访问" });
  return access;
}

export async function assertStockWritable(
  userId: number,
  stockOwnerId: number,
  kind: ShareKind = "mouseStock",
) {
  const access = await assertStockReadable(userId, stockOwnerId, kind);
  if (access === "viewer")
    throw new TRPCError({ code: "FORBIDDEN", message: "你对此库存只有查看权限" });
  return access;
}

export async function assertStockOwner(userId: number, stockOwnerId: number) {
  if (userId !== stockOwnerId)
    throw new TRPCError({ code: "FORBIDDEN", message: "仅库存所有者可执行此操作" });
}
