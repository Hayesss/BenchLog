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
