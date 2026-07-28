import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export interface ExportMarkdownDrawerProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: string
  edited: boolean
  onChange: (v: string) => void
  onReset: () => void
}

/** 「在 Markdown 中微调」源码编辑抽屉：mono 13px + 行号 gutter */
export default function ExportMarkdownDrawer(props: ExportMarkdownDrawerProps) {
  // key=open：每次打开重挂载，draft 初始化为当前 markdown（生成稿或已编辑稿）
  return <MarkdownDrawerInner key={String(props.open)} {...props} />
}

function MarkdownDrawerInner({
  open,
  onOpenChange,
  value,
  edited,
  onChange,
  onReset,
}: ExportMarkdownDrawerProps) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(value)

  const lineCount = draft.split('\n').length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[560px] max-w-[96vw] flex-col border-line bg-surface p-0"
      >
        <SheetHeader className="border-b border-line px-5 py-4 text-left">
          <SheetTitle className="font-display text-[17px] font-semibold text-ink">
            微调 Markdown 源码
          </SheetTitle>
          <SheetDescription className="text-[12px] text-ink-mute">
            修改会实时反映到预览与导出内容
            {edited && <span className="ml-2 rounded-full bg-bench-wash px-1.5 py-0.5 text-[10.5px] text-bench-ink">已手动修改</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          {/* 行号 */}
          <div
            ref={gutterRef}
            aria-hidden
            className="w-11 shrink-0 select-none overflow-hidden border-r border-line bg-paper pb-4 pt-3 text-right font-mono text-[11px] leading-[21px] text-ink-mute"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="pr-2">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              onChange(e.target.value)
            }}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
            }}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none overflow-y-auto whitespace-pre bg-surface p-3 font-mono text-[13px] leading-[21px] text-ink outline-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => {
              onReset()
              onOpenChange(false)
            }}
            disabled={!edited}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复自动生成
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
          >
            完成
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
