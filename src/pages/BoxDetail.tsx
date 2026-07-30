import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, MapPin, Pencil, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { SAMPLE_TYPES, TYPE_COLOR, wellLabel } from '@/components/samples/sample-meta'

type Well = {
  id: number
  row: number
  col: number
  name: string
  type: string
  concentration: string | null
  volume: string | null
  sampleDate: string | null
  notes: string | null
  recordId: number | null
  recordTitle: string | null
}

/* ------------------------------------------------------------------ */
/* 孔位编辑对话框                                                        */
/* ------------------------------------------------------------------ */
function WellDialog({
  boxId,
  wellPos,
  existing,
  onClose,
}: {
  boxId: number
  wellPos: { row: number; col: number } | null
  existing: Well | null
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('DNA')
  const [concentration, setConcentration] = useState('')
  const [volume, setVolume] = useState('')
  const [sampleDate, setSampleDate] = useState('')
  const [notes, setNotes] = useState('')
  const [recordId, setRecordId] = useState<number | null>(null)

  useEffect(() => {
    if (wellPos) {
      setName(existing?.name ?? '')
      setType(existing?.type ?? 'DNA')
      setConcentration(existing?.concentration ?? '')
      setVolume(existing?.volume ?? '')
      setSampleDate(existing?.sampleDate ?? '')
      setNotes(existing?.notes ?? '')
      setRecordId(existing?.recordId ?? null)
    }
  }, [wellPos, existing])

  const recordsQ = trpc.record.list.useQuery(undefined, { enabled: wellPos != null })
  const recordOptions = useMemo(() => (recordsQ.data ?? []).slice(0, 30), [recordsQ.data])

  const saveMut = trpc.sample.setSample.useMutation({
    onSuccess: () => {
      toast.success(existing ? '样本已更新' : '样本已存入')
      void utils.sample.getBox.invalidate()
      void utils.sample.listBoxes.invalidate()
      onClose()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const clearMut = trpc.sample.clearSlot.useMutation({
    onSuccess: () => {
      toast.success('孔位已清空')
      void utils.sample.getBox.invalidate()
      void utils.sample.listBoxes.invalidate()
      onClose()
    },
    onError: (e) => toast.error(`清空失败：${e.message}`),
  })

  if (!wellPos) return null
  const coord = wellLabel(wellPos.row, wellPos.col)

  const inputCls =
    'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-bench'

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-display text-[16px]">
            <span
              className="flex h-9 w-12 items-center justify-center rounded-lg font-mono text-[14px] font-bold text-white"
              style={{ backgroundColor: TYPE_COLOR[type] ?? '#8A9099' }}
            >
              {coord}
            </span>
            {existing ? '编辑样本' : '存入样本'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">样本名称 NAME</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：pX459-v2 克隆 #3、小鼠 12 肝组织"
              className={inputCls}
            />
          </label>

          <div>
            <span className="caption-en mb-1.5 block">类型 TYPE</span>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150',
                    type === t ? 'text-white' : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                  style={type === t ? { backgroundColor: TYPE_COLOR[t], borderColor: TYPE_COLOR[t] } : undefined}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">浓度</span>
              <input value={concentration} onChange={(e) => setConcentration(e.target.value)} placeholder="56 ng/µL" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">体积</span>
              <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="200 µL" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">存入日期</span>
              <input type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} className={inputCls} />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="caption-en">备注 NOTES</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="来源、代次、实验批号…"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[13.5px] leading-[20px] text-ink outline-none transition-colors focus:border-bench"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="caption-en">关联实验记录</span>
            <div className="flex items-center gap-2">
              <select
                value={recordId ?? ''}
                onChange={(e) => setRecordId(e.target.value === '' ? null : Number(e.target.value))}
                className={cn(inputCls, 'flex-1 appearance-none')}
              >
                <option value="">不关联</option>
                {recordOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.recordDate} · {r.title}
                  </option>
                ))}
                {recordId != null && !recordOptions.some((r) => r.id === recordId) && (
                  <option value={recordId}>{existing?.recordTitle ?? `记录 #${recordId}`}</option>
                )}
              </select>
              {recordId != null && (
                <Link
                  to={`/records/${recordId}`}
                  className="flex h-10 shrink-0 items-center rounded-lg border border-line px-2.5 text-[12px] font-medium text-bench transition-colors hover:bg-bench-wash"
                >
                  查看
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {existing && (
            <button
              type="button"
              disabled={clearMut.isPending}
              onClick={() => clearMut.mutate({ boxId, row: wellPos.row, col: wellPos.col })}
              className="flex h-9 items-center rounded-lg border border-danger/40 px-3 text-[12.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/10 disabled:opacity-50"
            >
              清空孔位
            </button>
          )}
          <button
            type="button"
            disabled={saveMut.isPending || name.trim() === ''}
            onClick={() =>
              saveMut.mutate({
                boxId,
                row: wellPos.row,
                col: wellPos.col,
                name: name.trim(),
                type: type as (typeof SAMPLE_TYPES)[number],
                concentration: concentration.trim() || undefined,
                volume: volume.trim() || undefined,
                sampleDate: sampleDate || undefined,
                notes: notes.trim() || undefined,
                recordId,
              })
            }
            className="ml-auto flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {saveMut.isPending ? '保存中…' : existing ? '保存修改' : '存入'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Page：96 孔网格                                                        */
/* ------------------------------------------------------------------ */
export default function BoxDetail() {
  const { boxId: boxIdParam } = useParams()
  const boxId = Number(boxIdParam)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const boxQ = trpc.sample.getBox.useQuery({ id: boxId }, { enabled: Number.isFinite(boxId) })
  const [q, setQ] = useState('')
  const [wellPos, setWellPos] = useState<{ row: number; col: number } | null>(null)
  const [editMeta, setEditMeta] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const box = boxQ.data
  const wells = useMemo(() => (box?.wells ?? []) as Well[], [box])
  const wellMap = useMemo(() => new Map(wells.map((w) => [`${w.row}-${w.col}`, w] as const)), [wells])

  useEffect(() => {
    if (box) {
      setName(box.name)
      setLocation(box.location ?? '')
    }
  }, [box?.id])

  const renameMut = trpc.sample.renameBox.useMutation({
    onSuccess: () => {
      toast.success('盒子信息已更新')
      setEditMeta(false)
      void utils.sample.getBox.invalidate()
      void utils.sample.listBoxes.invalidate()
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  })
  const removeMut = trpc.sample.removeBox.useMutation({
    onSuccess: () => {
      toast.success('盒子已删除')
      navigate('/samples')
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  if (boxQ.isLoading) {
    return <p className="py-16 text-center text-[12.5px] text-ink-mute">载入中…</p>
  }
  if (!box) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-[13px] text-ink-mute">盒子不存在或已被删除</p>
        <Link to="/samples" className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white">
          返回样本库
        </Link>
      </div>
    )
  }

  const needle = q.trim().toLowerCase()
  const matchOf = (w: Well | undefined) =>
    !needle ||
    (w != null &&
      [w.name, w.notes ?? '', w.concentration ?? '', w.type].join('\n').toLowerCase().includes(needle))

  const occupied = wells.length
  const capacity = box.rows * box.cols
  const selected = wellPos ? (wellMap.get(`${wellPos.row}-${wellPos.col}`) ?? null) : null

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Toaster position="top-right" />

      {/* 头部 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/samples"
          aria-label="返回样本库"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          {editMeta ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-[14px] font-semibold text-ink outline-none focus:border-bench"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="存放位置（可选）"
                className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-bench"
              />
              <button
                type="button"
                disabled={renameMut.isPending || name.trim() === ''}
                onClick={() => renameMut.mutate({ id: boxId, name: name.trim(), location: location.trim() })}
                className="h-9 rounded-lg bg-bench px-3 text-[12.5px] font-medium text-white disabled:opacity-50"
              >
                保存
              </button>
              <button type="button" onClick={() => setEditMeta(false)} className="h-9 px-2 text-[12.5px] text-ink-mute">
                取消
              </button>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 font-display text-[20px] font-bold leading-[28px] text-ink">
                <span className="truncate">{box.name}</span>
                <button
                  type="button"
                  aria-label="编辑盒子信息"
                  onClick={() => setEditMeta(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-surface hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-mute">
                {box.location && (
                  <>
                    <MapPin className="h-3 w-3" />
                    {box.location} ·
                  </>
                )}
                {occupied}/{capacity} 孔已用 · {box.rows}×{box.cols}
              </p>
            </>
          )}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="盒内定位样本…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-bench"
          />
        </div>
        <button
          type="button"
          aria-label="删除盒子"
          onClick={() => setDeleteOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-mute transition-colors hover:border-danger/40 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* 图例 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {SAMPLE_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1 text-[11px] text-ink-mute">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLOR[t] }} />
            {t}
          </span>
        ))}
      </div>

      {/* 网格（移动端横向滚动） */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface p-3 shadow-card">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `28px repeat(${box.cols}, minmax(46px, 1fr))`, minWidth: `${box.cols * 50 + 28}px` }}
        >
          {/* 列头 */}
          <div />
          {Array.from({ length: box.cols }, (_, c) => (
            <div key={c} className="pb-1 text-center font-mono text-[11px] font-medium text-ink-mute">
              {c + 1}
            </div>
          ))}
          {/* 行 */}
          {Array.from({ length: box.rows }, (_, r) => (
            <div key={r} className="contents">
              <div className="flex items-center justify-center font-mono text-[11px] font-medium text-ink-mute">
                {String.fromCharCode(65 + r)}
              </div>
              {Array.from({ length: box.cols }, (_, c) => {
                const w = wellMap.get(`${r}-${c}`)
                const dim = needle && !matchOf(w)
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setWellPos({ row: r, col: c })}
                    title={w ? `${wellLabel(r, c)} · ${w.name}（${w.type}）${w.recordTitle ? `\n关联记录：${w.recordTitle}` : ''}` : `${wellLabel(r, c)} 空孔`}
                    className={cn(
                      'relative flex h-11 items-center justify-center rounded-md border text-[11px] font-semibold transition-all duration-150',
                      w
                        ? 'border-transparent text-white shadow-sm hover:scale-[1.06]'
                        : 'border-dashed border-line-strong bg-paper text-ink-mute hover:border-bench hover:bg-bench-wash/40',
                      dim && 'opacity-20',
                      needle && w && matchOf(w) && 'ring-2 ring-bench ring-offset-1',
                    )}
                    style={w ? { backgroundColor: TYPE_COLOR[w.type] ?? '#8A9099' } : undefined}
                  >
                    {w ? w.name.slice(0, 3) : ''}
                    {w?.recordId != null && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/90 ring-1 ring-black/10" aria-label="已关联实验记录" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-ink-mute">
        点击孔位存入或编辑样本；孔内显示样本名前 3 字，悬停可见完整信息。
      </p>

      <WellDialog boxId={boxId} wellPos={wellPos} existing={selected} onClose={() => setWellPos(null)} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除盒子「{box.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              盒内 {occupied} 份样本记录将一并删除，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMut.mutate({ id: boxId })}
              className="bg-danger text-white hover:bg-danger/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
