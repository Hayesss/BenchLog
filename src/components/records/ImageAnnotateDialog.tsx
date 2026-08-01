import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Eraser, PenLine, Square, Type, Undo2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Tool = 'pen' | 'arrow' | 'rect' | 'text'

/** 标注色板（低饱和，贴合设计 token） */
const COLORS = ['#D64545', '#E8912D', '#F2C94C', '#3E7C6B', '#4A6FA5', '#222222']

const MAX_STACK = 30

/**
 * P2-D1 图片标注：画笔/箭头/矩形/文字 + 6 色 + 撤销 + 清空。
 * 纯 canvas 自绘零依赖；保存为 PNG dataURL 回写编辑器 image 节点。
 */
export default function ImageAnnotateDialog({
  open,
  onOpenChange,
  src,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  src: string | null
  onSave: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const stackRef = useRef<ImageData[]>([])
  const drawingRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const penPrevRef = useRef<{ x: number; y: number } | null>(null)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [ready, setReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  /** 载入底图：canvas 用原图分辨率，CSS 限宽等比缩放 */
  useEffect(() => {
    if (!open || !src) return
    setReady(false)
    stackRef.current = []
    setCanUndo(false)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const cv = canvasRef.current
      if (!cv) return
      cv.width = img.naturalWidth
      cv.height = img.naturalHeight
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      // 底图作为栈底（撤销到最初状态 = 清空标注）
      stackRef.current = [ctx.getImageData(0, 0, cv.width, cv.height)]
      setReady(true)
    }
    img.src = src
  }, [open, src])

  /** 线宽/字号随原图尺寸自适应 */
  const metrics = useCallback(() => {
    const cv = canvasRef.current
    const w = cv?.width ?? 800
    return { lw: Math.max(3, w / 300), font: Math.max(18, w / 40) }
  }, [])

  /** 事件坐标 → canvas 像素坐标（CSS 缩放换算） */
  const toCanvasXY = (e: React.PointerEvent): { x: number; y: number } => {
    const cv = canvasRef.current!
    const rect = cv.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * cv.width,
      y: ((e.clientY - rect.top) / rect.height) * cv.height,
    }
  }

  const snapshot = () => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    stackRef.current.push(ctx.getImageData(0, 0, cv.width, cv.height))
    if (stackRef.current.length > MAX_STACK) stackRef.current.shift()
    setCanUndo(stackRef.current.length > 1)
  }

  const restoreTop = () => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    const top = stackRef.current[stackRef.current.length - 1]
    if (!cv || !ctx || !top) return
    ctx.putImageData(top, 0, 0)
  }

  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, lw: number) => {
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const head = lw * 4.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6))
    ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const p = toCanvasXY(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'text') {
      const text = window.prompt('标注文字')
      if (text?.trim()) {
        snapshot()
        const { font } = metrics()
        ctx.font = `bold ${font}px sans-serif`
        ctx.lineWidth = Math.max(3, font / 7)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineJoin = 'round'
        ctx.strokeText(text.trim(), p.x, p.y)
        ctx.fillStyle = color
        ctx.fillText(text.trim(), p.x, p.y)
      }
      return
    }

    snapshot()
    drawingRef.current = true
    startRef.current = p
    penPrevRef.current = p
    ctx.strokeStyle = color
    ctx.lineWidth = metrics().lw
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (tool === 'pen') {
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + 0.1, p.y + 0.1) // 单点也能画出圆点
      ctx.stroke()
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !ready) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = toCanvasXY(e)
    const s = startRef.current!
    const { lw } = metrics()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    if (tool === 'pen') {
      ctx.beginPath()
      ctx.moveTo(penPrevRef.current!.x, penPrevRef.current!.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      penPrevRef.current = p
    } else {
      // 箭头/矩形：回滚到本次起点快照再画预览
      restoreTop()
      // restoreTop 后栈顶被消费前的快照需放回——putImageData 不改栈，直接继续
      if (tool === 'arrow') drawArrow(ctx, s.x, s.y, p.x, p.y, lw)
      else {
        ctx.beginPath()
        ctx.strokeRect(Math.min(s.x, p.x), Math.min(s.y, p.y), Math.abs(p.x - s.x), Math.abs(p.y - s.y))
      }
    }
  }

  const onPointerUp = () => {
    drawingRef.current = false
    startRef.current = null
    penPrevRef.current = null
  }

  const undo = () => {
    if (stackRef.current.length <= 1) return
    stackRef.current.pop() // 弹出当前态
    restoreTop() // 回到上一态
    setCanUndo(stackRef.current.length > 1)
  }

  const clearAll = () => {
    if (stackRef.current.length <= 1) return
    stackRef.current = stackRef.current.slice(0, 1) // 只留底图
    restoreTop()
    setCanUndo(false)
  }

  const save = () => {
    const cv = canvasRef.current
    if (!cv) return
    onSave(cv.toDataURL('image/png'))
    onOpenChange(false)
  }

  const TOOLS: { key: Tool; label: string; icon: typeof PenLine }[] = [
    { key: 'pen', label: '画笔', icon: PenLine },
    { key: 'arrow', label: '箭头', icon: ArrowUpRight },
    { key: 'rect', label: '矩形', icon: Square },
    { key: 'text', label: '文字', icon: Type },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="font-display">图片标注</DialogTitle>
          <DialogDescription className="text-[13px]">
            画笔 / 箭头 / 矩形 / 文字，保存后替换正文中的原图。
          </DialogDescription>
        </DialogHeader>

        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTool(key)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors duration-100',
                tool === key
                  ? 'border-bench bg-bench-wash text-bench-deep'
                  : 'border-line bg-surface text-ink-soft hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setColor(c)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform duration-100 hover:scale-110',
                color === c ? 'border-ink scale-110' : 'border-white shadow-card',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            撤销
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!canUndo}
            className="flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
            清空
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!ready}
            className="ml-auto flex h-8 items-center rounded-lg bg-bench px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-bench-deep disabled:opacity-50"
          >
            保存标注
          </button>
        </div>

        {/* 画布 */}
        <div className="max-h-[62dvh] overflow-auto rounded-xl border border-line bg-paper p-2">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={cn(
              'mx-auto block w-full max-w-[880px] touch-none rounded-lg',
              tool === 'text' ? 'cursor-text' : 'cursor-crosshair',
              !ready && 'opacity-0',
            )}
          />
          {!ready && <p className="py-10 text-center text-[12.5px] text-ink-mute">图片加载中…</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
