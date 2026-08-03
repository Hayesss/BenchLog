import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, Plus, Search, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { EASE_OUT } from '@/components/records/record-types'

const KIND_LABEL: Record<string, string> = {
  mouseStock: '小鼠库存',
  record: '记录',
  protocol: '方法',
  analysis: '生信分析',
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

/** 组详情弹窗：成员管理（owner 加人/移除，member 自退）+ 组内数据授权列表 */
function TeamDetailDialog({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const utils = trpc.useUtils()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const detailQ = trpc.team.byId.useQuery({ id: teamId }, { enabled: open })
  const dirQ = trpc.team.directory.useQuery({ q }, { enabled: open })
  const d = detailQ.data
  const isOwner = d?.myRole === 'owner'

  const candidates = useMemo(
    () =>
      (dirQ.data ?? []).filter(
        (u) =>
          u.id !== d?.ownerId && !(d?.members ?? []).some((m) => m.memberId === u.id),
      ),
    [dirQ.data, d],
  )

  const invalidate = () => {
    void utils.team.byId.invalidate({ id: teamId })
    void utils.team.listMine.invalidate()
  }
  const addMut = trpc.team.addMember.useMutation({
    onSuccess: (r) => {
      toast.success(r.reused ? '该用户已在组内' : '成员已添加')
      invalidate()
    },
    onError: (e) => toast.error(`添加失败：${e.message}`),
  })
  const removeMut = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success('已移除')
      invalidate()
      void utils.team.stockSources.invalidate()
    },
    onError: (e) => toast.error(`操作失败：${e.message}`),
  })
  const busy = addMut.isPending || removeMut.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-line bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <UsersRound className="h-4 w-4 text-bench" />
            {d?.name ?? '项目组'}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            组建者：{d?.ownerName ?? '—'} · 创建于 {d ? fmtDate(d.createdAt) : '—'}
          </DialogDescription>
        </DialogHeader>

        {/* 成员 */}
        <div>
          <p className="caption-en mb-1.5">成员 MEMBERS · {(d?.members.length ?? 0) + 1}</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {d?.ownerName}
              </span>
              <span className="rounded-full border border-bench/40 bg-bench-wash px-2 py-0.5 text-[11px] font-medium text-bench">
                组建者
              </span>
            </li>
            {(d?.members ?? []).map((m) => (
              <li
                key={m.memberId}
                className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {m.name}
                </span>
                {(isOwner || m.memberId === user?.id) && (
                  <button
                    type="button"
                    aria-label={m.memberId === user?.id ? '退出项目组' : `移除 ${m.name}`}
                    disabled={busy}
                    onClick={() => removeMut.mutate({ teamId, memberId: m.memberId })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-surface hover:text-danger"
                  >
                    {m.memberId === user?.id ? <LogOut className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* 加人（owner） */}
        {isOwner && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="caption-en mb-1.5">添加成员 ADD MEMBER</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索用户名…"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
              />
            </div>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
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
                      onClick={() => addMut.mutate({ teamId, memberId: u.id })}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-bench-wash"
                    >
                      <UserPlus className="h-3.5 w-3.5 shrink-0 text-bench" />
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* 组内数据授权 */}
        <div className="mt-3 border-t border-line pt-3">
          <p className="caption-en mb-1.5">组内同步的数据 SYNCED DATA</p>
          {(d?.shares ?? []).length === 0 ? (
            <p className="text-[12px] text-ink-mute">
              还没有数据同步到本组 — 数据所有者在「小鼠库存 → 同步到项目组」里授权。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(d?.shares ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {s.ownerName} 的{KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      s.role === 'editor'
                        ? 'border-bench/40 bg-bench-wash text-bench'
                        : 'border-line bg-surface text-ink-mute',
                    )}
                  >
                    {s.role === 'editor' ? '可编辑' : '可查看'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 项目组（批次#21）：我建的组（建/管/解散）+ 我所在的组（退出） */
export default function Teams() {
  const utils = trpc.useUtils()
  const listQ = trpc.team.listMine.useQuery()
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [renameId, setRenameId] = useState<number | null>(null)
  const [renameName, setRenameName] = useState('')
  const [disbandId, setDisbandId] = useState<number | null>(null)

  const owned = useMemo(() => listQ.data?.owned ?? [], [listQ.data])
  const joined = useMemo(() => listQ.data?.joined ?? [], [listQ.data])

  const createMut = trpc.team.create.useMutation({
    onSuccess: () => {
      toast.success('项目组已创建')
      setCreateOpen(false)
      setCreateName('')
      void utils.team.listMine.invalidate()
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const renameMut = trpc.team.rename.useMutation({
    onSuccess: () => {
      toast.success('已改名')
      setRenameId(null)
      void utils.team.listMine.invalidate()
    },
    onError: (e) => toast.error(`改名失败：${e.message}`),
  })
  const disbandMut = trpc.team.disband.useMutation({
    onSuccess: () => {
      toast.success('项目组已解散')
      setDisbandId(null)
      void utils.team.listMine.invalidate()
      void utils.team.stockSources.invalidate()
    },
    onError: (e) => toast.error(`解散失败：${e.message}`),
  })

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-5 md:px-8 md:pt-6">
      <Toaster position="top-right" />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
      >
        <div className="flex items-center gap-2.5">
          <UsersRound className="h-5 w-5 text-bench" />
          <h1 className="font-display text-[22px] font-bold text-ink">项目组</h1>
          <span className="caption-en ml-1">TEAMS</span>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-bench px-3.5 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep"
          >
            <Plus className="h-4 w-4" />
            新建项目组
          </button>
        </div>
        <p className="mt-1 text-[13px] text-ink-mute">
          建组拉人后，任何成员都可在「小鼠库存 → 同步到项目组」把自己的库存授权给全组（可查看/可编辑）。
        </p>
      </motion.div>

      {listQ.isLoading ? (
        <div className="mt-6 space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : (
        <>
          {/* 我建的组 */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="mt-6"
          >
            <p className="caption-en mb-2">我建的组 OWNED · {owned.length}</p>
            {owned.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
                <UsersRound className="mx-auto h-8 w-8 text-ink-mute" />
                <p className="mt-3 text-[13px] text-ink-mute">还没有项目组 — 点右上角「新建项目组」开始协作</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {owned.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailId(t.id)}
                      className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-ink transition-colors duration-150 hover:text-bench"
                    >
                      {t.name}
                    </button>
                    <span className="shrink-0 text-[12px] text-ink-mute">
                      成员 {t.memberCount + 1} · {fmtDate(t.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameId(t.id)
                        setRenameName(t.name)
                      }}
                      className="flex h-7 items-center rounded-md border border-line px-2 text-[11.5px] text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink"
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      aria-label={`解散 ${t.name}`}
                      onClick={() => setDisbandId(t.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* 我所在的组 */}
          {joined.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: EASE_OUT, delay: 0.06 }}
              className="mt-6"
            >
              <p className="caption-en mb-2">我所在的组 JOINED · {joined.length}</p>
              <ul className="space-y-2">
                {joined.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailId(t.id)}
                      className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-ink transition-colors duration-150 hover:text-bench"
                    >
                      {t.name}
                    </button>
                    <span className="shrink-0 text-[12px] text-ink-mute">
                      {t.ownerName} 的组 · 成员 {t.memberCount + 1}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </>
      )}

      {/* 建组 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm rounded-xl border-line bg-surface">
          <DialogHeader>
            <DialogTitle className="text-[15px]">新建项目组</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              例如「肿瘤课题组」「SPF 动物房协作组」。建好后在组详情里拉人。
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createName.trim()) createMut.mutate({ name: createName.trim() })
            }}
            placeholder="项目组名称…"
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
          />
          <button
            type="button"
            disabled={!createName.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ name: createName.trim() })}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-bench text-[13.5px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {createMut.isPending ? '创建中…' : '创建'}
          </button>
        </DialogContent>
      </Dialog>

      {/* 改名 */}
      <Dialog open={renameId != null} onOpenChange={(v) => !v && setRenameId(null)}>
        <DialogContent className="max-w-sm rounded-xl border-line bg-surface">
          <DialogHeader>
            <DialogTitle className="text-[15px]">项目组改名</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameName.trim() && renameId != null)
                renameMut.mutate({ id: renameId, name: renameName.trim() })
            }}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors duration-150 focus:border-bench"
          />
          <button
            type="button"
            disabled={!renameName.trim() || renameMut.isPending}
            onClick={() => renameId != null && renameMut.mutate({ id: renameId, name: renameName.trim() })}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-bench text-[13.5px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-bench-deep disabled:opacity-50"
          >
            {renameMut.isPending ? '保存中…' : '保存'}
          </button>
        </DialogContent>
      </Dialog>

      {/* 解散确认 */}
      <AlertDialog open={disbandId != null} onOpenChange={(v) => !v && setDisbandId(null)}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">解散该项目组？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              组成员与「同步到本组」的全部数据授权将被移除（数据本身不受影响）。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disbandId != null && disbandMut.mutate({ id: disbandId })}
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
            >
              解散
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailId != null && (
        <TeamDetailDialog teamId={detailId} open={detailId != null} onOpenChange={(v) => !v && setDetailId(null)} />
      )}
    </div>
  )
}
