import { useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { PenLine, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import type { ExportImage, ExportRecord, ReportOptions, ReportTemplate } from './reportTypes'
import { STATUS_ICON, STATUS_LABEL } from './reportTypes'
import type { ReportMeta } from './reportBuild'
import { anonymizeText, groupByProject, protocolLabel, recordCode, statusCounts } from './reportBuild'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * Print stylesheet — isolates the A4 report and hides all app chrome.
 * Lives inside this component (per contract: src/index.css is off-limits).
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #export-print-root, #export-print-root * { visibility: visible !important; }
  #export-print-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    aspect-ratio: auto !important;
    overflow: visible !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    background: #fff !important;
    padding: 0 !important;
  }
  #export-print-root > div {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
  #export-print-root .report-page {
    break-after: page;
    page-break-after: always;
    min-height: auto !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }
  #export-print-root .report-page:last-child { break-after: auto; page-break-after: auto; }
  #export-print-root .report-no-print { display: none !important; }
  @page { size: A4; margin: 12mm; }
}
`

function Hairline() {
  return <div className="my-3 h-px bg-line" />
}

function DeviationChip({ text }: { text: string }) {
  return (
    <span className="inline-block rounded-full bg-[#B98A3E1F] px-2 py-0.5 font-mono text-[11.5px] text-warning">
      {text}
    </span>
  )
}

function StatusChip({ status }: { status: ExportRecord['status'] }) {
  const cls =
    status === 'done'
      ? 'bg-[#4C8C6B1F] text-success'
      : status === 'failed'
        ? 'bg-[#B4564E1F] text-danger'
        : 'bg-[#5B7C991F] text-info'
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function Thumb({
  img,
  size = 48,
  onOpen,
}: {
  img: ExportImage
  size?: number
  onOpen: (img: ExportImage) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(img)}
      className="group relative shrink-0 overflow-hidden rounded-md border border-line transition-transform duration-150 hover:-translate-y-0.5"
      style={{ width: size, height: size }}
      title={img.caption ?? img.kind}
    >
      <img src={img.data} alt={img.caption ?? img.kind} className="h-full w-full object-cover" />
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-ink/70 px-1 font-mono text-[9px] leading-[14px] text-white">
        {img.kind}
      </span>
    </button>
  )
}

/** 图片 Lightbox（缩略图 → 全屏） */
function Lightbox({
  img,
  onClose,
}: {
  img: ExportImage | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {img && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
        >
          <motion.figure
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-3xl overflow-hidden rounded-lg bg-surface shadow-overlay"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] text-bench-ink">
                {img.kind}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={img.data}
              alt={img.caption ?? img.kind}
              className="max-h-[70vh] w-full object-contain bg-paper"
            />
            {img.caption && (
              <figcaption className="border-t border-line px-3 py-2 text-[12.5px] text-ink-soft">
                {img.caption}
              </figcaption>
            )}
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- 模板 1 · 组会汇报 Markdown 结构化预览 ---------------- */

function MdRecordBlock({
  r,
  opts,
  onOpenImg,
}: {
  r: ExportRecord
  opts: ReportOptions
  onOpenImg: (img: ExportImage) => void
}) {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  return (
    <div className="mt-3">
      <h3 className="text-[14.5px] font-semibold text-ink">
        <span className="mr-1.5">{STATUS_ICON[r.status]}</span>
        <span className="mr-1.5 font-mono text-[12px] text-ink-mute">{recordCode(r)}</span>
        {an(r.title)}
      </h3>
      <p className="mt-1 font-mono text-[11.5px] text-ink-mute">
        {r.recordDate} ｜ {an(protocolLabel(r))} ｜ {STATUS_LABEL[r.status]}
      </p>
      {r.purpose && <p className="mt-1.5 text-[13px] leading-[20px] text-ink-soft">目的：{an(r.purpose)}</p>}
      {opts.includeDeviations && r.deviations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-ink-mute">偏离：</span>
          {r.deviations.map((d, i) => (
            <DeviationChip
              key={i}
              text={`${an(d.param)} ${an(d.defaultValue)} → ${an(d.actualValue)}`}
            />
          ))}
        </div>
      )}
      {r.resultMd && (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[20px] text-ink-soft">
          结果：{an(r.resultMd)}
        </p>
      )}
      {(r.conclusion || r.nextStep) && (
        <p className="mt-1.5 text-[13px] leading-[20px] text-ink">
          {r.conclusion && <>结论：{an(r.conclusion)}</>}
          {r.conclusion && r.nextStep && <span className="mx-1.5 text-ink-mute">｜</span>}
          {r.nextStep && <span className="text-ink-soft">下一步：{an(r.nextStep)}</span>}
        </p>
      )}
      {opts.includeImages && r.images.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {r.images.map((im) => (
            <Thumb key={im.id} img={im} onOpen={onOpenImg} />
          ))}
        </div>
      )}
    </div>
  )
}

function MarkdownPreview({
  records,
  opts,
  meta,
  onOpenImg,
}: {
  records: ExportRecord[]
  opts: ReportOptions
  meta: ReportMeta
  onOpenImg: (img: ExportImage) => void
}) {
  const an = (s: string) => anonymizeText(s, opts.anonymize)
  const groups = groupByProject(records)
  const failed = records.filter((r) => r.status === 'failed')
  const plans = [...new Set(records.map((r) => (r.nextStep ?? '').trim()).filter(Boolean))]

  return (
    <div>
      <h1 className="font-display text-[22px] font-bold leading-[30px] text-ink">
        组会汇报 · {meta.today}
      </h1>
      <p className="mt-1 font-mono text-[12px] text-ink-mute">
        博士生：{an(meta.researcher)} · 周期：{meta.rangeLabel} · 共 {records.length} 条记录
      </p>
      <Hairline />

      {/* 项目统计概览 */}
      <h2 className="font-display text-[15px] font-semibold text-ink">项目统计概览</h2>
      <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-paper text-left text-ink-mute">
              {['项目', '记录数', '已完成', '进行中', '失败重复'].map((h, i) => (
                <th
                  key={h}
                  className={cn('px-2.5 py-1.5 font-medium', i > 0 && 'text-right font-mono')}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const c = statusCounts(g.records)
              return (
                <tr key={g.key} className="border-t border-line">
                  <td className="px-2.5 py-1.5">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: g.color }}
                    />
                    {an(g.name)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{g.records.length}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{c.done}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{c.ongoing}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono">{c.failed}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 按项目分组 */}
      {groups.map((g, gi) => (
        <div key={g.key} className="mt-5">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
            {['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][gi] ?? gi + 1}、
            {an(g.name)}
            <span className="font-mono text-[12px] font-normal text-ink-mute">
              （{g.records.length} 条）
            </span>
          </h2>
          <Hairline />
          {g.records.map((r) => (
            <MdRecordBlock key={r.id} r={r} opts={opts} onOpenImg={onOpenImg} />
          ))}
        </div>
      ))}

      {/* 失败与问题 */}
      {failed.length > 0 && (
        <div className="mt-5">
          <h2 className="font-display text-[17px] font-semibold text-ink">
            失败与问题
            <span className="ml-2 font-mono text-[12px] font-normal text-danger">
              （{failed.length} 条）
            </span>
          </h2>
          <Hairline />
          {failed.map((r) => (
            <p key={r.id} className="mt-1.5 text-[13px] leading-[20px] text-ink-soft">
              <span className="font-mono text-[12px] text-danger">{recordCode(r)}</span>{' '}
              {an(r.title)}
              {r.conclusion && <span className="text-ink-mute"> —— {an(r.conclusion)}</span>}
            </p>
          ))}
        </div>
      )}

      {/* 下周计划 */}
      <div className="mt-5">
        <h2 className="font-display text-[17px] font-semibold text-ink">下周计划</h2>
        <Hairline />
        {plans.length === 0 ? (
          <p className="text-[13px] text-ink-mute">（各记录均未填写「下一步」）</p>
        ) : (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] leading-[20px] text-ink-soft">
            {plans.map((p) => (
              <li key={p}>{an(p)}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** 源码微调后的 Markdown 渲染（react-markdown） */
/* eslint-disable @typescript-eslint/no-unused-vars -- react-markdown 传入的 node 需剥离后再展开 */
function EditedMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ node: _n, ...p }) => (
          <h1 className="font-display text-[22px] font-bold leading-[30px] text-ink" {...p} />
        ),
        h2: ({ node: _n, ...p }) => (
          <h2 className="mt-5 font-display text-[17px] font-semibold text-ink" {...p} />
        ),
        h3: ({ node: _n, ...p }) => <h3 className="mt-3 text-[14.5px] font-semibold text-ink" {...p} />,
        p: ({ node: _n, ...p }) => (
          <p className="mt-1.5 text-[13px] leading-[20px] text-ink-soft" {...p} />
        ),
        ul: ({ node: _n, ...p }) => <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]" {...p} />,
        ol: ({ node: _n, ...p }) => (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px]" {...p} />
        ),
        table: ({ node: _n, ...p }) => (
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-[12px]" {...p} />
          </div>
        ),
        th: ({ node: _n, ...p }) => (
          <th className="bg-paper px-2.5 py-1.5 text-left font-medium text-ink-mute" {...p} />
        ),
        td: ({ node: _n, ...p }) => <td className="border-t border-line px-2.5 py-1.5" {...p} />,
        hr: () => <Hairline />,
        strong: ({ node: _n, ...p }) => <strong className="font-semibold text-ink" {...p} />,
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}

/* eslint-enable @typescript-eslint/no-unused-vars */

/* ---------------- 模板 2 · 汇总表格预览 ---------------- */

function TablePreview({ records, opts }: { records: ExportRecord[]; opts: ReportOptions }) {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
        <thead className="sticky top-0">
          <tr className="bg-paper text-left text-ink-mute">
            {['日期', '项目', '标题', '方法', '状态', '参数偏离', '结论', '下一步'].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-line-strong px-2.5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-b-0">
              <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[12px]">{r.recordDate}</td>
              <td className="whitespace-nowrap px-2.5 py-2">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: r.project?.color || '#8A9099' }}
                />
                {an(r.project?.name ?? '未归档')}
              </td>
              <td className="min-w-[140px] px-2.5 py-2 font-medium text-ink">{an(r.title)}</td>
              <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[12px] text-ink-soft">
                {an(protocolLabel(r))}
              </td>
              <td className="whitespace-nowrap px-2.5 py-2">
                <StatusChip status={r.status} />
              </td>
              <td
                className={cn(
                  'min-w-[130px] px-2.5 py-2 font-mono text-[11.5px]',
                  opts.includeDeviations && r.deviations.length > 0
                    ? 'bg-[#B98A3E14] text-warning'
                    : 'text-ink-mute',
                )}
              >
                {opts.includeDeviations && r.deviations.length > 0
                  ? r.deviations
                      .map((d) => `${an(d.param)} ${an(d.defaultValue)}→${an(d.actualValue)}`)
                      .join('；')
                  : '—'}
              </td>
              <td className="min-w-[160px] px-2.5 py-2 text-ink-soft">{an(r.conclusion) || '—'}</td>
              <td className="min-w-[140px] px-2.5 py-2 text-ink-soft">{an(r.nextStep) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- 模板 3 · 存档 PDF 分页预览 ---------------- */

function PdfRecordPage({
  r,
  index,
  total,
  opts,
  onOpenImg,
}: {
  r: ExportRecord
  index: number
  total: number
  opts: ReportOptions
  onOpenImg: (img: ExportImage) => void
}) {
  const an = (s: string | null | undefined) => anonymizeText(s ?? '', opts.anonymize)
  return (
    <article className="report-page flex min-h-[720px] flex-col p-8 md:p-10">
      {/* 页眉 */}
      <header className="flex items-center justify-between font-mono text-[11px] tracking-[0.04em] text-ink-mute">
        <span>{recordCode(r)} · {r.recordDate}</span>
        <span>BENCHLOG ARCHIVE</span>
      </header>
      <Hairline />

      <h2 className="font-display text-[20px] font-bold leading-[28px] text-ink">{an(r.title)}</h2>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] text-ink-mute">
        <span>{an(r.project?.name ?? '未归档项目')}</span>
        <span>·</span>
        <span>{an(protocolLabel(r))}</span>
        <span>·</span>
        <StatusChip status={r.status} />
        {r.tags.map((t) => (
          <span key={t} className="rounded-full bg-bench-wash px-1.5 py-0.5 text-[10.5px] text-bench-ink">
            #{an(t)}
          </span>
        ))}
      </p>

      {r.purpose && (
        <section className="mt-4">
          <h3 className="text-[13px] font-semibold tracking-[0.01em] text-ink">实验目的</h3>
          <p className="mt-1 text-[13px] leading-[21px] text-ink-soft">{an(r.purpose)}</p>
        </section>
      )}

      {opts.includeDeviations && r.deviations.length > 0 && (
        <section className="mt-4">
          <h3 className="text-[13px] font-semibold tracking-[0.01em] text-ink">参数偏离</h3>
          <table className="mt-1.5 w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-paper text-left text-ink-mute">
                {['参数', '默认值', '实际值', '原因'].map((h) => (
                  <th key={h} className="border border-line px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.deviations.map((d, i) => (
                <tr key={i}>
                  <td className="border border-line px-2 py-1.5">{an(d.param)}</td>
                  <td className="border border-line px-2 py-1.5 font-mono">{an(d.defaultValue)}</td>
                  <td className="border border-line bg-[#B98A3E14] px-2 py-1.5 font-mono text-warning">
                    {an(d.actualValue)}
                  </td>
                  <td className="border border-line px-2 py-1.5 text-ink-soft">
                    {an(d.reason) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.resultMd && (
        <section className="mt-4">
          <h3 className="text-[13px] font-semibold tracking-[0.01em] text-ink">结果</h3>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[21px] text-ink-soft">
            {an(r.resultMd)}
          </p>
        </section>
      )}

      {opts.includeImages && r.images.length > 0 && (
        <section className="mt-4">
          <h3 className="text-[13px] font-semibold tracking-[0.01em] text-ink">
            结果图片（{r.images.length}）
          </h3>
          <div className="mt-2 flex flex-col items-center gap-3">
            {r.images.map((im, i) => (
              <figure key={im.id} className="w-full max-w-[420px]">
                <button
                  type="button"
                  onClick={() => onOpenImg(im)}
                  className="report-no-print block w-full overflow-hidden rounded-md border border-line"
                >
                  <img src={im.data} alt={im.caption ?? im.kind} className="w-full object-contain" />
                </button>
                <img
                  src={im.data}
                  alt={im.caption ?? im.kind}
                  className="hidden w-full rounded-md border border-line object-contain print:block"
                />
                <figcaption className="mt-1 text-center font-mono text-[11px] text-ink-mute">
                  图{i + 1} · {an(im.kind)}
                  {im.caption ? `：${an(im.caption)}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {(r.conclusion || r.nextStep) && (
        <section className="mt-4 rounded-md border border-line bg-paper p-3">
          {r.conclusion && (
            <p className="text-[13px] leading-[20px] text-ink">
              <span className="font-semibold">结论：</span>
              {an(r.conclusion)}
            </p>
          )}
          {r.nextStep && (
            <p className="mt-1 text-[13px] leading-[20px] text-ink-soft">
              <span className="font-semibold text-ink">下一步：</span>
              {an(r.nextStep)}
            </p>
          )}
        </section>
      )}

      {/* 页脚页码 */}
      <footer className="mt-auto pt-6 text-center font-mono text-[11px] text-ink-mute">
        第 {index + 1} 页 · 共 {total} 页
      </footer>
    </article>
  )
}

