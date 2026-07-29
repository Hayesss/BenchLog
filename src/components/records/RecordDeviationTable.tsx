import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Deviation } from './record-types'

function EditableCell({
  value,
  onCommit,
  placeholder,
  mono,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  mono?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'min-h-[36px] w-full rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-paper',
          mono && 'font-mono font-medium',
          !value && 'text-ink-mute',
          className,
        )}
      >
        {value || placeholder || '—'}
      </button>
    )
  }
  return (
    <input
      ref={(el) => {
        inputRef.current = el
        el?.select()
      }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setEditing(false)
          if (draft !== value) onCommit(draft)
        } else if (e.key === 'Escape') {
          setEditing(false)
        }
      }}
      placeholder={placeholder}
      className={cn(
        'min-h-[36px] w-full rounded-md bg-bench-wash px-2 py-1.5 text-[13px] text-ink outline-none ring-1 ring-bench/40',
        mono && 'font-mono font-medium',
        className,
      )}
    />
  )
}

/**
 * 参数偏离表 (record-detail.md §3): 参数 / 方法默认 / 本次实际 / 偏离说明.
 * Rows where actualValue ≠ defaultValue get the amber left bar + 偏离 chip
 * (design.md §8.4). `flashKey` change replays the amber flash (re-anchor).
 */
export default function RecordDeviationTable({
  deviations,
  onChange,
  flashKey,
}: {
  deviations: Deviation[]
  onChange: (rows: Deviation[]) => void
  flashKey?: string | number
}) {
  const update = (idx: number, patch: Partial<Deviation>) =>
    onChange(deviations.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
  const remove = (idx: number) => onChange(deviations.filter((_, i) => i !== idx))
  const add = () =>
    onChange([...deviations, { param: '', defaultValue: '', actualValue: '', reason: '' }])

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      {/* header */}
      <div className="grid grid-cols-[1.1fr_1fr_1fr_1.2fr_32px] items-center gap-1 border-b border-line bg-paper px-3 py-2">
        {['参数', '方法默认', '本次实际', '偏离说明'].map((h) => (
          <span key={h} className="px-2 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">
            {h}
          </span>
        ))}
        <span />
      </div>

      {deviations.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-ink-mute">
          关联方法后会自动铺入默认参数；修改「本次实际」与默认不同即标记为偏离。
        </p>
      ) : (
        <motion.div key={flashKey}>
          {deviations.map((d, i) => {
            const deviated = d.actualValue !== '' && d.actualValue !== d.defaultValue
            return (
              <motion.div
                key={i}
                initial={
                  flashKey != null
                    ? { backgroundColor: 'rgba(185,138,62,0.14)' }
                    : false
                }
                animate={{ backgroundColor: 'rgba(185,138,62,0)' }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.05 }}
                className="group/row relative grid grid-cols-[1.1fr_1fr_1fr_1.2fr_32px] items-center gap-1 border-b border-line px-3 py-0.5 last:border-b-0"
              >
                {/* amber left bar slides in when deviated */}
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ scaleY: deviated ? 1 : 0, opacity: deviated ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-y-0 left-0 w-[3px] origin-top bg-warning"
                />
                <div className="relative">
                  <EditableCell
                    value={d.param}
                    placeholder="参数名"
                    onCommit={(v) => update(i, { param: v })}
                  />
                  {deviated && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className="pointer-events-none absolute -top-1.5 left-1 rounded-full bg-[#B98A3E1F] px-1.5 py-px font-mono text-[10px] font-medium text-warning"
                    >
                      偏离
                    </motion.span>
                  )}
                </div>
                <EditableCell
                  value={d.defaultValue}
                  placeholder="默认值"
                  mono
                  className={cn(!deviated && 'text-ink-mute')}
                  onCommit={(v) => update(i, { defaultValue: v })}
                />
                <EditableCell
                  value={d.actualValue}
                  placeholder="本次实际"
                  mono
                  className={cn(deviated ? 'text-warning' : 'text-ink-mute')}
                  onCommit={(v) => update(i, { actualValue: v })}
                />
                <EditableCell
                  value={d.reason ?? ''}
                  placeholder={deviated ? '为什么偏离？' : '—'}
                  onCommit={(v) => update(i, { reason: v || undefined })}
                />
                <button
                  type="button"
                  aria-label="删除该行"
                  onClick={() => remove(i)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute opacity-0 transition-all duration-150 hover:bg-[#B4564E1F] hover:text-danger focus:opacity-100 group-hover/row:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-1.5 px-5 py-2.5 text-[12.5px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash/50"
      >
        <Plus className="h-3.5 w-3.5" />
        添加偏离说明
      </button>
    </div>
  )
}
