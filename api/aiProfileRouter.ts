import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiModelProfiles, aiSettings } from "@db/schema";

// LLM 模型档案（参照 wisp-science 设置页的 ModelProfile 体系）：
// 每用户多套 OpenAI 兼容配置，一套 active；支持一键预设、手动排序、测试连接探测。
// 安全约定：apiKey 绝不回传，list 只回 hasApiKey/keyPreview 脱敏。

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k3";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  /** 空串 = 请求体不带 reasoning_effort（wisp 默认 None） */
  reasoningEffort: string;
}

/**
 * 解析当前生效的 LLM 配置：active 档案（含 key）优先，无档案时回退旧 ai_settings。
 * 返回 null 表示未配置（调用方报「未配置 LLM」）。
 */
export async function resolveLlmConfig(userId: number): Promise<LlmConfig | null> {
  const db = getDb();
  const active = await db
    .select()
    .from(aiModelProfiles)
    .where(and(eq(aiModelProfiles.userId, userId), eq(aiModelProfiles.active, true)))
    .limit(1);
  const p = active[0];
  if (p?.apiKey) {
    return {
      baseUrl: p.apiUrl,
      apiKey: p.apiKey,
      model: p.model,
      maxTokens: p.maxTokens,
      reasoningEffort: p.reasoningEffort,
    };
  }
  // 兼容回退：旧 ai_settings（迁移脚本正常会转档案，此处兜底）
  const legacy = await db.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
  const s = legacy[0];
  if (s?.apiKey) {
    return {
      baseUrl: s.baseUrl || DEFAULT_BASE_URL,
      apiKey: s.apiKey,
      model: s.model || DEFAULT_MODEL,
      maxTokens: 8192,
      reasoningEffort: "",
    };
  }
  return null;
}

const urlInput = z
  .string()
  .min(1, "接口地址必填")
  .max(255)
  .transform((v) => v.trim().replace(/\/+$/, ""))
  .refine((v) => /^https?:\/\//.test(v), "接口地址须以 http(s):// 开头");

const profileFields = {
  label: z.string().max(128).optional(),
  apiUrl: urlInput,
  model: z.string().min(1, "模型 ID 必填").max(128).transform((v) => v.trim()),
  apiKey: z.string().max(255).optional(),
  maxTokens: z.number().int().min(16).max(1_000_000).optional(),
  contextWindow: z.number().int().min(4096).max(10_000_000).optional(),
  reasoningEffort: z.string().max(16).optional(),
};

/** 归属校验：返回本人的档案，否则 NOT_FOUND */
async function getOwnedProfile(userId: number, id: number) {
  const rows = await getDb()
    .select()
    .from(aiModelProfiles)
    .where(and(eq(aiModelProfiles.id, id), eq(aiModelProfiles.userId, userId)));
  const p = rows[0];
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "模型档案不存在" });
  return p;
}

