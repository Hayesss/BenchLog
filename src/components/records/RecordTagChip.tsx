import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { wash } from './record-types'

/**
 * TagChip (design.md §8.5): `#` prefix, 12.5px, wash background + colored text.
 * `onRemove` shows a × on hover.
 */
export default function RecordTagChip({
  name,
  color = '#5B7C99',
  onClick,
  onRemove,
  active,
  className,
}: {
  name: string
  color?: string
  onClick?: () => void
  onRemove?: () => void
  active?: boolean
  className?: string
}) {
  const label = name.replace(/^#/, '')
  const inner = (
    <>
      <span>#{label}</span>
      {onRemove && (
        <span
          role="button"
          aria-label={`移除标签 ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/10 group-hover/chip:flex"
        >
          <X className="h-2.5 w-2.5" />
        </span>
      )}
    </>
  )
  const style = { backgroundColor: wash(color), color }
  const cls = cn(
    'group/chip inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium leading-none transition-all duration-150',
    onClick && 'cursor-pointer hover:brightness-[0.94]',
    active && 'ring-1 ring-current',
    className,
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style} className={cls}>
        {inner}
      </button>
    )
  }
  return (
    <span style={style} className={cls}>
      {inner}
    </span>
  )
}
