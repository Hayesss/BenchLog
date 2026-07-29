import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  Circle,
  CircleCheck,
  ExternalLink,
  GitBranch,
  Info,
  Plus,
  RotateCcw,
  SquareTerminal,
  X,
} from 'lucide-react'
import type { inferRouterOutputs } from '@trpc/server'
import type { CreateTRPCReact } from '@trpc/react-query'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'

type AppRouterFromProxy = typeof trpc extends CreateTRPCReact<infer R, unknown> ? R : never
type RouterOutputs = inferRouterOutputs<AppRouterFromProxy>
type AnalysisItem = RouterOutputs['bioinfo']['list'][number]
type BioStatus = AnalysisItem['status']

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const PIPELINE_OPTIONS = [
  '手动脚本',
  'R 分析',
  'Python 分析',
  'Nextflow',
  'Snakemake',
  'WDL',
  'Galaxy',
  '其他',
] as const

export const BIO_STATUS_META: Record<BioStatus, { label: string; chip: string; text: string }> = {
  running: { label: '运行中', chip: 'bg-[#5B7C991F]', text: 'text-info' },
  done: { label: '已完成', chip: 'bg-[#4C8C6B1F]', text: 'text-success' },
  failed: { label: '失败', chip: 'bg-[#B4564E1F]', text: 'text-danger' },
}

const STATUS_ICON: Record<BioStatus, typeof Circle> = {
  running: Circle,
  done: CircleCheck,
  failed: RotateCcw,
}

export function BioStatusBadge({ status, className }: { status: BioStatus; className?: string }) {
  const meta = BIO_STATUS_META[status]
  const Icon = STATUS_ICON[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium leading-none',
        meta.chip,
        meta.text,
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {meta.label}
    </span>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: Math.min(i, 8) * 0.05, ease: EASE },
  }),
}

function shortHash(h?: string | null): string {
  return h ? h.slice(0, 7) : ''
}

function AnalysisCard({ a, index }: { a: AnalysisItem; index: number }) {
  const navigate = useNavigate()
  return (
    <motion.button
      type="button"
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      onClick={() => navigate(`/bioinfo/${a.id}`)}
      className="group flex flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-shadow duration-180 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bench-wash text-bench">
            <SquareTerminal className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-[15.5px] font-semibold leading-[21px] text-ink">{a.name}</h3>
            <p className="mt-0.5 font-mono text-[11.5px] text-ink-mute">
              {a.analysisDate}
              {a.project && (
                <>
                  <span className="mx-1.5 text-line-strong">·</span>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ backgroundColor: a.project.color || '#8A9099' }}
                  />
                  <span className="ml-1 align-middle">{a.project.name}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <BioStatusBadge status={a.status} className="shrink-0" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
          {a.pipeline}
        </span>
        {a.repoUrl && (
          <span
            className={
              a.repoUrl === 'internal'
                ? 'flex items-center gap-1 rounded border border-bench/35 bg-bench-wash px-1.5 py-0.5 font-mono text-[11px] font-medium text-bench-ink'
                : 'flex items-center gap-1 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-mute'
            }
          >
            <GitBranch className="h-3 w-3" />
            {a.repoUrl === 'internal' ? `站内 ${shortHash(a.commitHash) || ''}` : shortHash(a.commitHash) || 'repo'}
          </span>
        )}
      </div>

      {a.conclusion && (
        <p className="mt-2 border-t border-line-soft pt-2 font-display text-[13px] italic leading-[19px] text-ink-soft">
          “{a.conclusion}”
        </p>
      )}
    </motion.button>
  )
}

