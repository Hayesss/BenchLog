import { and, eq, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  projects,
  protocols,
  protocolVersions,
  records,
  recordImages,
  recordAttachments,
  recordVersions,
  type ProtocolSnapshot,
} from "@db/schema";

/** 本地日期 → YYYY-MM-DD（daysAgo 天前） */
function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEMO_PROTOCOL_CONTENT = {
  name: "细胞传代标准流程（SOP）",
  category: "细胞培养",
  color: "#3E7C6B",
  description: "贴壁细胞（293T/HeLa）日常传代维护标准流程，适用于对数生长期细胞的 1:4–1:6 传代。",
  version: "v1.0",
  materials: [
    { name: "DMEM 高糖培养基", catalog: "Gibco C11995500BT", amount: "500 mL" },
    { name: "胎牛血清 FBS", catalog: "Gibco 10099141", amount: "50 mL" },
    { name: "0.25% Trypsin-EDTA", catalog: "Gibco 25200056", amount: "100 mL" },
    { name: "PBS（无钙镁）", amount: "500 mL" },
  ],
  stepGroups: [
    {
      title: "准备工作",
      steps: [
        { text: "预热培养基、PBS 与胰酶至 37°C（水浴约 15 min）", duration: "15 min" },
        { text: "超净台紫外灭菌 30 min，随后通风 5 min", duration: "35 min" },
        { text: "镜下确认细胞汇合度达 80%–90%、形态正常、无污染" },
      ],
    },
    {
      title: "消化与传代",
      steps: [
        { text: "弃去旧培养基，PBS 轻柔润洗 1 次（沿壁加入，避免冲起细胞）", duration: "2 min" },
        { text: "加入 1 mL 0.25% Trypsin-EDTA（T25），37°C 消化 1–2 min", duration: "2 min" },
        { text: "镜下见细胞变圆脱落即加入 2 mL 完全培养基终止消化" },
        { text: "轻柔吹打制成单细胞悬液，按 1:5 比例接种至新培养瓶，补足培养基至 5 mL" },
        { text: "十字摇匀后置 37°C、5% CO2 培养箱，记录代次与日期" },
      ],
    },
  ],
  params: [
    { name: "消化时间", value: "1–2", unit: "min", note: "293T 易脱壁，勿过度消化" },
    { name: "传代比例", value: "1:4–1:6", note: "维持对数生长期" },
    { name: "培养条件", value: "37°C / 5% CO2" },
  ],
  tags: ["示例", "细胞培养"],
};

