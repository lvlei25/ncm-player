import { MessageSquareText, Mic2, X } from 'lucide-react'
import { cn } from '../lib/format'
import { AiPanel } from './AiPanel'
import { LyricPanel } from './LyricPanel'

export type PanelTab = 'lyric' | 'ai'

interface RightPanelProps {
  open: boolean
  tab: PanelTab
  onTab: (tab: PanelTab) => void
  onClose: () => void
}

export function RightPanel({ open, tab, onTab, onClose }: RightPanelProps) {
  return (
    <aside
      className={cn(
        'relative z-20 shrink-0 overflow-hidden border-l border-white/5 bg-ink-950/50 transition-[width] duration-300',
        open ? 'w-[356px]' : 'w-0',
      )}
    >
      <div className="flex h-full w-[356px] flex-col">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
          <div className="flex items-center gap-1">
            {(
              [
                { key: 'lyric' as PanelTab, label: '歌词', icon: Mic2 },
                { key: 'ai' as PanelTab, label: 'AI 点歌', icon: MessageSquareText },
              ]
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onTab(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  tab === key ? 'bg-white/[0.07] text-cloud-100' : 'text-cloud-500 hover:text-cloud-300',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="收起面板"
            onClick={onClose}
            className="text-cloud-500 transition-colors hover:text-cloud-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1">{tab === 'lyric' ? <LyricPanel /> : <AiPanel compact />}</div>
      </div>
    </aside>
  )
}
