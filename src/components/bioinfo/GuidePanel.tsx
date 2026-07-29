import { useState } from 'react'
import { ExternalLink, Loader2, BookOpen } from 'lucide-react'

/**
 * BioML Guide 学习指南：Hayesss/bioml-guide 编译产物自托管于 /guide/，
 * iframe 内嵌（同源静态文件，脚本/样式完全隔离；指南内部为 Hash 路由）。
 */
export default function GuidePanel() {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      {/* 归属栏 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <BookOpen className="h-4 w-4 text-bench" strokeWidth={1.8} />
        <span className="text-[13px] font-medium text-ink">BioML Guide · 生物机器学习学习指南</span>
        <span className="hidden text-[11.5px] text-ink-mute sm:inline">内容内置自开源仓库，可离线浏览</span>
        <a
          href="https://github.com/Hayesss/bioml-guide"
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 text-[12px] font-medium text-bench transition-colors hover:text-bench-deep hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          GitHub 源仓库
        </a>
      </div>
      {/* 内嵌阅读器 */}
      <div className="relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper">
            <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
          </div>
        )}
        <iframe
          src="/guide/index.html"
          title="BioML Guide 学习指南"
          onLoad={() => setLoaded(true)}
          className="h-[calc(100vh-340px)] min-h-[540px] w-full border-0"
        />
      </div>
    </div>
  )
}
