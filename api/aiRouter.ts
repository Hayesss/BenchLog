import { z } from "zod";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { resolveLlmConfig } from "./aiProfileRouter";
import {
  aiConversations,
  aiMessages,
  aiSettings,
  bioinfoAnalyses,
  mice,
  mouseStrains,
  projects,
  protocols,
  quickNotes,
  records,
  todos,
} from "@db/schema";

// AI 助手（LLM 副驾）：用户自配 OpenAI 兼容 LLM（默认 Moonshot/Kimi），
// 按「项目 → 多会话」组织对话；chat 时将用户实验数据快照作为 system prompt 发给 LLM。
// 安全约定：apiKey 仅存服务端，任何接口都不回传完整 key（只回 keyPreview 脱敏）。

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k3";

/**
 * 写操作工具（function calling）：服务端只转发定义，绝不自动执行；
 * LLM 返回 tool_calls 后由前端弹确认卡，用户确认才调对应接口落库。
 */
export const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_todo",
      description: "创建一条实验待办/提醒（当用户明确要求添加待办、提醒、任务时使用）",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "待办内容，简洁具体" },
          todoDate: { type: "string", description: "YYYY-MM-DD，缺省为今天" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_quick_note",
      description: "把临时想法或快速结果存入收集箱（inbox，稍后由用户转正）",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["idea", "result"], description: "idea=想法，result=快速结果" },
          content: { type: "string", description: "内容" },
        },
        required: ["kind", "content"],
      },
    },
  },
];
/** system prompt 总长上限：先截断单字段，超限再截条数 */
const CONTEXT_MAX_CHARS = 12000;
/** 单条会话带入 LLM 的历史消息上限 */
const HISTORY_LIMIT = 20;

/** 会话归属校验：返回当前用户本人的会话，否则 NOT_FOUND */
async function getOwnedConversation(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
  const conv = rows[0];
  if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "会话不存在" });
  return conv;
}

