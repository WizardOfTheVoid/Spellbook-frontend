<script lang="ts">
  import 'vidstack/player/styles/default/theme.css'
  import 'vidstack/player/styles/default/layouts/video.css'
  import 'vidstack/player'
  import 'vidstack/player/ui'
  import 'vidstack/player/layouts/default'
  import type {} from 'vidstack/svelte'
  import type { MediaDurationChangeEvent, MediaStorage, MediaVolumeChangeEvent } from 'vidstack'
  import type { EvidenceComment } from '$lib/core'
  import { readEvidenceVolume, saveEvidenceVolume } from './evidenceViewerState'
  import { EvidencePlayback } from './evidencePlayback'
  import { evidencePositionMs, evidenceSeekPosition } from './evidenceTimeline'
  import EvidenceTimeline from './evidenceTimeline.svelte'

  export let src: string
  export let poster: string | null = null
  export let menuContainer: string
  export let onView: (() => void) | null = null
  export let comments: EvidenceComment[] = []
  export let selectedCommentId: number | null = null
  export let onSelectComment: (id: number) => void = () => undefined
  export let onTimeChange: (positionMs: number) => void = () => undefined
  let player: HTMLElementTagNameMap[`media-player`] | undefined
  let durationMs = 0
  let viewed = false
  const playback = new EvidencePlayback()
  let volume = 0.5
  try { if (typeof window !== `undefined`) volume = readEvidenceVolume(window.localStorage) }
  catch { /* Playback remains usable when storage is unavailable. */ }

  const storage: MediaStorage = {
    getVolume: async () => volume,
    getMuted: async () => null,
    getTime: async () => null,
    getLang: async () => null,
    getCaptions: async () => null,
    getPlaybackRate: async () => null,
    getVideoQuality: async () => null,
    getAudioGain: async () => null
  }

  function volumeChanged(event: MediaVolumeChangeEvent): void {
    if (!event.triggers.hasType(`media-volume-change-request`) && !event.triggers.hasType(`media-unmute-request`)) return
    volume = event.detail.volume
    try { saveEvidenceVolume(window.localStorage, volume) }
    catch { /* Playback remains usable when storage is unavailable. */ }
  }

  function startWatching(): void {
    if (player && !player.paused && !player.state.seeking && !player.state.waiting && !document.hidden) {
      playback.start(player.currentTime, performance.now())
    }
  }

  function sampleWatching(stop = false): void {
    if (!player) return
    if (document.hidden) {
      playback.suspend()
      return
    }
    const reached = stop
      ? playback.stop(player.currentTime, performance.now(), player.playbackRate)
      : playback.sample(player.currentTime, performance.now(), player.playbackRate)
    if (!viewed && reached) {
      viewed = true
      onView?.()
    }
  }

  function visibilityChanged(): void {
    if (document.hidden) playback.suspend()
    else startWatching()
  }

  export function getPositionMs(): number {
    return evidencePositionMs(player?.currentTime ?? 0, player?.duration)
  }

  export function seek(positionMs: number): void {
    const position = evidenceSeekPosition(positionMs, (player?.duration ?? 0) * 1000)
    if (!player || position === null) return
    playback.suspend()
    player.currentTime = position / 1000
    onTimeChange(position)
  }

  function timeChanged(): void {
    sampleWatching()
    onTimeChange(getPositionMs())
  }

  function durationChanged(event: MediaDurationChangeEvent): void {
    durationMs = Number.isFinite(event.detail) && event.detail > 0 ? Math.floor(event.detail * 1000) : 0
  }

  function selectComment(id: number): void {
    const comment = comments.find(item => item.id === id)
    if (typeof comment?.positionMs === `number`) seek(comment.positionMs)
    selectedCommentId = id
    onSelectComment(id)
  }
</script>

<svelte:document on:visibilitychange={visibilityChanged} />

<media-player bind:this={player} title="Cheating evidence" {src} {storage} poster={poster ?? undefined} autoplay playsinline
  on:volume-change={volumeChanged} on:playing={startWatching} on:seeked={startWatching} on:rate-change={startWatching}
  on:duration-change={durationChanged} on:time-update={timeChanged} on:pause={() => sampleWatching(true)} on:ended={() => sampleWatching(true)}
  on:waiting={() => sampleWatching(true)} on:seeking={() => playback.suspend()} on:error={() => playback.suspend()}>
  <media-provider></media-provider>
  <media-video-layout {menuContainer} colorScheme="dark"></media-video-layout>
  <EvidenceTimeline {player} {comments} {durationMs} {selectedCommentId} onSelectComment={selectComment} />
</media-player>

<style lang="scss">
  media-player { width: 100%; height: 100%; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; aspect-ratio: auto; --video-border-radius: 0; }
  media-provider { min-width: 0; height: 100%; aspect-ratio: auto; }
  media-player :global(video) { width: 100%; height: 100%; aspect-ratio: auto; object-fit: contain; }
</style>
