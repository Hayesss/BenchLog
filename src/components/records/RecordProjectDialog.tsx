import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { CATEGORY_COLORS } from './record-types'
import type { ProjectItem } from './record-types'

/** Create / edit project dialog — project management entry point (records page). */
export default function RecordProjectDialog({
  open,
  onOpenChange,
  project,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** when provided → edit mode */
  project?: ProjectItem | null
  onCreated?: (id: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* remount per open so form state initializes from the current project */}
      {open && (
        <ProjectDialogInner
          key={project?.id ?? 'new'}
          project={project}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  )
}

function ProjectDialogInner({
  project,
  onOpenChange,
  onCreated,
}: {
  project?: ProjectItem | null
  onOpenChange: (v: boolean) => void
  onCreated?: (id: number) => void
}) {
  const utils = trpc.useUtils()
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(project?.color || CATEGORY_COLORS[0])
  const [description, setDescription] = useState(project?.description ?? '')

  const createMut = trpc.project.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.project.list.invalidate()
      toast.success('已创建项目')
      onCreated?.(id)
      onOpenChange(false)
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const updateMut = trpc.project.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.project.list.invalidate(), utils.record.list.invalidate()])
      toast.success('已更新项目')
      onOpenChange(false)
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  })

  const pending = createMut.isPending || updateMut.isPending

  const submit = () => {
    const n = name.trim()
    if (!n) {
      toast.error('请填写项目名称')
      return
    }
    if (project) {
      updateMut.mutate({ id: project.id, name: n, color, description: description.trim() || null })
    } else {
      createMut.mutate({ name: n, color, description: description.trim() || undefined })
    }
  }

  return (
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px]">
            {project ? '编辑项目' : '新建项目'}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            项目用于分组湿实验记录与生信分析，色点会出现在侧边栏与卡片上。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">项目名称 NAME</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：慢病毒载体构建"
              autoFocus
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="caption-en">项目色 COLOR</span>
            <div className="flex gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`颜色 ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform duration-150 active:scale-90',
                    color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">简介 DESCRIPTION（可选）</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="这个项目在研究什么？"
              className="resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
            />
          </label>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-9 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:opacity-60"
          >
            {pending ? '保存中…' : project ? '保存修改' : '创建项目'}
          </button>
        </DialogFooter>
      </DialogContent>
  )
}
