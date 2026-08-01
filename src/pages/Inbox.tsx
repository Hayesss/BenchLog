import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  CalendarPlus,
  ChevronDown,
  CornerDownRight,
  FilePlus2,
  Inbox as InboxIcon,
  Lightbulb,
  Send,
  Trash2,
  Zap,
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'

type QuickNoteItem = {
  id: number
  kind: string
  content: string
  status: string
  projectId: number | null
  recordId: number | null
  createdAt: string | Date
  projectName?: string | null
  recordTitle?: string | null
}

const KIND_META = {
  idea: { label: '想法', icon: Lightbulb, cls: 'text-warning bg-warning/10' },
  result: { label: '结果', icon: Zap, cls: 'text-info bg-info/10' },
} as const

function kindMeta(kind: string) {
  return kind === 'result' ? KIND_META.result : KIND_META.idea
}

/* ------------------------------------------------------------------ */
/* 顶部快速输入：回车即存                                                */
/* ------------------------------------------------------------------ */
function QuickInput() {
  const [kind, setKind] = useState<'idea' | 'result'>('idea')
  const [text, setText] = useState('')
  const utils = trpc.useUtils()
  const createMut = trpc.quickNote.create.useMutation({
    onSuccess: () => {
      setText('')
      void utils.quickNote.list.invalidate()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })

  const submit = () => {
    const v = text.trim()
    if (!v) return
    createMut.mutate({ kind, content: v })
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="flex items-center gap-1.5">
        {(['idea', 'result'] as const).map((k) => {
          const m = KIND_META[k]
          const Icon = m.icon
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150',
                kind === k ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:border-line-strong',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              {k === 'idea' ? '临时想法' : '快速结果'}
            </button>
          )
        })}
      </div>
      <div className="mt-2.5 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder={kind === 'idea' ? '想法速记，回车即存…' : '初步结果速记，回车即存…'}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-[14px] leading-[21px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
        />
        <button
          type="button"
          aria-label="存入收集箱"
          onClick={submit}
          disabled={createMut.isPending || text.trim() === ''}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-bench text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 追加到记录：选择目标记录                                              */
/* ------------------------------------------------------------------ */
function AppendDialog({
  note,
  open,
  onOpenChange,
}: {
  note: QuickNoteItem | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const utils = trpc.useUtils()
  const navigate = useNavigate()
  const recordsQ = trpc.record.list.useQuery(undefined, { enabled: open })
  const appendMut = trpc.quickNote.appendToRecord.useMutation({
    onSuccess: ({ recordId }) => {
      toast.success('已追加到记录结果', {
        action: { label: '查看记录', onClick: () => navigate(`/records/${recordId}`) },
      })
      onOpenChange(false)
      void utils.quickNote.list.invalidate()
      void utils.record.invalidate()
    },
    onError: (e) => toast.error(`追加失败：${e.message}`),
  })

  const recent = useMemo(() => (recordsQ.data ?? []).slice(0, 30), [recordsQ.data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">追加到哪条记录？</DialogTitle>
        </DialogHeader>
        <p className="line-clamp-2 rounded-lg bg-paper px-3 py-2 text-[12.5px] leading-[19px] text-ink-soft">
          {note?.content}
        </p>
        <div className="mt-2 max-h-[46vh] overflow-y-auto">
          {recent.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12.5px] text-ink-mute">还没有记录</p>
          ) : (
            recent.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={appendMut.isPending}
                onClick={() => note && appendMut.mutate({ id: note.id, recordId: r.id })}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 hover:bg-bench-wash/60"
              >
                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{r.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-mute">{r.recordDate}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* 单条收集项                                                            */
/* ------------------------------------------------------------------ */
function NoteCard({
  note,
  onAppend,
}: {
  note: QuickNoteItem
  onAppend: (n: QuickNoteItem) => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const utils = trpc.useUtils()
  const navigate = useNavigate()
  const today = format(new Date(), 'yyyy-MM-dd')

  const done = note.status === 'done'
  const invalidate = () => void utils.quickNote.list.invalidate()

  const toTodoMut = trpc.quickNote.convertToTodo.useMutation({
    onSuccess: () => {
      toast.success(`已转为 ${today} 的待办`)
      invalidate()
      void utils.todo.today.invalidate()
    },
    onError: (e) => toast.error(`转换失败：${e.message}`),
  })
  const toRecordMut = trpc.quickNote.convertToRecord.useMutation({
    onSuccess: ({ recordId }) => {
      toast.success('已转正为湿实验记录', {
        action: { label: '继续完善', onClick: () => navigate(`/records/${recordId}`) },
      })
      invalidate()
      void utils.record.invalidate()
    },
    onError: (e) => toast.error(`转换失败：${e.message}`),
  })
  const removeMut = trpc.quickNote.remove.useMutation({
    onSuccess: () => {
      toast.success('已删除')
      invalidate()
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const m = kindMeta(note.kind)
  const Icon = m.icon
  const busy = toTodoMut.isPending || toRecordMut.isPending || removeMut.isPending

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-xl border bg-surface p-4 shadow-card',
        done ? 'border-line-soft opacity-70' : 'border-line',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium', m.cls)}>
          <Icon className="h-3 w-3" strokeWidth={2} />
          {m.label}
        </span>
        <span className="font-mono text-[11px] text-ink-mute">
          {format(new Date(note.createdAt), 'MM-dd HH:mm')}
        </span>
        {note.projectName && (
          <span className="truncate text-[11.5px] text-ink-mute">· {note.projectName}</span>
        )}
        {note.recordTitle && (
          <span className="truncate text-[11.5px] text-ink-mute">· 记录「{note.recordTitle}」</span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[21px] text-ink">{note.content}</p>

      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => toRecordMut.mutate({ id: note.id })}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-bench px-3 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            <FilePlus2 className="h-3.5 w-3.5" /> 转为记录
          </button>
          {note.kind === 'result' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAppend(note)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:border-line-strong disabled:opacity-50"
            >
              <CornerDownRight className="h-3.5 w-3.5" /> 追加到已有记录
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => toTodoMut.mutate({ id: note.id, date: today })}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:border-line-strong disabled:opacity-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> 转为今日待办
          </button>
          <button
            type="button"
            aria-label="删除"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条{note.kind === 'idea' ? '想法' : '结果'}？</AlertDialogTitle>
            <AlertDialogDescription>删除后不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMut.mutate({ id: note.id })}
              className="bg-danger text-white hover:bg-danger/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function Inbox() {
  const [doneOpen, setDoneOpen] = useState(false)
  const [appendNote, setAppendNote] = useState<QuickNoteItem | null>(null)

  const inboxQ = trpc.quickNote.list.useQuery({ status: 'inbox', kind: 'all' })
  const doneQ = trpc.quickNote.list.useQuery({ status: 'done', kind: 'all' })

  const items = (inboxQ.data ?? []) as QuickNoteItem[]
  const doneItems = (doneQ.data ?? []) as QuickNoteItem[]

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8 md:py-8">
      <Toaster position="top-right" />

      <header className="mb-5">
        <h1 className="font-display text-[22px] font-bold leading-[30px] text-ink">收集箱</h1>
        <p className="mt-1 text-[13px] leading-[20px] text-ink-mute">
          实验中的灵感与初步结果先丢进来，空闲时再转正为正式记录或待办。
        </p>
      </header>

      <QuickInput />

      <div className="mt-6 flex flex-col gap-3">
        {inboxQ.isLoading ? (
          <p className="py-10 text-center text-[12.5px] text-ink-mute">载入中…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong py-12">
            <InboxIcon className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
            <p className="text-[13px] text-ink-mute">收集箱是空的 — 用上方输入框或移动端中央 + 速记</p>
          </div>
        ) : (
          items.map((n) => <NoteCard key={n.id} note={n} onAppend={setAppendNote} />)
        )}
      </div>

      {doneItems.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setDoneOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:bg-paper"
          >
            <ChevronDown
              className={cn('h-4 w-4 text-ink-mute transition-transform duration-200', !doneOpen && '-rotate-90')}
            />
            已处理
            <span className="font-mono text-[11.5px] text-ink-mute">{doneItems.length}</span>
          </button>
          {doneOpen && (
            <div className="mt-2 flex flex-col gap-3">
              {doneItems.map((n) => (
                <NoteCard key={n.id} note={n} onAppend={setAppendNote} />
              ))}
            </div>
          )}
        </div>
      )}

      <AppendDialog note={appendNote} open={appendNote != null} onOpenChange={(v) => !v && setAppendNote(null)} />

      <p className="mt-10 text-center text-[11.5px] text-ink-mute">
        转正后的内容会进入 <Link to="/records" className="text-bench hover:underline">湿实验记录</Link> 或{' '}
        <Link to="/schedule" className="text-bench hover:underline">实验安排</Link>
      </p>
    </div>
  )
}
