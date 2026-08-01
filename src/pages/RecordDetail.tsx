import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Printer,
  FileText,
  History,
  LayoutTemplate,
  Lock,
  LockOpen,
  MoreHorizontal,
  Save,
  Trash2,
  Users,
  X,
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
import { ShareButton } from '@/components/share/ShareButton'
import { ShareMembersDialog } from '@/components/collab/ShareMembersDialog'
import RecordDeviationTable from '@/components/records/RecordDeviationTable'
import RichEditor, { textToInitialHtml } from '@/components/records/RichEditor'
import type { OutlineItem, RichEditorHandle } from '@/components/records/RichEditor'
import RecordImageGallery from '@/components/records/RecordImageGallery'
import type { RecordImageGalleryHandle } from '@/components/records/RecordImageGallery'
import RecordPropertiesPanel, {
  RecordActivityCard,
  RecordProtocolSnapshotCard,
} from '@/components/records/RecordPropertiesPanel'
import type { ProtocolParamLike } from '@/components/records/RecordPropertiesPanel'
import RecordStatusMenu from '@/components/records/RecordStatusMenu'
import RecordAttachments from '@/components/records/RecordAttachments'
import RecordVersionsDialog from '@/components/records/RecordVersionsDialog'
import TableImportDialog from '@/components/records/TableImportDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
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
  contentHtml: string
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
  contentHtml: '',
  conclusion: '',
  nextStep: '',
  status: 'ongoing',
  tags: [],
}

/** Benchling 式大编辑面：辅助区块默认折叠，让正文编辑器占据主视野 */
function CollapsibleBlock({
  title,
  hint,
  defaultOpen,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <motion.section variants={sectionVariants}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-bench-wash"
      >
        <p className="caption-en">{title}</p>
        {hint && <span className="text-[11.5px] text-ink-mute">{hint}</span>}
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-ink-mute transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </motion.section>
  )
}

