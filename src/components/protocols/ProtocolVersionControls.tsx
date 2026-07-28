import { ChevronDown, GitCompareArrows } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  countSteps,
  diffParams,
  formatDate,
  type ProtocolContentView,
  type ProtocolVersionRow,
} from './protocolShared'
import { cn } from '@/lib/utils'

/**
 * VersionBadge (design.md §8.7): mono chip + dropdown listing version history.
 */
export function ProtocolVersionBadge({
  current,
  versions,
  viewing,
  onSelect,
}: {
  current: string
  versions: ProtocolVersionRow[]
  viewing: string
  onSelect: (version: string | null) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-full border border-line bg-bench-wash px-2.5 font-mono text-[12.5px] font-medium text-bench-ink shadow-card transition-colors duration-150 hover:bg-bench-wash/70"
        >
          {viewing}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-lg border-line">
        <DropdownMenuLabel className="text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">
          版本历史 HISTORY
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => onSelect(null)}
          className={cn('flex cursor-pointer flex-col items-start gap-0.5', viewing === current && 'bg-bench-wash/60')}
        >
          <span className="font-mono text-[12.5px] font-medium text-ink">
            {current} <span className="ml-1 rounded bg-bench-wash px-1 text-[10.5px] text-bench-ink">当前</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {versions.map((v) => (
          <DropdownMenuItem
            key={v.id}
            onSelect={() => onSelect(v.version)}
            className={cn('flex cursor-pointer flex-col items-start gap-0.5', viewing === v.version && 'bg-bench-wash/60')}
          >
            <span className="font-mono text-[12.5px] font-medium text-ink">
              {v.version} <span className="ml-1 text-[11px] font-normal text-ink-mute">{formatDate(v.createdAt)}</span>
            </span>
            {v.note && <span className="line-clamp-1 text-[11.5px] text-ink-mute">{v.note}</span>}
          </DropdownMenuItem>
        ))}
        {versions.length === 0 && (
          <DropdownMenuItem disabled className="text-[12px] text-ink-mute">
            暂无历史版本
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 版本 diff 弹窗：两列并排参数对比，变更行 amber 高亮 (protocol-detail.md §区块0)。
 */
export function ProtocolDiffDialog({
  open,
  onOpenChange,
  oldVersion,
  oldDate,
  oldContent,
  newContent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  oldVersion: string
  oldDate?: unknown
  oldContent: ProtocolContentView
  newContent: ProtocolContentView
}) {
  const rows = diffParams(oldContent.params, newContent.params).filter((r) => r.kind !== 'same')
  const unchanged = diffParams(oldContent.params, newContent.params).filter((r) => r.kind === 'same').length
  const oldSteps = countSteps(oldContent)
  const newSteps = countSteps(newContent)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-xl border-line p-0">
        <DialogHeader className="border-b border-line px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink">
            <GitCompareArrows className="h-4 w-4 text-bench" />
            版本对比
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 font-mono text-[12.5px] text-ink-mute">
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">{oldVersion}</span>
            {oldDate ? `(${formatDate(oldDate)})` : ''}
            <span>→</span>
            <span className="rounded bg-bench-wash px-1.5 py-0.5 text-bench-ink">{newContent.version} · 当前</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* overview */}
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: '步骤数', oldV: oldSteps, newV: newSteps },
              { label: '材料数', oldV: oldContent.materials.length, newV: newContent.materials.length },
              { label: '参数数', oldV: oldContent.params.length, newV: newContent.params.length },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-paper px-2 py-2">
                <p className="text-[11px] text-ink-mute">{s.label}</p>
                <p className="font-mono text-[13px] text-ink">
                  {s.oldV}
                  <span className="mx-1 text-ink-mute">→</span>
                  <span className={s.oldV !== s.newV ? 'font-semibold text-warning' : ''}>{s.newV}</span>
                </p>
              </div>
            ))}
          </div>

          {/* param diff, two columns */}
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] border-b border-line bg-paper px-3 py-2 text-[11.5px] font-medium tracking-[0.04em] text-ink-mute">
              <span>参数</span>
              <span className="font-mono">{oldVersion}</span>
              <span className="font-mono">{newContent.version}</span>
            </div>
            {rows.length === 0 && (
              <p className="px-3 py-4 text-[12.5px] text-ink-mute">
                两版关键参数一致{unchanged > 0 ? `（${unchanged} 项未变）` : ''}。
              </p>
            )}
            {rows.map((r) => (
              <div
                key={r.name}
                className={cn(
                  'grid grid-cols-[1.2fr_1fr_1fr] items-center border-b border-line px-3 py-2 last:border-b-0',
                  r.kind === 'changed' && 'bg-warning/10',
                  r.kind === 'added' && 'bg-bench-wash/50',
                  r.kind === 'removed' && 'bg-paper',
                )}
              >
                <span className="text-[12.5px] font-medium text-ink">
                  {r.name}
                  {r.kind === 'added' && (
                    <span className="ml-1.5 rounded bg-bench-wash px-1 text-[10px] text-bench-ink">新增</span>
                  )}
                  {r.kind === 'removed' && (
                    <span className="ml-1.5 rounded bg-danger/10 px-1 text-[10px] text-danger">移除</span>
                  )}
                </span>
                <span
                  className={cn(
                    'font-mono text-[12.5px]',
                    r.kind === 'removed' ? 'text-ink-mute line-through' : 'text-ink-soft',
                  )}
                >
                  {r.oldValue ?? '—'}
                </span>
                <span
                  className={cn(
                    'font-mono text-[12.5px]',
                    r.kind === 'changed' || r.kind === 'added' ? 'font-semibold text-warning' : 'text-ink-mute',
                  )}
                >
                  {r.newValue ?? '—'}
                  {r.unit ? ` ${r.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
          {rows.some((r) => r.kind === 'changed') && (
            <p className="mt-2 text-[11.5px] text-ink-mute">
              amber 高亮行为两版间发生调整的参数，如 {rows.find((r) => r.kind === 'changed')?.name}{' '}
              {rows.find((r) => r.kind === 'changed')?.oldValue} → {rows.find((r) => r.kind === 'changed')?.newValue}。
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
