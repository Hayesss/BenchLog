import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Pencil,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { downscaleToDataURL } from './record-image-utils'
import { EASE_OUT, IMAGE_KINDS, KIND_COLOR } from './record-types'
import type { RecordImageItem } from './record-types'

export type RecordImageGalleryHandle = {
  /** open the file picker (camera capture on request — mobile 拍照) */
  pick: (withCamera?: boolean) => void
  uploadFiles: (files: File[]) => void
}

type Pending = { key: string; name: string }

const RecordImageGallery = forwardRef<
  RecordImageGalleryHandle,
  {
    recordId: number | null
    images: RecordImageItem[]
    /** when recordId is null the page saves a draft first and returns the new id */
    ensureRecordId: () => Promise<number>
  }
>(function RecordImageGallery({ recordId, images, ensureRecordId }, ref) {
  const utils = trpc.useUtils()
  const [pending, setPending] = useState<Pending[]>([])
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const uploadMut = trpc.image.upload.useMutation()
  const removeMut = trpc.image.remove.useMutation({
    onSuccess: async () => {
      toast.success('图片已删除')
      if (recordId) await utils.record.byId.invalidate({ id: recordId })
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      if (imgs.length === 0) return
      let rid = recordId
      try {
        if (rid == null) rid = await ensureRecordId()
      } catch {
        toast.error('请先保存记录，再上传图片')
        return
      }
      for (const f of imgs) {
        const key = `${Date.now()}-${f.name}-${Math.random()}`
        setPending((p) => [...p, { key, name: f.name }])
        try {
          const { data, mime } = await downscaleToDataURL(f)
          await uploadMut.mutateAsync({ recordId: rid, mime, data })
        } catch (e) {
          toast.error(`「${f.name}」上传失败：${e instanceof Error ? e.message : ''}`)
        } finally {
          setPending((p) => p.filter((x) => x.key !== key))
        }
      }
      await utils.record.byId.invalidate({ id: rid })
      toast.success('已插入图片')
    },
    [recordId, ensureRecordId, uploadMut, utils],
  )

  useImperativeHandle(
    ref,
    () => ({
      pick: (withCamera) => {
        const input = withCamera ? cameraInputRef.current : fileInputRef.current
        input?.click()
      },
      uploadFiles: (files) => void uploadFiles(files),
    }),
    [uploadFiles],
  )

  // lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIdx == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i == null ? i : (i - 1 + images.length) % images.length))
      if (e.key === 'ArrowRight') setLightboxIdx((i) => (i == null ? i : (i + 1) % images.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, images.length])

  const onInputChange = (list: FileList | null) => {
    if (list && list.length > 0) void uploadFiles([...list])
  }

  return (
    <div>
      {/* hidden inputs — camera input uses capture="environment" for mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onInputChange(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onInputChange(e.target.files)
          e.target.value = ''
        }}
      />

      {/* upload dropzone */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onInputChange(e.dataTransfer.files)
        }}
        className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-paper/60 text-ink-mute transition-colors duration-150 hover:border-bench hover:text-bench"
      >
        <Camera className="h-5 w-5" strokeWidth={1.6} />
        <span className="text-[12.5px]">点击上传或拖拽图片到这里 · 手机上可直接拍照</span>
      </button>

      {/* grid: 3 cols desktop / 2 cols mobile */}
      {(images.length > 0 || pending.length > 0) && (
        <motion.div layout className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <AnimatePresence initial={false}>
            {images.map((img, idx) => (
              <motion.figure
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="group relative overflow-hidden rounded-md border border-line bg-paper"
              >
                <motion.img
                  layoutId={`record-img-${img.id}`}
                  src={img.data}
                  alt={img.caption ?? '结果图片'}
                  onClick={() => setLightboxIdx(idx)}
                  className="aspect-[4/3] w-full cursor-zoom-in object-cover"
                />
                {/* kind chip */}
                <span
                  className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-px font-mono text-[10.5px] font-medium text-white"
                  style={{ backgroundColor: `${KIND_COLOR[img.kind] ?? '#8A9099'}CC` }}
                >
                  {img.kind}
                </span>
                {/* hover actions */}
                <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                  {[
                    { icon: ZoomIn, label: '放大', onClick: () => setLightboxIdx(idx) },
                    { icon: Pencil, label: '编辑图注', onClick: () => setLightboxIdx(idx) },
                    {
                      icon: Trash2,
                      label: '删除',
                      onClick: () => removeMut.mutate({ id: img.id }),
                    },
                  ].map(({ icon: Icon, label, onClick }, i) => (
                    <motion.button
                      key={label}
                      type="button"
                      title={label}
                      aria-label={label}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.05, duration: 0.15 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onClick()
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/95 text-ink-soft shadow-card transition-colors duration-150 hover:text-ink"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </motion.button>
                  ))}
                </div>
                {img.caption && (
                  <figcaption className="truncate px-2 py-1.5 text-[11.5px] text-ink-soft">
                    {img.caption}
                  </figcaption>
                )}
              </motion.figure>
            ))}
            {/* uploading placeholders with progress ring */}
            {pending.map((p) => (
              <motion.div
                key={p.key}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border border-line bg-paper"
              >
                <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#E9E6DF" strokeWidth="3" />
                  <motion.circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#3E7C6B"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="94.2"
                    initial={{ strokeDashoffset: 94.2 }}
                    animate={{ strokeDashoffset: [94.2, 30, 60] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </svg>
                <span className="max-w-[90%] truncate font-mono text-[10.5px] text-ink-mute">
                  {p.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* lightbox */}
      <Lightbox
        images={images}
        idx={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onNav={(dir) =>
          setLightboxIdx((i) =>
            i == null ? i : (i + dir + images.length) % Math.max(images.length, 1),
          )
        }
        recordId={recordId}
      />
    </div>
  )
})

export default RecordImageGallery

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */
function Lightbox({
  images,
  idx,
  onClose,
  onNav,
  recordId,
}: {
  images: RecordImageItem[]
  idx: number | null
  onClose: () => void
  onNav: (dir: -1 | 1) => void
  recordId: number | null
}) {
  const utils = trpc.useUtils()
  const img = idx != null ? images[idx] : null
  const updateMut = trpc.image.update.useMutation({
    onSuccess: async () => {
      if (recordId) await utils.record.byId.invalidate({ id: recordId })
      toast.success('图注已更新')
    },
    onError: (e) => toast.error(`更新失败：${e.message}`),
  })
  const removeMut = trpc.image.remove.useMutation({
    onSuccess: async () => {
      if (recordId) await utils.record.byId.invalidate({ id: recordId })
      toast.success('图片已删除')
      onClose()
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  })

  const download = () => {
    if (!img) return
    const a = document.createElement('a')
    a.href = img.data
    a.download = `${img.caption || `record-image-${img.id}`}.${img.mime.includes('png') ? 'png' : 'jpg'}`
    a.click()
  }

  return (
    <AnimatePresence>
      {img && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#21252B]/80 p-4 backdrop-blur-[8px]"
        >
          {/* close */}
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {/* nav arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张"
                onClick={(e) => {
                  e.stopPropagation()
                  onNav(-1)
                }}
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="下一张"
                onClick={(e) => {
                  e.stopPropagation()
                  onNav(1)
                }}
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <motion.div
            layoutId={`record-img-${img.id}`}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[86dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-xl bg-surface shadow-overlay"
          >
            <div className="flex min-h-0 flex-1 items-center justify-center bg-ink/95">
              <img
                src={img.data}
                alt={img.caption ?? '结果图片'}
                className="max-h-[62dvh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              {/* kind selector */}
              <div className="flex items-center gap-1">
                {IMAGE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => updateMut.mutate({ id: img.id, kind: k })}
                    className={cn(
                      'h-6 rounded-full px-2 font-mono text-[10.5px] font-medium transition-all duration-150',
                      img.kind === k ? 'text-white' : 'bg-paper text-ink-mute hover:text-ink',
                    )}
                    style={img.kind === k ? { backgroundColor: KIND_COLOR[k] } : undefined}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-ink-mute">
                {(idx ?? 0) + 1} / {images.length}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  title="下载"
                  aria-label="下载图片"
                  onClick={download}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-ink"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="删除"
                  aria-label="删除图片"
                  onClick={() => removeMut.mutate({ id: img.id })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors duration-150 hover:bg-[#B4564E1F] hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {/* caption edit — keyed per image so state resets on navigation */}
              <CaptionEditor
                key={img.id}
                initial={img.caption ?? ''}
                onSave={(caption) => updateMut.mutate({ id: img.id, caption })}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Caption editor (own state, reset via key on image change)           */
/* ------------------------------------------------------------------ */
function CaptionEditor({
  initial,
  onSave,
}: {
  initial: string
  onSave: (caption: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  if (!editing) {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => {
            setDraft(initial)
            setEditing(true)
          }}
          className="flex items-center gap-1.5 text-[12.5px] text-ink-soft transition-colors duration-150 hover:text-bench"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {initial || '添加图注…'}
        </button>
      </div>
    )
  }
  const save = () => {
    onSave(draft.trim() || null)
    setEditing(false)
  }
  return (
    <div className="flex w-full gap-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="如：GFP 荧光，48h，10×"
        className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-bench"
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <button
        type="button"
        onClick={save}
        className="h-9 rounded-lg bg-bench px-3 text-[13px] font-medium text-white hover:bg-bench-deep"
      >
        保存
      </button>
    </div>
  )
}
