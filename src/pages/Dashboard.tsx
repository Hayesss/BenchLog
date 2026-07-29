import { memo, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { format, addDays, startOfWeek, differenceInCalendarDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronDown,
  FlaskConical,
  NotebookPen,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../api/router'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ------------------------------- live data types ------------------------------ */

type RouterOutputs = inferRouterOutputs<AppRouter>
type TodoRow = RouterOutputs['todo']['listByRange'][number]
type FlowRow = RouterOutputs['flow']['list'][number]
type RecordRow = RouterOutputs['record']['list'][number]
type ProtocolRow = RouterOutputs['protocol']['list'][number]

type Todo = { id: number; text: string; link?: string; source: 'schedule' | 'manual'; done: boolean }

/** 'YYYY-MM-DD' → local Date（避免 toISOString 时区坑） */
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toTodo(t: TodoRow): Todo {
  return { id: t.id, text: t.text, source: t.recordId ? 'schedule' : 'manual', done: t.done }
}

const STATUS_META = {
  ongoing: { label: '进行中', color: 'info' },
  done: { label: '已完成', color: 'success' },
  failed: { label: '失败重复', color: 'danger' },
} as const

/* ------------------------------- micro components ------------------------------ */

/** 逐字浮入标题（design.md §区块1） */
function GreetingTitle({ text }: { text: string }) {
  return (
    <h1 className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[38px]">
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          className="inline-block"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: i * 0.02, ease: EASE }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </h1>
  )
}

/** 今日竖线脉冲 — perpetual animation isolated + memoized (react-dev perf rule) */
const TodayPulse = memo(function TodayPulse() {
  return (
    <motion.span
      className="absolute top-0 h-full w-[2px] rounded-full bg-bench"
      animate={{ opacity: [1, 0.4, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
})

/** StepCheckbox（design.md §8.3 + §6 打勾微动效） */
function StepCheckbox({ todo, onToggle }: { todo: Todo; onToggle: (id: number) => void }) {
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={() => onToggle(todo.id)}
      className="group flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-bench-wash/50 md:min-h-[44px]"
    >
      {/* checkbox */}
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200',
          todo.done ? 'border-bench bg-bench' : 'border-line-strong bg-surface group-hover:border-bench',
        )}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <motion.path
            d="M 2.2 6.2 L 4.8 8.6 L 9.8 3.4"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: todo.done ? 1 : 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          />
        </svg>
      </span>
      {/* source dot：日程 info / 手动 mute */}
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', todo.source === 'schedule' ? 'bg-info' : 'bg-ink-mute')}
      />
      {/* text with animated strikethrough */}
      <span className="relative min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[14px] transition-colors duration-200',
            todo.done ? 'text-ink-mute' : 'text-ink',
          )}
        >
          {todo.text}
          {todo.link && <span className="ml-1.5 text-[12px] text-ink-mute">· 关联：{todo.link}</span>}
        </span>
        <motion.span
          className="absolute left-0 top-1/2 h-px w-full origin-left bg-ink-mute/60"
          initial={false}
          animate={{ scaleX: todo.done ? 1 : 0 }}
          transition={{ duration: 0.25, ease: EASE }}
        />
      </span>
      {todo.source === 'schedule' && (
        <span className="shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">日程</span>
      )}
    </motion.button>
  )
}

/* ---------------------------------- sections ---------------------------------- */

