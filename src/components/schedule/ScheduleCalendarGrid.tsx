import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  WEEKDAY_CN,
  addDaysStr,
  diffDays,
  monthGridDays,
  todayStr,
  weekStart,
} from './scheduleDateUtils'
import { flowColor, wash } from './scheduleTypes'
import type { ScheduleFlow, ScheduleTodo } from './scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type FlowSeg = { flow: ScheduleFlow; nodeName: string | null; isStart: boolean }

/**
 * 区块3 — 月日历网格. 7 columns, hairline gaps, ≥112px rows; each cell holds
 * up to 3 items (cross-day flow segments → todo chips) + "+N 更多". Click to
 * select, double-click for a quick-add popover. `compact` = mobile month
 * mode (color dots only).
 */
export default function ScheduleCalendarGrid({
  view,
  year,
  month0,
  cursorDay,
  animKey,
  direction,
  selectedDay,
  flows,
  todos,
  compact = false,
  onSelectDay,
  onCreateTodo,
}: {
  view: 'month' | 'week'
  year: number
  month0: number
  cursorDay: string
  animKey: string
  direction: number
  selectedDay: string
  flows: ScheduleFlow[]
  todos: ScheduleTodo[]
  compact?: boolean
  onSelectDay: (day: string) => void
  onCreateTodo: (day: string, text: string) => void
}) {
  const today = todayStr()
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [quickDraft, setQuickDraft] = useState('')

  const days = useMemo(
    () => (view === 'week' ? Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart(cursorDay), i)) : monthGridDays(year, month0)),
    [view, year, month0, cursorDay],
  )
  const weeks = useMemo(() => {
    const out: string[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [days])

  const segsByDay = useMemo(() => {
    const map = new Map<string, FlowSeg[]>()
    for (const flow of flows) {
      if (flow.nodes.length === 0) continue
      const first = flow.nodes[0].date
      const last = flow.nodes[flow.nodes.length - 1].date
      const nodeByDate = new Map(flow.nodes.map((n) => [n.date, n.name]))
      const from = Math.max(0, diffDays(first, days[0]))
      const to = Math.min(days.length - 1, diffDays(last, days[0]))
      for (let i = from; i <= to; i++) {
        const day = days[i]
        const seg: FlowSeg = {
          flow,
          nodeName: nodeByDate.get(day) ?? null,
          isStart: day === first,
        }
        const arr = map.get(day)
        if (arr) arr.push(seg)
        else map.set(day, [seg])
      }
    }
    return map
  }, [flows, days])

  const todosByDay = useMemo(() => {
    const map = new Map<string, ScheduleTodo[]>()
    for (const t of todos) {
      const arr = map.get(t.todoDate)
      if (arr) arr.push(t)
      else map.set(t.todoDate, [t])
    }
    return map
  }, [todos])

  const submitQuickAdd = () => {
    const text = quickDraft.trim()
    if (text && quickAddDay) onCreateTodo(quickAddDay, text)
    setQuickDraft('')
    setQuickAddDay(null)
  }

  return (
    <motion.div
      key={animKey}
      initial={{ opacity: 0, x: direction * 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {/* weekday header */}
      <div className="grid grid-cols-7">
        {WEEKDAY_CN.map((w) => (
          <span
            key={w}
            className="py-2 text-center text-[11.5px] font-medium tracking-[0.04em] text-ink-mute"
          >
            {w}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-line shadow-card">
        {weeks.map((week, wi) => (
          <div key={week[0]} className="grid grid-cols-7 gap-px [&+&]:mt-px">
            {week.map((day) => {
              const inMonth = view === 'week' || Number(day.slice(5, 7)) === month0 + 1
              const isToday = day === today
              const isSelected = day === selectedDay
              const segs = segsByDay.get(day) ?? []
              const dayTodos = todosByDay.get(day) ?? []
              const items = 3
              const shownSegs = compact ? [] : segs.slice(0, items)
              const todoSlots = Math.max(0, items - shownSegs.length)
              const shownTodos = compact ? [] : dayTodos.slice(0, todoSlots)
              const hidden = segs.length + dayTodos.length - shownSegs.length - shownTodos.length
              return (
                <div
                  key={day}
                  role="button"
                  tabIndex={0}
                  aria-label={day}
                  onClick={() => onSelectDay(day)}
                  onDoubleClick={() => {
                    onSelectDay(day)
                    setQuickAddDay(day)
                    setQuickDraft('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectDay(day)
                  }}
                  className={cn(
                    'relative flex cursor-pointer flex-col bg-surface px-1.5 pb-1 pt-1.5 text-left outline-none transition-colors duration-100 hover:bg-paper md:px-2',
                    view === 'week' ? 'min-h-[160px]' : compact ? 'min-h-[56px]' : 'min-h-[72px] md:min-h-[112px]',
                    isSelected && 'bg-bench-wash/40 shadow-[inset_0_0_0_2px_#3E7C6B] transition-shadow duration-150',
                  )}
                >
                  {/* date number */}
                  <span className="flex items-center justify-between">
                    {isToday ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bench font-mono text-[13px] font-medium text-white">
                        {Number(day.slice(8))}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center font-mono text-[13px]',
                          inMonth ? 'text-ink' : 'text-ink-mute/40',
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                    )}
                  </span>

                  {/* desktop / week-view details */}
                  {!compact && (
                    <div className="mt-1 hidden flex-col gap-1 md:flex">
                      {shownSegs.map((seg, i) => {
                        const color = flowColor(seg.flow)
                        const label = seg.nodeName ?? (seg.isStart ? seg.flow.name : null)
                        return (
                          <motion.div
                            key={`${seg.flow.id}-${animKey}`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.3, ease: EASE, delay: wi * 0.05 + i * 0.03 }}
                            style={{ transformOrigin: 'left center' }}
                            className="-mx-1.5 md:-mx-2"
                            title={`${seg.flow.name}${seg.nodeName ? ` · ${seg.nodeName}` : ''}`}
                          >
                            <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
                            {label && (
                              <span
                                className="block truncate px-1.5 pt-0.5 text-[10.5px] leading-[14px] md:px-2"
                                style={{ color }}
                              >
                                {label}
                              </span>
                            )}
                          </motion.div>
                        )
                      })}
                      {shownTodos.map((t) => (
                        <span key={t.id} className="flex items-center gap-1.5 truncate px-0.5 text-[12px] leading-[16px]">
                          <span
                            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.done ? 'bg-success' : 'bg-info')}
                          />
                          <span className={cn('truncate', t.done ? 'text-ink-mute line-through' : 'text-ink-soft')}>
                            {t.text}
                          </span>
                        </span>
                      ))}
                      {hidden > 0 && (
                        <span className="px-0.5 font-mono text-[11px] text-ink-mute">+{hidden} 更多</span>
                      )}
                    </div>
                  )}

                  {/* mobile dots (≤3) */}
                  <div className={cn('mt-auto flex items-center gap-1 px-0.5 pb-0.5', compact ? 'flex' : 'flex md:hidden')}>
                    {segs.slice(0, 3).map((seg) => (
                      <span
                        key={seg.flow.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: flowColor(seg.flow) }}
                      />
                    ))}
                    {segs.length < 3 &&
                      dayTodos.slice(0, 3 - segs.length).map((t) => (
                        <span key={t.id} className={cn('h-1.5 w-1.5 rounded-full', t.done ? 'bg-success' : 'bg-info')} />
                      ))}
                  </div>

                  {/* mobile: continuous flow bar wash at cell bottom edge */}
                  {segs.length > 0 && (
                    <span
                      aria-hidden
                      className={cn('absolute inset-x-0 bottom-0 h-1', compact ? 'block' : 'md:hidden')}
                      style={{ backgroundColor: wash(flowColor(segs[0].flow), '66') }}
                    />
                  )}

                  {/* double-click quick-add popover */}
                  {quickAddDay === day && (
                    <div
                      className="absolute left-1 top-8 z-30 w-48 rounded-lg border border-line bg-surface p-2 shadow-overlay"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={quickDraft}
                        onChange={(e) => setQuickDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitQuickAdd()
                          if (e.key === 'Escape') setQuickAddDay(null)
                        }}
                        onBlur={submitQuickAdd}
                        placeholder="新建待办，Enter 保存"
                        className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none placeholder:text-ink-mute focus:border-bench"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
