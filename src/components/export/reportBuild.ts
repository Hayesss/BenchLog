import type { ExportRecord, RecordStatus, ReportOptions } from './reportTypes'
import { STATUS_ICON, STATUS_LABEL } from './reportTypes'

/** 匿名化货号：掩码 `#4967`、`AB-123456` 一类的 catalog 编号 */
export function anonymizeText(text: string, on: boolean): string {
  if (!on) return text
  return text
    .replace(/#\s?\d{3,}[A-Za-z]?/g, '#××××')
    .replace(/\b[A-Z]{2,}[- ]\d{4,}\b/g, '××-××××')
}

const CN_NUMERAL = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function recordCode(r: Pick<ExportRecord, 'id'>): string {
  return `R-${r.id}`
}

export function mmdd(date: string): string {
  return date.slice(5) // YYYY-MM-DD → MM-DD
}

export function compactDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

export function reportFileName(format: 'markdown' | 'table' | 'pdf', date: Date): string {
  const c = compactDate(date)
  if (format === 'markdown') return `组会汇报-${c}.md`
  if (format === 'table') return `实验汇总-${c}.csv`
  return `存档报告-${c}.pdf`
}

export interface ReportMeta {
  researcher: string
  rangeLabel: string // e.g. "06-16 → 06-20" or "手动挑选"
  today: string // YYYY-MM-DD
}

export interface ProjectGroup {
  key: string
  name: string
  color: string
  records: ExportRecord[]
}

export function groupByProject(records: ExportRecord[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>()
  for (const r of records) {
    const key = r.project ? String(r.project.id) : 'none'
    const g =
      map.get(key) ??
      ({
        key,
        name: r.project?.name ?? '未归档项目',
        color: r.project?.color || '#8A9099',
        records: [],
      } satisfies ProjectGroup)
    g.records.push(r)
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => b.records.length - a.records.length)
}

export function statusCounts(records: ExportRecord[]): Record<RecordStatus, number> {
  const c: Record<RecordStatus, number> = { ongoing: 0, done: 0, failed: 0 }
  for (const r of records) c[r.status] += 1
  return c
}

export function protocolLabel(r: ExportRecord): string {
  if (!r.protocol) return '自由记录'
  const v = r.protocolVersion ?? r.protocol.version
  return v ? `${r.protocol.name} ${v.startsWith('v') ? v : `v${v}`}` : r.protocol.name
}

/** 组会汇报 Markdown（template 1）—— client-side 生成 */
export function buildGroupMarkdown(
  records: ExportRecord[],
  opts: ReportOptions,
  meta: ReportMeta,
): string {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  const lines: string[] = []
  const groups = groupByProject(records)

  lines.push(`# 组会汇报 · ${meta.today}`)
  lines.push('')
  lines.push(
    `博士生：${an(meta.researcher)} · 周期：${meta.rangeLabel} · 共 ${records.length} 条记录`,
  )
  lines.push('')

  // 项目统计概览
  lines.push('## 项目统计概览')
  lines.push('')
  lines.push('| 项目 | 记录数 | 已完成 | 进行中 | 失败重复 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const g of groups) {
    const c = statusCounts(g.records)
    lines.push(`| ${an(g.name)} | ${g.records.length} | ${c.done} | ${c.ongoing} | ${c.failed} |`)
  }
  lines.push('')

  // 按项目分组的记录详情
  groups.forEach((g, gi) => {
    const numeral = CN_NUMERAL[gi] ?? String(gi + 1)
    lines.push(`## ${numeral}、${an(g.name)}（${g.records.length} 条）`)
    lines.push('')
    for (const r of g.records) {
      lines.push(`### ${STATUS_ICON[r.status]} ${recordCode(r)} · ${an(r.title)}`)
      lines.push('')
      lines.push(
        `- **日期**：${r.recordDate} ｜ **协议**：${an(protocolLabel(r))} ｜ **状态**：${STATUS_LABEL[r.status]}`,
      )
      if (r.purpose) lines.push(`- **目的**：${an(r.purpose)}`)
      if (r.tags.length) lines.push(`- **标签**：${r.tags.map((t) => `#${an(t)}`).join(' ')}`)
      lines.push('')

      if (opts.includeDeviations && r.deviations.length > 0) {
        lines.push('**参数偏离**')
        lines.push('')
        lines.push('| 参数 | 默认值 | 实际值 | 原因 |')
        lines.push('| --- | --- | --- | --- |')
        for (const d of r.deviations) {
          lines.push(
            `| ${an(d.param)} | ${an(d.defaultValue)} | ${an(d.actualValue)} | ${an(d.reason ?? '—')} |`,
          )
        }
        lines.push('')
      }

      if (r.resultMd) {
        lines.push('**结果**')
        lines.push('')
        lines.push(an(r.resultMd))
        lines.push('')
      }

      const tail: string[] = []
      if (r.conclusion) tail.push(`**结论**：${an(r.conclusion)}`)
      if (r.nextStep) tail.push(`**下一步**：${an(r.nextStep)}`)
      if (tail.length) {
        lines.push(tail.join('　　'))
        lines.push('')
      }

      if (opts.includeImages && r.images.length > 0) {
        const refs = r.images
          .map((im, i) => `图${i + 1}（${an(im.kind)}：${an(im.caption ?? '未命名')}）`)
          .join('、')
        lines.push(`**图片**：${refs}（原图见存档 PDF，不内嵌于 Markdown）`)
        lines.push('')
      }
    }
  })

  // 失败与问题
  const failed = records.filter((r) => r.status === 'failed')
  if (failed.length > 0) {
    lines.push(`## 失败与问题（${failed.length} 条）`)
    lines.push('')
    for (const r of failed) {
      lines.push(`- **${recordCode(r)} · ${an(r.title)}**（${r.recordDate}）`)
      const reasons = r.deviations
        .map((d) => d.reason)
        .filter((x): x is string => Boolean(x))
      if (reasons.length) lines.push(`  - 偏离原因：${an(reasons.join('；'))}`)
      if (r.conclusion) lines.push(`  - 复盘：${an(r.conclusion)}`)
      if (r.nextStep) lines.push(`  - 对策：${an(r.nextStep)}`)
    }
    lines.push('')
  }

  // 下周计划（nextStep 去重聚合）
  const seen = new Set<string>()
  const plans: string[] = []
  for (const r of records) {
    const t = (r.nextStep ?? '').trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      plans.push(t)
    }
  }
  lines.push('## 下周计划')
  lines.push('')
  if (plans.length === 0) {
    lines.push('- （各记录均未填写「下一步」）')
  } else {
    plans.forEach((p, i) => lines.push(`${i + 1}. ${an(p)}`))
  }
  lines.push('')
  lines.push('---')
  lines.push(`由 BenchLog 自动生成 · ${meta.today}`)
  return lines.join('\n')
}

const TABLE_COLUMNS = ['日期', '项目', '标题', '协议', '状态', '参数偏离', '结论', '下一步'] as const

function deviationSummary(r: ExportRecord, opts: ReportOptions): string {
  if (!opts.includeDeviations || r.deviations.length === 0) return ''
  return r.deviations
    .map((d) => `${anonymizeText(d.param, opts.anonymize)} ${anonymizeText(d.defaultValue, opts.anonymize)}→${anonymizeText(d.actualValue, opts.anonymize)}`)
    .join('；')
}

function tableRow(r: ExportRecord, opts: ReportOptions): string[] {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  return [
    r.recordDate,
    an(r.project?.name ?? '未归档'),
    an(r.title),
    an(protocolLabel(r)),
    STATUS_LABEL[r.status],
    deviationSummary(r, opts),
    an(r.conclusion),
    an(r.nextStep),
  ]
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 汇总表格 CSV —— BOM 前缀保证 Excel 中文兼容 */
export function buildCsv(records: ExportRecord[], opts: ReportOptions): string {
  const rows = [TABLE_COLUMNS.join(','), ...records.map((r) => tableRow(r, opts).map(csvCell).join(','))]
  return '﻿' + rows.join('\r\n')
}

/** 复制表格到剪贴板用 TSV */
export function buildTsv(records: ExportRecord[], opts: ReportOptions): string {
  const rows = [TABLE_COLUMNS.join('\t'), ...records.map((r) => tableRow(r, opts).join('\t'))]
  return rows.join('\n')
}

export function downloadTextFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