function TodoCard({
  rows,
  onToggle,
  onAdd,
}: {
  rows: TodoRow[]
  onToggle: (id: number, done: boolean) => void
  onAdd: (text: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(true)

  const todos = rows.map(toTodo)
  const pending = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)

  const toggle = (id: number) => {
    const row = rows.find((r) => r.id === id)
    if (row) onToggle(id, !row.done)
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">今日待办</h3>
        <span className="font-mono text-[12px] text-ink-mute">
          {done.length}/{todos.length}
        </span>
      </div>
      <div className="mb-3 h-[2px] overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full bg-bench"
          initial={false}
          animate={{ width: `${(done.length / Math.max(todos.length, 1)) * 100}%` }}
          transition={{ duration: 0.3, ease: EASE }}
        />
      </div>

      <motion.ul
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="flex flex-col"
      >
        <AnimatePresence initial={false}>
          {pending.map((t) => (
            <motion.li
              key={t.id}
              layout="position"
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.25, delay: 0.15 } }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <StepCheckbox todo={t} onToggle={toggle} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {/* inline quick add */}
      {adding ? (
        <div className="mt-1 flex min-h-[44px] items-center gap-3 px-2">
          <span className="h-5 w-5 shrink-0 rounded-md border border-dashed border-line-strong" />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
            onBlur={() => {
              add()
              setAdding(false)
            }}
            placeholder="输入待办，Enter 保存"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mute"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 text-[13px] text-ink-mute transition-colors duration-150 hover:bg-bench-wash/50 hover:text-bench"
        >
          <Plus className="h-4 w-4" />
          添加待办
        </button>
      )}

      {/* completed collapse */}
      {done.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[12px] text-ink-mute hover:text-ink-soft"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-250', !showDone && '-rotate-90')} />
            已完成 {done.length}
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="overflow-hidden"
              >
                {done.map((t) => (
                  <li key={t.id}>
                    <StepCheckbox todo={t} onToggle={toggle} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

/** 区块 3：进行中实验 · 横向微型甘特（本周视图，数据来自 trpc.flow.list） */
function FlowsCard({ flows }: { flows: FlowRow[] }) {
  const today = useMemo(() => new Date(), [])
  const mon = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const todayCol = differenceInCalendarDays(today, mon)

  const items = useMemo(() => {
    const weekEnd = addDays(mon, 6)
    return flows
      .filter((f) => f.nodes.length > 0)
      .map((f) => {
        const first = parseDateStr(f.nodes[0].date)
        const last = parseDateStr(f.nodes[f.nodes.length - 1].date)
        if (last < mon || first > weekEnd) return null
        const span: [number, number] = [
          Math.max(0, differenceInCalendarDays(first, mon)),
          Math.min(6, differenceInCalendarDays(last, mon)),
        ]
        const dayNode = new Map<number, { label: string; done: boolean; today: boolean }>()
        for (const n of f.nodes) {
          const idx = differenceInCalendarDays(parseDateStr(n.date), mon)
          if (idx < 0 || idx > 6) continue
          const rel = differenceInCalendarDays(parseDateStr(n.date), today)
          dayNode.set(idx, { label: n.name, done: rel < 0, today: rel === 0 })
        }
        const nodes = Array.from({ length: 7 }, (_, i) => dayNode.get(i))
        const dSinceStart = differenceInCalendarDays(today, first)
        const badge = dSinceStart >= 0 ? `D+${dSinceStart}` : `D${dSinceStart}`
        return {
          id: f.id,
          name: f.name,
          color: f.project?.color || f.color,
          span,
          nodes,
          badge,
          chain: f.nodes.map((n) => n.name).join(' → '),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 3)
  }, [flows, mon, today])

  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">进行中的实验</h3>
        <Link to="/schedule" className="text-[12.5px] text-bench hover:text-bench-deep">
          查看安排 →
        </Link>
      </div>
      {/* weekday header */}
      <div className="mb-2 grid grid-cols-7 pl-1 font-mono text-[10.5px] text-ink-mute">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[13px] text-ink-mute">本周没有进行中的跨天流程</p>
          <Link
            to="/schedule"
            className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
          >
            去安排一个实验流程
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((f, fi) => (
            <div key={f.id} className="group">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0 text-[13px] font-medium text-ink">{f.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">{f.badge}</span>
                  <Link
                    to="/schedule"
                    className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
                  >
                    查看流程
                  </Link>
                </span>
              </div>
              {/* gantt bar */}
              <div className="relative grid h-7 grid-cols-7 items-center px-1">
                <motion.div
                  className="absolute h-4 rounded-md border-l-2"
                  style={{
                    left: `calc(${(f.span[0] / 7) * 100}% + 4px)`,
                    width: `calc(${((f.span[1] - f.span[0] + 1) / 7) * 100}% - 8px)`,
                    backgroundColor: `${f.color}26`,
                    borderColor: f.color,
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: fi * 0.1, ease: EASE }}
                  whileHover={{ backgroundColor: `${f.color}40` }}
                  title={f.chain}
                />
                {/* node dots */}
                <div className="relative col-span-7 flex justify-between px-2">
                  {Array.from({ length: 7 }).map((_, day) => {
                    const node = f.nodes[day]
                    if (!node) return <span key={day} />
                    return (
                      <motion.span
                        key={day}
                        className={cn(
                          'h-2.5 w-2.5 rounded-full border-2',
                          node.done ? 'border-transparent' : 'bg-surface',
                        )}
                        style={{
                          backgroundColor: node.done ? f.color : undefined,
                          borderColor: node.done ? undefined : f.color,
                        }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.3 + fi * 0.1 + day * 0.05 }}
                        title={`${node.label}${node.done ? ' ✓' : node.today ? '（今天）' : ''}`}
                      />
                    )
                  })}
                </div>
                {/* today marker */}
                <div
                  className="pointer-events-none absolute top-0 h-full"
                  style={{ left: `calc(${((todayCol + 0.5) / 7) * 100}%)` }}
                >
                  <TodayPulse />
                </div>
              </div>
              {/* node legend */}
              <p className="mt-1 pl-1 text-[11.5px] text-ink-mute">
                {f.nodes
                  .filter((n): n is NonNullable<typeof n> => !!n)
                  .map((n) => `${n.label} ${n.done ? '✓' : n.today ? '○（今天）' : '○'}`)
                  .join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** 区块 4：快捷新建 */
function QuickCreate() {
  const items = [
    { label: '新建记录', icon: NotebookPen, to: '/records/new' },
    { label: '新建协议', icon: FlaskConical, to: '/protocols' },
    { label: '安排实验', icon: CalendarDays, to: '/schedule' },
    { label: '拍照上传', icon: Camera, to: '/records/new' },
  ]
  return (
    <section className="grid grid-cols-2 gap-3">
      {items.map(({ label, icon: Icon, to }) => (
        <Link
          key={label}
          to={to}
          className="group flex h-28 flex-col items-center justify-center gap-2.5 rounded-lg border border-line bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-bench-wash">
            <Icon className="h-5 w-5 text-ink-soft transition-colors duration-200 group-hover:text-bench" strokeWidth={1.8} />
          </span>
          <span className="text-[13px] font-medium text-ink">{label}</span>
        </Link>
      ))}
    </section>
  )
}

/** 区块 5：本周概览迷你日历（事件点来自真实流程节点与待办） */
function WeekMini({ flows, weekTodos }: { flows: FlowRow[]; weekTodos: TodoRow[] }) {
  const navigate = useNavigate()
  const days = useMemo(() => {
    const mon = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }, [])
  const today = new Date()
  const dots = useMemo(() => {
    const map: Record<number, string[]> = {}
    const push = (dateStr: string, color: string) => {
      const idx = differenceInCalendarDays(parseDateStr(dateStr), days[0])
      if (idx < 0 || idx > 6) return
      map[idx] = map[idx] ?? []
      if (!map[idx].includes(color)) map[idx].push(color)
    }
    for (const f of flows) {
      const color = f.project?.color || f.color
      for (const n of f.nodes) push(n.date, color)
    }
    for (const t of weekTodos) push(t.todoDate, '#8A9099')
    return map
  }, [flows, weekTodos, days])

  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">本周概览</h3>
        <Link to="/schedule" className="text-[12.5px] text-bench hover:text-bench-deep">
          日历 →
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <span key={d} className="pb-1 text-center text-[10.5px] text-ink-mute">
            {d}
          </span>
        ))}
        {days.map((day, i) => {
          const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => navigate(`/schedule?date=${format(day, 'yyyy-MM-dd')}`)}
              className="group flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors duration-150 hover:bg-bench-wash/60"
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-mono text-[13px]',
                  isToday ? 'bg-bench font-medium text-white' : 'text-ink-soft',
                )}
              >
                {format(day, 'd')}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {(dots[i] ?? []).slice(0, 3).map((c, di) => (
                  <motion.span
                    key={c + di}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4 + (i * 3 + di) * 0.03, type: 'spring', stiffness: 400, damping: 18 }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** 区块 6：最近实验记录（trpc.record.list 最新 3 条） */
function RecentRecords({ records }: { records: RecordRow[] }) {
  const items = records.slice(0, 3)
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-[18px] font-semibold leading-[26px] text-ink md:text-[20px] md:leading-[28px]">
            最近实验记录
          </h2>
          <p className="caption-en mt-0.5">Recent Records</p>
        </div>
        <Link to="/records" className="text-[12.5px] text-bench hover:text-bench-deep">
          全部记录 →
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface py-10 shadow-card">
          <p className="text-[13px] text-ink-mute">还没有实验记录</p>
          <Link
            to="/records/new"
            className="rounded-lg bg-bench px-4 py-2 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep"
          >
            写下第一条记录
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {items.map((r, i) => {
            const color = r.project?.color ?? '#8A9099'
            const meta = STATUS_META[r.status]
            const proto = r.protocol
              ? `${r.protocol.name}${r.protocolVersion ? ` ${r.protocolVersion}` : ''}`
              : '自由记录'
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: i * 0.06, ease: EASE }}
              >
                <Link
                  to={`/records/${r.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <span className="h-[3px] w-full" style={{ backgroundColor: color }} />
                  <div className="flex flex-1 gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[16px] font-semibold leading-snug text-ink transition-colors duration-150 group-hover:text-bench">
                        {r.title}
                      </h3>
                      <p className="mt-1.5 font-mono text-[12px] text-ink-mute">
                        {format(parseDateStr(r.recordDate), 'M月d日')} · {proto}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full px-2 py-0.5 text-[12.5px]"
                            style={{ backgroundColor: `${color}1F`, color }}
                          >
                            #{t}
                          </span>
                        ))}
                        <span
                          className={cn(
                            'ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-medium',
                            meta.color === 'info' && 'bg-info/10 text-info',
                            meta.color === 'success' && 'bg-success/10 text-success',
                            meta.color === 'danger' && 'bg-danger/10 text-danger',
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** 区块 7：常用协议（按使用次数排序，trpc.protocol.list） */
function FrequentProtocols({ protocols }: { protocols: ProtocolRow[] }) {
  const items = useMemo(
    () => [...protocols].sort((a, b) => b.useCount - a.useCount).slice(0, 4),
    [protocols],
  )
  if (items.length === 0) return null
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-[18px] font-semibold leading-[26px] text-ink md:text-[20px] md:leading-[28px]">
          常用协议
        </h2>
        <p className="caption-en mt-0.5">Frequent Protocols</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {items.map((p) => (
          <Link
            key={p.id}
            to={`/protocols/${p.id}`}
            className="group flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${p.color}1F` }}
            >
              <FlaskConical className="h-5 w-5" style={{ color: p.color }} strokeWidth={1.8} />
            </span>
            <span className="font-display text-[15px] font-semibold leading-snug text-ink">{p.name}</span>
            <span className="font-mono text-[11.5px] text-ink-mute">
              {p.version} · 使用 {p.useCount} 次
            </span>
          </Link>
        ))}
        <Link
          to="/protocols"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-4 text-ink-mute transition-colors duration-200 hover:border-bench hover:text-bench"
        >
          <span className="text-[13px] font-medium">浏览全部协议</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

/* ------------------------------------ page ------------------------------------ */

export default function Dashboard() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好，博士' : hour < 18 ? '下午好，博士' : '晚上好，博士'

  const today = useMemo(() => new Date(), [])
  const todayStr = format(today, 'yyyy-MM-dd')
  const mon = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekFrom = format(mon, 'yyyy-MM-dd')
  const weekTo = format(addDays(mon, 6), 'yyyy-MM-dd')

  const utils = trpc.useUtils()
  const todosQ = trpc.todo.listByRange.useQuery({ from: todayStr, to: todayStr })
  const weekTodosQ = trpc.todo.listByRange.useQuery({ from: weekFrom, to: weekTo })
  const flowsQ = trpc.flow.list.useQuery()
  const recordsQ = trpc.record.list.useQuery()
  const protocolsQ = trpc.protocol.list.useQuery()

  const invalidateTodos = () => {
    void utils.todo.listByRange.invalidate()
  }
  const toggleTodo = trpc.todo.toggle.useMutation({ onSuccess: invalidateTodos })
  const createTodo = trpc.todo.create.useMutation({ onSuccess: invalidateTodos })

  const todayTodos = todosQ.data ?? []
  const flows = flowsQ.data ?? []
  const pendingCount = todayTodos.filter((t) => !t.done).length
  const activeFlowCount = flows.filter(
    (f) =>
      f.nodes.length > 0 &&
      parseDateStr(f.nodes[0].date) <= today &&
      parseDateStr(f.nodes[f.nodes.length - 1].date) >= today,
  ).length

  const dateLine =
    todosQ.isLoading || flowsQ.isLoading
      ? `今天是 ${format(today, 'M 月 d 日 EEEE', { locale: zhCN })}`
      : `今天是 ${format(today, 'M 月 d 日 EEEE', { locale: zhCN })} · 你有 ${pendingCount} 项待办，${activeFlowCount} 个实验进行中`

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8">
      {/* 区块 1：问候区 */}
      <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <GreetingTitle text={greeting} />
          <motion.p
            className="mt-2 text-[14px] text-ink-soft"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            {dateLine}
          </motion.p>
          <motion.span
            className="mt-3 block h-[2px] w-12 origin-left rounded-full bg-bench"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
          />
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.25 }}>
          <Link
            to="/records/new"
            className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[14px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            开始记录
          </Link>
        </motion.div>
      </section>

      {/* 区块 2-5：左 2/3 + 右 1/3 */}
      <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <TodoCard
            rows={todayTodos}
            onToggle={(id, done) => toggleTodo.mutate({ id, done })}
            onAdd={(text) => createTodo.mutate({ todoDate: todayStr, text })}
          />
          <FlowsCard flows={flows} />
        </div>
        <div className="flex flex-col gap-4">
          <QuickCreate />
          <WeekMini flows={flows} weekTodos={weekTodosQ.data ?? []} />
        </div>
      </div>

      <div className="flex flex-col gap-10">
        <RecentRecords records={recordsQ.data ?? []} />
        <FrequentProtocols protocols={protocolsQ.data ?? []} />
      </div>
    </div>
  )
}
