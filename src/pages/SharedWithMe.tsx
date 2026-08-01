import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { BookOpen, Dna, FileText, LogOut, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { EASE_OUT } from '@/components/records/record-types'

type Kind = 'record' | 'protocol' | 'analysis'
type Role = 'viewer' | 'editor'

const KIND_META: Record<Kind, { label: string; en: string; icon: typeof FileText; href: (id: number) => string; chip: string }> = {
  record: {
    label: '记录',
    en: 'RECORDS',
    icon: FileText,
    href: (id) => `/records/${id}`,
    chip: 'text-[#3E7C6B]',
  },
  protocol: {
    label: '方法',
    en: 'PROTOCOLS',
    icon: BookOpen,
    href: (id) => `/protocols/${id}`,
    chip: 'text-[#5B7C99]',
  },
  analysis: {
    label: '生信分析',
    en: 'ANALYSES',
    icon: Dna,
    href: (id) => `/bioinfo/${id}`,
    chip: 'text-[#7A5BA6]',
  },
}

const ROLE_LABEL: Record<Role, string> = { viewer: '可查看', editor: '可编辑' }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

/**
 * 共享给我（#20-II 协作底座）：别人通过成员共享授权给我的记录/方法/生信分析。
 * viewer 只读；editor 可编辑内容（不可删除/锁定/管理成员）。可随时退出共享。
 */
export default function SharedWithMe() {
  const utils = trpc.useUtils()
  const { user } = useAuth()
  const listQ = trpc.member.sharedWithMe.useQuery()
  const [leaving, setLeaving] = useState<string | null>(null)

  const items = useMemo(() => listQ.data ?? [], [listQ.data])
  const groups = useMemo(() => {
    const g: Record<Kind, typeof items> = { record: [], protocol: [], analysis: [] }
    for (const it of items) g[it.kind].push(it)
    return g
  }, [items])

  const removeMut = trpc.member.remove.useMutation({
    onSuccess: () => {
      toast.success('已退出共享')
      void utils.member.sharedWithMe.invalidate()
    },
    onError: (e) => toast.error(`操作失败：${e.message}`),
    onSettled: () => setLeaving(null),
  })

  const leave = (kind: Kind, targetId: number) => {
    if (user?.id == null) return
    setLeaving(`${kind}-${targetId}`)
    // member.remove 语义：memberId 非本人需 owner 权限；本人 id 即「退出共享」
    removeMut.mutate({ kind, targetId, memberId: user.id })
  }

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-5 md:px-8 md:pt-6">
      <Toaster position="top-right" />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
      >
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5 text-bench" />
          <h1 className="font-display text-[22px] font-bold text-ink">共享给我</h1>
          <span className="caption-en ml-1">SHARED WITH ME</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-mute">
          同事通过「成员共享」授权你访问的内容。「可编辑」可修改内容，但不可删除、锁定或管理成员。
        </p>
      </motion.div>

      {listQ.isLoading ? (
        <div className="mt-6 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-3 text-[13.5px] text-ink-soft">暂无共享内容</p>
          <p className="mt-1 text-[12.5px] text-ink-mute">
            让同事在记录/方法/生信详情页点「成员」，把你加为协作成员。
          </p>
        </div>
      ) : (
        (Object.keys(KIND_META) as Kind[]).map((kind) => {
          const meta = KIND_META[kind]
          const list = groups[kind]
          if (list.length === 0) return null
          const Icon = meta.icon
          return (
            <motion.section
              key={kind}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: EASE_OUT }}
              className="mt-6"
            >
              <p className="caption-en mb-2">
                {meta.label} {meta.en} · {list.length}
              </p>
              <ul className="space-y-2">
                {list.map((it) => (
                  <li
                    key={`${it.kind}-${it.targetId}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card"
                  >
                    <Icon className={cn('h-4.5 w-4.5 shrink-0', meta.chip)} />
                    <Link
                      to={meta.href(it.targetId)}
                      className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink transition-colors duration-150 hover:text-bench"
                    >
                      {it.title || '（未命名）'}
                    </Link>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        it.role === 'editor'
                          ? 'border-bench/40 bg-bench-wash text-bench'
                          : 'border-line bg-paper text-ink-mute',
                      )}
                    >
                      {ROLE_LABEL[it.role]}
                    </span>
                    <span className="hidden shrink-0 text-[12px] text-ink-mute sm:block">
                      {it.ownerName} · {fmtDate(it.updatedAt)}
                    </span>
                    <button
                      type="button"
                      title="退出共享"
                      disabled={leaving === `${it.kind}-${it.targetId}`}
                      onClick={() => leave(it.kind, it.targetId)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-paper hover:text-danger disabled:opacity-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.section>
          )
        })
      )}
    </div>
  )
}
