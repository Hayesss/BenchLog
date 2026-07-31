import { useMemo, useState } from 'react'
import { Check, Copy, Link2, Share2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { trpc } from '@/providers/trpc'

/**
 * 只读分享按钮（#20 第一期）：记录/生信详情页头部复用。
 * 弹层内：无链接→创建；有链接→显示+复制+撤销。create 服务端幂等复用同 token。
 */
export function ShareButton({ kind, targetId }: { kind: 'record' | 'analysis'; targetId: number }) {
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const listQ = trpc.share.list.useQuery(undefined, { enabled: open })

  const current = useMemo(
    () =>
      (listQ.data ?? []).find((s) => s.kind === kind && s.targetId === targetId && !s.revoked) ??
      null,
    [listQ.data, kind, targetId],
  )
  const url = current ? `${window.location.origin}/share/${current.token}` : null

  const createMut = trpc.share.create.useMutation({
    onSuccess: (r) => {
      toast.success(r.reused ? '已存在有效链接，直接复用' : '只读链接已创建')
      void utils.share.list.invalidate()
    },
    onError: (e) => toast.error(`创建失败：${e.message}`),
  })
  const revokeMut = trpc.share.revoke.useMutation({
    onSuccess: () => {
      toast.success('链接已撤销，即刻失效')
      void utils.share.list.invalidate()
    },
    onError: (e) => toast.error(`撤销失败：${e.message}`),
  })

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          <Share2 className="h-4 w-4" />
          分享
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] rounded-xl border-line p-3">
        <p className="caption-en mb-1.5">只读分享 READ-ONLY LINK</p>
        {current && url ? (
          <div>
            <p className="text-[12px] leading-[17px] text-ink-mute">
              任何人打开此链接都可只读查看{kind === 'record' ? '该记录' : '该分析'}（无需登录），不包含你的其他数据。
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 font-mono text-[11.5px] text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => void copy()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:border-bench hover:text-bench"
                aria-label="复制链接"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              disabled={revokeMut.isPending}
              onClick={() => revokeMut.mutate({ id: current.id })}
              className="mt-2 flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              撤销链接（立即失效）
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[12px] leading-[17px] text-ink-mute">
              生成一条公开只读链接：任何人打开都能查看{kind === 'record' ? '该记录全文与图片' : '该分析摘要'}
              ，无需登录；可随时撤销，撤销后立即失效。
            </p>
            <button
              type="button"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate({ kind, targetId })}
              className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-bench text-[13px] font-medium text-white shadow-card transition-colors hover:bg-bench-deep disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {createMut.isPending ? '创建中…' : '创建只读链接'}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
