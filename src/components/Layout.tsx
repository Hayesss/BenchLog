import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import Lenis from 'lenis'
import {
  BookMarked,
  BookOpen,
  CalendarDays,
  ChevronDown,
  FileDown,
  FlaskConical,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Plus,
  Search,
  SquareTerminal,
  Tag,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/providers/trpc'
import { LOGIN_PATH } from '@/const'
import CommandPalette, { openCommandPalette } from '@/components/CommandPalette'
import RecordProjectDialog from '@/components/records/RecordProjectDialog'

const NAV_ITEMS = [
  { to: '/', label: '工作台', en: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/protocols', label: '实验方法', en: 'Methods', icon: FlaskConical },
  { to: '/library', label: '方法库', en: 'Library', icon: BookMarked },
  { to: '/records', label: '湿实验记录', en: 'Wet Lab', icon: NotebookPen },
  { to: '/bioinfo', label: '生信分析', en: 'Bioinfo', icon: SquareTerminal },
  { to: '/guide', label: '学习指南', en: 'Guide', icon: BookOpen },
  { to: '/schedule', label: '实验安排', en: 'Schedule', icon: CalendarDays },
  { to: '/export', label: '汇报导出', en: 'Export', icon: FileDown },
] as const

const FALLBACK_COLORS = ['#3E7C6B', '#5B7C99', '#B0707C', '#8A7CA8', '#B08D57', '#7C9161']

/** Desktop smooth scrolling (design.md §6) — native scroll on mobile. */
function useLenis() {
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!desktop.matches || reduced.matches) return
    const lenis = new Lenis({ duration: 1.0 })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])
}

