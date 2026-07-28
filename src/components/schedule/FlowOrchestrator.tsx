import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addDaysStr, diffDays, shortDay, weekdayLabel } from './scheduleDateUtils'
import { FLOW_COLOR_SWATCHES, wash } from './scheduleTypes'
import type { FlowNode, ScheduleFlow, ScheduleProject, ScheduleProtocol } from './scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const EASE_OUT = [0.4, 0, 0.2, 1] as [number, number, number, number]

const STEPS = ['基本信息', '节点编排', '确认预览'] as const
const DEFAULT_TEMPLATE = [
  { name: '铺板', offset: 0 },
  { name: '转染', offset: 2 },
  { name: '收样', offset: 4 },
]

export type FlowCreateInput = {
  name: string
  color: string
  projectId: number | null
  protocolId: number | null
  nodes: FlowNode[]
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatch(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return match
}

function namePrefix(source: string): string {
  const ascii = source.replace(/[^A-Za-z]/g, '').toUpperCase()
  if (ascii.length >= 2) return ascii.slice(0, 2)
  return source.replace(/\s/g, '').slice(0, 2) || 'EXP'
}

/**
 * 区块5 — 流程编排弹窗. 3 steps: ① 基本信息 (name / project / protocol /
 * color) ② 节点编排 (template 铺板/转染/收样 at offsets 0/2/4, editable)
 * ③ 确认预览 (mini gantt) → create. Centered 640px modal on desktop,
 * full-screen bottom Sheet on mobile.
 */
type OrchestratorProps = {
  initialDay: string
  flows: ScheduleFlow[]
  projects: ScheduleProject[]
  protocols: ScheduleProtocol[]
  onClose: () => void
  onSubmit: (input: FlowCreateInput) => Promise<void>
}

/**
 * Wrapper — mounts a fresh dialog (fresh form state) every time it opens.
 */
export default function FlowOrchestrator({ open, ...props }: OrchestratorProps & { open: boolean }) {
  return <AnimatePresence>{open && <OrchestratorDialog {...props} />}</AnimatePresence>
}

function OrchestratorDialog({
  initialDay,
  flows,
  projects,
  protocols,
  onClose,
  onSubmit,
}: OrchestratorProps) {
  const isDesktop = useMedia('(min-width: 768px)')
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState(() => `EXP-${initialDay.slice(5).replace('-', '')}`)
  const [nameTouched, setNameTouched] = useState(false)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [protocolId, setProtocolId] = useState<number | null>(null)
  const [color, setColor] = useState<string>(FLOW_COLOR_SWATCHES[0])
  const [colorTouched, setColorTouched] = useState(false)
  const [startDate, setStartDate] = useState(initialDay)
  const [nodes, setNodes] = useState<FlowNode[]>(() =>
    DEFAULT_TEMPLATE.map((t) => ({ name: t.name, date: addDaysStr(initialDay, t.offset) })),
  )
  const [submitting, setSubmitting] = useState(false)

  const protocol = protocols.find((p) => p.id === protocolId) ?? null
  const project = projects.find((p) => p.id === projectId) ?? null

  // protocol selection seeds color + node chain + name
  const pickProtocol = (id: number | null) => {
    setProtocolId(id)
    const p = protocols.find((x) => x.id === id)
    if (!p) return
    if (!colorTouched) setColor(p.color || FLOW_COLOR_SWATCHES[0])
    const chain = p.stepGroups
      .map((g) => g.title)
      .filter(Boolean)
      .slice(0, 5)
    const tpl = chain.length > 0 ? chain : DEFAULT_TEMPLATE.map((t) => t.name)
    setNodes(tpl.map((n, i) => ({ name: n, date: addDaysStr(startDate, i * 2) })))
    if (!nameTouched) setName(`${namePrefix(p.name)}-${startDate.slice(5).replace('-', '')}`)
  }

  const pickProject = (id: number | null) => {
    setProjectId(id)
    const p = projects.find((x) => x.id === id)
    if (p && !colorTouched && !protocolId) setColor(p.color || FLOW_COLOR_SWATCHES[0])
  }

  // shifting the start date shifts every node by the same delta
  const changeStart = (next: string) => {
    const delta = diffDays(next, startDate)
    setStartDate(next)
    if (delta !== 0) setNodes((ns) => ns.map((n) => ({ ...n, date: addDaysStr(n.date, delta) })))
    if (!nameTouched) {
      const src = protocol ? namePrefix(protocol.name) : 'EXP'
      setName(`${src}-${next.slice(5).replace('-', '')}`)
    }
  }

  const spanStart = nodes.length ? nodes.reduce((a, n) => (n.date < a ? n.date : a), nodes[0].date) : startDate
  const spanEnd = nodes.length ? nodes.reduce((a, n) => (n.date > a ? n.date : a), nodes[0].date) : startDate

  // amber conflict hint: 3+ parallel flows in the chosen window
  const conflicts = useMemo(
    () =>
      flows.filter((f) => {
        if (f.nodes.length === 0) return false
        return f.nodes[0].date <= spanEnd && f.nodes[f.nodes.length - 1].date >= spanStart
      }).length,
    [flows, spanStart, spanEnd],
  )

  const canNext1 = name.trim().length > 0
  const canNext2 = nodes.length > 0 && nodes.every((n) => n.name.trim().length > 0)

  const goto = (next: number) => {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const sorted = [...nodes].sort((a, b) => a.date.localeCompare(b.date))
      await onSubmit({
        name: name.trim(),
        color,
        projectId,
        protocolId,
        nodes: sorted.map((n) => ({ name: n.name.trim(), date: n.date })),
      })
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="编排新流程"
            initial={isDesktop ? { opacity: 0, scale: 0.96 } : { opacity: 1, y: '100%' }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }}
            exit={
              isDesktop
                ? { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: EASE_OUT } }
                : { opacity: 0, y: '100%', transition: { duration: 0.24, ease: EASE_OUT } }
            }
            transition={{ duration: 0.28, ease: EASE }}
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-overlay md:max-h-[85vh] md:w-[640px] md:rounded-xl"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="font-display text-[20px] font-semibold leading-7 text-ink">编排新流程</h2>
                <p className="caption-en mt-0.5 !text-[10px]">Orchestrate Flow</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* step indicator with animated connector */}
            <div className="flex items-center gap-2 px-5 pt-4">
              {STEPS.map((label, i) => (
                <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] transition-colors duration-200',
                        i < step
                          ? 'bg-success text-white'
                          : i === step
                            ? 'bg-bench text-white'
                            : 'border border-line-strong text-ink-mute',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        'whitespace-nowrap text-[12.5px] transition-colors duration-200',
                        i === step ? 'font-medium text-ink' : 'text-ink-mute',
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="relative mx-1 h-px min-w-4 flex-1 overflow-hidden bg-line">
                      <motion.span
                        className="absolute inset-y-0 left-0 bg-bench"
                        initial={false}
                        animate={{ width: i < step ? '100%' : '0%' }}
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* body */}
            <div className="min-h-[300px] flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: dir * 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -16, transition: { duration: 0.16, ease: EASE_OUT } }}
                  transition={{ duration: 0.24, ease: EASE }}
                >
                  {step === 0 && (
                    <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink-soft">流程名</span>
                        <input
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value)
                            setNameTouched(true)
                          }}
                          placeholder="如 LV-0616 慢病毒包装"
                          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink-soft">关联项目</span>
                        <Select
                          value={projectId == null ? 'none' : String(projectId)}
                          onValueChange={(v) => pickProject(v === 'none' ? null : Number(v))}
                        >
                          <SelectTrigger className="h-10 w-full rounded-lg border-line-strong bg-surface">
                            <SelectValue placeholder="不关联项目" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不关联项目</SelectItem>
                            {projects.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                                  {p.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink-soft">关联协议</span>
                        <Select
                          value={protocolId == null ? 'none' : String(protocolId)}
                          onValueChange={(v) => pickProtocol(v === 'none' ? null : Number(v))}
                        >
                          <SelectTrigger className="h-10 w-full rounded-lg border-line-strong bg-surface">
                            <SelectValue placeholder="不关联协议" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不关联协议</SelectItem>
                            {protocols.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {protocol && (
                          <span className="font-mono text-[11.5px] text-ink-mute">
                            将以 {protocol.version} 执行 · 已带出标准节点链
                          </span>
                        )}
                      </label>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink-soft">项目色</span>
                        <div className="flex items-center gap-2.5">
                          {FLOW_COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`选择颜色 ${c}`}
                              onClick={() => {
                                setColor(c)
                                setColorTouched(true)
                              }}
                              className={cn(
                                'h-7 w-7 rounded-full transition-transform duration-150 active:scale-95',
                                color === c && 'ring-2 ring-bench ring-offset-2 ring-offset-surface',
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <span className="ml-1 font-mono text-[11.5px] text-ink-mute">{color}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] font-medium text-ink-soft">
                          开始日期：<span className="font-mono text-ink">{shortDay(startDate)}</span>{' '}
                          {weekdayLabel(startDate)}
                        </span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            if (e.target.value) changeStart(e.target.value)
                          }}
                          className="h-10 w-48 rounded-lg border border-line-strong bg-surface px-3 font-mono text-[13px] text-ink outline-none transition-colors duration-150 focus:border-bench"
                        />
                      </label>

                      {conflicts >= 3 && (
                        <div className="rounded-lg border-l-2 border-warning bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
                          日期冲突提醒：该时段已有 {conflicts} 个流程并行，注意台面上的实验密度。
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        {nodes.map((n, i) => (
                          <motion.div
                            key={i}
                            layout="position"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, ease: EASE, delay: i * 0.03 }}
                            className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-card"
                          >
                            <GripVertical className="h-4 w-4 shrink-0 text-ink-mute" />
                            <span className="w-6 shrink-0 text-center font-mono text-[11px] text-ink-mute">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <input
                              value={n.name}
                              onChange={(e) =>
                                setNodes((ns) => ns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                              }
                              placeholder="节点名"
                              className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
                            />
                            <input
                              type="date"
                              value={n.date}
                              onChange={(e) => {
                                if (!e.target.value) return
                                setNodes((ns) => ns.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))
                              }}
                              className="h-9 w-[138px] shrink-0 rounded-md border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink outline-none transition-colors duration-150 focus:border-bench"
                            />
                            <button
                              type="button"
                              aria-label="删除节点"
                              onClick={() => setNodes((ns) => ns.filter((_, j) => j !== i))}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </motion.div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setNodes((ns) => [
                              ...ns,
                              { name: '', date: addDaysStr(ns.length ? ns[ns.length - 1].date : startDate, 2) },
                            ])
                          }
                          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[13px] font-medium text-ink-mute transition-colors duration-150 hover:border-bench hover:text-bench"
                        >
                          <Plus className="h-4 w-4" /> 添加节点
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-lg border border-line bg-paper p-4">
                        <div className="flex items-baseline justify-between">
                          <p className="font-display text-[16px] font-semibold text-ink">{name || '未命名流程'}</p>
                          <span className="font-mono text-[11.5px] text-ink-mute">
                            {shortDay(spanStart)} → {shortDay(spanEnd)} · {nodes.length} 个节点
                          </span>
                        </div>
                        {(project || protocol) && (
                          <p className="mt-1 text-[12px] text-ink-mute">
                            {project ? `项目 ${project.name}` : ''}
                            {project && protocol ? ' · ' : ''}
                            {protocol ? `协议 ${protocol.name} ${protocol.version}` : ''}
                          </p>
                        )}

                        {/* mini gantt */}
                        <div className="relative mt-6 h-2 rounded-full" style={{ backgroundColor: wash(color, '26') }}>
                          <div className="absolute inset-y-0 left-0 w-0.5 rounded-full" style={{ backgroundColor: color }} />
                          {nodes.map((n, i) => {
                            const span = Math.max(1, diffDays(spanEnd, spanStart))
                            const pct = (diffDays(n.date, spanStart) / span) * 100
                            return (
                              <motion.span
                                key={`${n.date}-${i}`}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.24, ease: EASE, delay: 0.1 + i * 0.06 }}
                                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                                style={{ left: `${pct}%`, borderColor: color }}
                              />
                            )
                          })}
                        </div>
                        <div className="relative mt-2 h-10">
                          {nodes.map((n, i) => {
                            const span = Math.max(1, diffDays(spanEnd, spanStart))
                            const pct = (diffDays(n.date, spanStart) / span) * 100
                            return (
                              <span
                                key={`${n.date}-${i}-label`}
                                className="absolute flex -translate-x-1/2 flex-col items-center"
                                style={{ left: `${pct}%` }}
                              >
                                <span className="whitespace-nowrap text-[11.5px] text-ink">{n.name}</span>
                                <span className="font-mono text-[10.5px] text-ink-mute">{shortDay(n.date)}</span>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <p className="text-[12.5px] text-ink-mute">
                        确认无误后点击「生成排期」，流程条会出现在日历与时间轴上，可随时拖动调整。
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* footer */}
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => (step === 0 ? onClose() : goto(step - 1))}
                className="h-10 rounded-lg border border-line bg-surface px-4 text-[13.5px] font-medium text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                {step === 0 ? '取消' : '上一步'}
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  disabled={(step === 0 && !canNext1) || (step === 1 && !canNext2)}
                  onClick={() => goto(step + 1)}
                  className="h-10 rounded-lg bg-bench px-5 text-[13.5px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submit}
                  className="h-10 rounded-lg bg-bench px-5 text-[13.5px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:opacity-50"
                >
                  {submitting ? '生成中…' : '生成排期'}
                </button>
              )}
            </div>
          </motion.div>
    </div>
  )
}
