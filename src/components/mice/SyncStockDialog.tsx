import { useMemo, useState } from 'react'
import { RefreshCw, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'

type Role = 'viewer' | 'editor'
const ROLE_LABEL: Record<Role, string> = { viewer: '可查看', editor: '可编辑' }

/**
 * 小鼠库存「同步到项目组」弹窗（批次#21）：
 * 已授权组列表（改级/撤销）+ 可授权组选择（级别预选）。
 * 授权为库存整体（品系/个体/笼位/配种），全组成员统一级别。
 */
export function SyncStockDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const utils = trpc.useUtils()
  const [pickedTeam, setPickedTeam] = useState<number | null>(null)
  const [pickedRole, setPickedRole] = useState<Role>('viewer')

  const sharesQ = trpc.team.myStockShares.useQuery({ kind: 'mouseStock' }, { enabled: open })
  const teamsQ = trpc.team.listMine.useQuery(undefined, { enabled: open })
  const shares = useMemo(() => sharesQ.data ?? [], [sharesQ.data])
  const candidateTeams = useMemo(() => {
    const all = [
      ...(teamsQ.data?.owned ?? []).map((t) => ({ id: t.id, name: t.name, tag: '我建的组' })),
      ...(teamsQ.data?.joined ?? []).map((t) => ({ id: t.id, name: t.name, tag: `${t.ownerName} 的组` })),
    ]
    return all.filter((t) => !shares.some((s) => s.teamId === t.id))
  }, [teamsQ.data, shares])

  const invalidate = () => {
    void utils.team.myStockShares.invalidate()
    void utils.team.stockSources.invalidate()
    void utils.mouse.listStrains.invalidate()
    void utils.mouse.overview.invalidate()
  }

  const shareMut = trpc.team.shareStock.useMutation({
    onSuccess: (r) => {
      toast.success(r.reused ? '已更新该组授权级别' : '库存已同步到项目组')
      setPickedTeam(null)
      invalidate()
    },
    onError: (e) => toast.error(`同步失败：${e.message}`),
  })
  const unshareMut = trpc.team.unshareStock.useMutation({
    onSuccess: () => {
      toast.success('已撤销同步')
      invalidate()
    },
    onError: (e) => toast.error(`撤销失败：${e.message}`),
  })
  const busy = shareMut.isPending || unshareMut.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-line bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <UsersRound className="h-4 w-4 text-bench" />
            同步小鼠库存到项目组
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            把整个小鼠库存（品系/个体/笼位/配种）授权给项目组。「可编辑」可登记与维护，但不可物理删除、不可管理授权。
          </DialogDescription>
        </DialogHeader>

        {/* 已授权组 */}
        <div className="mt-1">
          {sharesQ.isLoading ? (
            <div className="h-10 animate-pulse rounded-lg border border-line bg-paper" />
          ) : shares.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-mute">
              还没有同步给任何项目组 — 在下方选择组与级别。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shares.map((s) => (
                <li
                  key={s.teamId}
                  className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {s.teamName}
                  </span>
                  <div className="flex overflow-hidden rounded-md border border-line">
                    {(['viewer', 'editor'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          s.role !== r &&
                          shareMut.mutate({ teamId: s.teamId, kind: 'mouseStock', role: r })
                        }
                        className={cn(
                          'px-2.5 py-1 text-[11.5px] transition-colors duration-150',
                          s.role === r ? 'bg-bench text-white' : 'bg-surface text-ink-soft hover:text-ink',
                        )}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={`撤销 ${s.teamName} 的同步`}
                    disabled={busy}
                    onClick={() => unshareMut.mutate({ teamId: s.teamId, kind: 'mouseStock' })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-surface hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 新增授权 */}
        <div className="mt-3 border-t border-line pt-3">
          <p className="caption-en mb-1.5">新增同步 ADD SYNC</p>
          {candidateTeams.length === 0 ? (
            <p className="text-[12px] text-ink-mute">
              暂无可授权的项目组 — 先到左侧「项目组」页创建或加入一个组。
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={pickedTeam ?? ''}
                  onChange={(e) => setPickedTeam(e.target.value ? Number(e.target.value) : null)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-bench"
                >
                  <option value="">选择项目组…</option>
                  {candidateTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（{t.tag}）
                    </option>
                  ))}
                </select>
                <div className="flex overflow-hidden rounded-lg border border-line">
                  {(['viewer', 'editor'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPickedRole(r)}
                      className={cn(
                        'px-2.5 py-1.5 text-[11.5px] transition-colors duration-150',
                        pickedRole === r ? 'bg-bench text-white' : 'bg-surface text-ink-soft',
                      )}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={pickedTeam == null || busy}
                onClick={() =>
                  pickedTeam != null &&
                  shareMut.mutate({ teamId: pickedTeam, kind: 'mouseStock', role: pickedRole })
                }
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-bench text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:bg-bench-deep disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                同步库存
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
