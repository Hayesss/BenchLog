import { trpc } from '@/providers/trpc'

/**
 * Entity types derived purely from tRPC inference (no api/@db imports) —
 * resolved through the vanilla client's procedure signatures.
 */
type TrpcClient = ReturnType<typeof trpc.useUtils>['client']
export type ProtocolData = NonNullable<Awaited<ReturnType<TrpcClient['protocol']['byId']['query']>>>
export type ProtocolListItem = Awaited<ReturnType<TrpcClient['protocol']['list']['query']>>[number]
export type ProtocolVersionRow = Awaited<
  ReturnType<TrpcClient['protocol']['listVersions']['query']>
>[number]
export type ProtocolSnapshotData = ProtocolVersionRow['snapshot']

export type ProtocolMaterial = ProtocolData['materials'][number]
export type ProtocolStepGroup = ProtocolData['stepGroups'][number]
export type ProtocolStep = ProtocolStepGroup['steps'][number]
export type ProtocolParam = ProtocolData['params'][number]

/** Content-shaped view used by the detail page: current protocol or a history snapshot. */
export interface ProtocolContentView {
  name: string
  category: string
  color: string
  description: string | null
  version: string
  materials: ProtocolMaterial[]
  stepGroups: ProtocolStepGroup[]
  params: ProtocolParam[]
  tags: string[]
}

/* ---------------- palette ---------------- */

/** Muted 6-hue category palette (design.md §3). */
export const CATEGORY_HUES = ['#3E7C6B', '#5B7C99', '#B08D57', '#B0707C', '#8A7CA8', '#7C9161'] as const

export const CATEGORY_OPTIONS = [
  '细胞培养',
  '病毒包装',
  '转染',
  '蛋白印迹',
  '流式',
  '单细胞组学',
  '其他',
] as const

/** Preferred ordering for category tabs; unknown categories append at the end. */
const CATEGORY_ORDER: string[] = ['细胞培养', '细胞', '病毒包装', '转染', '蛋白印迹', '蛋白', '流式', '单细胞组学', '组学', '其他']

export function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, 'zh')
  })
}

/** 12%-alpha wash of a hex color for chip / icon-container backgrounds. */
export function wash(hex: string, alpha = '1F'): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex
}

/* ---------------- counts & dates ---------------- */

export function countSteps(p: { stepGroups: { steps: unknown[] }[] }): number {
  return p.stepGroups.reduce((n, g) => n + g.steps.length, 0)
}

