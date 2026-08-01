/**
 * F1 表格公式引擎（Benchling Excel 级表格的 80/20 版）
 * 单元格以 `=` 开头即公式：支持 SUM/AVG/COUNT/MAX/MIN 函数（范围 A1:B5 或单元格列表 A1,B3）
 * 与 + - × ÷ 四则混合、括号、负数、小数；A1 记法（A=第 1 列，1=第 1 行，均含表头行）。
 * 纯函数零依赖：渲染态（分享页/版本预览/锁定只读）求值显示，编辑态工具栏实时预览。
 */

/** 公式错误值（与 Excel 风格对齐，渲染为 `#XXX`） */
export class FormulaError extends Error {}

type CellGrid = string[][]

/** A1 记法 → [row, col]（0 基）；非法返回 null */
export function parseA1(ref: string): [number, number] | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]{1,2})(\d{1,3})$/)
  if (!m) return null
  const letters = m[1]
  let col = 0
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64)
  const row = Number(m[2])
  if (col < 1 || row < 1) return null
  return [row - 1, col - 1]
}

/** 范围 A1:B5 → 单元格坐标列表（含端点，行列递增展开） */
function expandRange(a: string, b: string): [number, number][] {
  const pa = parseA1(a)
  const pb = parseA1(b)
  if (!pa || !pb) throw new FormulaError('#REF')
  const [r1, c1] = pa
  const [r2, c2] = pb
  const out: [number, number][] = []
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push([r, c])
  return out
}

/** 单元格文本 → 数字；空/非数字返回 null（SUM 系跳过非数字，与 Excel 一致） */
function toNum(text: string): number | null {
  const t = text.replace(/[，,\s]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/* ---------------- 递归下降解析 ---------------- */
// grammar: expr := term (('+'|'-') term)* ; term := factor (('*'|'/'|'×'|'÷') factor)* ;
// factor := number | funcall | ref | range | '(' expr ')' | '-' factor
type Token =
  | { t: 'num'; v: number }
  | { t: 'fn'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }
  | { t: 'colon' }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const s = src.toUpperCase()
  while (i < s.length) {
    const ch = s[i]
    if (ch === ' ' || ch === ' ') { i++; continue }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      const n = Number(s.slice(i, j))
      if (!Number.isFinite(n)) throw new FormulaError('#NUM')
      out.push({ t: 'num', v: n })
      i = j
      continue
    }
    if (/[A-Z]/.test(ch)) {
      let j = i
      while (j < s.length && /[A-Z0-9]/.test(s[j])) j++
      const word = s.slice(i, j)
      if (['SUM', 'AVG', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].includes(word) && s[j] === '(') {
        out.push({ t: 'fn', v: word === 'AVERAGE' ? 'AVG' : word })
      } else if (parseA1(word)) {
        out.push({ t: 'ref', v: word })
      } else {
        throw new FormulaError('#NAME')
      }
      i = j
      continue
    }
    if (ch === '+' || ch === '-') { out.push({ t: 'op', v: ch }); i++; continue }
    if (ch === '*' || ch === '×') { out.push({ t: 'op', v: '*' }); i++; continue }
    if (ch === '/' || ch === '÷') { out.push({ t: 'op', v: '/' }); i++; continue }
    if (ch === '(') { out.push({ t: 'lp' }); i++; continue }
    if (ch === ')') { out.push({ t: 'rp' }); i++; continue }
    if (ch === ',' || ch === '，') { out.push({ t: 'comma' }); i++; continue }
    if (ch === ':') { out.push({ t: 'colon' }); i++; continue }
    throw new FormulaError('#NAME')
  }
  return out
}

/** 求值上下文：表格数据 + 正在求值的单元格（防循环引用） */
type Ctx = { grid: CellGrid; self: [number, number]; visiting: Set<string> }

function cellValue(ctx: Ctx, r: number, c: number): number | null {
  if (r === ctx.self[0] && c === ctx.self[1]) throw new FormulaError('#CYCLE')
  const row = ctx.grid[r]
  if (!row) return null
  const text = (row[c] ?? '').trim()
  if (text.startsWith('=')) {
    const key = `${r}:${c}`
    if (ctx.visiting.has(key)) throw new FormulaError('#CYCLE')
    ctx.visiting.add(key)
    try {
      return evaluateFormula(text, ctx.grid, [r, c], ctx.visiting)
    } finally {
      ctx.visiting.delete(key)
    }
  }
  return toNum(text)
}

