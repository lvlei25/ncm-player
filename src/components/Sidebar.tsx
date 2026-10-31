import { Compass, ListMusic, Mic2, PanelLeftClose, PanelLeftOpen, Search, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/format'
import { useAppStore } from '../lib/store'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onOpenPanel: (tab: 'lyric' | 'ai') => void
  onOpenQueue: () => void
  activeTab: 'lyric' | 'ai'
  panelOpen: boolean
}

const NAV = [
  { to: '/', label: '发现', icon: Compass },
  { to: '/search', label: '搜索', icon: Search },
]

export function Sidebar({ collapsed, onToggle, onOpenPanel, onOpenQueue, activeTab, panelOpen }: SidebarProps) {
  const session = useAppStore((s) => s.session)
  const queueLength = useAppStore((s) => s.playback.queueLength)

  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 flex-col border-r border-white/5 bg-ink-950/60 py-4 transition-[width] duration-300',
        collapsed ? 'w-[76px]' : 'w-[222px]',
      )}
    >
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                isActive
                  ? 'bg-white/[0.07] text-cloud-100'
                  : 'text-cloud-400 hover:bg-white/[0.04] hover:text-cloud-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ncm" />
                )}
                <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-ncm-light')} />
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => onOpenPanel('lyric')}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
            panelOpen && activeTab === 'lyric'
              ? 'bg-white/[0.07] text-cloud-100'
              : 'text-cloud-400 hover:bg-white/[0.04] hover:text-cloud-100',
          )}
        >
          {panelOpen && activeTab === 'lyric' && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ncm" />
          )}
          <Mic2
            className={cn('h-[18px] w-[18px] shrink-0', panelOpen && activeTab === 'lyric' && 'text-ncm-light')}
          />
          {!collapsed && <span>歌词</span>}
        </button>

        <button
          type="button"
          onClick={() => onOpenPanel('ai')}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
            panelOpen && activeTab === 'ai'
              ? 'bg-white/[0.07] text-cloud-100'
              : 'text-cloud-400 hover:bg-white/[0.04] hover:text-cloud-100',
          )}
        >
          {panelOpen && activeTab === 'ai' && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ncm" />
          )}
          <Sparkles
            className={cn('h-[18px] w-[18px] shrink-0', panelOpen && activeTab === 'ai' && 'text-ncm-light')}
          />
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              AI 点歌
              <span className="rounded-full bg-ncm/15 px-1.5 py-0.5 text-[9px] tracking-wider text-ncm-light">
                NEW
              </span>
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenQueue}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-cloud-400 transition hover:bg-white/[0.04] hover:text-cloud-100"
        >
          <ListMusic className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              播放队列
              <span className="text-[11px] text-cloud-500">{queueLength}</span>
            </span>
          )}
        </button>
      </nav>

      {!collapsed && (
        <div className="mt-6 px-5">
          <p className="text-[10px] uppercase tracking-[0.26em] text-cloud-500">Powered by</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-cloud-500">
            ncm-cli 开放平台
            <br />
            mpv 播放后端
          </p>
        </div>
      )}

      <div className="mt-auto px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          className="mb-3 flex w-full items-center justify-center rounded-xl py-2 text-cloud-500 transition hover:bg-white/5 hover:text-cloud-100"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <div
          className={cn(
            'flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5',
            collapsed && 'justify-center',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ncm to-ncm-deep text-[12px] font-semibold text-white">
            {(session?.nickname ?? '黑').slice(0, 1)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-cloud-100">{session?.nickname ?? '未登录'}</p>
              <p className="truncate text-[10px] text-cloud-500">
                {session?.loggedIn ? '已连接账号' : '扫码后解锁全部能力'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
