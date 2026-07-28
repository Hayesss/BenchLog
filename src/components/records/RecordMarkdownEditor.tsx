import { useRef, useState } from 'react'
import type { ClipboardEvent, ReactNode } from 'react'
import {
  Bold,
  Eye,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  Minus,
  PencilLine,
  Quote,
  Table,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Minimal markdown renderer for the preview toggle (subset used by    */
/* the toolbar: h2/h3, bold, italic, code, lists, quote, hr, links).   */
/* ------------------------------------------------------------------ */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const k = `${keyBase}-${i++}`
    if (tok.startsWith('**')) {
      out.push(
        <strong key={k} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>,
      )
    } else if (tok.startsWith('*')) {
      out.push(
        <em key={k} className="font-display italic">
          {tok.slice(1, -1)}
        </em>,
      )
    } else if (tok.startsWith('`')) {
      out.push(
        <code key={k} className="rounded bg-paper px-1 py-0.5 font-mono text-[12px] text-bench-ink">
          {tok.slice(1, -1)}
        </code>,
      )
    } else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (mm) {
        out.push(
          <a
            key={k}
            href={mm[2]}
            target="_blank"
            rel="noreferrer"
            className="text-bench underline underline-offset-2 hover:text-bench-deep"
          >
            {mm[1]}
          </a>,
        )
      } else {
        out.push(tok)
      }
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function MarkdownPreview({ md }: { md: string }) {
  const lines = md.split('\n')
  const blocks: ReactNode[] = []
  let listBuf: { ordered: boolean; items: string[] } | null = null
  const flushList = (key: string) => {
    if (!listBuf) return
    const items = listBuf.items.map((it, i) => (
      <li key={i} className="pl-1">
        {renderInline(it, `${key}-li-${i}`)}
      </li>
    ))
    blocks.push(
      listBuf.ordered ? (
        <ol key={key} className="list-decimal space-y-1 pl-6 text-[14px] leading-[22px]">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-6 text-[14px] leading-[22px]">
          {items}
        </ul>
      ),
    )
    listBuf = null
  }

  lines.forEach((line, idx) => {
    const k = `b-${idx}`
    const trimmed = line.trim()
    const ul = /^[-•]\s+(.*)$/.exec(trimmed)
    const ol = /^\d+[.、]\s*(.*)$/.exec(trimmed)
    if (ul || ol) {
      const ordered = !!ol
      const text = (ul?.[1] ?? ol?.[1]) ?? ''
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList(`${k}-prev`)
        listBuf = { ordered, items: [] }
      }
      listBuf.items.push(text)
      return
    }
    flushList(`${k}-list`)
    if (trimmed === '') return
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={k} className="my-3 border-line" />)
    } else if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={k} className="mt-3 text-[15px] font-semibold tracking-[0.01em] text-ink">
          {renderInline(trimmed.slice(4), k)}
        </h3>,
      )
    } else if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={k} className="mt-4 font-display text-[18px] font-semibold text-ink">
          {renderInline(trimmed.slice(3), k)}
        </h2>,
      )
    } else if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={k}
          className="border-l-[3px] border-warning/60 bg-[#B98A3E0D] px-3 py-2 text-[13.5px] leading-[22px] text-ink-soft"
        >
          {renderInline(trimmed.slice(2), k)}
        </blockquote>
      )
    } else if (/^\|.*\|$/.test(trimmed)) {
      blocks.push(
        <p key={k} className="overflow-x-auto font-mono text-[12.5px] text-ink-soft">
          {trimmed}
        </p>,
      )
    } else {
      blocks.push(
        <p key={k} className="text-[14px] leading-[22px] text-ink">
          {renderInline(trimmed, k)}
        </p>
      )
    }
  })
  flushList('tail')
  if (blocks.length === 0) {
    return <p className="text-[13px] text-ink-mute">暂无结果内容</p>
  }
  return <div className="flex max-w-[65ch] flex-col gap-2">{blocks}</div>
}

/* ------------------------------------------------------------------ */
/* Toolbar editor                                                      */
/* ------------------------------------------------------------------ */
type Action =
  | 'h2'
  | 'h3'
  | 'bold'
  | 'list'
  | 'quote'
  | 'divider'
  | 'table'

