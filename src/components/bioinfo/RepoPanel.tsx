import { useState } from 'react'
import { format } from 'date-fns'
import {
  Anchor,
  Check,
  Copy,
  Eye,
  FileCode2,
  FileDiff,
  FileDown,
  FolderGit2,
  GitCommitHorizontal,
  History,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import RepoStaging, { type StagedFile } from '@/components/bioinfo/RepoStaging'
import DiffView from '@/components/bioinfo/DiffView'

type Staged = StagedFile

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`

const monoChip = 'rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-soft'

export default function RepoPanel({
  analysisId,
  anchoredHash,
  onAnchor,
}: {
  analysisId: number
  /** 当前表单中已锚定的 commit（form.commitHash，repoUrl='internal' 时生效） */
  anchoredHash: string
  /** 锚定某 commit：由父组件写入表单并提示保存 */
  onAnchor: (sha: string) => void
}) {
  const utils = trpc.useUtils()
  const statusQ = trpc.git.status.useQuery({ analysisId })
  const logQ = trpc.git.log.useQuery({ analysisId })

  const [ref, setRef] = useState<string | null>(null) // 浏览中的 commit；null = HEAD
  const treeQ = trpc.git.tree.useQuery({ analysisId, ref: ref ?? undefined })

  const [tab, setTab] = useState<'files' | 'history'>('files')
  const [staged, setStaged] = useState<Staged[]>([])
  const [message, setMessage] = useState('')
  const [viewer, setViewer] = useState<{ ref: string; path: string } | null>(null)
  // diff 展开：当前查看变更的 commit sha（null = 全部收起）
  const [diffOpen, setDiffOpen] = useState<string | null>(null)
  const diffQ = trpc.git.diff.useQuery(
    { analysisId, ref: diffOpen ?? '' },
    { enabled: diffOpen != null },
  )

  const fileQ = trpc.git.file.useQuery(
    { analysisId, ref: viewer?.ref ?? '', path: viewer?.path ?? '' },
    { enabled: viewer != null },
  )

  const commitMut = trpc.git.commit.useMutation({
    onSuccess: async (r) => {
      toast.success(`已提交 ${r.short}：+${r.changes.added.length} 新增 ~${r.changes.modified.length} 修改 -${r.changes.deleted.length} 删除`)
      setStaged([])
      setMessage('')
      setRef(null)
      await Promise.all([
        utils.git.status.invalidate({ analysisId }),
        utils.git.log.invalidate({ analysisId }),
        utils.git.tree.invalidate({ analysisId }),
      ])
    },
    onError: (e) => toast.error(`提交失败：${e.message}`),
  })

  /** 导出当前浏览版本（viewingSha）的全部文件为 ZIP */
  const exportMut = trpc.git.exportZip.useMutation({
    onSuccess: ({ base64, filename, fileCount, short }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${fileCount} 个文件（commit ${short}）`)
    },
    onError: (e) => toast.error(`导出失败：${e.message}`),
  })

  const initialized = statusQ.data?.initialized === true
  const headSha = statusQ.data?.headSha ?? null
  const viewingSha = ref ?? headSha
  const browsingHistory = ref != null && ref !== headSha

  /* ------------------------------- 暂存与提交 ------------------------------- */

  const doCommit = () => {
    if (!staged.length) return
    commitMut.mutate({ analysisId, files: staged, message })
  }

  /* --------------------------------- 渲染 --------------------------------- */

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      {/* 头部：标题 + 仓库状态 */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="caption-en">代码仓库 INTERNAL GIT</p>
        <span className="ml-auto flex items-center gap-2">
          {initialized ? (
            <>
              <span className={cn(monoChip, 'flex items-center gap-1 !text-bench-ink !border-bench/35 !bg-bench-wash')}>
                <FolderGit2 className="h-3 w-3" />
                HEAD {statusQ.data?.short}
              </span>
              <span className="text-[11.5px] text-ink-mute">{statusQ.data?.commitCount} 次提交</span>
              <button
                type="button"
                onClick={() => viewingSha && exportMut.mutate({ analysisId, ref: viewingSha })}
                disabled={exportMut.isPending}
                title={`打包下载当前浏览版本（${viewingSha?.slice(0, 7)}）的全部文件`}
                className="flex h-6 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench disabled:opacity-60"
              >
                {exportMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                导出 ZIP
              </button>
            </>
          ) : (
            <span className="text-[11.5px] text-ink-mute">首次提交即自动建仓</span>
          )}
        </span>
      </div>
      <p className="mt-1.5 mb-4 text-[12px] leading-[18px] text-ink-mute">
        代码直接存进 BenchLog：上传或粘贴 → 提交 commit，哈希算法与 git 完全一致。每次分析锚定当时的
        commit，随时可回溯浏览任意历史版本的代码。
      </p>

      {/* 暂存区（抽自 RepoStaging，与新建页共用） */}
      <RepoStaging
        staged={staged}
        onStagedChange={setStaged}
        message={message}
        onMessageChange={setMessage}
        onEnter={doCommit}
        footer={
          staged.length > 0 ? (
            <button
              type="button"
              onClick={doCommit}
              disabled={commitMut.isPending}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-bench px-4 text-[12.5px] font-medium text-white shadow-card transition-colors hover:bg-bench-deep disabled:opacity-60"
            >
              {commitMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitHorizontal className="h-3.5 w-3.5" />}
              提交 commit
            </button>
          ) : undefined
        }
      />

      {/* 页签：文件 / 提交历史 */}
      <div className="mt-4 flex items-center gap-1 border-b border-line">
        {(
          [
            { key: 'files', label: '文件', icon: FileCode2 },
            { key: 'history', label: `提交历史${logQ.data?.commitCount ? ` (${logQ.data.commitCount})` : ''}`, icon: History },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[12.5px] font-medium transition-colors duration-150',
              tab === key ? 'border-bench text-bench-ink' : 'border-transparent text-ink-mute hover:text-ink-soft',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* 文件视图 */}
      {tab === 'files' && (
        <div className="pt-3">
          {browsingHistory && (
            <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-bench/30 bg-bench-wash/40 px-3 py-2">
              <Eye className="h-3.5 w-3.5 text-bench" />
              <span className="font-mono text-[11.5px] text-bench-ink">正在浏览历史版本 {ref!.slice(0, 7)}</span>
              <button
                type="button"
                onClick={() => setRef(null)}
                className="ml-auto text-[11.5px] font-medium text-bench hover:underline"
              >
                返回 HEAD
              </button>
            </div>
          )}
          {!initialized ? (
            <p className="py-6 text-center text-[12.5px] text-ink-mute">
              仓库还没有文件——上传或粘贴代码并提交第一个 commit 后，这里会显示文件树。
            </p>
          ) : treeQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
            </div>
          ) : (treeQ.data?.entries.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-mute">此版本没有文件。</p>
          ) : (
            <div className="flex flex-col">
              {treeQ.data!.entries.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  onClick={() => viewingSha && setViewer({ ref: viewingSha, path: e.path })}
                  className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-100 hover:bg-bench-wash/50"
                >
                  <FileCode2 className="h-4 w-4 shrink-0 text-ink-mute transition-colors group-hover:text-bench" />
                  <span className="min-w-0 flex-1 font-mono text-[12.5px] text-ink">{e.path}</span>
                  <span className="shrink-0 text-[11px] text-ink-mute">{fmtSize(e.size)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 历史视图 */}
      {tab === 'history' && (
        <div className="pt-3">
          {!initialized ? (
            <p className="py-6 text-center text-[12.5px] text-ink-mute">还没有提交记录。</p>
          ) : logQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
            </div>
          ) : (
            <div className="flex flex-col">
              {logQ.data!.items.map((c, i) => {
                const anchored = anchoredHash === c.sha
                return (
                  <div key={c.sha} className={cn('flex gap-3', i > 0 && 'mt-1.5')}>
                    {/* 时间轴 */}
                    <div className="flex w-4 flex-col items-center">
                      <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full border-2', c.isHead ? 'border-bench bg-bench' : 'border-line-strong bg-surface')} />
                      {i < logQ.data!.items.length - 1 && <span className="w-px flex-1 bg-line-soft" />}
                    </div>
                    <div className="min-w-0 flex-1 rounded-lg border border-line bg-paper/50 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn(monoChip, c.isHead && '!border-bench/35 !bg-bench-wash !text-bench-ink')}>
                          {c.short}
                        </span>
                        {c.isHead && (
                          <span className="rounded-full bg-bench px-1.5 py-px text-[10px] font-semibold text-white">HEAD</span>
                        )}
                        {anchored && (
                          <span className="flex items-center gap-0.5 rounded-full bg-bench-wash px-1.5 py-px text-[10px] font-semibold text-bench-ink">
                            <Check className="h-2.5 w-2.5" />
                            已锚定
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-ink-mute">
                          {c.authorName} · {format(new Date(c.createdAt), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] font-medium leading-[19px] text-ink">{c.message}</p>
                      {c.changes && (
                        <p className="mt-0.5 font-mono text-[11px] text-ink-mute">
                          {c.changes.added.length > 0 && <span className="text-success">+{c.changes.added.length}</span>}
                          {c.changes.modified.length > 0 && <span className="ml-1.5 text-info">~{c.changes.modified.length}</span>}
                          {c.changes.deleted.length > 0 && <span className="ml-1.5 text-danger">-{c.changes.deleted.length}</span>}
                          <span className="ml-2">
                            {[...c.changes.added, ...c.changes.modified, ...c.changes.deleted].slice(0, 3).join('、')}
                            {c.changes.added.length + c.changes.modified.length + c.changes.deleted.length > 3 && ' …'}
                          </span>
                        </p>
                      )}
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRef(c.sha)
                            setTab('files')
                          }}
                          className="flex h-6 items-center gap-1 rounded border border-line px-2 text-[11px] text-ink-soft transition-colors hover:border-bench hover:text-bench"
                        >
                          <Eye className="h-3 w-3" />
                          浏览代码
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiffOpen(diffOpen === c.sha ? null : c.sha)}
                          className={cn(
                            'flex h-6 items-center gap-1 rounded border px-2 text-[11px] transition-colors',
                            diffOpen === c.sha
                              ? 'border-bench bg-bench-wash text-bench-ink'
                              : 'border-line text-ink-soft hover:border-bench hover:text-bench',
                          )}
                        >
                          <FileDiff className="h-3 w-3" />
                          {diffOpen === c.sha ? '收起变更' : '查看变更'}
                        </button>
                        {!anchored && (
                          <button
                            type="button"
                            onClick={() => onAnchor(c.sha)}
                            className="flex h-6 items-center gap-1 rounded border border-bench/40 bg-bench-wash px-2 text-[11px] font-medium text-bench-ink transition-colors hover:bg-bench hover:text-white"
                          >
                            <Anchor className="h-3 w-3" />
                            锚定此 commit
                          </button>
                        )}
                      </div>
                      {diffOpen === c.sha && (
                        <div className="mt-2.5 border-t border-line pt-2.5">
                          {diffQ.isLoading ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
                            </div>
                          ) : diffQ.data ? (
                            <DiffView files={diffQ.data.files} />
                          ) : (
                            <p className="py-2 text-[12px] text-ink-mute">变更读取失败。</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 文件查看器 */}
      <Dialog open={viewer != null} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="max-w-[720px] rounded-xl border-line">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-[14px] font-semibold text-ink">
              <FileCode2 className="h-4 w-4 text-bench" />
              {viewer?.path}
              {viewer && <span className={monoChip}>{viewer.ref.slice(0, 7)}</span>}
            </DialogTitle>
          </DialogHeader>
          {fileQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
            </div>
          ) : fileQ.data ? (
            <>
              <pre className="max-h-[56vh] overflow-auto rounded-lg border border-line bg-paper p-3.5 font-mono text-[12px] leading-[18px] text-ink">
                {fileQ.data.content}
              </pre>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(fileQ.data!.content)
                    toast.success('代码已复制')
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-bench hover:text-bench"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制全部
                </button>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-[12.5px] text-ink-mute">文件读取失败。</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
