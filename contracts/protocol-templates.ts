import type {
  ProtocolMaterial,
  ProtocolStepGroup,
  ProtocolParam,
} from "@db/schema";

export interface ProtocolTemplate {
  name: string;
  category: string;
  color: string;
  description: string;
  version: string;
  materials: ProtocolMaterial[];
  stepGroups: ProtocolStepGroup[];
  params: ProtocolParam[];
  tags: string[];
}

/**
 * 预置协议模板 — 首次进入协议库时一键导入。
 * 内容为通用起始条件，用户应按各自实验室 SOP 调整参数后另存新版本。
 */
export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    name: "Western Blot（全细胞裂解 → 化学发光）",
    category: "蛋白",
    color: "#B08D57",
    description:
      "全细胞裂解液提取总蛋白，BCA 定量，SDS-PAGE 分离后湿转 PVDF，化学发光显影。适用于常规蛋白表达量与磷酸化水平检测。",
    version: "v1.0",
    materials: [
      { name: "RIPA 裂解液（含 PMSF + 磷酸酶抑制剂）", catalog: "碧云天 P0013B", amount: "按需" },
      { name: "BCA 蛋白定量试剂盒", catalog: "Thermo 23225", amount: "按需" },
      { name: "4-12% Bis-Tris 预制胶", catalog: "Invitrogen", amount: "1 块" },
      { name: "PVDF 膜 0.45μm", catalog: "Millipore IPVH00010", amount: "1 张" },
      { name: "5% 脱脂奶粉 / TBST", amount: "50 mL" },
      { name: "一抗（按目标蛋白）", amount: "按稀释比" },
      { name: "HRP 二抗", catalog: "CST 7074/7076", amount: "1:5000" },
      { name: "ECL 发光液", catalog: "Millipore WBKLS0500", amount: "2 mL" },
    ],
    stepGroups: [
      {
        title: "样品制备",
        steps: [
          { text: "弃培养基，预冷 PBS 洗 2 遍，加入 RIPA（6 孔板每孔 150 μL）冰上裂解", duration: "30 min" },
          { text: "刮取收集至 1.5 mL EP 管，4°C 12000 g 离心 15 min，取上清" },
          { text: "BCA 法定量蛋白浓度，各样品统一稀释至相同浓度" },
          { text: "加入 5× Loading Buffer，95°C 金属浴变性", duration: "10 min" },
        ],
      },
      {
        title: "电泳与转膜",
        steps: [
          { text: "上样 20-30 μg/孔，80V 浓缩胶 → 120V 分离胶电泳", duration: "约 90 min" },
          { text: "PVDF 膜甲醇活化 30 s，湿转 300 mA 恒流转膜（按分子量调整时间）", duration: "60-90 min" },
          { text: "丽春红染色确认转膜效率，TBST 漂洗脱色" },
        ],
      },
      {
        title: "封闭与孵育",
        steps: [
          { text: "5% 脱脂奶粉室温封闭", duration: "1 h" },
          { text: "一抗按稀释比加入，4°C 摇床孵育过夜", duration: "过夜" },
          { text: "TBST 洗膜 3 次 × 10 min" },
          { text: "HRP 二抗 1:5000 室温孵育", duration: "1 h" },
          { text: "TBST 洗膜 3 次 × 10 min" },
        ],
      },
      {
        title: "显影",
        steps: [
          { text: "ECL A+B 液等比混合，覆盖膜面孵育 1 min，化学发光仪曝光采集" },
          { text: "ImageJ 灰度分析，目标蛋白 / 内参归一化" },
        ],
      },
    ],
    params: [
      { name: "上样量", value: "20-30", unit: "μg", note: "磷酸化蛋白建议 30 μg" },
      { name: "一抗稀释比", value: "1:1000", note: "按抗体说明书调整" },
      { name: "二抗稀释比", value: "1:5000" },
      { name: "转膜电流", value: "300", unit: "mA", note: "大分子量蛋白延长时间" },
      { name: "封闭时间", value: "1", unit: "h" },
    ],
    tags: ["WB", "蛋白"],
  },
  {
    name: "慢病毒包装（293T，三质粒系统）",
    category: "细胞",
    color: "#3E7C6B",
    description:
      "293T 细胞共转染转移质粒 + psPAX2 + pMD2.G，48/72 h 收毒，0.45 μm 过滤后浓缩或直接使用。用于稳定细胞系构建与基因敲除/过表达。",
    version: "v2.3",
    materials: [
      { name: "293T 细胞（对数期，代次 < P20）", amount: "10 cm 皿 × 1" },
      { name: "转移质粒（如 pLKO.1 / lentiCRISPR v2）", amount: "10 μg" },
      { name: "psPAX2 包装质粒", catalog: "Addgene #12260", amount: "7.5 μg" },
      { name: "pMD2.G 包膜质粒", catalog: "Addgene #12259", amount: "2.5 μg" },
      { name: "PEI 转染试剂（1 mg/mL, pH 7.0）", amount: "60 μL" },
      { name: "Opti-MEM", catalog: "Gibco 31985070", amount: "2 mL" },
      { name: "0.45 μm PVDF 滤器", amount: "按需" },
    ],
    stepGroups: [
      {
        title: "Day 0 铺板",
        steps: [
          { text: "293T 消化计数，10 cm 皿铺 4×10⁶ 细胞，过夜贴壁至 70-80% 汇合", duration: "过夜" },
        ],
      },
      {
        title: "Day 1 转染",
        steps: [
          { text: "A 管：三质粒（10 : 7.5 : 2.5 μg）加入 1 mL Opti-MEM 混匀" },
          { text: "B 管：PEI 60 μL 加入 1 mL Opti-MEM 混匀，静置 5 min" },
          { text: "B 管加入 A 管，涡旋混匀，室温孵育 20 min", duration: "20 min" },
          { text: "复合物逐滴均匀加入培养皿，十字法轻摇混匀" },
          { text: "6-8 h 后更换新鲜完全培养基（可选）", duration: "6-8 h" },
        ],
      },
      {
        title: "Day 3-4 收毒",
        steps: [
          { text: "转染后 48 h 收集上清至 15 mL 管，4°C 暂存；补加新鲜培养基", duration: "48 h" },
          { text: "72 h 再次收集上清，合并两次病毒液", duration: "72 h" },
          { text: "2000 rpm 离心 10 min 去除细胞碎片，0.45 μm 滤器过滤" },
          { text: "分装（建议 1 mL/管），-80°C 保存，避免反复冻融" },
        ],
      },
    ],
    params: [
      { name: "铺板密度", value: "4×10⁶", unit: "cells/10cm 皿", note: "转染时 70-80% 汇合" },
      { name: "质粒比例(转移:psPAX2:pMD2.G)", value: "4:3:1", note: "总 20 μg/10cm 皿" },
      { name: "PEI:DNA", value: "3:1", note: "质量比，本室优化条件见版本历史" },
      { name: "收毒时间点", value: "48h + 72h", note: "两次收毒合并" },
    ],
    tags: ["慢病毒", "293T", "转染"],
  },
  {
    name: "PEI 转染优化（293T/贴壁细胞）",
    category: "细胞",
    color: "#B0707C",
    description:
      "PEI 介导的贴壁细胞瞬时转染通用流程，含 DNA:PEI 比例梯度优化矩阵。用于转染条件摸索与荧光素酶/GFP 报告体系。",
    version: "v1.4",
    materials: [
      { name: "PEI MAX (1 mg/mL, pH 7.0)", catalog: "Polysciences 24765", amount: "按需" },
      { name: "Opti-MEM 减血清培养基", catalog: "Gibco 31985070", amount: "按需" },
      { name: "目标质粒（去内毒素）", amount: "按需" },
      { name: "完全培养基（DMEM + 10% FBS）", amount: "按需" },
    ],
    stepGroups: [
      {
        title: "铺板",
        steps: [
          { text: "24 孔板铺 1.5×10⁵ cells/孔（12 孔 3×10⁵，6 孔 6×10⁵），过夜至 70-80% 汇合", duration: "过夜" },
        ],
      },
      {
        title: "转染复合物制备",
        steps: [
          { text: "DNA 加入 Opti-MEM（24 孔：0.5 μg DNA + 25 μL Opti-MEM）" },
          { text: "PEI 按梯度比例（1:1 / 2:1 / 3:1 / 4:1，PEI:DNA 质量比）加入另一管 Opti-MEM" },
          { text: "PEI 管加入 DNA 管，立即涡旋 10 s，室温孵育 15-20 min", duration: "15-20 min" },
        ],
      },
      {
        title: "转染与检测",
        steps: [
          { text: "复合物逐滴加入孔内，轻摇混匀" },
          { text: "6-8 h 换液（PEI 细胞毒性控制，可选）", duration: "6-8 h" },
          { text: "24-48 h 检测：荧光显微镜 / 流式 / 荧光素酶报告", duration: "24-48 h" },
        ],
      },
    ],
    params: [
      { name: "PEI:DNA 梯度", value: "1:1, 2:1, 3:1, 4:1", note: "质量比，每条件 ≥ 3 复孔" },
      { name: "DNA 用量(24孔)", value: "0.5", unit: "μg/孔" },
      { name: "复合物孵育时间", value: "15-20", unit: "min", note: "勿超过 30 min" },
      { name: "转染时汇合度", value: "70-80", unit: "%" },
    ],
    tags: ["转染", "PEI", "优化"],
  },
  {
    name: "流式分选（FACS，表面染色）",
    category: "流式",
    color: "#5B7C99",
    description:
      "单细胞悬液制备 → 表面抗体染色 → 上机分选目标群体。适用于报告基因阳性细胞或表面标志物分选，分选后可直接培养或提 RNA/蛋白。",
    version: "v1.1",
    materials: [
      { name: "FACS Buffer（PBS + 2% FBS + 1 mM EDTA）", amount: "按需" },
      { name: "荧光标记表面抗体（按 panel）", amount: "按滴度" },
      { name: "Dnase I（可选，防结团）", amount: "10 μg/mL" },
      { name: "40 μm 细胞滤网", amount: "按需" },
      { name: "收集管（含 500 μL 完全培养基 + 双抗）", amount: "按需" },
    ],
    stepGroups: [
      {
        title: "样品制备",
        steps: [
          { text: "消化收集细胞，PBS 洗 1 遍，计数" },
          { text: "FACS Buffer 重悬至 1×10⁷ cells/mL，100 μL/管分装" },
        ],
      },
      {
        title: "染色",
        steps: [
          { text: "加入荧光抗体（按预实验滴度），4°C 避光染色", duration: "30 min" },
          { text: "FACS Buffer 洗 2 遍，300 g 离心 5 min" },
          { text: "500 μL FACS Buffer 重悬，40 μm 滤网过滤至流式管" },
          { text: "活死染料（DAPI/7-AAD）上机前加入" },
        ],
      },
      {
        title: "上机分选",
        steps: [
          { text: "未染色 + 单染管调补偿，FMO 对照设门" },
          { text: "FSC/SSC 圈主群 → 单细胞门 → 活细胞门 → 目标群体" },
          { text: "4°C 分选模式，收集至预冷收集管" },
          { text: "分选后回测纯度（>95% 合格），计数后下游培养或裂解" },
        ],
      },
    ],
    params: [
      { name: "染色浓度", value: "1×10⁷", unit: "cells/mL" },
      { name: "染色时间", value: "30", unit: "min", note: "4°C 避光" },
      { name: "分选纯度要求", value: ">95", unit: "%" },
    ],
    tags: ["流式", "分选", "FACS"],
  },
  {
    name: "单细胞悬液制备（10x 多组学前处理）",
    category: "组学",
    color: "#8A7CA8",
    description:
      "组织/培养细胞制备高质量单细胞悬液，质控标准对齐 10x Genomics 上机要求（活率 ≥ 80%，结团率 < 5%）。适用于 scRNA-seq / scATAC-seq / 多组学前处理。",
    version: "v1.0",
    materials: [
      { name: "消化酶（TrypLE / 胶原酶，按组织类型）", amount: "按需" },
      { name: "HBSS（无 Ca²⁺/Mg²⁺）+ 0.04% BSA", amount: "按需" },
      { name: "40 μm 细胞滤网", amount: "按需" },
      { name: "红细胞裂解液（组织样品可选）", amount: "按需" },
      { name: "台盼蓝 / Countess 计数板", amount: "按需" },
    ],
    stepGroups: [
      {
        title: "消化解离",
        steps: [
          { text: "组织剪碎至 1-2 mm³，加入消化酶 37°C 消化（时间按组织类型优化）", duration: "15-45 min" },
          { text: "每 10 min 吹打一次，镜检观察解离程度" },
          { text: "完全培养基终止消化，40 μm 滤网过滤" },
        ],
      },
      {
        title: "清洗与质控",
        steps: [
          { text: "300 g 4°C 离心 5 min，HBSS + 0.04% BSA 重悬洗 2 遍" },
          { text: "（组织）红细胞裂解 5 min，终止后洗涤", duration: "5 min" },
          { text: "台盼蓝计数：活率 ≥ 80%，浓度调至 700-1200 cells/μL" },
          { text: "镜检结团率 < 5%，碎片过多时用 30 μm 滤网二次过滤或死细胞去除" },
        ],
      },
      {
        title: "上机前",
        steps: [
          { text: "冰浴保存，30 min 内上机；记录实际浓度用于上样量计算" },
        ],
      },
    ],
    params: [
      { name: "目标浓度", value: "700-1200", unit: "cells/μL" },
      { name: "活率要求", value: "≥80", unit: "%" },
      { name: "离心条件", value: "300g 5min 4°C", note: "脆弱细胞降速" },
    ],
    tags: ["单细胞", "10x", "多组学"],
  },
  {
    name: "细胞传代与冻存（293T 日常维护）",
    category: "细胞",
    color: "#7C9161",
    description:
      "293T 细胞常规传代、汇合度管理与程序降温冻存。含支原体预防与细胞状态记录要点。",
    version: "v1.0",
    materials: [
      { name: "DMEM + 10% FBS + 双抗（可选）", amount: "按需" },
      { name: "0.25% Trypsin-EDTA / TrypLE", amount: "按需" },
      { name: "冻存液（90% FBS + 10% DMSO，现配）", amount: "1 mL/管" },
      { name: "程序降温盒 + 冻存管", amount: "按需" },
    ],
    stepGroups: [
      {
        title: "传代",
        steps: [
          { text: "细胞 80-90% 汇合时传代（勿长满，293T 汇合过度影响转染效率）" },
          { text: "PBS 洗 1 遍，胰酶消化（293T 约 1-2 min，轻拍皿壁助脱落）", duration: "1-2 min" },
          { text: "完全培养基终止，吹打成单细胞悬液" },
          { text: "按 1:4 - 1:6 比例传代，记录代次（转染用 < P20）" },
        ],
      },
      {
        title: "冻存",
        steps: [
          { text: "对数期细胞消化计数，1000 rpm 离心 5 min" },
          { text: "冻存液重悬至 2-5×10⁶ cells/mL，1 mL/管分装" },
          { text: "程序降温盒 -80°C 过夜，次日转液氮长期保存", duration: "过夜" },
          { text: "记录：细胞系、代次、冻存日期、密度、操作人、位置（盒/排/孔）" },
        ],
      },
    ],
    params: [
      { name: "传代比例", value: "1:4 - 1:6", note: "约 2-3 天一代" },
      { name: "冻存密度", value: "2-5×10⁶", unit: "cells/mL" },
      { name: "转染可用代次", value: "< P20", note: "高代次效率下降" },
    ],
    tags: ["细胞培养", "293T", "日常"],
  },
];
