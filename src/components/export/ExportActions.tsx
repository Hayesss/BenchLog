import { motion } from 'framer-motion'
import { Check, Copy, FileDown, Loader2, Printer, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportTemplate } from './reportTypes'

const PRIMARY_LABEL: Record<ReportTemplate, string> = {
  markdown: '复制 Markdown',
  table: '下载 CSV',
  pdf: '导出 PDF',
}

const PRIMARY_ICON: Record<ReportTemplate, typeof Copy> = {
  markdown: Copy,
  table: FileDown,
  pdf: Printer,
}

export interface ExportActionsProps {
  template: ReportTemplate
  disabled: boolean
  busy: boolean
  done: boolean
  onPrimary: () => void
  /** markdown → 下载 .md；table → 复制表格；pdf → 打印 */
  onSecondary: () => void
  onPrint: () => void
}

export default function ExportActions({
  template,
  disabled,
  busy,
  done,
  onPrimary,
  onSecondary,
  onPrint,
}: ExportActionsProps) {
  const PrimaryIcon = done ? Check : busy ? Loader2 : PRIMARY_ICON[template]
  const secondaryLabel =
    template === 'markdown' ? '下载 .md 文件' : template === 'table' ? '复制表格' : '打印'
  const SecondaryIcon = template === 'table' ? Table2 : template === 'markdown' ? FileDown : Printer

  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-card md:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[16px] font-semibold text-ink">导出</h2>
        <span className="caption-en !text-[10px]">EXPORT</span>
      </div>

      {/* 主按钮（随模板动态） */}
      <motion.button
        type="button"
        key={template}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        onClick={onPrimary}
        disabled={disabled || busy}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-white shadow-card transition-all duration-150',
          done
            ? 'bg-success'
            : 'bg-bench hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]',
          (disabled || busy) && 'cursor-not-allowed opacity-60 hover:translate-y-0',
        )}
      >
        <PrimaryIcon className={cn('h-4 w-4', busy && 'animate-spin')} />
        {busy ? '正在生成…' : done ? '已导出' : PRIMARY_LABEL[template]}
      </motion.button>

      {/* 次按钮 */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSecondary}
          disabled={disabled || busy}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[12.5px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SecondaryIcon className="h-3.5 w-3.5" />
          {secondaryLabel}
        </button>
        {template !== 'pdf' && (
          <button
            type="button"
            onClick={onPrint}
            disabled={disabled || busy}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[12.5px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            打印
          </button>
        )}
      </div>

      <p className="mt-3 text-[11.5px] leading-[17px] text-ink-mute">
        {template === 'pdf'
          ? '通过浏览器打印为 PDF，A4 排版已隔离应用界面'
          : '导出会自动记入「导出历史」，可随时重新下载'}
      </p>
    </section>
  )
}
