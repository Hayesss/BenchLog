import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Inbox,
  MessageSquarePlus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
/* AI 设置对话框                                                         */
/* ------------------------------------------------------------------ */
function AiSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils()
  const settingsQ = trpc.ai.getSettings.useQuery(undefined, { enabled: open })
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (open && settingsQ.data) {
      setBaseUrl(settingsQ.data.baseUrl)
      setModel(settingsQ.data.model)
      setApiKey('')
    }
  }, [open, settingsQ.data])

  const saveMut = trpc.ai.saveSettings.useMutation({
    onSuccess: () => {
      toast.success('AI 设置已保存')
      void utils.ai.getSettings.invalidate()
      onOpenChange(false)
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })

  const d = settingsQ.data
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">AI 设置</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] leading-[19px] text-ink-mute">
          使用任意 OpenAI 兼容接口（默认 Moonshot/Kimi）。API Key 仅存储在你的数据库中，用于服务端调用。
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">接口地址 BASE URL</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.moonshot.cn/v1"
              className="h-10 rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-bench"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">模型 MODEL</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="kimi-k2-0711-preview"
              className="h-10 rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-bench"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">API KEY</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={d?.hasKey ? `已保存（${d.keyPreview}），留空保持不变` : 'sk-…'}
              className="h-10 rounded-lg border border-line bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-bench"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() =>
              saveMut.mutate({
                baseUrl: baseUrl.trim() || undefined,
                model: model.trim() || undefined,
                apiKey: apiKey === '' ? undefined : apiKey.trim(),
              })
            }
            disabled={saveMut.isPending}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {saveMut.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const messagesQ = trpc.ai.listMessages.useQuery(
    { conversationId: conversation?.id ?? 0 },
    { enabled: conversation != null },
  )
  const chatMut = trpc.ai.chat.useMutation({
    onSuccess: () => {
      void utils.ai.listMessages.invalidate()
      void utils.ai.listConversations.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const messages = useMemo(() => messagesQ.data ?? [], [messagesQ.data])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, chatMut.isPending])

  useEffect(() => {
    setDraft('')
    if (conversation) setTimeout(() => inputRef.current?.focus(), 80)
  }, [conversation?.id])

  const send = (text: string) => {
    const v = text.trim()
    if (!v || !conversation || chatMut.isPending) return
    setDraft('')
    chatMut.mutate({ conversationId: conversation.id, content: v })
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
                写入类操作都会先给你确认。
              </p>
            </div>
            <p className="text-[12px] text-ink-mute">从左侧选择一个会话，或新建对话开始</p>
          </div>
        ) : messages.length === 0 && !chatMut.isPending ? (
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
            {chatMut.isPending && (
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
          <div className="mx-auto flex max-w-[720px] items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              rows={2}
              placeholder={hasKey ? '输入问题…（Enter 发送，Shift+Enter 换行）' : '请先配置 LLM'}
              disabled={!hasKey || chatMut.isPending}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-[13.5px] leading-[20px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench disabled:opacity-60"
            />
            <button
              type="button"
              aria-label="发送"
              onClick={() => send(draft)}
              disabled={!hasKey || chatMut.isPending || draft.trim() === ''}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bench text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
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

  const hasKey = settingsQ.data?.hasKey ?? false

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

      <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

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
