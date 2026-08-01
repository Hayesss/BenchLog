import { useMemo, useState } from 'react'
import { Search, UserPlus, Users, X } from 'lucide-react'
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

type CollabKind = 'record' | 'protocol' | 'analysis'
type Role = 'viewer' | 'editor'

const KIND_LABEL: Record<CollabKind, string> = {
  record: '记录',
  protocol: '方法',
  analysis: '生信分析',
}

const ROLE_LABEL: Record<Role, string> = {
  viewer: '可查看',
  editor: '可编辑',
}

/**
 * 成员共享管理弹窗（#20-II 协作底座，owner 专属）：
 * 成员列表（角色切换/移除）+ 用户目录搜索添加。
 * 角色语义：viewer 只读；editor 可编辑内容（不可删除、锁定或管理成员）。
 */
export function ShareMembersDialog({
  kind,
  targetId,
  open,
  onOpenChange,
}: {
  kind: CollabKind
  targetId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const utils = trpc.useUtils()
  const [q, setQ] = useState('')
  const [pickedRole, setPickedRole] = useState<Role>('editor')

  const listQ = trpc.member.list.useQuery({ kind, targetId }, { enabled: open })
  const dirQ = trpc.member.directory.useQuery({ q }, { enabled: open })
  const members = useMemo(() => listQ.data ?? [], [listQ.data])
  const candidates = useMemo(
    () => (dirQ.data ?? []).filter((u) => !members.some((m) => m.memberId === u.id)),
    [dirQ.data, members],
  )

  const invalidate = () => {
    void utils.member.list.invalidate({ kind, targetId })
    void utils.member.sharedWithMe.invalidate()
  }

  const addMut = trpc.member.add.useMutation({
    onSuccess: (r) => {
      toast.success(r.reused ? '已更新该成员角色' : '成员已添加')
      invalidate()
    },
    onError: (e) => toast.error(`添加失败：${e.message}`),
  })
  const roleMut = trpc.member.updateRole.useMutation({
    onSuccess: () => {
      toast.success('角色已更新')
      invalidate()
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  })
  const removeMut = trpc.member.remove.useMutation({
    onSuccess: () => {
      toast.success('成员已移除')
      invalidate()
    },
    onError: (e) => toast.error(`移除失败：${e.message}`),
  })

  const busy = addMut.isPending || roleMut.isPending || removeMut.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-line bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Users className="h-4 w-4 text-bench" />
            成员共享
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            邀请站内用户协作此{KIND_LABEL[kind]}。「可编辑」可修改内容，但不可删除、锁定或管理成员。
          </DialogDescription>
        </DialogHeader>

        {/* 现有成员 */}
        <div className="mt-1">
          {listQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg border border-line bg-paper" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-mute">
              还没有协作成员 — 在下方搜索用户名添加。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.memberId}
                  className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {m.name}
                  </span>
                  <div className="flex overflow-hidden rounded-md border border-line">
                    {(['viewer', 'editor'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          m.role !== r &&
                          roleMut.mutate({ kind, targetId, memberId: m.memberId, role: r })
                        }
                        className={cn(
                          'px-2.5 py-1 text-[11.5px] transition-colors duration-150',
                          m.role === r
                            ? 'bg-bench text-white'
                            : 'bg-surface text-ink-soft hover:text-ink',
                        )}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={`移除 ${m.name}`}
                    disabled={busy}
                    onClick={() => removeMut.mutate({ kind, targetId, memberId: m.memberId })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-surface hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 添加成员 */}
        <div className="mt-3 border-t border-line pt-3">
          <p className="caption-en mb-1.5">添加成员 ADD MEMBER</p>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索用户名…"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
              />
            </div>
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
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="px-1 py-1.5 text-[12px] text-ink-mute">
                {dirQ.isLoading ? '搜索中…' : '无匹配用户'}
              </li>
            ) : (
              candidates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      addMut.mutate({ kind, targetId, memberId: u.id, role: pickedRole })
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-bench-wash"
                  >
                    <UserPlus className="h-3.5 w-3.5 shrink-0 text-bench" />
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    <span className="text-[11px] text-ink-mute">添加为{ROLE_LABEL[pickedRole]}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
