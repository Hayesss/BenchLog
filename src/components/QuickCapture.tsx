import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'

export const QUICK_CAPTURE_EVENT = 'benchlog:quick-capture'
export type QuickCaptureKind = 'idea' | 'result'

/** 全局唤起快速捕获：window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT, { detail: { kind } })) */
export function openQuickCapture(kind: QuickCaptureKind = 'idea') {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT, { detail: { kind } }))
}

const KIND_META = {
  idea: { label: '临时想法', icon: Lightbulb, placeholder: '脑子里闪过的假设、改进点、下一步想试的条件…先记下来，回头再整理。' },
  result: { label: '快速结果', icon: Zap, placeholder: '刚出炉的初步结果：条带出来了、Ct 值、细胞状态…先记一笔，之后可转正为正式记录。' },
} as const

/**
 * 快速捕获对话框 —— 想法/结果轻量速记，落入收集箱（quickNote.create）。
 * 桌面端 ⌘K 或快捷键唤起，移动端由中央 + 动作面板唤起。
 */
export default function QuickCapture() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<QuickCaptureKind>('idea')
  const [content, setContent] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const utils = trpc.useUtils()

  useEffect(() => {
    const onOpen = (e: Event) => {
      const k = (e as CustomEvent<{ kind?: QuickCaptureKind }>).detail?.kind
      setKind(k === 'result' ? 'result' : 'idea')
      setOpen(true)
    }
    window.addEventListener(QUICK_CAPTURE_EVENT, onOpen)
    return () => window.removeEventListener(QUICK_CAPTURE_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (open) {
      setContent('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  const createMut = trpc.quickNote.create.useMutation({
    onSuccess: () => {
      toast.success(kind === 'idea' ? '想法已存入收集箱' : '结果已存入收集箱')
      setOpen(false)
      void utils.quickNote.list.invalidate()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })

  const submit = () => {
    const text = content.trim()
    if (!text) return
    createMut.mutate({ kind, content: text })
  }

  const meta = KIND_META[kind]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">快速捕获</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5">
          {(Object.keys(KIND_META) as QuickCaptureKind[]).map((k) => {
            const m = KIND_META[k]
            const Icon = m.icon
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-medium transition-colors duration-150',
                  kind === k
                    ? 'border-bench bg-bench-wash text-bench-ink'
                    : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {m.label}
              </button>
            )
          })}
        </div>

        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
          rows={5}
          placeholder={meta.placeholder}
          className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[11px] text-ink-mute">
            {content.length > 0 ? `${content.length} 字` : '⌘/Ctrl + Enter 保存'}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={createMut.isPending || content.trim() === ''}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {createMut.isPending ? '保存中…' : '存入收集箱'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
