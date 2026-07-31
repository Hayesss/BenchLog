// Benchling 式笔记本富文本编辑器（TipTap 2 / ProseMirror）
// 能力：工具栏（标题/粗斜体/上下标/高亮/列表/勾选/引用/代码块/表格/图片/链接/分割线）
//      + 斜杠命令（/）+ 图片粘贴与插入（canvas 压缩 base64 内嵌）+ 表格行列操作 + 大纲提取
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Editor, EditorContent, Extension, useEditor } from '@tiptap/react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type OutlineItem = { level: number; text: string; pos: number }

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
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) items.push({ level: node.attrs.level as number, text, pos })
    }
    return true
  })
  return items
}

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
  }
>(function RichEditor(
  {
    initialHtml,
    onChange,
    onOutlineChange,
    placeholder = '记录实验过程、数据与观察…输入 / 插入标题、表格、图片等',
  },
  ref,
) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [inTable, setInTable] = useState(false)
  const [, setTick] = useState(0) // 选区变化时强制刷新工具栏 active 态

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
      makeSlashExtension(openImagePicker),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
      handlePaste: (_view, event) => {
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
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {/* 工具栏（sticky 顶部，Benchling 式） */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-surface px-2 py-1.5">
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

      {/* 编辑区 */}
      <EditorContent editor={editor} className="rich-editor" />
      <p className="border-t border-line-soft px-3 py-1.5 text-[11px] text-ink-mute">
        输入 / 打开插入菜单；支持直接粘贴截图；表格内 Tab 跳格
      </p>

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
