/**
 * F1 渲染态公式求值：把 contentHtml 里表格中的公式单元格（`=` 开头）替换为计算值。
 * 用于分享页 / 版本历史预览 / 锁定只读态等 dangerouslySetInnerHTML 渲染场景——
 * 作者写公式，读者看到值；单元格保留原公式于 data-formula + title 供核对。
 * 在 DOMPurify 之前调用（只改文本节点，不引入新标记风险）。
 */
import { evalToDisplay, isFormula } from './table-formula'

export function evaluateTablesInHtml(html: string): string {
  if (!html.includes('=')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables = doc.querySelectorAll('table')
  if (tables.length === 0) return html
  let touched = false
  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll('tr'))
    // 文本矩阵（合并格按首格 textContent 简化，与入库/CSV 同口径）
    const grid: string[][] = rows.map((tr) =>
      Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.textContent?.replace(/ /g, ' ').trim() ?? ''),
    )
    rows.forEach((tr, r) => {
      Array.from(tr.querySelectorAll('th,td')).forEach((cell, c) => {
        const text = grid[r]?.[c] ?? ''
        if (!isFormula(text)) return
        const display = evalToDisplay(text, grid, [r, c])
        cell.textContent = display
        cell.setAttribute('data-formula', text.trim())
        cell.setAttribute('title', `公式：${text.trim()}`)
        cell.classList.add('rich-formula-cell')
        touched = true
      })
    })
  })
  if (!touched) return html
  return doc.body.innerHTML
}