/** 截断辅助：null/undefined 归一为 null，字符串按 max 截断 */
function clip(value: string | null, max: number): string | null {
  if (value == null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * 构建实验数据快照（system prompt 的一部分）。
 * 目标总长 ≤ CONTEXT_MAX_CHARS：单字段在采集时已截断，超限后按比例缩减各数组条数。
 */
export async function buildContext(
  userId: number,
  projectId: number | null,
  refRecordIds?: number[],
): Promise<string> {
  const db = getDb();

  // 项目清单（全部）+ 各项目记录数（循环 count，项目数量有限可接受）
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.userId, userId));
  const projectList: { name: string; recordCount: number }[] = [];
  for (const p of projectRows) {
    const [c] = await db
      .select({ n: count() })
      .from(records)
      .where(and(eq(records.projectId, p.id), isNull(records.deletedAt)));
    projectList.push({ name: p.name, recordCount: c?.n ?? 0 });
  }

  // 实验记录：指定项目取该项目全部，否则取最近 15 条；均排除软删除
  const recordConds = [eq(records.userId, userId), isNull(records.deletedAt)];
  if (projectId != null) recordConds.push(eq(records.projectId, projectId));
  let recordQuery = db
    .select({
      title: records.title,
      recordDate: records.recordDate,
      status: records.status,
      purpose: records.purpose,
      conclusion: records.conclusion,
    })
    .from(records)
    .where(and(...recordConds))
    .orderBy(desc(records.createdAt));
  const recordRows =
    projectId == null ? await recordQuery.limit(15) : await recordQuery;
  const recordList = recordRows.map((r) => ({
    title: r.title,
    recordDate: r.recordDate,
    status: r.status,
    purpose: clip(r.purpose, 200),
    conclusion: clip(r.conclusion, 200),
  }));

  // 生信分析：仅指定项目时带入（name/analysisDate/命令参数截 150，存储路径截 120）
  let bioinfoList: {
    name: string;
    analysisDate: string;
    command: string | null;
    dataPath: string | null;
    resultPath: string | null;
  }[] = [];
  if (projectId != null) {
    const rows = await db
      .select({
        name: bioinfoAnalyses.name,
        analysisDate: bioinfoAnalyses.analysisDate,
        command: bioinfoAnalyses.command,
        dataPath: bioinfoAnalyses.dataPath,
        resultPath: bioinfoAnalyses.resultPath,
      })
      .from(bioinfoAnalyses)
      .where(and(eq(bioinfoAnalyses.userId, userId), eq(bioinfoAnalyses.projectId, projectId)))
      .orderBy(desc(bioinfoAnalyses.createdAt));
    bioinfoList = rows.map((r) => ({
      name: r.name,
      analysisDate: r.analysisDate,
      command: clip(r.command, 150),
      dataPath: clip(r.dataPath, 120),
      resultPath: clip(r.resultPath, 120),
    }));
  }

  // 协议方法：全部（name/category/version），排除软删除
  const protocolRows = await db
    .select({ name: protocols.name, category: protocols.category, version: protocols.version })
    .from(protocols)
    .where(and(eq(protocols.userId, userId), isNull(protocols.deletedAt)));

  // 收集箱：inbox 全部（kind/content 截 150）
  const noteRows = await db
    .select({ kind: quickNotes.kind, content: quickNotes.content })
    .from(quickNotes)
    .where(and(eq(quickNotes.userId, userId), eq(quickNotes.status, "inbox")));
  const noteList = noteRows.map((n) => ({ kind: n.kind, content: clip(n.content, 150) }));

  // 待办：未完成全部（todoDate/text）
  const todoRows = await db
    .select({ todoDate: todos.todoDate, text: todos.text })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.done, false)));

  // 小鼠库存：品系级汇总（品系名/存活/公/母/未鉴定），轻量注入便于讨论动物实验安排
  const strainRows = await db
    .select({ id: mouseStrains.id, name: mouseStrains.name })
    .from(mouseStrains)
    .where(eq(mouseStrains.userId, userId));
  const aliveMouseRows = strainRows.length
    ? await db
        .select({ strainId: mice.strainId, gender: mice.gender, genotype: mice.genotype })
        .from(mice)
        .where(and(eq(mice.userId, userId), eq(mice.status, "alive")))
    : [];
  const mouseSummary = strainRows.map((s) => {
    const mine = aliveMouseRows.filter((m) => m.strainId === s.id);
    return {
      strain: s.name,
      alive: mine.length,
      male: mine.filter((m) => m.gender === "male").length,
      female: mine.filter((m) => m.gender === "female").length,
      ungenotyped: mine.filter((m) => !m.genotype).length,
    };
  });

  // @ 引用的记录全文（最多 3 条，各字段截 800；不计入缩减，优先保留）
  let referencedRecords: Record<string, unknown>[] = [];
  if (refRecordIds && refRecordIds.length > 0) {
    const refRows = await db
      .select({
        id: records.id,
        title: records.title,
        recordDate: records.recordDate,
        purpose: records.purpose,
        resultMd: records.resultMd,
        conclusion: records.conclusion,
        nextStep: records.nextStep,
      })
      .from(records)
      .where(
        and(
          eq(records.userId, userId),
          isNull(records.deletedAt),
          inArray(records.id, refRecordIds.slice(0, 3)),
        ),
      );
    referencedRecords = refRows.map((r) => ({
      id: r.id,
      title: r.title,
      recordDate: r.recordDate,
      purpose: clip(r.purpose, 800),
      resultMd: clip(r.resultMd, 800),
      conclusion: clip(r.conclusion, 300),
      nextStep: clip(r.nextStep, 300),
    }));
  }

  const snapshot: Record<string, unknown> = {
    projects: projectList,
    records: recordList,
    bioinfoAnalyses: bioinfoList,
    protocols: protocolRows,
    quickNotesInbox: noteList,
    todosPending: todoRows,
    mouseStrains: mouseSummary,
  };
  if (referencedRecords.length > 0) snapshot.referencedRecords = referencedRecords;

  // 总长控制：单字段已截断，仍超限则按比例缩减各数组条数（保留头部较新数据）
  let json = JSON.stringify(snapshot);
  const arrayKeys = Object.keys(snapshot).filter((k) => Array.isArray(snapshot[k]));
  for (const ratio of [0.5, 0.25, 0.1, 0]) {
    if (json.length <= CONTEXT_MAX_CHARS) break;
    for (const key of arrayKeys) {
      const arr = snapshot[key] as unknown[];
      snapshot[key] = arr.slice(0, Math.floor(arr.length * ratio));
    }
    json = JSON.stringify(snapshot);
  }

  const role =
    "你是 BenchLog 实验室记录系统的 AI 副驾，精通湿实验与生信分析。" +
    "以下 JSON 是用户实验数据的实时快照，请基于它回答；不知道就明说，建议要具体可执行；用中文回答。";
  return `${role}\n${json}`;
}

