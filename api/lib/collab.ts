/**
 * 协作权限中枢（#20-II 对象级共享角色）。
 *
 * 角色语义：owner（对象所有者，全权限）> editor（可编辑内容，不可删除/锁定/共享管理）> viewer（只读）。
 * 用法：写路径调 assertCollabWritable / assertOwner；读路径调 getCollabAccess（null 即无权）。
 * 三域对象表：records / protocols / bioinfoAnalyses（均带 userId 与 deleted_at 软删列）。
 */
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { records, protocols, bioinfoAnalyses, shareMembers } from "@db/schema";

export type CollabKind = "record" | "protocol" | "analysis";
export type CollabRole = "owner" | "editor" | "viewer";

const TABLE: Record<CollabKind, typeof records | typeof protocols | typeof bioinfoAnalyses> = {
  record: records,
  protocol: protocols,
  analysis: bioinfoAnalyses,
};

const KIND_LABEL: Record<CollabKind, string> = {
  record: "记录",
  protocol: "方法",
  analysis: "生信分析",
};

/**
 * 取用户对对象的访问角色；对象不存在返回 null（由调用方决定 404 语义），
 * 无权限返回 null。注意：不做 deletedAt 过滤——软删对象的读拦截仍由各路由自管。
 */
export async function getCollabAccess(
  userId: number,
  kind: CollabKind,
  targetId: number,
): Promise<CollabRole | null> {
  const db = getDb();
  const table = TABLE[kind];
  const rows = await db
    .select({ userId: table.userId })
    .from(table)
    .where(eq(table.id, targetId));
  if (!rows[0]) return null;
  if (rows[0].userId === userId) return "owner";
  const mem = await db
    .select({ role: shareMembers.role })
    .from(shareMembers)
    .where(
      and(
        eq(shareMembers.kind, kind),
        eq(shareMembers.targetId, targetId),
        eq(shareMembers.memberId, userId),
      ),
    );
  return mem[0]?.role ?? null;
}

/** 读断言：owner/editor/viewer 任一可过；无权 404（不暴露存在性） */
export async function assertCollabReadable(
  userId: number,
  kind: CollabKind,
  targetId: number,
): Promise<CollabRole> {
  const role = await getCollabAccess(userId, kind, targetId);
  if (!role)
    throw new TRPCError({ code: "NOT_FOUND", message: `${KIND_LABEL[kind]}不存在或无权访问` });
  return role;
}

/** 写断言：owner/editor 可过；viewer FORBIDDEN（明确区别于不存在） */
export async function assertCollabWritable(
  userId: number,
  kind: CollabKind,
  targetId: number,
): Promise<CollabRole> {
  const role = await getCollabAccess(userId, kind, targetId);
  if (!role)
    throw new TRPCError({ code: "NOT_FOUND", message: `${KIND_LABEL[kind]}不存在或无权访问` });
  if (role === "viewer")
    throw new TRPCError({ code: "FORBIDDEN", message: `你对此${KIND_LABEL[kind]}只有查看权限` });
  return role;
}

/** 所有者断言：删除/锁定/共享管理/版本恢复等敏感操作 */
export async function assertOwner(
  userId: number,
  kind: CollabKind,
  targetId: number,
): Promise<void> {
  const role = await getCollabAccess(userId, kind, targetId);
  if (!role)
    throw new TRPCError({ code: "NOT_FOUND", message: `${KIND_LABEL[kind]}不存在或无权访问` });
  if (role !== "owner")
    throw new TRPCError({ code: "FORBIDDEN", message: `仅${KIND_LABEL[kind]}所有者可执行此操作` });
}

/** 对象所有者 id（通知/冗余写用）；对象不存在返回 null */
export async function ownerOf(kind: CollabKind, targetId: number): Promise<number | null> {
  const db = getDb();
  const table = TABLE[kind];
  const rows = await db
    .select({ userId: table.userId })
    .from(table)
    .where(eq(table.id, targetId));
  return rows[0]?.userId ?? null;
}
