import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Check, ChevronDown, FlaskConical, History, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { trpc } from '@/providers/trpc'
import RecordTagChip from './RecordTagChip'
import RecordProjectDialog from './RecordProjectDialog'
import RecordStatusMenu from './RecordStatusMenu'
import { CATEGORY_COLORS, fmtDateTime, wash } from './record-types'
import type { ProtocolItem, RecordStatus } from './record-types'

export type ProtocolParamLike = ProtocolItem['params'][number]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-line px-4 py-1.5 last:border-b-0">
      <span className="w-16 shrink-0 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Sidebar 属性面板卡 (record-detail.md §侧栏) */
export default function RecordPropertiesPanel({
  recordDate,
  onDateChange,
  projectId,
  onProjectChange,
  protocolId,
  protocolVersion,
  onProtocolChange,
  onReanchor,
  status,
  onStatusChange,
  tags,
  onTagsChange,
  createdAt,
  updatedAt,
}: {
  recordDate: string
  onDateChange: (d: string) => void
  projectId: number | null
  onProjectChange: (id: number | null) => void
  protocolId: number | null
  protocolVersion: string | null
  onProtocolChange: (protocol: ProtocolItem | null) => void
  onReanchor: (version: string, params: ProtocolParamLike[]) => void
  status: RecordStatus
  onStatusChange: (s: RecordStatus) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}) {
  const utils = trpc.useUtils()
  const projectsQuery = trpc.project.list.useQuery()
  const protocolsQuery = trpc.protocol.list.useQuery()
  const tagsQuery = trpc.tag.list.useQuery()
  const versionsQuery = trpc.protocol.listVersions.useQuery(
    { protocolId: protocolId ?? 0 },
    { enabled: protocolId != null },
  )
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const tagCreateMut = trpc.tag.create.useMutation()

  const projects = projectsQuery.data ?? []
  const protocols = protocolsQuery.data ?? []
  const project = projects.find((p) => p.id === projectId) ?? null
  const protocol = protocols.find((p) => p.id === protocolId) ?? null

  const versionOptions = useMemo(() => {
    if (!protocol) return []
    const opts: { version: string; params: ProtocolParamLike[]; current: boolean }[] = [
      { version: protocol.version, params: protocol.params, current: true },
    ]
    for (const v of versionsQuery.data ?? []) {
      if (v.version !== protocol.version) {
        opts.push({ version: v.version, params: v.snapshot.params, current: false })
      }
    }
    return opts
  }, [protocol, versionsQuery.data])

  const tagSuggestions = useMemo(() => {
    const existing = tagsQuery.data ?? []
    const needle = tagInput.replace(/^#/, '').trim().toLowerCase()
    return existing
      .filter((t) => !tags.includes(t.name))
      .filter((t) => !needle || t.name.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [tagsQuery.data, tags, tagInput])

  const addTag = async (raw: string) => {
    const name = raw.replace(/^#/, '').trim()
    if (!name || tags.includes(name)) {
      setTagInput('')
      return
    }
    const existing = (tagsQuery.data ?? []).find((t) => t.name === name)
    if (!existing) {
      try {
        const color = CATEGORY_COLORS[(tagsQuery.data?.length ?? 0) % CATEGORY_COLORS.length]
        await tagCreateMut.mutateAsync({ name, color })
        await utils.tag.list.invalidate()
      } catch (e) {
        toast.error(`创建标签失败：${e instanceof Error ? e.message : ''}`)
        return
      }
    }
    onTagsChange([...tags, name])
    setTagInput('')
  }

  const dateObj = useMemo(() => {
    const d = new Date(`${recordDate}T00:00:00`)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [recordDate])

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {/* date */}
      <Row label="日期">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 font-mono text-[13px] text-ink transition-colors duration-150 hover:bg-paper"
            >
              <CalendarDays className="h-3.5 w-3.5 text-ink-mute" />
              {recordDate}
              <ChevronDown className="ml-auto h-3 w-3 text-ink-mute" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateObj}
              onSelect={(d) => {
                if (!d) return
                const pad = (n: number) => `${n}`.padStart(2, '0')
                onDateChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
              }}
            />
          </PopoverContent>
        </Popover>
      </Row>

      {/* project */}
      <Row label="项目">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-[2rem] w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink transition-colors duration-150 hover:bg-paper"
            >
              {project ? (
                <>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="min-w-0 leading-[18px]">{project.name}</span>
                </>
              ) : (
                <span className="text-ink-mute">未分组</span>
              )}
              <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-ink-mute" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => onProjectChange(null)} className="text-[13px]">
              未分组
            </DropdownMenuItem>
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => onProjectChange(p.id)}
                className="gap-2 text-[13px]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="min-w-0 flex-1 leading-[18px]">{p.name}</span>
                {p.id === projectId && <Check className="h-3.5 w-3.5 shrink-0 text-bench" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setProjectDialogOpen(true)}
              className="gap-2 text-[13px] text-bench"
            >
              <Plus className="h-3.5 w-3.5" /> 新建项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>

      {/* protocol + version lock */}
      <Row label="关联协议">
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-h-[2rem] min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors duration-150 hover:bg-paper"
              >
                {protocol ? (
                  <span className="min-w-0 font-medium leading-[18px] text-bench">{protocol.name}</span>
                ) : (
                  <span className="text-ink-mute">不关联协议</span>
                )}
                <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-ink-mute" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onSelect={() => onProtocolChange(null)} className="text-[13px]">
                不关联协议
              </DropdownMenuItem>
              {protocols.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => onProtocolChange(p)}
                  className="gap-2 text-[13px]"
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" style={{ color: p.color }} />
                  <span className="min-w-0 flex-1 leading-[18px]">{p.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-mute">{p.version}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {protocol && protocolVersion && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="版本锁定 — 点击切换锚定版本"
                  className="flex h-6 shrink-0 items-center gap-0.5 rounded-full bg-bench-wash px-2 font-mono text-[11px] font-medium text-bench-ink transition-colors duration-150 hover:brightness-95"
                >
                  {protocolVersion}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {versionOptions.map((v) => (
                  <DropdownMenuItem
                    key={v.version}
                    onSelect={() => {
                      if (v.version === protocolVersion) return
                      onReanchor(v.version, v.params)
                    }}
                    className="gap-2 text-[13px]"
                  >
                    <History className="h-3.5 w-3.5 text-ink-mute" />
                    <span className="font-mono">{v.version}</span>
                    {v.current && <span className="text-[11px] text-ink-mute">当前</span>}
                    {v.version === protocolVersion && (
                      <Check className="ml-auto h-3.5 w-3.5 text-bench" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Row>

      {/* status */}
      <Row label="状态">
        <RecordStatusMenu status={status} onChange={onStatusChange} />
      </Row>

      {/* tags */}
      <Row label="标签">
        <div className="flex flex-wrap items-center gap-1.5 py-1">
          {tags.map((t) => {
            const meta = (tagsQuery.data ?? []).find((x) => x.name === t)
            return (
              <RecordTagChip
                key={t}
                name={t}
                color={meta?.color}
                onRemove={() => onTagsChange(tags.filter((x) => x !== t))}
              />
            )
          })}
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="添加标签"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-mute transition-colors duration-150 hover:border-bench hover:text-bench"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-2">
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="# 输入标签名，回车创建"
                className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none placeholder:text-ink-mute focus:border-bench"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addTag(tagInput)
                  }
                }}
              />
              {tagSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tagSuggestions.map((t) => (
                    <RecordTagChip key={t.name} name={t.name} color={t.color} onClick={() => void addTag(t.name)} />
                  ))}
                </div>
              )}
              {tagInput.trim() &&
                !tagSuggestions.some((t) => t.name === tagInput.replace(/^#/, '').trim()) && (
                  <p className="mt-2 px-1 text-[11.5px] text-ink-mute">
                    回车创建新标签 #{tagInput.replace(/^#/, '').trim()}
                  </p>
                )}
            </PopoverContent>
          </Popover>
        </div>
      </Row>

      {/* timestamps */}
      {(createdAt || updatedAt) && (
        <Row label="创建/更新">
          <div className="px-2 font-mono text-[11.5px] leading-5 text-ink-mute">
            {createdAt && <div>{fmtDateTime(createdAt)} 创建</div>}
            {updatedAt && <div>{fmtDateTime(updatedAt)} 更新</div>}
          </div>
        </Row>
      )}

      <RecordProjectDialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 协议快照卡                                                           */
/* ------------------------------------------------------------------ */
export function RecordProtocolSnapshotCard({
  protocol,
  anchoredVersion,
}: {
  protocol: ProtocolItem
  anchoredVersion: string | null
}) {
  const stepCount = protocol.stepGroups.reduce((n, g) => n + g.steps.length, 0)
  const stale = anchoredVersion != null && anchoredVersion !== protocol.version
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: wash(protocol.color), color: protocol.color }}
        >
          <FlaskConical className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[14px] font-semibold leading-[19px] text-ink">{protocol.name}</p>
          <p className="font-mono text-[11px] text-ink-mute">
            {protocol.version} · 步骤 {stepCount} · {protocol.category}
          </p>
        </div>
      </div>
      {protocol.params.slice(0, 3).length > 0 && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2.5">
          {protocol.params.slice(0, 3).map((p) => (
            <div key={p.name} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="text-ink-soft">{p.name}</span>
              <span className="font-mono font-medium text-ink">
                {p.value}
                {p.unit ? ` ${p.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {stale && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-[#B98A3E12] px-3 py-2 text-[12px] leading-5 text-warning">
          协议已更新至 {protocol.version}，本记录锚定 {anchoredVersion} 快照（保证科学可溯）
        </div>
      )}
      <Link
        to={`/protocols/${protocol.id}`}
        className="mt-3 inline-block text-[12.5px] font-medium text-bench transition-colors duration-150 hover:text-bench-deep hover:underline"
      >
        查看完整协议 →
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 活动历史卡                                                           */
/* ------------------------------------------------------------------ */
export function RecordActivityCard({
  createdAt,
  updatedAt,
  imageCount,
  status,
}: {
  createdAt: Date | string
  updatedAt: Date | string
  imageCount: number
  status: RecordStatus
}) {
  const items: string[] = [`${fmtDateTime(createdAt)} 创建`]
  if (imageCount > 0) items.push(`已上传 ${imageCount} 张结果图片`)
  if (status === 'done') items.push('已标记完成')
  if (status === 'failed') items.push('标记为失败 — 失败也是数据')
  items.push(`${fmtDateTime(updatedAt)} 最近更新`)
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="caption-en mb-3">活动历史 ACTIVITY</p>
      <div className="flex flex-col">
        {items.map((t, i) => (
          <div key={i} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < items.length - 1 && (
              <span className="absolute left-[3.5px] top-3 h-full w-px bg-line" aria-hidden />
            )}
            <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full border border-line-strong bg-paper" />
            <span className="text-[12.5px] leading-5 text-ink-mute">{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
