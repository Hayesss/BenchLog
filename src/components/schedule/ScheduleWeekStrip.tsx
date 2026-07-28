import { useMemo, useRef } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { WEEKDAY_CN, addDaysStr, todayStr, weekStart } from './scheduleDateUtils'
import { flowColor } from './scheduleTypes'
import type { ScheduleFlow, ScheduleTodo } from './scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * 移动端周视图 (schedule.md 移动端布局): one row of 7 day chips — today is a
 * solid accent disc, days with items carry color dots below. Horizontal
 * swipe switches weeks.
 */
export default function ScheduleWeekStrip({
  cursorDay,
  selectedDay,
  flows,
  todos,
  onSelectDay,
  onShiftWeek,
}: {
  cursorDay: string
  selectedDay: string
  flows: ScheduleFlow[]
  todos: ScheduleTodo[]
  onSelectDay: (day: string) => void
  onShiftWeek: (delta: number) => void
}) {
  const today = todayStr()
  const touchX = useRef<number | null>(null)

  const days = useMemo(() => {
    const start = weekStart(cursorDay)
    return Array.from({ length: 7 }, (_, i) => addDaysStr(start, i))
  }, [cursorDay])

  const dotsByDay = useMemo(() => {
    const map = new Map<string, string[]>()
    const push = (day: string, color: string) => {
      const arr = map.get(day) ?? []
      if (arr.length < 3) arr.push(color)
      map.set(day, arr)
    }
    for (const f of flows) {
      if (f.nodes.length === 0) continue
      const color = flowColor(f)
      for (const d of days) {
        if (d >= f.nodes[0].date && d <= f.nodes[f.nodes.length - 1].date) push(d, color)
      }
    }
    for (const t of todos) push(t.todoDate, t.done ? '#4C8C6B' : '#5B7C99')
    return map
  }, [flows, todos, days])

  const onTouchStart = (e: ReactTouchEvent) => {
    touchX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) > 48) onShiftWeek(dx < 0 ? 1 : -1)
  }

  return (
    <motion.div
      key={weekStart(cursorDay)}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="grid grid-cols-7 gap-1 rounded-xl border border-line bg-surface p-2 shadow-card"
    >
      {days.map((day) => {
        const isToday = day === today
        const isSelected = day === selectedDay
        const dots = dotsByDay.get(day) ?? []
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelectDay(day)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg py-1 transition-colors duration-150 hover:bg-paper"
          >
            <span className="text-[10.5px] font-medium text-ink-mute">
              {WEEKDAY_CN[(days.indexOf(day)) % 7]}
            </span>
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] transition-colors duration-150',
                isToday
                  ? 'bg-bench font-medium text-white'
                  : isSelected
                    ? 'bg-bench-wash text-bench-ink'
                    : 'text-ink',
              )}
            >
              {Number(day.slice(8))}
            </span>
            <span className="flex h-1.5 items-center gap-0.5">
              {dots.map((c, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </span>
          </button>
        )
      })}
    </motion.div>
  )
}
