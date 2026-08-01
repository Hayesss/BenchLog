// 序列块节点（批次F F3）：Benchling 式 sequence block
// - block atom：attrs { seq, kind: dna|rna|protein }
// - 编辑态 NodeView（纯 DOM）：类型切换 + 合法性过滤（DNA:ACGTN / RNA:ACGUN / 蛋白 20 字母）+ 实时统计（长度/GC%）+ 碱基着色
// - renderHTML 输出静态着色结构（data-seq 存原始序列），分享页/版本历史 sanitize 后直接呈现
import { Node } from '@tiptap/react'

export type SeqKind = 'dna' | 'rna' | 'protein'

const SEQ_KIND_LABEL: Record<SeqKind, string> = { dna: 'DNA', rna: 'RNA', protein: '蛋白' }

/** 各类型的合法字母集（大写） */
const ALPHABET: Record<SeqKind, Set<string>> = {
  dna: new Set(['A', 'C', 'G', 'T', 'N']),
  rna: new Set(['A', 'C', 'G', 'U', 'N']),
  protein: new Set('ACDEFGHIKLMNPQRSTVWY'.split('')),
}

/** 过滤：大写化 + 仅保留合法字母（粘贴 FASTA 时空白/数字/符号自动剔除） */
export function filterSeq(input: string, kind: SeqKind): string {
  const allow = ALPHABET[kind]
  let out = ''
  for (const ch of input.toUpperCase()) {
    if (allow.has(ch)) out += ch
  }
  return out
}

function seqStats(seq: string, kind: SeqKind): { len: number; gc: number | null } {
  const len = seq.length
  if (kind === 'protein' || len === 0) return { len, gc: null }
  let gc = 0
  for (const ch of seq) if (ch === 'G' || ch === 'C') gc += 1
  return { len, gc: (gc / len) * 100 }
}

function baseClass(ch: string): string {
  switch (ch) {
    case 'A':
      return 'seq-a'
    case 'T':
      return 'seq-t'
    case 'U':
      return 'seq-u'
    case 'G':
      return 'seq-g'
    case 'C':
      return 'seq-c'
    default:
      return 'seq-n'
  }
}

/** 着色填充容器：每 10 个字符一组（seq-chunk），逐字符 span 上色 */
function paintSeq(body: HTMLElement, seq: string, kind: SeqKind) {
  body.textContent = ''
  if (!seq) {
    const empty = document.createElement('span')
    empty.className = 'seq-empty'
    empty.textContent = '空序列'
    body.appendChild(empty)
    return
  }
  for (let i = 0; i < seq.length; i += 10) {
    const chunk = document.createElement('span')
    chunk.className = 'seq-chunk'
    for (const ch of seq.slice(i, i + 10)) {
      const s = document.createElement('span')
      s.className = kind === 'protein' ? 'seq-aa' : baseClass(ch)
      s.textContent = ch
      chunk.appendChild(s)
    }
    body.appendChild(chunk)
  }
}

function statsText(seq: string, kind: SeqKind): string {
  const { len, gc } = seqStats(seq, kind)
  const unit = kind === 'protein' ? ' aa' : ' bp'
  return gc == null ? `${len}${unit}` : `${len}${unit} · GC ${gc.toFixed(1)}%`
}

/** 静态头部（kind 徽标 + 统计），renderHTML / NodeView 共用结构 */
function headChildren(kind: SeqKind, seq: string): Array<{ tag: string; cls: string; text: string }> {
  return [
    { tag: 'span', cls: 'rich-seq-kind', text: SEQ_KIND_LABEL[kind] },
    { tag: 'span', cls: 'rich-seq-stats', text: statsText(seq, kind) },
  ]
}

