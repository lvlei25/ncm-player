import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Notice } from './components/Notice'
import { PlayerBar } from './components/PlayerBar'
import { QueueDrawer } from './components/QueueDrawer'
import { RightPanel, type PanelTab } from './components/RightPanel'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { coverGradient } from './lib/format'
import { useAppStore } from './lib/store'
import { Discover } from './pages/Discover'
import { NowPlaying } from './pages/NowPlaying'
import { PlaylistDetail } from './pages/PlaylistDetail'
import { Search } from './pages/Search'
import { Setup } from './pages/Setup'

export default function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const ready = useAppStore((s) => s.ready)
  const session = useAppStore((s) => s.session)
  const env = useAppStore((s) => s.env)
  const current = useAppStore((s) => s.playback.current)

  const [collapsed, setCollapsed] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<PanelTab>('lyric')
  const [queueOpen, setQueueOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (panelTab === 'ai') setPanelOpen(true)
  }, [panelTab])

  const needsSetup = Boolean(ready && session && (!session.configured || !session.loggedIn))
  const onSetupRoute = location.pathname === '/setup'

  const openPanel = (tab: PanelTab) => {
    setPanelTab(tab)
    setPanelOpen(true)
  }

  if (!ready) {
    return (
      <div className="flex h-screen flex-col bg-ink-950">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-16 animate-spin-slow rounded-full border border-white/10 bg-ink-800">
              <div className="absolute inset-6 rounded-full bg-gradient-to-br from-ncm-light to-ncm-deep" />
            </div>
            <p className="text-[11px] tracking-[0.3em] text-cloud-500">正在连接 NCM-CLI</p>
          </div>
        </div>
      </div>
    )
  }

  if ((needsSetup || onSetupRoute) && location.pathname !== '/now') {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
        <TitleBar />
        <Setup
          env={env}
          session={session}
          onDone={() => {
            window.location.hash = '#/'
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-ink-950">
      {/* 氛围背景：随封面渐变 + 模糊大图 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70 transition-all duration-700"
        style={{ backgroundImage: coverGradient(current?.name ?? 'black-vinyl') }}
      />
      {current?.coverUrl && (
        <img
          src={current.coverUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] scale-110 rounded-full object-cover opacity-[0.16] blur-3xl"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/80 to-ink-950" />

      <TitleBar />

      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onOpenPanel={openPanel}
          onOpenQueue={() => setQueueOpen(true)}
          activeTab={panelTab}
          panelOpen={panelOpen}
        />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Discover />} />
              <Route path="/search" element={<Search />} />
              <Route path="/playlist/:id" element={<PlaylistDetail />} />
              <Route path="/now" element={<NowPlaying />} />
              <Route path="/setup" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {location.pathname !== '/now' && (
          <RightPanel
            open={panelOpen}
            tab={panelTab}
            onTab={setPanelTab}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      <PlayerBar
        onOpenQueue={() => setQueueOpen(true)}
        onOpenLyric={() => openPanel('lyric')}
        activeLyric={panelOpen && panelTab === 'lyric'}
      />

      <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
      <Notice />
    </div>
  )
}
