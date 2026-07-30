import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CalendarPlus, Check, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import TodoChecklist from './TodoChecklist'
import { diffDays, longDayLabel, todayStr } from './scheduleDateUtils'
import { flowColor } from './scheduleTypes'
import type { ScheduleFlow, ScheduleTodo } from './scheduleTypes'
import { useNodeDoneSet } from './flowNodeDone'
import { trpc } from '@/providers/trpc'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

function NodeCard({ flow, nodeIndex }: { flow: ScheduleFlow; nodeIndex: number }) {
  const node = flow.nodes[nodeIndex]
  const color = flowColor(flow)
  const { isDone, markDone } = useNodeDoneSet()
  const past = node.date < todayStr()
  const [justDone, setJustDone] = useState(false)
  const done = past || justDone || isDone(flow.id, nodeIndex)

  const complete = () => {
    setJustDone(true)
    markDone(flow.id, nodeIndex, true)
    try {
      navigator.vibrate?.(10)
    } catch {
      /* optional haptics */
    }
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: justDone ? [1, 0.995, 1] : 1 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="rounded-lg border border-line bg-surface py-2.5 pl-3 pr-2.5 shadow-card"
      style={{ borderLeftWidth: 2, borderLeftColor: color }}
    >
      <p className="text-[14px] font-medium text-ink">
        {node.name} <span className="text-ink-mute">· {flow.name}</span>
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {flow.protocolId ? (
          <Link
            to={`/protocols/${flow.protocolId}`}
            className="flex items-center gap-1 text-[12px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
          >
            查看 Day {nodeIndex + 1} 步骤 <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="font-mono text-[11px] text-ink-mute">Day {nodeIndex + 1}</span>
        )}
        {done ? (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11.5px] font-medium text-success"
          >
            <Check className="h-3 w-3" /> 已完成
          </motion.span>
        ) : (
          <button
            type="button"
            onClick={complete}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-medium text-ink-soft transition-all duration-150 hover:border-bench hover:text-bench active:scale-[0.97]"
          >
            <Check className="h-3.5 w-3.5" /> 勾选完成
          </button>
        )}
      </div>
    </motion.div>
  )
}

/**
 * 区块4 — 选中日详情: day title + D+n mono sub, flow node cards for the day,
 * to-do checklist, quick actions (＋ 事件 / ＋ 流程).
 */
export default function ScheduleDayPanel({
  day,
  flows,
  todos,
  onToggleTodo,
  onRemoveTodo,
  onCreateTodo,
  onOpenFlowModal,
}: {
  day: string
  flows: ScheduleFlow[]
  todos: ScheduleTodo[]
  onToggleTodo: (todo: ScheduleTodo) => void
  onRemoveTodo: (todo: ScheduleTodo) => void
  onCreateTodo: (text: string) => void
  onOpenFlowModal: () => void
}) {
  const quickAddRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  // 已完成且尚未整理进记录的待办数（>0 时显示「整理为记录」）
  const summarizable = todos.filter((t) => t.done && t.recordId == null).length
  const summarizeMut = trpc.todo.summarizeToRecord.useMutation({
    onSuccess: (data) => {
      void utils.todo.listByRange.invalidate()
      void utils.todo.today.invalidate()
      void utils.record.list.invalidate()
      toast.success(`已整理 ${data.count} 项完成为当日实验记录`)
      navigate(`/records/${data.recordId}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const dayNodes: Array<{ flow: ScheduleFlow; nodeIndex: number }> = []
  let covering: { flow: ScheduleFlow; dPlus: number } | null = null
  for (const flow of flows) {
    flow.nodes.forEach((n, i) => {
      if (n.date === day) dayNodes.push({ flow, nodeIndex: i })
    })
    if (!covering && flow.nodes.length > 0) {
      const first = flow.nodes[0].date
      const last = flow.nodes[flow.nodes.length - 1].date
      if (day >= first && day <= last) covering = { flow, dPlus: diffDays(day, first) }
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <h3 className="font-display text-[18px] font-semibold text-ink">{longDayLabel(day)}</h3>
      {covering && (
        <p className="mt-0.5 font-mono text-[11.5px] text-ink-mute">
          D+{covering.dPlus} · {covering.flow.name}
        </p>
      )}

      {/* flow node cards */}
      <AnimatePresence initial={false}>
        {dayNodes.length > 0 && (
          <motion.div className="mt-3 flex flex-col gap-2">
            {dayNodes.map(({ flow, nodeIndex }) => (
              <NodeCard key={`${flow.id}:${nodeIndex}`} flow={flow} nodeIndex={nodeIndex} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* to-do checklist */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-1 flex items-baseline justify-between px-2">
          <h4 className="text-[13px] font-semibold text-ink">待办</h4>
          <span className="flex items-center gap-2">
            {summarizable > 0 && (
              <button
                type="button"
                onClick={() => summarizeMut.mutate({ date: day })}
                disabled={summarizeMut.isPending}
                title="把已完成待办整理为当日实验记录（已整理过的不会重复计入）"
                className="flex items-center gap-1 rounded-md bg-bench-wash px-2 py-0.5 text-[11.5px] font-medium text-bench-ink transition-all duration-150 hover:bg-bench-wash/70 active:scale-[0.97] disabled:opacity-50"
              >
                <FileText className="h-3 w-3" />
                整理为记录（{summarizable}）
              </button>
            )}
            <span className="font-mono text-[11px] text-ink-mute">{todos.length} 项</span>
          </span>
        </div>
        <TodoChecklist
          todos={todos}
          onToggle={onToggleTodo}
          onRemove={onRemoveTodo}
          onCreate={onCreateTodo}
          inputRef={quickAddRef}
        />
      </div>

      {/* quick actions */}
      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => quickAddRef.current?.focus()}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-[13px] font-medium text-ink-soft shadow-card transition-all duration-150 hover:-translate-y-px hover:text-ink active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> 事件
        </button>
        <button
          type="button"
          onClick={onOpenFlowModal}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-bench/30 bg-bench-wash/50 text-[13px] font-medium text-bench-ink transition-all duration-150 hover:-translate-y-px hover:bg-bench-wash active:scale-[0.97]"
        >
          <CalendarPlus className="h-4 w-4" /> 流程
        </button>
      </div>
    </div>
  )
}
