import { z } from "zod";
import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  records,
  recordImages,
  recordAttachments,
  recordVersions,
  projects,
  protocols,
} from "@db/schema";
import type { RecordSnapshot } from "@db/schema";
import { dateStr, deviationSchema, recordStatusSchema } from "./zodSchemas";

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

async function attachMeta(userId: number, rows: (typeof records.$inferSelect)[]) {
  const db = getDb();
  const [ps, prs] = await Promise.all([
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(protocols).where(eq(protocols.userId, userId)),
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

/** 写入前校验：记录须归属当前用户且未进回收站（已软删的记录禁止任何写入） */
async function assertRecordWritable(userId: number, recordId: number) {
  const rows = await getDb()
    .select({ id: records.id, deletedAt: records.deletedAt, lockedAt: records.lockedAt })
    .from(records)
    .where(and(eq(records.id, recordId), eq(records.userId, userId)));
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
  if (rows[0].deletedAt)
    throw new TRPCError({ code: "BAD_REQUEST", message: "记录已在回收站，请先恢复再操作" });
  if (rows[0].lockedAt)
    throw new TRPCError({ code: "FORBIDDEN", message: "记录已签署锁定，请先解除锁定再修改" });
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
      const rows = await getDb()
        .select()
        .from(records)
        .where(and(...conds))
        .orderBy(desc(records.recordDate), desc(records.createdAt));
      return attachMeta(ctx.user.id, rows);
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select()
      .from(records)
      .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
    if (!rows[0]) return null;
    if (rows[0].deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "记录已删除" });
    const [withMeta] = await attachMeta(ctx.user.id, [rows[0]]);
    const images = await getDb()
      .select()
      .from(recordImages)
      .where(eq(recordImages.recordId, input.id))
      .orderBy(recordImages.createdAt);
    return { ...withMeta, images };
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
    return { id };
  }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...recordFieldsInput }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertRecordWritable(ctx.user.id, id);
      // 保存前先把当前行快照进版本历史（留下「上一版」）
      await snapshotCurrent(ctx.user.id, id);
      const res = await getDb()
        .update(records)
        .set({
          ...data,
          projectId: data.projectId ?? null,
          protocolId: data.protocolId ?? null,
          protocolVersion: data.protocolVersion ?? null,
        })
        .where(and(eq(records.id, id), eq(records.userId, ctx.user.id)));
      void res;
      return { ok: true };
    }),

  /** 版本历史（新→旧），snapshot 含 resultMd 便于回看 */
  versions: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(({ ctx, input }) =>
      getDb()
        .select()
        .from(recordVersions)
        .where(
          and(eq(recordVersions.recordId, input.recordId), eq(recordVersions.userId, ctx.user.id)),
        )
        .orderBy(desc(recordVersions.savedAt), desc(recordVersions.id)),
    ),

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
        .where(and(eq(records.id, input.id), eq(records.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** 软删除：移入回收站（images/attachments/versions 保留，恢复时完整还原） */
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    // 锁定记录不可删除（签署内容必须保留审计痕迹，先解锁再删）
    await assertRecordWritable(ctx.user.id, input.id);
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

  /** 彻底删除：级联清掉 images/attachments/versions（不可恢复） */
  purge: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
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
    .query(({ ctx, input }) =>
      getDb()
        .select()
        .from(recordImages)
        .where(and(eq(recordImages.recordId, input.recordId), eq(recordImages.userId, ctx.user.id)))
        .orderBy(recordImages.createdAt),
    ),

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
      // 校验记录归属且未在回收站（已删除记录禁止写入）
      await assertRecordWritable(ctx.user.id, input.recordId);
      const [{ id }] = await getDb()
        .insert(recordImages)
        .values({
          userId: ctx.user.id,
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
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await getDb()
        .update(recordImages)
        .set(clean)
        .where(and(eq(recordImages.id, id), eq(recordImages.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(recordImages)
      .where(and(eq(recordImages.id, input.id), eq(recordImages.userId, ctx.user.id)));
    return { ok: true };
  }),
});

const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024; // 单文件 2MB 上限

/** 记录附件（Excel / PDF / fcs 等原始数据文件，base64 存库） */
export const attachmentRouter = createRouter({
  /** 附件元信息列表（不返回 data 本体） */
  listByRecord: authedQuery
    .input(z.object({ recordId: z.number() }))
    .query(({ ctx, input }) =>
      getDb()
        .select({
          id: recordAttachments.id,
          recordId: recordAttachments.recordId,
          name: recordAttachments.name,
          mime: recordAttachments.mime,
          size: recordAttachments.size,
          createdAt: recordAttachments.createdAt,
        })
        .from(recordAttachments)
        .where(
          and(
            eq(recordAttachments.recordId, input.recordId),
            eq(recordAttachments.userId, ctx.user.id),
          ),
        )
        .orderBy(recordAttachments.createdAt),
    ),

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
      // 归属校验：记录必须属于当前用户
      const rec = await getDb()
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.id, input.recordId), eq(records.userId, ctx.user.id)));
      if (!rec[0]) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      const [{ id }] = await getDb()
        .insert(recordAttachments)
        .values({
          userId: ctx.user.id,
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
    await getDb()
      .delete(recordAttachments)
      .where(and(eq(recordAttachments.id, input.id), eq(recordAttachments.userId, ctx.user.id)));
    return { ok: true };
  }),

  /** 下载：取回 base64 本体 */
  getData: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rows = await getDb()
      .select({
        name: recordAttachments.name,
        mime: recordAttachments.mime,
        data: recordAttachments.data,
      })
      .from(recordAttachments)
      .where(and(eq(recordAttachments.id, input.id), eq(recordAttachments.userId, ctx.user.id)));
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "附件不存在" });
    return { name: rows[0].name, mime: rows[0].mime, dataBase64: rows[0].data };
  }),
});