function htmlToText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
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
    // 老记录无富文本正文：由 resultMd 纯文本转为初始段落，实现无缝升级
    contentHtml: r.contentHtml ?? (r.resultMd ? textToInitialHtml(r.resultMd) : ''),
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
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const editorRef = useRef<RichEditorHandle>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [savePulse, setSavePulse] = useState(false)
  const [flashKey, setFlashKey] = useState(0)
  const [propsOpen, setPropsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [lockNote, setLockNote] = useState('')
  const [tplSaveOpen, setTplSaveOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  // 套用模板后 bump 此值强制 RichEditor 重挂载，让新正文进入编辑器
  const [editorEpoch, setEditorEpoch] = useState(0)
  // P2-D2 表格转样本：解析出的表格行（非空即打开入库 dialog）
  const [importRows, setImportRows] = useState<string[][] | null>(null)
  const galleryRef = useRef<RecordImageGalleryHandle | null>(null)
  const draftTimer = useRef<number | null>(null)

  const detailQuery = trpc.record.byId.useQuery(
    { id: recordId ?? 0 },
    { enabled: recordId != null },
  )
  const record = detailQuery.data ?? null
  // 签署锁定（P2-C1）：锁定后整页只读，服务端同步拒绝一切写操作
  const lockedAt = record?.lockedAt ?? null
  const locked = lockedAt != null
  // #20-II 协作角色：owner > editor（可编辑内容）> viewer（只读共享）
  const access = record?.access ?? null
  const isViewer = access === 'viewer'
  const isOwner = access == null || access === 'owner'
  // 编辑闸口：签署锁定 或 viewer 只读共享
  const readOnly = locked || isViewer

  const preProtocolQuery = trpc.protocol.byId.useQuery(
    { id: preProtocolId ?? 0 },
    { enabled: isNew && preProtocolId != null },
  )
  const protocolsQuery = trpc.protocol.list.useQuery()
  const templatesQuery = trpc.recordTemplate.list.useQuery(undefined, { enabled: isNew })

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
  // 刷新/关闭标签页时拦截未保存修改（新建模式另有 localStorage 草稿兜底）
  useUnsavedGuard(dirty)

  // Benchling 式自动保存：停止输入 2.5s 自动入库（保存中跳过，dirty 仍在则下一轮再试）
  const doSaveRef = useRef<( () => Promise<number | null>) | null>(null)
  const savingRef = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const t = window.setTimeout(() => {
      if (!savingRef.current) void doSaveRef.current?.()
    }, 2500)
    return () => window.clearTimeout(t)
  }, [form, dirty])

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
    contentHtml: form.contentHtml,
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
  const lockMut = trpc.record.lock.useMutation()
  const unlockMut = trpc.record.unlock.useMutation()
  const tplCreateMut = trpc.recordTemplate.create.useMutation()
  const tplRemoveMut = trpc.recordTemplate.remove.useMutation()
  const tplTouchMut = trpc.recordTemplate.touch.useMutation()
  const saving = createMut.isPending || updateMut.isPending

  savingRef.current = saving

  const doSave = useCallback(async (): Promise<number | null> => {
    if (!isNew && readOnly) {
      toast.error(locked ? '记录已签署锁定，无法保存修改' : '你对此记录只有查看权限')
      return null
    }
    const payload = buildPayload()
    try {
      if (isNew) {
        const { id } = await createMut.mutateAsync(payload)
        if (payload.protocolId) incrementUseMut.mutate({ id: payload.protocolId })
        localStorage.removeItem(DRAFT_KEY)
        // 同步 snapshot，避免 create 后 dirty 残留触发 2.5s 冗余 update（顺带产生幽灵版本快照）
        setSnapshot(JSON.stringify(form))
        setLastSavedAt(new Date())
        await Promise.all([
          utils.record.invalidate(),
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
        utils.record.invalidate(),
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
  }, [buildPayload, isNew, readOnly, locked, createMut, updateMut, incrementUseMut, utils, navigate, recordId, form])
  doSaveRef.current = doSave

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
            utils.record.invalidate(),
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
    const bodyText = form.contentHtml ? htmlToText(form.contentHtml) : form.resultMd
    lines.push('## 结果', bodyText || '（空）', '')
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
      await utils.record.invalidate()
      toast.success('记录已删除')
      navigate('/records')
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : ''}`)
    }
  }, [recordId, removeMut, utils, navigate])

  /* ---------------- 锁定签署（P2-C1） ---------------- */
  const doLock = useCallback(async () => {
    if (recordId == null) return
    try {
      // 锁定前把未保存修改先落库，保证锁定内容即最终内容
      if (dirty) {
        const saved = await doSave()
        if (saved == null) return
      }
      const res = await lockMut.mutateAsync({ id: recordId, note: lockNote.trim() || undefined })
      await Promise.all([
        utils.record.byId.invalidate({ id: recordId }),
        utils.record.invalidate(),
      ])
      setLockOpen(false)
      setLockNote('')
      toast.success(res.reused ? '记录已处于锁定状态' : '记录已签署锁定，内容转为只读')
    } catch (e) {
      toast.error(`锁定失败：${e instanceof Error ? e.message : ''}`)
    }
  }, [recordId, dirty, doSave, lockMut, lockNote, utils])

  const doUnlock = useCallback(async () => {
    if (recordId == null) return
    if (!window.confirm('解除锁定后记录将恢复可编辑，确认解除？')) return
    try {
      await unlockMut.mutateAsync({ id: recordId })
      await Promise.all([
        utils.record.byId.invalidate({ id: recordId }),
        utils.record.invalidate(),
      ])
      toast.success('已解除锁定，记录恢复可编辑')
    } catch (e) {
      toast.error(`解锁失败：${e instanceof Error ? e.message : ''}`)
    }
  }, [recordId, unlockMut, utils])

  /* ---------------- 记录模板（P2-C2） ---------------- */
  const applyTemplate = useCallback(
    async (tplId: number) => {
      const hasBody = form.contentHtml.replace(/<[^>]*>/g, '').trim().length > 0
      if (hasBody && !window.confirm('当前草稿已有正文，套用模板将覆盖现有内容，确认？')) return
      try {
        const tpl = await utils.recordTemplate.byId.fetch({ id: tplId })
        setForm((f) => ({
          ...f,
          contentHtml: tpl.contentHtml ?? '',
          purpose: tpl.purpose ?? f.purpose,
          tags: tpl.tags.length > 0 ? tpl.tags : f.tags,
        }))
        setEditorEpoch((e) => e + 1)
        void tplTouchMut.mutateAsync({ id: tplId }).catch(() => {})
        void utils.recordTemplate.list.invalidate()
        toast.success(`已套用模板「${tpl.name}」`)
      } catch (e) {
        toast.error(`套用模板失败：${e instanceof Error ? e.message : ''}`)
      }
    },
    [form.contentHtml, utils, tplTouchMut],
  )

  const doSaveTemplate = useCallback(async () => {
    const name = tplName.trim()
    if (!name) return
    try {
      await tplCreateMut.mutateAsync({
        name,
        contentHtml: form.contentHtml || undefined,
        purpose: form.purpose.trim() || undefined,
        tags: form.tags,
      })
      await utils.recordTemplate.list.invalidate()
      setTplSaveOpen(false)
      toast.success(`模板「${name}」已保存`)
    } catch (e) {
      toast.error(`保存模板失败：${e instanceof Error ? e.message : ''}`)
    }
  }, [tplName, form, tplCreateMut, utils])

  const doRemoveTemplate = useCallback(
    async (tplId: number, name: string) => {
      if (!window.confirm(`删除模板「${name}」？此操作不影响已创建的记录。`)) return
      try {
        await tplRemoveMut.mutateAsync({ id: tplId })
        await utils.recordTemplate.list.invalidate()
        toast.success('模板已删除')
      } catch (e) {
        toast.error(`删除模板失败：${e instanceof Error ? e.message : ''}`)
      }
    },
    [tplRemoveMut, utils],
  )

  /* ---------------- render ---------------- */
  if (!isNew && detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded bg-line/60" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
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

  // #20-II：无权访问（NOT_FOUND 抛错）与行不存在（data null）同页呈现——刻意不区分，防存在性探测
  if (!isNew && (detailQuery.data === null || detailQuery.isError)) {
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
  const lockTimeLabel = lockedAt
    ? `${lockedAt.getFullYear()}-${`${lockedAt.getMonth() + 1}`.padStart(2, '0')}-${`${lockedAt.getDate()}`.padStart(2, '0')} ${`${lockedAt.getHours()}`.padStart(2, '0')}:${`${lockedAt.getMinutes()}`.padStart(2, '0')}`
    : ''
  const savedLabel = lastSavedAt
    ? `已保存 · ${`${lastSavedAt.getHours()}`.padStart(2, '0')}:${`${lastSavedAt.getMinutes()}`.padStart(2, '0')}`
    : !dirty && !isNew
      ? '已保存'
      : null

  const propertiesPanel = (
    <div className={readOnly ? 'pointer-events-none opacity-75' : undefined}>
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
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-6">
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
          <RecordStatusMenu status={form.status} onChange={(s) => void onStatusChange(s)} disabled={readOnly} />
          {locked && (
            <span className="flex h-8 items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-3 text-[12.5px] font-medium text-warning">
              <Lock className="h-3.5 w-3.5" />
              已锁定
            </span>
          )}
          {!isNew && record?.id != null && (
            <ShareButton kind="record" targetId={record.id} />
          )}
          {!isNew && record?.id != null && isOwner && (
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              <Users className="h-4 w-4" />
              成员
            </button>
          )}
          {!isNew && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              <History className="h-4 w-4" />
              历史
            </button>
          )}
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
            disabled={saving || (!dirty && !isNew) || readOnly}
            title={locked ? '记录已锁定' : isViewer ? '共享只读，无法保存' : undefined}
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
              <DropdownMenuItem onSelect={() => window.print()} className="gap-2 text-[13px]">
                <Printer className="h-3.5 w-3.5" /> 打印 / 导出 PDF
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
              <DropdownMenuItem
                onSelect={() => {
                  setTplName(form.title || '')
                  setTplSaveOpen(true)
                }}
                className="gap-2 text-[13px]"
              >
                <LayoutTemplate className="h-3.5 w-3.5" /> 存为模板…
              </DropdownMenuItem>
              {!isNew &&
                isOwner &&
                (locked ? (
                  <DropdownMenuItem onSelect={() => void doUnlock()} className="gap-2 text-[13px]">
                    <LockOpen className="h-3.5 w-3.5" /> 解除锁定
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setLockOpen(true)} className="gap-2 text-[13px]">
                    <Lock className="h-3.5 w-3.5" /> 锁定记录…
                  </DropdownMenuItem>
                ))}
              {!isNew && isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleteOpen(true)}
                    disabled={locked}
                    title={locked ? '记录已锁定，解除锁定后才能删除' : undefined}
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
          {/* 锁定横幅（P2-C1） */}
          {locked && (
            <motion.div
              variants={sectionVariants}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5"
            >
              <Lock className="h-4 w-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink">
                本记录已于 {lockTimeLabel} 签署锁定
                {record?.lockedNote ? `：${record.lockedNote}` : ''}
                。内容只读，解除锁定后方可修改。
              </p>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => void doUnlock()}
                  disabled={unlockMut.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-warning/60 bg-surface px-3 text-[12.5px] font-medium text-warning transition-colors duration-150 hover:bg-warning/10 disabled:opacity-60"
                >
                  <LockOpen className="h-3.5 w-3.5" />
                  {unlockMut.isPending ? '解除中…' : '解除锁定'}
                </button>
              )}
            </motion.div>
          )}

          {/* 共享只读横幅（#20-II viewer） */}
          {isViewer && (
            <motion.div
              variants={sectionVariants}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-bench-wash px-4 py-2.5"
            >
              <Users className="h-4 w-4 shrink-0 text-bench" />
              <p className="min-w-0 flex-1 text-[13px] leading-5 text-ink">
                本记录由 {record?.ownerName ?? '所有者'} 共享给你，当前为只读查看权限。
              </p>
            </motion.div>
          )}

          {/* title */}
          <motion.div variants={sectionVariants} className="relative">
            <input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={readOnly}
              placeholder={isNew ? '未命名湿实验记录' : '给这次实验起个名字…'}
              className="peer w-full border-none bg-transparent pb-2 font-display text-[24px] font-bold leading-[34px] text-ink outline-none placeholder:text-ink-mute disabled:cursor-not-allowed disabled:opacity-75 md:text-[32px] md:leading-[42px]"
            />
            <span className="absolute bottom-0 left-0 h-[2px] w-full bg-line" aria-hidden />
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-bench transition-transform duration-[250ms] ease-paper peer-focus:scale-x-100"
            />
          </motion.div>

          {/* 从模板开始（P2-C2，仅新建页） */}
          {isNew && (
            <motion.section variants={sectionVariants}>
              <p className="caption-en mb-1.5">从模板开始 TEMPLATES</p>
              {templatesQuery.isLoading ? (
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 w-44 animate-pulse rounded-xl border border-line bg-surface" />
                  ))}
                </div>
              ) : (templatesQuery.data ?? []).length === 0 ? (
                <p className="text-[12.5px] text-ink-mute">
                  暂无模板 — 在任意记录的右上角菜单里「存为模板」，把常用实验结构沉淀下来。
                </p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {(templatesQuery.data ?? []).map((t) => (
                    <div key={t.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => void applyTemplate(t.id)}
                        className="flex h-16 w-44 flex-col items-start justify-center gap-1 rounded-xl border border-line bg-surface px-3 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:border-bench"
                      >
                        <span className="flex w-full items-center gap-1.5 text-[13px] font-medium text-ink">
                          <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-bench" />
                          <span className="truncate">{t.name}</span>
                        </span>
                        <span className="font-mono text-[10.5px] text-ink-mute">
                          用过 {t.useCount} 次 · {t.updatedAt.getMonth() + 1}月{t.updatedAt.getDate()}日
                        </span>
                      </button>
                      <button
                        type="button"
                        title="删除模板"
                        onClick={() => void doRemoveTemplate(t.id, t.name)}
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-mute shadow-card transition-colors duration-150 hover:text-danger group-hover:flex"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          )}

          {/* notebook —— Benchling 式：正文即主角，紧随标题 */}
          <motion.section variants={sectionVariants}>
            <p className="caption-en mb-1.5">实验正文 NOTEBOOK</p>
            <div className="flex items-start gap-5">
              {outline.length > 0 && (
                <aside className="hidden w-52 shrink-0 xl:block">
                  <div className="sticky top-24">
                    <p className="caption-en mb-2">大纲 OUTLINE</p>
                    <nav className="space-y-0.5">
                      {outline.map((o, i) => (
                        <button
                          key={`${o.pos}-${i}`}
                          type="button"
                          onClick={() => editorRef.current?.scrollToPos(o.pos)}
                          className="block w-full truncate rounded-lg px-2 py-1 text-left text-[12px] text-ink-soft transition-colors hover:bg-bench-wash hover:text-bench-deep"
                          style={{ paddingLeft: `${(o.level - 1) * 12 + 8}px` }}
                        >
                          {o.text}
                        </button>
                      ))}
                    </nav>
                  </div>
                </aside>
              )}
              <div className="min-w-0 flex-1">
                <RichEditor
                  ref={editorRef}
                  key={`${initKey ?? 'new'}-e${editorEpoch}`}
                  initialHtml={initKey === wantKey ? form.contentHtml : ''}
                  onChange={(html) => patch({ contentHtml: html })}
                  onOutlineChange={setOutline}
                  readOnly={readOnly}
                  onImportTable={(rows) => setImportRows(rows)}
                />
              </div>
            </div>
            <div className={cn('mt-3', readOnly && 'pointer-events-none opacity-75')}>
              <RecordImageGallery
                ref={galleryRef}
                recordId={recordId}
                images={images}
                ensureRecordId={ensureRecordId}
              />
            </div>
          </motion.section>

          {/* purpose */}
          <CollapsibleBlock
            key={`purpose-${initKey ?? 'new'}`}
            title="实验目的 PURPOSE"
            hint={form.purpose ? '已填写' : undefined}
            defaultOpen={!!form.purpose}
          >
            <textarea
              value={form.purpose}
              disabled={readOnly}
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
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench disabled:cursor-not-allowed disabled:opacity-75"
            />
          </CollapsibleBlock>

          {/* deviations */}
          <CollapsibleBlock
            key={`deviations-${initKey ?? 'new'}`}
            title="参数偏离 DEVIATIONS"
            hint={
              form.deviations.length > 0
                ? `${form.deviations.length} 项偏离`
                : form.protocolVersion
                  ? `与方法 ${form.protocolVersion} 自动对比`
                  : '关联方法后自动铺入默认参数'
            }
            defaultOpen={form.deviations.length > 0}
          >
            <div className={readOnly ? 'pointer-events-none opacity-75' : undefined}>
            <RecordDeviationTable
              deviations={form.deviations}
              onChange={(rows) => {
                setDeviationTouched(true)
                patch({ deviations: rows })
              }}
              flashKey={flashKey}
            />
            </div>
          </CollapsibleBlock>

          {/* attachments */}
          <motion.section
            variants={sectionVariants}
            className={readOnly ? 'pointer-events-none opacity-75' : undefined}
          >
            <RecordAttachments recordId={recordId} ensureRecordId={ensureRecordId} />
          </motion.section>

          {/* F4 Relevant Items：本记录引用的对象 + 被哪些记录引用（双向链接） */}
          {record && (record.refs.length > 0 || record.referencedBy.length > 0) && (
            <motion.section variants={sectionVariants}>
              <p className="caption-en mb-1.5">引用 LINKS</p>
              <div className="rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card">
                {record.refs.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11.5px] text-ink-mute">本记录引用</p>
                    <div className="flex flex-wrap gap-1.5">
                      {record.refs.map((r) =>
                        r.target ? (
                          <Link
                            key={`${r.kind}-${r.id}`}
                            to={r.target.href}
                            title={r.target.sub ?? undefined}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-opacity hover:opacity-75"
                            style={{
                              color:
                                r.kind === 'record'
                                  ? '#3E7C6B'
                                  : r.kind === 'protocol'
                                    ? '#5B7C99'
                                    : '#7A5BA6',
                              backgroundColor:
                                r.kind === 'record'
                                  ? '#3E7C6B14'
                                  : r.kind === 'protocol'
                                    ? '#5B7C9914'
                                    : '#7A5BA614',
                            }}
                          >
                            {r.kind === 'record' ? '记录' : r.kind === 'protocol' ? '方法' : '样本'}
                            · {r.target.label}
                          </Link>
                        ) : (
                          <span
                            key={`${r.kind}-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-line/40 px-2 py-1 text-[12px] text-ink-mute"
                            title="目标已删除或不存在"
                          >
                            {r.kind === 'record' ? '记录' : r.kind === 'protocol' ? '方法' : '样本'}
                            · 已失效
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {record.referencedBy.length > 0 && (
                  <div className={record.refs.length > 0 ? 'mt-2.5 border-t border-line pt-2.5' : ''}>
                    <p className="mb-1.5 text-[11.5px] text-ink-mute">
                      被引用（{record.referencedBy.length}）
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {record.referencedBy.map((rb) => (
                        <Link
                          key={rb.recordId}
                          to={`/records/${rb.recordId}`}
                          title={`${rb.recordDate} · ${rb.status === 'ongoing' ? '进行中' : rb.status === 'done' ? '已完成' : '已失败'}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-opacity hover:opacity-75"
                          style={{ color: '#3E7C6B', backgroundColor: '#3E7C6B14' }}
                        >
                          记录 · {rb.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {/* conclusion / next step */}
          <motion.section variants={sectionVariants} className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="caption-en mb-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                结论 CONCLUSION
              </p>
              <textarea
                value={form.conclusion}
                disabled={readOnly}
                onChange={(e) => patch({ conclusion: e.target.value })}
                rows={4}
                placeholder="这次实验回答了什么？数据支持什么结论？"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-success disabled:cursor-not-allowed disabled:opacity-75"
              />
            </div>
            <div>
              <p className="caption-en mb-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-info" />
                下一步 NEXT STEP
              </p>
              <textarea
                value={form.nextStep}
                disabled={readOnly}
                onChange={(e) => patch({ nextStep: e.target.value })}
                rows={4}
                placeholder="接下来做什么？是否已排期（见日程）？"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-[22px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-info disabled:cursor-not-allowed disabled:opacity-75"
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
          disabled={saving || readOnly}
          className="flex h-11 flex-[3] items-center justify-center gap-1.5 rounded-lg bg-bench text-[13.5px] font-medium text-white shadow-card transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
        >
          {savePulse ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? '保存中…' : dirty || isNew ? '保存' : '已保存'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.pick(true)}
          className="flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-[13.5px] font-medium text-ink transition-colors duration-150 active:scale-[0.98]"
        >
          <Camera className="h-4 w-4" />
          拍照上传
        </button>
      </div>

      {/* 表格转样本入库 dialog（P2-D2） */}
      <TableImportDialog
        open={importRows != null}
        onOpenChange={(v) => {
          if (!v) setImportRows(null)
        }}
        tableRows={importRows ?? []}
        ensureRecordId={ensureRecordId}
        defaultDate={form.recordDate}
      />

      {/* 锁定签署 dialog（P2-C1）：preventDefault 阻止自动关闭，待 mutation 完成后手动关 */}
      {!isNew && record?.id != null && isOwner && (
        <ShareMembersDialog
          kind="record"
          targetId={record.id}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      <AlertDialog open={lockOpen} onOpenChange={setLockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">签署并锁定这条记录？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              锁定后记录的内容、状态、图片与附件均转为只读，任何修改都会被服务端拒绝。可随时由本人解除锁定，锁事件本身即审计痕迹。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={lockNote}
            onChange={(e) => setLockNote(e.target.value)}
            maxLength={255}
            placeholder="签署语（可选）：如「数据已复核，结果属实」"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-warning"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void doLock()
              }}
              disabled={lockMut.isPending}
              className="bg-warning text-white hover:bg-warning/90"
            >
              {lockMut.isPending ? '锁定中…' : '签署锁定'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 存为模板 dialog（P2-C2）：正文/目的/标签随名称一起沉淀 */}
      <AlertDialog open={tplSaveOpen} onOpenChange={setTplSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">把当前记录存为模板</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              模板将保存当前正文结构{form.purpose.trim() ? '、实验目的' : ''}
              {form.tags.length > 0 ? '与标签' : ''}，新建记录时可一键套用。
              {!form.contentHtml && (
                <span className="mt-1 block text-warning">当前正文为空，模板将只保存目的与标签。</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            maxLength={120}
            placeholder="模板名称：如「细胞传代标准流程」"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void doSaveTemplate()
              }}
              disabled={tplCreateMut.isPending || !tplName.trim()}
              className="bg-bench text-white hover:bg-bench-deep"
            >
              {tplCreateMut.isPending ? '保存中…' : '保存模板'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">删除这条记录？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              记录与其结果图片、附件、历史版本将被永久删除。失败记录也是数据，确认要删除吗？
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

      {/* version history */}
      {!isNew && recordId != null && (
        <RecordVersionsDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          recordId={recordId}
        />
      )}
    </div>
  )
}
