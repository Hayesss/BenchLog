import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  records,
  recordImages,
  recordAttachments,
  recordVersions,
  recordRefs,
  projects,
  protocols,
  users,
} from "@db/schema";
import type { RecordSnapshot } from "@db/schema";
import { dateStr, deviationSchema, recordStatusSchema } from "./zodSchemas";
import {
  refsWithMeta,
  referencedByRecords,
  syncRecordRefs,
} from "./lib/record-refs";
import { assertCollabReadable, assertOwner } from "./lib/collab";
import { shareMembers } from "@db/schema";

const recordFieldsInput = {
  title: z.string().min(1),
  recordDate: dateStr,
  purpose: z.string().optional(),
  projectId: z.number().nullable().optional(),
  protocolId: z.number().nullable().optional(),
  protocolVersion: z.string().nullable().optional(),
  deviations: z.array(deviationSchema).default([]),
  resultMd: z.string().optional(),
  contentHtml: z.string().optional(),
  conclusion: z.string().optional(),
  nextStep: z.string().optional(),
  status: recordStatusSchema.default("ongoing"),
  tags: z.array(z.string()).default([]),
};

/** P1 性能：列表投影列——去掉 contentHtml(LONGTEXT)/resultMd(text) 两个大字段与 userId/deletedAt（查询已滤/无需回传），
    列表页传输量降 90%+；卡片/搜索/筛选所需字段全保留（tsc 兜底调用方） */
const RECORD_LIST_COLS = {
  id: records.id,
  projectId: records.projectId,
  protocolId: records.protocolId,
  protocolVersion: records.protocolVersion,
  title: records.title,
  recordDate: records.recordDate,
  purpose: records.purpose,
  deviations: records.deviations,
  lockedAt: records.lockedAt,
  lockedNote: records.lockedNote,
  conclusion: records.conclusion,
  nextStep: records.nextStep,
  status: records.status,
  tags: records.tags,
  isDemo: records.isDemo,
  createdAt: records.createdAt,
  updatedAt: records.updatedAt,
} as const;

/** 关联 project/protocol 对象：按需 IN 查询（只拉涉及行，不再全量扫两表）；byId 传完整行同样兼容 */
async function attachMeta<T extends { projectId: number | null; protocolId: number | null }>(
  userId: number,
  rows: T[],
) {
  const db = getDb();
  const pIds = [...new Set(rows.map((r) => r.projectId).filter((v): v is number => v != null))];
  const prIds = [...new Set(rows.map((r) => r.protocolId).filter((v): v is number => v != null))];
  const [ps, prs] = await Promise.all([
    pIds.length
      ? db.select().from(projects).where(and(eq(projects.userId, userId), inArray(projects.id, pIds)))
      : Promise.resolve([]),
    prIds.length
      ? db.select().from(protocols).where(and(eq(protocols.userId, userId), inArray(protocols.id, prIds)))
      : Promise.resolve([]),
  ]);
  const pMap = new Map(ps.map((p) => [p.id, p]));
  const prMap = new Map(prs.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    project: r.projectId ? (pMap.get(r.projectId) ?? null) : null,
    protocol: r.protocolId ? (prMap.get(r.protocolId) ?? null) : null,
  }));
}

/** 取记录行的快照（版本历史只留核心字段子集） */
function snapshotOf(r: typeof records.$inferSelect): RecordSnapshot {
  return {
    title: r.title,
    recordDate: r.recordDate,
    projectId: r.projectId ?? null,
    protocolId: r.protocolId ?? null,
    protocolVersion: r.protocolVersion ?? null,
    purpose: r.purpose ?? null,
    deviations: r.deviations ?? [],
    resultMd: r.resultMd ?? null,
    contentHtml: r.contentHtml ?? null,
    conclusion: r.conclusion ?? null,
    nextStep: r.nextStep ?? null,
    status: r.status,
    tags: r.tags ?? [],
  };
}

/** 覆盖保存/恢复前留「上一版」快照；记录不存在或非本人时不留（由调用方继续抛错或静默） */
/** 把记录当前行快照进版本历史（update / summarizeToRecord 追加前调用） */
export async function snapshotCurrent(userId: number, recordId: number) {
  const db = getDb();
  const cur = await db
    .select()
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)));
  if (!cur[0]) return false;
  await db.insert(recordVersions).values({
    userId,
    recordId,
    snapshot: snapshotOf(cur[0]),
  });
  return true;
}