export default function RecordMarkdownEditor({
  value,
  onChange,
  onPasteFiles,
  onInsertImage,
}: {
  value: string
  onChange: (v: string) => void
  onPasteFiles?: (files: File[]) => void
  onInsertImage?: () => void
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const [preview, setPreview] = useState(false)

  const applyLinePrefix = (prefix: string) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const before = value.slice(0, s)
    const lineStart = before.lastIndexOf('\n') + 1
    const selected = value.slice(lineStart, e)
    const replaced = selected
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
      .join('\n')
    onChange(value.slice(0, lineStart) + replaced + value.slice(e))
    requestAnimationFrame(() => ta.focus())
  }

  const applyWrap = (mark: string) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const sel = value.slice(s, e) || '加粗文字'
    onChange(`${value.slice(0, s)}${mark}${sel}${mark}${value.slice(e)}`)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + mark.length, s + mark.length + sel.length)
    })
  }

  const insertBlock = (block: string) => {
    const ta = taRef.current
    const e = ta ? ta.selectionEnd : value.length
    const needsNl = e > 0 && value[e - 1] !== '\n' ? '\n' : ''
    onChange(`${value.slice(0, e)}${needsNl}${block}${value.slice(e)}`)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const run = (a: Action) => {
    switch (a) {
      case 'h2':
        applyLinePrefix('## ')
        break
      case 'h3':
        applyLinePrefix('### ')
        break
      case 'bold':
        applyWrap('**')
        break
      case 'list':
        applyLinePrefix('- ')
        break
      case 'quote':
        applyLinePrefix('> ')
        break
      case 'divider':
        insertBlock('\n---\n')
        break
      case 'table':
        insertBlock('\n| 参数 | 组别A | 组别B |\n| --- | --- | --- |\n|  |  |  |\n')
        break
    }
  }

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 220)}px`
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteFiles) return
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) {
      e.preventDefault()
      onPasteFiles(files)
    }
  }

  const tools: Array<{ a?: Action; icon: typeof Bold; label: string; onClick?: () => void }> = [
    { a: 'h2', icon: Heading2, label: '标题 H2' },
    { a: 'h3', icon: Heading3, label: '标题 H3' },
    { a: 'bold', icon: Bold, label: '加粗' },
    { a: 'list', icon: List, label: '列表' },
    { a: 'quote', icon: Quote, label: '引用' },
    { a: 'divider', icon: Minus, label: '分割线' },
    { a: 'table', icon: Table, label: '参数表' },
    { icon: ImageIcon, label: '插入图片', onClick: onInsertImage },
  ]

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card focus-within:border-line-strong">
      {/* MarkdownToolbar (design.md §8.11, pragmatic version) */}
      <div className="flex items-center gap-0.5 border-b border-line bg-paper px-2 py-1.5">
        {tools.map(({ a, icon: Icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => (onClick ? onClick() : a && run(a))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors duration-150 hover:bg-bench-wash hover:text-bench-ink active:scale-95"
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </button>
        ))}
        <div className="ml-auto flex items-center rounded-md border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={cn(
              'flex h-6 items-center gap-1 rounded px-2 text-[11.5px] font-medium transition-colors duration-150',
              !preview ? 'bg-bench-wash text-bench-ink' : 'text-ink-mute hover:text-ink',
            )}
          >
            <PencilLine className="h-3 w-3" /> 编辑
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={cn(
              'flex h-6 items-center gap-1 rounded px-2 text-[11.5px] font-medium transition-colors duration-150',
              preview ? 'bg-bench-wash text-bench-ink' : 'text-ink-mute hover:text-ink',
            )}
          >
            <Eye className="h-3 w-3" /> 预览
          </button>
        </div>
      </div>

      {preview ? (
        <div className="min-h-[220px] px-4 py-3">
          <MarkdownPreview md={value} />
        </div>
      ) : (
        <textarea
          ref={(el) => {
            taRef.current = el
            if (el) autoGrow(el)
          }}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            autoGrow(e.target)
          }}
          onPaste={handlePaste}
          rows={9}
          placeholder={
            '记录观察到的结果… 支持 **加粗**、## 标题、- 列表、> 引用、--- 分割线；Ctrl+V 可直接粘贴图片。'
          }
          className="block w-full max-w-none resize-y px-4 py-3 font-sans text-[14px] leading-[22px] text-ink outline-none placeholder:text-ink-mute"
        />
      )}
    </div>
  )
}
