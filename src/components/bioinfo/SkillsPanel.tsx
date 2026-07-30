import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const SKILL_CATEGORIES = ['文件处理', '比对与定量', '差异与统计', '可视化', '单细胞', '流程与环境', '其他'] as const
export const SKILL_LANGUAGES = ['Bash', 'R', 'Python', 'Nextflow', 'Snakemake', '其他'] as const

type Skill = {
  id: number
  title: string
  category: string
  language: string
  summary: string | null
  code: string
  source: string | null
  updatedAt: Date
}

type Form = { title: string; category: string; language: string; summary: string; code: string; source: string }

const EMPTY_FORM: Form = { title: '', category: '其他', language: 'Bash', summary: '', code: '', source: '' }

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench'
const monoCls = cn(inputCls, 'font-mono text-[12.5px] leading-[18px]')
const chipCls = (active: boolean) =>
  cn(
    'h-8 rounded-full border px-3 text-[12.5px] transition-colors duration-150',
    active ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line bg-surface text-ink-soft hover:bg-paper',
  )

function copyCode(code: string) {
  void navigator.clipboard.writeText(code).then(
    () => toast.success('代码已复制'),
    () => toast.error('复制失败，请打开详情手动选择复制'),
  )
}

/** 代码预览：取前 4 行，超出行数显示剩余行数（诚实预览，非 CSS 截断） */
function codePreview(code: string): { text: string; rest: number } {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const head = lines.slice(0, 4).join('\n')
  return { text: head, rest: Math.max(0, lines.length - 4) }
}

/* ------------------------------- 编辑对话框 ------------------------------- */

function SkillEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Form
  onSave: (f: Form) => void
  saving: boolean
}) {
  const [form, setForm] = useState<Form>(initial)
  // 每次打开时重置为 initial
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm(initial)
  }
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] rounded-xl border-line">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-semibold text-ink">
            {initial.title ? '编辑技能' : '新建技能'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto pr-1">
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">技能名称 *</p>
            <input
              className={inputCls}
              placeholder="例：DESeq2 差异表达标准流程 / samtools 常用过滤命令"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">分类</p>
              <select className={cn(inputCls, 'appearance-none')} value={form.category} onChange={(e) => patch({ category: e.target.value })}>
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">语言 / 形态</p>
              <select className={cn(inputCls, 'appearance-none')} value={form.language} onChange={(e) => patch({ language: e.target.value })}>
                {SKILL_LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">用途说明</p>
            <textarea
              className={cn(inputCls, 'min-h-[56px] resize-y leading-[20px]')}
              placeholder="什么时候用、输入输出、注意点…"
              value={form.summary}
              onChange={(e) => patch({ summary: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">代码 *</p>
            <textarea
              className={cn(monoCls, 'min-h-[200px] resize-y')}
              placeholder="# 粘贴代码片段或常用命令…"
              value={form.code}
              onChange={(e) => patch({ code: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">出处 / 参考链接</p>
            <input
              className={inputCls}
              placeholder="https://…（官方文档、教程、Stack Overflow 等）"
              value={form.source}
              onChange={(e) => patch({ source: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-line px-4 text-[13px] text-ink-soft transition-colors hover:bg-paper"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!form.title.trim()) return toast.error('请填写技能名称')
              if (!form.code.trim()) return toast.error('请填写代码内容')
              onSave({ ...form, title: form.title.trim() })
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white transition-colors hover:bg-bench-deep disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------- 主面板 -------------------------------- */

export default function SkillsPanel() {
  const utils = trpc.useUtils()
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [language, setLanguage] = useState<string | undefined>(undefined)
  const [q, setQ] = useState('')

  const skillsQ = trpc.bioinfoSkill.list.useQuery(
    category || language || q.trim() ? { category, language, q: q.trim() || undefined } : undefined,
  )
  const items = (skillsQ.data ?? []) as Skill[]

  const [viewing, setViewing] = useState<Skill | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorInitial, setEditorInitial] = useState<Form>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null)

  const invalidate = () => utils.bioinfoSkill.list.invalidate()

  const createMut = trpc.bioinfoSkill.create.useMutation({
    onSuccess: async () => {
      toast.success('技能已保存')
      setEditorOpen(false)
      await invalidate()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const updateMut = trpc.bioinfoSkill.update.useMutation({
    onSuccess: async () => {
      toast.success('已更新')
      setEditorOpen(false)
      setViewing(null)
      await invalidate()
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  })
  const removeMut = trpc.bioinfoSkill.remove.useMutation({
    onSuccess: async () => {
      toast.success('已删除')
      setDeleteTarget(null)
      setViewing(null)
      await invalidate()
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  /* ------------------------------ 导入 / 导出 ------------------------------ */

  const importInputRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    try {
      const all = await utils.bioinfoSkill.exportAll.fetch()
      if (all.length === 0) {
        toast.error('还没有技能可导出')
        return
      }
      const payload = JSON.stringify({ app: 'BenchLog', kind: 'bioinfo-skills', version: 1, items: all }, null, 2)
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `benchlog-skills-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${all.length} 个技能`)
    } catch (e) {
      toast.error(`导出失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const importMut = trpc.bioinfoSkill.importMany.useMutation({
    onSuccess: async ({ count }) => {
      toast.success(`已导入 ${count} 个技能`)
      await invalidate()
    },
    onError: (e) => toast.error(`导入失败：${e.message}`),
  })

  const pickImport = async (list: FileList | null) => {
    const file = list?.[0]
    if (importInputRef.current) importInputRef.current.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed as { items?: unknown[] })?.items
      if (!Array.isArray(items) || items.length === 0) {
        toast.error('JSON 格式不正确：需要技能数组或 { items: [...] }')
        return
      }
      if (items.length > 200) {
        toast.error(`单次最多导入 200 条（当前 ${items.length} 条）`)
        return
      }
      const invalid = items.findIndex(
        (it) =>
          typeof it !== 'object' || it == null ||
          typeof (it as { title?: unknown }).title !== 'string' || !(it as { title: string }).title.trim() ||
          typeof (it as { code?: unknown }).code !== 'string' || !(it as { code: string }).code.trim(),
      )
      if (invalid >= 0) {
        toast.error(`第 ${invalid + 1} 条缺少 title 或 code`)
        return
      }
      importMut.mutate({ items: items as never })
    } catch {
      toast.error('文件不是有效的 JSON')
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setEditorInitial(EMPTY_FORM)
    setEditorOpen(true)
  }
  const openEdit = (s: Skill) => {
    setEditingId(s.id)
    setEditorInitial({
      title: s.title,
      category: s.category,
      language: s.language,
      summary: s.summary ?? '',
      code: s.code,
      source: s.source ?? '',
    })
    setEditorOpen(true)
  }

  const stats = useMemo(() => ({ total: items.length }), [items])

  return (
    <div>
      <Toaster position="top-right" />

      {/* 工具行 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            className={cn(inputCls, 'h-9 py-0 pl-9')}
            placeholder="搜索技能名、说明或代码内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={doExport}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
        >
          <Download className="h-3.5 w-3.5" />
          导出
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={importMut.isPending}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench disabled:opacity-60"
        >
          {importMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          导入
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void pickImport(e.target.files)}
        />
        <button
          type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          新建技能
        </button>
      </div>

      {/* 筛选行 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCategory(undefined)} className={chipCls(!category)}>
          全部分类
        </button>
        {SKILL_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(category === c ? undefined : c)} className={chipCls(category === c)}>
            {c}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
        {SKILL_LANGUAGES.map((l) => (
          <button key={l} type="button" onClick={() => setLanguage(language === l ? undefined : l)} className={cn(chipCls(language === l), 'font-mono !text-[12px]')}>
            {l}
          </button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-ink-mute">{stats.total} 个技能</span>
      </div>

      {/* 卡片墙 */}
      {skillsQ.isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[180px] animate-pulse rounded-lg border border-line bg-surface" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <Lightbulb className="h-10 w-10 text-ink-mute" strokeWidth={1.5} />
          <h3 className="mt-4 font-display text-[18px] font-semibold text-ink">技能库还是空的</h3>
          <p className="mt-1 max-w-[400px] text-center text-[12.5px] leading-[19px] text-ink-mute">
            把常用的代码片段、命令组合、工具用法沉淀到这里——下次直接搜索复制，不必翻旧项目。
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13.5px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep"
          >
            <Plus className="h-4 w-4" /> 新建第一个技能
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {items.map((s, i) => {
            const preview = codePreview(s.code)
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04, ease: EASE }}
                className="group flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-shadow duration-180 hover:shadow-card-hover"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bench-wash text-bench">
                    <FileCode2 className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[15px] font-semibold leading-[21px] text-ink">{s.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
                        {s.language}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-mute">{s.category}</span>
                    </div>
                  </div>
                </div>

                {s.summary && <p className="mt-2.5 text-[12.5px] leading-[19px] text-ink-soft">{s.summary}</p>}

                <button
                  type="button"
                  onClick={() => setViewing(s)}
                  className="mt-2.5 rounded-lg border border-line bg-paper p-2.5 text-left transition-colors duration-150 hover:border-bench/40"
                >
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-[17px] text-ink-soft">{preview.text}</pre>
                  {preview.rest > 0 && <p className="mt-1 font-mono text-[10.5px] text-ink-mute">… 余下 {preview.rest} 行，点击查看完整代码</p>}
                </button>

                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyCode(s.code)}
                    className="flex h-7 items-center gap-1 rounded-lg border border-bench/40 bg-bench-wash px-2.5 text-[12px] font-medium text-bench-ink transition-colors hover:bg-bench hover:text-white"
                  >
                    <Copy className="h-3 w-3" />
                    复制代码
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewing(s)}
                    className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] text-ink-soft transition-colors hover:border-bench hover:text-bench"
                  >
                    查看 / 编辑
                  </button>
                  {s.source && (
                    <a
                      href={s.source}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex items-center gap-0.5 text-[11px] text-ink-mute transition-colors hover:text-bench"
                    >
                      <ExternalLink className="h-3 w-3" />
                      出处
                    </a>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* 查看对话框 */}
      <Dialog open={viewing != null} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-[720px] rounded-xl border-line">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-[17px] font-semibold text-ink">
                  <FileCode2 className="h-4 w-4 text-bench" />
                  {viewing.title}
                  <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
                    {viewing.language}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-ink-mute">
                    {viewing.category}
                  </span>
                </DialogTitle>
              </DialogHeader>
              {viewing.summary && <p className="text-[13px] leading-[20px] text-ink-soft">{viewing.summary}</p>}
              <pre className="max-h-[46vh] overflow-auto rounded-lg border border-line bg-paper p-3.5 font-mono text-[12px] leading-[18px] text-ink">
                {viewing.code}
              </pre>
              {viewing.source && (
                <a
                  href={viewing.source}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-bench hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {viewing.source}
                </a>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyCode(viewing.code)}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white transition-colors hover:bg-bench-deep"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制代码
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(viewing)}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-4 text-[13px] text-ink-soft transition-colors hover:border-bench hover:text-bench"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(viewing)}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-mute transition-colors hover:border-danger hover:text-danger"
                  aria-label="删除技能"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <SkillEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editorInitial}
        saving={createMut.isPending || updateMut.isPending}
        onSave={(f) => {
          if (editingId != null) updateMut.mutate({ id: editingId, ...f })
          else createMut.mutate(f)
        }}
      />

      {/* 删除确认 */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">删除这个技能？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              「{deleteTarget?.title}」将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault()
                if (deleteTarget) removeMut.mutate({ id: deleteTarget.id })
              }}
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
            >
              {removeMut.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
