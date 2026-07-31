/**
 * 只读分享公开端点（免登录）：GET /api/share/:token
 * 安全约定：token 16 字节 hex 不可枚举；只返回展示必需字段，
 * 绝不暴露 userId/邮箱/附件本体；revokedAt 非空或目标已删除 → 404。
 */
import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { bioinfoAnalyses, projects, protocols, recordImages, records, shares, users } from "@db/schema";

export interface SharedRecordPayload {
  kind: "record";
  title: string;
  recordDate: string;
  status: string;
  tags: string[];
  projectName: string | null;
  protocolTitle: string | null;
  protocolVersion: string | null;
  purpose: string | null;
  resultMd: string | null;
  conclusion: string | null;
  nextStep: string | null;
  images: { caption: string | null; kind: string; mime: string; data: string }[];
}

export interface SharedAnalysisPayload {
  kind: "analysis";
  name: string;
  analysisDate: string;
  status: string;
  pipeline: string;
  projectName: string | null;
  inputData: string | null;
  dataPath: string | null;
  resultPath: string | null;
  repoUrl: string | null;
  commitHash: string | null;
  environment: string | null;
  command: string | null;
  resultMd: string | null;
  conclusion: string | null;
  nextStep: string | null;
}

export type SharedPayload = {
  sharedBy: string; // 分享者显示名（users.name 或「BenchLog 用户」）
  sharedAt: Date;
  content: SharedRecordPayload | SharedAnalysisPayload;
};

/** 供公开端点与冒烟测试直调：无效/已撤销/目标已删除返回 null */
export async function getSharedPayload(token: string): Promise<SharedPayload | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const db = getDb();
  const shareRows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.token, token), isNull(shares.revokedAt)))
    .limit(1);
  const share = shareRows[0];
  if (!share) return null;

  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, share.userId)).limit(1);
  const sharedBy = owner?.name?.trim() || "BenchLog 用户";

  if (share.kind === "record") {
    const rows = await db
      .select({
        title: records.title,
        recordDate: records.recordDate,
        status: records.status,
        tags: records.tags,
        purpose: records.purpose,
        resultMd: records.resultMd,
        conclusion: records.conclusion,
        nextStep: records.nextStep,
        protocolVersion: records.protocolVersion,
        projectName: projects.name,
        protocolTitle: protocols.name,
      })
      .from(records)
      .leftJoin(projects, eq(projects.id, records.projectId))
      .leftJoin(protocols, eq(protocols.id, records.protocolId))
      .where(and(eq(records.id, share.targetId), isNull(records.deletedAt)))
      .limit(1);
    const r = rows[0];
    if (!r) return null; // 目标已删除 → 链接同步失效
    const images = await db
      .select({
        caption: recordImages.caption,
        kind: recordImages.kind,
        mime: recordImages.mime,
        data: recordImages.data,
      })
      .from(recordImages)
      .where(eq(recordImages.recordId, share.targetId));
    return {
      sharedBy,
      sharedAt: share.createdAt,
      content: { kind: "record", ...r, images },
    };
  }

  const rows = await db
    .select({
      name: bioinfoAnalyses.name,
      analysisDate: bioinfoAnalyses.analysisDate,
      status: bioinfoAnalyses.status,
      pipeline: bioinfoAnalyses.pipeline,
      inputData: bioinfoAnalyses.inputData,
      dataPath: bioinfoAnalyses.dataPath,
      resultPath: bioinfoAnalyses.resultPath,
      repoUrl: bioinfoAnalyses.repoUrl,
      commitHash: bioinfoAnalyses.commitHash,
      environment: bioinfoAnalyses.environment,
      command: bioinfoAnalyses.command,
      resultMd: bioinfoAnalyses.resultMd,
      conclusion: bioinfoAnalyses.conclusion,
      nextStep: bioinfoAnalyses.nextStep,
      projectName: projects.name,
    })
    .from(bioinfoAnalyses)
    .leftJoin(projects, eq(projects.id, bioinfoAnalyses.projectId))
    .where(eq(bioinfoAnalyses.id, share.targetId))
    .limit(1);
  const a = rows[0];
  if (!a) return null;
  return {
    sharedBy,
    sharedAt: share.createdAt,
    content: { kind: "analysis", ...a },
  };
}

export async function sharePublicHandler(c: Context): Promise<Response> {
  const token = c.req.param("token") ?? "";
  const payload = await getSharedPayload(token).catch((e) => {
    console.error("[share/public] 查询失败：", e);
    return null;
  });
  if (!payload) {
    return c.json({ error: "分享链接不存在或已撤销" }, 404);
  }
  return c.json(payload);
}
