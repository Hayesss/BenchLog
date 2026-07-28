import { X } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { wash, CATEGORY_HUES } from './protocolShared'
import { cn } from '@/lib/utils'

/** Stable fallback color for a tag name when the tag table has no entry. */
function fallbackColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_HUES[h % CATEGORY_HUES.length]
}

export function useProtocolTagColors(): Map<string, string> {
  const q = trpc.tag.list.useQuery()
  const map = new Map<string, string>()
  for (const t of q.data ?? []) map.set(t.name, t.color || fallbackColor(t.name))
  return map
}

/**
 * TagChip (design.md §8.5): `#` prefix, 12.5px, wash 底 + 对应色文字。
 */
export default function ProtocolTagChip({
  name,
  color,
  onRemove,
  onClick,
  className,
}: {
  name: string
  color?: string
  onRemove?: () => void
  onClick?: () => void
  className?: string
}) {
  const c = color || fallbackColor(name)
  return (
    <span
      className={cn(
        'group inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12.5px] leading-none transition-colors duration-150',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{ backgroundColor: wash(c), color: c }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span className="max-w-[140px] truncate">#{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`移除标签 ${name}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 hover:bg-black/10 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