export function toDate(d: unknown): Date | null {
  if (d == null) return null
  const dt = d instanceof Date ? d : new Date(String(d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function formatDate(d: unknown): string {
  const dt = toDate(d)
  if (!dt) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function relativeDate(d: unknown): string {
  const dt = toDate(d)
  if (!dt) return ''
  const diff = Date.now() - dt.getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return formatDate(d)
}

/** 版本角标：30 天内迭代过版本（updatedAt 明显晚于 createdAt 且距今 ≤30 天）。 */
export function iteratedRecently(p: { createdAt: unknown; updatedAt: unknown }): boolean {
  const c = toDate(p.createdAt)
  const u = toDate(p.updatedAt)
  if (!c || !u) return false
  const evolved = u.getTime() - c.getTime() > 3600_000
  const within30 = Date.now() - u.getTime() < 30 * 86400000
  return evolved && within30
}

/* ---------------- step text param highlighting ---------------- */

/** Split step text into segments, wrapping occurrences of param values as inline chips. */
export function highlightParams(
  text: string,
  params: ProtocolParam[],
): Array<{ kind: 'text' | 'param'; value: string; param?: ProtocolParam }> {
  const needles = params
    .filter((p) => p.value && p.value.length >= 2 && text.includes(p.value))
    .sort((a, b) => b.value.length - a.value.length)
  if (needles.length === 0) return [{ kind: 'text', value: text }]
  const segs: Array<{ kind: 'text' | 'param'; value: string; param?: ProtocolParam }> = []
  let rest = text
  while (rest.length > 0) {
    let bestIdx = -1
    let best: ProtocolParam | null = null
    for (const p of needles) {
      const i = rest.indexOf(p.value)
      if (i !== -1 && (bestIdx === -1 || i < bestIdx)) {
        bestIdx = i
        best = p
      }
    }
    if (!best || bestIdx === -1) {
      segs.push({ kind: 'text', value: rest })
      break
    }
    if (bestIdx > 0) segs.push({ kind: 'text', value: rest.slice(0, bestIdx) })
    segs.push({ kind: 'param', value: best.value, param: best })
    rest = rest.slice(bestIdx + best.value.length)
  }
  return segs
}

/** Parse a duration string ("15 min" / "1 h" / "6h") into seconds; null when not timer-able. */
export function parseDurationSeconds(duration?: string): number | null {
  if (!duration) return null
  const m = duration.match(/(\d+(?:\.\d+)?)\s*(min|m(?!s)|分钟)/i)
  if (m) return Math.round(parseFloat(m[1]) * 60)
  const h = duration.match(/(\d+(?:\.\d+)?)\s*(h|hr|小时)/i)
  if (h) return Math.round(parseFloat(h[1]) * 3600)
  return null
}

/* ---------------- markdown export ---------------- */

export function protocolToMarkdown(c: ProtocolContentView, exportedAt = new Date()): string {
  const lines: string[] = []
  lines.push(`# ${c.name}`)
  lines.push('')
  lines.push(
    `> ${c.version} · 分类：${c.category} · 标签：${c.tags.map((t) => `#${t}`).join(' ') || '无'} · 导出于 ${formatDate(exportedAt)}`,
  )
  lines.push('')
  if (c.description) {
    lines.push(c.description)
    lines.push('')
  }
  if (c.materials.length > 0) {
    lines.push('## 材料清单')
    lines.push('')
    lines.push('| 材料 | 货号 | 用量 |')
    lines.push('| --- | --- | --- |')
    for (const m of c.materials) lines.push(`| ${m.name} | ${m.catalog ?? ''} | ${m.amount ?? ''} |`)
    lines.push('')
  }
  if (c.stepGroups.length > 0) {
    lines.push('## 操作步骤')
    lines.push('')
    for (const g of c.stepGroups) {
      lines.push(`### ${g.title}`)
      lines.push('')
      g.steps.forEach((s, i) => {
        lines.push(`${i + 1}. ${s.text}${s.duration ? `（${s.duration}）` : ''}`)
      })
      lines.push('')
    }
  }
  if (c.params.length > 0) {
    lines.push('## 关键参数')
    lines.push('')
    lines.push('| 参数 | 默认值 | 单位 | 备注 |')
    lines.push('| --- | --- | --- | --- |')
    for (const p of c.params) lines.push(`| ${p.name} | ${p.value} | ${p.unit ?? ''} | ${p.note ?? ''} |`)
    lines.push('')
  }
  return lines.join('\n')
}

export function downloadMarkdown(filename: string, md: string) {
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ---------------- version helpers ---------------- */

/** Suggest next minor version: v2.3 → v2.4; falls back to v1.1. */
export function bumpVersion(v: string): string {
  const m = v.match(/^v?(\d+)\.(\d+)$/)
  if (!m) return 'v1.1'
  return `v${m[1]}.${parseInt(m[2], 10) + 1}`
}

export interface ParamDiffRow {
  name: string
  oldValue: string | null
  newValue: string | null
  note?: string
  unit?: string
  kind: 'same' | 'changed' | 'added' | 'removed'
}

export function diffParams(oldParams: ProtocolParam[], newParams: ProtocolParam[]): ParamDiffRow[] {
  const rows: ParamDiffRow[] = []
  const newMap = new Map(newParams.map((p) => [p.name, p]))
  for (const o of oldParams) {
    const n = newMap.get(o.name)
    if (!n) rows.push({ name: o.name, oldValue: o.value, newValue: null, kind: 'removed' })
    else if (n.value !== o.value)
      rows.push({ name: o.name, oldValue: o.value, newValue: n.value, note: n.note, unit: n.unit ?? o.unit, kind: 'changed' })
    else rows.push({ name: o.name, oldValue: o.value, newValue: n.value, unit: n.unit, kind: 'same' })
  }
  for (const n of newParams) {
    if (!oldParams.some((o) => o.name === n.name))
      rows.push({ name: n.name, oldValue: null, newValue: n.value, note: n.note, unit: n.unit, kind: 'added' })
  }
  return rows
}