/** 写入前校验（#20-II 协作感知）：记录未进回收站、未锁定，且当前用户为所有者或 editor 成员
    （viewer 明确 FORBIDDEN）。返回记录行（含所有者 userId，refs 索引/级联写须用所有者 id）。 */
async function assertRecordWritable(userId: number, recordId: number) {
  const rows = await getDb()
    .select({
      id: records.id,
      userId: records.userId,
      deletedAt: records.deletedAt,
      lockedAt: records.lockedAt,
    })
    .from(records)
    .where(eq(records.id, recordId));
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
  if (row.deletedAt)
    throw new TRPCError({ code: "BAD_REQUEST", message: "记录已在回收站，请先恢复再操作" });
  if (row.lockedAt)
    throw new TRPCError({ code: "FORBIDDEN", message: "记录已签署锁定，请先解除锁定再修改" });
  if (row.userId !== userId) {
    const mem = await getDb()
      .select({ role: shareMembers.role })
      .from(shareMembers)
      .where(
        and(
          eq(shareMembers.kind, "record"),
          eq(shareMembers.targetId, recordId),
          eq(shareMembers.memberId, userId),
        ),
      );
    if (!mem[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在或无权访问" });
    if (mem[0].role === "viewer")
      throw new TRPCError({ code: "FORBIDDEN", message: "你对此记录只有查看权限" });
  }
  return row;
}

export const recordRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          projectId: z.number().optional(),
          status: recordStatusSchema.optional(),
          from: dateStr.optional(),
          to: dateStr.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(records.userId, ctx.user.id), isNull(records.deletedAt)];
      if (input?.projectId) conds.push(eq(records.projectId, input.projectId));
      if (input?.status) conds.push(eq(records.status, input.status));
      if (input?.from) conds.push(gte(records.recordDate, input.from));
      if (input?.to) conds.push(lte(records.recordDate, input.to));
      // 投影列 + (recordDate, id) 降序（id 自增≈createdAt 序，且与 listPage 键集游标一致）
      const rows = await getDb()
        .select(RECORD_LIST_COLS)
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.recordDate), desc(records.id));
      return attachMeta(ctx.user.id, rows);
    }),

  /** P1 性能：键集分页列表（Records 页默认视图）——(recordDate,id) 降序游标，limit+1 探测 hasMore */
  listPage: authedQuery
    .input(
      z.object({
        projectIds: z.array(z.number()).max(20).optional(),
        status: recordStatusSchema.optional(),
        from: dateStr.optional(),
        to: dateStr.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(records.userId, ctx.user.id), isNull(records.deletedAt)];
      if (input.projectIds?.length) conds.push(inArray(records.projectId, input.projectIds));
      if (input.status) conds.push(eq(records.status, input.status));
      if (input.from) conds.push(gte(records.recordDate, input.from));
      if (input.to) conds.push(lte(records.recordDate, input.to));
      if (input.cursor) {
        const m = input.cursor.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);
        if (m) {
          const [, d, cid] = m;
          conds.push(
            or(
              lt(records.recordDate, d),
              and(eq(records.recordDate, d), lt(records.id, Number(cid))),
            )!,
          );
        }
      }
      const rows = await getDb()
        .select(RECORD_LIST_COLS)
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.recordDate), desc(records.id))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const last = items[items.length - 1];
      return {
        items: await attachMeta(ctx.user.id, items),
        nextCursor: hasMore && last ? `${last.recordDate}_${last.id}` : null,
      };
    }),

  /** P1 性能：轻量统计（Records 页头部「共 N 条 / 本月 / 进行中」）——一次条件聚合，不拉行 */
  stats: authedQuery
    .input(z.object({ monthPrefix: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select({
          total: sql<number>`count(*)`,
          ongoing: sql<number>`coalesce(sum(${records.status} = 'ongoing'), 0)`,
          month: sql<number>`coalesce(sum(${records.recordDate} like ${input.monthPrefix + '%'}), 0)`,
        })
        .from(records)
        .where(and(eq(records.userId, ctx.user.id), isNull(records.deletedAt)));
      return {
        total: Number(row?.total ?? 0),
        ongoing: Number(row?.ongoing ?? 0),
        month: Number(row?.month ?? 0),
      };
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    // #20-II 协作读：先按 id 取行（不限归属），再按 owner/editor/viewer 断言访问角色
    const rows = await getDb()
      .select()
      .from(records)
      .where(eq(records.id, input.id));
    if (!rows[0]) return null;
    const access = await assertCollabReadable(ctx.user.id, "record", input.id);
    if (rows[0].deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "记录已删除" });
    // meta/refs 均按对象所有者域解析（成员打开时项目/方法/引用归属所有者）
    const ownerId = rows[0].userId;
    const [withMeta] = await attachMeta(ownerId, [rows[0]]);
    const images = await getDb()
      .select()
      .from(recordImages)
      .where(eq(recordImages.recordId, input.id))
      .orderBy(recordImages.createdAt);
    // F4 Relevant Items：正向引用（本记录 chips 指向）+ 反向被引用（谁的 chips 指向本记录）
    const [refs, referencedBy] = await Promise.all([
      refsWithMeta(ownerId, input.id),
      referencedByRecords(ownerId, input.id),
    ]);
    // 协作语境附所有者显示名（viewer 横幅等）；owner 自己看为 null 省一次查询
    let ownerName: string | null = null;
    if (access !== "owner") {
      const u = await getDb()
        .select({ name: users.name, unionId: users.unionId })
        .from(users)
        .where(eq(users.id, ownerId));
      ownerName = u[0] ? (u[0].name ?? u[0].unionId.replace(/^local:/, "")) : null;
    }
    return { ...withMeta, images, refs, referencedBy, access, ownerName };
  }),

  create: authedQuery.input(z.object(recordFieldsInput)).mutation(async ({ ctx, input }) => {
    const [{ id }] = await getDb()
      .insert(records)
      .values({
        ...input,
        projectId: input.projectId ?? null,
        protocolId: input.protocolId ?? null,
        protocolVersion: input.protocolVersion ?? null,
        userId: ctx.user.id,
      })
      .$returningId();
    // F4：富文本芯片引用全量建索引
    await syncRecordRefs(ctx.user.id, id, input.contentHtml);
    return { id };
  }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...recordFieldsInput }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const row = await assertRecordWritable(ctx.user.id, id);
      // 保存前先把当前行快照进版本历史（留下「上一版」）；版本/引用索引归所有者域
      await snapshotCurrent(row.userId, id);
      const res = await getDb()
        .update(records)
        .set({
          ...data,
          projectId: data.projectId ?? null,
          protocolId: data.protocolId ?? null,
          protocolVersion: data.protocolVersion ?? null,
        })
        .where(eq(records.id, id));
      void res;
      // F4：仅 contentHtml 变更时重建引用索引（undefined 跳过语义——未传则不解析）
      if (data.contentHtml !== undefined) {
        await syncRecordRefs(row.userId, id, data.contentHtml);
      }
      return { ok: true };
    }),

  /** 版本历史（新→旧），snapshot 含 resultMd 便于回看；#20-II 协作读成员可见，恢复仍所有者专属 */
  versions: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertCollabReadable(ctx.user.id, "record", input.recordId);
      return getDb()
        .select()
        .from(recordVersions)
        .where(eq(recordVersions.recordId, input.recordId))
        .orderBy(desc(recordVersions.savedAt), desc(recordVersions.id));
    }),

  /** 恢复某版本：先把当前行同样快照，再把快照字段写回 records */
  restoreVersion: authedQuery
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const vs = await db
        .select()
        .from(recordVersions)
        .where(and(eq(recordVersions.id, input.versionId), eq(recordVersions.userId, ctx.user.id)));
      const version = vs[0];
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "版本不存在" });
      await assertRecordWritable(ctx.user.id, version.recordId);
      const snap = version.snapshot;
      // 恢复前的当前行也先留一版，保证可反悔
      const owned = await snapshotCurrent(ctx.user.id, version.recordId);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      await db
        .update(records)
        .set({
          title: snap.title,
          recordDate: snap.recordDate,
          projectId: snap.projectId ?? null,
          protocolId: snap.protocolId ?? null,
          protocolVersion: snap.protocolVersion ?? null,
          purpose: snap.purpose ?? null,
          deviations: snap.deviations ?? [],
          resultMd: snap.resultMd ?? null,
          contentHtml: snap.contentHtml ?? null,
          conclusion: snap.conclusion ?? null,
          nextStep: snap.nextStep ?? null,
          status: snap.status,
          tags: snap.tags ?? [],
        })
        .where(and(eq(records.id, version.recordId), eq(records.userId, ctx.user.id)));
      // F4：快照回写后按快照内容重建引用索引
      await syncRecordRefs(ctx.user.id, version.recordId, snap.contentHtml);
      return { ok: true, recordId: version.recordId };
    }),

  /** 签署锁定：锁定后 update/updateStatus/remove/restoreVersion 均被 assertRecordWritable 拒绝 */
  lock: authedQuery
    .input(z.object({ id: z.number(), note: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ id: records.id, deletedAt: records.deletedAt, lockedAt: records.lockedAt })
        .from(records)
        .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      if (rows[0].deletedAt)
        throw new TRPCError({ code: "BAD_REQUEST", message: "记录已在回收站" });
      if (rows[0].lockedAt) return { ok: true, lockedAt: rows[0].lockedAt, reused: true };
      const now = new Date();
      await db
        .update(records)
        .set({ lockedAt: now, lockedNote: input.note?.trim() || null })
        .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
      return { ok: true, lockedAt: now, reused: false };
    }),

  /** 解除锁定（本人；锁事件本身即审计，lockedAt/lockedNote 随解锁清空） */
  unlock: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const rows = await db
      .select({ id: records.id, lockedAt: records.lockedAt })
      .from(records)
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
    if (!rows[0].lockedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "记录未锁定" });
    await db
      .update(records)
      .set({ lockedAt: null, lockedNote: null })
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    return { ok: true };
  }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: recordStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertRecordWritable(ctx.user.id, input.id);
      await getDb()
        .update(records)
        .set({ status: input.status })
        .where(eq(records.id, input.id));
      return { ok: true };
    }),

  /** 软删除：移入回收站（images/attachments/versions 保留，恢复时完整还原）；仅所有者 */
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    // 锁定记录不可删除（签署内容必须保留审计痕迹，先解锁再删）；删除敏感操作归所有者
    await assertRecordWritable(ctx.user.id, input.id);
    await assertOwner(ctx.user.id, "record", input.id);
    await getDb()
      .update(records)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(records.id, input.id), eq(records.userId, ctx.user.id), isNull(records.deletedAt)),
      );
    return { ok: true };
  }),

  /** 回收站：当前用户已删除的记录（新→旧） */
  trash: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({
        id: records.id,
        title: records.title,
        recordDate: records.recordDate,
        deletedAt: records.deletedAt,
        projectId: records.projectId,
        projectName: projects.name,
      })
      .from(records)
      .leftJoin(projects, eq(records.projectId, projects.id))
      .where(and(eq(records.userId, ctx.user.id), isNotNull(records.deletedAt)))
      .orderBy(desc(records.deletedAt));
    return rows;
  }),

  /** 从回收站恢复 */
  restore: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .update(records)
      .set({ deletedAt: null })
      .where(
        and(eq(records.id, input.id), eq(records.userId, ctx.user.id), isNotNull(records.deletedAt)),
      );
    return { ok: true };
  }),

  /** 彻底删除：级联清掉 images/attachments/versions/refs/members（不可恢复） */
  purge: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(shareMembers)
      .where(and(eq(shareMembers.kind, "record"), eq(shareMembers.targetId, input.id)));
    await getDb()
      .delete(recordRefs)
      .where(and(eq(recordRefs.userId, ctx.user.id), eq(recordRefs.recordId, input.id)));
    await getDb()
      .delete(recordRefs)
      .where(
        and(
          eq(recordRefs.userId, ctx.user.id),
          eq(recordRefs.targetKind, "record"),
          eq(recordRefs.targetId, input.id),
        ),
      );
    await getDb()
      .delete(recordImages)
      .where(and(eq(recordImages.recordId, input.id), eq(recordImages.userId, ctx.user.id)));
    await getDb()
      .delete(recordAttachments)
      .where(
        and(eq(recordAttachments.recordId, input.id), eq(recordAttachments.userId, ctx.user.id)),
      );
    await getDb()
      .delete(recordVersions)
      .where(and(eq(recordVersions.recordId, input.id), eq(recordVersions.userId, ctx.user.id)));
    await getDb()
      .delete(records)
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    return { ok: true };
  }),
});

