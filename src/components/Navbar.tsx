import { Link, useLocation } from 'react-router'
import { format } from 'date-fns'
import { Bell, CalendarCheck2, ChevronRight, LogOut, Plus, Search, SquareCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { openCommandPalette } from '@/components/CommandPalette'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { trpc } from '@/providers/trpc'

const ROUTE_LABELS: Array<[RegExp, string[]]> = [
  [/^\/$/, ['工作台']],
  [/^\/protocols\/[^/]+/, ['实验方法', '方法详情']],
  [/^\/protocols/, ['实验方法']],
  [/^\/records\/new/, ['湿实验记录', '新建记录']],
  [/^\/records\/[^/]+/, ['湿实验记录', '记录详情']],
  [/^\/records/, ['湿实验记录']],
  [/^\/projects/, ['项目管理']],
  [/^\/bioinfo\/[^/]+/, ['生信分析', '分析详情']],
  [/^\/bioinfo/, ['生信分析']],
  [/^\/schedule/, ['实验安排']],
  [/^\/library\/[^/]+/, ['方法库', '条目详情']],
  [/^\/library/, ['方法库']],
  [/^\/guide/, ['学习指南']],
  [/^\/export/, ['汇报导出']],
  [/^\/trash/, ['最近删除']],
  [/^\/inbox/, ['收集箱']],
]

function useBreadcrumb(): string[] {
  const { pathname } = useLocation()
  for (const [re, labels] of ROUTE_LABELS) {
    if (re.test(pathname)) return labels
  }
  return ['工作台']
}

/**
 * Desktop TopBar (design.md §8.1): 56px, breadcrumb · ⌘K global search ·
 * new / notifications / user. Sticky in normal document flow — no offset
 * bookkeeping required from pages.
 */
export default function Navbar() {
  const crumbs = useBreadcrumb()
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  // 今日议程（铃铛红点）：客户端本地日期，避免时区偏差
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const agendaQ = trpc.todo.today.useQuery({ date: todayStr }, { enabled: isAuthenticated })
  const agendaTodos = agendaQ.data?.todos ?? []
  const agendaNodes = agendaQ.data?.flowNodes ?? []
  const agendaCount = agendaTodos.length + agendaNodes.length

  return (
    <header className="sticky top-0 z-50 hidden h-14 items-center gap-4 border-b border-line bg-paper/90 px-6 backdrop-blur md:flex">
      {/* breadcrumb */}
      <nav className="flex min-w-0 items-center text-[12.5px] text-ink-mute" aria-label="breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c} className="flex items-center">
            {i > 0 && <ChevronRight className="mx-1 h-3.5 w-3.5" />}
            <span className={i === crumbs.length - 1 ? 'font-medium text-ink' : ''}>{c}</span>
          </span>
        ))}
      </nav>

      {/* global search (⌘K) */}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex h-9 w-[380px] max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-[12.5px] text-ink-mute shadow-card transition-colors duration-150 hover:border-line-strong"
          aria-label="全局搜索"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">搜索货号、细胞系、标签…</span>
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-mute">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* right cluster */}
      <div className="flex items-center gap-3">
        <Link
          to="/records/new"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-3 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          新建
        </Link>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
              aria-label={agendaCount > 0 ? `今日议程，${agendaCount} 项待办` : '今日议程'}
            >
              <Bell className="h-4 w-4" />
              {agendaCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-semibold text-white">
                  {agendaCount > 99 ? '99+' : agendaCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] rounded-xl border-line p-0">
            <div className="border-b border-line px-4 py-2.5">
              <p className="text-[13px] font-medium text-ink">今日议程</p>
              <p className="caption-en mt-0.5">{format(new Date(), 'yyyy-MM-dd')} TODAY</p>
            </div>
            <div className="max-h-[320px] overflow-y-auto px-2 py-2">
              {agendaCount === 0 ? (
                <p className="px-2 py-6 text-center text-[12.5px] text-ink-mute">
                  今天没有到期的流程节点或待办
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {agendaNodes.map((n, i) => (
                    <Link
                      key={`f-${n.flowId}-${i}`}
                      to="/schedule"
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-bench-wash/60"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: n.color }} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {n.flowName} · {n.name}
                      </span>
                      <CalendarCheck2 className="h-3.5 w-3.5 shrink-0 text-info" />
                    </Link>
                  ))}
                  {agendaTodos.map((t) => (
                    <Link
                      key={`t-${t.id}`}
                      to="/schedule"
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-bench-wash/60"
                    >
                      <SquareCheck className="h-3.5 w-3.5 shrink-0 text-bench" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{t.text}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-line px-4 py-2">
              <Link to="/schedule" className="text-[12px] font-medium text-bench hover:underline">
                查看实验安排 →
              </Link>
            </div>
          </PopoverContent>
        </Popover>
        {isLoading ? (
          <div className="h-9 w-20 animate-pulse rounded-lg border border-line bg-surface" />
        ) : isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 shadow-card">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <img src="/avatar-user.png" alt="" className="h-5 w-5 rounded-full" />
              )}
              <span className="max-w-[120px] truncate text-[13px] font-medium text-ink">
                {user.name ?? '研究者'}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="退出登录"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            to={LOGIN_PATH}
            className="flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:text-bench"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