export const SeqBlock = Node.create({
  name: 'seqBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      seq: { default: '' },
      kind: { default: 'dna' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-seq-block]',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          const rawKind = dom.dataset.kind
          return {
            seq: dom.dataset.seq ?? '',
            kind: rawKind === 'rna' || rawKind === 'protein' ? rawKind : 'dna',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = (node.attrs.kind as SeqKind) ?? 'dna'
    const seq = (node.attrs.seq as string) ?? ''
    const body: unknown[] = ['div', { class: 'rich-seq-body' }]
    // 着色结构（与 paintSeq 同构）：10 字符一组 seq-chunk > 逐字符 span
    if (!seq) {
      body.push(['span', { class: 'seq-empty' }, '空序列'])
    } else {
      for (let i = 0; i < seq.length; i += 10) {
        const spans = seq
          .slice(i, i + 10)
          .split('')
          .map((ch) => ['span', { class: kind === 'protein' ? 'seq-aa' : baseClass(ch) }, ch])
        body.push(['span', { class: 'seq-chunk' }, ...spans])
      }
    }
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-seq-block': '',
        'data-kind': kind,
        'data-seq': seq,
        class: 'rich-seq-block',
      },
      [
        'div',
        { class: 'rich-seq-head' },
        ...headChildren(kind, seq).map((h) => ['span', { class: h.cls }, h.text] as unknown),
      ],
      body,
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let kind = (node.attrs.kind as SeqKind) ?? 'dna'
      let seq = (node.attrs.seq as string) ?? ''
      let editing = false
      const editable = editor.isEditable

      const dom = document.createElement('div')
      dom.className = 'rich-seq-block'
      dom.dataset.seqBlock = ''

      const head = document.createElement('div')
      head.className = 'rich-seq-head'
      head.contentEditable = 'false'

      const kindWrap = document.createElement('span')
      kindWrap.className = 'rich-seq-kinds'
      const kindBtns = new Map<SeqKind, HTMLButtonElement>()
      ;(['dna', 'rna', 'protein'] as SeqKind[]).forEach((k) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'rich-seq-kindbtn'
        b.textContent = SEQ_KIND_LABEL[k]
        b.onclick = (ev) => {
          ev.preventDefault()
          if (k === kind) return
          kind = k
          seq = filterSeq(seq, kind)
          commit()
          paintAll()
        }
        kindBtns.set(k, b)
        kindWrap.appendChild(b)
      })

      const stats = document.createElement('span')
      stats.className = 'rich-seq-stats'

      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'rich-seq-editbtn'
      toggle.onclick = (ev) => {
        ev.preventDefault()
        editing = !editing
        paintAll()
        if (editing) ta.focus()
      }

      head.appendChild(kindWrap)
      head.appendChild(stats)
      head.appendChild(toggle)
      if (!editable) {
        // 只读（锁定/阅读态）：隐藏全部编辑控件，纯静态着色展示
        kindWrap.style.display = 'none'
        toggle.style.display = 'none'
      }

      const body = document.createElement('div')
      body.className = 'rich-seq-body'

      const ta = document.createElement('textarea')
      ta.className = 'rich-seq-textarea'
      ta.rows = 3
      ta.spellcheck = false
      ta.placeholder = kind === 'protein' ? '粘贴蛋白序列（20 种氨基酸字母）…' : '粘贴序列（非法字符自动剔除）…'
      ta.addEventListener('input', () => {
        const next = filterSeq(ta.value, kind)
        if (next !== ta.value) ta.value = next
        seq = next
        commit()
        stats.textContent = statsText(seq, kind)
      })

      dom.appendChild(head)
      dom.appendChild(body)
      dom.appendChild(ta)

      const commit = () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (typeof pos !== 'number') return
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { seq, kind })
            return true
          })
          .run()
      }

      const paintAll = () => {
        kindBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === kind)))
        stats.textContent = statsText(seq, kind)
        toggle.textContent = editing ? '完成' : '编辑'
        body.style.display = editing ? 'none' : ''
        ta.style.display = editing ? '' : 'none'
        if (!editing) paintSeq(body, seq, kind)
        if (ta.value !== seq) ta.value = seq
      }
      paintAll()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'seqBlock') return false
          const nextKind = (updated.attrs.kind as SeqKind) ?? 'dna'
          const nextSeq = (updated.attrs.seq as string) ?? ''
          // 外部变化（撤销/协作）才重绘；自身 commit 回环仅同步统计
          const external = nextSeq !== seq || nextKind !== kind
          kind = nextKind
          seq = nextSeq
          if (external) paintAll()
          else stats.textContent = statsText(seq, kind)
          return true
        },
        // 让 textarea / 按钮收到原生事件，不被 ProseMirror 截获
        stopEvent: (event: Event) => {
          const t = event.target as HTMLElement | null
          return !!t && (t === ta || t.tagName === 'BUTTON')
        },
        ignoreMutation: () => true,
      }
    }
  },
})
