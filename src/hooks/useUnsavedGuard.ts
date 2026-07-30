import { useEffect } from 'react'

/**
 * 未保存内容保护：有未保存修改时，刷新/关闭标签页弹出浏览器确认框。
 *
 * 覆盖：浏览器刷新、关闭标签页、关闭窗口。
 * 不覆盖：应用内路由跳转——react-router v7 声明式 <Routes> 模式不支持
 * useBlocker（需 data router），应用内拦截待路由模式迁移后补充。
 *
 * 用法：任一字段变更时 setDirty(true)，保存成功/初始加载后 setDirty(false)。
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
