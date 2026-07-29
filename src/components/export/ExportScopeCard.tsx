import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DateRange,
  ExportRecord,
  ProjectItem,
  RecordListItem,
  RecordStatus,
  ScopePreset,
} from './reportTypes'
import { STATUS_LABEL } from './reportTypes'
import { recordCode } from './reportBuild'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const PRESETS: Array<{ key: ScopePreset; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'recent10', label: '最近 10 条' },
  { key: 'custom', label: '自定义' },
]

const STATUS_CHIPS: RecordStatus[] = ['ongoing', 'done', 'failed']

/** Odometer 风格数字滚动（export.md §区块2 统计行） */
function OdometerNumber({ value }: { value: number }) {
  return (
    <span className="relative inline-flex h-[18px] min-w-[1.2ch] justify-center overflow-hidden align-middle">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="tabular-nums"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-all duration-150 active:scale-[0.97]',
        active
          ? 'border-bench bg-bench-wash text-bench-ink'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

export interface ExportScopeCardProps {
  preset: ScopePreset
  onPreset: (p: ScopePreset) => void
  range: DateRange
  onRange: (r: DateRange) => void
  projects: ProjectItem[]
  projectIds: number[]
  onToggleProject: (id: number) => void
  statusFilter: RecordStatus[]
  onToggleStatus: (s: RecordStatus) => void
  allRecords: RecordListItem[]
  recordsLoading: boolean
  manualIds: number[] | null
  onToggleManual: (id: number) => void
  onClearManual: () => void
  selectedRecords: ExportRecord[]
  onRemoveRecord: (id: number) => void
  stats: { records: number; projects: number; images: number }
  scopeLoading: boolean
}

export default function ExportScopeCard({
  preset,
  onPreset,
  range,
  onRange,
  projects,
  projectIds,
  onToggleProject,
  statusFilter,
  onToggleStatus,
  allRecords,
  recordsLoading,
  manualIds,
  onToggleManual,
  onClearManual,
  selectedRecords,
  onRemoveRecord,
  stats,
  scopeLoading,
}: ExportScopeCardProps) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-card md:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[16px] font-semibold text-ink">汇报范围</h2>
        <span className="caption-en !text-[10px]">SCOPE</span>
      </div>

      {/* 快捷预设 pill 组（layoutId 滑移） */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-paper p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPreset(p.key)}
            className={cn(
              'relative h-7 flex-1 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium transition-colors duration-150',
              preset === p.key ? 'text-bench-ink' : 'text-ink-mute hover:text-ink-soft',
            )}
          >
            {preset === p.key && (
              <motion.span
                layoutId="export-preset-pill"
                className="absolute inset-0 rounded-md bg-bench-wash shadow-card"
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              />
            )}
            <span className="relative z-10">{p.label}</span>
          </button>
        ))}
      </div>

      {/* 自定义态：日期范围 + 项目多选 + 状态多选 */}
      {preset === 'custom' && (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="mt-4 flex flex-col gap-3"
      >
        <div>
          <div className="caption-en mb-1.5 !text-[10.5px]">日期范围 RANGE</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && onRange({ ...range, from: e.target.value })}
              className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink outline-none transition-colors duration-150 focus:border-bench"
            />
            <span className="text-[12px] text-ink-mute">→</span>
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && onRange({ ...range, to: e.target.value })}
              className="h-8 w-full rounded-lg border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink outline-none transition-colors duration-150 focus:border-bench"
            />
          </div>
        </div>

        <div>
          <div className="caption-en mb-1.5 !text-[10.5px]">项目 PROJECTS</div>
          <div className="flex flex-wrap gap-1.5">
            {projects.length === 0 && (
              <span className="text-[12px] text-ink-mute">暂无项目</span>
            )}
            {projects.map((p) => (
              <Chip
                key={p.id}
                active={projectIds.includes(p.id)}
                color={p.color || '#3E7C6B'}
                onClick={() => onToggleProject(p.id)}
              >
                {p.name}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-mute">不选即全部项目</p>
        </div>

        <div>
          <div className="caption-en mb-1.5 !text-[10.5px]">状态 STATUS</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((s) => (
              <Chip key={s} active={statusFilter.includes(s)} onClick={() => onToggleStatus(s)}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
        </div>

        {/* 手动挑选记录 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="caption-en !text-[10.5px]">手动挑选 PICK</span>
            {manualIds && (
              <button
                type="button"
                onClick={onClearManual}
                className="text-[11px] text-bench transition-colors duration-150 hover:text-bench-deep"
              >
                清空手动选择
              </button>
            )}
          </div>
          {manualIds && (
            <p className="mb-1.5 rounded-md bg-bench-wash px-2 py-1 text-[11px] text-bench-ink">
              已手动挑选 {manualIds.length} 条，优先于日期范围
            </p>
          )}
          <div className="max-h-44 overflow-y-auto rounded-lg border border-line">
            {recordsLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-line/70" />
                ))}
              </div>
            ) : allRecords.length === 0 ? (
              <p className="p-3 text-[12px] text-ink-mute">还没有湿实验记录</p>
            ) : (
              allRecords.map((r) => {
                const checked = manualIds?.includes(r.id) ?? false
                return (
                  <label
                    key={r.id}
                    className="flex h-9 cursor-pointer items-center gap-2 border-b border-line px-2.5 text-[12.5px] transition-colors duration-150 last:border-b-0 hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleManual(r.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-[#3E7C6B]"
                    />
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.project?.color || '#8A9099' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{r.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-mute">
                      {r.recordDate.slice(5)}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      </motion.div>
      )}

      {/* 实时统计行 */}
      <div className="mt-4 flex items-center gap-1 border-t border-line pt-3 font-mono text-[12.5px] text-ink-soft">
        <span className="text-ink-mute">已选</span>
        <OdometerNumber value={stats.records} />
        <span className="text-ink-mute">条记录 ·</span>
        <OdometerNumber value={stats.projects} />
        <span className="text-ink-mute">个项目 ·</span>
        <OdometerNumber value={stats.images} />
        <span className="text-ink-mute">张图片</span>
        {scopeLoading && <span className="ml-auto text-[11px] text-ink-mute">统计中…</span>}
      </div>

      {/* 选中记录列表 */}
      {selectedRecords.length > 0 && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-line">
          <AnimatePresence initial={false}>
            {selectedRecords.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ x: -8, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -8, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="group flex h-9 items-center gap-2 border-b border-line px-2.5 text-[12.5px] last:border-b-0 hover:bg-paper"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: r.project?.color || '#8A9099' }}
                />
                <span className="min-w-0 flex-1 truncate text-ink">
                  <span className="mr-1.5 font-mono text-[11px] text-ink-mute">
                    {recordCode(r)}
                  </span>
                  {r.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-mute">
                  {r.recordDate.slice(5)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveRecord(r.id)}
                  aria-label={`移除 ${r.title}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-mute opacity-0 transition-all duration-150 hover:bg-line/60 hover:text-danger group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
