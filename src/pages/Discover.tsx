import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Play } from 'lucide-react'
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
    // 两个能力各画各的骨架：并行入队，谁先返回谁先渲染（CLI 侧仍由串行队列执行）
    let alive = true
    void Promise.all([
      api.catalog.daily().then((res) => {
        if (!alive) return
        if (res.ok) setDaily(res.data)
        else {
          const err = failureText(res)
          if (err) notify({ kind: 'error', text: err })
        }
      }),
      api.catalog.recommendPlaylists().then((res) => {
        if (!alive) return
        if (res.ok) setPlaylists(res.data)
        else {
          const err = failureText(res)
          if (err) notify({ kind: 'error', text: err })
        }
      }),
    ])
      .catch((error) => console.error('[discover]', error))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [notify])

  const hero = daily[0]

  return (
    <div className="animate-fade-up px-8 pb-10 pt-7">
      <header className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-[12px] text-cloud-500">{greeting()}</p>
          <h1 className="mt-2 text-[30px] font-medium leading-tight text-cloud-100">
            {nickname ? `${nickname}，今日推荐` : '今日推荐'}
          </h1>
          <p className="mt-2 text-[13px] text-cloud-500">
            根据红心歌曲生成，每天更新
          </p>
        </div>
        <Link
          to="/search"
          className="hidden items-center gap-1.5 rounded-lg border border-white/8 px-3.5 py-1.5 text-[12px] text-cloud-400 transition-colors hover:border-ncm/40 hover:text-cloud-100 md:flex"
        >
          去搜索
          <ChevronRight className="h-4 w-4" />
        </Link>
      </header>

      {/* 每日推荐主卡 */}
      <section className="relative mb-9 overflow-hidden rounded-2xl border border-white/8">
        <div className="absolute inset-0">
          <Cover
            src={hero?.coverUrl}
            alt="每日推荐"
            className="h-full w-full opacity-40 blur-[2px]"
            rounded="rounded-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
        </div>

        <div className="relative flex items-center gap-7 px-8 py-8">
          <Cover
            src={hero?.coverUrl}
            alt="每日推荐封面"
            className="h-[148px] w-[148px] shrink-0 shadow-lg"
            rounded="rounded-xl"
          />
          <div className="min-w-0">
            <div className="text-[12px] text-ncm">每天更新</div>
            <h2 className="mt-2 text-[24px] font-medium text-white">每日推荐</h2>
            <p className="mt-2 max-w-[440px] text-[13px] leading-relaxed text-cloud-400">
              {loading
                ? '正在为你挑选今天的歌单…'
                : `共 ${daily.length} 首 · 首推《${hero?.name ?? '—'}》 ${hero ? `· ${artistsText(hero.artists)}` : ''}`}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void playQueue(daily, 0)}
                className="flex items-center gap-2 rounded-lg bg-ncm px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-ncm-deep active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current" />
                播放全部
              </button>
              <span className="text-[12px] tabular-nums text-cloud-500">{daily.length} 首 · {Math.round(daily.reduce((sum, t) => sum + t.durationMs, 0) / 60000)} 分钟</span>
            </div>
          </div>
        </div>
      </section>

      {/* 推荐歌单 */}
      <section className="mb-9">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="text-[16px] font-medium text-cloud-100">推荐歌单</h3>
            <p className="mt-1 text-[11px] text-cloud-500">按你的收听习惯挑选</p>
          </div>
          <span className="text-[11px] tabular-nums text-cloud-500">{playlists.length} 个</span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[3/4] rounded-xl bg-white/[0.04]" />
                <div className="h-3 w-2/3 rounded-md bg-white/[0.04]" />
              </div>
            ))}

          {!loading &&
            playlists.slice(0, 8).map((playlist) => (
              <div key={playlist.id} className="group relative">
                <div className="relative overflow-hidden rounded-xl">
                  <Link to={`/playlist/${playlist.id}`} className="block">
                    <Cover
                      src={playlist.coverUrl}
                      alt={playlist.name}
                      className="aspect-[3/4] w-full"
                      rounded="rounded-xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent opacity-70" />
                  </Link>
                  <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-ink-950/60 px-2 py-0.5 text-[11px] tabular-nums text-cloud-300">
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
                    className="absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-ncm text-white opacity-0 transition-[opacity,transform] duration-300 hover:bg-ncm-deep group-hover:translate-y-0 group-hover:opacity-100"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                </div>
                <div className="mt-3 px-0.5">
                  <p className="truncate text-[13px] text-cloud-100">{playlist.name}</p>
                  <p className="mt-1 truncate text-[11px] text-cloud-500">
                    {playlist.creator ? `来自 ${playlist.creator}` : '网易云音乐'}
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
            <h3 className="text-[16px] font-medium text-cloud-100">每日推荐曲目</h3>
            <p className="mt-1 text-[11px] text-cloud-500">点击任意一首开始播放</p>
          </div>
        </div>
        <div className={cn('rounded-xl border border-white/6 bg-white/[0.02] p-2', loading && 'opacity-60')}>
          <TrackList tracks={daily} heightClass="h-[320px]" emptyHint="还没有拿到每日推荐，检查一下登录状态" />
        </div>
      </section>
    </div>
  )
}
