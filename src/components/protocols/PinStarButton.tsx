import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'

/**
 * 星标置顶开关：钉选后该方法固定出现在工作台「常用方法」最前。
 * 未置顶时仅 hover 显现（保持卡片干净），已置顶常显实心星。
 */
export default function PinStarButton({
  id,
  pinned,
  className,
}: {
  id: number
  pinned: boolean
  className?: string
}) {
  const utils = trpc.useUtils()
  const mut = trpc.protocol.setPinned.useMutation({
    onSuccess: async (_, v) => {
      toast.success(v.pinned ? '已置顶到工作台「常用方法」' : '已取消置顶')
      await Promise.all([utils.protocol.list.invalidate(), utils.protocol.byId.invalidate({ id })])
    },
    onError: (e) => toast.error(`操作失败：${e.message}`),
  })
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pinned}
      aria-label={pinned ? '取消置顶' : '置顶到常用方法'}
      title={pinned ? '取消置顶（工作台「常用方法」）' : '置顶到工作台「常用方法」'}
      disabled={mut.isPending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        mut.mutate({ id, pinned: !pinned })
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150',
        pinned
          ? 'text-warning hover:bg-paper'
          : 'text-ink-mute/50 opacity-0 hover:bg-paper hover:text-warning focus-visible:opacity-100 group-hover:opacity-100',
        className,
      )}
    >
      <Star className={cn('h-4 w-4', pinned && 'fill-current')} strokeWidth={1.8} />
    </button>
  )
}
