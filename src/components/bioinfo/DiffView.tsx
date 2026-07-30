import { useMemo } from 'react'
import { FileMinus2, FilePlus2, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DiffFileInput = {
  path: string
  status: 'added' | 'modified' | 'deleted'
  oldContent: string | null
  newContent: string | null
}

type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }

const MAX_MATRIX = 4_000_000 // LCS 矩阵规模上限，超出退化为整段增删
const MAX_RENDER_ROWS = 400 // 单文件渲染行数上限

/** 行级 diff：公共前后缀裁剪 + LCS；矩阵过大时退化为整段删+整段增 */
function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA + 1)
  const midB = b.slice(start, endB + 1)
  const suffix: DiffLine[] = a.slice(endA + 1).map((text) => ({ kind: 'same' as const, text }))
  const prefix: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same' as const, text }))

  if (midA.length * midB.length > MAX_MATRIX || midA.length === 0 || midB.length === 0) {
    const mid: DiffLine[] = [
      ...midA.map((text) => ({ kind: 'del' as const, text })),
      ...midB.map((text) => ({ kind: 'add' as const, text })),
    ]
    return [...prefix, ...mid, ...suffix]
  }

  // LCS 动态规划（扁平 Uint32Array）
  const n = midA.length
  const m = midB.length
  const dp = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] =
        midA[i] === midB[j]
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
    }
  }
  const mid: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      mid.push({ kind: 'same', text: midA[i] })
      i++
      j++
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      mid.push({ kind: 'del', text: midA[i] })
      i++
    } else {
      mid.push({ kind: 'add', text: midB[j] })
      j++
    }
  }
  while (i < n) mid.push({ kind: 'del', text: midA[i++] })
  while (j < m) mid.push({ kind: 'add', text: midB[j++] })
  return [...prefix, ...mid, ...suffix]
}

const STATUS_META = {
  added: { label: '新增', icon: FilePlus2, cls: 'text-success' },
  modified: { label: '修改', icon: FileDiff, cls: 'text-info' },
  deleted: { label: '删除', icon: FileMinus2, cls: 'text-danger' },
} as const

/** commit 逐文件行级 diff 视图（只读） */
export default function DiffView({ files }: { files: DiffFileInput[] }) {
  if (files.length === 0) {
    return <p className="py-3 text-[12px] text-ink-mute">没有文件内容变化。</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {files.map((f) => (
        <FileDiffBlock key={`${f.status}:${f.path}`} file={f} />
      ))}
    </div>
  )
}

function FileDiffBlock({ file }: { file: DiffFileInput }) {
  const meta = STATUS_META[file.status]
  const Icon = meta.icon
  const { lines, adds, dels } = useMemo(() => {
    const lines = diffLines(file.oldContent ?? '', file.newContent ?? '')
    return {
      lines,
      adds: lines.filter((l) => l.kind === 'add').length,
      dels: lines.filter((l) => l.kind === 'del').length,
    }
  }, [file.oldContent, file.newContent])
  const overflow = lines.length > MAX_RENDER_ROWS

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-1.5">
        <Icon className={cn('h-3.5 w-3.5', meta.cls)} />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{file.path}</span>
        <span className="shrink-0 text-[11px] text-ink-mute">{meta.label}</span>
        {adds > 0 && <span className="shrink-0 font-mono text-[11px] text-success">+{adds}</span>}
        {dels > 0 && <span className="shrink-0 font-mono text-[11px] text-danger">-{dels}</span>}
      </div>
      <div className="overflow-x-auto bg-surface">
        <pre className="min-w-max px-0 py-1 font-mono text-[11.5px] leading-[18px]">
          {(overflow ? lines.slice(0, MAX_RENDER_ROWS) : lines).map((l, i) => (
            <div
              key={i}
              className={cn(
                'flex px-3',
                l.kind === 'add' && 'bg-success/10 text-success',
                l.kind === 'del' && 'bg-danger/10 text-danger',
                l.kind === 'same' && 'text-ink-soft',
              )}
            >
              <span className="w-4 shrink-0 select-none opacity-60">
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
              </span>
              <span className="whitespace-pre">{l.text || ' '}</span>
            </div>
          ))}
          {overflow && (
            <div className="px-3 py-1 text-[11px] text-ink-mute">
              … 仅展示前 {MAX_RENDER_ROWS} 行，余下 {lines.length - MAX_RENDER_ROWS} 行省略
            </div>
          )}
        </pre>
      </div>
    </div>
  )
}
