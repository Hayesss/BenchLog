import { motion } from 'framer-motion'
import { FileDown, FileText, FileType, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportOptions, ReportTemplate } from './reportTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const TEMPLATES: Array<{
  key: ReportTemplate
  name: string
  desc: string
  icon: typeof FileText
}> = [
  {
    key: 'markdown',
    name: '组会汇报（Markdown）',
    desc: '按项目分组：进展 / 数据 / 问题与计划三段式，适合粘贴到组会文档',
    icon: FileText,
  },
  {
    key: 'table',
    name: '实验汇总表格',
    desc: '单张宽表：日期 / 目的 / 方法版本 / 参数偏离 / 结论，适合 Excel',
    icon: Table2,
  },
  {
    key: 'pdf',
    name: '存档 PDF',
    desc: '完整记录逐条排版：含图片与参数表，适合长期归档',
    icon: FileDown,
  },
  {
    key: 'docx',
    name: 'Word 文档（.docx）',
    desc: '湿实验记录与生信分析排版为 Word 报告，适合直接发给导师',
    icon: FileType,
  },
]

function OptionRow({
  checked,
  disabled,
  onChange,
  label,
  sub,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  label: string
  sub?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors duration-150',
        disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-paper',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-200',
          checked ? 'border-bench bg-bench' : 'border-line-strong bg-surface',
        )}
      >
        {checked && (
          <motion.svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            initial={false}
            animate={{ scale: 1 }}
          >
            <motion.path
              d="M2.5 6.2 5 8.5 9.5 3.5"
              fill="none"
              stroke="#fff"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.22, ease: EASE }}
            />
          </motion.svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {sub && <span className="block text-[11px] text-ink-mute">{sub}</span>}
      </span>
    </button>
  )
}

export interface ExportTemplateCardProps {
  template: ReportTemplate
  onTemplate: (t: ReportTemplate) => void
  options: ReportOptions
  onOptions: (o: ReportOptions) => void
}

export default function ExportTemplateCard({
  template,
  onTemplate,
  options,
  onOptions,
}: ExportTemplateCardProps) {
  const set = (patch: Partial<ReportOptions>) => onOptions({ ...options, ...patch })
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-card md:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[16px] font-semibold text-ink">汇报模板</h2>
        <span className="caption-en !text-[10px]">TEMPLATE</span>
      </div>

      <div className="flex flex-col gap-2">
        {TEMPLATES.map((t) => {
          const active = template === t.key
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTemplate(t.key)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.99]',
                active
                  ? 'border-2 border-bench bg-bench-wash'
                  : 'border-line bg-surface hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover',
              )}
            >
              {/* radio 圆点填充动画 */}
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
                  active ? 'border-bench' : 'border-line-strong',
                )}
              >
                {active && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                    className="h-2 w-2 rounded-full bg-bench"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                  <Icon className="h-4 w-4 text-bench" strokeWidth={1.8} />
                  {t.name}
                </span>
                <span className="mt-0.5 block text-[12px] leading-[18px] text-ink-mute">
                  {t.desc}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 border-t border-line pt-2">
        <OptionRow
          checked={options.includeImages}
          disabled={template === 'table'}
          onChange={(v) => set({ includeImages: v })}
          label="包含结果图片"
          sub={
            template === 'table'
              ? '仅 Markdown / PDF 可用'
              : template === 'docx'
                ? 'Word 中仅列出图注文字'
                : undefined
          }
        />
        <OptionRow
          checked={options.includeDeviations}
          onChange={(v) => set({ includeDeviations: v })}
          label="包含参数偏离表"
        />
        <OptionRow
          checked={options.includeFailed}
          onChange={(v) => set({ includeFailed: v })}
          label="包含失败记录"
          sub="失败也是数据"
        />
        <OptionRow
          checked={options.anonymize}
          onChange={(v) => set({ anonymize: v })}
          label="匿名化货号"
          sub="如 CST #4967 → CST #××××"
        />
      </div>
    </section>
  )
}
