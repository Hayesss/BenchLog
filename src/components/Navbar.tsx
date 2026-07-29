import { Link, useLocation } from 'react-router'
import { Bell, ChevronRight, LogOut, Plus, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import { openCommandPalette } from '@/components/CommandPalette'

const ROUTE_LABELS: Array<[RegExp, string[]]> = [
  [/^\/$/, ['工作台']],
  [/^\/protocols\/[^/]+/, ['实验方法', '方法详情']],
  [/^\/protocols/, ['实验方法']],
  [/^\/records\/new/, ['湿实验记录', '新建记录']],
  [/^\/records\/[^/]+/, ['湿实验记录', '记录详情']],
  [/^\/records/, ['湿实验记录']],
  [/^\/bioinfo\/[^/]+/, ['生信分析', '分析详情']],
  [/^\/bioinfo/, ['生信分析']],
  [/^\/schedule/, ['实验安排']],
  [/^\/library\/[^/]+/, ['方法库', '条目详情']],
  [/^\/library/, ['方法库']],
  [/^\/guide/, ['学习指南']],
  [/^\/export/, ['汇报导出']],
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
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
          aria-label="通知"
        >
          <Bell className="h-4 w-4" />
        </button>
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
