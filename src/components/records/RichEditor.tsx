// Benchling 式笔记本富文本编辑器（TipTap 2 / ProseMirror）
// 能力：工具栏（标题/粗斜体/上下标/高亮/列表/勾选/引用/代码块/表格/图片/链接/分割线）
//      + 斜杠命令（/）+ 图片粘贴与插入（canvas 压缩 base64 内嵌）+ 表格行列操作 + 大纲提取
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Editor, EditorContent, Extension, Node, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Keyboard,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type OutlineItem = { level: number; text: string; pos: number }

/* ---------------- 日期段（Benchling New day） ---------------- */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`
}

/** 不可编辑的日期分段块：加粗日期 + 右侧延伸横线（Benchling date insert） */
const DateInsert = Node.create({
  name: 'dateInsert',
  group: 'block',
  atom: true,
  addAttributes() {
    return { date: { default: null } }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-date-insert]',
        getAttrs: (el) => ({ date: (el as HTMLElement).dataset.dateInsert ?? null }),
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const date = (node.attrs.date as string) ?? todayIso()
    return [
      'div',
      { ...HTMLAttributes, 'data-date-insert': date, class: 'rich-date-insert' },
      formatDateLabel(date),
    ]
  },
})

/* ---------------- 图片压缩：max 1280px，jpeg 0.85，base64 内嵌 ---------------- */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error('解析图片失败'))
      img.onload = () => {
        const MAX = 1280
        let { width, height } = img
        if (width > MAX) {
          height = Math.round((height * MAX) / width)
          width = MAX
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas 不可用'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/* ---------------- @ 引用 chip（Benchling entity chip） ---------------- */
type RefKind = 'record' | 'protocol' | 'sample'
type RefItem = { kind: RefKind; id: number; label: string; sub: string }

const REF_KIND_LABEL: Record<RefKind, string> = { record: '记录', protocol: '方法', sample: '样本' }

function refHref(kind: RefKind, id: number): string {
  if (kind === 'protocol') return `/protocols/${id}`
  if (kind === 'sample') return '/samples'
  return `/records/${id}`
}

/** 内联 atom 引用片：渲染为 <a data-ref-chip>，阅读态可点击跳转 */
const RefChip = Node.create({
  name: 'refChip',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      kind: { default: 'record' },
      refId: { default: 0 },
      label: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'a[data-ref-chip]',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          return {
            kind: dom.dataset.kind ?? 'record',
            refId: Number(dom.dataset.refId ?? 0),
            label: dom.dataset.label ?? dom.textContent ?? '',
          }
        },
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = (node.attrs.kind as RefKind) ?? 'record'
    const refId = Number(node.attrs.refId ?? 0)
    const label = (node.attrs.label as string) ?? ''
    return [
      'a',
      {
        ...HTMLAttributes,
        'data-ref-chip': '',
        'data-kind': kind,
        'data-ref-id': String(refId),
        'data-label': label,
        href: refHref(kind, refId),
        class: `rich-ref-chip rich-ref-${kind}`,
      },
      label,
    ]
  },
})

/** @ 唤起引用搜索菜单（异步 items + 手写 DOM 浮层，结构同斜杠菜单） */
function makeRefChipExtension(fetchItems: (query: string) => Promise<RefItem[]>) {
  return Extension.create({
    name: 'refChipSuggestion',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        Suggestion<RefItem>({
          editor,
          pluginKey: new PluginKey('refChipSuggestion'),
          char: '@',
          items: ({ query }) => fetchItems(query.trim()),
          command: ({ editor: e, range, props }) => {
            e.chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                { type: 'refChip', attrs: { kind: props.kind, refId: props.id, label: props.label } },
                { type: 'text', text: ' ' },
              ])
              .run()
          },
          render: () => {
            let el: HTMLDivElement | null = null
            let state: { items: RefItem[]; index: number; command: (item: RefItem) => void } | null = null
            const paint = () => {
              if (!el || !state) return
              el.innerHTML = ''
              if (state.items.length === 0) {
                const empty = document.createElement('div')
                empty.className = 'rich-slash-empty'
                empty.textContent = '无匹配的记录 / 方法 / 样本'
                el.appendChild(empty)
                return
              }
              state.items.forEach((item, i) => {
                const btn = document.createElement('button')
                btn.type = 'button'
                btn.className = `rich-slash-item${i === state!.index ? ' active' : ''}`
                const kind = document.createElement('span')
                kind.className = `rich-ref-kind rich-ref-${item.kind}`
                kind.textContent = REF_KIND_LABEL[item.kind]
                const title = document.createElement('span')
                title.className = 'rich-slash-title'
                title.textContent = item.label
                const sub = document.createElement('span')
                sub.className = 'rich-slash-hint'
                sub.textContent = item.sub
                btn.append(kind, title, sub)
                btn.addEventListener('mousedown', (ev) => {
                  ev.preventDefault()
                  state?.command(item)
                })
                btn.addEventListener('mouseenter', () => {
                  if (state) {
                    state.index = i
                    paint()
                  }
                })
                el!.appendChild(btn)
              })
            }
            const place = (props: SuggestionProps<RefItem>) => {
              if (!el) return
              const rect = props.clientRect?.()
              if (!rect) return
              el.style.left = `${rect.left + window.scrollX}px`
              el.style.top = `${rect.bottom + window.scrollY + 4}px`
            }
            const update = (props: SuggestionProps<RefItem>) => {
              state = { items: props.items, index: Math.min(state?.index ?? 0, Math.max(props.items.length - 1, 0)), command: props.command }
              paint()
              place(props)
            }
            const destroy = () => {
              el?.remove()
              el = null
              state = null
            }
            return {
              onStart: (props) => {
                el = document.createElement('div')
                el.className = 'rich-slash-menu'
                document.body.appendChild(el)
                state = null
                update(props)
              },
              onUpdate: update,
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                if (!state) return false
                if (event.key === 'ArrowUp') {
                  state.index = (state.index + state.items.length - 1) % Math.max(state.items.length, 1)
                  paint()
                  return true
                }
                if (event.key === 'ArrowDown') {
                  state.index = (state.index + 1) % Math.max(state.items.length, 1)
                  paint()
                  return true
                }
                if (event.key === 'Enter') {
                  const item = state.items[state.index]
                  if (item) state.command(item)
                  return true
                }
                if (event.key === 'Escape') {
                  destroy()
                  return true
                }
                return false
              },
              onExit: destroy,
            }
          },
        }),
      ]
    },
  })
}

/* ---------------- 斜杠命令 ---------------- */
type SlashItem = {
  title: string
  hint: string
  keywords: string
  run: (editor: Editor, openImagePicker: () => void) => void
}

const SLASH_ITEMS: SlashItem[] = [
  { title: '标题 1', hint: '一级大标题', keywords: 'h1 biaoti heading', run: (e) => e.chain().focus().setNode('heading', { level: 1 }).run() },
  { title: '标题 2', hint: '二级标题', keywords: 'h2 biaoti heading', run: (e) => e.chain().focus().setNode('heading', { level: 2 }).run() },
  { title: '标题 3', hint: '三级标题', keywords: 'h3 biaoti heading', run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
  { title: '无序列表', hint: '圆点列表', keywords: 'ul list liebiao', run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: '有序列表', hint: '编号列表', keywords: 'ol list liebiao', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: '勾选清单', hint: '待办勾选框', keywords: 'todo task checkbox gouxuan', run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: '引用', hint: '引用块', keywords: 'quote yinyong', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: '代码块', hint: '等宽代码', keywords: 'code daima', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: '分割线', hint: '水平分隔', keywords: 'hr divider fenge', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: '表格', hint: '插入 3×3 表格', keywords: 'table biaoge', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: '图片', hint: '上传并插入图片', keywords: 'image img tupian', run: (_e, open) => open() },
  {
    title: '新一天',
    hint: '日期分段（今天）',
    keywords: 'newday xinyitian riqi date day fen',
    run: (e) =>
      e.chain().focus().insertContent([
        { type: 'dateInsert', attrs: { date: todayIso() } },
        { type: 'paragraph' },
      ]).run(),
  },
  {
    title: '时间戳',
    hint: '插入当前日期时间文本',
    keywords: 'time shijian chuo now shijianchuo',
    run: (e) => {
      const d = new Date()
      const p = (n: number) => `${n}`.padStart(2, '0')
      e.chain().focus().insertContent(`${todayIso()} ${p(d.getHours())}:${p(d.getMinutes())}`).run()
    },
  },
]

/** 斜杠菜单：手写 DOM 浮层（不引 tippy），键盘上下选择、Enter 确认、Esc 关闭 */
function makeSlashExtension(openImagePicker: () => void) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        Suggestion<SlashItem>({
          editor,
          // 关键：两个 Suggestion 共存必须各自独立 pluginKey（默认同名 'suggestion' 会抛
          // "Adding different instances of a keyed plugin" 导致编辑器初始化崩溃白屏）
          pluginKey: new PluginKey('slashSuggestion'),
          char: '/',
          items: ({ query }) => {
            const q = query.trim().toLowerCase()
            return SLASH_ITEMS.filter(
              (i) => !q || i.title.toLowerCase().includes(q) || i.keywords.includes(q),
            ).slice(0, 8)
          },
          command: ({ editor: e, range, props }) => {
            e.chain().focus().deleteRange(range).run()
            props.run(e, openImagePicker)
          },
          render: () => {
            let el: HTMLDivElement | null = null
            let state: { items: SlashItem[]; index: number; command: (item: SlashItem) => void } | null =
              null

            const paint = () => {
              if (!el || !state) return
              el.innerHTML = ''
              state.items.forEach((item, i) => {
                const btn = document.createElement('button')
                btn.type = 'button'
                btn.className = `rich-slash-item${i === state!.index ? ' active' : ''}`
                btn.innerHTML = `<span class="rich-slash-title"></span><span class="rich-slash-hint"></span>`
                ;(btn.children[0] as HTMLElement).textContent = item.title
                ;(btn.children[1] as HTMLElement).textContent = item.hint
                btn.onmousedown = (ev) => {
                  ev.preventDefault()
                  state?.command(item)
                }
                el!.appendChild(btn)
              })
            }
            const place = (props: SuggestionProps<SlashItem>) => {
              if (!el) return
              const rect = props.clientRect?.()
              if (!rect) return
              el.style.left = `${rect.left + window.scrollX}px`
              el.style.top = `${rect.bottom + window.scrollY + 4}px`
            }
            const update = (props: SuggestionProps<SlashItem>) => {
              state = {
                items: props.items,
                index: state?.index ?? 0,
                command: props.command,
              }
              if (state.index >= props.items.length) state.index = 0
              paint()
              place(props)
            }
            const destroy = () => {
              el?.remove()
              el = null
              state = null
            }
            return {
              onStart: (props) => {
                el = document.createElement('div')
                el.className = 'rich-slash-menu'
                document.body.appendChild(el)
                state = null
                update(props)
              },
              onUpdate: update,
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                if (!state) return false
                if (event.key === 'Escape') {
                  destroy()
                  return true
                }
                if (event.key === 'ArrowDown') {
                  state.index = (state.index + 1) % Math.max(state.items.length, 1)
                  paint()
                  return true
                }
                if (event.key === 'ArrowUp') {
                  state.index =
                    (state.index - 1 + state.items.length) % Math.max(state.items.length, 1)
                  paint()
                  return true
                }
                if (event.key === 'Enter') {
                  const item = state.items[state.index]
                  if (item) state.command(item)
                  return true
                }
                return false
              },
              onExit: destroy,
            }
          },
        }),
      ]
    },
  })
}

/* ---------------- 大纲提取 ---------------- */
function extractOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'dateInsert') {
      items.push({ level: 1, text: formatDateLabel((node.attrs.date as string) ?? ''), pos })
    } else if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) items.push({ level: node.attrs.level as number, text, pos })
    }
    return true
  })
  return items
}

/** 文字颜色预设（与项目设计 token 同色系，低饱和） */
const TEXT_COLORS = ['#2B3A35', '#B4564E', '#D97B2B', '#B79B2E', '#4C8C6B', '#3E7C6B', '#5B7C99', '#7A5BA6']

const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ B', '加粗'],
  ['Ctrl/⌘ I', '斜体'],
  ['Ctrl/⌘ U', '下划线'],
  ['Ctrl/⌘ Z', '撤销'],
  ['Ctrl/⌘ ⇧ Z', '重做'],
  ['/', '插入菜单'],
  ['↑ ↓ + Enter', '菜单内选择'],
  ['Tab', '表格跳下一格'],
  ['⇧ Tab', '表格跳上一格'],
  ['Ctrl/⌘ V', '粘贴截图插入'],
  ['拖拽图片', '拖入即插入'],
  ['/新一天', '日期分段'],
]

/* ---------------- 工具栏按钮 ---------------- */
function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault() // 不抢编辑器焦点
        onClick()
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100 disabled:opacity-35',
        active ? 'bg-bench-wash text-bench-ink' : 'text-ink-soft hover:bg-paper hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/* ---------------- 主组件 ---------------- */
export type RichEditorHandle = {
  /** 大纲点击：选中并滚动到指定文档位置 */
  scrollToPos: (pos: number) => void
}

const RichEditor = forwardRef<
  RichEditorHandle,
  {
    initialHtml: string
    onChange: (html: string) => void
    onOutlineChange?: (items: OutlineItem[]) => void
    placeholder?: string
    /** 锁定签署后的只读态：隐藏工具栏、禁止编辑（引用片点击跳转仍可用） */
    readOnly?: boolean
  }
>(function RichEditor(
  {
    initialHtml,
    onChange,
    onOutlineChange,
    placeholder = '记录实验过程、数据与观察…输入 / 插入标题、表格、图片等',
    readOnly = false,
  },
  ref,
) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [inTable, setInTable] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  /** @ 引用搜索：三路合并为统一 RefItem 列表（utils/client 引用稳定，仅在 useEditor 初始化时闭包一次） */
  const fetchRefItems = useCallback(
    async (query: string): Promise<RefItem[]> => {
      try {
        const res = await utils.client.search.refSearch.query({ q: query })
        const items: RefItem[] = [
          ...res.records.map((r) => ({
            kind: 'record' as const,
            id: r.id,
            label: r.title,
            sub: r.recordDate,
          })),
          ...res.protocols.map((p) => ({
            kind: 'protocol' as const,
            id: p.id,
            label: p.name,
            sub: `${p.category} · ${p.version}`,
          })),
          ...res.samples.map((sm) => ({
            kind: 'sample' as const,
            id: sm.id,
            label: sm.name,
            sub: sm.type,
          })),
        ]
        return items.slice(0, 8)
      } catch {
        return []
      }
    },
    [utils],
  )
  const [, setTick] = useState(0) // 选区变化时强制刷新工具栏 active 态
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  const openImagePicker = useCallback(() => fileRef.current?.click(), [])

  const insertImageFile = useCallback(
    (editor: Editor | null) => async (file: File) => {
      try {
        const dataUrl = await compressImage(file)
        editor?.chain().focus().setImage({ src: dataUrl }).run()
      } catch {
        /* 压缩失败静默（用户可重试） */
      }
    },
    [],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Subscript,
      Superscript,
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      DateInsert,
      RefChip,
      makeSlashExtension(openImagePicker),
      makeRefChipExtension(fetchRefItems),
    ],
    editable: !readOnly,
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
      // 编辑态点击 @ 引用片直接跳转（atom 默认只选中；阅读态走原生 <a>）
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest?.('a[data-ref-chip]')
        if (a instanceof HTMLAnchorElement) {
          event.preventDefault()
          const href = a.getAttribute('href')
          if (href) navigate(href)
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        if (readOnlyRef.current) return false
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        )
        if (files.length === 0) return false
        event.preventDefault()
        files.forEach((f) => void insertImageFile(editor)(f))
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
      onOutlineChange?.(extractOutline(e))
    },
    onSelectionUpdate: ({ editor: e }) => {
      setInTable(e.isActive('table'))
      setTick((t) => t + 1)
    },
    onCreate: ({ editor: e }) => {
      onOutlineChange?.(extractOutline(e))
    },
  })

  // 卸载清理
  useEffect(() => () => editor?.destroy(), [editor])

  // 锁定/解锁时切换可编辑态（editable 选项只在 useEditor 初始化时读取一次）
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // 对外暴露：大纲跳转
  useImperativeHandle(
    ref,
    () => ({
      scrollToPos: (pos: number) => {
        if (!editor) return
        editor.chain().focus().setTextSelection(pos + 1).run()
        const dom = editor.view.nodeDOM(pos)
        if (dom instanceof HTMLElement) {
          dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      },
    }),
    [editor],
  )

  const setLink = () => {
    if (!editor) return
    const prev = (editor.getAttributes('link').href as string) ?? ''
    const url = window.prompt('链接地址（留空移除链接）', prev)
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: url.trim() }).run()
    }
  }

  return (
    <div>
      {/* 工具栏（sticky 顶部，Benchling 式）— 锁定只读时整排隐藏 */}
      {!readOnly && (
      <div className="sticky top-12 z-30 flex flex-wrap items-center gap-0.5 border-b border-line bg-paper/95 px-2 py-1.5 backdrop-blur md:top-14">
        <ToolBtn title="撤销" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn title="标题 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="标题 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="标题 3" active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn title="加粗 (Ctrl+B)" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="斜体 (Ctrl+I)" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="下划线 (Ctrl+U)" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="删除线" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="高亮" active={editor?.isActive('highlight')} onClick={() => editor?.chain().focus().toggleHighlight().run()}>
          <Highlighter className="h-3.5 w-3.5" />
        </ToolBtn>
        {/* 文字颜色（Benchling 「A」） */}
        <div className="relative">
          <ToolBtn
            title="文字颜色"
            active={!!editor?.getAttributes('textStyle').color}
            onClick={() => setPaletteOpen((v) => !v)}
          >
            <span
              className="text-[13px] font-bold leading-none"
              style={{ color: (editor?.getAttributes('textStyle').color as string) || undefined }}
            >
              A
            </span>
          </ToolBtn>
          {paletteOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setPaletteOpen(false)
                }}
              />
              <div className="absolute left-0 top-full z-50 mt-1 w-[168px] rounded-xl border border-line bg-surface p-2 shadow-overlay">
                <div className="grid grid-cols-4 gap-1.5">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor?.chain().focus().setColor(c).run()
                        setPaletteOpen(false)
                      }}
                      className="h-7 w-full rounded-md border border-line/50 transition-transform duration-100 hover:scale-105"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor?.chain().focus().unsetColor().run()
                    setPaletteOpen(false)
                  }}
                  className="mt-1.5 w-full rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-bench-wash hover:text-ink"
                >
                  清除颜色
                </button>
              </div>
            </>
          )}
        </div>
        <ToolBtn title="下标" active={editor?.isActive('subscript')} onClick={() => editor?.chain().focus().toggleSubscript().run()}>
          <SubIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="上标" active={editor?.isActive('superscript')} onClick={() => editor?.chain().focus().toggleSuperscript().run()}>
          <SupIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn title="无序列表" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="有序列表" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="勾选清单" active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <CheckSquare className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="引用" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="代码块" active={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="分割线" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn title="插入表格 (3×3)" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="插入图片" onClick={openImagePicker}>
          <ImageIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn title="链接" active={editor?.isActive('link')} onClick={setLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn title="键盘快捷键速查" onClick={() => setShortcutsOpen(true)}>
          <Keyboard className="h-3.5 w-3.5" />
        </ToolBtn>

        {/* 选中表格时的行列操作（Benchling 式表格工具） */}
        {inTable && editor && (
          <>
            <span className="mx-1 h-4 w-px bg-line" />
            {(
              [
                ['+行', () => editor.chain().focus().addRowAfter().run()],
                ['+列', () => editor.chain().focus().addColumnAfter().run()],
                ['-行', () => editor.chain().focus().deleteRow().run()],
                ['-列', () => editor.chain().focus().deleteColumn().run()],
                ['合并', () => editor.chain().focus().mergeCells().run()],
                ['拆分', () => editor.chain().focus().splitCell().run()],
                ['删表', () => editor.chain().focus().deleteTable().run()],
              ] as [string, () => void][]
            ).map(([label, run]) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  run()
                }}
                className="flex h-7 items-center rounded-md px-1.5 text-[11.5px] text-ink-soft transition-colors duration-100 hover:bg-paper hover:text-ink"
              >
                {label}
              </button>
            ))}
          </>
        )}
      </div>
      )}

      {/* 编辑区 */}
      <EditorContent editor={editor} className="rich-editor" />
      {!readOnly && (
        <p className="border-t border-line-soft px-3 py-1.5 text-[11px] text-ink-mute">
          输入 / 打开插入菜单；支持直接粘贴截图；表格内 Tab 跳格
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void insertImageFile(editor)(f)
          e.target.value = ''
        }}
      />

      {/* 快捷键速查浮层 */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm"
          onMouseDown={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-overlay"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-ink">键盘快捷键</p>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-bench-wash hover:text-ink"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-6">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-soft">{label}</span>
                  <kbd className="shrink-0 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-mute">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default RichEditor

/** 纯文本 → 初始段落 HTML（老记录 resultMd 迁移为编辑器内容用） */
export function textToInitialHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
