import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
// 首屏关键路径同步加载（避免开局即 fallback 闪屏）
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

/* P2 性能：路由级代码分割——除首屏外全部 lazy，按路由 chunk 按需加载。
   TipTap 全家桶随 RecordDetail chunk 加载（见 vite.config manualChunks vendor-tiptap） */
const ShareView = lazy(() => import('./pages/ShareView'))
const Protocols = lazy(() => import('./pages/Protocols'))
const ProtocolDetail = lazy(() => import('./pages/ProtocolDetail'))
const Records = lazy(() => import('./pages/Records'))
const RecordDetail = lazy(() => import('./pages/RecordDetail'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Export = lazy(() => import('./pages/Export'))
const Library = lazy(() => import('./pages/Library'))
const LibraryEntry = lazy(() => import('./pages/LibraryEntry'))
const Bioinfo = lazy(() => import('./pages/Bioinfo'))
const BioinfoDetail = lazy(() => import('./pages/BioinfoDetail'))
const Guide = lazy(() => import('./pages/Guide'))
const Trash = lazy(() => import('./pages/Trash'))
const Inbox = lazy(() => import('./pages/Inbox'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Samples = lazy(() => import('./pages/Samples'))
const BoxDetail = lazy(() => import('./pages/BoxDetail'))
const Mice = lazy(() => import('./pages/Mice'))
const SharedWithMe = lazy(() => import('./pages/SharedWithMe'))
const Projects = lazy(() => import('./pages/Projects'))

/** 公开页（Layout 外）的全屏加载态 */
function FullLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <p className="text-[12.5px] text-ink-mute">载入中…</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Login renders full-screen, WITHOUT the AppShell */}
      <Route path="/login" element={<Login />} />
      {/* 只读分享公开页（免登录，同样不套 AppShell） */}
      <Route
        path="/share/:token"
        element={
          <Suspense fallback={<FullLoading />}>
            <ShareView />
          </Suspense>
        }
      />
      {/* AppShell: Layout renders <Outlet/> — 子页面的 Suspense 边界在 Layout 内（页面区 loading，框架不动） */}
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="protocols" element={<Protocols />} />
        <Route path="protocols/:id" element={<ProtocolDetail />} />
        <Route path="records" element={<Records />} />
        <Route path="projects" element={<Projects />} />
        <Route path="records/new" element={<RecordDetail />} />
        <Route path="records/:id" element={<RecordDetail />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="library" element={<Library />} />
        <Route path="library/:id" element={<LibraryEntry />} />
        <Route path="bioinfo" element={<Bioinfo />} />
        <Route path="bioinfo/new" element={<BioinfoDetail />} />
        <Route path="bioinfo/:id" element={<BioinfoDetail />} />
        <Route path="guide" element={<Guide />} />
        <Route path="export" element={<Export />} />
        <Route path="trash" element={<Trash />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="samples" element={<Samples />} />
        <Route path="samples/:boxId" element={<BoxDetail />} />
        <Route path="mice" element={<Mice />} />
        <Route path="shared" element={<SharedWithMe />} />
      </Route>
    </Routes>
  )
}
