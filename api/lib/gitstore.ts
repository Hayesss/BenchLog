/**
 * 站内 Git 对象引擎 —— content-addressed 存储，SHA-1 计算与 git 完全兼容。
 *
 * 对象存 MySQL（而非本地磁盘），随数据库持久化；生成的 commit hash 是真实
 * git OID，理论上可将对象导出重建为 .git 仓库并被原生 git 识别。
 *
 * 对象模型与 git 一致：
 *   blob   = sha1("blob {size}\\0{content}")
 *   tree   = sha1("tree {size}\\0{entries}")  entries: "{mode} {name}\\0{20-byte raw sha}"，按 git 规则排序
 *   commit = sha1("commit {size}\\0{标准 commit 文本}")
 */
import { createHash } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { gitBlobs, gitTrees, gitCommits, gitRefs, type GitTreeEntry } from "@db/schema";

/* --------------------------------- 常量限制 --------------------------------- */

export const GIT_LIMITS = {
  maxFileBytes: 512 * 1024, // 单文件 512KB（代码文本足够）
  maxNewFilesPerCommit: 50, // 单次提交新增/修改文件数
  maxFilesPerTree: 200, // 单仓库文件总数
  maxPathLength: 200,
} as const;

/** 路径白名单：字母数字 . _ - / 与中文，禁止 .. 、开头/结尾 /、连续 //、反斜杠与空白 */
const PATH_RE = /^[\p{L}\p{N}._\-/]+$/u;

export function validatePath(path: string): string | null {
  const p = path.trim().replace(/^\/+/, "");
  if (!p) return "路径不能为空";
  if (p.length > GIT_LIMITS.maxPathLength) return `路径过长（>${GIT_LIMITS.maxPathLength} 字符）`;
  if (p.includes("..") || p.includes("//") || p.endsWith("/") || p.includes("\\")) return "路径含非法片段（..、//、\\ 或结尾 /）";
  if (!PATH_RE.test(p)) return "路径含非法字符（仅支持中英文、数字、. _ - /）";
  for (const seg of p.split("/")) {
    if (seg.startsWith(".") && seg !== "." && !/^\.[\p{L}\p{N}_\-]/u.test(seg)) return `非法路径段：${seg}`;
  }
  return null;
}

/* --------------------------------- SHA-1 计算 -------------------------------- */

const sha1Hex = (buf: Buffer | string) => createHash("sha1").update(buf).digest("hex");

/** blob sha：与 git hash-object 一致 */
export function blobSha(content: string): { sha: string; size: number } {
  const buf = Buffer.from(content, "utf8");
  const sha = sha1Hex(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, "utf8"), buf]));
  return { sha, size: buf.length };
}

type TreeNode = { name: string; mode: "100644" | "40000"; sha: string };

/** git tree 排序规则：目录名视为带尾随 / 参与字典序比较 */
function gitTreeSort(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    const an = a.mode === "40000" ? `${a.name}/` : a.name;
    const bn = b.mode === "40000" ? `${b.name}/` : b.name;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

function treeObjectSha(nodes: TreeNode[]): string {
  const parts: Buffer[] = [];
  for (const n of gitTreeSort(nodes)) {
    parts.push(Buffer.from(`${n.mode} ${n.name}\0`, "utf8"));
    parts.push(Buffer.from(n.sha, "hex")); // 20-byte raw sha
  }
  const body = Buffer.concat(parts);
  return sha1Hex(Buffer.concat([Buffer.from(`tree ${body.length}\0`, "utf8"), body]));
}

/** 由展平文件清单递归构建 git tree，返回根 tree sha（含各层 tree 的 sha 计算） */
export function flatEntriesToTreeSha(entries: GitTreeEntry[]): string {
  // 按目录层级分组构建
  function buildLevel(prefix: string): string {
    const nodes: TreeNode[] = [];
    const dirs = new Map<string, GitTreeEntry[]>();
    for (const e of entries) {
      if (!e.path.startsWith(prefix)) continue;
      const rest = e.path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        nodes.push({ name: rest, mode: "100644", sha: e.sha });
      } else {
        const dir = rest.slice(0, slash);
        if (!dirs.has(dir)) dirs.set(dir, []);
        dirs.get(dir)!.push(e);
      }
    }
    for (const dir of dirs.keys()) {
      nodes.push({ name: dir, mode: "40000", sha: buildLevel(`${prefix}${dir}/`) });
    }
    return treeObjectSha(nodes);
  }
  return buildLevel("");
}

