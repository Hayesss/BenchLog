import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  AtSign,
  Bot,
  ChevronRight,
  Inbox,
  MessageSquarePlus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { AiModelSettingsDialog } from '@/components/assistant/AiModelSettings'

type Conversation = {
  id: number
  projectId: number | null
  title: string
  updatedAt: string | Date
  projectName?: string | null
}

const QUICK_PROMPTS = [
  '帮我梳理一下各项目当前的进展和待办',
  '最近的记录里有哪些失败的实验？可能原因是什么？',
  '收集箱里还没处理的内容，帮我排个优先级',
  '基于现有数据，帮我想下一步可以验证的假设',
]

/* ------------------------------------------------------------------ */
/* 消息气泡                                                              */
/* ------------------------------------------------------------------ */
function MessageBubble({ role, content }: { role: string; content: string }) {
  const utils = trpc.useUtils()
  const saveMut = trpc.quickNote.create.useMutation({
    onSuccess: () => {
      toast.success('已存入收集箱')
      void utils.quickNote.list.invalidate()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const isUser = role === 'user'
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-bench text-white' : 'bg-ink text-paper',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>
      <div className={cn('min-w-0 max-w-[82%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-[21px]',
            isUser
              ? 'rounded-tr-md bg-bench-wash text-bench-ink'
              : 'rounded-tl-md border border-line bg-surface text-ink shadow-card',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="assistant-md">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && (
          <button
            type="button"
            onClick={() => saveMut.mutate({ kind: 'idea', content })}
            disabled={saveMut.isPending}
            className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-ink-mute transition-colors duration-150 hover:text-bench disabled:opacity-50"
          >
            <Inbox className="h-3 w-3" /> 存入收集箱
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 对话区                                                                */
/* ------------------------------------------------------------------ */
type ToolCall = { id: string; name: string; args: Record<string, unknown> }
type RefChip = { id: number; title: string }

const TOOL_LABELS: Record<string, string> = {
  create_todo: '创建待办',
  create_quick_note: '存入收集箱',
}

/** 写操作确认卡：AI 返回的 tool_calls 只在这里由用户确认后才真正落库 */
function ToolCallCard({
  call,
  onSettled,
}: {
  call: ToolCall
  onSettled: (call: ToolCall, notice?: string) => void
}) {
  const utils = trpc.useUtils()
  const today = format(new Date(), 'yyyy-MM-dd')
  const done = (notice: string) => onSettled(call, notice)
  const todoMut = trpc.todo.create.useMutation({
    onSuccess: () => {
      void utils.todo.listByRange.invalidate()
      void utils.todo.today.invalidate()
      done(`已创建待办：${String(call.args.text ?? '').slice(0, 40)}`)
    },
    onError: (e) => toast.error(`执行失败：${e.message}`),
  })
  const noteMut = trpc.quickNote.create.useMutation({
    onSuccess: () => {
      void utils.quickNote.list.invalidate()
      done('已存入收集箱')
    },
    onError: (e) => toast.error(`执行失败：${e.message}`),
  })
  const busy = todoMut.isPending || noteMut.isPending

  const confirm = () => {
    if (call.name === 'create_todo') {
      const text = String(call.args.text ?? '').trim()
      if (!text) return toast.error('工具参数缺少待办内容')
      const todoDate =
        typeof call.args.todoDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(call.args.todoDate)
          ? call.args.todoDate
          : today
      todoMut.mutate({ todoDate, text })
    } else if (call.name === 'create_quick_note') {
      const content = String(call.args.content ?? '').trim()
      if (!content) return toast.error('工具参数缺少内容')
      const kind = call.args.kind === 'result' ? ('result' as const) : ('idea' as const)
      noteMut.mutate({ kind, content })
    }
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
        <Wrench className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 max-w-[82%] rounded-2xl rounded-tl-md border border-bench/30 bg-bench-wash/60 px-3.5 py-3 shadow-card">
        <p className="text-[12px] font-medium text-bench-ink">
          AI 请求执行：{TOOL_LABELS[call.name] ?? call.name}
        </p>
        <div className="mt-1.5 space-y-1 text-[12.5px] leading-[18px] text-ink-soft">
          {call.name === 'create_todo' && (
            <>
              <p>内容：{String(call.args.text ?? '')}</p>
              <p>日期：{typeof call.args.todoDate === 'string' ? call.args.todoDate : `${today}（今天）`}</p>
            </>
          )}
          {call.name === 'create_quick_note' && (
            <>
              <p>类型：{call.args.kind === 'result' ? '快速结果' : '想法'}</p>
              <p className="whitespace-pre-wrap">{String(call.args.content ?? '').slice(0, 200)}</p>
            </>
          )}
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-bench px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            确认执行
          </button>
          <button
            type="button"
            onClick={() => onSettled(call)}
            disabled={busy}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-soft transition-colors duration-150 hover:text-ink disabled:opacity-50"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatPane({
  conversation,
  projectName,
  hasKey,
  onOpenSettings,
  onBack,
}: {
  conversation: Conversation | null
  projectName: string | null
  hasKey: boolean
  onOpenSettings: () => void
  onBack: () => void
}) {
  const utils = trpc.useUtils()
  const [draft, setDraft] = useState('')
  const [opsMode, setOpsMode] = useState(false)
  const [refs, setRefs] = useState<RefChip[]>([])
  const [refQuery, setRefQuery] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<{ active: boolean; text: string }>({ active: false, text: '' })
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([])
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const messagesQ = trpc.ai.listMessages.useQuery(
    { conversationId: conversation?.id ?? 0 },
    { enabled: conversation != null },
  )
  const recordsQ = trpc.record.list.useQuery(undefined, { enabled: conversation != null })
  const chatMut = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      if (data.toolCalls && data.toolCalls.length > 0) {
        setPendingToolCalls((prev) => [...prev, ...data.toolCalls])
      }
      void utils.ai.listMessages.invalidate()
      void utils.ai.listConversations.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const messages = useMemo(() => messagesQ.data ?? [], [messagesQ.data])
  const busy = chatMut.isPending || streaming.active

  const recordOptions = useMemo(() => {
    if (refQuery == null) return []
    const all = (recordsQ.data ?? []).slice(0, 30)
    const q = refQuery.trim().toLowerCase()
    const filtered = q ? all.filter((r) => r.title.toLowerCase().includes(q)) : all
    return filtered.slice(0, 8)
  }, [recordsQ.data, refQuery])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, busy, streaming.text, pendingToolCalls.length])

  useEffect(() => {
    setDraft('')
    setRefs([])
    setRefQuery(null)
    setPendingToolCalls([])
    setNotices([])
    setStreaming({ active: false, text: '' })
    if (conversation) setTimeout(() => inputRef.current?.focus(), 80)
  }, [conversation?.id])

  const onDraftChange = (v: string) => {
    setDraft(v)
    const m = /@([^\s@【】]{0,20})$/.exec(v)
    setRefQuery(m ? m[1] : null)
  }

  const pickRef = (r: { id: number; title: string }) => {
    setDraft((d) => d.replace(/@([^\s@【】]{0,20})$/, `【@${r.title}】`))
    setRefs((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, { id: r.id, title: r.title }]))
    setRefQuery(null)
    inputRef.current?.focus()
  }

  const streamSend = async (v: string, refIds: number[]) => {
    if (!conversation) return
    setStreaming({ active: true, text: '' })
    try {
      const resp = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, content: v, refRecordIds: refIds }),
      })
      if (!resp.ok || !resp.body) {
        const j = (await resp.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `请求失败：HTTP ${resp.status}`)
      }
      // 用户消息已在服务端落库，先刷新列表再读流
      void utils.ai.listMessages.invalidate()
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const raw of parts) {
          const line = raw.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload) as { t?: string; error?: string }
            if (json.t) setStreaming((s) => ({ active: true, text: s.text + json.t }))
            if (json.error) toast.error(json.error)
          } catch {
            // 非 JSON 帧忽略
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStreaming({ active: false, text: '' })
      void utils.ai.listMessages.invalidate()
      void utils.ai.listConversations.invalidate()
    }
  }

  const send = (text: string) => {
    const v = text.trim()
    if (!v || !conversation || busy) return
    // 只带上仍出现在正文里的引用（用户可能已删掉 token）
    const refIds = refs.filter((r) => v.includes(`【@${r.title}】`)).map((r) => r.id)
    setDraft('')
    setRefs([])
    setRefQuery(null)
    if (opsMode) {
      chatMut.mutate({ conversationId: conversation.id, content: v, refRecordIds: refIds, withTools: true })
    } else {
      void streamSend(v, refIds)
    }
  }

  const settleToolCall = (call: ToolCall, notice?: string) => {
    setPendingToolCalls((prev) => prev.filter((t) => t.id !== call.id))
    if (notice) setNotices((prev) => [...prev, { id: Date.now(), text: notice }])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 头部 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 md:px-5">
        <button
          type="button"
          aria-label="返回会话列表"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
          {conversation ? conversation.title || '新对话' : 'AI 助手'}
        </span>
        {projectName && (
          <span className="shrink-0 rounded-full bg-bench-wash px-2 py-0.5 text-[11px] font-medium text-bench-ink">
            {projectName}
          </span>
        )}
        <button
          type="button"
          aria-label="操作模式"
          title={opsMode ? '操作模式已开启：AI 可提议创建待办/收集箱，确认后才执行' : '开启操作模式：AI 可提议写操作（确认后才落库）；关闭时为流式快聊'}
          onClick={() => setOpsMode((v) => !v)}
          className={cn(
            'flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] transition-colors duration-150',
            opsMode ? 'bg-bench-wash font-medium text-bench' : 'text-ink-mute hover:text-ink',
          )}
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">操作模式</span>
        </button>
        <button
          type="button"
          aria-label="AI 设置"
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:text-ink"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {!hasKey && (
        <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-[12.5px] text-ink">
          尚未配置 LLM，请先{' '}
          <button type="button" onClick={onOpenSettings} className="font-medium text-bench hover:underline">
            打开 AI 设置
          </button>{' '}
          填写 API Key（默认 Moonshot/Kimi，支持任意 OpenAI 兼容接口）。
        </div>
      )}

      {/* 消息流 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {!conversation ? (
          <div className="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bench-wash">
              <Sparkles className="h-6 w-6 text-bench" strokeWidth={1.6} />
            </span>
            <div>
              <p className="font-display text-[17px] font-semibold text-ink">BenchLog AI 副驾</p>
              <p className="mt-1.5 text-[13px] leading-[20px] text-ink-mute">
                我能读取你的项目、实验记录、方法与收集箱，陪你讨论数据、分析失败原因、规划下一步。
                输入 @ 可引用具体记录；开启「操作模式」后，写入类操作都会先给你确认。
              </p>
            </div>
            <p className="text-[12px] text-ink-mute">从左侧选择一个会话，或新建对话开始</p>
          </div>
        ) : messages.length === 0 && !busy ? (
          <div className="mx-auto max-w-[520px] pt-6">
            <p className="text-[13px] leading-[20px] text-ink-mute">
              开始讨论吧。可以试试：
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13px] text-ink-soft shadow-card transition-all duration-150 hover:border-bench/40 hover:text-ink"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-bench" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {pendingToolCalls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} onSettled={settleToolCall} />
            ))}
            {notices.map((n) => (
              <div key={n.id} className="flex justify-center">
                <span className="rounded-full bg-bench-wash px-3 py-1 text-[11.5px] text-bench-ink">{n.text}</span>
              </div>
            ))}
            {streaming.active && streaming.text !== '' && (
              <div className="flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 max-w-[82%] rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-[21px] text-ink shadow-card">
                  <div className="assistant-md">
                    <ReactMarkdown>{streaming.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {busy && streaming.text === '' && (
              <div className="flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-mute shadow-card">
                  正在思考…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入框 */}
      {conversation && (
        <div className="shrink-0 border-t border-line bg-surface px-3 py-3 md:px-6">
          <div className="relative mx-auto max-w-[720px]">
            {refQuery != null && recordOptions.length > 0 && (
              <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-[420px] overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <p className="border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-mute">引用记录（点击插入）</p>
                {recordOptions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickRef(r)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink transition-colors duration-150 hover:bg-bench-wash"
                  >
                    <span className="shrink-0 text-[11px] text-ink-mute">{r.recordDate}</span>
                    <span className="truncate">{r.title}</span>
                  </button>
                ))}
              </div>
            )}
            {refs.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {refs.map((r) => (
                  <span
                    key={r.id}
                    className="flex items-center gap-1 rounded-full bg-bench-wash px-2.5 py-1 text-[11.5px] text-bench-ink"
                  >
                    <AtSign className="h-3 w-3" />
                    <span className="max-w-[180px] truncate">{r.title}</span>
                    <button
                      type="button"
                      aria-label="移除引用"
                      onClick={() => {
                        setRefs((prev) => prev.filter((x) => x.id !== r.id))
                        setDraft((d) => d.replace(`【@${r.title}】`, ''))
                      }}
                      className="text-bench-ink/60 hover:text-bench-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
                rows={2}
                placeholder={
                  hasKey
                    ? opsMode
                      ? '操作模式：AI 可提议创建待办/收集箱（Enter 发送，@ 引用记录）'
                      : '输入问题…（Enter 发送，Shift+Enter 换行，@ 引用记录）'
                    : '请先配置 LLM'
                }
                disabled={!hasKey || busy}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-[13.5px] leading-[20px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench disabled:opacity-60"
              />
              <button
                type="button"
                aria-label="发送"
                onClick={() => send(draft)}
                disabled={!hasKey || busy || draft.trim() === ''}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bench text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page：三栏工作区（项目 → 会话 → 对话）                                  */
/* ------------------------------------------------------------------ */
export default function Assistant() {
  const utils = trpc.useUtils()
  const [selectedProject, setSelectedProject] = useState<number | null>(null)
  const [selectedConv, setSelectedConv] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteConv, setDeleteConv] = useState<Conversation | null>(null)

  const settingsQ = trpc.ai.getSettings.useQuery()
  const profilesQ = trpc.aiProfile.list.useQuery()
  const projectsQ = trpc.project.list.useQuery()
  const convsQ = trpc.ai.listConversations.useQuery()

  const createMut = trpc.ai.createConversation.useMutation({
    onSuccess: (c) => {
      setSelectedConv(c.id)
      void utils.ai.listConversations.invalidate()
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const removeMut = trpc.ai.removeConversation.useMutation({
    onSuccess: () => {
      if (deleteConv && selectedConv === deleteConv.id) setSelectedConv(null)
      setDeleteConv(null)
      void utils.ai.listConversations.invalidate()
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const conversations = (convsQ.data ?? []) as Conversation[]
  const filtered = conversations.filter((c) =>
    selectedProject === null ? c.projectId === null : c.projectId === selectedProject,
  )
  const current = conversations.find((c) => c.id === selectedConv) ?? null
  const currentProjectName =
    current?.projectName ??
    (selectedProject != null
      ? ((projectsQ.data ?? []).find((p) => p.id === selectedProject)?.name ?? null)
      : null)

  // 有可用 LLM = 任一模型档案已存 Key（新体系），或旧 ai_settings 有 Key（兼容兜底）
  const hasKey =
    (profilesQ.data ?? []).some((p) => p.hasApiKey) || (settingsQ.data?.hasKey ?? false)

  const newConversation = () => {
    createMut.mutate({ projectId: selectedProject ?? undefined })
  }

  /* 中栏会话列表（移动端与项目选择合一） */
  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 项目选择 */}
      <div className="shrink-0 border-b border-line px-3 py-2.5">
        <p className="caption-en mb-1.5 px-1">项目 PROJECT</p>
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          <button
            type="button"
            onClick={() => setSelectedProject(null)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 md:w-full',
              selectedProject === null ? 'bg-bench-wash text-bench-ink' : 'text-ink-soft hover:bg-paper',
            )}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            副驾快聊
          </button>
          {(projectsQ.data ?? [])
            .filter((p) => !(p as { archived?: boolean }).archived)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProject(p.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 md:w-full',
                  selectedProject === p.id ? 'bg-bench-wash text-bench-ink' : 'text-ink-soft hover:bg-paper',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="min-w-0 truncate">{p.name}</span>
              </button>
            ))}
        </div>
      </div>

      {/* 会话列表 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="caption-en">会话 CHATS</span>
        <button
          type="button"
          onClick={newConversation}
          disabled={createMut.isPending}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash disabled:opacity-50"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> 新对话
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12.5px] text-ink-mute">暂无会话，点「新对话」开始</p>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group relative flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors duration-150',
                selectedConv === c.id ? 'bg-bench-wash' : 'hover:bg-paper',
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedConv(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span
                  className={cn(
                    'block truncate text-[13.5px] font-medium',
                    selectedConv === c.id ? 'text-bench-ink' : 'text-ink',
                  )}
                >
                  {c.title || '新对话'}
                </span>
                <span className="block font-mono text-[10.5px] text-ink-mute">
                  {format(new Date(c.updatedAt), 'MM-dd HH:mm')}
                </span>
              </button>
              <button
                type="button"
                aria-label="删除会话"
                onClick={() => setDeleteConv(c)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute opacity-0 transition-all duration-150 hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const chatPane = (
    <ChatPane
      conversation={current}
      projectName={current?.projectId != null ? currentProjectName : null}
      hasKey={hasKey}
      onOpenSettings={() => setSettingsOpen(true)}
      onBack={() => setSelectedConv(null)}
    />
  )

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col bg-paper md:h-[calc(100dvh-3.5rem)]">
      <Toaster position="top-right" />

      {/* 桌面三栏 */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-surface/60">
          {listPane}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">{chatPane}</section>
      </div>

      {/* 移动端单栏切换 */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {selectedConv == null || current == null ? listPane : chatPane}
      </div>

      <AiModelSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <AlertDialog open={deleteConv != null} onOpenChange={(v) => !v && setDeleteConv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个会话？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteConv?.title || '新对话'}」的全部消息将被删除，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConv && removeMut.mutate({ id: deleteConv.id })}
              className="bg-danger text-white hover:bg-danger/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
