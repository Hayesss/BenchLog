import { useState } from 'react'
import { ExternalLink, Loader2, Maximize2 } from 'lucide-react'

/**
 * 学习指南独立插槽（/guide）：BioML Guide（Hayesss/bioml-guide）编译产物
 * 自托管于 /guide/，整页 iframe 内嵌（同源静态文件，脚本/样式完全隔离；
 * 指南内部为 Hash 路由）。高度撑满布局剩余视口：移动端扣除顶栏 3rem 与
 * main 底部留白 5rem，桌面端扣除顶栏 3.5rem，不产生页面级滚动条。
 */
export default function Guide() {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col md:h-[calc(100dvh-3.5rem)]">
      {/* 细工具条：标题 + 源仓库 / 新窗口 */}
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4 md:px-6">
        <span className="text-[13px] font-medium text-ink">BioML Guide</span>
        <span className="hidden text-[11.5px] text-ink-mute sm:inline">
          生物机器学习学习指南 · 内容内置自开源仓库，可离线浏览
        </span>
        <div className="ml-auto flex items-center gap-1">
          <a
            href="https://github.com/Hayesss/bioml-guide"
            target="_blank"
            rel="noreferrer"
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-bench-deep"
          >
            <ExternalLink className="h-3 w-3" />
            源仓库
          </a>
          <a
            href="/guide/index.html"
            target="_blank"
            rel="noreferrer"
            aria-label="在新窗口打开学习指南"
            className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-soft transition-colors duration-150 hover:bg-paper hover:text-bench-deep"
          >
            <Maximize2 className="h-3 w-3" />
            新窗口打开
          </a>
        </div>
      </div>
      {/* 阅读器：撑满剩余空间，无卡片边框 */}
      <div className="relative min-h-0 flex-1 bg-surface">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper">
            <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
          </div>
        )}
        <iframe
          src="/guide/index.html"
          title="BioML Guide 学习指南"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  )
}
