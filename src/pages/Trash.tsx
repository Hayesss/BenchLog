import { useState } from 'react'
import { format } from 'date-fns'
import { FlaskConical, NotebookPen, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type PendingPurge =
  | { kind: 'record'; id: number; label: string }
  | { kind: 'protocol'; id: number; label: string }

function fmtDeletedAt(d: Date | string | null) {
  if (!d) return ''
  return format(new Date(d), 'yyyy-MM-dd HH:mm')
}

export default function Trash() {
  const utils = trpc.useUtils()
  const recordsQ = trpc.record.trash.useQuery()
  const protocolsQ = trpc.protocol.trash.useQuery()
  const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null)

  const invalidate = () => {
    void utils.record.trash.invalidate()
    void utils.protocol.trash.invalidate()
    void utils.record.invalidate()
    void utils.protocol.list.invalidate()
  }

  const restoreRecord = trpc.record.restore.useMutation({
    onSuccess: () => {
      toast.success('记录已恢复')
      invalidate()
    },
    onError: (e) => toast.error(e.message || '恢复失败'),
  })
  const restoreProtocol = trpc.protocol.restore.useMutation({
    onSuccess: () => {
      toast.success('方法已恢复')
      invalidate()
    },
    onError: (e) => toast.error(e.message || '恢复失败'),
  })
  const purgeRecord = trpc.record.purge.useMutation({
    onSuccess: () => {
      toast.success('记录已彻底删除')
      invalidate()
    },
    onError: (e) => toast.error(e.message || '删除失败'),
  })
  const purgeProtocol = trpc.protocol.purge.useMutation({
    onSuccess: () => {
      toast.success('方法已彻底删除')
      invalidate()
    },
    onError: (e) => toast.error(e.message || '删除失败'),
  })

  const records = recordsQ.data ?? []
  const protocols = protocolsQ.data ?? []
  const isEmpty = records.length === 0 && protocols.length === 0

  const onRestore = (kind: 'record' | 'protocol', id: number, label: string) => {
    if (!window.confirm(`恢复「${label}」？它将回到原来的列表中。`)) return
    if (kind === 'record') restoreRecord.mutate({ id })
    else restoreProtocol.mutate({ id })
  }

  const onPurgeConfirm = () => {
    if (!pendingPurge) return
    if (pendingPurge.kind === 'record') purgeRecord.mutate({ id: pendingPurge.id })
    else purgeProtocol.mutate({ id: pendingPurge.id })
    setPendingPurge(null)
  }

  const rowCls = 'flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card'
  const restoreBtnCls =
    'flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench'
  const purgeBtnCls =
    'flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-danger hover:text-danger'

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8">
      {/* 页头 */}
      <div className="mb-8">
        <h1 className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[38px]">
          最近删除
        </h1>
        <p className="caption-en mt-0.5">Trash</p>
        <p className="mt-2 text-[13px] text-ink-mute">
          删除的记录与方法会保留在这里，可恢复；彻底删除后不可恢复。
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface py-16 shadow-card">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bench-wash/60">
            <Trash2 className="h-6 w-6 text-ink-mute" strokeWidth={1.8} />
          </span>
          <p className="text-[14px] font-medium text-ink">回收站是空的</p>
          <p className="text-[12.5px] text-ink-mute">删除的实验记录和 SOP 协议会显示在这里</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* 实验记录 */}
          <section>
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="font-display text-[18px] font-semibold leading-[26px] text-ink">实验记录</h2>
              <span className="font-mono text-[12px] text-ink-mute">{records.length}</span>
            </div>
            {records.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-mute">
                没有已删除的记录
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {records.map((r) => (
                  <li key={r.id} className={rowCls}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bench-wash/60">
                      <NotebookPen className="h-4 w-4 text-bench" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{r.title}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-mute">
                        删除于 {fmtDeletedAt(r.deletedAt)}
                        {r.projectName ? ` · 项目：${r.projectName}` : ''}
                        {r.recordDate ? ` · 记录日期 ${r.recordDate}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={restoreBtnCls}
                      onClick={() => onRestore('record', r.id, r.title)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      恢复
                    </button>
                    <button
                      type="button"
                      className={purgeBtnCls}
                      onClick={() => setPendingPurge({ kind: 'record', id: r.id, label: r.title })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      彻底删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SOP 协议 */}
          <section>
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="font-display text-[18px] font-semibold leading-[26px] text-ink">SOP 协议</h2>
              <span className="font-mono text-[12px] text-ink-mute">{protocols.length}</span>
            </div>
            {protocols.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-mute">
                没有已删除的协议
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {protocols.map((p) => (
                  <li key={p.id} className={rowCls}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bench-wash/60">
                      <FlaskConical className="h-4 w-4 text-bench" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{p.name}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-mute">
                        删除于 {fmtDeletedAt(p.deletedAt)} · {p.version} · {p.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={restoreBtnCls}
                      onClick={() => onRestore('protocol', p.id, p.name)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      恢复
                    </button>
                    <button
                      type="button"
                      className={purgeBtnCls}
                      onClick={() => setPendingPurge({ kind: 'protocol', id: p.id, label: p.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      彻底删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* 彻底删除二次确认 */}
      <AlertDialog open={!!pendingPurge} onOpenChange={(open) => !open && setPendingPurge(null)}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">
              彻底删除「{pendingPurge?.label}」？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              将永久删除该{pendingPurge?.kind === 'record' ? '记录及其图片、附件与历史版本' : '协议及其全部历史版本'}
              ，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">取消</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
              onClick={onPurgeConfirm}
            >
              彻底删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
