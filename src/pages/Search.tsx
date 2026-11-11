import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Search as SearchIcon } from 'lucide-react'
import type { Playlist, SearchType, Track } from '../shared/types'
import { Cover } from '../components/Cover'
import { TrackList } from '../components/TrackList'
import { api, failureText } from '../lib/api'
import { cn, formatCount } from '../lib/format'
import { useAppStore } from '../lib/store'

const TABS: Array<{ key: SearchType; label: string }> = [
  { key: 'song', label: '单曲' },
  { key: 'playlist', label: '歌单' },
  { key: 'artist', label: '歌手' },
  { key: 'album', label: '专辑' },
]

const SUGGESTIONS = ['林俊杰', '深夜 coding', '华语民谣', '坂本龙一', '雨天', '通勤']

export function Search() {
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<SearchType>('song')
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const notify = useAppStore((s) => s.notify)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const value = keyword.trim()
    if (!value) {
      setTracks([])
      setPlaylists([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      api.catalog
        .search(tab, value)
        .then((res) => {
          if (!res.ok) {
            notify({ kind: 'error', text: failureText(res) ?? '搜索失败' })
            setTracks([])
            setPlaylists([])
            return
          }
          setTracks(res.data.tracks)
          setPlaylists(res.data.playlists)
          setTouched(true)
        })
        .catch((error) => console.error('[search]', error))
        .finally(() => setLoading(false))
    }, 320)

    return () => clearTimeout(timer)
  }, [keyword, tab, notify])

  const hasResult = tracks.length > 0 || playlists.length > 0

  return (
    <div className="animate-fade-up px-8 pb-10 pt-7">
      <header className="mx-auto max-w-[880px]">
        <p className="text-[12px] text-cloud-500">搜索</p>
        <h1 className="mt-2 text-[26px] font-medium text-cloud-100">搜索音乐</h1>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 transition-colors focus-within:border-ncm/50">
          <SearchIcon className="h-4 w-4 shrink-0 text-cloud-500" />
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索歌曲、歌手、专辑或歌单"
            className="flex-1 bg-transparent text-[14px] text-cloud-100 outline-none placeholder:text-cloud-500"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-ncm-light" />}
        </div>

        <div className="mt-4 flex items-center gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-[12px] transition-colors',
                tab === item.key
                  ? 'bg-ncm/15 text-ncm-light'
                  : 'text-cloud-500 hover:bg-white/5 hover:text-cloud-300',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-[880px]">
        {!keyword.trim() && (
          <div className="flex flex-col items-center gap-6 py-16">
            <div className="relative h-24 w-24 rounded-full bg-ink-800 vinyl-grooves">
              <div className="absolute inset-8 rounded-full bg-ncm" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-950" />
            </div>
            <div className="text-center">
              <p className="text-[13px] text-cloud-300">搜索一首歌，或者试试下面这些</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setKeyword(s)}
                    className="rounded-lg border border-white/8 px-3 py-1.5 text-[12px] text-cloud-400 transition-colors hover:border-ncm/40 hover:text-cloud-100"
                  >

                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {keyword.trim() && !loading && touched && !hasResult && (
          <div className="flex flex-col items-center gap-2 py-20 text-cloud-500">
            <p className="text-[13px]">没有找到「{keyword}」相关内容</p>
            <p className="text-[11px]">换个关键词，或者检查开放平台配额是否用尽</p>
          </div>
        )}

        {tab !== 'playlist' && tracks.length > 0 && (
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-2">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <p className="text-[12px] text-cloud-400">单曲 · {tracks.length} 首</p>
              <p className="text-[11px] text-cloud-500">点击播放，或加入队列</p>
            </div>
            <TrackList tracks={tracks} heightClass="h-[calc(100vh-420px)]" />
          </div>
        )}

        {playlists.length > 0 && (
          <div className={cn(tab === 'playlist' ? 'mt-0' : 'mt-7')}>
            <p className="mb-3 text-[12px] text-cloud-400">歌单 · {playlists.length} 个</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-2.5 transition-colors hover:border-white/12 hover:bg-white/[0.05]"
                >
                  <Cover
                    src={playlist.coverUrl}
                    alt={playlist.name}
                    className="h-12 w-12 shrink-0"
                    rounded="rounded-lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-cloud-100">{playlist.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-cloud-500">
                      {formatCount(playlist.trackCount)} 首 · {playlist.creator ?? '网易云音乐'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
