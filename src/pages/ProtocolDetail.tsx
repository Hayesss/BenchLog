import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Copy,
  FileDown,
  FileText,
  GitCompareArrows,
  History,
  MoreHorizontal,
  Pencil,
  Play,
  Rocket,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
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
import ProtocolCharTitle from '@/components/protocols/ProtocolCharTitle'
import ProtocolEditorDialog from '@/components/protocols/ProtocolEditorDialog'
import ProtocolMaterials from '@/components/protocols/ProtocolMaterials'
import ProtocolSteps, { stepKey } from '@/components/protocols/ProtocolSteps'
import ProtocolTagChip, { useProtocolTagColors } from '@/components/protocols/ProtocolTagChip'
import ProtocolToaster from '@/components/protocols/ProtocolToaster'
import { ProtocolDiffDialog, ProtocolVersionBadge } from '@/components/protocols/ProtocolVersionControls'
import {
  countSteps,
  downloadMarkdown,
  formatDate,
  protocolToMarkdown,
  type ProtocolContentView,
} from '@/components/protocols/protocolShared'
import { cn } from '@/lib/utils'

const RECORD_STATUS: Record<string, { label: string; className: string }> = {
  ongoing: { label: '进行中', className: 'bg-info/10 text-info' },
  done: { label: '已完成', className: 'bg-success/10 text-success' },
  failed: { label: '失败重复', className: 'bg-danger/10 text-danger' },
}

function loadProgress(pid: number): Record<string, boolean> {
  try {
    return JSON.parse(sessionStorage.getItem(`benchlog:proto-progress:${pid}`) ?? '{}')
  } catch {
    return {}
  }
}

