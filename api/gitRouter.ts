import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { bioinfoAnalyses } from "@db/schema";
import {
  GIT_LIMITS,
  validatePath,
  getHead,
  getCommit,
  readTreeEntries,
  readBlobs,
  commitFiles,
  listCommits,
  changedFilesOf,
  readFileAt,
} from "./lib/gitstore";
import JSZip from "jszip";

/** 校验生信分析归属当前用户 */
async function assertAnalysis(userId: number, analysisId: number) {
  const rows = await getDb()
    .select({ id: bioinfoAnalyses.id, name: bioinfoAnalyses.name })
    .from(bioinfoAnalyses)
    .where(and(eq(bioinfoAnalyses.id, analysisId), eq(bioinfoAnalyses.userId, userId)));
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "生信分析不存在" });
  return rows[0];
}

const fileInput = z.object({
  path: z.string().min(1).max(GIT_LIMITS.maxPathLength + 8),
  content: z.string().max(GIT_LIMITS.maxFileBytes + 1024),
});

const commitOutputFiles = (changes: { added: string[]; modified: string[]; deleted: string[] }) => ({
  added: changes.added,
  modified: changes.modified,
  deleted: changes.deleted,
});

export const gitRouter = createRouter({
  /** 仓库状态：HEAD、提交数、最近提交时间（首次 commit 前视为未初始化） */
  status: authedQuery.input(z.object({ analysisId: z.number() })).query(async ({ ctx, input }) => {
    await assertAnalysis(ctx.user.id, input.analysisId);
    const head = await getHead(ctx.user.id, input.analysisId);
    if (!head) return { initialized: false as const, headSha: null, short: null, commitCount: 0, lastCommitAt: null };
    const c = await getCommit(ctx.user.id, head.headSha);
    return {
      initialized: true as const,
      headSha: head.headSha,
      short: head.headSha.slice(0, 7),
      commitCount: head.commitCount,
      lastCommitAt: c?.createdAt ?? null,
    };
  }),

  /** 文件树：默认 HEAD，可指定任意 commit sha 浏览历史版本 */
  tree: authedQuery
    .input(z.object({ analysisId: z.number(), ref: z.string().length(40).optional() }))
    .query(async ({ ctx, input }) => {
      await assertAnalysis(ctx.user.id, input.analysisId);
      const sha = input.ref ?? (await getHead(ctx.user.id, input.analysisId))?.headSha;
      if (!sha) return { ref: null, entries: [] };
      const commit = await getCommit(ctx.user.id, sha);
      if (!commit || commit.analysisId !== input.analysisId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "提交不存在" });
      }
      return { ref: sha, entries: await readTreeEntries(ctx.user.id, commit.treeSha) };
    }),

  /** 读取单个文件内容（某 commit 版本） */
  file: authedQuery
    .input(z.object({ analysisId: z.number(), ref: z.string().length(40), path: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertAnalysis(ctx.user.id, input.analysisId);
      const commit = await getCommit(ctx.user.id, input.ref);
      if (!commit || commit.analysisId !== input.analysisId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "提交不存在" });
      }
      const f = await readFileAt(ctx.user.id, input.ref, input.path);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
      return f;
    }),

  /** 提交变更：写入/覆盖文件 + 可选删除，生成新 commit 并推进 HEAD */
  commit: authedQuery
    .input(
      z.object({
        analysisId: z.number(),
        files: z.array(fileInput).max(GIT_LIMITS.maxNewFilesPerCommit),
        deletePaths: z.array(z.string()).max(GIT_LIMITS.maxNewFilesPerCommit).optional(),
        message: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAnalysis(ctx.user.id, input.analysisId);
      if (input.files.length === 0 && !(input.deletePaths?.length)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "没有要提交的变更" });
      }
      // 路径与体积校验
      const seen = new Set<string>();
      for (const f of input.files) {
        const err = validatePath(f.path);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: `文件「${f.path}」：${err}` });
        const p = f.path.trim().replace(/^\/+/, "");
        if (seen.has(p)) throw new TRPCError({ code: "BAD_REQUEST", message: `路径重复：${p}` });
        seen.add(p);
        const bytes = Buffer.byteLength(f.content, "utf8");
        if (bytes > GIT_LIMITS.maxFileBytes) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `文件「${p}」超过 ${Math.round(GIT_LIMITS.maxFileBytes / 1024)}KB 上限`,
          });
        }
        // 站内仓库仅保存文本代码：NUL 字符是二进制内容的明确信号
        if (f.content.includes("\u0000")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `文件「${p}」疑似二进制内容，站内仓库仅支持文本代码文件`,
          });
        }
      }
      for (const p of input.deletePaths ?? []) {
        const err = validatePath(p);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: `删除路径「${p}」：${err}` });
      }
      try {
        const result = await commitFiles(ctx.user.id, input.analysisId, {
          files: input.files.map((f) => ({ path: f.path.trim().replace(/^\/+/, ""), content: f.content })),
          deletePaths: input.deletePaths,
          message: input.message ?? "",
          authorName: ctx.user.name ?? "BenchLog",
        });
        return { ...result, changes: commitOutputFiles(result.changes) };
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "提交失败" });
      }
    }),

  /** 提交历史（含每次变更文件统计） */
  log: authedQuery
    .input(z.object({ analysisId: z.number(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      await assertAnalysis(ctx.user.id, input.analysisId);
      const { head, commits } = await listCommits(ctx.user.id, input.analysisId, input.limit ?? 100);
      const items = await Promise.all(
        commits.map(async (c) => ({
          sha: c.sha,
          short: c.sha.slice(0, 7),
          message: c.message,
          authorName: c.authorName,
          createdAt: c.createdAt,
          isHead: c.sha === head?.headSha,
          changes: await changedFilesOf(ctx.user.id, c.sha),
        })),
      );
      return { headSha: head?.headSha ?? null, commitCount: head?.commitCount ?? 0, items };
    }),

  /** 导出仓库为 ZIP：打包指定 commit（默认 HEAD）的全部文件，base64 返回 */
  exportZip: authedQuery
    .input(
      z.object({
        analysisId: z.number(),
        ref: z.string().regex(/^[0-9a-f]{40}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const analysis = await assertAnalysis(ctx.user.id, input.analysisId);
      const head = await getHead(ctx.user.id, input.analysisId);
      if (!head) throw new TRPCError({ code: "NOT_FOUND", message: "仓库尚未初始化" });
      const sha = input.ref ?? head.headSha;
      const commit = await getCommit(ctx.user.id, sha);
      if (!commit || commit.analysisId !== input.analysisId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "commit 不存在或不属于该分析" });
      }
      const entries = await readTreeEntries(ctx.user.id, commit.treeSha);
      if (entries.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "此版本没有文件可导出" });
      }
      const blobs = await readBlobs(ctx.user.id, entries.map((e) => e.sha));
      const zip = new JSZip();
      for (const e of entries) zip.file(e.path, blobs.get(e.sha) ?? "");
      const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
      const safeName = analysis.name.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "repo";
      return {
        base64,
        fileCount: entries.length,
        ref: sha,
        short: sha.slice(0, 7),
        filename: `${safeName}-${sha.slice(0, 7)}.zip`,
      };
    }),
});
