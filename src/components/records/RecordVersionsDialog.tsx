import { useState } from 'react'
import { Eye, EyeOff, History, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { STATUS_META, fmtDateTime } from './record-types'
import type { RecordVersionItem } from './record-types'

function StatusBadge({ status }: { status: RecordVersionItem['snapshot']['status'] }) {
  const m = STATUS_META[status]
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', m.chip, m.text)}>
      {m.label}
    </span>
  )
}

/** 只读字段块 */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="mt-2.5">
      <p className="caption-en !text-[10px]">{label}</p>
      <div className="mt-1 text-[13px] leading-[20px] text-ink-soft">{children}</div>
    </div>
  )
}

/** 记录修改历史时间线（保存/恢复前留下的旧版快照） */
export default function RecordVersionsDialog({
  open,
  onOpenChange,
  recordId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  recordId: number
}) {
  const utils = trpc.useUtils()
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [pendingRestore, setPendingRestore] = useState<RecordVersionItem | null>(null)

  const versionsQuery = trpc.record.versions.useQuery(
    { recordId },
    { enabled: open && recordId > 0 },
  )
  const versions = versionsQuery.data ?? []

  const restoreMut = trpc.record.restoreVersion.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.record.byId.invalidate({ id: recordId }),
        utils.record.list.invalidate(),
        utils.record.versions.invalidate({ recordId }),
      ])
      toast.success('已恢复到该版本（恢复前的内容也已留档）')
      setPendingRestore(null)
      onOpenChange(false)
    },
    onError: (e) => toast.error(`恢复失败：${e.message}`),
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <History className="h-4 w-4 text-bench" />
              修改历史
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              每次保存都会留下上一版快照，可回看或恢复。
            </DialogDescription>
          </DialogHeader>

          {versionsQuery.isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-line/50" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-mute">
              还没有历史版本。保存一次修改后，这里会出现旧版快照。
            </p>
          ) : (
            <ol className="flex flex-col gap-2 py-1">
              {versions.map((v) => {
                const snap = v.snapshot
                const viewing = viewingId === v.id
                return (
                  <li key={v.id} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11.5px] text-ink-mute">
                        {fmtDateTime(v.savedAt)}
                      </span>
                      <StatusBadge status={snap.status} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                        {snap.title || '未命名'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingId(viewing ? null : v.id)}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[12px] text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink"
                      >
                        {viewing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {viewing ? '收起' : '查看'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRestore(v)}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[12px] text-bench transition-colors duration-150 hover:border-bench hover:bg-bench-wash"
                      >
                        <RotateCcw className="h-3 w-3" />
                        恢复此版本
                      </button>
                    </div>

                    {viewing && (
                      <div className="mt-2 border-t border-line pt-1">
                        <Field label="目的 PURPOSE">{snap.purpose}</Field>
                        {snap.resultMd && (
                          <div className="mt-2.5">
                            <p className="caption-en !text-[10px]">结果 RESULTS</p>
                            <div className="mt-1 text-[13px] leading-[20px] text-ink-soft [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-ink [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-ink [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                              <ReactMarkdown>{snap.resultMd}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        <Field label="结论 CONCLUSION">{snap.conclusion}</Field>
                        <Field label="下一步 NEXT STEP">{snap.nextStep}</Field>
                        {!snap.purpose && !snap.resultMd && !snap.conclusion && !snap.nextStep && (
                          <p className="mt-2 text-[12.5px] text-ink-mute">（该版本各字段均为空）</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRestore != null}
        onOpenChange={(v) => !v && setPendingRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">恢复到此版本？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              记录将回到 {pendingRestore ? fmtDateTime(pendingRestore.savedAt) : ''} 保存的内容
              「{pendingRestore?.snapshot.title || '未命名'}」。当前内容会先自动留档，可再次恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRestore) restoreMut.mutate({ versionId: pendingRestore.id })
              }}
              disabled={restoreMut.isPending}
              className="bg-bench text-white hover:bg-bench-deep"
            >
              {restoreMut.isPending ? '恢复中…' : '恢复此版本'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
