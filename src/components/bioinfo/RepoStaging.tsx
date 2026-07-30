import { useRef, useState } from 'react'
import {
  CornerDownLeft,
  FileCode2,
  FilePlus2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** 与后端 GIT_LIMITS 对齐 */
const MAX_FILE_BYTES = 512 * 1024
const MAX_NEW_FILES = 50

/** 常见二进制扩展名：站内仓库仅保存文本代码，二进制入库即损坏，直接拦截 */
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff',
  'pdf', 'zip', 'gz', 'tar', 'tgz', 'bz2', 'xz', '7z', 'rar',
  'rdata', 'rds', 'rda', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt',
  'bam', 'bai', 'sam', 'cram', 'bcf', 'vcf.gz', 'bigwig', 'bw', 'bedgraph',
  'h5', 'h5ad', 'hdf5', 'parquet', 'feather', 'pkl', 'pickle', 'npy', 'npz',
  'mp3', 'mp4', 'mov', 'wav', 'avi', 'exe', 'dll', 'so', 'dylib', 'jar', 'class',
  'db', 'sqlite', 'sqlite3', 'wdl.zip',
])

const extOf = (name: string) => {
  const n = name.toLowerCase()
  // 兼容 xxx.fastq.gz / xxx.vcf.gz 双扩展
  if (n.endsWith('.gz')) {
    const base = n.slice(0, -3)
    const i = base.lastIndexOf('.')
    if (i >= 0) return `${base.slice(i + 1)}.gz`
  }
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

/** 文本嗅探：前 8KB 出现 NUL 或控制字符占比过高 → 判定二进制 */
const looksBinary = (text: string) => {
  const sample = text.slice(0, 8192)
  if (sample.includes('\u0000')) return true
  let ctrl = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c < 9 || (c > 13 && c < 32)) ctrl++
  }
  return sample.length > 0 && ctrl / sample.length > 0.02
}

export type StagedFile = { path: string; content: string }

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`

/**
 * 代码暂存区（自包含）：上传文件 / 粘贴代码 → 暂存清单 + 提交信息。
 * footer 插槽放提交按钮（已建仓模式）或提示文案（新建草稿模式）。
 */
export default function RepoStaging({
  staged,
  onStagedChange,
  message,
  onMessageChange,
  onEnter,
  footer,
}: {
  staged: StagedFile[]
  onStagedChange: React.Dispatch<React.SetStateAction<StagedFile[]>>
  message: string
  onMessageChange: (m: string) => void
  /** 提交信息输入框回车触发（可选） */
  onEnter?: () => void
  /** 提交信息行右侧插槽 */
  footer?: React.ReactNode
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteName, setPasteName] = useState('')
  const [pasteContent, setPasteContent] = useState('')

  const addStaged = (files: StagedFile[]) => {
    onStagedChange((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]))
      for (const f of files) map.set(f.path, f) // 同路径覆盖
      const next = [...map.values()]
      if (next.length > MAX_NEW_FILES) {
        toast.error(`单次最多提交 ${MAX_NEW_FILES} 个文件`)
        return prev
      }
      return next
    })
  }

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return
    const out: StagedFile[] = []
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`「${file.name}」超过 512KB 上限，已跳过`)
        continue
      }
      const ext = extOf(file.name)
      if (BINARY_EXTS.has(ext)) {
        toast.error(`「${file.name}」是二进制文件（.${ext}），站内仓库仅保存文本代码，已跳过`)
        continue
      }
      const content = await file.text()
      if (looksBinary(content)) {
        toast.error(`「${file.name}」内容疑似二进制，站内仓库仅保存文本代码，已跳过`)
        continue
      }
      out.push({ path: file.name, content })
    }
    if (out.length) {
      addStaged(out)
      toast.success(`已暂存 ${out.length} 个文件`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const addPasted = () => {
    const path = pasteName.trim()
    if (!path) {
      toast.error('请填写文件名（可含目录，如 src/deseq2.R）')
      return
    }
    if (!pasteContent.trim()) {
      toast.error('代码内容不能为空')
      return
    }
    addStaged([{ path, content: pasteContent }])
    setPasteName('')
    setPasteContent('')
    setPasteOpen(false)
  }

  return (
    <div className="rounded-lg border border-dashed border-line-strong/60 bg-paper/60 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void pickFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft transition-colors duration-150 hover:border-bench hover:text-bench"
        >
          <Upload className="h-3.5 w-3.5" />
          上传代码文件
        </button>
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors duration-150',
            pasteOpen
              ? 'border-bench bg-bench-wash text-bench-ink'
              : 'border-line bg-surface text-ink-soft hover:border-bench hover:text-bench',
          )}
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          粘贴代码
        </button>
        <span className="text-[11px] text-ink-mute">单文件 ≤512KB · 单次 ≤{MAX_NEW_FILES} 个 · 仅文本代码</span>
      </div>

      {/* 粘贴表单 */}
      {pasteOpen && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-mute focus:border-bench"
            placeholder="文件路径，如 main.nf 或 src/deseq2.R"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
          />
          <textarea
            className="mt-2 min-h-[120px] w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12px] leading-[18px] text-ink outline-none transition-colors placeholder:text-ink-mute focus:border-bench"
            placeholder="粘贴代码内容…"
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen(false)}
              className="h-7 rounded-lg border border-line px-3 text-[12px] text-ink-soft transition-colors hover:bg-paper"
            >
              取消
            </button>
            <button
              type="button"
              onClick={addPasted}
              className="flex h-7 items-center gap-1 rounded-lg bg-bench px-3 text-[12px] font-medium text-white transition-colors hover:bg-bench-deep"
            >
              <CornerDownLeft className="h-3 w-3" />
              加入暂存
            </button>
          </div>
        </div>
      )}

      {/* 暂存清单 + 提交信息行 */}
      {staged.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-col gap-1">
            {staged.map((f) => (
              <div key={f.path} className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5">
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-bench" />
                <span className="min-w-0 flex-1 font-mono text-[12px] text-ink">{f.path}</span>
                <span className="shrink-0 text-[11px] text-ink-mute">{fmtSize(new Blob([f.content]).size)}</span>
                <button
                  type="button"
                  aria-label={`移除 ${f.path}`}
                  onClick={() => onStagedChange((prev) => prev.filter((x) => x.path !== f.path))}
                  className="shrink-0 text-ink-mute transition-colors hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-mute focus:border-bench sm:h-9 sm:text-[12.5px]"
              placeholder="提交信息（git commit message），如：初版差异表达脚本"
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
            />
            <div className="[&>button]:h-11 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto">
              {footer}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
