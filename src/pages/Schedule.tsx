import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import ScheduleFlowTimeline from '@/components/schedule/ScheduleFlowTimeline'
import ScheduleCalendarGrid from '@/components/schedule/ScheduleCalendarGrid'
import ScheduleWeekStrip from '@/components/schedule/ScheduleWeekStrip'
import ScheduleDayPanel from '@/components/schedule/ScheduleDayPanel'
import FlowOrchestrator from '@/components/schedule/FlowOrchestrator'
import type { FlowCreateInput } from '@/components/schedule/FlowOrchestrator'
import {
  addDaysStr,
  fmtDay,
  isDayStr,
  monthLabel,
  parseDay,
  shortDay,
  todayStr,
  viewRangeDays,
  weekStart,
} from '@/components/schedule/scheduleDateUtils'
import type { FlowNode, ScheduleFlow, ScheduleTodo } from '@/components/schedule/scheduleTypes'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function Schedule() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const utils = trpc.useUtils()

  const today = todayStr()
  const [view, setView] = useState<'month' | 'week'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
      ? 'month'
      : 'week',
  )
  const [selectedDay, setSelectedDay] = useState(today)
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = parseDay(today)
    return { year: d.getFullYear(), month0: d.getMonth() }
  })
  const [direction, setDirection] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)

  // /schedule?date=YYYY-MM-DD focuses that date (dashboard links here)
  useEffect(() => {
    const d = searchParams.get('date')
    if (d && isDayStr(d)) {
      setSelectedDay(d)
      const pd = parseDay(d)
      setMonthCursor({ year: pd.getFullYear(), month0: pd.getMonth() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rangeDays = useMemo(
    () => viewRangeDays(view, monthCursor.year, monthCursor.month0, selectedDay),
    [view, monthCursor, selectedDay],
  )
  const todoRange = useMemo(
    () => ({ from: addDaysStr(rangeDays[0], -7), to: addDaysStr(rangeDays[rangeDays.length - 1], 7) }),
    [rangeDays],
  )

  const flowsQuery = trpc.flow.list.useQuery()
  const todosQuery = trpc.todo.listByRange.useQuery(todoRange)
  const projectsQuery = trpc.project.list.useQuery()
  const protocolsQuery = trpc.protocol.list.useQuery()

  const flows = useMemo(() => flowsQuery.data ?? [], [flowsQuery.data])
  const todos = useMemo(() => todosQuery.data ?? [], [todosQuery.data])
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const protocols = useMemo(() => protocolsQuery.data ?? [], [protocolsQuery.data])

  const updateFlow = trpc.flow.update.useMutation()
  const createFlow = trpc.flow.create.useMutation()
  const createTodo = trpc.todo.create.useMutation()
  const toggleTodo = trpc.todo.toggle.useMutation()
  const removeTodo = trpc.todo.remove.useMutation()

  /* ---------------- navigation ---------------- */

  const shift = useCallback(
    (dir: number) => {
      setDirection(dir)
      if (view === 'month') {
        setMonthCursor((c) => {
          const m = c.month0 + dir
          return { year: c.year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 }
        })
      } else {
        setSelectedDay((d) => addDaysStr(d, dir * 7))
      }
    },
    [view],
  )

  const goToday = () => {
    setDirection(selectedDay <= today ? 1 : -1)
    setSelectedDay(today)
    const d = parseDay(today)
    setMonthCursor({ year: d.getFullYear(), month0: d.getMonth() })
  }

  const selectDay = useCallback(
    (day: string) => {
      setSelectedDay(day)
      if (view === 'month') {
        const m = Number(day.slice(5, 7)) - 1
        const y = Number(day.slice(0, 4))
        if (m !== monthCursor.month0 || y !== monthCursor.year) {
          setDirection(day > fmtDay(new Date(monthCursor.year, monthCursor.month0, 1)) ? 1 : -1)
          setMonthCursor({ year: y, month0: m })
        }
      }
    },
    [view, monthCursor],
  )

  const switchView = (v: 'month' | 'week') => {
    if (v === view) return
    setDirection(v === 'month' ? 1 : -1)
    // entering month view: show the month of the selected day
    const d = parseDay(selectedDay)
    setMonthCursor({ year: d.getFullYear(), month0: d.getMonth() })
    setView(v)
  }

  /* ---------------- flow mutations ---------------- */

  const commitFlowNodes = useCallback(
    (flow: ScheduleFlow, nextNodes: FlowNode[], message: string) => {
      const prevNodes = flow.nodes
      const applyLocal = (nodes: FlowNode[]) =>
        utils.flow.list.setData(undefined, (old) =>
          old?.map((f) => (f.id === flow.id ? { ...f, nodes } : f)),
        )
      applyLocal([...nextNodes].sort((a, b) => a.date.localeCompare(b.date)))
      updateFlow.mutate(
        { id: flow.id, nodes: nextNodes },
        {
          onSuccess: () => {
            utils.flow.list.invalidate()
            toast(message, {
              duration: 4000,
              action: {
                label: '撤销',
                onClick: () => {
                  applyLocal(prevNodes)
                  updateFlow.mutate(
                    { id: flow.id, nodes: prevNodes },
                    { onSuccess: () => utils.flow.list.invalidate() },
                  )
                },
              },
            })
          },
          onError: () => {
            applyLocal(prevNodes)
            toast.error('调整失败，请重试')
          },
        },
      )
    },
    [updateFlow, utils],
  )

  const handleCreateFlow = useCallback(
    async (input: FlowCreateInput) => {
      await createFlow.mutateAsync({
        name: input.name,
        color: input.color,
        projectId: input.projectId,
        protocolId: input.protocolId,
        nodes: input.nodes,
      })
      await utils.flow.list.invalidate()
      const first = input.nodes[0].date
      const last = input.nodes[input.nodes.length - 1].date
      toast(`已排期：${input.name}（${shortDay(first)} → ${shortDay(last)}）`, { duration: 4000 })
      setSelectedDay(first)
      const d = parseDay(first)
      setMonthCursor({ year: d.getFullYear(), month0: d.getMonth() })
    },
    [createFlow, utils],
  )

  const openFlow = useCallback(
    (flow: ScheduleFlow) => {
      if (flow.protocolId) navigate(`/protocols/${flow.protocolId}`)
      else if (flow.nodes.length > 0) selectDay(flow.nodes[0].date)
    },
    [navigate, selectDay],
  )

  /* ---------------- todo mutations ---------------- */

  const addTodo = useCallback(
    (day: string, text: string) => {
      createTodo.mutate(
        { todoDate: day, text },
        {
          onSuccess: () => utils.todo.listByRange.invalidate(),
          onError: () => toast.error('添加待办失败'),
        },
      )
    },
    [createTodo, utils],
  )

  const handleToggleTodo = useCallback(
    (todo: ScheduleTodo) => {
      if (!todo.done) {
        try {
          navigator.vibrate?.(10)
        } catch {
          /* optional haptics */
        }
      }
      utils.todo.listByRange.setData(todoRange, (old) =>
        old?.map((t) => (t.id === todo.id ? { ...t, done: !todo.done } : t)),
      )
      toggleTodo.mutate(
        { id: todo.id, done: !todo.done },
        {
          onSuccess: () => utils.todo.listByRange.invalidate(),
          onError: () => {
            utils.todo.listByRange.invalidate()
            toast.error('更新待办失败')
          },
        },
      )
    },
    [toggleTodo, utils, todoRange],
  )

  const handleRemoveTodo = useCallback(
    (todo: ScheduleTodo) => {
      utils.todo.listByRange.setData(todoRange, (old) => old?.filter((t) => t.id !== todo.id))
      removeTodo.mutate(
        { id: todo.id },
        {
          onSuccess: () => utils.todo.listByRange.invalidate(),
          onError: () => {
            utils.todo.listByRange.invalidate()
            toast.error('删除待办失败')
          },
        },
      )
    },
    [removeTodo, utils, todoRange],
  )

  /* ---------------- derived ---------------- */

  const animKey = `${view}:${view === 'month' ? `${monthCursor.year}-${monthCursor.month0}` : weekStart(selectedDay)}`
  const selectedTodos = useMemo(() => todos.filter((t) => t.todoDate === selectedDay), [todos, selectedDay])
  const navLabel =
    view === 'month'
      ? monthLabel(monthCursor.year, monthCursor.month0)
      : `${shortDay(weekStart(selectedDay))} → ${shortDay(addDaysStr(weekStart(selectedDay), 6))}`

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Toaster
        position="top-right"
        gap={8}
        toastOptions={{
          style: {
            background: '#FFFFFF',
            border: '1px solid #E9E6DF',
            color: '#21252B',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(33,37,43,0.12)',
          },
        }}
      />

      {/* 区块1 — 页头 */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-display text-[24px] font-bold leading-8 text-ink md:text-[30px] md:leading-[38px]">
            {'实验安排'.split('').map((c, i) => (
              <motion.span
                key={c + i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: i * 0.05 }}
                className="inline-block"
              >
                {c}
              </motion.span>
            ))}
          </h1>
          <p className="caption-en mt-1">Schedule</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* view pill with layoutId slider */}
          <div className="flex rounded-full border border-line bg-surface p-0.5 shadow-card">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={cn(
                  'relative h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150',
                  view === v ? 'text-bench-ink' : 'text-ink-mute hover:text-ink-soft',
                )}
              >
                {view === v && (
                  <motion.span
                    layoutId="schedule-view-pill"
                    className="absolute inset-0 rounded-full bg-bench-wash"
                    transition={{ duration: 0.24, ease: EASE }}
                  />
                )}
                <span className="relative">{v === 'month' ? '月' : '周'}</span>
              </button>
            ))}
          </div>

          {/* month / week navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="上一页"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7.5rem] text-center font-display text-[16px] font-semibold text-ink md:text-[18px]">
              {navLabel}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="下一页"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToday}
            className="h-8 rounded-lg px-2 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-bench"
          >
            今天
          </button>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-bench px-3.5 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] md:flex"
          >
            <CalendarPlus className="h-4 w-4" /> 安排实验
          </button>
        </div>
      </header>

      {/* 区块2 — 进行中的流程 */}
      <ScheduleFlowTimeline
        flows={flows}
        protocols={protocols}
        rangeDays={rangeDays}
        loading={flowsQuery.isLoading}
        onCommit={commitFlowNodes}
        onSelectDay={selectDay}
        onOpenFlow={openFlow}
      />

      {/* 区块3 + 区块4 */}
      <div className="mt-6 flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="hidden md:block">
            <ScheduleCalendarGrid
              view={view}
              year={monthCursor.year}
              month0={monthCursor.month0}
              cursorDay={selectedDay}
              animKey={animKey}
              direction={direction}
              selectedDay={selectedDay}
              flows={flows}
              todos={todos}
              onSelectDay={selectDay}
              onCreateTodo={addTodo}
            />
          </div>
          <div className="md:hidden">
            {view === 'week' ? (
              <ScheduleWeekStrip
                cursorDay={selectedDay}
                selectedDay={selectedDay}
                flows={flows}
                todos={todos}
                onSelectDay={selectDay}
                onShiftWeek={(d) => {
                  setDirection(d)
                  setSelectedDay((day) => addDaysStr(day, d * 7))
                }}
              />
            ) : (
              <ScheduleCalendarGrid
                view="month"
                year={monthCursor.year}
                month0={monthCursor.month0}
                cursorDay={selectedDay}
                animKey={animKey}
                direction={direction}
                selectedDay={selectedDay}
                flows={flows}
                todos={todos}
                compact
                onSelectDay={selectDay}
                onCreateTodo={addTodo}
              />
            )}
          </div>
        </div>

        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-20">
            <ScheduleDayPanel
              day={selectedDay}
              flows={flows}
              todos={selectedTodos}
              onToggleTodo={handleToggleTodo}
              onRemoveTodo={handleRemoveTodo}
              onCreateTodo={(text) => addTodo(selectedDay, text)}
              onOpenFlowModal={() => setModalOpen(true)}
            />
          </div>
        </aside>
      </div>

      {/* mobile / tablet agenda below the calendar */}
      <div className="mt-4 lg:hidden">
        <ScheduleDayPanel
          day={selectedDay}
          flows={flows}
          todos={selectedTodos}
          onToggleTodo={handleToggleTodo}
          onRemoveTodo={handleRemoveTodo}
          onCreateTodo={(text) => addTodo(selectedDay, text)}
          onOpenFlowModal={() => setModalOpen(true)}
        />
      </div>

      {/* 区块5 — 流程编排弹窗 */}
      <FlowOrchestrator
        open={modalOpen}
        initialDay={selectedDay}
        flows={flows}
        projects={projects}
        protocols={protocols}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateFlow}
      />

      {/* mobile FAB */}
      <button
        type="button"
        aria-label="安排实验"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-bench text-white shadow-overlay transition-transform duration-150 active:scale-95 md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  )
}
