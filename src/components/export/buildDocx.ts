import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import type { ExportAnalysis, ExportRecord, ReportOptions } from './reportTypes'
import { ANALYSIS_STATUS_LABEL, STATUS_LABEL } from './reportTypes'
import type { ReportMeta } from './reportBuild'
import {
  analysisCode,
  anonymizeText,
  groupByProject,
  protocolLabel,
  recordCode,
  shortCommit,
} from './reportBuild'

/** 多行文本拆成段落（docx 不识别 \n） */
function textParas(
  text: string,
  opts?: { bold?: boolean; italics?: boolean },
): Paragraph[] {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, bold: opts?.bold, italics: opts?.italics })],
          spacing: { after: 80 },
        }),
    )
}

function fieldPara(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}：`, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { after: 80 },
  })
}

function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
  })
}

function h3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
  })
}

function recordParas(
  r: ExportRecord,
  opts: ReportOptions,
  an: (s: string | null | undefined) => string,
): Paragraph[] {
  const ps: Paragraph[] = []
  ps.push(h3(`${recordCode(r)} · ${an(r.title)}`))
  ps.push(
    fieldPara(
      '日期 / 方法 / 状态',
      `${r.recordDate} ｜ ${an(protocolLabel(r))} ｜ ${STATUS_LABEL[r.status]}`,
    ),
  )
  if (r.purpose) ps.push(fieldPara('目的', an(r.purpose)))
  if (r.tags.length) ps.push(fieldPara('标签', r.tags.map((t) => `#${an(t)}`).join(' ')))
  if (opts.includeDeviations && r.deviations.length > 0) {
    ps.push(
      fieldPara(
        '参数偏离',
        r.deviations
          .map((d) => `${an(d.param)} ${an(d.defaultValue)}→${an(d.actualValue)}（${an(d.reason ?? '—')}）`)
          .join('；'),
      ),
    )
  }
  if (r.resultMd) {
    ps.push(new Paragraph({ children: [new TextRun({ text: '结果', bold: true })], spacing: { after: 40 } }))
    ps.push(...textParas(an(r.resultMd)))
  }
  if (r.conclusion) ps.push(fieldPara('结论', an(r.conclusion)))
  if (r.nextStep) ps.push(fieldPara('下一步', an(r.nextStep)))
  // 图片不嵌入 docx，只列图注文字
  if (opts.includeImages && r.images.length > 0) {
    ps.push(
      fieldPara(
        '图片',
        r.images.map((im, i) => `图${i + 1}（${an(im.kind)}：${an(im.caption ?? '未命名')}）`).join('、'),
      ),
    )
  }
  return ps
}

function analysisParas(
  a: ExportAnalysis,
  an: (s: string | null | undefined) => string,
): Paragraph[] {
  const ps: Paragraph[] = []
  ps.push(h3(`${analysisCode(a)} · ${an(a.name)}`))
  ps.push(
    fieldPara(
      '日期 / 项目 / Pipeline / 状态',
      `${a.analysisDate} ｜ ${an(a.project?.name ?? '未归档')} ｜ ${an(a.pipeline)} ｜ ${ANALYSIS_STATUS_LABEL[a.status]}`,
    ),
  )
  if (a.inputData) ps.push(fieldPara('输入数据', an(a.inputData)))
  if (a.environment) ps.push(fieldPara('环境锁定', an(a.environment)))
  if (a.command) ps.push(fieldPara('运行命令', an(a.command)))
  const commit = shortCommit(a.commitHash)
  if (commit) ps.push(fieldPara('Commit', commit))
  if (a.resultMd) {
    ps.push(new Paragraph({ children: [new TextRun({ text: '结果摘要', bold: true })], spacing: { after: 40 } }))
    ps.push(...textParas(an(a.resultMd)))
  }
  if (a.conclusion) ps.push(fieldPara('结论', an(a.conclusion)))
  if (a.nextStep) ps.push(fieldPara('下一步', an(a.nextStep)))
  return ps
}

/** 生成 Word 汇报文档（.docx），结构与组会汇报 Markdown 一致 */
export async function buildDocxBlob(
  records: ExportRecord[],
  analyses: ExportAnalysis[],
  opts: ReportOptions,
  meta: ReportMeta,
): Promise<Blob> {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  const children: Paragraph[] = []

  // 标题 + 研究者行
  children.push(
    new Paragraph({
      text: `BenchLog 实验汇报 · ${meta.rangeLabel}`,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
  )
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `研究者：${an(meta.researcher)} · 周期：${meta.rangeLabel} · 生成日期：${meta.today} · 共 ${records.length} 条记录${analyses.length ? ` · 生信分析 ${analyses.length} 条` : ''}`,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  )

  // 湿实验记录：按项目分组
  if (records.length > 0) {
    children.push(h2(`湿实验记录（${records.length} 条）`))
    const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    const groups = groupByProject(records)
    groups.forEach((g, gi) => {
      children.push(h3(`${CN[gi] ?? String(gi + 1)}、${an(g.name)}（${g.records.length} 条）`))
      for (const r of g.records) children.push(...recordParas(r, opts, an))
    })
  }

  // 生信分析章节
  if (analyses.length > 0) {
    children.push(h2(`生信分析（${analyses.length} 条）`))
    for (const a of analyses) children.push(...analysisParas(a, an))
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `由 BenchLog 自动生成 · ${meta.today}`, color: '999999', italics: true }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
    }),
  )

  const doc = new Document({
    creator: 'BenchLog',
    title: `BenchLog 实验汇报 · ${meta.rangeLabel}`,
    sections: [{ children }],
  })
  return Packer.toBlob(doc)
}
