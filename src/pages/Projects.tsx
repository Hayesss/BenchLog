import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import {
  Archive,
  ArchiveRestore,
  Box,
  Check,
  ChevronDown,
  FolderKanban,
  Palette,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import RecordProjectDialog from '@/components/records/RecordProjectDialog'
import type { ProjectWithCounts } from '@/components/records/record-types'

/** 预置 8 色板（设计 token 色系：bench / info / warning / danger 等） */
const PROJECT_COLORS = [
  '#3E7C6B',
  '#5B7C99',
  '#B98A3E',
  '#B4564E',
  '#B08D57',
  '#B0707C',
  '#8A7CA8',
  '#7C9161',
]

/** 单张项目卡片：色点+名称 / 关联计数 / 创建时间 / 改名·换色·归档·删除 */
function ProjectCard({
  project,
  boxCount,
  renaming,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onSetColor,
  onToggleArchived,
  onAskDelete,
}: {
  project: ProjectWithCounts
  renaming: boolean
  onStartRename: () => void
  onCancelRename: () => void
  onSubmitRename: (name: string) => void
  boxCount: number
  onSetColor: (color: string) => void
  onToggleArchived: () => void
  onAskDelete: () => void
}) {
  const [draft, setDraft] = useState(project.name)
  const [colorOpen, setColorOpen] = useState(false)

  const submit = () => {
    const n = draft.trim()
    if (!n) {
      toast.error('项目名称不能为空')
      return
    }
    onSubmitRename(n)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow duration-150 hover:shadow-overlay">
      {/* 色点 + 名称（改名时切换为 inline input） */}
      <div className="flex items-center gap-2.5">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              aria-label="项目名称"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') onCancelRename()
              }}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-2.5 text-[14px] text-ink outline-none transition-colors duration-150 focus:border-bench"
            />
            <button
              type="button"
              aria-label="确认改名"
              onClick={submit}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-bench transition-colors duration-150 hover:bg-bench-wash"
            >
              <Check className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="取消改名"
              onClick={onCancelRename}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-bench-wash hover:text-ink-soft"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
            {project.name}
          </span>
        )}
      </div>

      {/* 关联计数 + 创建时间 */}
      <div className="flex items-center justify-between text-[12.5px] text-ink-mute">
        <span className="flex items-center gap-1.5">
          {project.recordCount} 条记录 · {project.analysisCount} 项分析
          <Link
            to={`/samples?project=${project.id}`}
            className="flex items-center gap-1 rounded-md px-1 text-bench transition-colors duration-150 hover:bg-bench-wash"
          >
            <Box className="h-3 w-3" strokeWidth={1.8} />
            {boxCount} 盒
          </Link>
        </span>
        <span className="font-mono text-[11.5px]">
          {format(new Date(project.createdAt), 'yyyy-MM-dd')}
        </span>
      </div>
      {project.description && (
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
          {project.description}
        </p>
      )}

      {/* 操作行 */}
      <div className="mt-auto flex items-center gap-1 border-t border-line pt-2.5">
        <button
          type="button"
          onClick={onStartRename}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
          改名
        </button>
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="换色"
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash hover:text-ink"
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={1.8} />
              换色
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto rounded-xl border-line p-3">
            <p className="caption-en mb-2">项目色 COLOR</p>
            <div className="grid grid-cols-4 gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`颜色 ${c}`}
                  onClick={() => {
                    onSetColor(c)
                    setColorOpen(false)
                  }}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform duration-150 active:scale-90',
                    project.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={onToggleArchived}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-soft transition-colors duration-150 hover:bg-bench-wash hover:text-ink"
        >
          {project.archived ? (
            <>
              <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.8} />
              取消归档
            </>
          ) : (
            <>
              <Archive className="h-3.5 w-3.5" strokeWidth={1.8} />
              归档
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onAskDelete}
          className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-mute transition-colors duration-150 hover:bg-[#B4564E14] hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          删除
        </button>
      </div>
    </div>
  )
}

