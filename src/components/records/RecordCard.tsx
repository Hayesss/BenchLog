import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import RecordTagChip from './RecordTagChip'
import { RecordStatusBadge } from './RecordStatusMenu'
import { fmtDateShort, recordCode } from './record-types'
import type { RecordListItem } from './record-types'

/** Highlight occurrences of the search query inside plain text. */
export function Highlight({ text, q }: { text: string; q: string }) {
  const parts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return null
    const lower = text.toLowerCase()
    const out: Array<{ str: string; hit: boolean }> = []
    let i = 0
    while (i < text.length) {
      const idx = lower.indexOf(needle, i)
      if (idx === -1) {
        out.push({ str: text.slice(i), hit: false })
        break
      }
      if (idx > i) out.push({ str: text.slice(i, idx), hit: false })
      out.push({ str: text.slice(idx, idx + needle.length), hit: true })
      i = idx + needle.length
    }
    return out
  }, [text, q])
  if (!parts) return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-[#B98A3E33] text-inherit">
            {p.str}
          </mark>
        ) : (
          <span key={i}>{p.str}</span>
        ),
      )}
    </>
  )
}

function RecordCard({
  record,
  q,
  selectable,
  selected,
  onToggleSelect,
  compact,
}: {
  record: RecordListItem
  q: string
  selectable: boolean
  selected: boolean
  onToggleSelect: (id: number) => void
  compact?: boolean
}) {
  const navigate = useNavigate()
  const failed = record.status === 'failed'
  const barColor = failed ? '#B4564E' : record.project?.color || '#D8D4CA'
  const deviations = record.deviations ?? []
  const deviated = deviations.filter((d) => d.actualValue !== d.defaultValue)
  const tags = record.tags ?? []

  const open = () => navigate(`/records/${record.id}`)

  return (
    <motion.article
      layout="position"
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileTap={{ scale: 0.99 }}
      onClick={open}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border border-line bg-surface pl-4 pr-4 shadow-card transition-[box-shadow,transform] duration-[180ms] hover:-translate-y-0.5 hover:shadow-card-hover',
        compact ? 'py-2.5' : 'py-3.5',
        selected && 'border-bench bg-bench-wash/40',
      )}
    >
      {/* left 3px color bar (danger for failed records — never hidden) */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: barColor }}
        aria-hidden
      />

      {/* selection checkbox — hover on desktop, always in selection mode */}
      <button
        type="button"
        aria-label={selected ? '取消选择' : '选择记录'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(record.id)
        }}
        className={cn(
          'absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border text-[12px] transition-all duration-150',
          selected
            ? 'border-bench bg-bench text-white opacity-100'
            : 'border-line-strong bg-surface text-transparent hover:border-bench',
          selectable ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover:opacity-100',
        )}
      >
        ✓
      </button>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* line 1: code + title */}
          <div className="flex items-baseline gap-2 pr-8">
            <span className="shrink-0 font-mono text-[11.5px] text-ink-mute">
              {recordCode(record.id, record.recordDate)}
            </span>
            <h3
              className={cn(
                'min-w-0 font-display font-semibold text-ink',
                compact ? 'text-[14.5px]' : 'text-[16px]',
              )}
            >
              <Highlight text={record.title} q={q} />
            </h3>
            {failed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full text-danger">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[12px]">
                  失败也是数据 — 复盘后可重复优化
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* line 2: date · protocol anchor · purpose */}
          <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-mute">
            <span className="shrink-0 font-mono">{fmtDateShort(record.recordDate)}</span>
            {record.protocol && (
              <>
                <span className="text-line-strong">·</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/protocols/${record.protocol!.id}`)
                  }}
                  className="shrink-0 font-mono text-bench transition-colors duration-150 hover:text-bench-deep hover:underline"
                >
                  {record.protocol.name}
                  {record.protocolVersion ? ` ${record.protocolVersion}` : ''}
                </button>
              </>
            )}
            {!compact && record.purpose && (
              <>
                <span className="text-line-strong">·</span>
                <span className="min-w-0">
                  目的：<Highlight text={record.purpose} q={q} />
                </span>
              </>
            )}
            {deviated.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[#B98A3E1F] px-2 font-mono text-[11px] font-medium text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    偏离 ×{deviated.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] font-mono text-[12px]">
                  {deviated.map((d) => `${d.param} ${d.defaultValue} → ${d.actualValue}`).join('；')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* line 3: tags + conclusion quote */}
          {!compact && (tags.length > 0 || record.conclusion) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <RecordTagChip key={t} name={t} className="!h-5 !text-[11.5px]" />
              ))}
              {record.conclusion && (
                <p className="min-w-0 flex-1 font-display text-[13px] italic text-ink-soft">
                  “<Highlight text={record.conclusion} q={q} />”
                </p>
              )}
            </div>
          )}
        </div>

        {/* right: status badge */}
        <div className={cn('shrink-0', selectable || selected ? 'pt-7' : '')}>
          <RecordStatusBadge status={record.status} />
        </div>
      </div>
    </motion.article>
  )
}

export default memo(RecordCard)
