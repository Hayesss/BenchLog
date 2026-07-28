import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Copy,
  Dna,
  Download,
  Eye,
  FileDown,
  FlaskConical,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Plus,
  ScanLine,
  Search,
  Snowflake,
  Sparkles,
  Syringe,
  Tag as TagIcon,
  Trash2,
  Biohazard,
} from 'lucide-react'
import { toast } from 'sonner'
import { PROTOCOL_TEMPLATES } from '@contracts/protocol-templates'
import { trpc } from '@/providers/trpc'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ProtocolCharTitle from '@/components/protocols/ProtocolCharTitle'
import ProtocolEditorDialog from '@/components/protocols/ProtocolEditorDialog'
import ProtocolTagChip, { useProtocolTagColors } from '@/components/protocols/ProtocolTagChip'
import ProtocolToaster from '@/components/protocols/ProtocolToaster'
import {
  countSteps,
  downloadMarkdown,
  iteratedRecently,
  protocolToMarkdown,
  relativeDate,
  sortCategories,
  wash,
  type ProtocolListItem,
} from '@/components/protocols/protocolShared'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/* ---------------- featured template meta (design protocols.md §区块3) ---------------- */

const TEMPLATE_META: Record<string, { icon: LucideIcon; blurb: string }> = {
  'Western Blot（全细胞裂解 → 化学发光）': {
    icon: FlaskConical,
    blurb: 'RIPA 裂解 → BCA 定量 → SDS-PAGE → 湿转 PVDF，ECL 化学发光显影，含灰度归一化分析',
  },
  '慢病毒包装（293T，三质粒系统）': {
    icon: Biohazard,
    blurb: 'psPAX2 + pMD2.G 共转染 293T，48/72h 两次收毒合并，含滴度快速估算流程',
  },
  'PEI 转染优化（293T/贴壁细胞）': {
    icon: Syringe,
    blurb: 'PEI:DNA 1:1–4:1 梯度优化，复合物 15–20 min 孵育，荧光/流式双读数评估效率',
  },
  '流式分选（FACS，表面染色）': {
    icon: ScanLine,
    blurb: '4°C 避光表面染色 30 min，活细胞 gate → 单细胞 gate → 目标群分选，纯度 >95%',
  },
  '单细胞悬液制备（10x 多组学前处理）': {
    icon: Dna,
    blurb: '温和消化 + 40 μm 过滤 + 红细胞裂解，目标 700–1200 cells/μL、活率 ≥80%',
  },
  '细胞传代与冻存（293T 日常维护）': {
    icon: Snowflake,
    blurb: '1:4–1:6 传代维持对数期，90% FBS + 10% DMSO 程序降温冻存，代次 < P20',
  },
}

const SORT_OPTIONS = [
  { value: 'recent', label: '最近使用' },
  { value: 'name', label: '名称' },
  { value: 'usage', label: '使用次数' },
] as const

type SortKey = (typeof SORT_OPTIONS)[number]['value']

/* ---------------- animations ---------------- */

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

/* =================================================================== */

