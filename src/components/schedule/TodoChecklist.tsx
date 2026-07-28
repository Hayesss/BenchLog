import { useState } from 'react'
import type { RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScheduleTodo } from './scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Animated checkbox per design.md §6 打勾微动效:
 * fill 200ms -> SVG check stroke-draw 220ms -> text fades to ink-mute with a
 * left-to-right strikethrough line (250ms) -> subtle scale bounce.
 */
function TodoRow({
  todo,
  onToggle,
  onRemove,
}: {
  todo: ScheduleTodo
  onToggle: (todo: ScheduleTodo) => void
  onRemove: (todo: ScheduleTodo) => void
}) {
  const done = todo.done
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: done ? 0.995 : 1 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }}
      transition={{ duration: 0.24, ease: EASE }}
      className="group relative flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors duration-150 hover:bg-paper"
    >
      <button
        type="button"
        onClick={() => onToggle(todo)}
        aria-label={done ? '标记为未完成' : '标记为完成'}
        aria-pressed={done}
        className="flex min-h-11 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200',
            done ? 'border-bench bg-bench' : 'border-line-strong bg-surface group-hover:border-bench/60',
          )}
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <motion.path
              d="M4.5 10.5l3.5 3.5 7.5-8.5"
              stroke="#fff"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            />
          </svg>
        </span>
        <span className="relative min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[14px] leading-[22px] transition-colors duration-200',
              done ? 'text-ink-mute' : 'text-ink',
            )}
          >
            {todo.text}
          </span>
          {/* strikethrough line, left-to-right 250ms */}
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-px w-full bg-ink-mute/60"
            initial={false}
            animate={{ scaleX: done ? 1 : 0, opacity: done ? 0.6 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ transformOrigin: 'left center' }}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRemove(todo)}
        aria-label="删除待办"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute opacity-0 transition-all duration-150 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

/**
 * StepCheckbox-style to-do checklist (design.md §8.3 + schedule.md 区块4):
 * 44px rows, whole row clickable, quick-add input commits on Enter.
 */
export default function TodoChecklist({
  todos,
  onToggle,
  onRemove,
  onCreate,
  compact = false,
  inputRef,
}: {
  todos: ScheduleTodo[]
  onToggle: (todo: ScheduleTodo) => void
  onRemove: (todo: ScheduleTodo) => void
  onCreate: (text: string) => void
  compact?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const [draft, setDraft] = useState('')
  const doneCount = todos.filter((t) => t.done).length

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onCreate(text)
    setDraft('')
  }

  return (
    <div>
      {/* progress hairline (design.md §8.3) */}
      {todos.length > 0 && (
        <div className="mb-2 px-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-mute">
              {doneCount}/{todos.length} 已完成
            </span>
          </div>
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-bench"
              initial={false}
              animate={{ width: `${todos.length ? (doneCount / todos.length) * 100 : 0}%` }}
              transition={{ duration: 0.3, ease: EASE }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </AnimatePresence>
      </div>

      {todos.length === 0 && (
        <p className="px-2 py-3 text-[12.5px] text-ink-mute">
          {compact ? '当日暂无待办' : '这一天还没有待办，添加第一条吧'}
        </p>
      )}

      {/* quick add — Enter 落库 */}
      <div className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors duration-150 focus-within:bg-paper">
        <Plus className="h-4 w-4 shrink-0 text-ink-mute" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="添加待办，Enter 保存"
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mute"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={submit}
            className="shrink-0 rounded-md bg-bench px-2.5 py-1 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep active:scale-[0.97]"
          >
            添加
          </button>
        )}
      </div>
    </div>
  )
}
