import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileDown,
  Filter,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tag,
  ToggleLeft,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { useIsMobile } from '@/hooks/use-mobile'
import RecordCard from '@/components/records/RecordCard'
import RecordTagChip from '@/components/records/RecordTagChip'
import RecordProjectDialog from '@/components/records/RecordProjectDialog'
import {
  EASE_OUT,
  STATUS_META,
  fmtDateShort,
  weekdayOf,
} from '@/components/records/record-types'
import type { ProjectItem, RecordListItem, RecordStatus } from '@/components/records/record-types'

const PAGE_SIZE = 20

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const groupVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

function matchesQuery(r: RecordListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  // P1 性能：列表投影不再回传 resultMd/contentHtml，搜索覆盖标题/目的/结论/下一步/标签/关联名（正文全文检索待服务端化）
  const hay = [
    r.title,
    r.purpose ?? '',
    r.conclusion ?? '',
    r.nextStep ?? '',
    (r.tags ?? []).join(' '),
    r.protocol?.name ?? '',
    r.project?.name ?? '',
  ]
    .join('\n')
    .toLowerCase()
  return hay.includes(needle)
}

/* ------------------------------------------------------------------ */
/* Group header                                                        */
/* ------------------------------------------------------------------ */
function GroupHeader({
  title,
  color,
  count,
  collapsed,
  onToggle,
  project,
  onEditProject,
  onDeleteProject,
}: {
  title: string
  color: string
  count: number
  collapsed: boolean
  onToggle: () => void
  project?: ProjectItem | null
  onEditProject?: (p: ProjectItem) => void
  onDeleteProject?: (p: ProjectItem) => void
}) {
  return (
    <div className="group/ghead flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-paper">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="min-w-0 font-display text-[15px] font-semibold tracking-[0.01em] text-ink">
          {title}
        </h2>
        <span className="shrink-0 font-mono text-[11.5px] text-ink-mute">{count} 条</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-mute transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {project && (onEditProject || onDeleteProject) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="项目操作"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute opacity-0 transition-all duration-150 hover:bg-surface hover:text-ink focus:opacity-100 group-hover/ghead:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => onEditProject?.(project)} className="gap-2 text-[13px]">
              <Pencil className="h-3.5 w-3.5" /> 编辑项目
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDeleteProject?.(project)}
              className="gap-2 text-[13px] text-danger focus:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Filter controls (shared between desktop toolbar & mobile sheet)     */
/* ------------------------------------------------------------------ */
function FilterControls({
  projects,
  selectedProjects,
  toggleProject,
  allTags,
  selectedTags,
  toggleTag,
  status,
  setStatus,
  dateFrom,
  dateTo,
  patchParams,
  onNewProject,
}: {
  projects: ProjectItem[]
  selectedProjects: number[]
  toggleProject: (id: number) => void
  allTags: { name: string; color: string }[]
  selectedTags: string[]
  toggleTag: (name: string) => void
  status: RecordStatus | 'all'
  setStatus: (s: RecordStatus | 'all') => void
  dateFrom: string
  dateTo: string
  patchParams: (patch: Record<string, string | null>) => void
  onNewProject: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="caption-en mb-2">项目 PROJECT</p>
        <div className="flex flex-col gap-1">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleProject(p.id)}
              className={cn(
                'flex min-h-[2.25rem] items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150',
                selectedProjects.includes(p.id)
                  ? 'bg-bench-wash text-bench-ink'
                  : 'text-ink-soft hover:bg-paper',
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="min-w-0 flex-1 text-left leading-[18px]">{p.name}</span>
              {selectedProjects.includes(p.id) && <span className="text-bench">✓</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={onNewProject}
            className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] text-bench transition-colors duration-150 hover:bg-bench-wash/60"
          >
            <Plus className="h-4 w-4" /> 新建项目
          </button>
        </div>
      </div>
      <div>
        <p className="caption-en mb-2">标签 TAGS</p>
        {allTags.length === 0 ? (
          <p className="px-1 text-[12.5px] text-ink-mute">还没有标签，可在记录详情中添加。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <RecordTagChip
                key={t.name}
                name={t.name}
                color={t.color}
                active={selectedTags.includes(t.name)}
                onClick={() => toggleTag(t.name)}
              />
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="caption-en mb-2">日期范围 DATE</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => patchParams({ from: e.target.value || null })}
            aria-label="开始日期"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors focus:border-bench"
          />
          <span className="shrink-0 text-[12px] text-ink-mute">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => patchParams({ to: e.target.value || null })}
            aria-label="结束日期"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors focus:border-bench"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => patchParams({ from: null, to: null })}
            className="mt-1.5 text-[12px] text-ink-mute underline-offset-2 hover:text-bench hover:underline"
          >
            清除日期
          </button>
        )}
      </div>
      <div>
        <p className="caption-en mb-2">状态 STATUS</p>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'ongoing', 'done', 'failed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-150',
                status === s
                  ? 'bg-ink text-paper'
                  : 'border border-line bg-surface text-ink-soft hover:border-line-strong',
              )}
            >
              {s === 'all' ? '全部' : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */
export default function Records() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const utils = trpc.useUtils()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-synced filter state
  const q = searchParams.get('q') ?? ''
  const view = searchParams.get('view') === 'timeline' ? 'timeline' : 'group'
  const status = (searchParams.get('status') ?? 'all') as RecordStatus | 'all'
  const selectedProjects = useMemo(
    () => (searchParams.get('project') ?? '').split(',').filter(Boolean).map(Number),
    [searchParams],
  )
  const selectedTags = useMemo(
    () => (searchParams.get('tags') ?? '').split(',').filter(Boolean),
    [searchParams],
  )
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const toggleProject = useCallback(
    (id: number) => {
      const next = selectedProjects.includes(id)
        ? selectedProjects.filter((p) => p !== id)
        : [...selectedProjects, id]
      patchParams({ project: next.length ? next.join(',') : null })
    },
    [selectedProjects, patchParams],
  )
  const toggleTag = useCallback(
    (name: string) => {
      const next = selectedTags.includes(name)
        ? selectedTags.filter((t) => t !== name)
        : [...selectedTags, name]
      patchParams({ tags: next.length ? next.join(',') : null })
    },
    [selectedTags, patchParams],
  )

  // data（P1 性能双模式）：无搜索词且无标签筛选 → 服务端键集分页（listPage）；
  // 有搜索词/标签筛选（客户端计算维度）→ 回退全量列表（list，投影精简后量小）
  const clientMode = q.trim() !== '' || selectedTags.length > 0
  const pageInput = useMemo(
    () => ({
      projectIds: selectedProjects.length ? selectedProjects : undefined,
      status: status === 'all' ? undefined : status,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit: 50,
    }),
    [selectedProjects, status, dateFrom, dateTo],
  )
  const pageQuery = trpc.record.listPage.useInfiniteQuery(pageInput, {
    enabled: !clientMode,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const listQuery = trpc.record.list.useQuery(undefined, { enabled: clientMode })
  const records = useMemo(
    () =>
      clientMode
        ? (listQuery.data ?? [])
        : (pageQuery.data?.pages.flatMap((p) => p.items) ?? []),
    [clientMode, listQuery.data, pageQuery.data],
  )
  const recordsQuery = clientMode ? listQuery : pageQuery
  const projectsQuery = trpc.project.list.useQuery()
  const tagsQuery = trpc.tag.list.useQuery()
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])

  // tag cloud: registry tags + tags seen on records
  const allTags = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tagsQuery.data ?? []) map.set(t.name, t.color)
    for (const r of records) for (const t of r.tags ?? []) if (!map.has(t)) map.set(t, '#5B7C99')
    return [...map.entries()].map(([name, color]) => ({ name, color }))
  }, [tagsQuery.data, records])

  // filtering
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (selectedProjects.length === 0 ||
            (r.projectId != null && selectedProjects.includes(r.projectId))) &&
          (status === 'all' || r.status === status) &&
          (selectedTags.length === 0 || selectedTags.every((t) => (r.tags ?? []).includes(t))) &&
          (dateFrom === '' || r.recordDate >= dateFrom) &&
          (dateTo === '' || r.recordDate <= dateTo) &&
          matchesQuery(r, q),
      ),
    [records, selectedProjects, status, selectedTags, q, dateFrom, dateTo],
  )

  // stats（P1 性能：服务端条件聚合一次查，不再依赖全量行；分页模式下 records.length 只是已加载数，不能用）
  const monthPrefix = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`
  }, [])
  const statsQuery = trpc.record.stats.useQuery({ monthPrefix })
  const stats = statsQuery.data ?? { total: 0, month: 0, ongoing: 0 }

  // client-side infinite scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  // reset pagination when filters change (state adjusted during render)
  const filterKey = `${q}|${status}|${view}|${selectedProjects.join(',')}|${selectedTags.join(',')}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setVisibleCount(PAGE_SIZE)
    setLoadingMore(false)
  }
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pageQuery
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (clientMode) {
          // 客户端模式：本地切片加量（数据已全量在手）
          if (filtered.length > visibleCount && !loadingMore) {
            setLoadingMore(true)
            window.setTimeout(() => {
              setVisibleCount((c) => c + PAGE_SIZE)
              setLoadingMore(false)
            }, 350)
          }
        } else if (hasNextPage && !isFetchingNextPage) {
          // 服务端分页模式：拉下一页
          void fetchNextPage()
        }
      },
      { rootMargin: '240px' },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [clientMode, filtered.length, visibleCount, loadingMore, hasNextPage, isFetchingNextPage, fetchNextPage])
  const visible = useMemo(
    () => (clientMode ? filtered.slice(0, visibleCount) : filtered),
    [clientMode, filtered, visibleCount],
  )
  const hasMoreToShow = clientMode ? filtered.length > visibleCount : (hasNextPage ?? false)
  const fetchingMore = clientMode ? loadingMore : isFetchingNextPage

  // grouping
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const groups = useMemo(() => {
    const map = new Map<string, RecordListItem[]>()
    for (const r of visible) {
      const key = r.projectId != null ? `p-${r.projectId}` : 'none'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    const ordered: { key: string; project: ProjectItem | null; items: RecordListItem[] }[] = []
    for (const p of projects) {
      const key = `p-${p.id}`
      if (map.has(key)) {
        ordered.push({ key, project: p, items: map.get(key)! })
        map.delete(key)
      }
    }
    // projects not in the registry (deleted) or records without project
    const rest = [...map.entries()].sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : 0))
    for (const [key, items] of rest) ordered.push({ key, project: items[0]?.project ?? null, items })
    return ordered
  }, [visible, projects])

  const months = useMemo(() => {
    const map = new Map<string, Map<string, RecordListItem[]>>()
    for (const r of visible) {
      const month = r.recordDate.slice(0, 7)
      if (!map.has(month)) map.set(month, new Map())
      const days = map.get(month)!
      if (!days.has(r.recordDate)) days.set(r.recordDate, [])
      days.get(r.recordDate)!.push(r)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([month, days]) => ({
        month,
        days: [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1)),
      }))
  }, [visible])

  // selection mode
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clearSelection = () => setSelected(new Set())

  // batch tag
  const [batchTagOpen, setBatchTagOpen] = useState(false)
  const [batchTagValue, setBatchTagValue] = useState('')
  const tagCreateMut = trpc.tag.create.useMutation()
  const updateMut = trpc.record.update.useMutation()
  const applyBatchTag = async () => {
    const name = batchTagValue.replace(/^#/, '').trim()
    if (!name || selected.size === 0) return
    try {
      await tagCreateMut.mutateAsync({ name })
      await Promise.all(
        records
          .filter((r) => selected.has(r.id))
          .map((r) =>
            updateMut.mutateAsync({
              id: r.id,
              title: r.title,
              recordDate: r.recordDate,
              purpose: r.purpose ?? undefined,
              projectId: r.projectId,
              protocolId: r.protocolId,
              protocolVersion: r.protocolVersion,
              deviations: r.deviations ?? [],
              conclusion: r.conclusion ?? undefined,
              nextStep: r.nextStep ?? undefined,
              status: r.status,
              tags: [...new Set([...(r.tags ?? []), name])],
            }),
          ),
      )
      await Promise.all([utils.record.invalidate(), utils.tag.list.invalidate()])
      toast.success(`已为 ${selected.size} 条记录加上 #${name}`)
      setBatchTagValue('')
      setBatchTagOpen(false)
      clearSelection()
    } catch (e) {
      toast.error(`批量加标签失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  // project management
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectItem | null>(null)
  const removeProjectMut = trpc.project.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.project.list.invalidate(), utils.record.invalidate()])
      toast.success('项目已删除（记录保留为未分组）')
      setDeletingProject(null)
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const hasFilter =
    q.trim() !== '' ||
    selectedProjects.length > 0 ||
    selectedTags.length > 0 ||
    status !== 'all' ||
    dateFrom !== '' ||
    dateTo !== ''
  const clearFilters = () =>
    patchParams({ q: null, project: null, tags: null, status: null, from: null, to: null })

  const isLoading = recordsQuery.isLoading

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Toaster position="top-right" />

      {/* ---------------- header ---------------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-[24px] font-bold text-ink md:text-[30px]">湿实验记录</h1>
          <p className="caption-en mt-1">Wet Lab</p>
          <p className="mt-2 font-mono text-[12.5px] text-ink-mute">
            共 {stats.total} 条记录 · 本月 {stats.month} 条 · {stats.ongoing} 条进行中
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {selected.size > 0 && (
              <motion.button
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                type="button"
                onClick={() => navigate(`/export?ids=${[...selected].join(',')}`)}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
              >
                <FileDown className="h-4 w-4" />
                导出所选
              </motion.button>
            )}
          </AnimatePresence>
          <Link
            to="/records/new"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-3.5 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            新建记录
          </Link>
        </div>
      </motion.div>

      {/* ---------------- sticky toolbar ---------------- */}
      <div className="sticky top-12 z-30 -mx-4 mt-5 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:top-14 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {/* search */}
          <div className="relative w-full sm:w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input
              value={q}
              onChange={(e) => patchParams({ q: e.target.value || null })}
              placeholder="搜抗体货号、细胞系、结论关键词…"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-[13px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
            />
            {q && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => patchParams({ q: null })}
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-ink-mute hover:bg-paper hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isMobile ? (
            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-card transition-colors duration-150',
                hasFilter
                  ? 'border-bench bg-bench-wash text-bench-ink'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong',
              )}
            >
              <Filter className="h-4 w-4" />
              筛选
              {(selectedProjects.length > 0 ||
                selectedTags.length > 0 ||
                status !== 'all' ||
                dateFrom !== '' ||
                dateTo !== '') && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bench px-1 font-mono text-[10px] text-white">
                  {selectedProjects.length +
                    selectedTags.length +
                    (status !== 'all' ? 1 : 0) +
                    (dateFrom !== '' || dateTo !== '' ? 1 : 0)}
                </span>
              )}
            </button>
          ) : (
            <>
              {/* project multi-select */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-card transition-colors duration-150',
                      selectedProjects.length > 0
                        ? 'border-bench bg-bench-wash text-bench-ink'
                        : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                    )}
                  >
                    项目
                    {selectedProjects.length > 0 && (
                      <span className="font-mono text-[11px]">{selectedProjects.length}</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-[12.5px] text-ink-mute">还没有项目</div>
                  )}
                  {projects.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.id}
                      checked={selectedProjects.includes(p.id)}
                      onCheckedChange={() => toggleProject(p.id)}
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2 text-[13px]"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="min-w-0 leading-[18px]">{p.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditingProject(null)
                      setProjectDialogOpen(true)
                    }}
                    className="gap-2 text-[13px] text-bench"
                  >
                    <Plus className="h-3.5 w-3.5" /> 新建项目
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* tag cloud popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-card transition-colors duration-150',
                      selectedTags.length > 0
                        ? 'border-bench bg-bench-wash text-bench-ink'
                        : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                    )}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    标签
                    {selectedTags.length > 0 && (
                      <span className="font-mono text-[11px]">{selectedTags.length}</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  {allTags.length === 0 ? (
                    <p className="text-[12.5px] text-ink-mute">还没有标签，可在记录详情中添加。</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.slice(0, 8).map((t) => (
                        <RecordTagChip
                          key={t.name}
                          name={t.name}
                          color={t.color}
                          active={selectedTags.includes(t.name)}
                          onClick={() => toggleTag(t.name)}
                        />
                      ))}
                      {allTags.length > 8 && (
                        <div className="mt-1 flex w-full flex-wrap gap-1.5 border-t border-line pt-2">
                          {allTags.slice(8).map((t) => (
                            <RecordTagChip
                              key={t.name}
                              name={t.name}
                              color={t.color}
                              active={selectedTags.includes(t.name)}
                              onClick={() => toggleTag(t.name)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* status pills with sliding indicator */}
              <div className="flex items-center rounded-full border border-line bg-surface p-0.5 shadow-card">
                {(['all', 'ongoing', 'done', 'failed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patchParams({ status: s === 'all' ? null : s })}
                    className={cn(
                      'relative h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150',
                      status === s ? 'text-white' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    {status === s && (
                      <motion.span
                        layoutId="records-status-pill"
                        className={cn(
                          'absolute inset-0 rounded-full',
                          s === 'all' && 'bg-ink',
                          s === 'ongoing' && 'bg-info',
                          s === 'done' && 'bg-success',
                          s === 'failed' && 'bg-danger',
                        )}
                        transition={{ duration: 0.25, ease: EASE_OUT }}
                      />
                    )}
                    <span className="relative">{s === 'all' ? '全部' : STATUS_META[s].label}</span>
                  </button>
                ))}
              </div>

              {/* date range popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium shadow-card transition-colors duration-150',
                      dateFrom !== '' || dateTo !== ''
                        ? 'border-bench bg-bench-wash text-bench-ink'
                        : 'border-line bg-surface text-ink-soft hover:border-line-strong',
                    )}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    日期
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64">
                  <p className="caption-en mb-2">日期范围 DATE</p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <span className="w-8 shrink-0">从</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => patchParams({ from: e.target.value || null })}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-bench"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <span className="w-8 shrink-0">至</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => patchParams({ to: e.target.value || null })}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none focus:border-bench"
                      />
                    </label>
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => patchParams({ from: null, to: null })}
                        className="self-start text-[12px] text-ink-mute underline-offset-2 hover:text-bench hover:underline"
                      >
                        清除日期
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}

          {/* view toggle */}
          <div className="ml-auto flex items-center rounded-lg border border-line bg-surface p-0.5 shadow-card">
            <button
              type="button"
              aria-label="分组视图"
              title="分组视图"
              onClick={() => patchParams({ view: null })}
              className={cn(
                'flex h-8 w-9 items-center justify-center rounded-md transition-colors duration-150',
                view === 'group' ? 'bg-bench-wash text-bench-ink' : 'text-ink-mute hover:text-ink',
              )}
            >
              <ListTree className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="时间流视图"
              title="时间流视图"
              onClick={() => patchParams({ view: 'timeline' })}
              className={cn(
                'flex h-8 w-9 items-center justify-center rounded-md transition-colors duration-150',
                view === 'timeline' ? 'bg-bench-wash text-bench-ink' : 'text-ink-mute hover:text-ink',
              )}
            >
              <ToggleLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* selected tag chips row */}
        {selectedTags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {selectedTags.map((t) => {
              const meta = allTags.find((x) => x.name === t)
              return (
                <RecordTagChip key={t} name={t} color={meta?.color} onRemove={() => toggleTag(t)} />
              )
            })}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] text-ink-mute underline-offset-2 hover:text-bench hover:underline"
            >
              清空筛选
            </button>
          </div>
        )}
      </div>

      {/* ---------------- selection action bar ---------------- */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="sticky top-[104px] z-20 mt-3 flex items-center gap-3 rounded-lg border border-bench/30 bg-bench-wash px-4 py-2.5 shadow-card md:top-[120px]"
          >
            <CheckSquare className="h-4 w-4 text-bench" />
            <span className="font-mono text-[12.5px] text-bench-ink">已选 {selected.size} 条</span>
            <button
              type="button"
              onClick={() => navigate(`/export?ids=${[...selected].join(',')}`)}
              className="text-[12.5px] font-medium text-bench hover:underline"
            >
              导出汇总
            </button>
            <Popover open={batchTagOpen} onOpenChange={setBatchTagOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="text-[12.5px] font-medium text-bench hover:underline">
                  批量加标签
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64">
                <p className="caption-en mb-2">新标签 TAG</p>
                <div className="flex gap-2">
                  <input
                    value={batchTagValue}
                    onChange={(e) => setBatchTagValue(e.target.value)}
                    placeholder="#失败重复"
                    className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none placeholder:text-ink-mute focus:border-bench"
                    onKeyDown={(e) => e.key === 'Enter' && applyBatchTag()}
                  />
                  <button
                    type="button"
                    onClick={applyBatchTag}
                    disabled={updateMut.isPending}
                    className="h-9 rounded-lg bg-bench px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep disabled:opacity-60"
                  >
                    添加
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto text-[12.5px] text-ink-mute hover:text-ink"
            >
              取消
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- body ---------------- */}
      {isLoading ? (
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-lg border border-line bg-surface"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : records.length === 0 ? (
        /* empty state (records.md §5) */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="flex flex-col items-center py-24 text-center"
        >
          <img src="/empty-records.svg" alt="" className="w-[240px] max-w-full opacity-90" />
          <h2 className="mt-6 font-display text-[20px] font-semibold text-ink">
            还没有湿实验记录
          </h2>
          <p className="mt-2 max-w-[360px] text-[13px] leading-6 text-ink-mute">
            从一条方法开始你的第一次记录，每条记录都会锚定方法版本
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/records/new"
              className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13.5px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              新建第一条记录
            </Link>
            <Link
              to="/protocols"
              className="text-[13.5px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep hover:underline"
            >
              浏览实验方法 →
            </Link>
          </div>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="flex flex-col items-center py-24 text-center"
        >
          <img src="/empty-records.svg" alt="" className="w-[200px] max-w-full opacity-70" />
          <h2 className="mt-6 font-display text-[18px] font-semibold text-ink">
            没有匹配{q ? ` “${q}” ` : '当前筛选'}的记录
          </h2>
          <p className="mt-2 text-[13px] text-ink-mute">换个关键词，或者清空筛选条件试试</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:text-bench"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            清空筛选
          </button>
        </motion.div>
      ) : view === 'group' ? (
        /* ---------------- grouped view ---------------- */
        <motion.div
          variants={groupVariants}
          initial="hidden"
          animate="show"
          className="mt-5 flex flex-col gap-6"
        >
          {groups.map((g) => {
            const collapsed = collapsedGroups.has(g.key)
            return (
              <motion.section key={g.key} variants={groupVariants}>
                <GroupHeader
                  title={g.project?.name ?? '未分组'}
                  color={g.project?.color || '#D8D4CA'}
                  count={g.items.length}
                  collapsed={collapsed}
                  onToggle={() => toggleGroup(g.key)}
                  project={g.project}
                  onEditProject={(p) => {
                    setEditingProject(p)
                    setProjectDialogOpen(true)
                  }}
                  onDeleteProject={(p) => setDeletingProject(p)}
                />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <motion.div
                        variants={listVariants}
                        initial="hidden"
                        animate="show"
                        className="mt-2 flex flex-col gap-3"
                      >
                        {g.items.map((r) => (
                          <RecordCard
                            key={r.id}
                            record={r}
                            q={q}
                            selectable={selected.size > 0}
                            selected={selected.has(r.id)}
                            onToggleSelect={toggleSelect}
                          />
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )
          })}
        </motion.div>
      ) : (
        /* ---------------- timeline view ---------------- */
        <div className="mt-5 flex flex-col gap-6">
          {months.map(({ month, days }) => {
            const [y, m] = month.split('-')
            return (
              <section key={month}>
                <h2 className="px-2 font-display text-[15px] font-semibold text-ink">
                  {y} 年 {Number(m)} 月
                  <span className="ml-2 font-mono text-[11.5px] font-normal text-ink-mute">
                    {days.reduce((n, [, rs]) => n + rs.length, 0)} 条
                  </span>
                </h2>
                <div className="mt-2 flex flex-col">
                  {days.map(([day, rs]) => (
                    <div key={day} className="relative flex gap-4 pl-2">
                      {/* date column with 2px vertical line + 8px node dot */}
                      <div className="relative w-14 shrink-0">
                        <span className="absolute bottom-0 left-[27px] top-0 w-[2px] bg-line" aria-hidden />
                        <span
                          className="absolute left-6 top-4 h-2 w-2 rounded-full bg-bench"
                          aria-hidden
                        />
                        <div className="relative pt-2.5 text-center">
                          <div className="font-mono text-[14px] font-medium text-ink">
                            {fmtDateShort(day)}
                          </div>
                          <div className="text-[11px] text-ink-mute">{weekdayOf(day)}</div>
                        </div>
                      </div>
                      <motion.div
                        variants={listVariants}
                        initial="hidden"
                        animate="show"
                        className="flex min-w-0 flex-1 flex-col gap-2 pb-4"
                      >
                        {rs.map((r) => (
                          <RecordCard
                            key={r.id}
                            record={r}
                            q={q}
                            compact
                            selectable={selected.size > 0}
                            selected={selected.has(r.id)}
                            onToggleSelect={toggleSelect}
                          />
                        ))}
                      </motion.div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* infinite-scroll sentinel + skeletons */}
      {hasMoreToShow && (
        <div ref={sentinelRef} className="mt-4 flex flex-col gap-3">
          {fetchingMore &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[100px] animate-pulse rounded-lg border border-line bg-surface"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
        </div>
      )}

      {/* ---------------- mobile filter sheet ---------------- */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="font-display text-[17px]">筛选记录</SheetTitle>
          </SheetHeader>
          <div className="px-1 pb-6 pt-2">
            <FilterControls
              projects={projects}
              selectedProjects={selectedProjects}
              toggleProject={toggleProject}
              allTags={allTags}
              selectedTags={selectedTags}
              toggleTag={toggleTag}
              status={status}
              setStatus={(s) => patchParams({ status: s === 'all' ? null : s })}
              dateFrom={dateFrom}
              dateTo={dateTo}
              patchParams={patchParams}
              onNewProject={() => {
                setFilterSheetOpen(false)
                setEditingProject(null)
                setProjectDialogOpen(true)
              }}
            />
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="h-11 flex-1 rounded-lg border border-line bg-surface text-[13.5px] font-medium text-ink-soft"
              >
                清空筛选
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="h-11 flex-[2] rounded-lg bg-bench text-[13.5px] font-medium text-white"
              >
                查看 {filtered.length} 条记录
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------------- project dialogs ---------------- */}
      <RecordProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
      />
      <AlertDialog open={!!deletingProject} onOpenChange={(v) => !v && setDeletingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              删除项目「{deletingProject?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              项目下的记录不会被删除，会归入「未分组」。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingProject && removeProjectMut.mutate({ id: deletingProject.id })}
              className="bg-danger text-white hover:bg-danger/90"
            >
              删除项目
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
