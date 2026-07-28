import { format, isToday, isYesterday } from 'date-fns'
import { FileDown, FileText, RotateCcw, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ExportLogItem } from './reportTypes'
import { downloadTextFile, reportFileName } from './reportBuild'

const FORMAT_ICON = {
  markdown: FileText,
  table: Table2,
  pdf: FileDown,
} as const

const FORMAT_LABEL = {
  markdown: 'Markdown',
  table: '表格 CSV',
  pdf: 'PDF',
} as const

function metaTime(d: Date): string {
  const hm = format(d, 'HH:mm')
  if (isToday(d)) return `今天 ${hm}`
  if (isYesterday(d)) return `昨天 ${hm}`
  return format(d, 'MM-dd HH:mm')
}

function scopeCount(scope: Record<string, unknown>): number | null {
  const c = scope?.count
  return typeof c === 'number' ? c : null
}

export interface ExportHistoryDrawerProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  logs: ExportLogItem[]
  loading: boolean
}

export default function ExportHistoryDrawer({
  open,
  onOpenChange,
  logs,
  loading,
}: ExportHistoryDrawerProps) {
  const redownload = (log: ExportLogItem) => {
    const formatKey = (log.format === 'markdown' || log.format === 'table' ? log.format : 'pdf') as
      | 'markdown'
      | 'table'
      | 'pdf'
    if (!log.content) {
      toast.info('PDF 导出未保存源文件，请在预览中重新导出')
      return
    }
    const name = reportFileName(formatKey, new Date(log.createdAt))
    const mime = formatKey === 'table' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'
    downloadTextFile(name, log.content, mime)
    toast.success(`已重新下载 ${name}`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[400px] max-w-[92vw] flex-col border-line bg-surface p-0"
      >
        <SheetHeader className="border-b border-line px-5 py-4 text-left">
          <SheetTitle className="font-display text-[17px] font-semibold text-ink">
            导出历史
          </SheetTitle>
          <SheetDescription className="text-[12px] text-ink-mute">
            最近 20 次导出 · Markdown / CSV 可直接重新下载
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-line/60" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-24 text-center">
              <FileDown className="h-8 w-8 text-line-strong" strokeWidth={1.5} />
              <p className="mt-3 font-display text-[15px] font-semibold text-ink">
                还没有导出记录
              </p>
              <p className="mt-1 text-[12px] text-ink-mute">
                生成第一份组会汇报后会出现在这里
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const key =
                log.format === 'markdown' || log.format === 'table' ? log.format : 'pdf'
              const Icon = FORMAT_ICON[key]
              const name = reportFileName(key, new Date(log.createdAt))
              const count = scopeCount(log.scope as Record<string, unknown>)
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 border-b border-line px-5 py-3 transition-colors duration-150 hover:bg-paper"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bench-wash text-bench">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12.5px] text-ink">{name}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-mute">
                      {FORMAT_LABEL[key]}
                      {count !== null && ` · ${count} 条`}
                      {` · ${metaTime(new Date(log.createdAt))}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => redownload(log)}
                    aria-label={`重新下载 ${name}`}
                    title={log.content ? '重新下载' : 'PDF 需重新生成'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
