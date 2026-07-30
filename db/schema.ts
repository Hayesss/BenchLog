import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  longtext,
  timestamp,
  bigint,
  boolean,
  int,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ------------------------------------------------------------------ */
/* BenchLog — 生物实验笔记本业务表                                       */
/* ------------------------------------------------------------------ */

/** 项目分组（如「丝氨酸氨酰tRNA合成酶敲除」） */
export const projects = mysqlTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#3E7C6B"),
    description: text("description"),
    archived: boolean("archived").notNull().default(false), // 归档：退出侧边栏分组，项目管理页底部折叠区展示
    isDemo: boolean("is_demo").notNull().default(false), // 示例数据标记（一键清除用）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);
export type Project = typeof projects.$inferSelect;

/** 标签（#293T #慢病毒 #失败重复） */
export const tags = mysqlTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#5B7C99"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("tags_user_idx").on(t.userId)],
);
export type Tag = typeof tags.$inferSelect;

export type ProtocolMaterial = { name: string; catalog?: string; amount?: string };
export type ProtocolStep = { text: string; duration?: string };
export type ProtocolStepGroup = { title: string; steps: ProtocolStep[] };
export type ProtocolParam = { name: string; value: string; unit?: string; note?: string };

/** 实验方法 Protocol（当前内容 = 最新版本） */
export const protocols = mysqlTable(
  "protocols",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull().default("其他"),
    color: varchar("color", { length: 16 }).notNull().default("#3E7C6B"),
    description: text("description"),
    version: varchar("version", { length: 32 }).notNull().default("v1.0"),
    materials: json("materials").$type<ProtocolMaterial[]>().notNull(),
    stepGroups: json("stepGroups").$type<ProtocolStepGroup[]>().notNull(),
    params: json("params").$type<ProtocolParam[]>().notNull(),
    tags: json("tags").$type<string[]>().notNull(),
    useCount: int("useCount").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false), // 星标置顶：工作台「常用方法」手动钉选
    pinnedAt: timestamp("pinnedAt"), // 置顶时间（置顶项按此倒序）
    isDemo: boolean("is_demo").notNull().default(false), // 示例数据标记
    deletedAt: timestamp("deleted_at"), // 软删除时间（null = 未删除，回收站可恢复）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("protocols_user_idx").on(t.userId)],
);
export type Protocol = typeof protocols.$inferSelect;

export type ProtocolSnapshot = {
  name: string;
  category: string;
  color: string;
  description: string | null;
  version: string;
  materials: ProtocolMaterial[];
  stepGroups: ProtocolStepGroup[];
  params: ProtocolParam[];
  tags: string[];
};

/** 协议版本快照（迭代留旧版） */
export const protocolVersions = mysqlTable(
  "protocol_versions",
  {
    id: serial("id").primaryKey(),
    protocolId: bigint("protocolId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    note: text("note"),
    snapshot: json("snapshot").$type<ProtocolSnapshot>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("protocol_versions_protocol_idx").on(t.protocolId)],
);
export type ProtocolVersion = typeof protocolVersions.$inferSelect;

export type Deviation = {
  param: string;
  defaultValue: string;
  actualValue: string;
  reason?: string;
};

/** 实验记录（必须可关联 Protocol + 版本） */
export const records = mysqlTable(
  "records",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }),
    protocolId: bigint("protocolId", { mode: "number", unsigned: true }),
    protocolVersion: varchar("protocolVersion", { length: 32 }),
    title: varchar("title", { length: 255 }).notNull(),
    recordDate: varchar("recordDate", { length: 10 }).notNull(), // YYYY-MM-DD
    purpose: text("purpose"),
    deviations: json("deviations").$type<Deviation[]>().notNull(),
    resultMd: text("resultMd"),
    conclusion: text("conclusion"),
    nextStep: text("nextStep"),
    status: mysqlEnum("status", ["ongoing", "done", "failed"])
      .notNull()
      .default("ongoing"),
    tags: json("tags").$type<string[]>().notNull(),
    isDemo: boolean("is_demo").notNull().default(false), // 示例数据标记
    deletedAt: timestamp("deleted_at"), // 软删除时间（null = 未删除，回收站可恢复）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("records_user_idx").on(t.userId),
    index("records_project_idx").on(t.projectId),
    index("records_protocol_idx").on(t.protocolId),
  ],
);
export type LabRecord = typeof records.$inferSelect;

