import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addDaysStr, clamp, diffDays, shortDay, todayStr } from './scheduleDateUtils'
import { flowColor, wash } from './scheduleTypes'
import type { FlowNode, ScheduleFlow } from './scheduleTypes'
import { useNodeDoneSet } from './flowNodeDone'

type DragMode = 'move' | 'start' | 'end'

type DragState = {
  mode: DragMode
  delta: number // whole days, snapped
  moved: boolean
}

/**
 * TimelineBlock (design.md §8.8): cross-day bar on the flow timeline.
 * Project-color 15% wash + 2px left bar, rounded 6px, h-32px; node dots on
 * key days (past = solid success, future = hollow). Drag body to shift all
 * nodes; drag the 6px left/right edges to move the first/last node. Snaps to
 * whole days; parent persists via flow.update and shows the undo toast.
 */
export default function FlowTimelineBlock({
  flow,
  rangeStart,
  days,
  colWidth,
  protocolLabel,
  onCommit,
  onSelectDay,
  onOpenFlow,
}: {
  flow: ScheduleFlow
  rangeStart: string
  days: number
  colWidth: number
  protocolLabel: string | null
  onCommit: (flow: ScheduleFlow, nextNodes: FlowNode[], message: string) => void
  onSelectDay: (day: string) => void
  onOpenFlow: (flow: ScheduleFlow) => void
}) {
  const color = flowColor(flow)
  const today = todayStr()
  const { isDone } = useNodeDoneSet()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; delta: number; moved: boolean } | null>(null)

  const nodes = flow.nodes
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const rawStart = diffDays(first.date, rangeStart)
  const rawEnd = diffDays(last.date, rangeStart)

  // constraint bounds for resize (keep node order, allow modest off-view stretch)
  const secondIdx = nodes.length > 1 ? diffDays(nodes[1].date, rangeStart) : rawEnd
  const prevLastIdx = nodes.length > 1 ? diffDays(nodes[nodes.length - 2].date, rangeStart) : rawStart

  const clampDelta = useCallback(
    (mode: DragMode, delta: number) => {
      if (mode === 'move') return clamp(delta, -rawStart - 7, days - 1 - rawEnd + 7)
      if (mode === 'start') return clamp(delta, -7, Math.min(secondIdx, days - 1) - rawStart)
      return clamp(delta, Math.max(prevLastIdx, 0) - rawEnd, 14)
    },
    [days, rawStart, rawEnd, secondIdx, prevLastIdx],
  )

  const beginDrag = (mode: DragMode) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, delta: 0, moved: false }
    setDrag({ mode, delta: 0, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d || colWidth <= 0) return
    const px = e.clientX - d.startX
    if (Math.abs(px) > 3) d.moved = true
    const delta = clampDelta(d.mode, Math.round(px / colWidth))
    if (delta !== d.delta) {
      d.delta = delta
      setDrag({ mode: d.mode, delta, moved: d.moved })
    } else if (d.moved !== drag?.moved) {
      setDrag({ mode: d.mode, delta, moved: d.moved })
    }
  }

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setDrag(null)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (!d.moved) {
      if (d.mode === 'move') onSelectDay(clampDay(first.date))
      return
    }
    if (d.delta === 0) return
    if (d.mode === 'move') {
      const next = nodes.map((n) => ({ ...n, date: addDaysStr(n.date, d.delta) }))
      onCommit(
        flow,
        next,
        `已调整：${flow.name}（${shortDay(next[0].date)} → ${shortDay(next[next.length - 1].date)}）`,
      )
    } else if (d.mode === 'start') {
      const next = nodes.map((n, i) => (i === 0 ? { ...n, date: addDaysStr(n.date, d.delta) } : n))
      onCommit(flow, next, `已调整：${first.name}日 → ${shortDay(next[0].date)}`)
    } else {
      const next = nodes.map((n, i) =>
        i === nodes.length - 1 ? { ...n, date: addDaysStr(n.date, d.delta) } : n,
      )
      onCommit(flow, next, `已调整：${last.name}日 → ${shortDay(next[next.length - 1].date)}`)
    }
  }

  const clampDay = (day: string) => {
    const idx = clamp(diffDays(day, rangeStart), 0, days - 1)
    return addDaysStr(rangeStart, idx)
  }

  // displayed span (in day indices relative to rangeStart), incl. live drag
  const dispStart = drag?.mode === 'start' ? rawStart + drag.delta : rawStart
  const dispEnd = drag?.mode === 'end' ? rawEnd + drag.delta : rawEnd
  const visStart = clamp(dispStart, 0, days - 1)
  const visEnd = clamp(dispEnd, 0, days - 1)
  if (rawEnd < 0 || rawStart > days - 1) return null

  const leftPct = (visStart / days) * 100
  const widthPct = ((visEnd - visStart + 1) / days) * 100
  const spanDays = dispEnd - dispStart + 1
  const moveDelta = drag?.mode === 'move' ? drag.delta : 0
  const continuesLeft = dispStart < 0
  const continuesRight = dispEnd > days - 1
  const showStartHandle = rawStart >= 0 && rawStart <= days - 1
  const showEndHandle = rawEnd >= 0 && rawEnd <= days - 1

  return (
    <div
      className={cn(
        'group/tb absolute inset-y-0',
        !drag && 'transition-[left,width] duration-200 ease-paper',
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`流程 ${flow.name}，拖动调整日期`}
        onPointerDown={beginDrag('move')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelectDay(clampDay(first.date))
        }}
        className={cn(
          'relative flex h-8 touch-none items-center overflow-visible border-l-2 px-2 outline-none',
          continuesLeft ? 'rounded-l-none' : 'rounded-l-md',
          continuesRight ? 'rounded-r-none' : 'rounded-r-md',
          drag ? 'z-20 shadow-overlay' : 'z-0 shadow-card',
          drag?.mode === 'move' ? 'cursor-grabbing' : 'cursor-grab',
          !drag && 'transition-shadow duration-200 ease-paper hover:shadow-card-hover',
        )}
        style={{
          backgroundColor: wash(color, '26'), // 15% wash
          borderLeftColor: color,
          transform: moveDelta ? `translateX(${moveDelta * colWidth}px)` : undefined,
        }}
      >
        {/* first-day flow name + current node labels */}
        <span className="pointer-events-none flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          <span className="truncate text-[12px] font-medium text-ink">{flow.name}</span>
        </span>

        {/* node dots along the bar */}
        {nodes.map((n, i) => {
          const idx =
            diffDays(n.date, rangeStart) +
            moveDelta +
            (drag?.mode === 'start' && i === 0 ? drag.delta : 0) +
            (drag?.mode === 'end' && i === nodes.length - 1 ? drag.delta : 0)
          const pct = ((idx - dispStart + 0.5) / spanDays) * 100
          if (pct < 0 || pct > 100) return null
          const past = n.date < today
          const done = past || isDone(flow.id, i)
          return (
            <motion.span
              key={`${n.date}-${i}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1], delay: 0.12 + i * 0.06 }}
              className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1"
              style={{ left: `${pct}%` }}
            >
              <span
                className={cn(
                  '-ml-1 h-2 w-2 shrink-0 rounded-full border-2',
                  done ? 'border-success bg-success' : 'bg-surface',
                )}
                style={done ? undefined : { borderColor: color }}
              />
              <span className="hidden whitespace-nowrap text-[11.5px] text-ink-soft md:inline">{n.name}</span>
            </motion.span>
          )
        })}

        {/* resize handles: 6px edges, highlight on hover */}
        {showStartHandle && (
          <span
            aria-hidden
            onPointerDown={beginDrag('start')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize touch-none rounded-l-md opacity-0 transition-opacity duration-150 hover:opacity-100 group-hover/tb:opacity-60"
            style={{ backgroundColor: wash(color, '59') }}
          />
        )}
        {showEndHandle && (
          <span
            aria-hidden
            onPointerDown={beginDrag('end')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none rounded-r-md opacity-0 transition-opacity duration-150 hover:opacity-100 group-hover/tb:opacity-60"
            style={{ backgroundColor: wash(color, '59') }}
          />
        )}
      </div>

      {/* hover tooltip: full chain + protocol + open */}
      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-lg border border-line bg-surface p-3 opacity-0 shadow-overlay transition-opacity duration-150 md:block md:group-hover/tb:pointer-events-auto md:group-hover/tb:opacity-100">
        <p className="text-[12.5px] font-medium text-ink">
          {nodes.map((n) => n.name).join(' → ')}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink-mute">
          {shortDay(first.date)} → {shortDay(last.date)} · {nodes.length} 个节点
        </p>
        <ol className="mt-2 flex flex-col gap-1">
          {nodes.map((n, i) => (
            <li key={`${n.date}-${i}`} className="flex items-center gap-2 text-[12px] text-ink-soft">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  n.date < today || isDone(flow.id, i) ? 'bg-success' : 'border bg-surface',
                )}
                style={n.date < today || isDone(flow.id, i) ? undefined : { borderColor: color }}
              />
              <span className="font-mono text-[11px] text-ink-mute">{shortDay(n.date)}</span>
              {n.name}
            </li>
          ))}
        </ol>
        {protocolLabel && <p className="mt-2 text-[11.5px] text-ink-mute">关联协议 {protocolLabel}</p>}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenFlow(flow)
          }}
          className="mt-2 flex items-center gap-1 text-[12px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
        >
          打开流程 <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
