import { music } from './audio'
import { lite } from './lite'

/**
 * Corner overlay for testing on real devices. Loaded only when the URL has
 * ?debug, so it costs nothing otherwise.
 */
export function initDebug(scene: () => string) {
  const el = document.createElement('pre')
  el.className = 'debug'
  el.setAttribute('aria-hidden', 'true')
  document.body.append(el)

  let frames = 0
  let fps = 0
  let last = performance.now()
  const frame = (now: number) => {
    frames++
    if (now - last >= 500) {
      fps = Math.round((frames * 1000) / (now - last))
      frames = 0
      last = now
      render()
    }
    requestAnimationFrame(frame)
  }

  const render = () => {
    const audio = music.debug
    el.textContent = [
      `FPS    ${fps}`,
      `LITE   ${lite.on ? 'ON' : 'off'} · ${lite.reason}`,
      `AUDIO  ${audio.context} · ${audio.session}`,
      `TRACK  ${audio.track}${audio.muted ? ' (muted)' : ''}`,
      `SCENE  ${scene()}`,
    ].join('\n')
  }

  render()
  requestAnimationFrame(frame)
}
