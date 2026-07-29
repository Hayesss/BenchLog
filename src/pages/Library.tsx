import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, BookMarked, BookmarkPlus, FolderInput, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
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

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

type EntryItem = {
  id: number
  entryId: number
  chapterNo: number
  section: string
  nameCn: string
  nameEn: string
  type: string
  journal: string
  year: string
  doi: string
  purposeExcerpt: string
}

export default function Library() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const chaptersQuery = trpc.library.chapters.useQuery()

  const chapterNo = Number(searchParams.get('chapter') ?? '0') || undefined
  const q = searchParams.get('q') ?? ''

  /* 搜索防抖 300ms */
  const [searchInput, setSearchInput] = useState(q)
  useEffect(() => setSearchInput(q), [q])
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) patchParams({ q: searchInput || null })
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  const searching = q.trim().length > 0
  const entriesQuery = trpc.library.entries.useQuery({
    chapterNo: searching ? undefined : chapterNo,
    q: searching ? q.trim() : undefined,
  })

  const utils = trpc.useUtils()
  const importChapterMut = trpc.library.importChapter.useMutation()
  const importEntryMut = trpc.library.importAsProtocol.useMutation()
  const [chapterImportOpen, setChapterImportOpen] = useState(false)
  const [importingEntryId, setImportingEntryId] = useState<number | null>(null)

  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data])
  const entries = (entriesQuery.data ?? []) as EntryItem[]
  const totalEntries = chapters.reduce((n, c) => n + c.entryCount, 0)
  const chapterTitle = (no: number) => chapters.find((c) => c.chapterNo === no)?.title ?? ''
  /* 当前章节视图中的完整条目数（整章导入的范围） */
  const fullCount = !searching && chapterNo ? entries.filter((e) => e.type === 'full').length : 0

  async function handleChapterImport() {
    if (!chapterNo) return
    try {
      const res = await importChapterMut.mutateAsync({ chapterNo })
      toast.success(`导入 ${res.imported} 条，跳过 ${res.skipped} 条同名`)
      await utils.protocol.list.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '整章导入失败，请重试')
    }
  }

  async function handleQuickSave(entry: EntryItem, ev: MouseEvent) {
    ev.stopPropagation()
    ev.preventDefault()
    if (importingEntryId != null) return
    setImportingEntryId(entry.id)
    try {
      await importEntryMut.mutateAsync({ id: entry.id })
      toast.success('已存为 Protocol')
      await utils.protocol.list.invalidate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败，请重试')
    } finally {
      setImportingEntryId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-16 md:px-8">
      <ProtocolToaster />
      {/* 页头 */}
      <div className="pt-8">
        <h1 className="font-display text-[24px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[38px]">
          实验方法库
        </h1>
        <p className="caption-en mt-1" style={{ letterSpacing: '0.08em' }}>
          Method Library
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          收录 {chapters.length} 章 · {totalEntries} 条经同行评议的实验方案，可一键存为我的 Protocol
        </p>
      </div>

      {/* 搜索框 */}
      <div className="relative mt-5 w-full sm:w-[360px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索方法名、期刊、来源…"
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink shadow-card outline-none transition-colors duration-150 placeholder:text-ink-mute focus:border-bench"
        />
      </div>

      <div className="mt-6 flex gap-6">
        {/* 桌面：左侧章节栏 */}
        {!searching && (
          <aside className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-0.5 md:flex">
            {chaptersQuery.isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-bench-wash/50" />
                ))
              : chapters.map((c) => {
                  const active = chapterNo === c.chapterNo
                  return (
                    <button
                      key={c.chapterNo}
                      type="button"
                      onClick={() => patchParams({ chapter: active ? null : String(c.chapterNo) })}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150',
                        active ? 'bg-bench-wash font-medium text-bench-ink' : 'text-ink-soft hover:bg-bench-wash/60 hover:text-ink',
                      )}
                    >
                      <span className="shrink-0 font-mono text-[11px] text-ink-mute">
                        {String(c.chapterNo).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-mute">{c.entryCount}</span>
                    </button>
                  )
                })}
          </aside>
        )}

        <div className="min-w-0 flex-1">
          {/* 移动端：章节横滚 chips */}
          {!searching && (
            <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 md:hidden">
              {chapters.map((c) => {
                const active = chapterNo === c.chapterNo
                return (
                  <button
                    key={c.chapterNo}
                    type="button"
                    onClick={() => patchParams({ chapter: active ? null : String(c.chapterNo) })}
                    className={cn(
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors duration-150',
                      active ? 'bg-bench-wash text-bench-ink' : 'border border-line bg-surface text-ink-soft',
                    )}
                  >
                    {c.title}
                    <span className="font-mono text-[10.5px] text-ink-mute">{c.entryCount}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* 列表标题行 */}
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold leading-[22px] tracking-[0.01em] text-ink">
              {searching ? `「${q.trim()}」的搜索结果` : chapterNo ? `第 ${chapterNo} 章 · ${chapterTitle(chapterNo)}` : '全部条目'}
            </h2>
            <span className="font-mono text-[12px] text-ink-mute">{entries.length}</span>
            {!searching && chapterNo && (
              <button
                type="button"
                disabled={importChapterMut.isPending || fullCount === 0}
                onClick={() => setChapterImportOpen(true)}
                className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-bench/40 bg-surface px-3 text-[12.5px] font-medium text-bench shadow-card transition-colors duration-150 hover:bg-bench-wash disabled:opacity-60"
              >
                {importChapterMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderInput className="h-3.5 w-3.5" />
                )}
                {importChapterMut.isPending ? '导入中…' : '整章导入为 Protocol'}
              </button>
            )}
          </div>

          {/* 条目卡片列表 */}
          {entriesQuery.isLoading ? (
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[120px] animate-pulse rounded-lg border border-line bg-surface" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center py-24">
              <BookMarked className="h-10 w-10 text-ink-mute" strokeWidth={1.5} />
              <h3 className="mt-4 font-display text-[18px] font-semibold text-ink">未找到匹配条目</h3>
              <p className="mt-1 text-[12.5px] text-ink-mute">
                {searching ? '试试更换关键词，或按章节浏览' : '该章节暂无条目'}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {entries.map((e, i) => (
                <motion.button
                  key={e.id}
                  type="button"
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="show"
                  onClick={() => navigate(`/library/${e.id}`)}
                  className="group flex flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-card transition-shadow duration-180 hover:shadow-card-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 font-display text-[16px] font-semibold leading-[23px] text-ink">
                      {e.nameCn}
                    </h3>
                    <span className="flex shrink-0 items-center gap-2">
                      {e.type !== 'pointer' && (
                        <span
                          role="button"
                          aria-label={`存为 Protocol：${e.nameCn}`}
                          onClick={(ev) => void handleQuickSave(e, ev)}
                          className="flex h-7 items-center gap-1 rounded-md border border-bench/40 bg-surface px-2 text-[12px] font-medium text-bench transition-colors duration-150 hover:bg-bench-wash"
                        >
                          {importingEntryId === e.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BookmarkPlus className="h-3.5 w-3.5" />
                          )}
                          {importingEntryId === e.id ? '存为中…' : '存为'}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 pt-1 text-[12.5px] font-medium text-bench">
                        查看
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1" />
                      </span>
                    </span>
                  </div>
                  {e.nameEn && (
                    <p className="mt-0.5 text-[12px] leading-[17px] text-ink-mute">{e.nameEn}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-bench-wash px-2 py-0.5 font-mono text-[11px] font-medium text-bench-ink">
                      {e.journal}
                      {e.year ? ` · ${e.year}` : ''}
                    </span>
                    <span className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-mute">
                      {e.section}
                    </span>
                    {e.type === 'pointer' && (
                      <span className="rounded-full bg-[#B08D571F] px-2 py-0.5 text-[11px] font-medium text-[#8a6a3f]">
                        跨章指引
                      </span>
                    )}
                    {searching && (
                      <span className="text-[11px] text-ink-mute">第 {e.chapterNo} 章</span>
                    )}
                  </div>
                  {e.purposeExcerpt && (
                    <p className="mt-2 text-[12.5px] leading-[19px] text-ink-soft">
                      {e.purposeExcerpt}
                    </p>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 整章导入确认 */}
      <AlertDialog open={chapterImportOpen} onOpenChange={setChapterImportOpen}>
        <AlertDialogContent className="rounded-xl border-line">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[18px]">整章导入为 Protocol？</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-ink-soft">
              将把本章 {fullCount} 个完整条目导入你的协议库，同名协议自动跳过。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-line">取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={importChapterMut.isPending}
              onClick={(ev) => {
                ev.preventDefault()
                void handleChapterImport().finally(() => setChapterImportOpen(false))
              }}
              className="rounded-lg bg-bench text-white hover:bg-bench-deep"
            >
              {importChapterMut.isPending ? '导入中…' : '确认导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