/** 最佳实践引导条（可收起） */
function GuideBanner() {
  const [open, setOpen] = useState(() => localStorage.getItem('bioinfo-guide-dismissed') !== '1')
  if (!open) return null
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-bench/30 bg-bench-wash/40 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-bench" strokeWidth={1.8} />
      <p className="flex-1 text-[12.5px] leading-[19px] text-ink-soft">
        代码可直接存进<b className="text-ink">站内内置仓库</b>（详情页上传/粘贴 → 提交 commit，哈希与 git 完全兼容），
        也可登记外部 <b className="text-ink">Git 私有仓库</b>（GitHub / GitLab / Gitee）链接 + commit 哈希。
        配合「环境锁定 + 运行命令」即可完整锚定一次分析的可复现现场。大文件数据不进仓库，记录
        SRA/GEO 编号或存储路径。
      </p>
      <button
        type="button"
        aria-label="收起提示"
        onClick={() => {
          localStorage.setItem('bioinfo-guide-dismissed', '1')
          setOpen(false)
        }}
        className="shrink-0 rounded p-0.5 text-ink-mute transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function Bioinfo() {
  const [projectId, setProjectId] = useState<number | undefined>(undefined)
  const [status, setStatus] = useState<BioStatus | undefined>(undefined)

  const analysesQ = trpc.bioinfo.list.useQuery(
    projectId || status ? { projectId, status } : undefined,
  )
  const projectsQ = trpc.project.list.useQuery()

  const items = analysesQ.data ?? []
  const projects = projectsQ.data ?? []

  const stats = useMemo(() => {
    const all = items
    return {
      total: all.length,
      running: all.filter((a) => a.status === 'running').length,
      done: all.filter((a) => a.status === 'done').length,
    }
  }, [items])

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[28px] md:leading-[36px]">
            生信分析
          </h1>
          <p className="caption-en mt-1">Bioinformatics · Dry Lab</p>
        </div>
        <Link
          to="/bioinfo/new"
          className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[14px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          新建分析
        </Link>
      </motion.div>

      <GuideBanner />

      {/* 筛选行 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setProjectId(undefined)}
          className={cn(
            'h-8 rounded-full border px-3 text-[12.5px] transition-colors duration-150',
            !projectId ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line bg-surface text-ink-soft hover:bg-paper',
          )}
        >
          全部项目
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProjectId(projectId === p.id ? undefined : p.id)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors duration-150',
              projectId === p.id
                ? 'border-bench bg-bench-wash text-bench-ink'
                : 'border-line bg-surface text-ink-soft hover:bg-paper',
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || '#8A9099' }} />
            {p.name}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
        {(['running', 'done', 'failed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? undefined : s)}
            className={cn(
              'h-8 rounded-full border px-3 text-[12.5px] transition-colors duration-150',
              status === s ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line bg-surface text-ink-soft hover:bg-paper',
            )}
          >
            {BIO_STATUS_META[s].label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-ink-mute">
          {stats.total} 项 · 运行中 {stats.running} · 完成 {stats.done}
        </span>
      </div>

      {/* 列表 */}
      {analysesQ.isLoading ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-lg border border-line bg-surface" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-24">
          <SquareTerminal className="h-10 w-10 text-ink-mute" strokeWidth={1.5} />
          <h3 className="mt-4 font-display text-[18px] font-semibold text-ink">还没有生信分析记录</h3>
          <p className="mt-1 max-w-[380px] text-center text-[12.5px] leading-[19px] text-ink-mute">
            登记你的第一次分析：锚定 Git 仓库 commit、环境锁定与运行命令，让每次分析都可复现。
          </p>
          <Link
            to="/bioinfo/new"
            className="mt-5 flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13.5px] font-medium text-white transition-colors duration-150 hover:bg-bench-deep"
          >
            <Plus className="h-4 w-4" /> 新建第一条分析
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {items.map((a, i) => (
            <AnalysisCard key={a.id} a={a} index={i} />
          ))}
        </div>
      )}

      {/* repo 链接速达 */}
      {items.some((a) => a.repoUrl) && (
        <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-ink-mute">
          <ExternalLink className="h-3 w-3" />
          带仓库链接的分析可在详情页直接跳转 Git 仓库对应 commit。
        </p>
      )}
    </div>
  )
}
