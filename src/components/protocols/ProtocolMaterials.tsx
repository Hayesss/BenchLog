import { motion } from 'framer-motion'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { ProtocolMaterial } from './protocolShared'
import { cn } from '@/lib/utils'

/**
 * 材料清单 (protocol-detail.md §区块3): hairline-row table with 备料 checkboxes,
 * 一键复制清单, 备料完成 badge. Check state is session-local (owned by the page).
 */
export default function ProtocolMaterials({
  materials,
  checked,
  onToggle,
  readOnly,
}: {
  materials: ProtocolMaterial[]
  checked: Record<string, boolean>
  onToggle: (key: string) => void
  readOnly?: boolean
}) {
  const done = materials.filter((_, i) => checked[`m${i}`]).length
  const allDone = materials.length > 0 && done === materials.length

  function copyList() {
    const text = materials
      .map((m) => `- ${m.name}${m.catalog ? ` · ${m.catalog}` : ''}${m.amount ? ` · ${m.amount}` : ''}`)
      .join('\n')
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('材料清单已复制'))
      .catch(() => toast.error('复制失败'))
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">材料清单</h3>
        {allDone && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 14, stiffness: 320 }}
            className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11.5px] font-medium text-success"
          >
            <Check className="h-3 w-3" /> 备料完成
          </motion.span>
        )}
        <button
          type="button"
          onClick={copyList}
          className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
        >
          <Copy className="h-3.5 w-3.5" /> 一键复制清单
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        {/* header */}
        <div className="hidden grid-cols-[32px_1fr_160px_110px] gap-2 border-b border-line bg-paper px-3 py-2 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute sm:grid">
          <span>备料</span>
          <span>材料</span>
          <span>货号</span>
          <span>用量</span>
        </div>
        {materials.length === 0 && (
          <p className="px-3 py-4 text-[12.5px] text-ink-mute">本协议未列出材料。</p>
        )}
        {materials.map((m, i) => {
          const key = `m${i}`
          const isChecked = !!checked[key]
          return (
            <motion.button
              key={key}
              type="button"
              disabled={readOnly}
              onClick={() => onToggle(key)}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.25, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'grid w-full grid-cols-[32px_1fr] items-center gap-2 border-b border-line px-3 py-2.5 text-left last:border-b-0 sm:grid-cols-[32px_1fr_160px_110px]',
                !readOnly && 'transition-colors duration-200 hover:bg-paper',
              )}
            >
              <span
                className={cn(
                  'relative flex h-5 w-5 items-center justify-center rounded-[6px] border transition-colors duration-200',
                  isChecked ? 'border-bench bg-bench' : 'border-line-strong bg-surface',
                )}
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <motion.path
                    d="M2.2 6.3 4.8 8.8 9.8 3.2"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{ pathLength: isChecked ? 1 : 0, opacity: isChecked ? 1 : 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
              </span>
              <span
                className={cn(
                  'text-[13px] transition-colors duration-200',
                  isChecked ? 'text-ink-mute' : 'text-ink',
                )}
              >
                {m.name}
              </span>
              <span className="hidden font-mono text-[12.5px] text-ink-soft sm:block">{m.catalog ?? '—'}</span>
              <span className="hidden font-mono text-[12.5px] text-ink-soft sm:block">{m.amount ?? '—'}</span>
            </motion.button>
          )
        })}
      </div>
    </section>
  )
}
