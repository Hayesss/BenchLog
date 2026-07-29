import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookMarked,
  CalendarDays,
  CheckSquare,
  FileDown,
  FlaskConical,
  Folder,
  LayoutDashboard,
  NotebookPen,
  Search,
  SquareTerminal,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'

export const OPEN_PALETTE_EVENT = 'benchlog:open-command-palette'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))
}

type Hit = { group: string; icon: typeof Search; label: string; meta?: string; to: string }

/** ⌘K 页面跳转项（按中文名匹配） */
const NAV_PAGES: Hit[] = [
  { group: '页面', icon: LayoutDashboard, label: '工作台', to: '/' },
  { group: '页面', icon: FlaskConical, label: '实验方法', to: '/protocols' },
  { group: '页面', icon: BookMarked, label: '方法库', to: '/library' },
  { group: '页面', icon: NotebookPen, label: '实验记录', to: '/records' },
  { group: '页面', icon: SquareTerminal, label: '生信分析', to: '/bioinfo' },
  { group: '页面', icon: CalendarDays, label: '实验安排', to: '/schedule' },
  { group: '页面', icon: FileDown, label: '汇报导出', to: '/export' },
]

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-bench-wash text-bench-ink">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

/**
 * ⌘K 全局搜索（design.md §8.2）— 桌面居中浮层 640px，移动端全屏。
 * 全文搜索覆盖：抗体货号、细胞系、标签、记录结论、流程与待办。
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const search = trpc.search.global.useQuery(
    { q: debouncedQ },
    { enabled: open && debouncedQ.length > 0 },
  )

  const hits = useMemo<Hit[]>(() => {
    const navHits = NAV_PAGES.filter((h) => h.label.includes(debouncedQ))
    const d = search.data
    if (!d) return navHits
    const out: Hit[] = [...navHits]
    for (const p of d.protocols)
      out.push({
        group: '实验方法',
        icon: FlaskConical,
        label: p.name,
        meta: `${p.category} · ${p.version}`,
        to: `/protocols/${p.id}`,
      })
    for (const r of d.records)
      out.push({
        group: '实验记录',
        icon: NotebookPen,
        label: r.title,
        meta: r.recordDate,
        to: `/records/${r.id}`,
      })
    for (const p of d.projects)
      out.push({
        group: '项目',
        icon: Folder,
        label: p.name,
        meta: '项目',
        to: `/records?project=${p.id}`,
      })
    for (const t of d.tags)
      out.push({
        group: '标签',
        icon: Tag,
        label: `#${t.name}`,
        meta: '标签',
        to: `/records?tags=${encodeURIComponent(t.name)}`,
      })
    for (const f of d.flows)
      out.push({
        group: '流程',
        icon: CalendarDays,
        label: f.name,
        meta: f.nodes.map((n) => n.name).join(' → '),
        to: '/schedule',
      })
    for (const t of d.todos)
      out.push({
        group: '待办',
        icon: CheckSquare,
        label: t.text,
        meta: t.todoDate,
        to: `/schedule?date=${t.todoDate}`,
      })
    return out
  }, [search.data, debouncedQ])

  const go = useCallback(
    (hit: Hit) => {
      setOpen(false)
      navigate(hit.to)
    },
    [navigate],
  )

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && hits[active]) {
      go(hits[active])
    }
  }

  let lastGroup = ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 p-0 backdrop-blur-sm md:p-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="flex h-full w-full flex-col overflow-hidden border-line bg-surface shadow-overlay md:h-auto md:max-h-[70vh] md:w-[640px] md:rounded-xl md:border"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-mute" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onInputKey}
                placeholder="搜索货号、细胞系、标签、记录…"
                className="h-13 w-full bg-transparent py-4 text-[14px] text-ink outline-none placeholder:text-ink-mute"
              />
              <kbd className="hidden rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-mute md:block">
                ESC
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {debouncedQ.length === 0 ? (
                <p className="px-3 py-10 text-center text-[12.5px] text-ink-mute">
                  输入关键词开始全文搜索 — 支持抗体货号（如 CST #4967）、细胞系（293T）、标签（#慢病毒）
                </p>
              ) : search.isLoading ? (
                <p className="px-3 py-10 text-center text-[12.5px] text-ink-mute">搜索中…</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-10 text-center text-[12.5px] text-ink-mute">
                  没有找到「{debouncedQ}」相关内容
                </p>
              ) : (
                <ul>
                  {hits.map((h, i) => {
                    const showGroup = h.group !== lastGroup
                    lastGroup = h.group
                    const Icon = h.icon
                    return (
                      <li key={`${h.group}-${h.to}-${i}`}>
                        {showGroup && (
                          <p className="px-3 pb-1 pt-3 text-[11px] font-medium tracking-[0.06em] text-ink-mute">
                            {h.group}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => go(h)}
                          onMouseEnter={() => setActive(i)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100',
                            active === i ? 'bg-bench-wash' : '',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-ink-mute" strokeWidth={1.8} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-ink">
                              <Highlight text={h.label} q={debouncedQ} />
                            </span>
                            {h.meta && (
                              <span className="block truncate font-mono text-[11px] text-ink-mute">
                                {h.meta}
                              </span>
                            )}
                          </span>
                          {active === i && (
                            <kbd className="hidden rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-ink-mute md:block">
                              ↵
                            </kbd>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
