import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Protocols from './pages/Protocols'
import ProtocolDetail from './pages/ProtocolDetail'
import Records from './pages/Records'
import RecordDetail from './pages/RecordDetail'
import Schedule from './pages/Schedule'
import Export from './pages/Export'
import Library from './pages/Library'
import LibraryEntry from './pages/LibraryEntry'

export default function App() {
  return (
    <Routes>
      {/* Login renders full-screen, WITHOUT the AppShell */}
      <Route path="/login" element={<Login />} />
      {/* AppShell: Layout renders <Outlet/> — pages are nested layout-route children */}
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="protocols" element={<Protocols />} />
        <Route path="protocols/:id" element={<ProtocolDetail />} />
        <Route path="records" element={<Records />} />
        <Route path="records/new" element={<RecordDetail />} />
        <Route path="records/:id" element={<RecordDetail />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="library" element={<Library />} />
        <Route path="library/:id" element={<LibraryEntry />} />
        <Route path="export" element={<Export />} />
      </Route>
    </Routes>
  )
}