export const aiProfileRouter = createRouter({
  /** 档案列表：sortOrder 升序（同序按 id），apiKey 脱敏为 hasApiKey/keyPreview */
  list: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(aiModelProfiles)
      .where(eq(aiModelProfiles.userId, ctx.user.id))
      .orderBy(asc(aiModelProfiles.sortOrder), asc(aiModelProfiles.id));
    return rows.map((p) => ({
      id: p.id,
      label: p.label,
      provider: p.provider,
      apiUrl: p.apiUrl,
      model: p.model,
      hasApiKey: !!p.apiKey,
      keyPreview: p.apiKey ? p.apiKey.slice(0, 6) + "…" : null,
      maxTokens: p.maxTokens,
      contextWindow: p.contextWindow,
      reasoningEffort: p.reasoningEffort,
      active: p.active,
    }));
  }),

  /** 新建档案：首个档案自动置为 active；label 留空默认用模型 ID */
  create: authedQuery
    .input(z.object(profileFields))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select({ id: aiModelProfiles.id, sortOrder: aiModelProfiles.sortOrder })
        .from(aiModelProfiles)
        .where(eq(aiModelProfiles.userId, ctx.user.id));
      const apiKey = input.apiKey?.trim();
      const [{ id }] = await db
        .insert(aiModelProfiles)
        .values({
          userId: ctx.user.id,
          label: input.label?.trim() || input.model,
          apiUrl: input.apiUrl,
          model: input.model,
          apiKey: apiKey || null,
          maxTokens: input.maxTokens ?? 8192,
          contextWindow: input.contextWindow ?? 128000,
          reasoningEffort: input.reasoningEffort?.trim() ?? "",
          active: existing.length === 0, // 首个档案自动启用
          sortOrder: Math.max(-1, ...existing.map((e) => e.sortOrder)) + 1,
        })
        .$returningId();
      return { id, active: existing.length === 0 };
    }),

  /**
   * 更新档案。apiKey 三态：undefined=保持不变、''=清除、有值=覆盖（入库前 trim）。
   */
  update: authedQuery
    .input(z.object({ id: z.number(), ...profileFields }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedProfile(ctx.user.id, input.id);
      const apiKey = input.apiKey?.trim();
      const keyPatch = apiKey === undefined ? {} : { apiKey: apiKey === "" ? null : apiKey };
      await getDb()
        .update(aiModelProfiles)
        .set({
          label: input.label?.trim() || input.model,
          apiUrl: input.apiUrl,
          model: input.model,
          ...(input.maxTokens != null ? { maxTokens: input.maxTokens } : {}),
          ...(input.contextWindow != null ? { contextWindow: input.contextWindow } : {}),
          ...(input.reasoningEffort != null ? { reasoningEffort: input.reasoningEffort.trim() } : {}),
          ...keyPatch,
          updatedAt: new Date(),
        })
        .where(eq(aiModelProfiles.id, input.id));
      return { ok: true };
    }),

  /** 删除档案：active 中的不可删（先切换到其他档案） */
  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const p = await getOwnedProfile(ctx.user.id, input.id);
      if (p.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "当前正在使用该档案，请先切换到其他档案" });
      }
      await getDb().delete(aiModelProfiles).where(eq(aiModelProfiles.id, input.id));
      return { ok: true };
    }),

  /** 启用档案：互斥，仅目标 active=true */
  setActive: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getOwnedProfile(ctx.user.id, input.id);
      const db = getDb();
      await db
        .update(aiModelProfiles)
        .set({ active: false })
        .where(eq(aiModelProfiles.userId, ctx.user.id));
      await db
        .update(aiModelProfiles)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(aiModelProfiles.id, input.id));
      return { ok: true };
    }),

  /** 手动排序：ids 为档案 id 的目标顺序（须全部属于本人），sortOrder 按下标写入 */
  reorder: authedQuery
    .input(z.object({ ids: z.array(z.number()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const mine = await db
        .select({ id: aiModelProfiles.id })
        .from(aiModelProfiles)
        .where(eq(aiModelProfiles.userId, ctx.user.id));
      const mineSet = new Set(mine.map((m) => m.id));
      for (const id of input.ids) {
        if (!mineSet.has(id)) throw new TRPCError({ code: "FORBIDDEN", message: "只能排序自己的档案" });
      }
      for (let i = 0; i < input.ids.length; i++) {
        await db
          .update(aiModelProfiles)
          .set({ sortOrder: i })
          .where(eq(aiModelProfiles.id, input.ids[i]));
      }
      return { ok: true };
    }),

  /**
   * 测试连接（对齐 wisp-science validate_settings）：
   * 发一条最省钱的探测消息「Reply with OK.」，max_tokens 钳到 16-64，30s 超时；
   * 采样参数一律不传。apiKey 留空时用该档案已保存的 key。
   */
  test: authedQuery
    .input(
      z.object({
        id: z.number().optional(),
        apiUrl: urlInput,
        model: z.string().min(1).max(128).transform((v) => v.trim()),
        apiKey: z.string().max(255).optional(),
        maxTokens: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let apiKey = input.apiKey?.trim();
      if (!apiKey && input.id != null) {
        const p = await getOwnedProfile(ctx.user.id, input.id);
        apiKey = p.apiKey ?? undefined;
      }
      if (!apiKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请先填写 API Key 再测试连接" });
      }
      // 探测保持便宜：max_tokens 钳到 16-64（对齐 wisp：clamp(min(64), max(16)）
      const probeTokens = Math.min(Math.max(input.maxTokens ?? 64, 16), 64);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const resp = await fetch(`${input.apiUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: input.model,
            messages: [{ role: "user", content: "Reply with OK." }],
            max_tokens: probeTokens,
          }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const body = (await resp.text()).slice(0, 200);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `连接失败：HTTP ${resp.status} ${body}`.slice(0, 300),
          });
        }
        return { ok: true, message: `连接成功：${input.model}` };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `连接失败：${msg.includes("abort") ? "30 秒无响应（超时）" : msg}`.slice(0, 300),
        });
      } finally {
        clearTimeout(timer);
      }
    }),
});
