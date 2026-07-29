import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  MoreHorizontal,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import RecordDeviationTable from '@/components/records/RecordDeviationTable'
import RecordMarkdownEditor from '@/components/records/RecordMarkdownEditor'
import RecordImageGallery from '@/components/records/RecordImageGallery'
import type { RecordImageGalleryHandle } from '@/components/records/RecordImageGallery'
import RecordPropertiesPanel, {
  RecordActivityCard,
  RecordProtocolSnapshotCard,
} from '@/components/records/RecordPropertiesPanel'
import type { ProtocolParamLike } from '@/components/records/RecordPropertiesPanel'
import RecordStatusMenu from '@/components/records/RecordStatusMenu'
import { EASE_OUT, recordCode, todayStr } from '@/components/records/record-types'
import type {
  Deviation,
  ProtocolItem,
  RecordDetailData,
  RecordStatus,
} from '@/components/records/record-types'

const DRAFT_KEY = 'benchlog:draft:record-new'

type FormState = {
  title: string
  recordDate: string
  purpose: string
  projectId: number | null
  protocolId: number | null
  protocolVersion: string | null
  deviations: Deviation[]
  resultMd: string
  conclusion: string
  nextStep: string
  status: RecordStatus
  tags: string[]
}

const EMPTY_FORM: FormState = {
  title: '',
  recordDate: todayStr(),
  purpose: '',
  projectId: null,
  protocolId: null,
  protocolVersion: null,
  deviations: [],
  resultMd: '',
  conclusion: '',
  nextStep: '',
  status: 'ongoing',
  tags: [],
}

function formFromRecord(r: RecordDetailData): FormState {
  return {
    title: r.title,
    recordDate: r.recordDate,
    purpose: r.purpose ?? '',
    projectId: r.projectId ?? null,
    protocolId: r.protocolId ?? null,
    protocolVersion: r.protocolVersion ?? null,
    deviations: r.deviations ?? [],
    resultMd: r.resultMd ?? '',
    conclusion: r.conclusion ?? '',
    nextStep: r.nextStep ?? '',
    status: r.status,
    tags: r.tags ?? [],
  }
}

function paramToDefault(p: ProtocolParamLike): string {
  return p.unit ? `${p.value} ${p.unit}` : p.value
}

function deviationsFromParams(params: ProtocolParamLike[]): Deviation[] {
  return params.map((p) => {
    const def = paramToDefault(p)
    return { param: p.name, defaultValue: def, actualValue: def, reason: '' }
  })
}

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
}