export const aiRouter = createRouter({
  /** 读取 AI 设置：无记录返回默认值；apiKey 绝不回传，只回 hasKey/keyPreview 脱敏 */
  getSettings: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, ctx.user.id));
    const s = rows[0];
    if (!s) {
      return { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, hasKey: false, keyPreview: null };
    }
    return {
      baseUrl: s.baseUrl,
      model: s.model,
      hasKey: !!s.apiKey,
      keyPreview: s.apiKey ? s.apiKey.slice(0, 6) + "…" : null,
    };
  }),

  /**
   * 保存 AI 设置（upsert）。
   * apiKey 语义：传 undefined 保持不变、传 '' 清除、传值覆盖。
   */
  saveSettings: authedQuery
    .input(
      z.object({
        baseUrl: z.string().url().max(255).optional(),
        model: z.string().min(1).max(64).optional(),
        apiKey: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ userId: aiSettings.userId })
        .from(aiSettings)
        .where(eq(aiSettings.userId, ctx.user.id));
      // 粘贴常带首尾空格/换行，入库前统一 trim；trim 后为空则视为未提供（不动原值）
      const baseUrl = input.baseUrl?.trim();
      const model = input.model?.trim();
      const apiKey = input.apiKey?.trim();
      // apiKey 三态：undefined=不动；''=清除（存 null）；有值=覆盖
      const keyPatch = apiKey === undefined ? {} : { apiKey: apiKey === "" ? null : apiKey };
      const basePatch = {
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...keyPatch,
      };
      if (rows[0]) {
        await db
          .update(aiSettings)
          .set({ ...basePatch, updatedAt: new Date() })
          .where(eq(aiSettings.userId, ctx.user.id));
      } else {
        await db.insert(aiSettings).values({ userId: ctx.user.id, ...basePatch });
      }
      return { ok: true };
    }),

  /** 会话列表：当前用户全部，附 projectName（leftJoin），updatedAt 倒序 */
  listConversations: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select({
        id: aiConversations.id,
        projectId: aiConversations.projectId,
        title: aiConversations.title,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
        projectName: projects.name,
      })
      .from(aiConversations)
      .leftJoin(projects, eq(projects.id, aiConversations.projectId))
      .where(eq(aiConversations.userId, ctx.user.id))
      .orderBy(desc(aiConversations.updatedAt));
  }),

  /** 新建会话：projectId 可空（null=未归档/副驾快聊）；非空须校验项目归属；title 留空待首条消息生成 */
  createConversation: authedQuery
    .input(z.object({ projectId: z.number().nullish() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const projectId = input.projectId ?? null;
      if (projectId != null) {
        const p = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.userId, ctx.user.id)));
        if (!p[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      }
      const [{ id }] = await db
        .insert(aiConversations)
        .values({ userId: ctx.user.id, projectId, title: "" })
        .$returningId();
      const rows = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.id, id));
      return rows[0];
    }),

  /** 重命名会话 */
  renameConversation: authedQuery
    .input(z.object({ id: z.number(), title: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedConversation(ctx.user.id, input.id);
      await getDb()
        .update(aiConversations)
        .set({ title: input.title, updatedAt: new Date() })
        .where(eq(aiConversations.id, input.id));
      return { ok: true };
    }),

  /** 修改会话项目归属：null=移到副驾快聊；非空须校验项目归属本人。上下文随归属按项目注入 */
  setConversationProject: authedQuery
    .input(z.object({ id: z.number(), projectId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedConversation(ctx.user.id, input.id);
      if (input.projectId != null) {
        const p = await getDb()
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));
        if (!p[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
      }
      await getDb()
        .update(aiConversations)
        .set({ projectId: input.projectId, updatedAt: new Date() })
        .where(eq(aiConversations.id, input.id));
      return { ok: true };
    }),

  /** 删除会话：级联删除其全部消息 */
  removeConversation: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedConversation(ctx.user.id, input.id);
      const db = getDb();
      await db.delete(aiMessages).where(eq(aiMessages.conversationId, input.id));
      await db.delete(aiConversations).where(eq(aiConversations.id, input.id));
      return { ok: true };
    }),

  /** 消息列表：createdAt 升序，最多 100 条 */
  listMessages: authedQuery
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      await getOwnedConversation(ctx.user.id, input.conversationId);
      return getDb()
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, input.conversationId))
        .orderBy(asc(aiMessages.createdAt))
        .limit(100);
    }),

  /**
   * 对话：插入用户消息 → 组装数据快照 system prompt → 调 OpenAI 兼容接口 → 落库助手回复。
   * 首条消息后用内容前 20 字自动命名会话。
   */
  chat: authedQuery
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1).max(4000),
        refRecordIds: z.array(z.number()).max(3).optional(),
        withTools: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const conv = await getOwnedConversation(ctx.user.id, input.conversationId);

      // a. 必须已配置 API Key（active 模型档案优先，回退旧 ai_settings）
      const llm = await resolveLlmConfig(ctx.user.id);
      if (!llm) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "未配置 LLM，请先在 AI 设置中填写 API Key",
        });
      }

      // b. 落库用户消息
      await db.insert(aiMessages).values({
        conversationId: conv.id,
        role: "user",
        content: input.content,
      });

      // c. 数据快照 → system prompt（含 @ 引用记录全文）
      const system = await buildContext(ctx.user.id, conv.projectId, input.refRecordIds);

      // d. 最近 20 条消息（含刚插入的这条），按升序送入
      const historyDesc = await db
        .select({ role: aiMessages.role, content: aiMessages.content })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conv.id))
        .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
        .limit(HISTORY_LIMIT);
      const history = historyDesc.reverse().map((m) => ({ role: m.role, content: m.content }));

      // e. 调 OpenAI 兼容 chat/completions（60s 超时；操作模式带工具定义，模型不支持自动降级重试）
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let reply: string | null = null;
      let toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      try {
        const url = `${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`;
        const callOnce = (useTools: boolean) =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${llm.apiKey}`,
            },
            body: JSON.stringify({
              model: llm.model,
              messages: [{ role: "system", content: system }, ...history],
              // 采样参数一律不传（对齐 wisp-science build_body：body 无 temperature），
              // 由服务商使用模型默认值——K3 仅允许 temperature=1，传任何值都会 400
              max_tokens: llm.maxTokens,
              // reasoning_effort 仅当档案显式配置时才带（wisp reasoning_effort: None = 不传）
              ...(llm.reasoningEffort ? { reasoning_effort: llm.reasoningEffort } : {}),
              ...(useTools ? { tools: AI_TOOLS, tool_choice: "auto" } : {}),
            }),
            signal: controller.signal,
          });
        let resp = await callOnce(!!input.withTools);
        // 模型/网关不支持 tools 时（400/404/422）自动降级为纯文本重试一次
        if (!resp.ok && input.withTools && [400, 404, 422].includes(resp.status)) {
          resp = await callOnce(false);
        }
        if (!resp.ok) {
          const body = (await resp.text()).slice(0, 300);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `LLM 调用失败：HTTP ${resp.status} ${body}`,
          });
        }
        const data = (await resp.json()) as {
          choices?: {
            message?: {
              content?: string | null;
              tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[];
            };
          }[];
        };
        const msg = data.choices?.[0]?.message;
        reply = (msg?.content ?? "") || null;
        for (const tc of msg?.tool_calls ?? []) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function?.arguments ?? "{}") as Record<string, unknown>;
          } catch {
            // 参数 JSON 异常按空参数处理
          }
          toolCalls.push({ id: tc.id, name: tc.function?.name ?? "", args });
        }
        // 只保留白名单内的工具调用，服务端绝不自动执行
        toolCalls = toolCalls.filter((t) => AI_TOOLS.some((d) => d.function.name === t.name));
        if (!reply && toolCalls.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "LLM 调用失败：返回内容为空" });
        }
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        // 网络错误 / 超时（AbortError）统一报为 LLM 调用失败
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `LLM 调用失败：${msg}`.slice(0, 320),
        });
      } finally {
        clearTimeout(timer);
      }

      // f. 落库助手回复（纯 tool_calls 场景 content 可为空，此时不落库）；刷新会话 updatedAt；空标题自动命名
      if (reply) {
        await db.insert(aiMessages).values({
          conversationId: conv.id,
          role: "assistant",
          content: reply,
        });
      }
      await db
        .update(aiConversations)
        .set({
          updatedAt: new Date(),
          ...(conv.title === ""
            ? { title: input.content.replace(/【@[^】]+】/g, "").trim().slice(0, 20) || "新对话" }
            : {}),
        })
        .where(eq(aiConversations.id, conv.id));

      // g. 返回回复与工具调用（前端确认后才执行写操作）
      return { reply, toolCalls };
    }),
});
