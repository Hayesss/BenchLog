import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { CalendarDays, Eye, FlaskConical, FolderKanban, Link2Off, SquareTerminal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* 只读分享公开页（免登录）：/share/:token                                */
/* 数据来自公开端点 GET /api/share/:token（token 即权限，撤销/删除即 404） */
/* ------------------------------------------------------------------ */

type RecordContent = {
  kind: 'record'
  title: string
  recordDate: string
  status: string
  tags: string[]
  projectName: string | null
  protocolTitle: string | null
  protocolVersion: string | null
  purpose: string | null
  resultMd: string | null
  contentHtml: string | null
  deviations: { param: string; defaultValue: string; actualValue: string; reason?: string | null }[]
  conclusion: string | null
  nextStep: string | null
  images: { caption: string | null; kind: string; mime: string; data: string }[]
}

type AnalysisContent = {
  kind: 'analysis'
  name: string
  analysisDate: string
  status: string
  pipeline: string
  projectName: string | null
  inputData: string | null
  dataPath: string | null
  resultPath: string | null
  repoUrl: string | null
  commitHash: string | null
  environment: string | null
  command: string | null
  resultMd: string | null
  conclusion: string | null
  nextStep: string | null
}

type Payload = {
  sharedBy: string
  sharedAt: string
  content: RecordContent | AnalysisContent
}

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  ongoing: { text: '进行中', cls: 'bg-[#5B7C991F] text-[#5B7C99]' },
  running: { text: '运行中', cls: 'bg-[#5B7C991F] text-[#5B7C99]' },
  done: { text: '已完成', cls: 'bg-[#4C8C6B1F] text-[#4C8C6B]' },
  failed: { text: '失败', cls: 'bg-[#B4564E1F] text-[#B4564E]' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <p className="caption-en mb-1.5">{title}</p>
      {children}
    </section>
  )
}

function Md({ text }: { text: string }) {
  return (
    <div className="prose-sm max-w-none text-[14px] leading-[22px] text-ink [&_h1]:text-[17px] [&_h2]:text-[15.5px] [&_h3]:text-[14.5px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-4 [&_h2]:mt-3.5 [&_h3]:mt-3 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-paper [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:rounded-lg [&_pre]:bg-paper [&_pre]:p-3 [&_table]:w-full [&_th]:border [&_th]:border-line [&_th]:bg-paper [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-3 py-1 text-[12.5px]">
      <span className="w-20 shrink-0 text-ink-mute">{label}</span>
      <span className={cn('min-w-0 break-all text-ink', mono && 'font-mono text-[12px]')}>{value}</span>
    </div>
  )
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<
    { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ok'; data: Payload }
  >({ phase: 'loading' })

  useEffect(() => {
    let alive = true
    fetch(`/api/share/${token}`)
      .then(async (r) => {
        if (!alive) return
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string }
          setState({ phase: 'error', message: j.error ?? '分享链接不存在或已撤销' })
          return
        }
        setState({ phase: 'ok', data: (await r.json()) as Payload })
      })
      .catch(() => alive && setState({ phase: 'error', message: '网络异常，请稍后重试' }))
    return () => {
      alive = false
    }
  }, [token])

  return (
    <div className="min-h-screen bg-paper">
      {/* 顶栏 */}
      <header className="border-b border-line bg-surface/80">
        <div className="mx-auto flex h-14 w-full max-w-[860px] items-center gap-2.5 px-4 md:px-6">
          <img src="/logo.svg" alt="BenchLog" className="h-6 w-6" />
          <span className="font-display text-[15px] font-bold text-ink">BenchLog</span>
          <span className="ml-1 flex items-center gap-1 rounded-full bg-bench-wash px-2 py-0.5 text-[11px] font-medium text-bench-ink">
            <Eye className="h-3 w-3" />
            只读分享
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[860px] px-4 py-8 md:px-6">
        {state.phase === 'loading' && (
          <div className="flex flex-col gap-3">
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-bench-wash/60" />
            <div className="h-40 animate-pulse rounded-xl bg-bench-wash/40" />
          </div>
        )}

        {state.phase === 'error' && (
          <div className="mx-auto mt-16 max-w-[420px] rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
            <Link2Off className="mx-auto h-8 w-8 text-ink-mute" />
            <h1 className="mt-3 font-display text-[18px] font-semibold text-ink">链接不可用</h1>
            <p className="mt-1.5 text-[13px] leading-[19px] text-ink-mute">{state.message}</p>
            <p className="mt-1 text-[12px] text-ink-mute">链接可能已被分享者撤销，或内容已被删除。</p>
          </div>
        )}

        {state.phase === 'ok' && state.data.content.kind === 'record' && (
          <RecordView c={state.data.content as RecordContent} />
        )}
        {state.phase === 'ok' && state.data.content.kind === 'analysis' && (
          <AnalysisView c={state.data.content as AnalysisContent} />
        )}

        {state.phase === 'ok' && (
          <footer className="mt-10 border-t border-line pt-4 text-center text-[12px] text-ink-mute">
            由 {state.data.sharedBy} 通过 BenchLog 分享 ·{' '}
            {new Date(state.data.sharedAt).toLocaleDateString('zh-CN')} · 内容只读
          </footer>
        )}
      </main>
    </div>
  )
}

