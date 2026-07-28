import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import Lenis from 'lenis'
import {
  CalendarDays,
  ChevronDown,
  FileDown,
  FlaskConical,
  LayoutDashboard,
  NotebookPen,
  Plus,
  Search,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Navbar from '@/components/Navbar'

const NAV_ITEMS = [
  { to: '/', label: '工作台', en: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/protocols', label: '实验方法', en: 'Protocols', icon: FlaskConical },
  { to: '/records', label: '实验记录', en: 'Records', icon: NotebookPen },
  { to: '/schedule', label: '实验安排', en: 'Schedule', icon: CalendarDays },
  { to: '/export', label: '汇报导出', en: 'Export', icon: FileDown },
] as const

const PROJECTS = [
  { name: '慢病毒包装', color: '#3E7C6B' },
  { name: '流式分选', color: '#5B7C99' },
  { name: '转染优化', color: '#B0707C' },
  { name: '单细胞多组学', color: '#8A7CA8' },
  { name: 'WB · 蛋白', color: '#B08D57' },
  { name: '细胞培养日常', color: '#7C9161' },
]

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
        <button
          type="button"
          onClick={() => setProjectsOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute hover:text-ink-soft"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform duration-200', !projectsOpen && '-rotate-90')}
          />
          项目分组 PROJECTS
        </button>
        {projectsOpen && (
          <div className="mt-1 flex flex-col gap-0.5">
            {PROJECTS.map((p) => (
              <Link
                key={p.name}
                to="/records"
                className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash/60 hover:text-ink"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </Link>
            ))}
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

      {/* user card — AUTH-SLOT: rewired to useAuth() in Phase 5 */}
      <div className="border-t border-line p-3">
        <Link
          to="/login"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-bench-wash/60"
        >
          <img src="/avatar-user.png" alt="" className="h-8 w-8 rounded-full" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">Sign in</span>
            <span className="block text-[11.5px] text-ink-mute">登录以同步实验数据</span>
          </span>
        </Link>
      </div>
    </aside>
  )
}

/** Mobile: 48px slim top bar + 56px bottom tab bar with central FAB (design.md §7/§8.1). */
function MobileChrome() {
  return (
    <>
      <header className="sticky top-0 z-50 flex h-12 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="BenchLog" className="h-6 w-6" />
          <span className="font-display text-[15px] font-bold text-ink">BenchLog</span>
        </Link>
        <div className="flex-1" />
        <button type="button" aria-label="搜索" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft">
          <Search className="h-5 w-5" strokeWidth={1.8} />
        </button>
        {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
        <Link to="/login" className="text-[13px] font-medium text-bench">
          Sign in
        </Link>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-stretch border-t border-line bg-surface md:hidden">
        <MobileTab to="/" icon={LayoutDashboard} label="工作台" end />
        <MobileTab to="/protocols" icon={FlaskConical} label="协议" />
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
    </div>
  )
}
