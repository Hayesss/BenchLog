import { useEffect, useMemo, useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'

/** 列映射取值：名称/类型/浓度/体积/日期/忽略 */
type ColRole = 'name' | 'type' | 'conc' | 'vol' | 'date' | 'skip'

const ROLE_LABEL: Record<ColRole, string> = {
  name: '名称',
  type: '类型',
  conc: '浓度',
  vol: '体积',
  date: '日期',
  skip: '忽略',
}

const SAMPLE_TYPES = ['DNA', 'RNA', '蛋白', '细胞', '组织', '血清', '质粒', '引物', '其他'] as const
type SampleType = (typeof SAMPLE_TYPES)[number]

/** 类型列值 → 9 种合法样本类型（模糊命中，兜底「其他」） */
function normalizeType(raw: string): SampleType {
  const s = raw.trim().toLowerCase()
  if (!s) return '其他'
  for (const t of SAMPLE_TYPES) {
    if (s === t.toLowerCase() || s.includes(t.toLowerCase())) return t
  }
  return '其他'
}

/** 日期列值 → YYYY-MM-DD（支持 2026/8/1、2026.8.1、2026-8-1），无法解析返回 null */
function normalizeDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** 表头 → 列角色猜测 */
function guessRole(header: string): ColRole {
  const s = header.trim().toLowerCase()
  if (/名称|name|样本|编号|sample/.test(s)) return 'name'
  if (/类型|type|类别/.test(s)) return 'type'
  if (/浓度|conc/.test(s)) return 'conc'
  if (/体积|vol|容量/.test(s)) return 'vol'
  if (/日期|date|时间/.test(s)) return 'date'
  return 'skip'
}

export type ImportCreated = { id: number; well: string; name: string }

/**
 * P2-D2 表格转样本入库：解析编辑器表格 → 列映射 → 选盒子自动排孔批量创建。
 * 调用方（RecordDetail）在打开时传入解析好的 tableRows；ensureRecordId 保证新建页先落库再关联。
 */
export default function TableImportDialog({
  open,
  onOpenChange,
  tableRows,
  ensureRecordId,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tableRows: string[][]
  ensureRecordId: () => Promise<number>
  defaultDate?: string
}) {
  const utils = trpc.useUtils()
  const boxesQuery = trpc.sample.listBoxes.useQuery(undefined, { enabled: open })
  const batchMut = trpc.sample.batchCreate.useMutation()

  const [hasHeader, setHasHeader] = useState(true)
  const [colRoles, setColRoles] = useState<ColRole[]>([])
  const [boxId, setBoxId] = useState<number | null>(null)
  const [done, setDone] = useState<{ boxName: string; created: ImportCreated[] } | null>(null)

  // 打开时按当前表格重猜列映射（每次打开重置）
  useEffect(() => {
    if (!open) return
    setDone(null)
    const cols = Math.max(0, ...tableRows.map((r) => r.length))
    const first = tableRows[0] ?? []
    const headerLooksReal = first.some((c) => /[一-龥a-zA-Z]/.test(c))
    const useHeader = headerLooksReal
    setHasHeader(useHeader)
    const roles: ColRole[] = []
    for (let i = 0; i < cols; i++) {
      roles.push(useHeader ? guessRole(first[i] ?? '') : i === 0 ? 'name' : 'skip')
    }
    // 保证恰好一列 name：没有则取第 0 列
    if (!roles.includes('name') && cols > 0) roles[0] = 'name'
    setColRoles(roles)
    setBoxId(null)
  }, [open, tableRows])

  const cols = Math.max(0, ...tableRows.map((r) => r.length))
  const dataRows = useMemo(() => {
    const raw = hasHeader ? tableRows.slice(1) : tableRows
    return raw.filter((r) => r.some((c) => c.trim()))
  }, [tableRows, hasHeader])

  const nameCol = colRoles.indexOf('name')
  const validRows = useMemo(
    () => dataRows.filter((r) => (r[nameCol] ?? '').trim()),
    [dataRows, nameCol],
  )
  const skipped = dataRows.length - validRows.length
  const boxes = boxesQuery.data ?? []
  const canSubmit =
    validRows.length > 0 && boxId != null && !batchMut.isPending && validRows.length <= 96

  const setRole = (col: number, role: ColRole) => {
    setColRoles((rs) => {
      const next = [...rs]
      // 单值角色唯一：把其他列的同角色清成忽略
      if (role !== 'skip') {
        for (let i = 0; i < next.length; i++) if (next[i] === role) next[i] = 'skip'
      }
      next[col] = role
      return next
    })
  }

  const submit = async () => {
    if (!canSubmit || boxId == null) return
    const roleOf = (r: string[], role: ColRole) => {
      const i = colRoles.indexOf(role)
      return i >= 0 ? (r[i] ?? '').trim() : ''
    }
    const rows = validRows.map((r) => {
      const dateRaw = roleOf(r, 'date')
      return {
        name: roleOf(r, 'name'),
        type: normalizeType(roleOf(r, 'type')),
        concentration: roleOf(r, 'conc') || undefined,
        volume: roleOf(r, 'vol') || undefined,
        sampleDate: normalizeDate(dateRaw) ?? (dateRaw ? null : (defaultDate ?? null)),
      }
    })
    try {
      const rid = await ensureRecordId()
      const res = await batchMut.mutateAsync({ boxId, recordId: rid, rows })
      await utils.sample.listBoxes.invalidate()
      setDone(res)
      if (skipped > 0) toast.warning(`已跳过 ${skipped} 行（名称为空）`)
    } catch (e) {
      toast.error(`入库失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">表格转样本入库</DialogTitle>
          <DialogDescription className="text-[13px]">
            把正文表格解析为样本，按 A1 → A2 … 顺序自动分配孔位并关联本记录。
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-2">
            <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <Database className="h-4 w-4 text-bench" />
              已入库 {done.created.length} 个样本 → {done.boxName}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {done.created.map((c) => (
                <span
                  key={c.id}
                  className="rounded-md border border-bench/40 bg-bench-wash px-2 py-0.5 font-mono text-[11.5px] text-bench-deep"
                >
                  {c.well} · {c.name}
                </span>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white hover:bg-bench-deep"
              >
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 表头开关 + 行数 */}
            <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-soft">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="h-3.5 w-3.5 accent-bench"
                />
                首行是表头
              </label>
              <span className="text-ink-mute">
                共 {dataRows.length} 行数据{skipped > 0 ? `，${skipped} 行名称为空将跳过` : ''}
                {validRows.length > 96 ? '（超出单批 96 上限）' : ''}
              </span>
            </div>

            {/* 列映射 + 预览 */}
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 bg-paper">
                  <tr>
                    {Array.from({ length: cols }, (_, i) => (
                      <th key={i} className="border-b border-line px-2 py-1.5 text-left font-normal">
                        <select
                          value={colRoles[i] ?? 'skip'}
                          onChange={(e) => setRole(i, e.target.value as ColRole)}
                          className={cn(
                            'h-7 rounded-md border border-line bg-surface px-1.5 text-[12px] outline-none focus:border-bench',
                            colRoles[i] === 'name' && 'border-bench text-bench-deep',
                          )}
                        >
                          {(Object.keys(ROLE_LABEL) as ColRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(hasHeader ? tableRows.slice(0, 1) : []).map((r, ri) => (
                    <tr key={`h${ri}`} className="bg-paper/60">
                      {Array.from({ length: cols }, (_, i) => (
                        <td key={i} className="border-b border-line-soft px-2 py-1 font-medium text-ink-mute">
                          {r[i] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {dataRows.slice(0, 6).map((r, ri) => (
                    <tr key={ri} className={cn(!(r[nameCol] ?? '').trim() && 'opacity-40')}>
                      {Array.from({ length: cols }, (_, i) => (
                        <td key={i} className="border-b border-line-soft px-2 py-1 text-ink">
                          {r[i] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {dataRows.length > 6 && (
                    <tr>
                      <td colSpan={cols} className="px-2 py-1 text-center text-[11.5px] text-ink-mute">
                        … 共 {dataRows.length} 行
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 目标盒子 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ink-soft">目标冻存盒</span>
              {boxesQuery.isLoading ? (
                <span className="text-[12px] text-ink-mute">加载中…</span>
              ) : boxes.length === 0 ? (
                <span className="text-[12px] text-warning">还没有冻存盒，请先到「样本库」新建</span>
              ) : (
                <select
                  value={boxId ?? ''}
                  onChange={(e) => setBoxId(e.target.value ? Number(e.target.value) : null)}
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-bench"
                >
                  <option value="">选择盒子…</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.location ? `（${b.location}）` : ''} · 空位 {b.capacity - b.occupied}/{b.capacity}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink-soft hover:text-ink"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white transition-colors hover:bg-bench-deep disabled:opacity-50"
              >
                {batchMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                入库 {validRows.length > 0 ? `${validRows.length} 个样本` : ''}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
