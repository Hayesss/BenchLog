import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import {
  AlertTriangle,
  Baby,
  Check,
  ClipboardList,
  FlaskConical,
  Layers,
  LayoutGrid,
  Minus,
  Pencil,
  Plus,
  Rat,
  Search,
  Table2,
  Trash2,
} from 'lucide-react'
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
import { GENDER_META, MOUSE_STATUS, SOURCES, ageLabel } from '@/components/mice/mouse-meta'

type StrainRow = {
  id: number
  name: string
  background: string | null
  genotypeDesc: string | null
  maintenance: string | null
  color: string
  lowStockThreshold: number
  alive: number
  male: number
  female: number
  unknownGender: number
  ungenotyped: number
  alert: boolean
}

type MouseRow = {
  id: number
  strainId: number
  earNo: string
  gender: string
  birthDate: string | null
  genotype: string | null
  cageId: number | null
  source: string | null
  status: string
  statusDate: string | null
  statusReason: string | null
  notes: string | null
  strainName?: string | null
  cageNo?: string | null
}

const STRAIN_COLORS = ['#3E7C6B', '#5B7C99', '#B08D57', '#B0707C', '#8A7CA8', '#7C9161', '#B98A3E', '#8A9099']

const inputCls =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors focus:border-bench'

/* ------------------------------------------------------------------ */
/* 品系编辑对话框（新建/编辑共用）                                         */
/* ------------------------------------------------------------------ */
function StrainDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: StrainRow | null
}) {
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const [background, setBackground] = useState('')
  const [genotypeDesc, setGenotypeDesc] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const [color, setColor] = useState(STRAIN_COLORS[0])
  const [threshold, setThreshold] = useState('0')

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '')
      setBackground(existing?.background ?? '')
      setGenotypeDesc(existing?.genotypeDesc ?? '')
      setMaintenance(existing?.maintenance ?? '')
      setColor(existing?.color ?? STRAIN_COLORS[0])
      setThreshold(String(existing?.lowStockThreshold ?? 0))
    }
  }, [open, existing])

  const done = {
    onSuccess: () => {
      toast.success(existing ? '品系已更新' : '品系已创建')
      void utils.mouse.listStrains.invalidate()
      void utils.mouse.overview.invalidate()
      void utils.mouse.taskSuggestions.invalidate()
      onOpenChange(false)
    },
    onError: (e: { message: string }) => toast.error(`保存失败：${e.message}`),
  }
  const createMut = trpc.mouse.createStrain.useMutation(done)
  const updateMut = trpc.mouse.updateStrain.useMutation(done)

  const submit = () => {
    const body = {
      name: name.trim(),
      background: background.trim() || undefined,
      genotypeDesc: genotypeDesc.trim() || undefined,
      maintenance: maintenance.trim() || undefined,
      color,
      lowStockThreshold: Math.max(0, Number(threshold) || 0),
    }
    if (existing) updateMut.mutate({ id: existing.id, ...body })
    else createMut.mutate(body)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">{existing ? '编辑品系' : '新建品系'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">品系名称 NAME</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="如：APP/PS1、Rag1-/-、C57BL/6J" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">遗传背景</span>
              <input value={background} onChange={(e) => setBackground(e.target.value)} placeholder="C57BL/6J" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">维护方式</span>
              <input value={maintenance} onChange={(e) => setMaintenance(e.target.value)} placeholder="自繁 / 冷冻 / 购入" className={inputCls} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="caption-en">基因型说明</span>
            <input value={genotypeDesc} onChange={(e) => setGenotypeDesc(e.target.value)} placeholder="如：APPswe/PSEN1dE9 双转基因" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="caption-en mb-1.5 block">标识色</span>
              <div className="flex flex-wrap gap-1.5">
                {STRAIN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`颜色 ${c}`}
                    onClick={() => setColor(c)}
                    className={cn('h-7 w-7 rounded-full transition-transform duration-150 active:scale-90', color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">库存预警阈值</span>
              <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputCls} />
              <span className="text-[11px] text-ink-mute">存活数低于此值时预警，0 = 不预警</span>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={createMut.isPending || updateMut.isPending || name.trim() === ''}
            onClick={submit}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {createMut.isPending || updateMut.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* 个体登记/编辑对话框                                                    */
/* ------------------------------------------------------------------ */
function MouseDialog({
  open,
  onOpenChange,
  strains,
  existing,
  defaultStrainId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  strains: StrainRow[]
  existing: MouseRow | null
  defaultStrainId: number | null
}) {
  const utils = trpc.useUtils()
  const cagesQ = trpc.mouse.listCages.useQuery(undefined, { enabled: open })
  const [strainId, setStrainId] = useState<number | null>(null)
  const [earNo, setEarNo] = useState('')
  const [gender, setGender] = useState<string>('unknown')
  const [birthDate, setBirthDate] = useState('')
  const [genotype, setGenotype] = useState('')
  const [cageId, setCageId] = useState<number | null>(null)
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setStrainId(existing?.strainId ?? defaultStrainId ?? strains[0]?.id ?? null)
      setEarNo(existing?.earNo ?? '')
      setGender(existing?.gender ?? 'unknown')
      setBirthDate(existing?.birthDate ?? '')
      setGenotype(existing?.genotype ?? '')
      setCageId(existing?.cageId ?? null)
      setSource(existing?.source ?? '')
      setNotes(existing?.notes ?? '')
    }
  }, [open, existing, defaultStrainId, strains])

  const done = {
    onSuccess: () => {
      toast.success(existing ? '小鼠已更新' : '小鼠已登记')
      void utils.mouse.listMice.invalidate()
      void utils.mouse.listStrains.invalidate()
      void utils.mouse.listCages.invalidate()
      void utils.mouse.overview.invalidate()
      void utils.mouse.taskSuggestions.invalidate()
      onOpenChange(false)
    },
    onError: (e: { message: string }) => toast.error(`保存失败：${e.message}`),
  }
  const createMut = trpc.mouse.createMouse.useMutation(done)
  const updateMut = trpc.mouse.updateMouse.useMutation(done)

  const submit = () => {
    if (strainId == null || earNo.trim() === '') return
    const body = {
      strainId,
      earNo: earNo.trim(),
      gender: gender as 'male' | 'female' | 'unknown',
      birthDate: birthDate || undefined,
      genotype: genotype.trim() || undefined,
      cageId: cageId ?? undefined,
      source: source || undefined,
      notes: notes.trim() || undefined,
    }
    if (existing) updateMut.mutate({ id: existing.id, ...body })
    else createMut.mutate(body)
  }

  const cages = cagesQ.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">{existing ? `编辑小鼠 #${existing.earNo}` : '登记小鼠'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <span className="caption-en mb-1.5 block">品系 STRAIN</span>
            <div className="flex flex-wrap gap-1.5">
              {strains.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStrainId(s.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150',
                    strainId === s.id ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">编号 / 耳号</span>
              <input autoFocus value={earNo} onChange={(e) => setEarNo(e.target.value)} placeholder="手动输入" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">出生日期</span>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="caption-en mb-1.5 block">性别</span>
              <div className="flex gap-1.5">
                {(['male', 'female', 'unknown'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center rounded-lg border text-[12.5px] font-medium transition-colors duration-150',
                      gender === g ? 'text-white' : 'border-line text-ink-soft hover:border-line-strong',
                    )}
                    style={gender === g ? { backgroundColor: GENDER_META[g].color, borderColor: GENDER_META[g].color } : undefined}
                  >
                    {GENDER_META[g].short} {GENDER_META[g].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">基因型</span>
              <input value={genotype} onChange={(e) => setGenotype(e.target.value)} placeholder="+/+、+/-、Tg+（留空=未鉴定）" className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">笼位</span>
              <select
                value={cageId ?? ''}
                onChange={(e) => setCageId(e.target.value === '' ? null : Number(e.target.value))}
                className={inputCls}
              >
                <option value="">未分配</option>
                {cages.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cageNo}{c.room ? `（${c.room}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="caption-en mb-1.5 block">来源</span>
              <div className="flex gap-1.5">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(source === s ? '' : s)}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center rounded-lg border text-[12.5px] font-medium transition-colors duration-150',
                      source === s ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line text-ink-soft hover:border-line-strong',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="caption-en">备注</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="剪趾编号、特殊标记…" className={inputCls} />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={createMut.isPending || updateMut.isPending || strainId == null || earNo.trim() === ''}
            onClick={submit}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {createMut.isPending || updateMut.isPending ? '保存中…' : existing ? '保存修改' : '登记'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* 按数量批量登记对话框（公 X 只 / 母 Y 只，耳号自动连号）                     */
/* ------------------------------------------------------------------ */
function QtyStepper({
  label,
  color,
  value,
  onChange,
}: {
  label: string
  color: string
  value: number
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(0, Math.min(200, Number.isFinite(n) ? n : 0))
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label}减一`}
          disabled={value <= 0}
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-paper disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          min={0}
          max={200}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="h-8 w-14 rounded-md border border-line bg-paper text-center font-mono text-[13px] font-semibold text-ink outline-none focus:border-bench"
        />
        <button
          type="button"
          aria-label={`${label}加一`}
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:bg-paper"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function BatchMouseDialog({
  open,
  onOpenChange,
  strains,
  defaultStrainId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  strains: StrainRow[]
  defaultStrainId: number | null
}) {
  const utils = trpc.useUtils()
  const cagesQ = trpc.mouse.listCages.useQuery(undefined, { enabled: open })
  const [strainId, setStrainId] = useState<number | null>(null)
  const [male, setMale] = useState(0)
  const [female, setFemale] = useState(0)
  const [prefix, setPrefix] = useState('')
  const [start, setStart] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [genotype, setGenotype] = useState('')
  const [cageId, setCageId] = useState<number | null>(null)
  const [source, setSource] = useState('')

  useEffect(() => {
    if (open) {
      setStrainId(defaultStrainId ?? strains[0]?.id ?? null)
      setMale(0)
      setFemale(0)
      setPrefix('')
      setStart('')
      setBirthDate('')
      setGenotype('')
      setCageId(null)
      setSource('')
    }
  }, [open, defaultStrainId, strains])

  const batchMut = trpc.mouse.batchCreateMice.useMutation({
    onSuccess: (r) => {
      const fmt = (arr: string[]) => (arr.length > 3 ? `${arr[0]}…${arr[arr.length - 1]}` : arr.join('、'))
      const parts = [
        r.maleEarNos.length ? `公 ${r.maleEarNos.length} 只（${fmt(r.maleEarNos)}）` : '',
        r.femaleEarNos.length ? `母 ${r.femaleEarNos.length} 只（${fmt(r.femaleEarNos)}）` : '',
      ].filter(Boolean)
      toast.success(`已批量登记 ${r.created} 只：${parts.join('，')}`)
      void utils.mouse.listMice.invalidate()
      void utils.mouse.listStrains.invalidate()
      void utils.mouse.listCages.invalidate()
      void utils.mouse.overview.invalidate()
      void utils.mouse.taskSuggestions.invalidate()
      onOpenChange(false)
    },
    onError: (e) => toast.error(`批量登记失败：${e.message}`),
  })

  const total = male + female
  const submit = () => {
    if (strainId == null || total <= 0) return
    batchMut.mutate({
      strainId,
      maleCount: male,
      femaleCount: female,
      earPrefix: prefix.trim() || undefined,
      earStart: start.trim() === '' ? undefined : Number(start),
      birthDate: birthDate || undefined,
      genotype: genotype.trim() || undefined,
      cageId: cageId ?? undefined,
      source: source || undefined,
    })
  }

  const cages = cagesQ.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">按数量批量登记</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <span className="caption-en mb-1.5 block">品系 STRAIN</span>
            <div className="flex flex-wrap gap-1.5">
              {strains.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStrainId(s.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150',
                    strainId === s.id ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <QtyStepper label="公 ♂" color={GENDER_META.male.color} value={male} onChange={setMale} />
            <QtyStepper label="母 ♀" color={GENDER_META.female.color} value={female} onChange={setFemale} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">编号前缀（可空）</span>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="如 C57-" className={cn(inputCls, 'font-mono')} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">起始编号</span>
              <input type="number" min={1} value={start} onChange={(e) => setStart(e.target.value)} placeholder="留空自动接续" className={cn(inputCls, 'font-mono')} />
            </label>
          </div>
          <p className="-mt-1 text-[11.5px] leading-[17px] text-ink-mute">
            耳号按「前缀 + 数字」自动连号生成，自动跳过该品系下已占用的编号；登记后可逐只编辑改号。
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">出生日期</span>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">基因型</span>
              <input value={genotype} onChange={(e) => setGenotype(e.target.value)} placeholder="留空=未鉴定" className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">笼位</span>
              <select
                value={cageId ?? ''}
                onChange={(e) => setCageId(e.target.value === '' ? null : Number(e.target.value))}
                className={inputCls}
              >
                <option value="">未分配</option>
                {cages.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cageNo}{c.room ? `（${c.room}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="caption-en mb-1.5 block">来源</span>
              <div className="flex gap-1.5">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(source === s ? '' : s)}
                    className={cn(
                      'flex h-9 flex-1 items-center justify-center rounded-lg border text-[12.5px] font-medium transition-colors duration-150',
                      source === s ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line text-ink-soft hover:border-line-strong',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {total > 0 && (
            <p className="rounded-lg bg-bench-wash/60 px-3 py-2 text-[12.5px] leading-[18px] text-bench-ink">
              将登记 <b>{total}</b> 只（公 {male} · 母 {female}），编号 {prefix || '（无前缀）'}
              {start.trim() || '自动'} 起连号。
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={batchMut.isPending || strainId == null || total <= 0}
            onClick={submit}
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {batchMut.isPending ? '登记中…' : `批量登记 ${total > 0 ? total : ''} 只`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* 状态流转对话框（处死/死亡/淘汰/恢复存活）                                */
/* ------------------------------------------------------------------ */
function StatusDialog({
  mouse,
  onClose,
}: {
  mouse: MouseRow | null
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [status, setStatus] = useState<string>('sacrificed')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (mouse) {
      setStatus(mouse.status === 'alive' ? 'sacrificed' : 'alive')
      setDate(new Date().toISOString().slice(0, 10))
      setReason('')
    }
  }, [mouse])

  const mut = trpc.mouse.setStatus.useMutation({
    onSuccess: () => {
      toast.success('状态已更新')
      void utils.mouse.listMice.invalidate()
      void utils.mouse.listStrains.invalidate()
      void utils.mouse.listCages.invalidate()
      void utils.mouse.overview.invalidate()
      void utils.mouse.taskSuggestions.invalidate()
      onClose()
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  })

  if (!mouse) return null
  const options = mouse.status === 'alive'
    ? (['sacrificed', 'dead', 'culled'] as const)
    : (['alive'] as const)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">状态流转 · #{mouse.earNo}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1.5">
          {options.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'flex h-9 flex-1 items-center justify-center rounded-lg border text-[12.5px] font-medium transition-colors duration-150',
                status === s ? 'border-transparent text-white' : 'border-line text-ink-soft hover:border-line-strong',
              )}
              style={status === s ? { backgroundColor: MOUSE_STATUS[s].color } : undefined}
            >
              {s === 'alive' ? '恢复存活' : MOUSE_STATUS[s].label}
            </button>
          ))}
        </div>
        {status !== 'alive' && (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">日期</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">原因（可选）</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：实验终点、发现死亡" className={inputCls} />
            </label>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() =>
              mut.mutate({
                id: mouse.id,
                status: status as 'alive' | 'sacrificed' | 'dead' | 'culled',
                date: status !== 'alive' ? date || undefined : undefined,
                reason: status !== 'alive' && reason.trim() ? reason.trim() : undefined,
              })
            }
            className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {mut.isPending ? '更新中…' : '确认'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* 小鼠任务卡：系统建议（扩繁/鉴定/断奶）+ 今日小鼠待办                     */
/* 复用全局 todos（text 前缀【小鼠】），Dashboard 今日待办同步可见          */
/* ------------------------------------------------------------------ */
const MOUSE_TODO_PREFIX = '【小鼠】'

function MouseTasksCard() {
  const utils = trpc.useUtils()
  const today = format(new Date(), 'yyyy-MM-dd')
  const sugQ = trpc.mouse.taskSuggestions.useQuery()
  const todosQ = trpc.todo.listByRange.useQuery({ from: today, to: today })
  const [text, setText] = useState('')
  const [date, setDate] = useState(today)

  const invalidate = () => {
    void utils.todo.listByRange.invalidate()
    void utils.todo.today.invalidate()
  }
  const createMut = trpc.todo.create.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast.error(`添加失败：${e.message}`),
  })
  const toggleMut = trpc.todo.toggle.useMutation({ onSuccess: invalidate })

  const mouseTodos = (todosQ.data ?? []).filter((t) => t.text.startsWith(MOUSE_TODO_PREFIX))
  const pendingTexts = new Set(mouseTodos.filter((t) => !t.done).map((t) => t.text))
  const pendingCount = mouseTodos.filter((t) => !t.done).length
  const suggestions = sugQ.data ?? []

  const KIND_META = {
    alert: { icon: AlertTriangle, color: 'text-danger' },
    ungenotyped: { icon: FlaskConical, color: 'text-warning' },
    wean: { icon: Baby, color: 'text-info' },
  } as const

  const addSuggestion = (s: { text: string }) => {
    const full = `${MOUSE_TODO_PREFIX}${s.text}`.slice(0, 500)
    if (pendingTexts.has(full)) return
    createMut.mutate({ todoDate: today, text: full })
  }
  const addManual = () => {
    const t = text.trim()
    if (!t || !date) return
    createMut.mutate({ todoDate: date, text: `${MOUSE_TODO_PREFIX}${t}`.slice(0, 500) })
    setText('')
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="caption-en">小鼠任务 MOUSE TASKS</p>
        {pendingCount > 0 && <span className="text-[11.5px] text-ink-mute">今日 {pendingCount} 项待办</span>}
      </div>

      {/* 系统建议（实时从库存派生） */}
      {sugQ.isLoading ? (
        <p className="mt-2 text-[12px] text-ink-mute">分析库存中…</p>
      ) : suggestions.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {suggestions.map((s) => {
            const meta = KIND_META[s.kind as keyof typeof KIND_META] ?? { icon: ClipboardList, color: 'text-ink-mute' }
            const Icon = meta.icon
            const added = pendingTexts.has(`${MOUSE_TODO_PREFIX}${s.text}`)
            return (
              <div key={s.text} className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-2">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
                <span className="flex-1 text-[12.5px] leading-[18px] text-ink">{s.text}</span>
                <button
                  type="button"
                  disabled={added || createMut.isPending}
                  onClick={() => addSuggestion(s)}
                  className={cn(
                    'flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors',
                    added ? 'text-success' : 'bg-bench-wash text-bench-ink hover:bg-bench hover:text-white',
                  )}
                >
                  {added ? (
                    <>
                      <Check className="h-3 w-3" /> 已加入
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" /> 待办
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-mute">库存健康，暂无系统建议。</p>
      )}

      {/* 今日小鼠待办（勾选同步全局待办） */}
      {mouseTodos.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-line-soft pt-2.5">
          {mouseTodos.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-paper">
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => toggleMut.mutate({ id: t.id, done: e.target.checked })}
                className="h-3.5 w-3.5 shrink-0 accent-[#3E7C6B]"
              />
              <span className={cn('text-[12.5px] leading-[18px]', t.done ? 'text-ink-mute line-through' : 'text-ink')}>
                {t.text.slice(MOUSE_TODO_PREFIX.length)}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* 手动添加小鼠待办 */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line-soft pt-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          placeholder="添加小鼠待办，如：给 A 笼换垫料…"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-mute focus:border-bench"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="待办日期"
          className="h-8 w-[126px] shrink-0 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none focus:border-bench"
        />
        <button
          type="button"
          disabled={!text.trim() || createMut.isPending}
          onClick={addManual}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-bench px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-bench-deep disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> 添加
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 1：库存看板                                                        */
/* ------------------------------------------------------------------ */
function BoardTab({
  strains,
  onNewStrain,
  onEditStrain,
  onNewMouse,
  onBatchMouse,
}: {
  strains: StrainRow[]
  onNewStrain: () => void
  onEditStrain: (s: StrainRow) => void
  onNewMouse: (strainId: number) => void
  onBatchMouse: (strainId: number) => void
}) {
  const overviewQ = trpc.mouse.overview.useQuery()
  const ov = overviewQ.data

  const stats = [
    { label: '存活个体', value: ov?.aliveTotal ?? '—', sub: '全部品系' },
    { label: '品系', value: ov?.strainTotal ?? '—', sub: '维护中' },
    { label: '笼位', value: ov?.cageTotal ?? '—', sub: `占用 ${ov?.cageOccupied ?? '—'}` },
    { label: '扩繁预警', value: ov?.alerts.length ?? '—', sub: '品系', danger: (ov?.alerts.length ?? 0) > 0 },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="caption-en">{s.label}</p>
            <p className={cn('mt-1.5 font-display text-[26px] font-bold leading-[32px]', s.danger ? 'text-danger' : 'text-ink')}>
              {s.value}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-mute">{s.sub}</p>
          </div>
        ))}
      </div>

      {(ov?.alerts.length ?? 0) > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="text-[12.5px] leading-[19px] text-ink">
            <span className="font-medium text-danger">库存不足，建议安排扩繁：</span>
            {ov!.alerts.map((a) => `${a.name}（存活 ${a.alive}/${a.threshold}）`).join('、')}
          </div>
        </div>
      )}

      <MouseTasksCard />

      <div className="mb-2 mt-6 flex items-center justify-between">
        <p className="caption-en">品系库存 STRAINS</p>
        <button
          type="button"
          onClick={onNewStrain}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-bench transition-colors hover:bg-bench-wash"
        >
          <Plus className="h-3.5 w-3.5" /> 新建品系
        </button>
      </div>

      {strains.length === 0 ? (
        <button
          type="button"
          onClick={onNewStrain}
          className="flex w-full flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong py-12 transition-colors duration-150 hover:border-bench hover:bg-bench-wash/30"
        >
          <Rat className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
          <p className="text-[13px] text-ink-mute">还没有品系 — 点击新建第一个品系</p>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {strains.map((s) => (
            <div key={s.id} className={cn('rounded-xl border bg-surface p-4 shadow-card', s.alert ? 'border-danger/40' : 'border-line')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.name}</span>
                    {s.alert && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" />}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-mute">
                    {[s.background, s.maintenance, s.genotypeDesc].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="编辑品系"
                  onClick={() => onEditStrain(s)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-paper hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-display text-[24px] font-bold leading-[28px] text-ink">{s.alive}</span>
                <span className="text-[11.5px] text-ink-mute">
                  <span style={{ color: GENDER_META.male.color }}>♂ {s.male}</span>
                  {' · '}
                  <span style={{ color: GENDER_META.female.color }}>♀ {s.female}</span>
                  {s.unknownGender > 0 && ` · 未知 ${s.unknownGender}`}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={cn('text-[11.5px]', s.ungenotyped > 0 ? 'text-warning' : 'text-ink-mute')}>
                  {s.ungenotyped > 0 ? `未鉴定 ${s.ungenotyped} 只` : '基因型已鉴定完'}
                  {s.lowStockThreshold > 0 && ` · 阈值 ${s.lowStockThreshold}`}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${s.name} 按数量批量登记`}
                    onClick={() => onBatchMouse(s.id)}
                    className="flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[12px] font-medium text-ink-soft transition-colors hover:border-bench hover:text-bench"
                  >
                    <Layers className="h-3 w-3" /> 批量
                  </button>
                  <button
                    type="button"
                    onClick={() => onNewMouse(s.id)}
                    className="flex h-7 items-center gap-1 rounded-md bg-bench-wash px-2 text-[12px] font-medium text-bench-ink transition-colors hover:bg-bench hover:text-white"
                  >
                    <Plus className="h-3 w-3" /> 登记
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 2：个体台账                                                        */
/* ------------------------------------------------------------------ */
function MiceTab({
  strains,
  onNewMouse,
  onBatchMouse,
  onEditMouse,
  onStatusMouse,
  onAskRemove,
}: {
  strains: StrainRow[]
  onNewMouse: () => void
  onBatchMouse: () => void
  onEditMouse: (m: MouseRow) => void
  onStatusMouse: (m: MouseRow) => void
  onAskRemove: (m: MouseRow) => void
}) {
  const [strainId, setStrainId] = useState<number | null>(null)
  const [gender, setGender] = useState<string>('all')
  const [status, setStatus] = useState<string>('alive')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [q, setQ] = useState('')

  const listQ = trpc.mouse.listMice.useQuery({
    strainId: strainId ?? undefined,
    gender: gender as 'male' | 'female' | 'unknown' | 'all',
    status: status as 'alive' | 'sacrificed' | 'dead' | 'culled' | 'all',
    q: q.trim() || undefined,
    minAgeWeeks: minAge === '' ? undefined : Number(minAge),
    maxAgeWeeks: maxAge === '' ? undefined : Number(maxAge),
  })
  const rows = (listQ.data ?? []) as MouseRow[]

  return (
    <div>
      {/* 筛选条 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStrainId(null)}
            className={cn('h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors', strainId === null ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:border-line-strong')}
          >
            全部品系
          </button>
          {strains.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStrainId(s.id)}
              className={cn('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors', strainId === s.id ? 'border-bench bg-bench-wash text-bench-ink' : 'border-line text-ink-soft hover:border-line-strong')}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-full border border-line bg-surface p-0.5">
          {(['all', 'male', 'female', 'unknown'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={cn('h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors', gender === g ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink')}
            >
              {g === 'all' ? '全部' : GENDER_META[g].short}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-full border border-line bg-surface p-0.5">
          {(['alive', 'all', 'sacrificed', 'dead', 'culled'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn('h-7 rounded-full px-2.5 text-[12px] font-medium transition-colors', status === s ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink')}
            >
              {s === 'all' ? '全部状态' : MOUSE_STATUS[s].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[12px] text-ink-mute">
          <input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="最小" className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-bench" />
          <span>周龄至</span>
          <input type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="最大" className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-bench" />
          <span>周</span>
        </div>
        <div className="relative min-w-[160px] flex-1 sm:max-w-56">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜编号/基因型/备注…" className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-[12.5px] text-ink outline-none focus:border-bench" />
        </div>
        <button
          type="button"
          onClick={onBatchMouse}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-bench hover:text-bench"
        >
          <Layers className="h-4 w-4" /> 按数量
        </button>
        <button
          type="button"
          onClick={onNewMouse}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-bench px-3.5 text-[12.5px] font-medium text-white shadow-card transition-colors hover:bg-bench-deep"
        >
          <Plus className="h-4 w-4" /> 登记小鼠
        </button>
      </div>

      {/* 表格（桌面）/ 卡片（移动） */}
      {listQ.isLoading ? (
        <p className="py-12 text-center text-[12.5px] text-ink-mute">载入中…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong py-12">
          <Rat className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
          <p className="text-[13px] text-ink-mute">没有符合条件的小鼠</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] text-ink-mute">
                  <th className="px-4 py-2.5 font-medium">编号</th>
                  <th className="px-3 py-2.5 font-medium">品系</th>
                  <th className="px-3 py-2.5 font-medium">性别</th>
                  <th className="px-3 py-2.5 font-medium">日龄</th>
                  <th className="px-3 py-2.5 font-medium">基因型</th>
                  <th className="px-3 py-2.5 font-medium">笼位</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">备注</th>
                  <th className="px-3 py-2.5 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const g = GENDER_META[m.gender] ?? GENDER_META.unknown
                  const st = MOUSE_STATUS[m.status] ?? MOUSE_STATUS.alive
                  return (
                    <tr key={m.id} className="border-b border-line-soft transition-colors last:border-0 hover:bg-paper/60">
                      <td className="px-4 py-2.5 font-mono font-semibold text-ink">#{m.earNo}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{m.strainName}</td>
                      <td className="px-3 py-2.5"><span style={{ color: g.color }}>{g.short} {g.label}</span></td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{ageLabel(m.birthDate)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{m.genotype ?? <span className="text-warning">未鉴定</span>}</td>
                      <td className="px-3 py-2.5 text-ink-soft">{m.cageNo ?? '—'}</td>
                      <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', st.chip)}>{st.label}</span></td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-ink-mute">{m.notes ?? ''}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => onStatusMouse(m)} className="h-7 rounded-md px-2 text-[12px] text-ink-soft transition-colors hover:bg-bench-wash hover:text-ink">状态</button>
                          <button type="button" aria-label="编辑" onClick={() => onEditMouse(m)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-bench-wash hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label="删除" onClick={() => onAskRemove(m)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((m) => {
              const g = GENDER_META[m.gender] ?? GENDER_META.unknown
              const st = MOUSE_STATUS[m.status] ?? MOUSE_STATUS.alive
              return (
                <div key={m.id} className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[15px] font-bold text-ink">#{m.earNo}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', st.chip)}>{st.label}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-soft">
                    {m.strainName} · <span style={{ color: g.color }}>{g.short}{g.label}</span> · {ageLabel(m.birthDate)}
                    {' · '}<span className="font-mono">{m.genotype ?? '未鉴定'}</span>
                    {m.cageNo && ` · ${m.cageNo}`}
                  </p>
                  {m.notes && <p className="mt-1 truncate text-[11.5px] text-ink-mute">{m.notes}</p>}
                  <div className="mt-2.5 flex gap-1.5">
                    <button type="button" onClick={() => onStatusMouse(m)} className="flex h-8 flex-1 items-center justify-center rounded-lg border border-line text-[12px] font-medium text-ink-soft">状态流转</button>
                    <button type="button" onClick={() => onEditMouse(m)} className="flex h-8 flex-1 items-center justify-center rounded-lg border border-line text-[12px] font-medium text-ink-soft">编辑</button>
                    <button type="button" aria-label="删除" onClick={() => onAskRemove(m)} className="flex h-8 w-9 items-center justify-center rounded-lg border border-line text-ink-mute hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 3：笼位                                                           */
/* ------------------------------------------------------------------ */
function CagesTab() {
  const utils = trpc.useUtils()
  const cagesQ = trpc.mouse.listCages.useQuery()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cageNo, setCageNo] = useState('')
  const [room, setRoom] = useState('')
  const [rack, setRack] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)

  const createMut = trpc.mouse.createCage.useMutation({
    onSuccess: () => {
      toast.success('笼位已创建')
      setCageNo('')
      setRoom('')
      setRack('')
      setDialogOpen(false)
      void utils.mouse.listCages.invalidate()
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const removeMut = trpc.mouse.removeCage.useMutation({
    onSuccess: () => {
      toast.success('笼位已删除')
      setPendingRemove(null)
      void utils.mouse.listCages.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const cages = cagesQ.data ?? []

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="caption-en">笼位 CAGES · {cages.length}</p>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-bench transition-colors hover:bg-bench-wash"
        >
          <Plus className="h-3.5 w-3.5" /> 新建笼位
        </button>
      </div>

      {cages.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full flex-col items-center gap-2.5 rounded-xl border border-dashed border-line-strong py-12 transition-colors duration-150 hover:border-bench hover:bg-bench-wash/30"
        >
          <LayoutGrid className="h-8 w-8 text-ink-mute" strokeWidth={1.5} />
          <p className="text-[13px] text-ink-mute">还没有笼位 — 点击新建</p>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cages.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{c.cageNo}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-mute">
                    {[c.room, c.rack].filter(Boolean).join(' · ') || '未标位置'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[12px] font-medium text-ink-soft">{c.aliveCount} 只</span>
                  <button
                    type="button"
                    aria-label="删除笼位"
                    onClick={() => setPendingRemove(c.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {c.occupants.length > 0 && (
                <div className="mt-2.5 border-t border-line-soft pt-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === c.id ? null : c.id)}
                    className="text-[11.5px] text-bench hover:underline"
                  >
                    {openId === c.id ? '收起' : `查看笼内 ${c.occupants.length} 只`}
                  </button>
                  {openId === c.id && (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {c.occupants.map((o) => (
                        <li key={o.id} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                          <span className="font-mono font-semibold text-ink">#{o.earNo}</span>
                          <span style={{ color: (GENDER_META[o.gender] ?? GENDER_META.unknown).color }}>
                            {(GENDER_META[o.gender] ?? GENDER_META.unknown).short}
                          </span>
                          <span className="truncate">{o.strainName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[16px]">新建笼位</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="caption-en">笼号</span>
              <input autoFocus value={cageNo} onChange={(e) => setCageNo(e.target.value)} placeholder="如：A-101" className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="caption-en">房间</span>
                <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="SPF-2" className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="caption-en">架位</span>
                <input value={rack} onChange={(e) => setRack(e.target.value)} placeholder="R3-2" className={inputCls} />
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={createMut.isPending || cageNo.trim() === ''}
              onClick={() => createMut.mutate({ cageNo: cageNo.trim(), room: room.trim() || undefined, rack: rack.trim() || undefined })}
              className="flex h-9 items-center rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-colors hover:bg-bench-deep disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingRemove != null} onOpenChange={(v) => !v && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个笼位？</AlertDialogTitle>
            <AlertDialogDescription>笼内无存活小鼠才可删除；历史关联会被解除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRemove != null && removeMut.mutate({ id: pendingRemove })}
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

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function Mice() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'board'
  const utils = trpc.useUtils()

  const strainsQ = trpc.mouse.listStrains.useQuery()
  const strains = (strainsQ.data ?? []).map((s) => ({ ...s, ...s.stats })) as StrainRow[]

  const [strainDialog, setStrainDialog] = useState<{ open: boolean; existing: StrainRow | null }>({ open: false, existing: null })
  const [mouseDialog, setMouseDialog] = useState<{ open: boolean; existing: MouseRow | null; strainId: number | null }>({ open: false, existing: null, strainId: null })
  const [batchDialog, setBatchDialog] = useState<{ open: boolean; strainId: number | null }>({ open: false, strainId: null })
  const [statusMouse, setStatusMouse] = useState<MouseRow | null>(null)
  const [removeMouse, setRemoveMouse] = useState<MouseRow | null>(null)

  const removeMut = trpc.mouse.removeMouse.useMutation({
    onSuccess: () => {
      toast.success('已删除')
      setRemoveMouse(null)
      void utils.mouse.listMice.invalidate()
      void utils.mouse.listStrains.invalidate()
      void utils.mouse.overview.invalidate()
      void utils.mouse.taskSuggestions.invalidate()
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const setTab = (t: string) => setSearchParams(t === 'board' ? {} : { tab: t }, { replace: true })

  const TABS = [
    { key: 'board', label: '库存看板', icon: LayoutGrid },
    { key: 'mice', label: '个体台账', icon: Table2 },
  ] as const

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <Toaster position="top-right" />

      <header className="mb-5">
        <h1 className="font-display text-[22px] font-bold leading-[30px] text-ink">小鼠库存</h1>
        <p className="mt-1 text-[13px] leading-[20px] text-ink-mute">
          品系 → 个体 → 笼位：库存看板、日龄筛选、状态流转、扩繁预警。
        </p>
      </header>

      <div className="mb-5 flex items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-card">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors duration-150',
                tab === t.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {t.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setTab('cages')}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors duration-150',
            tab === 'cages' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink',
          )}
        >
          <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
          笼位
        </button>
      </div>

      {tab === 'board' && (
        <BoardTab
          strains={strains}
          onNewStrain={() => setStrainDialog({ open: true, existing: null })}
          onEditStrain={(s) => setStrainDialog({ open: true, existing: s })}
          onNewMouse={(sid) => setMouseDialog({ open: true, existing: null, strainId: sid })}
          onBatchMouse={(sid) => setBatchDialog({ open: true, strainId: sid })}
        />
      )}
      {tab === 'mice' && (
        <MiceTab
          strains={strains}
          onNewMouse={() => setMouseDialog({ open: true, existing: null, strainId: null })}
          onBatchMouse={() => setBatchDialog({ open: true, strainId: null })}
          onEditMouse={(m) => setMouseDialog({ open: true, existing: m, strainId: null })}
          onStatusMouse={setStatusMouse}
          onAskRemove={setRemoveMouse}
        />
      )}
      {tab === 'cages' && <CagesTab />}

      <StrainDialog open={strainDialog.open} existing={strainDialog.existing} onOpenChange={(v) => setStrainDialog((s) => ({ ...s, open: v }))} />
      <MouseDialog
        open={mouseDialog.open}
        existing={mouseDialog.existing}
        strains={strains}
        defaultStrainId={mouseDialog.strainId}
        onOpenChange={(v) => setMouseDialog((s) => ({ ...s, open: v }))}
      />
      <BatchMouseDialog
        open={batchDialog.open}
        strains={strains}
        defaultStrainId={batchDialog.strainId}
        onOpenChange={(v) => setBatchDialog((s) => ({ ...s, open: v }))}
      />
      <StatusDialog mouse={statusMouse} onClose={() => setStatusMouse(null)} />

      <AlertDialog open={removeMouse != null} onOpenChange={(v) => !v && setRemoveMouse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除小鼠 #{removeMouse?.earNo}？</AlertDialogTitle>
            <AlertDialogDescription>
              物理删除不可恢复。一般建议用「状态流转」标记处死/死亡/淘汰以保留台账。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMouse && removeMut.mutate({ id: removeMouse.id })}
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