function Sidebar() {
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const projectsQuery = trpc.project.list.useQuery(undefined, { enabled: isAuthenticated })
  const sidebarProjects = (projectsQuery.data ?? []).map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }))

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-line bg-paper md:flex">
      {/* logo */}
      <Link to="/" className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <img src="/logo.svg" alt="BenchLog" className="h-7 w-7" />
        <span className="font-display text-[18px] font-bold text-ink">BenchLog</span>
      </Link>

      {/* primary nav */}
      <nav className="flex flex-col gap-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ to, label, en, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150',
                isActive
                  ? 'bg-bench-wash text-bench-ink'
                  : 'text-ink-soft hover:bg-bench-wash/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-bench transition-opacity duration-150',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span>{label}</span>
                <span className="caption-en ml-auto !text-[10px]">{en}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* projects */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setProjectsOpen((v) => !v)}
            className="flex flex-1 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute hover:text-ink-soft"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform duration-200', !projectsOpen && '-rotate-90')}
            />
            项目分组 PROJECTS
          </button>
          <button
            type="button"
            aria-label="新建项目"
            title="新建项目"
            onClick={() => setProjectDialogOpen(true)}
            className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-bench-wash hover:text-bench"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        {projectsOpen && (
          <div className="mt-1 flex flex-col gap-0.5">
            {sidebarProjects.length === 0 ? (
              <button
                type="button"
                onClick={() => setProjectDialogOpen(true)}
                className="rounded-lg px-3 py-1.5 text-left text-[12.5px] text-ink-mute transition-colors duration-150 hover:text-ink-soft"
              >
                暂无项目，点上方 + 新建
              </button>
            ) : (
              sidebarProjects.map((p) => (
                <Link
                  key={p.id}
                  to={`/records?project=${p.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash/60 hover:text-ink"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="truncate">{p.name}</span>
                </Link>
              ))
            )}
          </div>
        )}
        <Link
          to="/records"
          className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash/60 hover:text-ink"
        >
          <Tag className="h-4 w-4" strokeWidth={1.8} />
          标签云
          <span className="caption-en ml-auto !text-[10px]">Tags</span>
        </Link>
      </div>

      {/* user card */}
      <div className="border-t border-line p-3">
        {isLoading ? (
          <div className="h-12 animate-pulse rounded-lg bg-bench-wash/50" />
        ) : isAuthenticated && user ? (
          <button
            type="button"
            onClick={logout}
            title="点击退出登录"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-bench-wash/60"
          >
            <img src={user.avatar || '/avatar-user.png'} alt="" className="h-8 w-8 rounded-full" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">
                {user.name ?? '研究者'}
              </span>
              <span className="block text-[11.5px] text-ink-mute">点击退出登录</span>
            </span>
          </button>
        ) : (
          <Link
            to={LOGIN_PATH}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-bench-wash/60"
          >
            <img src="/avatar-user.png" alt="" className="h-8 w-8 rounded-full" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">Sign in</span>
              <span className="block text-[11.5px] text-ink-mute">登录以同步实验数据</span>
            </span>
          </Link>
        )}
      </div>

      {/* 新建项目对话框（侧边栏 + 按钮触发） */}
      <RecordProjectDialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen} />
    </aside>
  )
}

/** Mobile: 48px slim top bar + 56px bottom tab bar with central FAB (design.md §7/§8.1). */
function MobileChrome() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  // 路由切换后自动收起抽屉
  useEffect(() => setMenuOpen(false), [pathname])
  return (
    <>
      <header className="sticky top-0 z-50 flex h-12 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="打开导航菜单"
          onClick={() => setMenuOpen(true)}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="BenchLog" className="h-6 w-6" />
          <span className="font-display text-[15px] font-bold text-ink">BenchLog</span>
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="搜索"
          onClick={openCommandPalette}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft"
        >
          <Search className="h-5 w-5" strokeWidth={1.8} />
        </button>
        {isLoading ? (
          <div className="h-7 w-7 animate-pulse rounded-full bg-bench-wash/60" />
        ) : isAuthenticated && user ? (
          <img src={user.avatar || '/avatar-user.png'} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <Link to={LOGIN_PATH} className="text-[13px] font-medium text-bench">
            Sign in
          </Link>
        )}
      </header>

      {/* 移动端导航抽屉：底栏 5 个固定位放不下的页面（方法库/生信分析/学习指南/汇报导出）由此进入 */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <motion.div
            initial={{ x: -272 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-paper shadow-overlay"
          >
            <div className="flex h-12 shrink-0 items-center border-b border-line px-4">
              <span className="font-display text-[15px] font-bold text-ink">导航</span>
              <button
                type="button"
                aria-label="关闭导航菜单"
                onClick={() => setMenuOpen(false)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 overflow-y-auto px-3 py-3">
              {NAV_ITEMS.map(({ to, label, en, icon: Icon, ...rest }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={'end' in rest}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-bench-wash text-bench-ink'
                        : 'text-ink-soft hover:bg-bench-wash/60 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-bench transition-opacity duration-150',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                      <span>{label}</span>
                      <span className="caption-en ml-auto !text-[10px]">{en}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </motion.div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-stretch border-t border-line bg-surface md:hidden">
        <MobileTab to="/" icon={LayoutDashboard} label="工作台" end />
        <MobileTab to="/protocols" icon={FlaskConical} label="方法" />
        <div className="relative flex flex-1 items-start justify-center">
          <Link
            to="/records/new"
            aria-label="快捷新建"
            className="absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-bench text-white shadow-overlay transition-transform duration-150 active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </Link>
        </div>
        <MobileTab to="/records" icon={NotebookPen} label="记录" />
        <MobileTab to="/schedule" icon={CalendarDays} label="日历" />
      </nav>
    </>
  )
}

function MobileTab({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: typeof LayoutDashboard
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] transition-colors duration-150',
          isActive ? 'text-bench' : 'text-ink-mute',
        )
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
      {label}
    </NavLink>
  )
}

/**
 * AppShell (design.md §8.1) — desktop: 240px sidebar + 56px TopBar;
 * mobile: 48px top bar + bottom tab bar with central FAB.
 * Content slot uses <Outlet/>: routes must be nested under this layout route.
 */
export default function Layout() {
  useLenis()
  const { pathname } = useLocation()
  const { isAuthenticated, isLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  })

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.svg" alt="BenchLog" className="h-10 w-10 animate-pulse" />
          <span className="text-[12.5px] text-ink-mute">正在打开实验记录本…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <MobileChrome />
        <main className="flex-1 pb-20 md:pb-0">
          {/* route transition: y 8→0, opacity, 240ms (design.md §6) */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