export default function Protocols() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const listQuery = trpc.protocol.list.useQuery()
  const tagColors = useProtocolTagColors()
  const [searchParams, setSearchParams] = useSearchParams()

  const protocols = useMemo(() => listQuery.data ?? [], [listQuery.data])

  /* URL-synced filter state */
  const q = searchParams.get('q') ?? ''
  const cat = searchParams.get('cat') ?? '全部'
  const selTags = useMemo(() => (searchParams.get('tags') ?? '').split(',').filter(Boolean), [searchParams])
  const sort = (searchParams.get('sort') ?? 'recent') as SortKey
  const filtersActive = q !== '' || cat !== '全部' || selTags.length > 0

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  /* debounced search input (200ms) */
  const [searchInput, setSearchInput] = useState(q)
  useEffect(() => setSearchInput(q), [q])
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) patchParams({ q: searchInput || null })
    }, 200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [stuck, setStuck] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onScroll = () => {
      const el = toolbarRef.current
      if (!el) return
      setStuck(el.getBoundingClientRect().top <= (window.innerWidth < 768 ? 48 : 56) + 1)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* dialogs */
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ProtocolListItem | null>(null)
  const templateSectionRef = useRef<HTMLDivElement>(null)
  const [pulseTemplates, setPulseTemplates] = useState(false)

  /* mutations */
  const seedMut = trpc.protocol.seedTemplates.useMutation()
  const removeMut = trpc.protocol.remove.useMutation()
  const createMut = trpc.protocol.create.useMutation()

  async function importTemplates(): Promise<ProtocolListItem[]> {
    const { inserted } = await seedMut.mutateAsync()
    await utils.protocol.list.invalidate()
    const fresh = await utils.protocol.list.fetch()
    if (inserted > 0) toast.success(`已导入 ${inserted} 个预置模板`)
    else toast.info('6 个预置模板已全部在库中')
    return fresh ?? []
  }

  async function handleTemplateClick(name: string) {
    const matched = protocols.find((p) => p.name === name)
    if (matched) {
      navigate(`/protocols/${matched.id}`)
      return
    }
    try {
      const fresh = await importTemplates()
      const created = fresh.find((p) => p.name === name)
      if (created) navigate(`/protocols/${created.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败，请重试')
    }
  }

  async function duplicateProtocol(p: ProtocolListItem) {
    try {
      await createMut.mutateAsync({
        name: `${p.name} 副本`,
        category: p.category,
        color: p.color,
        description: p.description ?? undefined,
        materials: p.materials,
        stepGroups: p.stepGroups,
        params: p.params,
        tags: p.tags,
        version: 'v1.0',
      })
      await utils.protocol.list.invalidate()
      toast.success('已复制为我的协议')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制失败')
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await removeMut.mutateAsync({ id: pendingDelete.id })
      await utils.protocol.list.invalidate()
      toast.success(`已归档「${pendingDelete.name}」`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setPendingDelete(null)
    }
  }

  function scrollToTemplates() {
    templateSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPulseTemplates(true)
    window.setTimeout(() => setPulseTemplates(false), 1100)
  }

  /* derived data */
  const templateNames = useMemo(() => PROTOCOL_TEMPLATES.map((t) => t.name), [])
  const categories = useMemo(
    () => sortCategories(Array.from(new Set(protocols.map((p) => p.category)))),
    [protocols],
  )
  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const p of protocols) for (const t of p.tags) s.add(t)
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh'))
  }, [protocols])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let rows = protocols.filter((p) => {
      if (cat !== '全部' && p.category !== cat) return false
      if (selTags.length > 0 && !selTags.every((t) => p.tags.includes(t))) return false
      if (needle) {
        const hay = [
          p.name,
          p.description ?? '',
          ...p.tags,
          ...p.materials.map((m) => `${m.name} ${m.catalog ?? ''}`),
        ]
          .join('\n')
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sort === 'usage') return b.useCount - a.useCount
      return new Date(String(b.updatedAt)).getTime() - new Date(String(a.updatedAt)).getTime()
    })
    return rows
  }, [protocols, q, cat, selTags, sort])

  const totalUse = protocols.reduce((n, p) => n + p.useCount, 0)
  const libraryEmpty = !listQuery.isLoading && protocols.length === 0

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-16 md:px-8">
      <ProtocolToaster />

      {/* ============ 区块 1：页头 ============ */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-8">
        <div>
          <ProtocolCharTitle
            text="实验方法"
            className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[38px]"
          />
          <p className="caption-en mt-1" style={{ letterSpacing: '0.08em' }}>
            Protocols
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> 新建协议
        </button>
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-2 text-[13px] text-ink-soft"
      >
        共 {protocols.length} 个协议 · 6 个预置模板 · 累计使用 {totalUse} 次
      </motion.p>

      {/* ============ 区块 2：筛选工具栏（粘性） ============ */}
      <div
        ref={toolbarRef}
        className={cn(
          'sticky top-12 z-30 -mx-4 mt-4 bg-paper/95 px-4 py-3 backdrop-blur transition-shadow duration-200 md:top-14 md:-mx-8 md:px-8',
          stuck && 'border-b border-line',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* search */}
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索协议名、货号、细胞系…"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
            />
          </div>

          {/* category pills */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto py-0.5">
            {['全部', ...categories].map((c) => {
              const active = cat === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => patchParams({ cat: c === '全部' ? null : c })}
                  className={cn(
                    'relative h-9 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150',
                    active ? 'text-bench-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="protocol-cat-pill"
                      className="absolute inset-0 rounded-full bg-bench-wash"
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    />
                  )}
                  <span className="relative">{c}</span>
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* tag filter */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  标签
                  {selTags.length > 0 && (
                    <span className="rounded-full bg-bench-wash px-1.5 font-mono text-[11px] text-bench-ink">
                      {selTags.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 rounded-lg border-line p-2">
                {allTags.length === 0 && <p className="px-2 py-3 text-[12.5px] text-ink-mute">暂无标签</p>}
                <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {allTags.map((t) => {
                    const on = selTags.includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          patchParams({
                            tags: (on ? selTags.filter((x) => x !== t) : [...selTags, t]).join(',') || null,
                          })
                        }
                        className={cn(
                          'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150',
                          on ? 'bg-bench-wash text-bench-ink' : 'text-ink-soft hover:bg-paper',
                        )}
                      >
                        #{t}
                        {on && <span className="font-mono text-[11px]">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* sort */}
            <Select value={sort} onValueChange={(v) => patchParams({ sort: v === 'recent' ? null : v })}>
              <SelectTrigger className="h-9 w-[118px] border-line text-[12.5px] shadow-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* selected tag chips */}
        {selTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selTags.map((t) => (
              <ProtocolTagChip
                key={t}
                name={t}
                color={tagColors.get(t)}
                onRemove={() => patchParams({ tags: selTags.filter((x) => x !== t).join(',') || null })}
              />
            ))}
          </div>
        )}
      </div>

      {/* 空库自动提供一键导入 */}
      {libraryEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 flex flex-col items-start gap-3 rounded-xl border border-dashed border-bench/40 bg-bench-wash/40 px-5 py-4 sm:flex-row sm:items-center"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-bench" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">实验方法库还是空的</p>
            <p className="text-[12.5px] text-ink-soft">一键导入 6 个经实验室验证的预置模板，开箱即用。</p>
          </div>
          <button
            type="button"
            disabled={seedMut.isPending}
            onClick={() => importTemplates().catch((e) => toast.error(e instanceof Error ? e.message : '导入失败'))}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {seedMut.isPending ? '导入中…' : '一键导入预置模板'}
          </button>
        </motion.div>
      )}

      {/* ============ 区块 3：预置模板区 ============ */}
      {!filtersActive && (
        <div ref={templateSectionRef} className="mt-8 scroll-mt-28">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">
                预置模板 · 开箱即用
              </h2>
              <p className="text-[12.5px] text-ink-mute">经实验室验证的标准流程，复制后可按你的体系修改</p>
            </div>
            <button
              type="button"
              disabled={seedMut.isPending}
              onClick={() => importTemplates().catch((e) => toast.error(e instanceof Error ? e.message : '导入失败'))}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-bench/40 bg-surface px-3 text-[12.5px] font-medium text-bench shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-wash active:scale-[0.97] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {seedMut.isPending ? '导入中…' : '一键导入'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROTOCOL_TEMPLATES.map((t, i) => {
              const meta = TEMPLATE_META[t.name]
              const Icon = meta?.icon ?? FlaskConical
              const matched = protocols.find((p) => p.name === t.name)
              return (
                <motion.button
                  key={t.name}
                  type="button"
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.15 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTemplateClick(t.name)}
                  className={cn(
                    'group flex h-[200px] flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-shadow duration-180 hover:shadow-card-hover',
                    pulseTemplates && 'animate-pulse ring-2 ring-bench/50',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <motion.span
                      className="flex h-10 w-10 items-center justify-center rounded-[10px] transition-transform duration-180 group-hover:scale-[1.06]"
                      style={{ backgroundColor: wash(t.color), color: t.color }}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </motion.span>
                    <span className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-ink-mute">
                      {matched ? '已导入' : '模板'}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-[18px] font-semibold leading-[24px] text-ink">{t.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-[20px] text-ink-soft">{meta?.blurb ?? t.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="font-mono text-[12px] text-ink-mute">
                      {countSteps(t)} 步 · {t.materials.length} 材料
                      {matched ? ` · 使用 ${matched.useCount} 次` : ''}
                    </span>
                    <span className="flex items-center gap-0.5 text-[12.5px] font-medium text-bench">
                      查看
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
                    </span>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* ============ 区块 4：我的协议 ============ */}
      <div className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">我的协议</h2>
          <span className="font-mono text-[12px] text-ink-mute">{filtered.length}</span>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5 shadow-card">
            {(
              [
                { v: 'grid', icon: LayoutGrid, label: '网格视图' },
                { v: 'list', icon: ListIcon, label: '列表视图' },
              ] as const
            ).map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                onClick={() => setView(v)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
                  view === v ? 'bg-bench-wash text-bench-ink' : 'text-ink-mute hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* 空态 */
          <div className="flex flex-col items-center py-24">
            <img src="/empty-protocols.svg" alt="" className="h-[180px] w-[240px] object-contain" />
            <h3 className="mt-4 font-display text-[18px] font-semibold text-ink">
              {protocols.length === 0 ? '还没有自己的协议' : '没有符合条件的协议'}
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              {protocols.length === 0 ? '从预置模板开始，或新建一套属于你的标准流程' : '试试调整搜索词、分类或标签筛选'}
            </p>
            {protocols.length === 0 && (
              <button
                type="button"
                onClick={scrollToTemplates}
                className="mt-4 flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
              >
                从模板创建
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <GridCard
                key={p.id}
                p={p}
                index={i}
                isTemplate={templateNames.includes(p.name)}
                tagColors={tagColors}
                onDuplicate={() => duplicateProtocol(p)}
                onDelete={() => setPendingDelete(p)}
              />
            ))}
          </div>
        ) : (
          <ListView
            rows={filtered}
            tagColors={tagColors}
            onDuplicate={duplicateProtocol}
            onDelete={setPendingDelete}
          />
        )}
      </div>

      {/* 新建协议 */}
      <ProtocolEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onCreated={(id) => navigate(`/protocols/${id}`)}
      />

      {/* 归档确认 */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">归档该协议？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              「{pendingDelete?.name}」及其全部版本历史将被移除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
            >
              归档
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------------- grid card ---------------- */

function GridCard({
  p,
  index,
  isTemplate,
  tagColors,
  onDuplicate,
  onDelete,
}: {
  p: ProtocolListItem
  index: number
  isTemplate: boolean
  tagColors: Map<string, string>
  onDuplicate: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const Icon = isTemplate ? (TEMPLATE_META[p.name]?.icon ?? FlaskConical) : FlaskConical
  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/protocols/${p.id}`)}
      className="group relative flex h-40 cursor-pointer flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-shadow duration-180 hover:shadow-card-hover"
    >
      {iteratedRecently(p) && (
        <span
          className="absolute right-3 top-3 h-2 w-2 rounded-full bg-warning"
          title="30 天内已迭代版本"
        />
      )}
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: wash(p.color), color: p.color }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <h3 className="line-clamp-2 font-display text-[16px] font-semibold leading-[22px] text-ink">{p.name}</h3>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
          {p.version}
        </span>
        <span className="text-[11.5px] text-ink-mute">更新于 {relativeDate(p.updatedAt)}</span>
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-2">
        {p.tags.slice(0, 2).map((t) => (
          <ProtocolTagChip key={t} name={t} color={tagColors.get(t)} />
        ))}
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <ProtocolCardMenu p={p} onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
      </div>
    </motion.div>
  )
}