export const demoRouter = createRouter({
  /** 当前用户示例数据统计 */
  status: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;
    const count = async (table: typeof records | typeof protocols | typeof projects) => {
      const rows = await db
        .select({ n: sql<number>`count(*)` })
        .from(table)
        .where(and(eq(table.userId, uid), eq(table.isDemo, true)));
      return Number(rows[0]?.n ?? 0);
    };
    const [recordCount, protocolCount, projectCount] = await Promise.all([
      count(records),
      count(protocols),
      count(projects),
    ]);
    return {
      hasDemo: recordCount + protocolCount + projectCount > 0,
      records: recordCount,
      protocols: protocolCount,
      projects: projectCount,
    };
  }),

  /** 一键生成示例数据（已有示例数据时不重复生成） */
  generate: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, uid), eq(projects.isDemo, true)));
    if (existing.length > 0) return { created: false };

    // 1 个示例项目
    const [{ id: projectId }] = await db
      .insert(projects)
      .values({
        userId: uid,
        name: "示例项目 · 细胞实验",
        color: "#3E7C6B",
        description: "演示用示例项目：从细胞传代到蛋白表达检测的完整湿实验流程。",
        isDemo: true,
      })
      .$returningId();

    // 1 个示例 SOP 协议 + 首版快照
    const [{ id: protocolId }] = await db
      .insert(protocols)
      .values({
        userId: uid,
        name: DEMO_PROTOCOL_CONTENT.name,
        category: DEMO_PROTOCOL_CONTENT.category,
        color: DEMO_PROTOCOL_CONTENT.color,
        description: DEMO_PROTOCOL_CONTENT.description,
        version: DEMO_PROTOCOL_CONTENT.version,
        materials: DEMO_PROTOCOL_CONTENT.materials,
        stepGroups: DEMO_PROTOCOL_CONTENT.stepGroups,
        params: DEMO_PROTOCOL_CONTENT.params,
        tags: DEMO_PROTOCOL_CONTENT.tags,
        isDemo: true,
      })
      .$returningId();
    const snapshot: ProtocolSnapshot = {
      name: DEMO_PROTOCOL_CONTENT.name,
      category: DEMO_PROTOCOL_CONTENT.category,
      color: DEMO_PROTOCOL_CONTENT.color,
      description: DEMO_PROTOCOL_CONTENT.description,
      version: DEMO_PROTOCOL_CONTENT.version,
      materials: DEMO_PROTOCOL_CONTENT.materials,
      stepGroups: DEMO_PROTOCOL_CONTENT.stepGroups,
      params: DEMO_PROTOCOL_CONTENT.params,
      tags: DEMO_PROTOCOL_CONTENT.tags,
    };
    await db.insert(protocolVersions).values({
      protocolId,
      userId: uid,
      version: DEMO_PROTOCOL_CONTENT.version,
      note: "初始版本",
      snapshot,
    });

    // 3 条湿实验记录（不同日期，挂在示例项目下，打「示例」tag）
    const demoRecords = [
      {
        recordDate: dateStr(6),
        title: "293T 细胞复苏与首次传代",
        purpose:
          "复苏冻存的 293T 细胞（P12），确认复苏活率并完成首次传代，为后续转染实验准备状态良好的细胞。",
        resultMd:
          "## 操作记录\n\n- 37°C 水浴快速复苏冻存管，1000 rpm 离心 3 min 去除 DMSO\n- 重悬后接种 T25，按 SOP 完成 1:5 传代\n- 台盼蓝计数：活率约 92%\n\n## 镜下观察\n\n复苏 24 h 后贴壁良好，形态为典型上皮样，汇合度约 60%。",
        conclusion: "复苏成功，细胞状态正常，48 h 后可达 80% 汇合度。",
        nextStep: "汇合度到 80% 后进行 PEI 转染预实验。",
        status: "done" as const,
        protocolId: protocolId as number | null,
        protocolVersion: "v1.0" as string | null,
      },
      {
        recordDate: dateStr(3),
        title: "PEI 转染效率梯度优化",
        purpose:
          "比较 PEI:DNA 1:1、2:1、4:1 三个比例对 293T 细胞转染效率的影响，确定后续实验的最佳配比。",
        resultMd:
          "## 结果（24 h GFP 荧光观察）\n\n| PEI:DNA | 荧光阳性率（估） | 细胞状态 |\n| --- | --- | --- |\n| 1:1 | ~30% | 良好 |\n| 2:1 | ~55% | 良好 |\n| 4:1 | ~60% | 轻微毒性 |\n\n2:1 组效率与毒性平衡最好。",
        conclusion: "PEI:DNA = 2:1 为最优比例，兼顾效率与细胞活性。",
        nextStep: "按 2:1 比例转染目标质粒，48 h 后收样做 Western Blot。",
        status: "done" as const,
        protocolId: null,
        protocolVersion: null,
      },
      {
        recordDate: dateStr(1),
        title: "Western Blot 检测目标蛋白表达",
        purpose: "验证转染后目标蛋白是否过表达，内参 GAPDH。",
        resultMd:
          "## 结果\n\n- 转染组目标条带（约 55 kDa）明显强于对照组\n- 灰度归一化：目标蛋白/GAPDH ≈ 3.2 倍上调\n- 转膜均匀，无杂带\n\n条带照片已上传至附件。",
        conclusion: "目标蛋白过表达成功，表达量约为对照组 3 倍。",
        nextStep: "扩大培养规模，准备后续功能实验；重复一次 WB 确认稳定性。",
        status: "ongoing" as const,
        protocolId: null,
        protocolVersion: null,
      },
    ];
    for (const r of demoRecords) {
      await db.insert(records).values({
        userId: uid,
        projectId,
        protocolId: r.protocolId,
        protocolVersion: r.protocolVersion,
        title: r.title,
        recordDate: r.recordDate,
        purpose: r.purpose,
        deviations: [],
        resultMd: r.resultMd,
        conclusion: r.conclusion,
        nextStep: r.nextStep,
        status: r.status,
        tags: ["示例"],
        isDemo: true,
      });
    }
    return { created: true, projectId, protocolId };
  }),

  /** 清除示例数据（仅 is_demo = 1 的行，含级联，绝不动普通数据） */
  clear: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;

    // 示例记录 → 级联 images / attachments / versions
    const demoRecords = await db
      .select({ id: records.id })
      .from(records)
      .where(and(eq(records.userId, uid), eq(records.isDemo, true)));
    const recordIds = demoRecords.map((r) => r.id);
    if (recordIds.length > 0) {
      await db
        .delete(recordImages)
        .where(and(eq(recordImages.userId, uid), inArray(recordImages.recordId, recordIds)));
      await db
        .delete(recordAttachments)
        .where(
          and(eq(recordAttachments.userId, uid), inArray(recordAttachments.recordId, recordIds)),
        );
      await db
        .delete(recordVersions)
        .where(and(eq(recordVersions.userId, uid), inArray(recordVersions.recordId, recordIds)));
      await db.delete(records).where(and(eq(records.userId, uid), eq(records.isDemo, true)));
    }

    // 示例协议 → 级联 protocolVersions
    const demoProtocols = await db
      .select({ id: protocols.id })
      .from(protocols)
      .where(and(eq(protocols.userId, uid), eq(protocols.isDemo, true)));
    const protocolIds = demoProtocols.map((p) => p.id);
    if (protocolIds.length > 0) {
      await db
        .delete(protocolVersions)
        .where(
          and(eq(protocolVersions.userId, uid), inArray(protocolVersions.protocolId, protocolIds)),
        );
      await db.delete(protocols).where(and(eq(protocols.userId, uid), eq(protocols.isDemo, true)));
    }

    // 示例项目
    await db.delete(projects).where(and(eq(projects.userId, uid), eq(projects.isDemo, true)));

    return { ok: true, removed: { records: recordIds.length, protocols: protocolIds.length } };
  }),
});