function PdfCoverPage({
  records,
  opts,
  meta,
}: {
  records: ExportRecord[]
  opts: ReportOptions
  meta: ReportMeta
}) {
  const an = (s: string) => anonymizeText(s, opts.anonymize)
  const groups = groupByProject(records)
  const c = statusCounts(records)
  const imgCount = records.reduce((n, r) => n + (opts.includeImages ? r.images.length : 0), 0)
  return (
    <article className="report-page flex min-h-[720px] flex-col p-8 md:p-10">
      <header className="flex items-center justify-between font-mono text-[11px] tracking-[0.04em] text-ink-mute">
        <span>BENCHLOG ARCHIVE</span>
        <span>{meta.today}</span>
      </header>
      <Hairline />
      <div className="flex flex-1 flex-col justify-center py-10">
        <p className="caption-en">EXPERIMENT RECORD ARCHIVE</p>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-[38px] text-ink">
          湿实验记录存档报告
        </h1>
        <p className="mt-3 font-mono text-[12.5px] text-ink-mute">
          归档人：{an(meta.researcher)} · 周期：{meta.rangeLabel}
        </p>
        <div className="mt-8 grid grid-cols-4 gap-3">
          {[
            { label: '记录', value: records.length },
            { label: '已完成', value: c.done },
            { label: '进行中', value: c.ongoing },
            { label: '图片', value: imgCount },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-line p-3 text-center">
              <div className="font-mono text-[22px] text-ink">{s.value}</div>
              <div className="mt-0.5 text-[11px] text-ink-mute">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          {groups.map((g) => (
            <p key={g.key} className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
              {an(g.name)}
              <span className="font-mono text-[12px] text-ink-mute">× {g.records.length}</span>
            </p>
          ))}
        </div>
      </div>
      <footer className="pt-6 text-center font-mono text-[11px] text-ink-mute">
        由 BenchLog 生成 · 失败也是数据
      </footer>
    </article>
  )
}

/* ---------------- 预览容器 ---------------- */

function PaperSkeleton() {
  return (
    <div className="animate-pulse p-8 md:p-10">
      <div className="h-6 w-2/5 rounded bg-line/80" />
      <div className="mt-3 h-3 w-3/5 rounded bg-line/60" />
      <div className="mt-8 h-4 w-1/4 rounded bg-line/70" />
      <div className="mt-3 h-24 rounded bg-line/50" />
      <div className="mt-6 h-4 w-1/3 rounded bg-line/70" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-line/50" />
        <div className="h-3 w-11/12 rounded bg-line/50" />
        <div className="h-3 w-4/5 rounded bg-line/50" />
      </div>
    </div>
  )
}

export interface ReportPaperProps {
  template: ReportTemplate
  records: ExportRecord[]
  options: ReportOptions
  markdown: string
  markdownEdited: boolean
  meta: ReportMeta
  loading: boolean
  signature: string
  /** 桌面预览持有 print root id；移动端覆盖层副本关闭（避免重复 id） */
  printable?: boolean
  onEditMarkdown: () => void
}

export default function ReportPaper({
  template,
  records,
  options,
  markdown,
  markdownEdited,
  meta,
  loading,
  signature,
  printable = true,
  onEditMarkdown,
}: ReportPaperProps) {
  const [lightbox, setLightbox] = useState<ExportImage | null>(null)
  const empty = !loading && records.length === 0
  const paged = template === 'pdf'

  return (
    <div className="rounded-lg bg-paper p-3 md:p-6 lg:p-8">
      <style>{PRINT_CSS}</style>

      {/* 预览工具行 */}
      <div className="report-no-print mx-auto mb-3 flex max-w-[680px] items-center justify-between">
        <span className="caption-en !text-[10px]">LIVE PREVIEW · A4</span>
        {template === 'markdown' && records.length > 0 && (
          <button
            type="button"
            onClick={onEditMarkdown}
            className="flex items-center gap-1 text-[12px] text-bench transition-colors duration-150 hover:text-bench-deep"
          >
            <PenLine className="h-3.5 w-3.5" />
            在 Markdown 中微调
          </button>
        )}
      </div>

      <div
        className={cn(
          'mx-auto w-full max-w-[680px]',
          paged && 'flex flex-col gap-6 bg-transparent',
        )}
      >
        {loading ? (
          <div className="overflow-hidden rounded-[4px] border border-line bg-surface shadow-[0_8px_32px_rgba(33,37,43,0.08)]">
            <PaperSkeleton />
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center rounded-[4px] border border-line bg-surface px-6 py-24 text-center shadow-[0_8px_32px_rgba(33,37,43,0.08)]">
            <img src="/empty-records.svg" alt="" className="w-40 opacity-80" />
            <h3 className="mt-4 font-display text-[17px] font-semibold text-ink">
              这个范围内还没有记录
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              调整汇报范围，或先去补一条湿实验记录
            </p>
            <Link
              to="/records"
              className="mt-4 flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97]"
            >
              前往湿实验记录
            </Link>
          </div>
        ) : (
          <motion.div
            key={signature}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            id={printable ? 'export-print-root' : undefined}
            className={cn(
              paged
                ? 'flex flex-col gap-6'
                : 'max-h-[82vh] overflow-y-auto rounded-[4px] border border-line bg-surface shadow-[0_8px_32px_rgba(33,37,43,0.08)]',
            )}
          >
            {template === 'markdown' && (
              <div className="p-8 md:p-10">
                {markdownEdited ? (
                  <EditedMarkdown markdown={markdown} />
                ) : (
                  <MarkdownPreview
                    records={records}
                    opts={options}
                    meta={meta}
                    onOpenImg={setLightbox}
                  />
                )}
              </div>
            )}
            {template === 'table' && <TablePreview records={records} opts={options} />}
            {template === 'pdf' && (
              <>
                <div className="overflow-hidden rounded-[4px] border border-line bg-surface shadow-[0_8px_32px_rgba(33,37,43,0.08)]">
                  <PdfCoverPage records={records} opts={options} meta={meta} />
                </div>
                {records.map((r, i) => (
                  <div
                    key={r.id}
                    className="overflow-hidden rounded-[4px] border border-line bg-surface shadow-[0_8px_32px_rgba(33,37,43,0.08)]"
                  >
                    <PdfRecordPage
                      r={r}
                      index={i + 1}
                      total={records.length + 1}
                      opts={options}
                      onOpenImg={setLightbox}
                    />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </div>

      <Lightbox img={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
