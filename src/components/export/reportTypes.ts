import { trpc } from '@/providers/trpc'

/**
 * Types inferred from tRPC procedure outputs — no imports from api/ or @db,
 * per the full-stack contract. `useQuery` itself is generic (ReturnType would
 * collapse to `{}`), so we infer through the non-generic `getData` helpers on
 * the query utils proxy instead.
 */
type Utils = ReturnType<typeof trpc.useUtils>

type DataOutput = NonNullable<ReturnType<Utils['exportLog']['data']['getData']>>
export type ExportRecord = DataOutput['records'][number]
export type ExportAnalysis = DataOutput['analyses'][number]
export type ExportImage = ExportRecord['images'][number]
export type RecordStatus = ExportRecord['status']
export type AnalysisStatus = ExportAnalysis['status']

type RecordListOutput = NonNullable<ReturnType<Utils['record']['list']['getData']>>
export type RecordListItem = RecordListOutput[number]

type ProjectListOutput = NonNullable<ReturnType<Utils['project']['list']['getData']>>
export type ProjectItem = ProjectListOutput[number]

type HistoryOutput = NonNullable<ReturnType<Utils['exportLog']['list']['getData']>>
export type ExportLogItem = HistoryOutput[number]

export type ReportTemplate = 'markdown' | 'table' | 'pdf' | 'docx'
export type ScopePreset = 'week' | 'month' | 'recent10' | 'custom'

/** 数据来源开关：湿实验记录 / 生信分析（至少选一） */
export interface SourceSelection {
  records: boolean
  analyses: boolean
}

export interface DateRange {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}

export interface ReportOptions {
  includeImages: boolean
  includeDeviations: boolean
  includeFailed: boolean
  anonymize: boolean
}

export const STATUS_LABEL: Record<RecordStatus, string> = {
  ongoing: '进行中',
  done: '已完成',
  failed: '失败重复',
}

export const STATUS_ICON: Record<RecordStatus, string> = {
  ongoing: '🔄',
  done: '✅',
  failed: '❌',
}

export const STATUS_ORDER: RecordStatus[] = ['done', 'ongoing', 'failed']

export const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = {
  running: '进行中',
  done: '已完成',
  failed: '已失败',
}