/** 结果图片（WB 条带 / 流式图 / 显微镜照片，base64 存库保证跨版本持久） */
export const recordImages = mysqlTable(
  "record_images",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    recordId: bigint("recordId", { mode: "number", unsigned: true }).notNull(),
    caption: varchar("caption", { length: 255 }),
    kind: varchar("kind", { length: 32 }).notNull().default("其他"),
    mime: varchar("mime", { length: 64 }).notNull(),
    data: longtext("data").notNull(), // data:<mime>;base64,....
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("record_images_record_idx").on(t.recordId)],
);
export type RecordImage = typeof recordImages.$inferSelect;

/** 记录附件（Excel / PDF / fcs 等原始数据文件，base64 存库，单文件 ≤2MB） */
export const recordAttachments = mysqlTable(
  "record_attachments",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    recordId: bigint("recordId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 64 }).notNull(),
    size: int("size").notNull(), // 字节
    data: longtext("data").notNull(), // base64 本体（不带 data: 前缀）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("recordAttachments_record_idx").on(t.recordId)],
);
export type RecordAttachment = typeof recordAttachments.$inferSelect;

/** 记录快照（每次保存/恢复前留「上一版」的核心字段） */
export type RecordSnapshot = {
  title: string;
  recordDate: string;
  projectId: number | null;
  protocolId: number | null;
  protocolVersion: string | null;
  purpose: string | null;
  deviations: Deviation[];
  resultMd: string | null;
  conclusion: string | null;
  nextStep: string | null;
  status: "ongoing" | "done" | "failed";
  tags: string[];
};

/** 记录修改历史（覆盖保存前的旧版快照，新→旧查阅，可恢复） */
export const recordVersions = mysqlTable(
  "record_versions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    recordId: bigint("recordId", { mode: "number", unsigned: true }).notNull(),
    snapshot: json("snapshot").$type<RecordSnapshot>().notNull(),
    savedAt: timestamp("savedAt").defaultNow().notNull(),
  },
  (t) => [index("recordVersions_record_idx").on(t.recordId)],
);
export type RecordVersion = typeof recordVersions.$inferSelect;

export type FlowNode = { date: string; name: string }; // date: YYYY-MM-DD

