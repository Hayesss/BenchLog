import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'

type DayCell = { date: string; records: number; protocolsUsed: number; logins: number }

/** 色阶：台绿五档（0 为空） */
const CELL_COLORS = ['#EDEBE4', '#C9DDD3', '#93BFAE', '#5E9C85', '#3E7C6B']

function levelOf(score: number): number {
  if (score <= 0) return 0
  if (score <= 2) return 1
  if (score <= 4) return 2
  if (score <= 7) return 3
  return 4
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 53 周 × 7 天（周一在上），未来日期以 future 标记 */
function buildWeeks(dayMap: Map<string, DayCell>) {
  const today = new Date()
  const dow = (today.getDay() + 6) % 7 // 周一 = 0
  const start = new Date(today)
  start.setDate(start.getDate() - dow - 52 * 7)
  const weeks: { date: string; data?: DayCell; future: boolean }[][] = []
  for (let w = 0; w < 53; w++) {
    const col: { date: string; data?: DayCell; future: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start)
      cur.setDate(start.getDate() + w * 7 + d)
      const s = fmt(cur)
      col.push({ date: s, data: dayMap.get(s), future: cur > today })
    }
    weeks.push(col)
  }
  return weeks
}

function tooltipOf(date: string, data?: DayCell): string {
  const [, m, d] = date.split('-')
  const head = `${Number(m)}月${Number(d)}日`
  if (!data || (data.records === 0 && data.protocolsUsed === 0 && data.logins === 0)) return `${head} · 无活动`
  const parts = [`${head}`]
  if (data.records > 0) parts.push(`${data.records} 条记录`)
  if (data.protocolsUsed > 0) parts.push(`使用协议 ${data.protocolsUsed} 次`)
  if (data.logins > 0) parts.push('已登录')
  return parts.join(' · ')
}

/** 区块：实验活跃度日历（GitHub contributions 风格，trpc.activity.yearly） */
export default function ActivityCalendar() {
  const q = trpc.activity.yearly.useQuery()

  const dayMap = useMemo(() => {
    const m = new Map<string, DayCell>()
    for (const d of q.data?.days ?? []) m.set(d.date, d)
    return m
  }, [q.data])

  const weeks = useMemo(() => buildWeeks(dayMap), [dayMap])
  const todayStr = fmt(new Date())

  /** 月份标签：该列首日月份与前一列不同则显示 */
  const monthLabels = useMemo(() => {
    return weeks.map((col, i) => {
      const m = Number(col[0].date.split('-')[1])
      const prev = i > 0 ? Number(weeks[i - 1][0].date.split('-')[1]) : null
      return m !== prev ? `${m}月` : ''
    })
  }, [weeks])

  const streak = q.data?.streak ?? 0
  const totalActiveDays = q.data?.totalActiveDays ?? 0
  const totalRecords = q.data?.totalRecords ?? 0
  const totalProtocolsUsed = q.data?.totalProtocolsUsed ?? 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-line bg-surface p-5 shadow-card"
    >
      {/* 头部：标题 + 统计 */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-semibold leading-[26px] text-ink md:text-[20px] md:leading-[28px]">
            实验活跃度
          </h2>
          <p className="caption-en mt-0.5">Activity · Last 12 Months</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-soft">
          <span className="flex items-center gap-1 font-medium text-bench">
            <Flame className="h-3.5 w-3.5" strokeWidth={2} />
            连续活跃 {streak} 天
          </span>
          <span>
            近一年活跃 <b className="font-medium text-ink">{totalActiveDays}</b> 天
          </span>
          <span>
            记录 <b className="font-medium text-ink">{totalRecords}</b> 条
          </span>
          <span>
            使用协议 <b className="font-medium text-ink">{totalProtocolsUsed}</b> 次
          </span>
        </div>
      </div>

      {/* 格子区：移动端可横向滚动 */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-[760px]">
          {/* 月份标签行 */}
          <div className="mb-1 flex" style={{ paddingLeft: 22 }}>
            {monthLabels.map((label, i) => (
              <span key={i} className="w-[13px] shrink-0 text-left font-mono text-[10px] text-ink-mute">
                {label}
              </span>
            ))}
          </div>
          <div className="flex">
            {/* 星期标签列 */}
            <div className="mr-1.5 flex w-[14px] shrink-0 flex-col">
              {['一', '', '三', '', '五', '', '日'].map((d, i) => (
                <span key={i} className="flex h-[13px] items-center text-[9.5px] leading-none text-ink-mute">
                  {d}
                </span>
              ))}
            </div>
            {/* 53 列格子 */}
            {weeks.map((col, wi) => (
              <div key={wi} className="flex w-[13px] shrink-0 flex-col">
                {col.map((cell) => {
                  if (cell.future) return <span key={cell.date} className="m-[1px] h-[11px] w-[11px]" />
                  const score = (cell.data?.records ?? 0) + (cell.data?.protocolsUsed ?? 0)
                  const isToday = cell.date === todayStr
                  return (
                    <span
                      key={cell.date}
                      title={tooltipOf(cell.date, cell.data)}
                      className={cn(
                        'm-[1px] h-[11px] w-[11px] rounded-[2.5px] transition-transform duration-100 hover:scale-125',
                        isToday && 'ring-1 ring-bench ring-offset-1',
                      )}
                      style={{ backgroundColor: CELL_COLORS[levelOf(score)] }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          {/* 图例 */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[10.5px] text-ink-mute">
            少
            {CELL_COLORS.map((c) => (
              <span key={c} className="h-[10px] w-[10px] rounded-[2.5px]" style={{ backgroundColor: c }} />
            ))}
            多
          </div>
        </div>
      </div>
    </motion.section>
  )
}
