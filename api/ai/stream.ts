/**
 * AI 流式聊天端点（SSE）。
 * 纯文本走这里：上游 OpenAI 兼容 stream:true，逐 token 转发 `data: {"t": "..."}` 帧，
 * 结束后落库完整回复并发送 `data: [DONE]`。写操作（function calling）不走此端点，
 * 仍走 tRPC ai.chat（withTools），由前端确认卡确认后落库。
 */
import type { Context } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { aiConversations, aiMessages } from "@db/schema";
import { authenticateRequest } from "../kimi/auth";
import { buildContext } from "../aiRouter";
import { resolveLlmConfig } from "../aiProfileRouter";

const HISTORY_LIMIT = 20;

interface StreamBody {
  conversationId: number;
  content: string;
  refRecordIds?: number[];
}

function sseFrame(data: string): string {
  return `data: ${data}\n\n`;
}

export async function aiStreamHandler(c: Context): Promise<Response> {
  // 1. 鉴权（cookie session，与 tRPC 同一套）
  let user: { id: number };
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "未登录或会话已过期" }, 401);
  }

  // 2. 解析入参
  let body: StreamBody;
  try {
    body = (await c.req.json()) as StreamBody;
  } catch {
    return c.json({ error: "请求体不是合法 JSON" }, 400);
  }
  const content = (body.content ?? "").trim();
  if (!body.conversationId || !content || content.length > 4000) {
    return c.json({ error: "参数不合法" }, 400);
  }

  const db = getDb();

  // 3. 会话归属校验
  const convRows = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.userId, user.id)));
  const conv = convRows[0];
  if (!conv) return c.json({ error: "会话不存在" }, 404);

  // 4. LLM 设置（active 模型档案优先，回退旧 ai_settings）
  const llm = await resolveLlmConfig(user.id);
  if (!llm) {
    return c.json({ error: "尚未配置 LLM，请先在设置页填写 API Key" }, 400);
  }
  const baseUrl = llm.baseUrl.replace(/\/+$/, "");

  // 5. 落库用户消息
  await db.insert(aiMessages).values({
    conversationId: conv.id,
    role: "user",
    content,
  });

  // 6. 上下文 + 历史
  const system = await buildContext(user.id, conv.projectId, body.refRecordIds);
  const historyDesc = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conv.id))
    .orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
    .limit(HISTORY_LIMIT);
  const history = historyDesc.reverse().map((m) => ({ role: m.role, content: m.content }));

  // 7. 上游流式请求
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [{ role: "system", content: system }, ...history],
        // 采样参数一律不传（对齐 wisp-science build_body），由服务商使用模型默认值——
        // K3 仅允许 temperature=1，传任何值都会 400
        max_tokens: llm.maxTokens,
        // reasoning_effort 仅当档案显式配置时才带（wisp reasoning_effort: None = 不传）
        ...(llm.reasoningEffort ? { reasoning_effort: llm.reasoningEffort } : {}),
        stream: true,
        // 对齐 wisp-science：让 OpenAI 兼容端点在流中回传 token 用量（缺省 usage 为 0）
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `LLM 请求异常：${msg}`.slice(0, 300) }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const text = await upstream.text().catch(() => "");
    return c.json({ error: `LLM 调用失败：HTTP ${upstream.status} ${text.slice(0, 200)}` }, 502);
  }

  // 8. 转发流：解析上游 SSE 行，提取 delta.content 逐帧下发；结束后落库完整回复
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstreamBody = upstream.body;
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const reader = upstreamBody.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // 按行切分，末行可能不完整，留到下一轮
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[];
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                ctrl.enqueue(encoder.encode(sseFrame(JSON.stringify({ t: delta }))));
              }
            } catch {
              // 非 JSON 行（如心跳）忽略
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctrl.enqueue(encoder.encode(sseFrame(JSON.stringify({ error: `流式中断：${msg}`.slice(0, 200) }))));
      } finally {
        clearTimeout(timer);
        reader.releaseLock();
      }

      // 9. 落库 assistant 完整回复 + 刷新会话
      if (full) {
        try {
          await db.insert(aiMessages).values({
            conversationId: conv.id,
            role: "assistant",
            content: full,
          });
        } catch (e) {
          console.error("[ai/stream] 落库助手回复失败：", e);
        }
      }
      try {
        await db
          .update(aiConversations)
          .set({
            updatedAt: new Date(),
            ...(conv.title === ""
              ? { title: content.replace(/【@[^】]+】/g, "").trim().slice(0, 20) || "新对话" }
              : {}),
          })
          .where(eq(aiConversations.id, conv.id));
      } catch (e) {
        console.error("[ai/stream] 更新会话失败：", e);
      }

      ctrl.enqueue(encoder.encode(sseFrame("[DONE]")));
      ctrl.close();
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
