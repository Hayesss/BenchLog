import { useRef, useState } from 'react'
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { trpc } from '@/providers/trpc'
import type { AttachmentItem } from './record-types'

const MAX_BYTES = 2 * 1024 * 1024 // 与后端一致：单文件 2MB

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const url = String(fr.result ?? '')
      const idx = url.indexOf('base64,')
      resolve(idx >= 0 ? url.slice(idx + 7) : url)
    }
    fr.onerror = () => reject(fr.error ?? new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

/** 记录附件区块：Excel / PDF / fcs 等原始数据文件（≤2MB，base64 存库） */
export default function RecordAttachments({
  recordId,
  ensureRecordId,
}: {
  recordId: number | null
  /** 新建记录时先保存草稿拿到 id 再上传 */
  ensureRecordId: () => Promise<number>
}) {
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AttachmentItem | null>(null)

  const listQuery = trpc.attachment.listByRecord.useQuery(
    { recordId: recordId ?? 0 },
    { enabled: recordId != null },
  )
  const attachments = listQuery.data ?? []

  const addMut = trpc.attachment.add.useMutation()
  const removeMut = trpc.attachment.remove.useMutation({
    onSuccess: async () => {
      toast.success('附件已删除')
      if (recordId != null) await utils.attachment.listByRecord.invalidate({ recordId })
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    let rid = recordId
    try {
      if (rid == null) rid = await ensureRecordId()
    } catch {
      toast.error('请先保存记录，再上传附件')
      return
    }
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_BYTES) {
          toast.error(`「${f.name}」附件超过 2MB 上限`)
          continue
        }
        try {
          const dataBase64 = await readAsBase64(f)
          await addMut.mutateAsync({
            recordId: rid,
            name: f.name,
            mime: f.type || 'application/octet-stream',
            size: f.size,
            dataBase64,
          })
        } catch (e) {
          toast.error(`「${f.name}」上传失败：${e instanceof Error ? e.message : ''}`)
        }
      }
      await utils.attachment.listByRecord.invalidate({ recordId: rid })
      toast.success('附件已上传')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onDownload = async (a: AttachmentItem) => {
    setDownloadingId(a.id)
    try {
      const { name, mime, dataBase64 } = await utils.attachment.getData.fetch({ id: a.id })
      const blob = base64ToBlob(dataBase64, mime)
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url
      el.download = name
      document.body.appendChild(el)
      el.click()
      el.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) {
      toast.error(`下载失败：${e instanceof Error ? e.message : ''}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="caption-en">附件 ATTACHMENTS</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? '上传中…' : '上传附件'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-[12.5px] text-ink-mute">
          还没有附件。可挂 Excel / PDF / fcs 等原始数据文件，单个不超过 2MB。
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex h-11 items-center gap-2.5 border-b border-line px-3 text-[13px] last:border-b-0 hover:bg-paper"
            >
              <FileText className="h-4 w-4 shrink-0 text-bench" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate text-ink" title={a.name}>
                {a.name}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-ink-mute">
                {fmtSize(a.size)}
              </span>
              <button
                type="button"
                onClick={() => void onDownload(a)}
                disabled={downloadingId === a.id}
                aria-label={`下载 ${a.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors duration-150 hover:bg-line/60 hover:text-ink disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(a)}
                aria-label={`删除 ${a.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-line/60 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={pendingDelete != null} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">删除这个附件？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              「{pendingDelete?.name}」将被永久删除，原始数据文件无法找回。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) removeMut.mutate({ id: pendingDelete.id })
                setPendingDelete(null)
              }}
              className="bg-danger text-white hover:bg-danger/90"
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