export default function ProtocolDetail() {
  const { id } = useParams()
  const pid = Number(id)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [searchParams, setSearchParams] = useSearchParams()
  const tagColors = useProtocolTagColors()

  const enabled = Number.isFinite(pid)
  const protocolQuery = trpc.protocol.byId.useQuery({ id: pid }, { enabled })
  const versionsQuery = trpc.protocol.listVersions.useQuery({ protocolId: pid }, { enabled })
  const recordsQuery = trpc.record.list.useQuery(undefined, { enabled })

  const protocol = protocolQuery.data ?? null
  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data])

  /* ------- version viewing state (?v=vX.Y) ------- */
  const viewParam = searchParams.get('v')
  const viewingVersion =
    protocol && viewParam && viewParam !== protocol.version
      ? versions.find((v) => v.version === viewParam) ?? null
      : null
  const isHistory = !!viewingVersion
  const content: ProtocolContentView | null = protocol
    ? isHistory
      ? viewingVersion.snapshot
      : protocol
    : null

  function selectVersion(v: string | null) {
    const next = new URLSearchParams(searchParams)
    if (v == null) next.delete('v')
    else next.set('v', v)
    setSearchParams(next, { replace: true })
  }

  /* ------- session-local check-off state (steps + materials) ------- */
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadProgress(pid))
  useEffect(() => {
    setChecked(loadProgress(pid))
  }, [pid])
  useEffect(() => {
    try {
      sessionStorage.setItem(`benchlog:proto-progress:${pid}`, JSON.stringify(checked))
    } catch {
      /* noop */
    }
  }, [pid, checked])
  const toggle = useCallback((key: string) => setChecked((m) => ({ ...m, [key]: !m[key] })), [])

  /* ------- step refs + flash for "下一步" ------- */
  const stepRefs = useRef(new Map<string, HTMLDivElement>())
  const registerStepRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) stepRefs.current.set(key, el)
    else stepRefs.current.delete(key)
  }, [])
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const stepsRef = useRef<HTMLDivElement>(null)

  const totalSteps = content ? countSteps(content) : 0
  const doneSteps = content
    ? content.stepGroups.reduce(
        (n, g, gi) => n + g.steps.filter((_, si) => checked[stepKey(gi, si)]).length,
        0,
      )
    : 0

  const nextStepInfo = useMemo(() => {
    if (!content) return null
    for (let gi = 0; gi < content.stepGroups.length; gi++) {
      const g = content.stepGroups[gi]
      for (let si = 0; si < g.steps.length; si++) {
        if (!checked[stepKey(gi, si)]) return { key: stepKey(gi, si), text: g.steps[si].text }
      }
    }
    return null
  }, [content, checked])

  function scrollToNextStep() {
    if (!nextStepInfo) {
      toast.success('全部步骤已完成')
      return
    }
    const el = stepRefs.current.get(nextStepInfo.key)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashKey(nextStepInfo.key)
    window.setTimeout(() => setFlashKey(null), 1100)
  }

  /* ------- mutations & dialogs ------- */
  const incrementUse = trpc.protocol.incrementUse.useMutation()
  const removeMut = trpc.protocol.remove.useMutation()
  const createMut = trpc.protocol.create.useMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  function createRecordFromProtocol() {
    if (!protocol) return
    incrementUse.mutate({ id: protocol.id })
    navigate(`/records/new?protocol=${protocol.id}&version=${encodeURIComponent(protocol.version)}`)
  }

  async function duplicateProtocol() {
    if (!protocol) return
    try {
      const { id: newId } = await createMut.mutateAsync({
        name: `${protocol.name} 副本`,
        category: protocol.category,
        color: protocol.color,
        description: protocol.description ?? undefined,
        materials: protocol.materials,
        stepGroups: protocol.stepGroups,
        params: protocol.params,
        tags: protocol.tags,
        version: 'v1.0',
      })
      await utils.protocol.list.invalidate()
      toast.success('已复制为我的方法')
      navigate(`/protocols/${newId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制失败')
    }
  }

  async function confirmDelete() {
    if (!protocol) return
    try {
      await removeMut.mutateAsync({ id: protocol.id })
      await utils.protocol.list.invalidate()
      toast.success(`已归档「${protocol.name}」`)
      navigate('/protocols')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const relatedRecords = useMemo(
    () => (recordsQuery.data ?? []).filter((r) => r.protocolId === pid).slice(0, 3),
    [recordsQuery.data, pid],
  )

  /* ------- loading / not found ------- */
  if (protocolQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-line/50" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
            ))}
          </div>
          <div className="hidden h-64 animate-pulse rounded-lg border border-line bg-surface lg:block" />
        </div>
      </div>
    )
  }

  if (!protocol || !content) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center px-4 py-24 md:px-8">
        <ProtocolToaster />
        <img src="/empty-protocols.svg" alt="" className="h-[180px] w-[240px] object-contain" />
        <h1 className="mt-4 font-display text-[20px] font-semibold text-ink">方法不存在或已归档</h1>
        <Link
          to="/protocols"
          className="mt-4 flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep"
        >
          返回实验方法库
        </Link>
      </div>
    )
  }

  const progressPct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100)
  const ringR = 13
  const ringC = 2 * Math.PI * ringR

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-8 md:px-8">
      <ProtocolToaster />

      {/* ============ 历史版本 amber 提示条 ============ */}
      {isHistory && viewingVersion && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink">
            你正在查看历史版本 <span className="font-mono font-medium">{viewingVersion.version}</span>
            （{formatDate(viewingVersion.createdAt)}）· 当前版本{' '}
            <span className="font-mono font-medium">{protocol.version}</span>
          </p>
          <button
            type="button"
            onClick={() => setDiffOpen(true)}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-warning transition-colors duration-150 hover:bg-warning/10"
          >
            <GitCompareArrows className="h-3.5 w-3.5" /> 对比差异
          </button>
          <button
            type="button"
            onClick={() => selectVersion(null)}
            className="flex h-8 items-center rounded-lg bg-warning px-3 text-[12.5px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px active:scale-[0.97]"
          >
            回到最新版
          </button>
        </motion.div>
      )}

      {/* ============ 区块 0：页头 ============ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <nav className="flex min-w-0 items-center text-[13px] text-ink-mute">
          <Link to="/protocols" className="transition-colors duration-150 hover:text-bench">
            实验方法
          </Link>
          <ChevronRight className="mx-1 h-3.5 w-3.5" />
          <span>{content.category}</span>
          <ChevronRight className="mx-1 h-3.5 w-3.5" />
          <span className="truncate text-ink">{content.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <ProtocolVersionBadge
            current={protocol.version}
            versions={versions}
            viewing={content.version}
            onSelect={selectVersion}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="更多操作"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg border-line">
              <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> 编辑方法
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => setPublishOpen(true)}>
                <Rocket className="h-4 w-4" /> 发布新版本
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onSelect={() => {
                  downloadMarkdown(`${protocol.name}-${protocol.version}.md`, protocolToMarkdown(protocol))
                  toast.success('已导出 Markdown')
                }}
              >
                <FileDown className="h-4 w-4" /> 导出 Markdown
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onSelect={duplicateProtocol}>
                <Copy className="h-4 w-4" /> 复制
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-danger focus:text-danger"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> 归档
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ============ 区块 1：标题与元信息 ============ */}
      <ProtocolCharTitle
        text={content.name}
        className="mt-3 font-display text-[22px] font-bold leading-[30px] text-ink md:text-[28px] md:leading-[36px]"
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-2 font-mono text-[12.5px] text-ink-mute"
      >
        {content.version} · 更新于 {formatDate(protocol.updatedAt)} · 使用 {protocol.useCount} 次 · 共 {totalSteps} 步
        · {content.materials.length} 材料
      </motion.p>
      {content.tags.length > 0 && (
        <motion.div
          className="mt-2.5 flex flex-wrap gap-1.5"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } } }}
        >
          {content.tags.map((t) => (
            <motion.span
              key={t}
              variants={{
                hidden: { opacity: 0, scale: 0.8 },
                show: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 300 } },
              }}
            >
              <ProtocolTagChip name={t} color={tagColors.get(t)} />
            </motion.span>
          ))}
        </motion.div>
      )}

      {/* ============ 双栏 ============ */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ------- 主栏 ------- */}
        <div className="min-w-0 space-y-8">
          {/* 区块 2：简介 */}
          {content.description && (
            <section>
              <p className="max-w-[65ch] text-[14px] leading-[22px] text-ink-soft">{content.description}</p>
              {!isHistory && versions[0]?.note && (
                <blockquote className="mt-3 max-w-[65ch] rounded-r-lg border-l-[3px] border-bench bg-paper px-4 py-3 text-[13px] leading-[21px] text-ink-soft">
                  <span className="font-mono font-medium text-bench-ink">{protocol.version}</span>
                  {'：'}
                  {versions[0].note}
                </blockquote>
              )}
            </section>
          )}

          {/* 区块 3：材料清单 */}
          <ProtocolMaterials
            materials={content.materials}
            checked={checked}
            onToggle={toggle}
            readOnly={isHistory}
          />

          {/* 区块 4：操作步骤 */}
          <div ref={stepsRef}>
            <ProtocolSteps
              groups={content.stepGroups}
              checkedMap={checked}
              onToggle={toggle}
              params={content.params}
              registerStepRef={registerStepRef}
              flashKey={flashKey}
              readOnly={isHistory}
            />
          </div>

          {/* 区块 5：注意事项 / 参数备注（折叠） */}
          {content.params.some((p) => p.note) && (
            <section>
              <Accordion type="single" collapsible>
                <AccordionItem value="notes" className="rounded-lg border border-line bg-surface px-4 shadow-card">
                  <AccordionTrigger className="py-3 text-[15px] font-semibold tracking-[0.01em] text-ink hover:no-underline">
                    <span className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-warning" /> 注意事项 · 关键参数备注
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pb-1">
                      {content.params
                        .filter((p) => p.note)
                        .map((p) => (
                          <div key={p.name} className="flex items-baseline gap-2 text-[13px]">
                            <span className="shrink-0 font-medium text-ink">{p.name}</span>
                            <span className="shrink-0 font-mono text-[12.5px] text-bench">
                              {p.value}
                              {p.unit ? ` ${p.unit}` : ''}
                            </span>
                            <span className="text-ink-soft">{p.note}</span>
                          </div>
                        ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          )}

          {/* 区块 6：版本变更记录 */}
          <section ref={timelineRef} className="scroll-mt-24">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-ink-mute" />
              <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">版本变更记录</h3>
            </div>
            <div className="relative ml-1.5 border-l-2 border-line pl-5">
              {/* current node */}
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative pb-5"
              >
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-bench bg-surface" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[15px] font-semibold text-ink">{protocol.version}</span>
                  <span className="font-mono text-[11.5px] text-ink-mute">{formatDate(protocol.updatedAt)}</span>
                  <span className="rounded bg-bench-wash px-1.5 py-0.5 text-[10.5px] font-medium text-bench-ink">
                    当前版本
                  </span>
                </div>
              </motion.div>
              {versions.map((v, i) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, x: -6 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="relative pb-5 last:pb-1"
                >
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-paper" />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-[15px] font-semibold text-ink">{v.version}</span>
                    <span className="font-mono text-[11.5px] text-ink-mute">{formatDate(v.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => selectVersion(v.version)}
                      className="text-[12px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
                    >
                      查看快照
                    </button>
                  </div>
                  {v.note && <p className="mt-0.5 text-[12.5px] leading-[19px] text-ink-soft">{v.note}</p>}
                </motion.div>
              ))}
              {versions.length === 0 && (
                <p className="pb-1 text-[12.5px] text-ink-mute">尚无历史版本，「发布新版本」后会自动留存快照。</p>
              )}
            </div>
          </section>
        </div>

        {/* ------- 侧栏 ------- */}
        <aside className="min-w-0 lg:sticky lg:top-[72px] lg:self-start">
          <div className="space-y-4">
            {/* 本次实验进度卡 */}
            <div className="rounded-lg border border-line border-l-[3px] border-l-bench bg-surface p-4 shadow-card">
              <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">本次实验进度 SESSION</p>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-mono text-[28px] font-medium leading-none text-ink">
                  {doneSteps}
                  <span className="text-[16px] text-ink-mute">/{totalSteps}</span>
                </span>
                <span className="font-mono text-[12px] text-ink-mute">{progressPct}%</span>
              </div>
              <div className="mt-2 h-0.5 w-full rounded-full bg-line/70">
                <motion.div
                  className="h-full rounded-full bg-bench"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              {isHistory ? (
                <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-warning">
                  历史版本为只读快照，回到最新版后可开始实验。
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionActive(true)
                      stepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      if (nextStepInfo) scrollToNextStep()
                    }}
                    className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-bench text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
                  >
                    <Play className="h-4 w-4" />
                    {sessionActive || doneSteps > 0 ? '继续本次实验' : '开始本次实验'}
                  </button>
                  <button
                    type="button"
                    onClick={createRecordFromProtocol}
                    className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[12.5px] font-medium text-bench shadow-card transition-colors duration-150 hover:bg-bench-wash"
                  >
                    基于此方法新建记录
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* 关键参数速查卡 */}
            {content.params.length > 0 && (
              <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
                <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">关键参数速查 PARAMS</p>
                <div className="mt-2 divide-y divide-line">
                  {content.params.slice(0, 6).map((p) => (
                    <div key={p.name} className="flex items-baseline justify-between gap-2 py-1.5">
                      <span className="text-[12.5px] text-ink-soft">{p.name}</span>
                      <span className="font-mono text-[13px] font-medium text-bench">
                        {p.value}
                        {p.unit ? <span className="ml-0.5 text-[11px] text-ink-mute">{p.unit}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 版本历史迷你列表 */}
            <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">版本历史 VERSIONS</p>
                <button
                  type="button"
                  onClick={() => timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="text-[12px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
                >
                  全部 →
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12.5px] font-medium text-ink">{protocol.version}</span>
                  <span className="rounded bg-bench-wash px-1.5 text-[10.5px] text-bench-ink">当前</span>
                </div>
                {versions.slice(0, 3).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectVersion(v.version)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-0.5 text-left transition-colors duration-150 hover:bg-paper"
                  >
                    <span className="font-mono text-[12.5px] text-ink-soft">{v.version}</span>
                    <span className="font-mono text-[11px] text-ink-mute">{formatDate(v.createdAt)}</span>
                  </button>
                ))}
                {versions.length === 0 && <p className="text-[12px] text-ink-mute">仅此一版</p>}
              </div>
            </div>

            {/* 最近关联记录 */}
            <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">最近关联记录 RECORDS</p>
                <Link
                  to={`/records?protocol=${pid}`}
                  className="text-[12px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep"
                >
                  全部 →
                </Link>
              </div>
              <div className="mt-2 space-y-1.5">
                {relatedRecords.length === 0 && (
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-mute">
                    <FileText className="h-3.5 w-3.5" /> 暂无关联记录
                  </p>
                )}
                {relatedRecords.map((r) => {
                  const st = RECORD_STATUS[r.status] ?? RECORD_STATUS.ongoing
                  return (
                    <Link
                      key={r.id}
                      to={`/records/${r.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] leading-[18px] text-ink">{r.title}</span>
                        <span className="font-mono text-[11px] text-ink-mute">{r.recordDate}</span>
                      </span>
                      <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', st.className)}>
                        {st.label}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* mobile spacer for fixed bottom bar */}
      {!isHistory && totalSteps > 0 && <div className="h-16 md:hidden" />}

      {/* ============ 移动端底部固定操作条 ============ */}
      {!isHistory && totalSteps > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-40 flex h-16 items-center gap-3 border-t border-line bg-surface px-4 shadow-overlay md:hidden">
          {/* progress ring */}
          <div className="relative h-10 w-10 shrink-0">
            <svg viewBox="0 0 32 32" className="h-10 w-10 -rotate-90">
              <circle cx="16" cy="16" r={ringR} fill="none" stroke="#E9E6DF" strokeWidth="2.5" />
              <motion.circle
                cx="16"
                cy="16"
                r={ringR}
                fill="none"
                stroke="#3E7C6B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={ringC}
                initial={false}
                animate={{ strokeDashoffset: ringC * (1 - progressPct / 100) }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] font-medium text-ink">
              {doneSteps}/{totalSteps}
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToNextStep}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-bench text-[13px] font-medium text-white shadow-card transition-all duration-150 active:scale-[0.97]"
          >
            {nextStepInfo ? (
              <>
                <span className="truncate">下一步骤：{nextStepInfo.text}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </>
            ) : (
              '全部步骤已完成 ✓'
            )}
          </button>
        </div>
      )}

      {/* ============ dialogs ============ */}
      <ProtocolEditorDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" protocol={protocol} />
      <ProtocolEditorDialog open={publishOpen} onOpenChange={setPublishOpen} mode="publish" protocol={protocol} />
      {viewingVersion && (
        <ProtocolDiffDialog
          open={diffOpen}
          onOpenChange={setDiffOpen}
          oldVersion={viewingVersion.version}
          oldDate={viewingVersion.createdAt}
          oldContent={viewingVersion.snapshot}
          newContent={protocol}
        />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">归档该方法？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              「{protocol.name}」及其全部版本历史将被移除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="rounded-lg bg-danger text-white hover:bg-danger/90">
              归档
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
