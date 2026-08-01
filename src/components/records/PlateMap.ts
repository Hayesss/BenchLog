// 孔板图节点（批次F F2）：Benchling 式 plate map
// - block atom：attrs { rows, cols, title, wells }（wells 为 JSON：{"A1":"s"|"c"|"x"}，s=样本 c=对照 x=排除）
// - 编辑态 NodeView（纯 DOM）：板型切换（8×12 / 4×6）+ 标题编辑 + 孔位点击循环 空→样本→对照→排除
// - renderHTML 输出静态网格（class 网格无内联样式，过 DOMPurify），分享页/版本历史直接呈现
import { Node } from '@tiptap/react'

export type WellState = 's' | 'c' | 'x'
type WellsMap = Record<string, WellState>

const WELL_LABEL = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`
const CYCLE: Record<string, WellState | null> = { e: 's', s: 'c', c: 'x', x: null }

export const PLATE_TYPES = [
  { rows: 8, cols: 12, label: '96 孔（8×12）' },
  { rows: 4, cols: 6, label: '24 孔（4×6）' },
] as const

function parseWells(raw: unknown): WellsMap {
  if (typeof raw !== 'string' || !raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: WellsMap = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === 's' || v === 'c' || v === 'x') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function wellCounts(wells: WellsMap): { s: number; c: number; x: number } {
  const counts = { s: 0, c: 0, x: 0 }
  for (const v of Object.values(wells)) counts[v] += 1
  return counts
}

function countsText(wells: WellsMap): string {
  const { s, c, x } = wellCounts(wells)
  const parts: string[] = []
  if (s) parts.push(`样本 ${s}`)
  if (c) parts.push(`对照 ${c}`)
  if (x) parts.push(`排除 ${x}`)
  return parts.length ? parts.join(' · ') : '未标记'
}

/** 静态网格 children（renderHTML 用）：行字母 + 列号 + 色块孔位 */
function plateChildren(rows: number, cols: number, wells: WellsMap): unknown[] {
  const headCells: unknown[] = [['span', { class: 'pm-corner' }]]
  for (let c = 0; c < cols; c++) headCells.push(['span', { class: 'pm-colhead' }, String(c + 1)])
  const grid: unknown[] = [
    'div',
    { class: `pm-grid pm-cols-${cols}` },
    ...headCells,
  ]
  for (let r = 0; r < rows; r++) {
    ;(grid as unknown[]).push(['span', { class: 'pm-rowhead' }, String.fromCharCode(65 + r)])
    for (let c = 0; c < cols; c++) {
      const label = WELL_LABEL(r, c)
      const st = wells[label]
      ;(grid as unknown[]).push([
        'span',
        { class: `pm-well ${st ? `pm-${st}` : ''}`, 'data-well': label, title: label },
      ])
    }
  }
  return [grid]
}

export const PlateMap = Node.create({
  name: 'plateMap',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      rows: { default: 8 },
      cols: { default: 12 },
      title: { default: '' },
      wells: { default: '{}' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-plate-map]',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          return {
            rows: Number(dom.dataset.rows ?? 8) || 8,
            cols: Number(dom.dataset.cols ?? 12) || 12,
            title: dom.dataset.title ?? '',
            wells: dom.dataset.wells ?? '{}',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const rows = Number(node.attrs.rows ?? 8)
    const cols = Number(node.attrs.cols ?? 12)
    const title = (node.attrs.title as string) ?? ''
    const wellsRaw = (node.attrs.wells as string) ?? '{}'
    const wells = parseWells(wellsRaw)
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-plate-map': '',
        'data-rows': String(rows),
        'data-cols': String(cols),
        'data-title': title,
        'data-wells': wellsRaw,
        class: 'rich-plate-map',
      },
      [
        'div',
        { class: 'pm-head' },
        ['span', { class: 'pm-title' }, title || '孔板图'],
        ['span', { class: 'pm-stats' }, `${rows}×${cols} · ${countsText(wells)}`],
      ],
      ...plateChildren(rows, cols, wells),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let rows = Number(node.attrs.rows ?? 8)
      let cols = Number(node.attrs.cols ?? 12)
      let title = (node.attrs.title as string) ?? ''
      let wells = parseWells(node.attrs.wells)
      const editable = editor.isEditable

      const dom = document.createElement('div')
      dom.className = 'rich-plate-map'
      dom.dataset.plateMap = ''

      const head = document.createElement('div')
      head.className = 'pm-head'
      head.contentEditable = 'false'

      const titleInput = document.createElement('input')
      titleInput.className = 'pm-title-input'
      titleInput.placeholder = '孔板标题（如 qPCR 板 1）'
      titleInput.value = title
      titleInput.addEventListener('input', () => {
        title = titleInput.value
        commit()
      })

      const typeBtns: HTMLButtonElement[] = []
      const typeWrap = document.createElement('span')
      typeWrap.className = 'pm-types'
      PLATE_TYPES.forEach((pt) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'pm-typebtn'
        b.textContent = pt.label
        b.onclick = (ev) => {
          ev.preventDefault()
          if (pt.rows === rows && pt.cols === cols) return
          rows = pt.rows
          cols = pt.cols
          // 板型变更：剔除越界孔位
          const next: WellsMap = {}
          for (const [k, v] of Object.entries(wells)) {
            const m = /^([A-Z])(\d{1,2})$/.exec(k)
            if (!m) continue
            const r = m[1].charCodeAt(0) - 65
            const c = Number(m[2]) - 1
            if (r < rows && c < cols) next[k] = v
          }
          wells = next
          commit()
          paint()
        }
        typeBtns.push(b)
        typeWrap.appendChild(b)
      })

      const stats = document.createElement('span')
      stats.className = 'pm-stats'

      head.appendChild(titleInput)
      head.appendChild(typeWrap)
      head.appendChild(stats)

      const gridWrap = document.createElement('div')
      gridWrap.contentEditable = 'false'

      const legend = document.createElement('div')
      legend.className = 'pm-legend'
      legend.contentEditable = 'false'
      legend.innerHTML =
        '<span class="pm-lg"><i class="pm-well pm-s"></i>样本</span>' +
        '<span class="pm-lg"><i class="pm-well pm-c"></i>对照</span>' +
        '<span class="pm-lg"><i class="pm-well pm-x"></i>排除</span>'

      dom.appendChild(head)
      dom.appendChild(gridWrap)
      dom.appendChild(legend)

      const commit = () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (typeof pos !== 'number') return
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              rows,
              cols,
              title,
              wells: JSON.stringify(wells),
            })
            return true
          })
          .run()
      }

      const paint = () => {
        typeBtns.forEach((b, i) =>
          b.setAttribute(
            'aria-pressed',
            String(PLATE_TYPES[i].rows === rows && PLATE_TYPES[i].cols === cols),
          ),
        )
        stats.textContent = countsText(wells)
        gridWrap.textContent = ''
        const grid = document.createElement('div')
        grid.className = `pm-grid pm-cols-${cols}`
        grid.appendChild(document.createElement('span')).className = 'pm-corner'
        for (let c = 0; c < cols; c++) {
          const h = grid.appendChild(document.createElement('span'))
          h.className = 'pm-colhead'
          h.textContent = String(c + 1)
        }
        for (let r = 0; r < rows; r++) {
          const rh = grid.appendChild(document.createElement('span'))
          rh.className = 'pm-rowhead'
          rh.textContent = String.fromCharCode(65 + r)
          for (let c = 0; c < cols; c++) {
            const label = WELL_LABEL(r, c)
            const b = document.createElement('button')
            b.type = 'button'
            b.className = `pm-well pm-btn ${wells[label] ? `pm-${wells[label]}` : ''}`
            b.title = `${label}（点击切换：空→样本→对照→排除）`
            b.dataset.well = label
            b.disabled = !editable
            b.onclick = (ev) => {
              ev.preventDefault()
              const cur = wells[label] ?? 'e'
              const next = CYCLE[cur]
              if (next) wells[label] = next
              else delete wells[label]
              b.className = `pm-well pm-btn ${next ? `pm-${next}` : ''}`
              stats.textContent = countsText(wells)
              commit()
            }
            grid.appendChild(b)
          }
        }
        gridWrap.appendChild(grid)
      }

      if (!editable) {
        titleInput.readOnly = true
        typeWrap.style.display = 'none'
      }
      paint()

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'plateMap') return false
          const nextRows = Number(updated.attrs.rows ?? 8)
          const nextCols = Number(updated.attrs.cols ?? 12)
          const nextTitle = (updated.attrs.title as string) ?? ''
          const nextWells = parseWells(updated.attrs.wells)
          const external =
            nextRows !== rows ||
            nextCols !== cols ||
            nextTitle !== title ||
            JSON.stringify(nextWells) !== JSON.stringify(wells)
          rows = nextRows
          cols = nextCols
          title = nextTitle
          wells = nextWells
          if (external) {
            if (titleInput.value !== title) titleInput.value = title
            paint()
          }
          return true
        },
        stopEvent: (event: Event) => {
          const t = event.target as HTMLElement | null
          return !!t && (t === titleInput || t.tagName === 'BUTTON')
        },
        ignoreMutation: () => true,
      }
    }
  },
})
