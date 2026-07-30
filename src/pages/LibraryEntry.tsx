import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, BookMarked, ExternalLink, FlaskConical, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
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
import ProtocolToaster from '@/components/protocols/ProtocolToaster'

export default function LibraryEntry() {
  const { id } = useParams()
  const navigate = useNavigate()
  const entryId = Number(id)
  const entryQuery = trpc.library.entry.useQuery(
    { id: entryId },
    { enabled: Number.isFinite(entryId) && entryId > 0 },
  )
  const importMut = trpc.library.importAsProtocol.useMutation()
  const utils = trpc.useUtils()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const removeMut = trpc.library.removeEntry.useMutation({
    onSuccess: () => {
      toast.success('已删除该自建条目')
      void utils.library.chapters.invalidate()
      void utils.library.entries.invalidate()
      navigate('/library')
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const entry = entryQuery.data
  const isPointer = entry?.type === 'pointer'
  const isCustom = entry?.userId != null

  async function handleImport() {
    if (!entry) return
    try {
      const { id: newId } = await importMut.mutateAsync({ id: entry.id })
      toast.success(`已存为 Protocol「${entry.nameCn}」`)
      navigate(`/protocols/${newId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败，请重试')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 md:px-8">
      <ProtocolToaster />

      <button
        type="button"
        onClick={() => navigate('/library')}
        className="mt-6 flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        返回方法库
      </button>

      {entryQuery.isLoading ? (
        <div className="mt-6 flex flex-col gap-4">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-bench-wash/50" />
          <div className="h-5 w-1/2 animate-pulse rounded-lg bg-bench-wash/40" />
          <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
          <div className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
        </div>
      ) : !entry ? (
        <div className="flex flex-col items-center py-24">
          <BookMarked className="h-10 w-10 text-ink-mute" strokeWidth={1.5} />
          <h3 className="mt-4 font-display text-[18px] font-semibold text-ink">未找到该条目</h3>
          <p className="mt-1 text-[12.5px] text-ink-mute">条目可能已被移除，请返回方法库重新浏览</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6"
        >
          {/* 标题区 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isCustom && (
              <span className="rounded-full bg-[#5B7C991F] px-2 py-0.5 text-[11px] font-medium text-[#5B7C99]">
                自建
              </span>
            )}
            {entry.journal && (
              <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
                {entry.journal}
                {entry.year ? ` · ${entry.year}` : ''}
              </span>
            )}
            <span className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-mute">
              第 {entry.chapterNo} 章{entry.section ? ` · ${entry.section}` : ''}
            </span>
            {isPointer && (
              <span className="rounded-full bg-[#B08D571F] px-2 py-0.5 text-[11px] font-medium text-[#8a6a3f]">
                跨章指引
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-[24px] font-bold leading-[32px] text-ink md:text-[28px] md:leading-[36px]">
            {entry.nameCn}
          </h1>
          {entry.nameEn && <p className="mt-1.5 text-[13px] text-ink-mute">{entry.nameEn}</p>}

          {/* 来源 */}
          <section className="mt-6 rounded-lg border border-line bg-surface p-4 shadow-card">
            <h2 className="text-[12px] font-medium tracking-[0.06em] text-ink-mute">来源 SOURCE</h2>
            <p className="mt-2 text-[13px] leading-[21px] text-ink-soft">{entry.source || '—'}</p>
            {entry.doi && (
              <a
                href={`https://doi.org/${entry.doi}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-bench/40 bg-surface px-3 font-mono text-[12px] font-medium text-bench shadow-card transition-colors duration-150 hover:bg-bench-wash"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {entry.doi}
              </a>
            )}
          </section>

          {/* 跨章指引提示 */}
          {isPointer && (
            <section className="mt-4 rounded-lg border border-dashed border-[#B08D57]/50 bg-[#B08D5712] p-4">
              <p className="text-[13px] leading-[21px] text-ink-soft">
                本条目为跨章指引，仅提供方法线索与出处，完整方案请按上方来源查阅原文。
              </p>
            </section>
          )}

          {/* 核心步骤 */}
          {entry.steps.length > 0 && (
            <section className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-card">
              <h2 className="text-[12px] font-medium tracking-[0.06em] text-ink-mute">
                核心步骤 · {entry.steps.length} 步
              </h2>
              <ol className="mt-3 flex flex-col gap-2.5">
                {entry.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bench-wash font-mono text-[11px] font-medium text-bench-ink">
                      {i + 1}
                    </span>
                    <span className="min-w-0 pt-0.5 text-[13px] leading-[20px] text-ink-soft">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 说明：目的与用途 / 原理 */}
          {entry.purpose && (
            <section className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-card">
              <h2 className="text-[12px] font-medium tracking-[0.06em] text-ink-mute">【说明】目的与用途</h2>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-[21px] text-ink-soft">{entry.purpose}</p>
            </section>
          )}
          {entry.principle && (
            <section className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-card">
              <h2 className="text-[12px] font-medium tracking-[0.06em] text-ink-mute">【说明】原理</h2>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-[21px] text-ink-soft">{entry.principle}</p>
            </section>
          )}

          {/* 删除自建条目 */}
          {isCustom && (
            <div className="mt-6 border-t border-line-soft pt-4">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3.5 text-[12.5px] font-medium text-danger transition-colors duration-150 hover:bg-danger/5"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除此自建条目
              </button>
            </div>
          )}

          {/* 存为 Protocol */}
          {!isPointer && (
            <div className="mt-6">
              <button
                type="button"
                disabled={importMut.isPending}
                onClick={handleImport}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-bench px-4 text-[13px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-bench-deep active:scale-[0.97] disabled:opacity-60"
              >
                {importMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                {importMut.isPending ? '导入中…' : '存为 Protocol'}
              </button>
              <p className="mt-2 text-[12px] text-ink-mute">
                将以「方法库导入」分类创建到你的实验方法中，来源与说明写入描述
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">删除该自建条目？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              「{entry?.nameCn}」将从方法库中移除，此操作不可恢复；已存为 Protocol 的副本不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMut.isPending}
              onClick={(ev) => {
                ev.preventDefault()
                if (entry) removeMut.mutate({ id: entry.id })
              }}
              className="rounded-lg bg-danger text-white hover:bg-danger/90"
            >
              {removeMut.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