/** 项目管理页：集中维护项目（改名/换色/归档/删除），归档项收进底部折叠分组 */
export default function Projects() {
  const utils = trpc.useUtils()
  const projectsQuery = trpc.project.list.useQuery()
  const boxesQuery = trpc.sample.listBoxes.useQuery()
  const [createOpen, setCreateOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProjectWithCounts | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)

  const projects = useMemo<ProjectWithCounts[]>(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  )
  const boxCountMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const b of boxesQuery.data ?? []) m.set(b.projectId, (m.get(b.projectId) ?? 0) + 1)
    return m
  }, [boxesQuery.data])
  const activeProjects = projects.filter((p) => !p.archived)
  const archivedProjects = projects.filter((p) => p.archived)

  const invalidateProjects = async () => {
    await Promise.all([utils.project.list.invalidate(), utils.record.list.invalidate()])
  }

  const renameMut = trpc.project.rename.useMutation({
    onSuccess: async () => {
      await invalidateProjects()
      setRenamingId(null)
      toast.success('已改名')
    },
    onError: (e) => toast.error(`改名失败：${e.message}`),
  })
  const colorMut = trpc.project.setColor.useMutation({
    onSuccess: async () => {
      await invalidateProjects()
      toast.success('已更换项目色')
    },
    onError: (e) => toast.error(`换色失败：${e.message}`),
  })
  const archiveMut = trpc.project.setArchived.useMutation({
    onSuccess: async (_d, v) => {
      await invalidateProjects()
      toast.success(v.archived ? '已归档项目' : '已取消归档')
    },
    onError: (e) => toast.error(`操作失败：${e.message}`),
  })
  const removeMut = trpc.project.remove.useMutation({
    onSuccess: async () => {
      await invalidateProjects()
      setPendingDelete(null)
      toast.success('已删除项目')
    },
    onError: (e) => {
      // 后端拒绝（存在关联数据）时保留确认框并给出原因
      toast.error(e.message)
    },
  })

  const renderCard = (p: ProjectWithCounts) => (
    <ProjectCard
      key={p.id}
      project={p}
      boxCount={boxCountMap.get(p.id) ?? 0}
      renaming={renamingId === p.id}
      onStartRename={() => setRenamingId(p.id)}
      onCancelRename={() => setRenamingId(null)}
      onSubmitRename={(name) => renameMut.mutate({ id: p.id, name })}
      onSetColor={(color) => colorMut.mutate({ id: p.id, color })}
      onToggleArchived={() => archiveMut.mutate({ id: p.id, archived: !p.archived })}
      onAskDelete={() => setPendingDelete(p)}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-16 md:px-8">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-8">
        <div>
          <h1 className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[38px]">
            项目管理
          </h1>
          <p className="caption-en mt-1" style={{ letterSpacing: '0.08em' }}>
            Projects
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> 新建项目
        </button>
      </div>
      <p className="mt-2 text-[13px] text-ink-soft">
        项目用于分组湿实验记录与生信分析；归档后不再出现在侧边栏，关联数据保留。共{' '}
        {activeProjects.length} 个项目
        {archivedProjects.length > 0 ? ` · ${archivedProjects.length} 个已归档` : ''}
      </p>

      {/* 项目卡片列表 */}
      {projectsQuery.isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : activeProjects.length === 0 && archivedProjects.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <FolderKanban className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
          <p className="text-[13.5px] text-ink-soft">还没有项目</p>
          <p className="text-[12.5px] text-ink-mute">新建一个项目，把相关的记录与分析归拢到一起</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-1 flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> 新建项目
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeProjects.map(renderCard)}
        </div>
      )}

      {/* 已归档折叠分组（默认收起） */}
      {archivedProjects.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            aria-expanded={archivedOpen}
            className="flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-[12px] font-medium tracking-[0.04em] text-ink-mute transition-colors duration-150 hover:text-ink-soft"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                !archivedOpen && '-rotate-90',
              )}
            />
            已归档 ARCHIVED（{archivedProjects.length}）
          </button>
          {archivedOpen && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {archivedProjects.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {/* 新建项目对话框（复用记录页组件） */}
      <RecordProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 删除确认 */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">
              删除项目「{pendingDelete?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              删除后不可恢复。若项目下仍有湿实验记录或生信分析，需要先移走或删除这些关联数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && removeMut.mutate({ id: pendingDelete.id })}
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