export const imageRouter = createRouter({
  listByRecord: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(async ({ ctx, input }) => {
      // #20-II 协作读：成员（viewer/editor）同可见
      await assertCollabReadable(ctx.user.id, "record", input.recordId);
      return getDb()
        .select()
        .from(recordImages)
        .where(eq(recordImages.recordId, input.recordId))
        .orderBy(recordImages.createdAt);
    }),

  /** base64 dataURL 上传（移动端 capture 拍照同源处理） */
  upload: authedQuery
    .input(
      z.object({
        recordId: z.number(),
        mime: z.string().regex(/^image\//),
        data: z.string().max(30_000_000), // base64 dataURL
        caption: z.string().optional(),
        kind: z.string().default("其他"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 校验记录可写（所有者或 editor）且未在回收站；图片归所有者域
      const row = await assertRecordWritable(ctx.user.id, input.recordId);
      const [{ id }] = await getDb()
        .insert(recordImages)
        .values({
          userId: row.userId,
          recordId: input.recordId,
          mime: input.mime,
          data: input.data,
          caption: input.caption ?? null,
          kind: input.kind,
        })
        .$returningId();
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        caption: z.string().nullable().optional(),
        kind: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const img = await getDb()
        .select({ recordId: recordImages.recordId })
        .from(recordImages)
        .where(eq(recordImages.id, id));
      if (!img[0]) throw new TRPCError({ code: "NOT_FOUND", message: "图片不存在" });
      await assertRecordWritable(ctx.user.id, img[0].recordId);
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await getDb().update(recordImages).set(clean).where(eq(recordImages.id, id));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const img = await getDb()
      .select({ recordId: recordImages.recordId })
      .from(recordImages)
      .where(eq(recordImages.id, input.id));
    if (!img[0]) throw new TRPCError({ code: "NOT_FOUND", message: "图片不存在" });
    await assertRecordWritable(ctx.user.id, img[0].recordId);
    await getDb().delete(recordImages).where(eq(recordImages.id, input.id));
    return { ok: true };
  }),
});

const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024; // 单文件 2MB 上限

/** 记录附件（Excel / PDF / fcs 等原始数据文件，base64 存库） */
export const attachmentRouter = createRouter({
  /** 附件元信息列表（不返回 data 本体）；#20-II 协作读成员同可见 */
  listByRecord: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertCollabReadable(ctx.user.id, "record", input.recordId);
      return getDb()
        .select({
          id: recordAttachments.id,
          recordId: recordAttachments.recordId,
          name: recordAttachments.name,
          mime: recordAttachments.mime,
          size: recordAttachments.size,
          createdAt: recordAttachments.createdAt,
        })
        .from(recordAttachments)
        .where(eq(recordAttachments.recordId, input.recordId))
        .orderBy(recordAttachments.createdAt);
    }),

  add: authedQuery
    .input(
      z.object({
        recordId: z.number(),
        name: z.string().min(1).max(255),
        mime: z.string().min(1).max(64),
        size: z.number().int().positive(),
        dataBase64: z.string().max(3_000_000), // 2MB 二进制 ≈ 2.8MB base64
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.size > ATTACHMENT_MAX_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "附件超过 2MB 上限" });
      }
      // 归属+锁定校验：锁定记录禁止新增附件（与图片 upload 同一道闸）；附件归所有者域
      const row = await assertRecordWritable(ctx.user.id, input.recordId);
      const [{ id }] = await getDb()
        .insert(recordAttachments)
        .values({
          userId: row.userId,
          recordId: input.recordId,
          name: input.name,
          mime: input.mime,
          size: input.size,
          data: input.dataBase64,
        })
        .$returningId();
      return { id };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    // 先定位附件所属记录，锁定记录禁止删除附件（前端禁用之外的第二道闸）；协作 editor 可删
    const att = await getDb()
      .select({ recordId: recordAttachments.recordId })
      .from(recordAttachments)
      .where(eq(recordAttachments.id, input.id));
    if (!att[0]) throw new TRPCError({ code: "NOT_FOUND", message: "附件不存在" });
    await assertRecordWritable(ctx.user.id, att[0].recordId);
    await getDb().delete(recordAttachments).where(eq(recordAttachments.id, input.id));
    return { ok: true };
  }),

  /** 下载：取回 base64 本体；#20-II 协作读成员同可下载 */
  getData: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select({
        recordId: recordAttachments.recordId,
        name: recordAttachments.name,
        mime: recordAttachments.mime,
        data: recordAttachments.data,
      })
      .from(recordAttachments)
      .where(eq(recordAttachments.id, input.id));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "附件不存在" });
    await assertCollabReadable(ctx.user.id, "record", rows[0].recordId);
    return { name: rows[0].name, mime: rows[0].mime, dataBase64: rows[0].data };
  }),
});