/** commit sha：与 git commit 对象格式一致 */
export function commitSha(input: {
  treeSha: string;
  parentSha: string | null;
  authorName: string;
  message: string;
  timestampSec: number;
}): string {
  const ident = `${input.authorName} <benchlog@local> ${input.timestampSec} +0000`;
  const lines = [
    `tree ${input.treeSha}`,
    ...(input.parentSha ? [`parent ${input.parentSha}`] : []),
    `author ${ident}`,
    `committer ${ident}`,
    "",
    input.message,
  ];
  const body = lines.join("\n");
  return sha1Hex(`commit ${Buffer.byteLength(body, "utf8")}\0${body}`);
}

/* --------------------------------- 对象读写 --------------------------------- */

/** 写入 blobs（已存在的 sha 跳过） */
async function ensureBlobs(userId: number, files: { path: string; content: string }[]) {
  const out = new Map<string, { sha: string; size: number }>();
  for (const f of files) {
    const { sha, size } = blobSha(f.content);
    out.set(f.path, { sha, size });
    const exist = await getDb()
      .select({ sha: gitBlobs.sha })
      .from(gitBlobs)
      .where(and(eq(gitBlobs.sha, sha), eq(gitBlobs.userId, userId)));
    if (!exist[0]) {
      await getDb().insert(gitBlobs).values({ sha, userId, content: f.content, size });
    }
  }
  return out;
}

async function ensureTree(userId: number, entries: GitTreeEntry[]): Promise<string> {
  const sha = flatEntriesToTreeSha(entries);
  const exist = await getDb()
    .select({ sha: gitTrees.sha })
    .from(gitTrees)
    .where(and(eq(gitTrees.sha, sha), eq(gitTrees.userId, userId)));
  if (!exist[0]) {
    await getDb()
      .insert(gitTrees)
      .values({ sha, userId, entries: [...entries].sort((a, b) => (a.path < b.path ? -1 : 1)), fileCount: entries.length });
  }
  return sha;
}

export async function readTreeEntries(userId: number, treeSha: string): Promise<GitTreeEntry[]> {
  const rows = await getDb()
    .select()
    .from(gitTrees)
    .where(and(eq(gitTrees.sha, treeSha), eq(gitTrees.userId, userId)));
  return rows[0]?.entries ?? [];
}

export async function getHead(userId: number, analysisId: number) {
  const rows = await getDb()
    .select()
    .from(gitRefs)
    .where(and(eq(gitRefs.analysisId, analysisId), eq(gitRefs.userId, userId)));
  return rows[0] ?? null;
}

export async function getCommit(userId: number, sha: string) {
  const rows = await getDb()
    .select()
    .from(gitCommits)
    .where(and(eq(gitCommits.sha, sha), eq(gitCommits.userId, userId)));
  return rows[0] ?? null;
}

/* --------------------------------- 高层操作 --------------------------------- */

export type CommitResult = {
  sha: string;
  short: string;
  parentSha: string | null;
  commitCount: number;
  changes: { added: string[]; modified: string[]; deleted: string[] };
};

/**
 * 提交一批文件变更：与 HEAD tree 合并（同名覆盖、deletePaths 删除），
 * 生成 blob/tree/commit 对象并推进 HEAD。文件内容完全相同则视为无变更。
 */
