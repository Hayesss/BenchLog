import { ChevronDown, Circle, CircleCheck, RotateCcw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { STATUS_META } from './record-types'
import type { RecordStatus } from './record-types'

const STATUS_ICON: Record<RecordStatus, typeof Circle> = {
  ongoing: Circle,
  done: CircleCheck,
  failed: RotateCcw,
}

export function RecordStatusBadge({
  status,
  className,
}: {
  status: RecordStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  const Icon = STATUS_ICON[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium leading-none',
        meta.chip,
        meta.text,
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {meta.label}
    </span>
  )
}

/** Status badge with dropdown switcher (record-detail.md §0) */
export default function RecordStatusMenu({
  status,
  onChange,
  disabled,
}: {
  status: RecordStatus
  onChange: (s: RecordStatus) => void
  disabled?: boolean
}) {
  const meta = STATUS_META[status]
  const Icon = STATUS_ICON[status]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-all duration-150 hover:brightness-[0.96] active:scale-[0.97]',
            meta.chip,
            meta.text,
            disabled && 'cursor-default opacity-70',
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
          {meta.label}
          {!disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(Object.keys(STATUS_META) as RecordStatus[]).map((s) => {
          const m = STATUS_META[s]
          const ItemIcon = STATUS_ICON[s]
          return (
            <DropdownMenuItem
              key={s}
              onSelect={() => onChange(s)}
              className="flex items-center gap-2 text-[13px]"
            >
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', m.chip, m.text)}>
                <ItemIcon className="h-3 w-3" strokeWidth={2.2} />
              </span>
              <span className="flex-1">{m.label}</span>
              {s === 'failed' && (
                <span className="text-[11px] text-ink-mute">失败也是数据</span>
              )}
              {s === status && <span className="text-bench">✓</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
