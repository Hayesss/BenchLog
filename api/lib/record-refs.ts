/**
 * record_refs 索引维护与查询（批次F F4 Relevant Items 双向链接）。
 *
 * 数据流：记录富文本 contentHtml 里的引用芯片（<a data-ref-chip data-kind data-ref-id …>）
 * 在 contentHtml 三处写入点（create / update 且 contentHtml 变更 / restoreVersion）全量重建
 * 该记录的出边（先删后插，幂等）；正向「本记录引用了谁」按 recordId 查，
 * 反向「谁引用了我」借 record_refs_target_idx 按 (targetKind, targetId) 反查。
 *
 * 服务端无 DOMParser，用正则解析 <a> 标签属性（芯片由 RefChip.renderHTML 生成，属性名稳定）。
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { recordRefs, records, protocols, samples, sampleBoxes } from "@db/schema";

export type RefTargetKind = "record" | "protocol" | "sample";

export type ParsedRef = { kind: RefTargetKind; id: number };

/** 从 contentHtml 提取芯片目标（去重、保序） */
export function parseRefsFromHtml(html: string | null | undefined): ParsedRef[] {
  if (!html || !html.includes("data-ref-chip")) return [];
  const out: ParsedRef[] = [];
  const seen = new Set<string>();
  const tagRe = /<a\b[^>]*\bdata-ref-chip\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const kind = /\bdata-kind="(record|protocol|sample)"/.exec(tag)?.[1] as RefTargetKind | undefined;
    const idStr = /\bdata-ref-id="(\d+)"/.exec(tag)?.[1];
    if (!kind || !idStr) continue;
    const id = Number(idStr);
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id });
  }
  return out;
}

/** 全量重建某记录的出边（空内容即清空）；自引用（@自己）不计入 */
export async function syncRecordRefs(
  userId: number,
  recordId: number,
  contentHtml: string | null | undefined,
) {
  const db = getDb();
  await db
    .delete(recordRefs)
    .where(and(eq(recordRefs.userId, userId), eq(recordRefs.recordId, recordId)));
  const refs = parseRefsFromHtml(contentHtml).filter((r) => !(r.kind === "record" && r.id === recordId));
  if (refs.length) {
    await db.insert(recordRefs).values(
      refs.map((r) => ({ userId, recordId, targetKind: r.kind, targetId: r.id })),
    );
  }
}

export type RefEdge = {
  kind: RefTargetKind;
  id: number; // targetId
  /** 目标已删除/不存在时为 null（前端显示「已失效」） */
  target: {
    label: string;
    sub: string | null;
    href: string;
  } | null;
};

function wellLabel(row: number, col: number) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

/** 正向：本记录引用的目标（带展示信息与跳转链接） */
export async function refsWithMeta(userId: number, recordId: number): Promise<RefEdge[]> {
  const db = getDb();
  const edges = await db
    .select()
    .from(recordRefs)
    .where(and(eq(recordRefs.userId, userId), eq(recordRefs.recordId, recordId)));
  if (!edges.length) return [];
  const recIds = edges.filter((e) => e.targetKind === "record").map((e) => e.targetId);
  const proIds = edges.filter((e) => e.targetKind === "protocol").map((e) => e.targetId);
  const samIds = edges.filter((e) => e.targetKind === "sample").map((e) => e.targetId);
  const [recs, pros, sams] = await Promise.all([
    recIds.length
      ? db
          .select({
            id: records.id,
            title: records.title,
            recordDate: records.recordDate,
            status: records.status,
            deletedAt: records.deletedAt,
          })
          .from(records)
          .where(and(eq(records.userId, userId), inArray(records.id, recIds)))
      : Promise.resolve([]),
    proIds.length
      ? db
          .select({ id: protocols.id, name: protocols.name, version: protocols.version })
          .from(protocols)
          .where(and(eq(protocols.userId, userId), inArray(protocols.id, proIds)))
      : Promise.resolve([]),
    samIds.length
      ? db
          .select({
            id: samples.id,
            name: samples.name,
            boxId: samples.boxId,
            row: samples.row,
            col: samples.col,
          })
          .from(samples)
          .where(and(eq(samples.userId, userId), inArray(samples.id, samIds)))
      : Promise.resolve([]),
  ]);
  const recMap = new Map(recs.map((r) => [r.id, r]));
  const proMap = new Map(pros.map((p) => [p.id, p]));
  const samMap = new Map(sams.map((s) => [s.id, s]));
  const boxIds = [...new Set(sams.map((s) => s.boxId))];
  const boxes = boxIds.length
    ? await db
        .select({ id: sampleBoxes.id, name: sampleBoxes.name })
        .from(sampleBoxes)
        .where(and(eq(sampleBoxes.userId, userId), inArray(sampleBoxes.id, boxIds)))
    : [];
  const boxMap = new Map(boxes.map((b) => [b.id, b.name]));

  return edges.map((e) => {
    if (e.targetKind === "record") {
      const t = recMap.get(e.targetId);
      return {
        kind: e.targetKind,
        id: e.targetId,
        target:
          t && !t.deletedAt
            ? {
                label: t.title,
                sub: `${t.recordDate} · ${t.status === "ongoing" ? "进行中" : t.status === "done" ? "已完成" : "已失败"}`,
                href: `/records/${t.id}`,
              }
            : null,
      };
    }
    if (e.targetKind === "protocol") {
      const t = proMap.get(e.targetId);
      return {
        kind: e.targetKind,
        id: e.targetId,
        target: t ? { label: t.name, sub: t.version, href: `/protocols/${t.id}` } : null,
      };
    }
    const t = samMap.get(e.targetId);
    if (!t) return { kind: e.targetKind, id: e.targetId, target: null };
    const well = wellLabel(t.row, t.col);
    return {
      kind: e.targetKind,
      id: e.targetId,
      target: {
        label: t.name,
        sub: `${boxMap.get(t.boxId) ?? "冻存盒"} · ${well}`,
        href: `/samples/${t.boxId}?well=${well}`,
      },
    };
  });
}

export type ReferencedByItem = {
  recordId: number;
  title: string;
  recordDate: string;
  status: "ongoing" | "done" | "failed";
};

/** 反向：谁引用了我（仅 record 类目标有意义——记录详情页「被引用」；过滤已删来源记录） */
export async function referencedByRecords(
  userId: number,
  recordId: number,
): Promise<ReferencedByItem[]> {
  const db = getDb();
  const edges = await db
    .select({ recordId: recordRefs.recordId })
    .from(recordRefs)
    .where(
      and(
        eq(recordRefs.userId, userId),
        eq(recordRefs.targetKind, "record"),
        eq(recordRefs.targetId, recordId),
      ),
    );
  const srcIds = [...new Set(edges.map((e) => e.recordId))].filter((id) => id !== recordId);
  if (!srcIds.length) return [];
  const rows = await db
    .select({
      id: records.id,
      title: records.title,
      recordDate: records.recordDate,
      status: records.status,
    })
    .from(records)
    .where(
      and(eq(records.userId, userId), inArray(records.id, srcIds), isNull(records.deletedAt)),
    )
    .orderBy(records.recordDate);
  return rows
    .map((r) => ({ recordId: r.id, title: r.title, recordDate: r.recordDate, status: r.status }))
    .reverse(); // 日期新→旧
}