export default function RecordDetail() {
  const params = useParams()
  const idParam = params.id
  const recordId = idParam ? Number(idParam) : null
  const isNew = recordId == null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const utils = trpc.useUtils()

  // pre-anchor from /records/new?protocol=<id>&version=<v>
  const preProtocolId = useMemo(() => {
    const v = searchParams.get('protocol')
    return v ? Number(v) : null
  }, [searchParams])

  // create-mode initial form: restore the autosaved draft (unless pre-anchored to a protocol)
  const [initialSeed] = useState(() => {
    if (!isNew || preProtocolId != null) return { form: EMPTY_FORM, draftRestored: false }
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormState>
        return {
          form: { ...EMPTY_FORM, ...draft, recordDate: draft.recordDate || todayStr() },
          draftRestored: true,
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
    return { form: EMPTY_FORM, draftRestored: false }
  })
  const [form, setForm] = useState<FormState>(initialSeed.form)
  const [deviationTouched, setDeviationTouched] = useState(initialSeed.draftRestored)
  const [snapshot, setSnapshot] = useState<string>(() => JSON.stringify(EMPTY_FORM))
  // tracks which record ('new' | id) the form has been initialized for
  const [initKey, setInitKey] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [savePulse, setSavePulse] = useState(false)
  const [flashKey, setFlashKey] = useState(0)
  const [propsOpen, setPropsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const galleryRef = useRef<RecordImageGalleryHandle | null>(null)
  const draftTimer = useRef<number | null>(null)

  const detailQuery = trpc.record.byId.useQuery(
    { id: recordId ?? 0 },
    { enabled: recordId != null },
  )
  const record = detailQuery.data ?? null

  const preProtocolQuery = trpc.protocol.byId.useQuery(
    { id: preProtocolId ?? 0 },
    { enabled: isNew && preProtocolId != null },
  )
  const protocolsQuery = trpc.protocol.list.useQuery()

  /* ---------------- initialization (state adjusted during render) ---------------- */
  const wantKey = isNew ? 'new' : `rec-${recordId}`
  if (initKey !== wantKey) {
    if (!isNew) {
      if (record) {
        const f = formFromRecord(record)
        setForm(f)
        setSnapshot(JSON.stringify(f))
        setInitKey(wantKey)
      }
    } else if (preProtocolId != null) {
      const p = preProtocolQuery.data
      if (p) {
        setForm({
          ...EMPTY_FORM,
          protocolId: p.id,
          protocolVersion: searchParams.get('version') || p.version,
          deviations: deviationsFromParams(p.params),
        })
        setSnapshot(JSON.stringify(EMPTY_FORM))
        setInitKey('new')
      }
    } else {
      // form already seeded from draft (or empty) by the useState initializer
      setInitKey('new')
    }
  }

  // draft autosave (create mode) — writes to localStorage (external system)
  useEffect(() => {
    if (!isNew || initKey !== 'new') return
    if (draftTimer.current) window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => {
      const isEmpty = JSON.stringify(form) === JSON.stringify(EMPTY_FORM)
      if (isEmpty) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    }, 600)
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current)
    }
  }, [form, isNew, initKey])

  const dirty = useMemo(() => JSON.stringify(form) !== snapshot, [form, snapshot])

  const patch = useCallback((p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }))
  }, [])

  /* ---------------- mutations ---------------- */
  const buildPayload = useCallback(() => {
    const deviations = form.deviations.filter(
      (d) => d.param.trim() || d.defaultValue.trim() || d.actualValue.trim(),
    )
    return {
      title: form.title.trim() || '未命名湿实验记录',
      recordDate: form.recordDate,
      purpose: form.purpose.trim() || undefined,
      projectId: form.projectId,
      protocolId: form.protocolId,
      protocolVersion: form.protocolId ? form.protocolVersion : null,
      deviations,
      resultMd: form.resultMd,
      conclusion: form.conclusion.trim() || undefined,
      nextStep: form.nextStep.trim() || undefined,
      status: form.status,
      tags: form.tags,
    }
  }, [form])

  const createMut = trpc.record.create.useMutation()
  const updateMut = trpc.record.update.useMutation()
  const updateStatusMut = trpc.record.updateStatus.useMutation()
  const removeMut = trpc.record.remove.useMutation()
  const incrementUseMut = trpc.protocol.incrementUse.useMutation()
  const saving = createMut.isPending || updateMut.isPending

  const doSave = useCallback(async (): Promise<number | null> => {
    const payload = buildPayload()
    try {
      if (isNew) {
        const { id } = await createMut.mutateAsync(payload)
        if (payload.protocolId) incrementUseMut.mutate({ id: payload.protocolId })
        localStorage.removeItem(DRAFT_KEY)
        await Promise.all([
          utils.record.list.invalidate(),
          utils.protocol.list.invalidate(),
          utils.protocol.byId.invalidate(),
        ])
        toast.success('记录已创建')
        navigate(`/records/${id}`, { replace: true })
        return id
      }
      await updateMut.mutateAsync({ id: recordId, ...payload })
      await Promise.all([
        utils.record.byId.invalidate({ id: recordId }),
        utils.record.list.invalidate(),
      ])
      setSnapshot(JSON.stringify(form))
      setLastSavedAt(new Date())
      setSavePulse(true)
      window.setTimeout(() => setSavePulse(false), 900)
      return recordId
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : '未知错误'}`)
      return null
    }
  }, [buildPayload, isNew, createMut, updateMut, incrementUseMut, utils, navigate, recordId, form])

  const ensureRecordId = useCallback(async (): Promise<number> => {
    if (recordId != null) return recordId
    const id = await doSave()
    if (id == null) throw new Error('save failed')
    return id
  }, [recordId, doSave])

  const onStatusChange = useCallback(
    async (s: RecordStatus) => {
      patch({ status: s })
      if (!isNew && recordId != null) {
        try {
          await updateStatusMut.mutateAsync({ id: recordId, status: s })
          await Promise.all([
            utils.record.byId.invalidate({ id: recordId }),
            utils.record.list.invalidate(),
          ])
          setSnapshot(JSON.stringify({ ...form, status: s }))
          toast.success(s === 'failed' ? '已标记失败 — 失败也是数据' : '状态已更新')
        } catch (e) {
          toast.error(`状态更新失败：${e instanceof Error ? e.message : ''}`)
        }
      }
    },
    [patch, isNew, recordId, updateStatusMut, utils, form],
  )

  /* ---------------- protocol anchoring ---------------- */
  const onProtocolChange = useCallback(
    (protocol: ProtocolItem | null) => {
      if (!protocol) {
        patch({ protocolId: null, protocolVersion: null })
        return
      }
      const prefill = () =>
        patch({
          protocolId: protocol.id,
          protocolVersion: protocol.version,
          deviations: deviationsFromParams(protocol.params),
        })
      if (!deviationTouched || form.deviations.length === 0) {
        prefill()
      } else if (window.confirm('切换方法将按新方法的参数表重铺「方法默认」列，确认？')) {
        setDeviationTouched(false)
        prefill()
      } else {
        patch({ protocolId: protocol.id, protocolVersion: protocol.version })
      }
    },
    [patch, form.deviations.length, deviationTouched],
  )

  const onReanchor = useCallback(
    (version: string, paramsForVersion: ProtocolParamLike[]) => {
      const apply = () => {
        const defaults = new Map(paramsForVersion.map((p) => [p.name, paramToDefault(p)]))
        // refresh the 方法默认 column, keep user-entered actual values
        const kept = form.deviations
          .filter((d) => defaults.has(d.param))
          .map((d) => ({ ...d, defaultValue: defaults.get(d.param)! }))
        for (const p of paramsForVersion) {
          if (!kept.some((d) => d.param === p.name)) {
            const def = paramToDefault(p)
            kept.push({ param: p.name, defaultValue: def, actualValue: def, reason: '' })
          }
        }
        patch({ protocolVersion: version, deviations: kept })
        setDeviationTouched(false)
      }
      if (!deviationTouched || window.confirm(`重新锚定到 ${version} 将刷新「方法默认」列，确认？`)) {
        apply()
        setFlashKey((k) => k + 1)
        toast.success(`已重新锚定到 ${version}`)
      }
    },
    [patch, form.deviations, deviationTouched],
  )

  /* ---------------- header actions ---------------- */
  const exportMarkdown = useCallback(() => {
    const images = record?.images ?? []
    const lines: string[] = [
      `# ${form.title || '未命名湿实验记录'}`,
      '',
      `- 日期：${form.recordDate}`,
      record?.protocol
        ? `- 方法：${record.protocol.name} ${form.protocolVersion ?? ''}（锚定版本）`
        : null,
      form.projectId != null && record?.project ? `- 项目：${record.project.name}` : null,
      form.tags.length ? `- 标签：${form.tags.map((t) => `#${t}`).join(' ')}` : null,
      `- 状态：${form.status}`,
      '',
      '## 实验目的',
      form.purpose || '（空）',
      '',
    ].filter((l): l is string => l != null)
    if (form.deviations.length > 0) {
      lines.push('## 参数偏离', '', '| 参数 | 方法默认 | 本次实际 | 偏离说明 |', '| --- | --- | --- | --- |')
      for (const d of form.deviations) {
        lines.push(`| ${d.param} | ${d.defaultValue} | ${d.actualValue} | ${d.reason ?? '—'} |`)
      }
      lines.push('')
    }
    lines.push('## 结果', form.resultMd || '（空）', '')
    if (images.length > 0) {
      lines.push('### 结果图片')
      for (const im of images) lines.push(`- [${im.kind}] ${im.caption ?? `图片 ${im.id}`}`)
      lines.push('')
    }
    lines.push('## 结论', form.conclusion || '（空）', '', '## 下一步', form.nextStep || '（空）')
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${record ? recordCode(record.id, record.recordDate) : 'record-draft'}.md`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('已导出 Markdown')
  }, [form, record])

  const duplicate = useCallback(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...form, title: `${form.title || '未命名湿实验记录'}（副本）` }),
    )
    toast.success('已复制为新记录草稿')
    navigate('/records/new')
  }, [form, navigate])

  const doDelete = useCallback(async () => {
    if (recordId == null) return
    try {
      await removeMut.mutateAsync({ id: recordId })
      await utils.record.list.invalidate()
      toast.success('记录已删除')
      navigate('/records')
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : ''}`)
    }
  }, [recordId, removeMut, utils, navigate])

  /* ---------------- render ---------------- */
  if (!isNew && detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded bg-line/60" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
          <div className="hidden h-64 animate-pulse rounded-xl border border-line bg-surface lg:block" />
        </div>
      </div>
    )
  }

  if (!isNew && detailQuery.data === null) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center px-4 py-24 text-center md:px-8">
        <img src="/empty-records.svg" alt="" className="w-[200px] opacity-70" />
        <h1 className="mt-6 font-display text-[20px] font-semibold text-ink">记录不存在</h1>
        <p className="mt-2 text-[13px] text-ink-mute">它可能已被删除，或者链接有误。</p>
        <Link
          to="/records"
          className="mt-5 flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white hover:bg-bench-deep"
        >
          返回记录列表
        </Link>
      </div>
    )
  }

  // displayed protocol follows the current (possibly unsaved) form selection
  const protocol =
    (form.protocolId != null
      ? (protocolsQuery.data ?? []).find((p) => p.id === form.protocolId)
      : undefined) ??
    record?.protocol ??
    preProtocolQuery.data ??
    null
  const images = record?.images ?? []
  const savedLabel = lastSavedAt
    ? `已保存 · ${`${lastSavedAt.getHours()}`.padStart(2, '0')}:${`${lastSavedAt.getMinutes()}`.padStart(2, '0')}`
    : !dirty && !isNew
      ? '已保存'
      : null

  const propertiesPanel = (
    <RecordPropertiesPanel
      recordDate={form.recordDate}
      onDateChange={(d) => patch({ recordDate: d })}
      projectId={form.projectId}
      onProjectChange={(pid) => patch({ projectId: pid })}
      protocolId={form.protocolId}
      protocolVersion={form.protocolVersion}
      onProtocolChange={onProtocolChange}
      onReanchor={onReanchor}
      status={form.status}
      onStatusChange={onStatusChange}
      tags={form.tags}
      onTagsChange={(t) => patch({ tags: t })}
      createdAt={record?.createdAt ?? null}
      updatedAt={record?.updatedAt ?? null}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-6">
      <Toaster position="top-right" />

      {/* ---------- header ---------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        className="flex flex-wrap items-center gap-2"
      >
        <nav className="flex min-w-0 items-center text-[12.5px] text-ink-mute">
          <Link to="/records" className="transition-colors duration-150 hover:text-bench">
            湿实验记录
          </Link>
          <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0" />
          {record?.project && (
            <>
              <span className="truncate">{record.project.name}</span>
              <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0" />
            </>
          )}
          <span className="truncate font-mono text-ink">
            {isNew ? '新建记录' : record ? recordCode(record.id, record.recordDate) : ''}
          </span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <RecordStatusMenu status={form.status} onChange={(s) => void onStatusChange(s)} />
          <motion.span
            key={savedLabel ?? 'dirty'}
            animate={savePulse ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="hidden font-mono text-[11.5px] text-ink-mute sm:block"
          >
            {savedLabel ?? (isNew && dirty ? '草稿暂存中' : '')}
          </motion.span>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={saving || (!dirty && !isNew)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium transition-all duration-150 active:scale-[0.97]',
              savePulse
                ? 'bg-success text-white'
                : dirty || isNew
                  ? 'bg-bench text-white shadow-card hover:-translate-y-px hover:bg-bench-deep'
                  : 'border border-line bg-surface text-ink-soft',
              saving && 'opacity-70',
            )}
          >
            {savePulse ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? '保存中…' : '保存'}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="更多操作"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={exportMarkdown} className="gap-2 text-[13px]">
                <Download className="h-3.5 w-3.5" /> 导出 Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => navigate(`/export?ids=${recordId ?? ''}`)}
                className="gap-2 text-[13px]"
              >
                <FileText className="h-3.5 w-3.5" /> 生成组会汇报条目
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate} className="gap-2 text-[13px]">
                <Copy className="h-3.5 w-3.5" /> 复制为新记录
              </DropdownMenuItem>
              {!isNew && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleteOpen(true)}
                    className="gap-2 text-[13px] text-danger focus:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* ---------- mobile: properties collapsible ---------- */}
      <div className="mt-4 lg:hidden">
        <button
          type="button"
          onClick={() => setPropsOpen((v) => !v)}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[13px] font-medium text-ink shadow-card"
        >
          属性
          <span className="font-mono text-[11px] text-ink-mute">
            {form.recordDate}
            {protocol ? ` · ${protocol.name} ${form.protocolVersion ?? ''}` : ''}
          </span>
          <ChevronDown
            className={cn(
              'ml-auto h-4 w-4 text-ink-mute transition-transform duration-200',
              propsOpen && 'rotate-180',
            )}
          />
        </button>
        {propsOpen && <div className="mt-2">{propertiesPanel}</div>}
      </div>

      {/* ---------- main grid ---------- */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="flex min-w-0 flex-col gap-6"
        >
          {/* title */}
          <motion.div variants={sectionVariants} className="relative">
            <input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={isNew ? '未命名湿实验记录' : '给这次实验起个名字…'}
              className="peer w-full border-none bg-transparent pb-2 font-display text-[22px] font-bold leading-[32px] text-ink outline-none placeholder:text-ink-mute md:text-[28px] md:leading-[38px]"
            />
            <span className="absolute bottom-0 left-0 h-[2px] w-full bg-line" aria-hidden />
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-bench transition-transform duration-[250ms] ease-paper peer-focus:scale-x-100"
            />
          </motion.div>

          {/* purpose */}
          <motion.section variants={sectionVariants}>
            <p className="caption-en mb-1.5">实验目的 PURPOSE</p>
            <textarea
              value={form.purpose}
              onChange={(e) => {
                patch({ purpose: e.target.value })
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.max(e.target.scrollHeight, 66)}px`
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto'
                  el.style.height = `${Math.max(el.scrollHeight, 66)}px`
                }
              }}
              rows={3}
              placeholder="为什么做这次实验？假设是什么？"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
            />
          </motion.section>

          {/* deviations */}
          <motion.section variants={sectionVariants}>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
              <p className="caption-en">参数偏离 DEVIATIONS</p>
              <span className="text-[11.5px] text-ink-mute">
                {form.protocolVersion
                  ? `与方法 ${form.protocolVersion} 默认值的差异，自动对比生成`
                  : '关联方法后自动铺入默认参数'}
              </span>
            </div>
            <RecordDeviationTable
              deviations={form.deviations}
              onChange={(rows) => {
                setDeviationTouched(true)
                patch({ deviations: rows })
              }}
              flashKey={flashKey}
            />
          </motion.section>

          {/* result */}
          <motion.section variants={sectionVariants}>
            <p className="caption-en mb-1.5">结果 RESULTS</p>
            <RecordMarkdownEditor
              value={form.resultMd}
              onChange={(v) => patch({ resultMd: v })}
              onPasteFiles={(files) => galleryRef.current?.uploadFiles(files)}
              onInsertImage={() => galleryRef.current?.pick(false)}
            />
            <div className="mt-3">
              <RecordImageGallery
                ref={galleryRef}
                recordId={recordId}
                images={images}
                ensureRecordId={ensureRecordId}
              />
            </div>
          </motion.section>

          {/* conclusion / next step */}
          <motion.section variants={sectionVariants} className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="caption-en mb-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                结论 CONCLUSION
              </p>
              <textarea
                value={form.conclusion}
                onChange={(e) => patch({ conclusion: e.target.value })}
                rows={4}
                placeholder="这次实验回答了什么？数据支持什么结论？"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-success"
              />
            </div>
            <div>
              <p className="caption-en mb-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-info" />
                下一步 NEXT STEP
              </p>
              <textarea
                value={form.nextStep}
                onChange={(e) => patch({ nextStep: e.target.value })}
                rows={4}
                placeholder="接下来做什么？是否已排期（见日程）？"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-info"
              />
            </div>
          </motion.section>
        </motion.div>

        {/* sidebar (desktop) */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.15 }}
          className="hidden flex-col gap-4 lg:sticky lg:top-[72px] lg:flex lg:self-start"
        >
          {propertiesPanel}
          {protocol && (
            <RecordProtocolSnapshotCard protocol={protocol} anchoredVersion={form.protocolVersion} />
          )}
          {record && (
            <RecordActivityCard
              createdAt={record.createdAt}
              updatedAt={record.updatedAt}
              imageCount={images.length}
              status={form.status}
            />
          )}
        </motion.aside>
      </div>

      {/* ---------- mobile bottom bar: 保存 + 拍照上传 ---------- */}
      <div className="fixed inset-x-0 bottom-14 z-40 flex h-16 items-center gap-2 border-t border-line bg-surface/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => void doSave()}
          disabled={saving}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-[13.5px] font-medium text-ink transition-colors duration-150 active:scale-[0.98] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : dirty || isNew ? '保存' : '已保存'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.pick(true)}
          className="flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-lg bg-bench text-[13.5px] font-medium text-white shadow-card transition-all duration-150 active:scale-[0.98]"
        >
          <Camera className="h-4 w-4" />
          拍照上传
        </button>
      </div>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">删除这条记录？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              记录与其结果图片将被永久删除。失败记录也是数据，确认要删除吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doDelete()}
              className="bg-danger text-white hover:bg-danger/90"
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
