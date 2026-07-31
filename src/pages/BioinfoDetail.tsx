import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  HardDrive,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ShareButton } from '@/components/share/ShareButton'
import RecordMarkdownEditor from '@/components/records/RecordMarkdownEditor'
import RepoPanel from '@/components/bioinfo/RepoPanel'
import RepoStaging, { type StagedFile } from '@/components/bioinfo/RepoStaging'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { BioStatusBadge, PIPELINE_OPTIONS } from '@/pages/Bioinfo'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
}

type Form = {
  name: string
  analysisDate: string
  projectId: number | null
  pipeline: string
  inputData: string
  dataPath: string
  resultPath: string
  repoUrl: string
  commitHash: string
  environment: string
  command: string
  status: 'running' | 'done' | 'failed'
  resultMd: string
  conclusion: string
  nextStep: string
}

const today = () => format(new Date(), 'yyyy-MM-dd')

const EMPTY: Form = {
  name: '',
  analysisDate: today(),
  projectId: null,
  pipeline: '手动脚本',
  inputData: '',
  dataPath: '',
  resultPath: '',
  repoUrl: '',
  commitHash: '',
  environment: '',
  command: '',
  status: 'running',
  resultMd: '',
  conclusion: '',
  nextStep: '',
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench'
const monoCls = cn(inputCls, 'font-mono text-[12.5px] leading-[18px]')

function Field({ label, en, children }: { label: string; en?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">
        {label}
        {en && <span className="caption-en ml-1.5 !text-[10px]">{en}</span>}
      </p>
      {children}
    </div>
  )
}

/** 数据存储路径输入：mono 字体 + 图标 + 一键复制（路径通常长且需粘到终端/WinSCP） */
function PathField({
  label,
  en,
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  label: string
  en?: string
  icon: typeof HardDrive
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  const copy = async () => {
    const v = value.trim()
    if (!v) return
    try {
      await navigator.clipboard.writeText(v)
      toast.success('路径已复制')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }
  return (
    <Field label={label} en={en}>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input
          className={cn(monoCls, 'pl-9', value.trim() ? 'pr-9' : '')}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {value.trim() && (
          <button
            type="button"
            onClick={copy}
            aria-label="复制路径"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-bench"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Field>
  )
}

/** commit 直达链接：GitHub/GitLab/Gitee 通用 {repo}/commit/{hash}；站内仓库（internal）无外链 */
function commitUrl(repo: string, hash: string): string | null {
  const r = repo.trim().replace(/\.git$/, '').replace(/\/$/, '')
  if (!r || r === 'internal' || !hash.trim()) return null
  return `${r}/commit/${hash.trim()}`
}

export default function BioinfoDetail() {
  const { id } = useParams()
  const analysisId = id ? Number(id) : null
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const detailQ = trpc.bioinfo.byId.useQuery({ id: analysisId! }, { enabled: analysisId != null })
  const projectsQ = trpc.project.list.useQuery()

  const [form, setForm] = useState<Form>(EMPTY)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loaded, setLoaded] = useState(analysisId == null)
  // 新建草稿：暂存代码 + 提交信息（创建时自动建仓、提交首个 commit 并锚定）
  const [draftFiles, setDraftFiles] = useState<StagedFile[]>([])
  const [draftMessage, setDraftMessage] = useState('')
  // 未保存保护：任一字段/草稿变更置位，保存成功后清除（刷新/关闭标签页时拦截）
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty)

  useEffect(() => {
    if (analysisId != null && detailQ.data && !loaded) {
      const d = detailQ.data
      setForm({
        name: d.name,
        analysisDate: d.analysisDate,
        projectId: d.projectId,
        pipeline: d.pipeline,
        inputData: d.inputData ?? '',
        dataPath: d.dataPath ?? '',
        resultPath: d.resultPath ?? '',
        repoUrl: d.repoUrl ?? '',
        commitHash: d.commitHash ?? '',
        environment: d.environment ?? '',
        command: d.command ?? '',
        status: d.status,
        resultMd: d.resultMd ?? '',
        conclusion: d.conclusion ?? '',
        nextStep: d.nextStep ?? '',
      })
      setLoaded(true)
    }
  }, [analysisId, detailQ.data, loaded])

  const patch = (p: Partial<Form>) => {
    setDirty(true)
    setForm((f) => ({ ...f, ...p }))
  }
  // 草稿暂存变更同样计入未保存
  const patchDraftFiles: React.Dispatch<React.SetStateAction<StagedFile[]>> = (v) => {
    setDirty(true)
    setDraftFiles(v)
  }
  const patchDraftMessage = (m: string) => {
    setDirty(true)
    setDraftMessage(m)
  }

  const invalidate = async () => {
    await Promise.all([utils.bioinfo.list.invalidate(), analysisId != null && utils.bioinfo.byId.invalidate({ id: analysisId })])
  }

  const gitCommitMut = trpc.git.commit.useMutation()
  const silentUpdateMut = trpc.bioinfo.update.useMutation()
  const createMut = trpc.bioinfo.create.useMutation({
    onSuccess: async ({ id: newId }) => {
      setDirty(false)
      await utils.bioinfo.list.invalidate()
      if (draftFiles.length > 0) {
        // 创建时自动建仓：提交暂存代码为首个 commit，并锚定（未填外部仓库时）
        try {
          const r = await gitCommitMut.mutateAsync({ analysisId: newId, files: draftFiles, message: draftMessage })
          if (!form.repoUrl.trim()) {
            const { name, analysisDate, projectId, pipeline, inputData, dataPath, resultPath, environment, command, status, resultMd, conclusion, nextStep } = form
            await silentUpdateMut.mutateAsync({
              id: newId,
              name: name.trim(),
              analysisDate,
              projectId,
              pipeline,
              inputData,
              dataPath,
              resultPath,
              repoUrl: 'internal',
              commitHash: r.sha,
              environment,
              command,
              status,
              resultMd,
              conclusion,
              nextStep,
            })
          }
          toast.success(`分析已创建，代码已提交 ${r.short} 并锚定`)
        } catch (e) {
          toast.error(`分析已创建，但代码提交失败：${e instanceof Error ? e.message : '未知错误'}——可在详情页重新提交`)
        }
      } else {
        toast.success('分析已创建')
      }
      navigate(`/bioinfo/${newId}`)
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const updateMut = trpc.bioinfo.update.useMutation({
    onSuccess: async () => {
      setDirty(false)
      await invalidate()
      toast.success('已保存')
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const statusMut = trpc.bioinfo.updateStatus.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(`状态更新失败：${e.message}`),
  })
  const removeMut = trpc.bioinfo.remove.useMutation({
    onSuccess: async () => {
      await utils.bioinfo.list.invalidate()
      toast.success('已删除')
      navigate('/bioinfo')
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const saving = createMut.isPending || updateMut.isPending || gitCommitMut.isPending || silentUpdateMut.isPending
  const cUrl = useMemo(() => commitUrl(form.repoUrl, form.commitHash), [form.repoUrl, form.commitHash])

  const save = () => {
    if (!form.name.trim()) {
      toast.error('请填写分析名称')
      return
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      projectId: form.projectId,
    }
    if (analysisId == null) createMut.mutate(payload)
    else updateMut.mutate({ id: analysisId, ...payload })
  }

  if (analysisId != null && detailQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-8 md:px-8">
        <div className="h-[420px] animate-pulse rounded-lg border border-line bg-surface" />
      </div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-8 md:py-8"
    >
      <Toaster position="top-right" />

      {/* header */}
      <motion.div variants={sectionVariants} className="flex flex-wrap items-center gap-3">
        <Link
          to="/bioinfo"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-ink"
          aria-label="返回生信分析"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-[20px] font-bold text-ink">
          {analysisId == null ? '新建生信分析' : '生信分析详情'}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {/* 状态切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-full transition-opacity hover:opacity-80">
                <BioStatusBadge status={form.status} />
                <ChevronDown className="h-3.5 w-3.5 text-ink-mute" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['running', 'done', 'failed'] as const).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => {
                    patch({ status: s })
                    if (analysisId != null) statusMut.mutate({ id: analysisId, status: s })
                  }}
                  className="gap-2 text-[13px]"
                >
                  <BioStatusBadge status={s} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {analysisId != null && <ShareButton kind="analysis" targetId={analysisId} />}
          {analysisId != null && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-mute transition-colors duration-150 hover:border-danger hover:text-danger"
              aria-label="删除分析"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13.5px] font-medium text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {analysisId == null ? '创建' : '保存'}
          </button>
        </div>
      </motion.div>

      {/* 基本信息 */}
      <motion.section variants={sectionVariants} className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-card">
        <p className="caption-en mb-3">基本信息 BASIC INFO</p>
        <div className="flex flex-col gap-4">
          <Field label="分析名称" en="Required">
            <input
              className={inputCls}
              placeholder="例：RNA-seq 差异表达分析（GSE123456，DESeq2）"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="分析日期">
              <input
                type="date"
                className={inputCls}
                value={form.analysisDate}
                onChange={(e) => patch({ analysisDate: e.target.value })}
              />
            </Field>
            <Field label="所属项目">
              <select
                className={cn(inputCls, 'appearance-none')}
                value={form.projectId ?? ''}
                onChange={(e) => patch({ projectId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">未分组</option>
                {(projectsQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="管线 / 工具形态">
              <select
                className={cn(inputCls, 'appearance-none')}
                value={form.pipeline}
                onChange={(e) => patch({ pipeline: e.target.value })}
              >
                {PIPELINE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="输入数据" en="Datasets">
            <textarea
              className={cn(inputCls, 'min-h-[68px] resize-y leading-[20px]')}
              placeholder="数据集与溯源：SRA/GEO 编号（如 SRP/GSE）、样本清单、文件路径或对象存储地址、MD5 校验……"
              value={form.inputData}
              onChange={(e) => patch({ inputData: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PathField
              label="原始数据路径"
              en="Raw Data"
              icon={HardDrive}
              placeholder="/data/share/projectA/fastq"
              value={form.dataPath}
              onChange={(v) => patch({ dataPath: v })}
            />
            <PathField
              label="结果存储路径"
              en="Results"
              icon={FolderOpen}
              placeholder="/data/share/projectA/rnaseq_out"
              value={form.resultPath}
              onChange={(v) => patch({ resultPath: v })}
            />
          </div>
          <p className="-mt-1 text-[11.5px] leading-[17px] text-ink-mute">
            大文件不进站内仓库，在这里登记服务器 / NAS / 对象存储上的实际位置；输入框右侧按钮可一键复制路径。
          </p>
        </div>
      </motion.section>

      {/* 代码仓库（站内 Git）：新建页直接暂存，创建时自动建仓提交；详情页完整仓库 */}
      <motion.section variants={sectionVariants} className="mt-4">
        {analysisId != null ? (
          <RepoPanel
            analysisId={analysisId}
            anchoredHash={form.repoUrl.trim() === 'internal' ? form.commitHash.trim() : ''}
            onAnchor={(sha) => {
              patch({ commitHash: sha, repoUrl: 'internal' })
              toast.success(`已锚定 commit ${sha.slice(0, 7)}，点击右上角「保存」生效`)
            }}
          />
        ) : (
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <p className="caption-en">代码仓库 INTERNAL GIT</p>
              <span className="ml-auto text-[11.5px] text-ink-mute">创建时自动建仓</span>
            </div>
            <p className="mt-1.5 mb-4 text-[12px] leading-[18px] text-ink-mute">
              选好项目、命名之后，直接上传或粘贴本次分析的代码——点击「创建」时自动建仓、提交为首个
              commit 并锚定到此分析（哈希与 git 完全兼容）。
            </p>
            <RepoStaging
              staged={draftFiles}
              onStagedChange={patchDraftFiles}
              message={draftMessage}
              onMessageChange={patchDraftMessage}
              footer={
                draftFiles.length > 0 ? (
                  <span className="shrink-0 text-[11.5px] text-ink-mute">
                    创建时将自动提交 {draftFiles.length} 个文件
                  </span>
                ) : undefined
              }
            />
          </div>
        )}
      </motion.section>

      {/* 可复现性锚定 */}
      <motion.section variants={sectionVariants} className="mt-4 rounded-lg border border-bench/35 bg-bench-wash/25 p-5 shadow-card">
        <p className="caption-en mb-1.5 !text-bench">可复现性 REPRODUCIBILITY</p>
        <p className="mb-3 text-[12px] leading-[18px] text-ink-mute">
          代码存 Git 仓库（建议私有库），这里锚定「仓库 + commit + 环境 + 命令」四要素——四者齐备，任何时刻都能原样重跑这次分析。
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
          <Field label="代码仓库链接" en="Repository">
            <div className="relative">
              <GitBranch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input
                className={cn(monoCls, 'pl-9')}
                placeholder="https://github.com/you/rnaseq-pipeline"
                value={form.repoUrl}
                onChange={(e) => patch({ repoUrl: e.target.value })}
              />
            </div>
          </Field>
          <Field label="commit 哈希" en="Anchor">
            <div className="relative">
              <GitCommitHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input
                className={cn(monoCls, 'pl-9')}
                placeholder="a1b2c3d…"
                value={form.commitHash}
                onChange={(e) => patch({ commitHash: e.target.value })}
              />
            </div>
          </Field>
        </div>
        {cUrl && (
          <a
            href={cUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-bench transition-colors hover:text-bench-deep hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            在仓库中查看此 commit（{form.commitHash.trim().slice(0, 7)}）
          </a>
        )}
        {form.repoUrl.trim() === 'internal' && form.commitHash.trim() && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-bench/35 bg-bench-wash px-2 py-1 text-[12px] font-medium text-bench-ink">
            <GitBranch className="h-3 w-3" />
            已锚定站内内置仓库 commit {form.commitHash.trim().slice(0, 7)} —— 代码与历史见下方「代码仓库」区；改填外部链接可切换回外部仓库
          </p>
        )}
        <div className="mt-4 flex flex-col gap-4">
          <Field label="环境锁定" en="Environment">
            <textarea
              className={cn(monoCls, 'min-h-[68px] resize-y')}
              placeholder={'例：conda env: rnaseq.yml（python 3.11, samtools 1.18, R 4.3.2）\n或 docker: quay.io/biocontainers/deseq2:1.40.1--r43hf170f1e_0'}
              value={form.environment}
              onChange={(e) => patch({ environment: e.target.value })}
            />
          </Field>
          <Field label="运行命令与关键参数" en="Command">
            <textarea
              className={cn(monoCls, 'min-h-[68px] resize-y')}
              placeholder={'例：nextflow run main.nf -profile slurm --genome GRCh38 --reads "data/*_{1,2}.fastq.gz"\n或 Rscript 01_qc.R --input counts.tsv --alpha 0.05 --seed 42'}
              value={form.command}
              onChange={(e) => patch({ command: e.target.value })}
            />
          </Field>
        </div>
      </motion.section>

      {/* 结果 */}
      <motion.section variants={sectionVariants} className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-card">
        <p className="caption-en mb-3">结果 RESULTS</p>
        <RecordMarkdownEditor value={form.resultMd} onChange={(v) => patch({ resultMd: v })} />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="结论">
            <textarea
              className={cn(inputCls, 'min-h-[56px] resize-y leading-[20px]')}
              placeholder="一句话结论"
              value={form.conclusion}
              onChange={(e) => patch({ conclusion: e.target.value })}
            />
          </Field>
          <Field label="下一步">
            <textarea
              className={cn(inputCls, 'min-h-[56px] resize-y leading-[20px]')}
              placeholder="后续分析或湿实验验证计划"
              value={form.nextStep}
              onChange={(e) => patch({ nextStep: e.target.value })}
            />
          </Field>
        </div>
      </motion.section>

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">删除这条分析记录？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              「{form.name || '未命名分析'}」将被永久删除；站内代码仓库的提交历史将一并删除（外部 Git 仓库不受影响）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault()
                if (analysisId != null) removeMut.mutate({ id: analysisId })
              }}
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
            >
              {removeMut.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