function RecordView({ c }: { c: RecordContent }) {
  const st = STATUS_LABELS[c.status] ?? STATUS_LABELS.ongoing
  return (
    <article className="rounded-2xl border border-line bg-surface p-6 shadow-card md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-medium', st.cls)}>{st.text}</span>
        {c.tags.map((t) => (
          <span key={t} className="rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] text-ink-soft">
            {t}
          </span>
        ))}
      </div>
      <h1 className="mt-3 font-display text-[24px] font-bold leading-[32px] text-ink">{c.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-mute">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {c.recordDate}
        </span>
        {c.projectName && (
          <span className="flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5" />
            {c.projectName}
          </span>
        )}
        {c.protocolTitle && (
          <span className="flex items-center gap-1">
            <FlaskConical className="h-3.5 w-3.5" />
            {c.protocolTitle}
            {c.protocolVersion ? `（${c.protocolVersion}）` : ''}
          </span>
        )}
      </div>

      {c.purpose && (
        <Section title="实验目的 PURPOSE">
          <p className="whitespace-pre-wrap text-[14px] leading-[22px] text-ink">{c.purpose}</p>
        </Section>
      )}
      {c.contentHtml ? (
        <Section title="实验正文 NOTEBOOK">
          <div className="rich-render">
            <div
              className="rich-editor-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.contentHtml) }}
            />
          </div>
        </Section>
      ) : (
        c.resultMd && (
          <Section title="实验结果 RESULTS">
            <Md text={c.resultMd} />
          </Section>
        )
      )}
      {c.deviations.length > 0 && (
        <Section title={`参数偏离 DEVIATIONS (${c.deviations.length})`}>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-paper text-left text-[12px] text-ink-mute">
                  <th className="border-b border-line px-3 py-2 font-medium">参数</th>
                  <th className="border-b border-line px-3 py-2 font-medium">方法默认</th>
                  <th className="border-b border-line px-3 py-2 font-medium">本次实际</th>
                  <th className="border-b border-line px-3 py-2 font-medium">偏离说明</th>
                </tr>
              </thead>
              <tbody>
                {c.deviations.map((d, i) => (
                  <tr key={i}>
                    <td className="border-b border-line-soft px-3 py-2 font-medium text-ink">{d.param}</td>
                    <td className="border-b border-line-soft px-3 py-2 text-ink-soft">{d.defaultValue}</td>
                    <td className="border-b border-line-soft px-3 py-2 text-ink">
                      {d.actualValue !== d.defaultValue ? (
                        <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">{d.actualValue}</span>
                      ) : (
                        d.actualValue
                      )}
                    </td>
                    <td className="border-b border-line-soft px-3 py-2 text-ink-mute">{d.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {c.images.length > 0 && (
        <Section title={`结果图片 IMAGES (${c.images.length})`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {c.images.map((img, i) => (
              <figure key={i} className="overflow-hidden rounded-xl border border-line">
                <img src={img.data} alt={img.caption ?? img.kind} className="w-full object-contain" />
                <figcaption className="flex items-center gap-2 border-t border-line bg-paper px-3 py-1.5 text-[11.5px] text-ink-mute">
                  <span className="rounded-full bg-bench-wash px-2 py-0.5 font-medium text-bench-ink">{img.kind}</span>
                  {img.caption && <span className="truncate">{img.caption}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}
      {c.conclusion && (
        <Section title="结论 CONCLUSION">
          <p className="whitespace-pre-wrap rounded-xl bg-bench-wash/50 px-4 py-3 text-[14px] leading-[22px] text-ink">
            {c.conclusion}
          </p>
        </Section>
      )}
      {c.nextStep && (
        <Section title="下一步 NEXT">
          <p className="whitespace-pre-wrap text-[14px] leading-[22px] text-ink">{c.nextStep}</p>
        </Section>
      )}
    </article>
  )
}

function AnalysisView({ c }: { c: AnalysisContent }) {
  const st = STATUS_LABELS[c.status] ?? STATUS_LABELS.running
  return (
    <article className="rounded-2xl border border-line bg-surface p-6 shadow-card md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-medium', st.cls)}>{st.text}</span>
        <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-[11.5px] text-ink-soft">
          <SquareTerminal className="h-3 w-3" />
          {c.pipeline}
        </span>
      </div>
      <h1 className="mt-3 font-display text-[24px] font-bold leading-[32px] text-ink">{c.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-mute">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {c.analysisDate}
        </span>
        {c.projectName && (
          <span className="flex items-center gap-1">
            <FolderKanban className="h-3.5 w-3.5" />
            {c.projectName}
          </span>
        )}
      </div>

      <Section title="可复现信息 REPRODUCIBILITY">
        <div className="rounded-xl border border-line bg-paper/60 px-4 py-2">
          <MetaRow label="数据路径" value={c.dataPath} mono />
          <MetaRow label="结果路径" value={c.resultPath} mono />
          <MetaRow label="代码仓库" value={c.repoUrl} mono />
          <MetaRow label="Commit" value={c.commitHash} mono />
          <MetaRow label="运行环境" value={c.environment} mono />
          <MetaRow label="输入数据" value={c.inputData} />
        </div>
      </Section>
      {c.command && (
        <Section title="运行命令 COMMAND">
          <pre className="overflow-x-auto rounded-xl bg-[#2B3A35] p-4 font-mono text-[12.5px] leading-[19px] text-[#D8E4DE]">
            {c.command}
          </pre>
        </Section>
      )}
      {c.resultMd && (
        <Section title="结果摘要 RESULTS">
          <Md text={c.resultMd} />
        </Section>
      )}
      {c.conclusion && (
        <Section title="结论 CONCLUSION">
          <p className="whitespace-pre-wrap rounded-xl bg-bench-wash/50 px-4 py-3 text-[14px] leading-[22px] text-ink">
            {c.conclusion}
          </p>
        </Section>
      )}
      {c.nextStep && (
        <Section title="下一步 NEXT">
          <p className="whitespace-pre-wrap text-[14px] leading-[22px] text-ink">{c.nextStep}</p>
        </Section>
      )}
    </article>
  )
}