/** 跨天实验流程（铺板 → 转染 → 收样） */
export const flows = mysqlTable(
  "flows",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }),
    protocolId: bigint("protocolId", { mode: "number", unsigned: true }),
    name: varchar("name", { length: 255 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#3E7C6B"),
    nodes: json("nodes").$type<FlowNode[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("flows_user_idx").on(t.userId)],
);
export type Flow = typeof flows.$inferSelect;

/** 单点待办 / checklist */
export const todos = mysqlTable(
  "todos",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    todoDate: varchar("todoDate", { length: 10 }).notNull(), // YYYY-MM-DD
    text: varchar("text", { length: 500 }).notNull(),
    done: boolean("done").notNull().default(false),
    recordId: bigint("recordId", { mode: "number", unsigned: true }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("todos_user_date_idx").on(t.userId, t.todoDate)],
);
export type Todo = typeof todos.$inferSelect;

/** 汇报导出历史 */
export const exportLogs = mysqlTable(
  "export_logs",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    format: varchar("format", { length: 16 }).notNull(), // markdown | table | pdf
    scope: json("scope").$type<Record<string, unknown>>().notNull(),
    content: longtext("content"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("export_logs_user_idx").on(t.userId)],
);
export type ExportLog = typeof exportLogs.$inferSelect;

/* ------------------------------------------------------------------ */
/* 实验方法库（全局共享数据，无 userId，由种子脚本维护）                    */
/* ------------------------------------------------------------------ */

/** 方法库章节（12 章） */
/** 生信分析记录（dry-lab）：代码本体存 Git 仓库，此处登记可复现性锚点 */
export const bioinfoAnalyses = mysqlTable(
  "bioinfo_analyses",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }),
    name: varchar("name", { length: 255 }).notNull(),
    analysisDate: varchar("analysisDate", { length: 10 }).notNull(), // YYYY-MM-DD
    pipeline: varchar("pipeline", { length: 64 }).notNull().default("手动脚本"), // Nextflow/Snakemake/WDL/手动脚本/R/Python/Galaxy/其他
    inputData: text("inputData"), // 输入数据：数据集、SRA/GEO 编号、路径、校验
    dataPath: varchar("dataPath", { length: 500 }), // 原始数据存储路径（服务器/NAS/对象存储）
    resultPath: varchar("resultPath", { length: 500 }), // 分析结果存储路径
    repoUrl: varchar("repoUrl", { length: 500 }), // 代码仓库链接（GitHub/GitLab/Gitee）
    commitHash: varchar("commitHash", { length: 64 }), // commit 锚定（可复现性关键）
    environment: text("environment"), // 环境锁定：conda env/docker/软件版本
    command: text("command"), // 运行命令与关键参数
    status: mysqlEnum("status", ["running", "done", "failed"]).notNull().default("running"),
    resultMd: text("resultMd"), // 结果摘要（Markdown）
    conclusion: text("conclusion"),
    nextStep: text("nextStep"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("bioinfo_user_idx").on(t.userId), index("bioinfo_project_idx").on(t.projectId)],
);
export type BioinfoAnalysis = typeof bioinfoAnalyses.$inferSelect;

/* ------------------------------------------------------------------ */
/* 站内 Git 对象库（content-addressed，SHA-1 计算与 git 完全兼容，      */
/* 对象存 MySQL 而非本地磁盘，随数据库持久化；可导出为真实 .git 仓库）  */
/* ------------------------------------------------------------------ */

/** Git tree 展平条目：path 为仓库内全路径（如 src/utils.R），sha 指向 blob */
export type GitTreeEntry = { path: string; sha: string; size: number };

