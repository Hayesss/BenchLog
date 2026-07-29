import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import FlowTimelineBlock from './FlowTimelineBlock'
import { diffDays, todayStr, weekdayIndex } from './scheduleDateUtils'
import { flowColor } from './scheduleTypes'
import type { FlowNode, ScheduleFlow, ScheduleProtocol } from './scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]
const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日']

/**
 * 区块2 — 进行中的流程: one 56px row per active flow, horizontal gantt over
 * the visible range, 2px pulsing today line, drag/resize TimelineBlocks.
 */
export default function ScheduleFlowTimeline({
  flows,
  protocols,
  rangeDays,
  loading,
  onCommit,
  onSelectDay,
  onOpenFlow,
}: {
  flows: ScheduleFlow[]
  protocols: ScheduleProtocol[]
  rangeDays: string[]
  loading: boolean
  onCommit: (flow: ScheduleFlow, nextNodes: FlowNode[], message: string) => void
  onSelectDay: (day: string) => void
  onOpenFlow: (flow: ScheduleFlow) => void
}) {
  const rangeStart = rangeDays[0]
  const days = rangeDays.length
  const today = todayStr()
  const todayIdx = diffDays(today, rangeStart)

  const ganttRef = useRef<HTMLDivElement>(null)
  const [colWidth, setColWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ganttRef.current
    if (!el) return
    const measure = () => setColWidth(el.clientWidth / days)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [days])

  const active = useMemo(
    () =>
      flows.filter((f) => {
        if (f.nodes.length === 0) return false
        const start = diffDays(f.nodes[0].date, rangeStart)
        const end = diffDays(f.nodes[f.nodes.length - 1].date, rangeStart)
        return end >= 0 && start <= days - 1
      }),
    [flows, rangeStart, days],
  )

  const protocolLabel = (f: ScheduleFlow) => {
    if (!f.protocolId) return null
    const p = protocols.find((x) => x.id === f.protocolId)
    return p ? `${p.name} ${p.version}` : null
  }

  const showEmpty = !loading && active.length === 0
  const compactTicks = days > 7
  const minWidth = compactTicks ? Math.max(560, days * 26) : 560

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card md:p-5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[16px] font-semibold text-ink">进行中的流程</h2>
        <span className="font-mono text-[11.5px] text-ink-mute">{active.length} 个</span>
      </div>

      {showEmpty ? (
        <div className="flex flex-col items-center py-8">
          <img src="/empty-schedule.svg" alt="" className="h-24 w-32 object-contain opacity-90" />
          <p className="mt-3 text-[13px] text-ink-soft">本周没有进行中的流程</p>
          <Link
            to="/protocols"
            className="mt-2 flex items-center gap-1 text-[13px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
          >
            从方法发起排期 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div style={{ minWidth }}>
            {/* tick header */}
            <div className="flex">
              <div className="w-36 shrink-0 md:w-44" />
              <div ref={ganttRef} className="relative flex h-7 flex-1">
                {rangeDays.map((d, i) => (
                  <span
                    key={d}
                    className={cn(
                      'flex flex-1 flex-col items-center justify-center font-mono text-[10.5px] leading-tight',
                      i === todayIdx ? 'text-bench' : 'text-ink-mute',
                    )}
                  >
                    {compactTicks ? (
                      <span>{Number(d.slice(8))}</span>
                    ) : (
                      <>
                        <span>{WEEKDAY_CN[weekdayIndex(d)]}</span>
                        <span>{d.slice(5)}</span>
                      </>
                    )}
                  </span>
                ))}
                {todayIdx >= 0 && todayIdx < days && (
                  <span
                    aria-hidden
                    className="absolute top-0 h-full w-0.5 bg-bench/70"
                    style={{ left: `${((todayIdx + 0.5) / days) * 100}%` }}
                  >
                    <span className="absolute -left-[3px] -top-0.5 h-2 w-2 animate-pulse rounded-full bg-bench" />
                  </span>
                )}
              </div>
            </div>

            {/* flow rows */}
            <div className="flex flex-col">
              {active.map((flow, rowIdx) => (
                <motion.div
                  key={flow.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: rowIdx * 0.08 }}
                  className="flex h-14 items-center border-t border-line/60 first:border-t-0"
                >
                  <div className="flex w-36 shrink-0 items-center gap-2 pr-3 md:w-44">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: flowColor(flow) }}
                    />
                    <span className="truncate font-display text-[15px] font-semibold text-ink">
                      {flow.name}
                    </span>
                  </div>
                  <div className="relative h-full flex-1">
                    {todayIdx >= 0 && todayIdx < days && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 w-0.5 bg-bench/25"
                        style={{ left: `${((todayIdx + 0.5) / days) * 100}%` }}
                      />
                    )}
                    <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2">
                      <FlowTimelineBlock
                        flow={flow}
                        rangeStart={rangeStart}
                        days={days}
                        colWidth={colWidth}
                        protocolLabel={protocolLabel(flow)}
                        onCommit={onCommit}
                        onSelectDay={onSelectDay}
                        onOpenFlow={onOpenFlow}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
