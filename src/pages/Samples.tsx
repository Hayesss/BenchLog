import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Box, MapPin, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { TYPE_COLOR, wellLabel } from '@/components/samples/sample-meta'

type BoxRow = {
  id: number
  projectId: number
  name: string
  location: string | null
  rows: number
  cols: number
  occupied: number
  capacity: number
}

/* ------------------------------------------------------------------ */
/* 新建盒子对话框                                                        */
/* ------------------------------------------------------------------ */
function NewBoxDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultProjectId: number | null
}) {
  const utils = trpc.useUtils()
  const projectsQ = trpc.project.list.useQuery(undefined, { enabled: open })
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId)

  const createMut = trpc.sample.createBox.useMutation({
    onSuccess: () => {
      toast.success('盒子已创建')
      setName('')
      setLocation('')
      void utils.sample.listBoxes.invalidate()
      onOpenChange(false)
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })

  const projects = (projectsQ.data ?? []).filter((p) => !(p as { archived?: boolean }).archived)
  const pid = projectId ?? defaultProjectId ?? projects[0]?.id ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">新建样本盒</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">名称 NAME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：-80℃ 盒 A、质粒盒 2026"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-bench"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">存放位置 LOCATION（可选）</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="如：-80℃ 冰箱 B2 层、液氮罐 3"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-bench"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">归属项目 PROJECT</span>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150',
                    pid === p.id
                      ? 'border-bench bg-bench-wash text-bench-ink'
                      : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </label>
          <p className="text-[11.5px] text-ink-mute">规格：96 孔（8 行 × 12 列，A1–H12 坐标）</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={createMut.isPending || name.trim() === '' || pid == null}
            onClick={() => pid != null && createMut.mutate({ projectId: pid, name: name.trim(), location: location.trim() || undefined })}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {createMut.isPending ? '创建中…' : '创建盒子'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function Samples() {
  const [projectFilter, setProjectFilter] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const projectsQ = trpc.project.list.useQuery()
  const boxesQ = trpc.sample.listBoxes.useQuery(
    projectFilter != null ? { projectId: projectFilter } : undefined,
  )
  const searchQ = trpc.sample.searchSamples.useQuery(
    { q: q.trim() },
    { enabled: q.trim().length > 0 },
  )

  const projects = (projectsQ.data ?? []).filter((p) => !(p as { archived?: boolean }).archived)
  const boxes = (boxesQ.data ?? []) as BoxRow[]
  const searching = q.trim().length > 0
  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name] as const)),
    [projects],
  )

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Toaster position="top-right" />

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold leading-[30px] text-ink">样本库</h1>
          <p className="mt-1 text-[13px] leading-[20px] text-ink-mute">
            96 孔冻存盒（8×12，A1–H12 坐标）——按项目分盒管理，点孔位存取样本。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13.5px] font-medium text-white shadow-card transition-all duration-150 hover:bg-bench-deep"
        >
          <Plus className="h-4 w-4" /> 新建盒子
        </button>
      </header>

      {/* 项目过滤 + 搜索 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setProjectFilter(null)}
            className={cn(
              'h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150',
              projectFilter === null ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:border-line-strong',
            )}
          >
            全部项目
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProjectFilter(p.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150',
                projectFilter === p.id
                  ? 'border-bench bg-bench-wash text-bench-ink'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="跨盒搜索样本名/备注…"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink outline-none transition-colors focus:border-bench"
          />
        </div>
      </div>

      {/* 搜索结果 */}
      {searching && (
        <div className="mb-5 rounded-xl border border-line bg-surface p-3 shadow-card">
          <p className="caption-en mb-2 px-1">搜索结果 SEARCH</p>
          {searchQ.isLoading ? (
            <p className="px-1 py-4 text-[12.5px] text-ink-mute">搜索中…</p>
          ) : (searchQ.data ?? []).length === 0 ? (
            <p className="px-1 py-4 text-[12.5px] text-ink-mute">没有匹配的样本</p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft">
              {(searchQ.data ?? []).map((s) => (
                <Link
                  key={s.id}
                  to={`/samples/${s.boxId}`}
                  className="group flex items-center gap-3 px-2 py-2.5"
                >
                  <span
                    className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold text-white"
                    style={{ backgroundColor: TYPE_COLOR[s.type] ?? '#8A9099' }}
                  >
                    {s.well ?? wellLabel(s.row, s.col)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink group-hover:text-bench">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-mute">
                      {s.type}
                      {s.concentration ? ` · ${s.concentration}` : ''} · {s.boxName}
                      {s.projectName ? ` · ${s.projectName}` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 盒子卡片 */}
      {boxesQ.isLoading ? (
        <p className="py-12 text-center text-[12.5px] text-ink-mute">载入中…</p>
      ) : boxes.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong py-14 transition-colors duration-150 hover:border-bench hover:bg-bench-wash/30"
        >
          <Box className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
          <p className="text-[13px] text-ink-mute">还没有样本盒 — 点击新建一个 96 孔盒</p>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {boxes.map((b) => {
            const pct = b.capacity > 0 ? Math.round((b.occupied / b.capacity) * 100) : 0
            return (
              <Link
                key={b.id}
                to={`/samples/${b.id}`}
                className="group rounded-xl border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink group-hover:text-bench">{b.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-mute">
                      {b.location && (
                        <>
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{b.location}</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="truncate">{projectName.get(b.projectId) ?? '项目'}</span>
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[12px] font-medium text-ink-soft">
                    {b.occupied}/{b.capacity}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-soft">
                  <div
                    className="h-full rounded-full bg-bench transition-all duration-300"
                    style={{ width: `${Math.max(pct, b.occupied > 0 ? 3 : 0)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-mute">
                  {b.occupied === 0 ? '空盒' : `已用 ${pct}%`}
                  {' · '}{b.rows}×{b.cols}
                </p>
              </Link>
            )
          })}
        </div>
      )}

      <NewBoxDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultProjectId={projectFilter} />
    </div>
  )
}