/** Git blob 对象：sha = sha1("blob {size}\\0{content}")，与 git hash-object 一致 */
export const gitBlobs = mysqlTable("git_blobs", {
  sha: varchar("sha", { length: 40 }).primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  content: longtext("content").notNull(), // UTF-8 文本（代码文件）
  size: int("size").notNull(), // 字节数（UTF-8 编码后）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GitBlob = typeof gitBlobs.$inferSelect;

/** Git tree 对象：sha 按 git tree 规则计算；entries 存展平后的完整文件清单便于读取 */
export const gitTrees = mysqlTable("git_trees", {
  sha: varchar("sha", { length: 40 }).primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  entries: json("entries").$type<GitTreeEntry[]>().notNull(), // [{path, sha, size}] 全路径展平
  fileCount: int("fileCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GitTree = typeof gitTrees.$inferSelect;

/** Git commit 对象：sha = sha1("commit {len}\\0{标准 commit 文本}")，与 git commit 一致 */
export const gitCommits = mysqlTable(
  "git_commits",
  {
    sha: varchar("sha", { length: 40 }).primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    analysisId: bigint("analysisId", { mode: "number", unsigned: true }).notNull(),
    parentSha: varchar("parentSha", { length: 40 }), // null = 根提交
    treeSha: varchar("treeSha", { length: 40 }).notNull(),
    message: text("message").notNull(),
    authorName: varchar("authorName", { length: 100 }).notNull().default("BenchLog"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("git_commits_analysis_idx").on(t.analysisId), index("git_commits_user_idx").on(t.userId)],
);
export type GitCommit = typeof gitCommits.$inferSelect;

/** 仓库引用：每个生信分析一个内置仓库，HEAD 指向最新 commit（首次 commit 时自动建立） */
export const gitRefs = mysqlTable("git_refs", {
  analysisId: bigint("analysisId", { mode: "number", unsigned: true }).primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  headSha: varchar("headSha", { length: 40 }).notNull(),
  commitCount: int("commitCount").notNull().default(1),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type GitRef = typeof gitRefs.$inferSelect;

/** 生信技能库：可复用代码片段/命令/工具用法（与分析记录互补——记录锚定"某一次"，技能沉淀"可复用"） */
export const bioinfoSkills = mysqlTable(
  "bioinfo_skills",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(), // 技能名称，如「DESeq2 差异表达标准流程」
    category: varchar("category", { length: 64 }).notNull().default("其他"), // 文件处理/比对与定量/差异与统计/可视化/单细胞/流程与环境/其他
    language: varchar("language", { length: 32 }).notNull().default("Bash"), // Bash/R/Python/Nextflow/Snakemake/其他
    summary: text("summary"), // 用途说明：什么时候用、注意点
    code: longtext("code").notNull(), // 代码片段本体
    source: varchar("source", { length: 500 }), // 出处/参考链接（可选）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("bioinfo_skills_user_idx").on(t.userId)],
);
export type BioinfoSkill = typeof bioinfoSkills.$inferSelect;

/** 用户每日活动（活跃日历：登录打点 + 协议使用计数；记录数查询端实时聚合） */
export const userActivity = mysqlTable(
  "user_activity",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD（MySQL CURDATE，与 createdAt 同时区）
    logins: int("logins").notNull().default(0), // 当日认证请求打点数（≥1 即当日活跃登录）
    protocolsUsed: int("protocolsUsed").notNull().default(0), // 当日协议使用次数
    exports: int("exports").notNull().default(0), // 当日导出次数（预留）
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("user_activity_user_date_uidx").on(t.userId, t.date)],
);
export type UserActivity = typeof userActivity.$inferSelect;

/** 临时想法与快速结果收集箱：随手记的灵感（idea）/ 初步结果（result），先收后进（转正为待办/正式记录） */
export const quickNotes = mysqlTable(
  "quick_notes",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    kind: varchar("kind", { length: 8 }).notNull(), // idea | result
    content: text("content").notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }), // 可空：先随手记，后补归属
    recordId: bigint("recordId", { mode: "number", unsigned: true }), // 可空：转正/追加到记录后回写
    status: varchar("status", { length: 12 }).notNull().default("inbox"), // inbox | done
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("quick_notes_user_status_idx").on(t.userId, t.status)],
);
export type QuickNote = typeof quickNotes.$inferSelect;

export const methodChapters = mysqlTable("method_chapters", {
  id: serial("id").primaryKey(),
  chapterNo: int("chapterNo").notNull().unique(),
  title: varchar("title", { length: 128 }).notNull(),
});
export type MethodChapter = typeof methodChapters.$inferSelect;

/** 方法库条目（full=完整方案，pointer=跨章指引） */
export const methodEntries = mysqlTable(
  "method_entries",
  {
    id: serial("id").primaryKey(),
    entryId: int("entryId").notNull().unique(), // methods.json 中的 id
    chapterNo: int("chapterNo").notNull(),
    section: varchar("section", { length: 128 }).notNull().default(""),
    nameCn: varchar("nameCn", { length: 255 }).notNull(),
    nameEn: varchar("nameEn", { length: 255 }).notNull().default(""),
    type: varchar("type", { length: 16 }).notNull().default("full"),
    source: text("source"),
    journal: varchar("journal", { length: 64 }).notNull().default(""),
    year: varchar("year", { length: 8 }).notNull().default(""),
    doi: varchar("doi", { length: 128 }).notNull().default(""),
    steps: json("steps").$type<string[]>().notNull(),
    purpose: text("purpose"),
    principle: text("principle"),
  },
  (t) => [index("method_entries_chapter_idx").on(t.chapterNo)],
);
export type MethodEntry = typeof methodEntries.$inferSelect;

/* ------------------------------------------------------------------ */
/* AI 助手（LLM 副驾）：用户自配 OpenAI 兼容 LLM，按「项目 → 多会话」组织 */
/* ------------------------------------------------------------------ */

/** AI 设置：一人一条（userId 即主键）；apiKey 服务端仅存不回传（接口只回 keyPreview 脱敏） */
export const aiSettings = mysqlTable("ai_settings", {
  userId: bigint("userId", { mode: "number", unsigned: true }).primaryKey(),
  baseUrl: varchar("baseUrl", { length: 255 })
    .notNull()
    .default("https://api.moonshot.cn/v1"), // OpenAI 兼容端点，默认 Moonshot/Kimi
  apiKey: text("apiKey"), // 可空：未配置时 chat 直接报「未配置 LLM」
  model: varchar("model", { length: 64 }).notNull().default("kimi-k2-0711-preview"),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type AiSetting = typeof aiSettings.$inferSelect;
export type InsertAiSetting = typeof aiSettings.$inferInsert;

/** AI 会话：projectId 可空（null = 未归档/副驾快聊）；title 空串待首条消息自动生成 */
export const aiConversations = mysqlTable(
  "ai_conversations",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }),
    title: varchar("title", { length: 120 }).notNull().default(""),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ai_conversations_user_project_idx").on(t.userId, t.projectId)],
);
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = typeof aiConversations.$inferInsert;

/** AI 消息：role 仅 user | assistant；删会话时级联删除 */
export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", { mode: "number", unsigned: true }).notNull(),
    role: varchar("role", { length: 12 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId)],
);
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;

/* ------------------------------------------------------------------ */
/* 项目样本管理：96 孔冻存盒（8 行 × 12 列，坐标 A1-H12），               */
/* 每项目多盒、每孔位一份样本                                            */
/* ------------------------------------------------------------------ */

/** 冻存盒：rows 行 × cols 列（默认 8×12 = 96 孔）；location 记物理位置 */
export const sampleBoxes = mysqlTable(
  "sample_boxes",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    location: varchar("location", { length: 80 }), // 如「-80℃ 冰箱 B2 层」「液氮罐 3」
    rows: int("rows").notNull().default(8), // 行数（行坐标 A 起）
    cols: int("cols").notNull().default(12), // 列数（列坐标 1 起）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("sample_boxes_user_project_idx").on(t.userId, t.projectId)],
);
export type SampleBox = typeof sampleBoxes.$inferSelect;
export type InsertSampleBox = typeof sampleBoxes.$inferInsert;

/** 样本：每盒每孔位（row/col 均 0 起）至多一份，唯一索引 (boxId, row, col) 保证 */
export const samples = mysqlTable(
  "samples",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    boxId: bigint("boxId", { mode: "number", unsigned: true }).notNull(),
    row: int("row").notNull(), // 0 起：0 → 坐标 A
    col: int("col").notNull(), // 0 起：0 → 坐标 1
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 24 }).notNull().default("其他"), // DNA/RNA/蛋白/细胞/组织/血清/质粒/引物/其他
    concentration: varchar("concentration", { length: 40 }), // 如「56 ng/µL」
    volume: varchar("volume", { length: 40 }),
    sampleDate: varchar("sampleDate", { length: 10 }), // YYYY-MM-DD 存入日期
    notes: varchar("notes", { length: 500 }),
    recordId: bigint("recordId", { mode: "number", unsigned: true }), // 关联实验记录（可空）
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("samples_box_slot_uidx").on(t.boxId, t.row, t.col),
    index("samples_user_idx").on(t.userId),
  ],
);
export type Sample = typeof samples.$inferSelect;
export type InsertSample = typeof samples.$inferInsert;

