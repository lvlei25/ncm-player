import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Play, Sparkles } from 'lucide-react'
import type { Playlist, Track } from '../shared/types'
import { Cover } from '../components/Cover'
import { TrackList } from '../components/TrackList'
import { api, failureText } from '../lib/api'
import { artistsText, cn, formatCount, greeting } from '../lib/format'
import { useAppStore } from '../lib/store'

export function Discover() {
  const [daily, setDaily] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const playQueue = useAppStore((s) => s.playQueue)
  const playPlaylist = useAppStore((s) => s.playPlaylist)
  const notify = useAppStore((s) => s.notify)
  const nickname = useAppStore((s) => s.session?.nickname)

  useEffect(() => {
    // CLI 调用是串行的：先取首屏最重要的「每日推荐」，歌单网格随后补上
    api.catalog
      .daily()
      .then((res) => {
        if (res.ok) setDaily(res.data)
        else {
          const err = failureText(res)
          if (err) notify({ kind: 'error', text: err })
        }
        return api.catalog.recommendPlaylists()
      })
      .then((res) => {
        if (res.ok) setPlaylists(res.data)
      })
      .catch((error) => console.error('[discover]', error))
      .finally(() => setLoading(false))
  }, [notify])

  const hero = daily[0]

  return (
    <div className="animate-fade-up px-8 pb-10 pt-7">
      <header className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-cloud-500">{greeting()}</p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-tight text-cloud-100">
            {nickname ? `${nickname}，今天想听点什么` : '今天想听点什么'}
          </h1>
          <p className="mt-2 text-[12.5px] text-cloud-500">
            每日推荐根据你的红心歌曲生成 · 每首歌都值得被认真听完
          </p>
        </div>
        <Link
          to="/search"
          className="hidden items-center gap-1.5 rounded-full border border-white/8 px-3.5 py-1.5 text-[11.5px] text-cloud-400 transition hover:border-ncm/40 hover:text-cloud-100 md:flex"
        >
          去搜索
          <ChevronRight className="h-3 w-3" />
        </Link>
      </header>

      {/* 每日推荐主卡 */}
      <section className="relative mb-9 overflow-hidden rounded-3xl border border-white/8">
        <div className="absolute inset-0">
          <Cover
            src={hero?.coverUrl}
            alt="每日推荐"
            className="h-full w-full opacity-40 blur-[2px]"
            rounded="rounded-3xl"
            seed={hero?.name ?? 'daily'}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
        </div>

        <div className="relative flex items-center gap-7 px-8 py-8">
          <Cover
            src={hero?.coverUrl}
            alt="每日推荐封面"
            className="h-[148px] w-[148px] shrink-0 shadow-2xl"
            rounded="rounded-2xl"
            seed={hero?.name ?? 'daily'}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.24em] text-ncm-light">
              <Sparkles className="h-3 w-3" />
              daily mix
            </div>
            <h2 className="mt-2 text-[24px] font-semibold text-white">每日推荐</h2>
            <p className="mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-cloud-400">
              {loading
                ? '正在为你挑选今天的歌单…'
                : `共 ${daily.length} 首 · 首推《${hero?.name ?? '—'}》 ${hero ? `· ${artistsText(hero.artists)}` : ''}`}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void playQueue(daily, 0)}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-5 py-2.5 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                播放全部
              </button>
              <span className="text-[11px] text-cloud-500">{daily.length} 首 · {Math.round(daily.reduce((sum, t) => sum + t.durationMs, 0) / 60000)} 分钟</span>
            </div>
          </div>
        </div>
      </section>

      {/* 推荐歌单 */}
      <section className="mb-9">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="text-[15px] font-medium text-cloud-100">推荐歌单</h3>
            <p className="mt-1 text-[11px] text-cloud-500">按你的收听习惯挑选</p>
          </div>
          <span className="text-[11px] text-cloud-500">{playlists.length} 个</span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[3/4] animate-pulse rounded-2xl bg-white/[0.04]" />
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/[0.04]" />
              </div>
            ))}

          {!loading &&
            playlists.slice(0, 8).map((playlist) => (
              <div key={playlist.id} className="group relative">
                <div className="relative overflow-hidden rounded-2xl">
                  <Link to={`/playlist/${playlist.id}`} className="block">
                    <Cover
                      src={playlist.coverUrl}
                      alt={playlist.name}
                      className="aspect-[3/4] w-full transition-transform duration-500 group-hover:scale-[1.04]"
                      rounded="rounded-2xl"
                      seed={playlist.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent opacity-70" />
                  </Link>
                  <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink-950/60 px-2 py-0.5 text-[10px] text-cloud-300 backdrop-blur">
                    {formatCount(playlist.trackCount)} 首
                  </span>
                  <button
                    type="button"
                    aria-label={`播放 ${playlist.name}`}
                    onClick={() => {
                      api.catalog
                        .playlist(playlist.id)
                        .then((res) => {
                          if (res.ok)
                            void playPlaylist(playlist.id, res.data.tracks, res.data.playlist?.originalId)
                          else notify({ kind: 'error', text: failureText(res) ?? '歌单加载失败' })
                        })
                        .catch((error) => console.error('[playlist]', error))
                    }}
                    className="absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-ncm text-white opacity-0 shadow-glow transition-all duration-300 hover:brightness-110 group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                </div>
                <div className="mt-3 px-0.5">
                  <p className="truncate text-[12.5px] text-cloud-100">{playlist.name}</p>
                  <p className="mt-1 truncate text-[10.5px] text-cloud-500">
                    {playlist.creator ? `by ${playlist.creator}` : '网易云音乐'}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* 新歌速递 */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-[15px] font-medium text-cloud-100">每日推荐 · 曲目</h3>
            <p className="mt-1 text-[11px] text-cloud-500">点击任意一首开始播放</p>
          </div>
        </div>
        <div className={cn('rounded-2xl border border-white/6 bg-white/[0.02] p-2', loading && 'opacity-60')}>
          <TrackList tracks={daily} heightClass="h-[320px]" emptyHint="还没有拿到每日推荐，检查一下登录状态" />
        </div>
      </section>
    </div>
  )
}
