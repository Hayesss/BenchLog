import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { toast } from 'sonner'
import {
  highlightParams,
  parseDurationSeconds,
  type ProtocolParam,
  type ProtocolStep,
  type ProtocolStepGroup,
} from './protocolShared'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function stepKey(gi: number, si: number): string {
  return `g${gi}s${si}`
}

/* ---------------- inline countdown timer ---------------- */

function InlineTimer({ seconds, durationLabel }: { seconds: number; durationLabel: string }) {
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          window.clearInterval(t)
          setRunning(false)
          toast.success(`计时结束（${durationLabel}）`)
          try {
            navigator.vibrate?.(80)
          } catch {
            /* noop */
          }
          return 0
        }
        return v - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [running, durationLabel])

  const mm = Math.floor(left / 60)
  const ss = left % 60
  const hh = Math.floor(mm / 60)
  const text = hh > 0 ? `${hh}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`

  return (
    <motion.span
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="ml-8 mt-1 flex items-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="font-mono text-[20px] font-medium tabular-nums text-bench">{text}</span>
      <button
        type="button"
        aria-label={running ? '暂停' : '开始'}
        onClick={() => setRunning((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-bench"
      >
        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label="重置"
        onClick={() => {
          setRunning(false)
          setLeft(seconds)
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-bench"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <span className="text-[11.5px] text-ink-mute">{durationLabel}</span>
    </motion.span>
  )
}

/* ---------------- single step row (StepCheckbox, design §8.3) ---------------- */

function StepRow({
  step,
  index,
  checked,
  onToggle,
  params,
  registerRef,
  flash,
}: {
  step: ProtocolStep
  index: number
  checked: boolean
  onToggle?: () => void
  params: ProtocolParam[]
  registerRef?: (el: HTMLDivElement | null) => void
  flash?: boolean
}) {
  const [timerOpen, setTimerOpen] = useState(false)
  const timerSeconds = parseDurationSeconds(step.duration)
  const segments = highlightParams(step.text, params)

  const body = (
    <>
      {/* checkbox */}
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-200',
          checked ? 'border-bench bg-bench' : 'border-line-strong bg-surface',
          onToggle && !checked && 'group-hover:border-bench/60',
        )}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <motion.path
            d="M2.2 6.3 4.8 8.8 9.8 3.2"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </span>

      <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[12px] leading-[20px] text-ink-mute">
        {index + 1}
      </span>

      <span className="relative min-w-0 flex-1 pt-0.5">
        <span
          className={cn(
            'text-[14px] leading-[22px] transition-colors duration-200',
            checked ? 'text-ink-mute' : 'text-ink',
          )}
        >
          {segments.map((seg, i) =>
            seg.kind === 'param' && seg.param ? (
              <Popover key={i}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="mx-0.5 inline rounded bg-bench-wash px-1 font-mono text-[12.5px] text-bench-ink transition-colors duration-150 hover:bg-bench-wash/70"
                  >
                    {seg.value}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 rounded-lg border-line p-3">
                  <p className="text-[12.5px] font-semibold text-ink">{seg.param.name}</p>
                  <p className="mt-1 font-mono text-[13px] text-bench">
                    {seg.param.value}
                    {seg.param.unit ? ` ${seg.param.unit}` : ''}
                  </p>
                  {seg.param.note && <p className="mt-1 text-[12px] leading-[18px] text-ink-soft">{seg.param.note}</p>}
                </PopoverContent>
              </Popover>
            ) : (
              <span key={i}>{seg.value}</span>
            ),
          )}
        </span>
        {/* strikethrough sweep */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-[14px] h-px bg-ink-mute/60"
          initial={false}
          animate={{ width: checked ? '100%' : '0%', opacity: checked ? 0.6 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
        <AnimatePresence>
          {timerOpen && timerSeconds != null && (
            <InlineTimer seconds={timerSeconds} durationLabel={step.duration ?? ''} />
          )}
        </AnimatePresence>
      </span>

      {step.duration && (
        <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-soft">
          {step.duration}
        </span>
      )}
      {timerSeconds != null && onToggle && (
        <button
          type="button"
          aria-label="计时器"
          onClick={(e) => {
            e.stopPropagation()
            setTimerOpen((v) => !v)
          }}
          className={cn(
            'flex h-11 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 md:h-8',
            timerOpen ? 'text-bench' : 'text-ink-mute hover:text-bench',
          )}
        >
          <Timer className="h-4 w-4" />
        </button>
      )}
    </>
  )

  return (
    <motion.div
      ref={registerRef}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      animate={checked ? { scale: 0.995 } : { scale: 1 }}
      className={cn(
        // 行高 ≥44px 桌面 / 48px 移动（design §8.3）
        'group flex min-h-12 items-start gap-2.5 border-b border-line px-3 py-2 last:border-b-0 md:min-h-11',
        onToggle && 'cursor-pointer transition-colors duration-150 hover:bg-paper',
        flash && 'animate-pulse bg-bench-wash/60',
      )}
      onClick={
        onToggle
          ? () => {
              onToggle()
              if (!checked) {
                try {
                  navigator.vibrate?.(10)
                } catch {
                  /* noop */
                }
              }
            }
          : undefined
      }
    >
      {body}
    </motion.div>
  )
}

/* ---------------- step group card ---------------- */

function StepGroupCard({
  group,
  gi,
  checkedMap,
  onToggle,
  params,
  defaultOpen,
  registerStepRef,
  flashKey,
  readOnly,
}: {
  group: ProtocolStepGroup
  gi: number
  checkedMap: Record<string, boolean>
  onToggle?: (key: string) => void
  params: ProtocolParam[]
  defaultOpen: boolean
  registerStepRef?: (key: string, el: HTMLDivElement | null) => void
  flashKey?: string | null
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const total = group.steps.length
  const done = group.steps.filter((_, si) => checkedMap[stepKey(gi, si)]).length
  const complete = total > 0 && done === total

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-paper"
      >
        <motion.span
          animate={complete ? { scale: [0.5, 1.15, 1], backgroundColor: ['#EAF2EF', '#4C8C6B', '#4C8C6B'] } : { scale: 1 }}
          transition={{ duration: 0.4 }}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
            complete ? 'text-white' : 'bg-bench-wash text-bench-ink',
          )}
        >
          {complete ? '✓' : gi + 1}
        </motion.span>
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">{group.title}</h3>
        <span className={cn('ml-auto font-mono text-[12px]', complete ? 'text-success' : 'text-ink-mute')}>
          {done}/{total}
          {complete ? ' ✓' : ''}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-ink-mute transition-transform duration-200', !open && '-rotate-90')}
        />
      </button>
      {/* group progress bar (2px, accent) */}
      <div className="h-0.5 w-full bg-line/60">
        <motion.div
          className={cn('h-full', complete ? 'bg-success' : 'bg-bench')}
          initial={false}
          animate={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {group.steps.map((s, si) => {
              const key = stepKey(gi, si)
              return (
                <StepRow
                  key={key}
                  step={s}
                  index={si}
                  checked={!!checkedMap[key]}
                  onToggle={readOnly ? undefined : onToggle ? () => onToggle(key) : undefined}
                  params={params}
                  registerRef={registerStepRef ? (el) => registerStepRef(key, el) : undefined}
                  flash={flashKey === key}
                />
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * 操作步骤 section (protocol-detail.md §区块4): collapsible StepCheckbox group cards.
 */
export default function ProtocolSteps({
  groups,
  checkedMap,
  onToggle,
  params,
  registerStepRef,
  flashKey,
  readOnly,
}: {
  groups: ProtocolStepGroup[]
  checkedMap: Record<string, boolean>
  onToggle?: (key: string) => void
  params: ProtocolParam[]
  registerStepRef?: (key: string, el: HTMLDivElement | null) => void
  flashKey?: string | null
  readOnly?: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <section ref={contentRef}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">操作步骤</h3>
        <span className="caption-en !text-[10px]">Steps</span>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-ink-mute">
          本协议尚未录入步骤。
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <StepGroupCard
              key={gi}
              group={g}
              gi={gi}
              checkedMap={checkedMap}
              onToggle={onToggle}
              params={params}
              defaultOpen={gi === 0}
              registerStepRef={registerStepRef}
              flashKey={flashKey}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </section>
  )
}