/* ------------------------------------------------------------------ */
/* 小鼠库存管理 v1 基础台账：品系 → 个体（耳号手动输入）→ 笼位，          */
/* 附品系库存看板统计与扩繁预警                                          */
/* ------------------------------------------------------------------ */

/** 小鼠品系：lowStockThreshold > 0 且存活数低于该值时触发扩繁预警（0 = 不预警） */
export const mouseStrains = mysqlTable(
  "mouse_strains",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 80 }).notNull(), // 品系名，如 C57BL/6J-Gt(ROSA)26Sor
    background: varchar("background", { length: 80 }), // 遗传背景，如 C57BL/6J
    genotypeDesc: varchar("genotypeDesc", { length: 200 }), // 基因型说明
    maintenance: varchar("maintenance", { length: 24 }), // 保种方式：自繁/冷冻保存/定期购入
    color: varchar("color", { length: 7 }).notNull().default("#3E7C6B"), // 看板展示色
    lowStockThreshold: int("lowStockThreshold").notNull().default(0), // 存活低于此值预警，0=不预警
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("mouse_strains_user_idx").on(t.userId)],
);
export type MouseStrain = typeof mouseStrains.$inferSelect;
export type InsertMouseStrain = typeof mouseStrains.$inferInsert;

/** 笼位：room/rack 记物理位置 */
export const mouseCages = mysqlTable(
  "mouse_cages",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    cageNo: varchar("cageNo", { length: 40 }).notNull(), // 笼号
    room: varchar("room", { length: 60 }), // 房间
    rack: varchar("rack", { length: 60 }), // 笼架
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("mouse_cages_user_idx").on(t.userId)],
);
export type MouseCage = typeof mouseCages.$inferSelect;
export type InsertMouseCage = typeof mouseCages.$inferInsert;

