import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, ListPlus, Play } from 'lucide-react'
import type { Playlist, Track } from '../shared/types'
import { Cover } from '../components/Cover'
import { TrackList } from '../components/TrackList'
import { api, failureText } from '../lib/api'
import { useAppStore } from '../lib/store'

export function PlaylistDetail() {
  const { id = '' } = useParams()
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const playPlaylist = useAppStore((s) => s.playPlaylist)
  const queueAdd = useAppStore((s) => s.queueAdd)
  const notify = useAppStore((s) => s.notify)

  useEffect(() => {
    setLoading(true)
    api.catalog
      .playlist(id)
      .then((res) => {
        if (!res.ok) {
          notify({ kind: 'error', text: failureText(res) ?? '歌单加载失败' })
          return
        }
        setPlaylist(res.data.playlist)
        setTracks(res.data.tracks)
      })
      .catch((error) => console.error('[playlist]', error))
      .finally(() => setLoading(false))
  }, [id, notify])

  const totalMinutes = Math.round(tracks.reduce((sum, t) => sum + t.durationMs, 0) / 60000)

  return (
    <div className="animate-fade-up px-8 pb-10 pt-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[11.5px] text-cloud-500 transition hover:text-cloud-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回发现
      </Link>

      <header className="mt-5 flex flex-col gap-7 md:flex-row md:items-end">
        <Cover
          src={playlist?.coverUrl}
          alt={playlist?.name ?? '歌单'}
          className="h-[196px] w-[196px] shrink-0 shadow-2xl"
          rounded="rounded-2xl"
          seed={playlist?.name ?? id}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] uppercase tracking-[0.28em] text-ncm-light">playlist</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight text-cloud-100">
            {loading ? '正在加载歌单…' : playlist?.name ?? '未命名歌单'}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] text-cloud-500">
            <span className="rounded-full bg-white/6 px-2 py-0.5 text-cloud-400">
              {playlist?.creator ?? '网易云音乐'}
            </span>
            <span>{tracks.length || playlist?.trackCount || 0} 首</span>
            {totalMinutes > 0 && <span>约 {totalMinutes} 分钟</span>}
          </div>

          {playlist?.description && (
            <p className="mt-3 max-w-[560px] text-[12px] leading-relaxed text-cloud-500">{playlist.description}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (tracks.length === 0) {
                  notify({ kind: 'info', text: '歌单里还没有可播放的歌曲' })
                  return
                }
                void playPlaylist(id, tracks)
              }}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-ncm to-ncm-deep px-5 py-2.5 text-[12.5px] font-medium text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              播放全部
            </button>
            <button
              type="button"
              onClick={() => {
                tracks.slice(0, 20).forEach((track) => void queueAdd(track))
              }}
              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-[12px] text-cloud-300 transition hover:border-white/20 hover:text-cloud-100"
            >
              <ListPlus className="h-3.5 w-3.5" />
              加入队列
            </button>
            <button
              type="button"
              aria-label="收藏歌单"
              onClick={() => setLiked((v) => !v)}
              className={liked ? 'text-ncm' : 'text-cloud-500 transition hover:text-cloud-100'}
            >
              <Heart className={liked ? 'h-5 w-5 fill-ncm' : 'h-5 w-5'} />
            </button>
          </div>
        </div>
      </header>

      <section className="mt-8 rounded-2xl border border-white/6 bg-white/[0.02] p-2">
        <TrackList
          tracks={tracks}
          heightClass="h-[calc(100vh-470px)]"
          emptyHint={loading ? '正在加载曲目…' : '这个歌单暂时没有可播放的歌曲'}
        />
      </section>
    </div>
  )
}