/* ---------------- card ⋯ menu ---------------- */

function ProtocolCardMenu({
  p,
  onDuplicate,
  onDelete,
}: {
  p: ProtocolListItem
  onDuplicate: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="更多操作"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-ink"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-lg border-line">
        <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => navigate(`/protocols/${p.id}`)}>
          <Eye className="h-4 w-4" /> 查看
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onDuplicate}>
          <Copy className="h-4 w-4" /> 复制为我的协议
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onSelect={() => {
            downloadMarkdown(`${p.name}-${p.version}.md`, protocolToMarkdown(p))
            toast.success('已导出 Markdown')
          }}
        >
          <FileDown className="h-4 w-4" /> 导出 Markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2 text-danger focus:text-danger" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" /> 归档
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ---------------- list view ---------------- */

function ListView({
  rows,
  tagColors,
  onDuplicate,
  onDelete,
}: {
  rows: ProtocolListItem[]
  tagColors: Map<string, string>
  onDuplicate: (p: ProtocolListItem) => void
  onDelete: (p: ProtocolListItem) => void
}) {
  const navigate = useNavigate()
  void tagColors
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="hidden grid-cols-[1.6fr_120px_80px_80px_110px_48px] gap-2 border-b border-line bg-paper px-4 py-2 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute md:grid">
        <span>协议名</span>
        <span>分类</span>
        <span>版本</span>
        <span>步骤数</span>
        <span>最近使用</span>
        <span />
      </div>
      {rows.map((p) => (
        <div
          key={p.id}
          onClick={() => navigate(`/protocols/${p.id}`)}
          className="grid cursor-pointer grid-cols-[1fr_48px] items-center gap-2 border-b border-line px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-paper md:grid-cols-[1.6fr_120px_80px_80px_110px_48px]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: wash(p.color), color: p.color }}
            >
              <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
          </span>
          <span className="hidden md:block">
            <span
              className="rounded-full px-2 py-0.5 text-[11.5px]"
              style={{ backgroundColor: wash(p.color), color: p.color }}
            >
              {p.category}
            </span>
          </span>
          <span className="hidden font-mono text-[12px] text-ink-soft md:block">{p.version}</span>
          <span className="hidden font-mono text-[12px] text-ink-soft md:block">{countSteps(p)}</span>
          <span className="hidden text-[12px] text-ink-mute md:block">{relativeDate(p.updatedAt)}</span>
          <span onClick={(e) => e.stopPropagation()}>
            <ProtocolCardMenu p={p} onDuplicate={() => onDuplicate(p)} onDelete={() => onDelete(p)} />
          </span>
        </div>
      ))}
    </div>
  )
}