/** 小鼠个体：耳号用户手动输入，(userId, strainId, earNo) 唯一；genotype 为 null 表示未鉴定 */
export const mice = mysqlTable(
  "mice",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    strainId: bigint("strainId", { mode: "number", unsigned: true }).notNull(),
    earNo: varchar("earNo", { length: 40 }).notNull(), // 耳号/编号，手动输入
    gender: varchar("gender", { length: 8 }).notNull().default("unknown"), // male/female/unknown
    birthDate: varchar("birthDate", { length: 10 }), // YYYY-MM-DD
    genotype: varchar("genotype", { length: 40 }), // +/+、+/-、-/-、Tg+ 等；null=未鉴定
    cageId: bigint("cageId", { mode: "number", unsigned: true }), // 所在笼位，null=未分配
    source: varchar("source", { length: 24 }), // 来源：自繁/购入/赠送
    status: varchar("status", { length: 12 }).notNull().default("alive"), // alive/sacrificed/dead/culled
    statusDate: varchar("statusDate", { length: 10 }), // 状态变更日期 YYYY-MM-DD
    statusReason: varchar("statusReason", { length: 200 }), // 状态原因
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mice_strain_earno_uidx").on(t.userId, t.strainId, t.earNo),
    index("mice_user_strain_idx").on(t.userId, t.strainId),
    index("mice_user_status_idx").on(t.userId, t.status),
  ],
);
export type Mouse = typeof mice.$inferSelect;
export type InsertMouse = typeof mice.$inferInsert;

/** 配种对：一♂一♀同品系；status active/ended；litters 为已登记胎次（幼崽登记时 +1） */
export const mouseBreeding = mysqlTable(
  "mouse_breeding",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    strainId: bigint("strainId", { mode: "number", unsigned: true }).notNull(),
    maleId: bigint("maleId", { mode: "number", unsigned: true }).notNull(),
    femaleId: bigint("femaleId", { mode: "number", unsigned: true }).notNull(),
    cageId: bigint("cageId", { mode: "number", unsigned: true }), // 配种笼位
    startDate: varchar("startDate", { length: 10 }).notNull(), // YYYY-MM-DD
    status: varchar("status", { length: 12 }).notNull().default("active"), // active/ended
    endDate: varchar("endDate", { length: 10 }),
    endReason: varchar("endReason", { length: 200 }),
    litters: int("litters").notNull().default(0), // 已登记胎次
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("breeding_user_idx").on(t.userId), index("breeding_strain_idx").on(t.strainId)],
);
export type MouseBreeding = typeof mouseBreeding.$inferSelect;
export type InsertMouseBreeding = typeof mouseBreeding.$inferInsert;
