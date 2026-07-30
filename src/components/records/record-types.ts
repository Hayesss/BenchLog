import type { inferRouterOutputs } from '@trpc/server'
import type { CreateTRPCReact } from '@trpc/react-query'
import type { trpc } from '@/providers/trpc'

/* Router output types inferred through the typed trpc proxy (no api/ imports,
   no hand-written entity interfaces). */
type AppRouterFromProxy = typeof trpc extends CreateTRPCReact<infer R, unknown> ? R : never
type RouterOutputs = inferRouterOutputs<AppRouterFromProxy>

export type RecordListItem = RouterOutputs['record']['list'][number]
export type RecordDetailData = NonNullable<RouterOutputs['record']['byId']>
export type RecordImageItem = RecordDetailData['images'][number]
export type AttachmentItem = RouterOutputs['attachment']['listByRecord'][number]
export type RecordVersionItem = RouterOutputs['record']['versions'][number]
/** 项目基础行（record.project / 对话框编辑目标等场景，不含关联计数） */
export type ProjectItem = Omit<
  RouterOutputs['project']['list'][number],
  'recordCount' | 'analysisCount'
>
/** 项目管理页列表项：项目行 + {recordCount, analysisCount} */
export type ProjectWithCounts = RouterOutputs['project']['list'][number]
export type ProtocolItem = RouterOutputs['protocol']['list'][number]
export type TagItem = RouterOutputs['tag']['list'][number]
export type Deviation = RecordListItem['deviations'][number]
export type RecordStatus = RecordListItem['status']

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Muted category hues (design.md §3) — next-color assignment for new tags/projects */
export const CATEGORY_COLORS = ['#3E7C6B', '#5B7C99', '#B08D57', '#B0707C', '#8A7CA8', '#7C9161']

export const IMAGE_KINDS = ['WB条带', '流式图', '显微镜', '其他'] as const

export const KIND_COLOR: Record<string, string> = {
  WB条带: '#B08D57',
  流式图: '#5B7C99',
  显微镜: '#3E7C6B',
  其他: '#8A9099',
}

export const STATUS_META: Record<
  RecordStatus,
  { label: string; en: string; chip: string; text: string }
> = {
  ongoing: { label: '进行中', en: 'Ongoing', chip: 'bg-[#5B7C991F]', text: 'text-info' },
  done: { label: '已完成', en: 'Done', chip: 'bg-[#4C8C6B1F]', text: 'text-success' },
  failed: { label: '失败重复', en: 'Failed', chip: 'bg-[#B4564E1F]', text: 'text-danger' },
}

/** 12%-opacity wash of a hex color, e.g. #3E7C6B → #3E7C6B1F */
export function wash(hex: string): string {
  return hex.length === 7 ? `${hex}1F` : hex
}

/** Local today as YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Record code like R-2025-058 (design records.md §3) */
export function recordCode(id: number, recordDate: string): string {
  return `R-${recordDate.slice(0, 4)}-${String(id).padStart(3, '0')}`
}

export function fmtDateShort(dateStr: string): string {
  return dateStr.slice(5) // MM-DD
}

export function fmtDateTime(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return `周${WEEKDAYS_CN[d.getDay()]}`
}
