import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { format, startOfMonth, subDays } from 'date-fns'
import { ChevronDown, History, X } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import ExportScopeCard from '@/components/export/ExportScopeCard'
import ExportTemplateCard from '@/components/export/ExportTemplateCard'
import ExportActions from '@/components/export/ExportActions'
import ReportPaper from '@/components/export/ReportPaper'
import ExportHistoryDrawer from '@/components/export/ExportHistoryDrawer'
import ExportMarkdownDrawer from '@/components/export/ExportMarkdownDrawer'
import type {
  DateRange,
  RecordStatus,
  ReportOptions,
  ReportTemplate,
  ScopePreset,
} from '@/components/export/reportTypes'
import {
  buildCsv,
  buildGroupMarkdown,
  buildTsv,
  downloadTextFile,
  mmdd,
  reportFileName,
} from '@/components/export/reportBuild'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultRange(): DateRange {
  const today = todayStr()
  // 组会周节奏：默认最近 7 天到今天
  return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today }
}

function parseTemplate(v: string | null): ReportTemplate {
  if (v === 'md' || v === 'markdown') return 'markdown'
  if (v === 'table') return 'table'
  if (v === 'pdf') return 'pdf'
  return 'markdown'
}

function templateParam(t: ReportTemplate): string {
  return t === 'markdown' ? 'md' : t
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export default function Export() {
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const [searchParams, setSearchParams] = useSearchParams()

  // ------- 范围状态（支持 URL query 同步 ?template=&range=&ids=） -------
  const [preset, setPreset] = useState<ScopePreset>(() => {
    const r = searchParams.get('range')
    return r === 'week' || r === 'month' || r === 'recent10' || r === 'custom'
      ? r
      : 'week'
  })
  const [range, setRange] = useState<DateRange>(() => defaultRange())
  const [projectIds, setProjectIds] = useState<number[]>([])
  const [statusFilter, setStatusFilter] = useState<RecordStatus[]>([])
  const [manualIds, setManualIds] = useState<number[] | null>(null)
  const [excludedIds, setExcludedIds] = useState<number[]>([])
  const broughtInRef = useRef(false)

  const [template, setTemplate] = useState<ReportTemplate>(() =>
    parseTemplate(searchParams.get('template')),
  )
  const [options, setOptions] = useState<ReportOptions>({
    includeImages: true,
    includeDeviations: true,
    includeFailed: true,
    anonymize: false,
  })

  const [historyOpen, setHistoryOpen] = useState(false)
  const [mdDrawerOpen, setMdDrawerOpen] = useState(false)
  const [editedMd, setEditedMd] = useState<string | null>(null)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // ------- 数据查询 -------
  const projectsQuery = trpc.project.list.useQuery()
  const recordListQuery = trpc.record.list.useQuery()
  const historyQuery = trpc.exportLog.list.useQuery()
  const saveLog = trpc.exportLog.saveLog.useMutation({
    onSuccess: () => utils.exportLog.list.invalidate(),
  })

  // 从 /records 多选携带 ?ids= 进入
  useEffect(() => {
    if (broughtInRef.current) return
    const idsParam = searchParams.get('ids')
    if (!idsParam) return
    const ids = idsParam
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length === 0) return
    broughtInRef.current = true
    setPreset('custom')
    setManualIds(ids)
    toast.success(`已从记录列表带入 ${ids.length} 条`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL query 同步
  useEffect(() => {
    const params: Record<string, string> = {
      template: templateParam(template),
      range: preset,
    }
    if (preset === 'custom' && manualIds?.length) params.ids = manualIds.join(',')
    setSearchParams(params, { replace: true })
  }, [template, preset, manualIds, setSearchParams])

  const applyPreset = (p: ScopePreset) => {
    setPreset(p)
    setExcludedIds([])
    const today = todayStr()
    if (p === 'week') setRange({ from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today })
    else if (p === 'month') setRange({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: today })
  }

  const recent10Ids = useMemo(
    () => (recordListQuery.data ?? []).slice(0, 10).map((r) => r.id),
    [recordListQuery.data],
  )

  const effectiveIds: number[] | null = useMemo(() => {
    if (preset === 'recent10') return recordListQuery.data ? recent10Ids : null
    if (preset === 'custom') return manualIds
    return null
  }, [preset, manualIds, recent10Ids, recordListQuery.data])

  // ------- 导出数据（300ms 防抖） -------
  const queryInput = useMemo(() => {
    if (effectiveIds) return { recordIds: effectiveIds }
    return {
      from: range.from,
      to: range.to,
      ...(projectIds.length ? { projectIds } : {}),
    }
  }, [effectiveIds, range.from, range.to, projectIds])

  // recent10 需等待 record.list 返回，避免退化为全量日期查询
  const waitingForRecent = preset === 'recent10' && !recordListQuery.data
  const queryEnabled = !waitingForRecent && (effectiveIds === null || effectiveIds.length > 0)

  const [debouncedInput, setDebouncedInput] = useState(queryInput)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(queryInput), 300)
    return () => clearTimeout(t)
  }, [queryInput])

  const dataQuery = trpc.exportLog.data.useQuery(debouncedInput, { enabled: queryEnabled })
  const debouncing = JSON.stringify(debouncedInput) !== JSON.stringify(queryInput)
  const scopeLoading = debouncing || waitingForRecent || (queryEnabled && dataQuery.isLoading)

  // 客户端筛选：移除项 / 状态 / 失败开关
  const records = useMemo(() => {
    let rs = dataQuery.data ?? []
    if (excludedIds.length) rs = rs.filter((r) => !excludedIds.includes(r.id))
    if (statusFilter.length) rs = rs.filter((r) => statusFilter.includes(r.status))
    if (!options.includeFailed) rs = rs.filter((r) => r.status !== 'failed')
    return rs
  }, [dataQuery.data, excludedIds, statusFilter, options.includeFailed])

  const stats = useMemo(
    () => ({
      records: records.length,
      projects: new Set(records.map((r) => r.projectId ?? 'none')).size,
      images: records.reduce((n, r) => n + (options.includeImages ? r.images.length : 0), 0),
    }),
    [records, options.includeImages],
  )

  // ------- 报告文本 -------
  const meta = useMemo(
    () => ({
      researcher: user?.name ?? '××',
      rangeLabel: effectiveIds
        ? preset === 'recent10'
          ? '最近 10 条'
          : `手动挑选 ${effectiveIds.length} 条`
        : `${mmdd(range.from)} → ${mmdd(range.to)}`,
      today: todayStr(),
    }),
    [user?.name, effectiveIds, preset, range.from, range.to],
  )

  const generatedMd = useMemo(
    () => buildGroupMarkdown(records, options, meta),
    [records, options, meta],
  )
  // 范围/选项变化时丢弃手动微调
  useEffect(() => setEditedMd(null), [generatedMd])
  const markdown = editedMd ?? generatedMd

  const signature = useMemo(
    () =>
      [
        template,
        JSON.stringify(debouncedInput),
        options.includeImages,
        options.includeDeviations,
        options.includeFailed,
        options.anonymize,
        records.length,
      ].join('|'),
    [template, debouncedInput, options, records.length],
  )

  const scopeForLog = () => ({
    preset,
    from: range.from,
    to: range.to,
    ...(projectIds.length ? { projectIds } : {}),
    ...(effectiveIds?.length ? { recordIds: effectiveIds } : {}),
    ...(statusFilter.length ? { statuses: statusFilter } : {}),
    template,
    count: records.length,
  })

  const afterExport = () => {
    setDone(true)
    window.setTimeout(() => setDone(false), 800)
  }

  // ------- 导出操作 -------
  const empty = records.length === 0

  const guard = (fn: () => void | Promise<void>) => async () => {
    if (empty || busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const doCopyMarkdown = guard(async () => {
    await copyText(markdown)
    saveLog.mutate({ format: 'markdown', scope: scopeForLog(), content: markdown })
    toast.success(`已复制 Markdown · ${records.length} 条记录`)
    afterExport()
  })

  const doDownloadMd = guard(() => {
    const name = reportFileName('markdown', new Date())
    downloadTextFile(name, markdown, 'text/markdown;charset=utf-8')
    saveLog.mutate({ format: 'markdown', scope: scopeForLog(), content: markdown })
    toast.success(`已导出 ${name} · ${records.length} 条记录`)
    afterExport()
  })

  const doDownloadCsv = guard(() => {
    const csv = buildCsv(records, options)
    const name = reportFileName('table', new Date())
    downloadTextFile(name, csv, 'text/csv;charset=utf-8')
    saveLog.mutate({ format: 'table', scope: scopeForLog(), content: csv })
    toast.success(`已导出 ${name} · ${records.length} 条记录`)
    afterExport()
  })

  const doCopyTable = guard(async () => {
    await copyText(buildTsv(records, options))
    saveLog.mutate({
      format: 'table',
      scope: scopeForLog(),
      content: buildCsv(records, options),
    })
    toast.success(`已复制表格（TSV）· ${records.length} 条记录，可直接粘贴到 Excel`)
    afterExport()
  })

  const doPrintPdf = guard(() => {
    saveLog.mutate({ format: 'pdf', scope: scopeForLog() })
    window.setTimeout(() => {
      window.print()
      toast.success(`已导出 ${reportFileName('pdf', new Date())} · ${records.length} 条记录`)
      afterExport()
    }, 350)
  })

  const doPrintOnly = () => {
    if (empty || busy) return
    window.print()
  }

  const primaryHandler =
    template === 'markdown' ? doCopyMarkdown : template === 'table' ? doDownloadCsv : doPrintPdf
  const secondaryHandler =
    template === 'markdown' ? doDownloadMd : template === 'table' ? doCopyTable : doPrintOnly

  // ------- 范围卡片回调 -------
  const toggleProject = (id: number) =>
    setProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  const toggleStatus = (s: RecordStatus) =>
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  const toggleManual = (id: number) =>
    setManualIds((prev) => {
      const cur = prev ?? []
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return next.length ? next : null
    })
  const removeRecord = (id: number) => {
    if (manualIds) toggleManual(id)
    else setExcludedIds((prev) => [...prev, id])
  }

  const actionsProps = {
    template,
    disabled: empty,
    busy,
    done,
    onPrimary: primaryHandler,
    onSecondary: secondaryHandler,
    onPrint: doPrintOnly,
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-8 md:px-8 md:pb-10">
      <Toaster position="top-right" />

      {/* 区块 1 · 页头 */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-bold text-ink md:text-[30px]">
            {'汇报导出'.split('').map((ch, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: EASE }}
              >
                {ch}
              </motion.span>
            ))}
          </h1>
          <p className="caption-en mt-1">Export &amp; Archive</p>
          <p className="mt-2 text-[13px] text-ink-mute">
            把湿实验记录变成一页清晰的组会汇报，或归档为 PDF 长存。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          <History className="h-4 w-4" />
          导出历史
        </button>
      </header>

      {/* 移动端：预览折叠条 */}
      <button
        type="button"
        onClick={() => setMobilePreviewOpen(true)}
        className="mt-4 flex h-10 w-full items-center justify-between rounded-lg border border-line bg-surface px-3 text-[13px] text-ink-soft shadow-card md:hidden"
      >
        <span>
          预览 · <span className="font-mono">{stats.records}</span> 条记录
        </span>
        <ChevronDown className="h-4 w-4 text-ink-mute" />
      </button>

      {/* 主区域：左栏 380px + 右栏实时预览 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[380px,1fr]">
        <div className="flex flex-col gap-4">
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.05, ease: EASE }}
          >
            <ExportScopeCard
              preset={preset}
              onPreset={applyPreset}
              range={range}
              onRange={setRange}
              projects={projectsQuery.data ?? []}
              projectIds={projectIds}
              onToggleProject={toggleProject}
              statusFilter={statusFilter}
              onToggleStatus={toggleStatus}
              allRecords={recordListQuery.data ?? []}
              recordsLoading={recordListQuery.isLoading}
              manualIds={manualIds}
              onToggleManual={toggleManual}
              onClearManual={() => setManualIds(null)}
              selectedRecords={records}
              onRemoveRecord={removeRecord}
              stats={stats}
              scopeLoading={scopeLoading}
            />
          </motion.div>
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.13, ease: EASE }}
          >
            <ExportTemplateCard
              template={template}
              onTemplate={setTemplate}
              options={options}
              onOptions={setOptions}
            />
          </motion.div>
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.21, ease: EASE }}
            className="hidden md:block"
          >
            <ExportActions {...actionsProps} />
          </motion.div>
        </div>

        {/* 右栏 · A4 实时预览（桌面） */}
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.2, ease: EASE }}
          className="hidden md:block"
        >
          <ReportPaper
            template={template}
            records={records}
            options={options}
            markdown={markdown}
            markdownEdited={editedMd !== null}
            meta={meta}
            loading={scopeLoading && records.length === 0}
            signature={signature}
            onEditMarkdown={() => setMdDrawerOpen(true)}
          />
        </motion.div>
      </div>

      {/* 移动端：全屏预览覆盖层 */}
      <AnimatePresence>
        {mobilePreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex flex-col bg-paper md:hidden"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
              <span className="text-[13px] font-medium text-ink">
                预览 · <span className="font-mono">{stats.records}</span> 条记录
              </span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                aria-label="关闭预览"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors duration-150 hover:bg-paper"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ReportPaper
                template={template}
                records={records}
                options={options}
                markdown={markdown}
                markdownEdited={editedMd !== null}
                meta={meta}
                loading={scopeLoading && records.length === 0}
                signature={signature}
                printable={false}
                onEditMarkdown={() => {
                  setMobilePreviewOpen(false)
                  setMdDrawerOpen(true)
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 移动端：底部固定导出条（位于 56px Tab Bar 之上） */}
      <div className="fixed inset-x-0 bottom-14 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={primaryHandler}
          disabled={empty || busy}
          className={cn(
            'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-white shadow-card transition-all duration-150 active:scale-[0.98]',
            done ? 'bg-success' : 'bg-bench',
            (empty || busy) && 'opacity-60',
          )}
        >
          {busy ? '正在生成…' : done ? '已导出 ✓' : '一键导出'}
        </button>
      </div>

      <ExportHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        logs={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
      />
      <ExportMarkdownDrawer
        open={mdDrawerOpen}
        onOpenChange={setMdDrawerOpen}
        value={markdown}
        edited={editedMd !== null}
        onChange={(v) => setEditedMd(v)}
        onReset={() => setEditedMd(null)}
      />
    </div>
  )
}