export async function commitFiles(
  userId: number,
  analysisId: number,
  input: { files: { path: string; content: string }[]; deletePaths?: string[]; message: string; authorName?: string },
): Promise<CommitResult> {
  const head = await getHead(userId, analysisId);
  const parentSha = head?.headSha ?? null;
  const baseEntries: GitTreeEntry[] = parentSha
    ? await readTreeEntries(userId, (await getCommit(userId, parentSha))!.treeSha)
    : [];

  const baseMap = new Map(baseEntries.map((e) => [e.path, e]));
  const blobMap = await ensureBlobs(userId, input.files);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const f of input.files) {
    const next = blobMap.get(f.path)!;
    const prev = baseMap.get(f.path);
    if (!prev) added.push(f.path);
    else if (prev.sha !== next.sha) modified.push(f.path);
    baseMap.set(f.path, { path: f.path, sha: next.sha, size: next.size });
  }
  for (const p of input.deletePaths ?? []) {
    if (baseMap.delete(p)) deleted.push(p);
  }

  if (added.length + modified.length + deleted.length === 0) {
    throw new Error("没有实际变更：文件内容与当前版本一致");
  }

  const entries = [...baseMap.values()];
  if (entries.length > GIT_LIMITS.maxFilesPerTree) {
    throw new Error(`仓库文件数超出上限（${GIT_LIMITS.maxFilesPerTree} 个）`);
  }

  const treeSha = await ensureTree(userId, entries);
  const timestampSec = Math.floor(Date.now() / 1000);
  const message = input.message.trim() || "更新代码";
  const sha = commitSha({ treeSha, parentSha, authorName: input.authorName ?? "BenchLog", message, timestampSec });

  await getDb().insert(gitCommits).values({
    sha,
    userId,
    analysisId,
    parentSha,
    treeSha,
    message,
    authorName: input.authorName ?? "BenchLog",
  });

  const commitCount = (head?.commitCount ?? 0) + 1;
  if (head) {
    await getDb()
      .update(gitRefs)
      .set({ headSha: sha, commitCount })
      .where(and(eq(gitRefs.analysisId, analysisId), eq(gitRefs.userId, userId)));
  } else {
    await getDb().insert(gitRefs).values({ analysisId, userId, headSha: sha, commitCount: 1 });
  }

  return { sha, short: sha.slice(0, 7), parentSha, commitCount, changes: { added, modified, deleted } };
}

/** 沿 parent 链回溯提交历史（从 HEAD 开始） */
export async function listCommits(userId: number, analysisId: number, limit = 100) {
  const head = await getHead(userId, analysisId);
  const commits: NonNullable<Awaited<ReturnType<typeof getCommit>>>[] = [];
  if (!head) return { head: null, commits };
  let cur: string | null = head.headSha;
  while (cur && commits.length < limit) {
    const c = await getCommit(userId, cur);
    if (!c) break;
    commits.push(c);
    cur = c.parentSha;
  }
  return { head, commits };
}

/** 对比 commit 与其 parent 的 tree，得出变更文件清单 */
export async function changedFilesOf(userId: number, commitSha: string) {
  const commit = await getCommit(userId, commitSha);
  if (!commit) return null;
  const cur = new Map((await readTreeEntries(userId, commit.treeSha)).map((e) => [e.path, e]));
  const prev = new Map(
    commit.parentSha
      ? (await readTreeEntries(userId, (await getCommit(userId, commit.parentSha))!.treeSha)).map((e) => [e.path, e])
      : [],
  );
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [p, e] of cur) {
    if (!prev.has(p)) added.push(p);
    else if (prev.get(p)!.sha !== e.sha) modified.push(p);
  }
  for (const p of prev.keys()) if (!cur.has(p)) deleted.push(p);
  return { added, modified, deleted };
}

/** 读取某 commit 下指定路径的文件内容 */
export async function readFileAt(userId: number, commitSha: string, path: string) {
  const commit = await getCommit(userId, commitSha);
  if (!commit) return null;
  const entries = await readTreeEntries(userId, commit.treeSha);
  const entry = entries.find((e) => e.path === path);
  if (!entry) return null;
  const rows = await getDb()
    .select()
    .from(gitBlobs)
    .where(and(eq(gitBlobs.sha, entry.sha), eq(gitBlobs.userId, userId)));
  if (!rows[0]) return null;
  return { path, sha: entry.sha, size: entry.size, content: rows[0].content };
}

/** 批量读取 blob 内容（仓库导出用），返回 sha → content */
export async function readBlobs(userId: number, shas: string[]): Promise<Map<string, string>> {
  if (shas.length === 0) return new Map();
  const rows = await getDb()
    .select({ sha: gitBlobs.sha, content: gitBlobs.content })
    .from(gitBlobs)
    .where(and(eq(gitBlobs.userId, userId), inArray(gitBlobs.sha, shas)));
  return new Map(rows.map((r) => [r.sha, r.content]));
}