class Parser {
  private pos = 0
  private tokens: Token[]
  private ctx: Ctx
  constructor(tokens: Token[], ctx: Ctx) {
    this.tokens = tokens
    this.ctx = ctx
  }
  private peek(): Token | undefined { return this.tokens[this.pos] }
  private next(): Token { const t = this.tokens[this.pos]; if (!t) throw new FormulaError('#SYNTAX'); this.pos++; return t }

  parseExpr(): number {
    let v = this.parseTerm()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next()
        const r = this.parseTerm()
        v = t.v === '+' ? v + r : v - r
      } else return v
    }
  }
  private parseTerm(): number {
    let v = this.parseFactor()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next()
        const r = this.parseFactor()
        if (t.v === '/') {
          if (r === 0) throw new FormulaError('#DIV0')
          v /= r
        } else v *= r
      } else return v
    }
  }
  private parseFactor(): number {
    const t = this.next()
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '-') return -this.parseFactor()
    if (t.t === 'lp') {
      const v = this.parseExpr()
      const end = this.next()
      if (end.t !== 'rp') throw new FormulaError('#SYNTAX')
      return v
    }
    if (t.t === 'ref') {
      const rc = parseA1(t.v)
      if (!rc) throw new FormulaError('#REF')
      return cellValue(this.ctx, rc[0], rc[1]) ?? 0
    }
    if (t.t === 'fn') return this.parseFunc(t.v)
    throw new FormulaError('#SYNTAX')
  }
  /** 函数参数：范围（REF:REF）或引用/数字的逗号列表 */
  private parseFunc(fn: string): number {
    const open = this.next()
    if (open.t !== 'lp') throw new FormulaError('#SYNTAX')
    const values: number[] = []
    // 收集参数为坐标集或数值
    for (;;) {
      const t = this.peek()
      if (!t) throw new FormulaError('#SYNTAX')
      if (t.t === 'rp') { this.next(); break }
      if (t.t === 'comma') { this.next(); continue }
      if (t.t === 'ref') {
        const a = this.next() as Token & { t: 'ref' }
        if (this.peek()?.t === 'colon') {
          this.next()
          const b = this.next()
          if (b.t !== 'ref') throw new FormulaError('#REF')
          for (const [r, c] of expandRange(a.v, b.v)) {
            const n = cellValue(this.ctx, r, c)
            if (n != null) values.push(n)
          }
        } else {
          const rc = parseA1(a.v)!
          const n = cellValue(this.ctx, rc[0], rc[1])
          if (n != null) values.push(n)
        }
        continue
      }
      if (t.t === 'num') { values.push((this.next() as Token & { t: 'num' }).v); continue }
      if (t.t === 'op' && t.v === '-') { this.next(); values.push(-this.parseFactor()); continue }
      throw new FormulaError('#SYNTAX')
    }
    if (fn === 'COUNT') return values.length
    if (values.length === 0) throw new FormulaError('#EMPTY')
    if (fn === 'SUM') return values.reduce((a, b) => a + b, 0)
    if (fn === 'AVG') return values.reduce((a, b) => a + b, 0) / values.length
    if (fn === 'MAX') return Math.max(...values)
    if (fn === 'MIN') return Math.min(...values)
    throw new FormulaError('#NAME')
  }
}

/** 求值单条公式；`grid` 为表格文本矩阵，`self` 为公式所在单元格（0 基） */
export function evaluateFormula(
  src: string,
  grid: CellGrid,
  self: [number, number] = [-1, -1],
  visiting = new Set<string>(),
): number {
  const body = src.trim().replace(/^=/, '')
  if (!body) throw new FormulaError('#SYNTAX')
  const tokens = tokenize(body)
  const p = new Parser(tokens, { grid, self, visiting })
  const v = p.parseExpr()
  return v
}

/** 数字格式化：最多 4 位小数去尾零，千分位不加（实验数据习惯原样） */
export function fmtValue(n: number): string {
  if (!Number.isFinite(n)) return '#NUM'
  const r = Math.round(n * 10000) / 10000
  return String(r)
}

/** 判断文本是否为公式 */
export function isFormula(text: string): boolean {
  return text.trim().startsWith('=')
}

/** 便捷求值：公式文本 + 表格矩阵 → 显示字符串（错误返回 #XXX） */
export function evalToDisplay(src: string, grid: CellGrid, self: [number, number]): string {
  try {
    return fmtValue(evaluateFormula(src, grid, self))
  } catch (e) {
    if (e instanceof FormulaError) return e.message
    return '#ERR'
  }
}
