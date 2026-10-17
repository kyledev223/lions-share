/**
 * Lite mode: on devices that can't hold ~30fps, drop the layers that are
 * expensive to paint (film grain, the larger glows). CSS does the work via
 * `html.is-lite`; this module only decides when.
 *
 *   ?lite=1  force it on        ?lite=0  force it off
 *
 * Otherwise: measure for 1.5s at load. Under 30fps turns lite on. If the
 * device then holds 50+ fps for 3s it was a slow start, not a slow device, so
 * the effects fade back in. Should that drag it under 30 again, lite comes
 * back and stays.
 */
export interface LiteStatus {
  on: boolean
  /** Human-readable explanation, shown in the ?debug overlay. */
  reason: string
  /** Median frame rate measured at load, or null if it wasn't measured. */
  loadFps: number | null
}

export const lite: LiteStatus = { on: false, reason: 'measuring…', loadFps: null }

const SLOW_FPS = 30
const HEALTHY_FPS = 50
const LOAD_WINDOW = 1500
const HEALTHY_FOR = 3000
const SKIP_FRAMES = 6

function set(on: boolean, reason: string) {
  lite.on = on
  lite.reason = reason
  document.documentElement.classList.toggle('is-lite', on)
}

/**
 * Median frame rate over `ms`, ignoring the first few frames (startup work
 * lands there). Null if the tab was hidden, when frame timing means nothing.
 */
function measure(ms: number): Promise<number | null> {
  return new Promise((resolve) => {
    const gaps: number[] = []
    let hidden = document.hidden
    let seen = 0
    let start = 0
    let prev = 0
    const frame = (now: number) => {
      hidden ||= document.hidden
      if (seen++ >= SKIP_FRAMES) {
        if (!start) start = now
        else gaps.push(now - prev)
      }
      prev = now
      if (!start || now - start < ms) return requestAnimationFrame(frame)
      if (hidden || gaps.length < 3) return resolve(null)
      gaps.sort((a, b) => a - b)
      resolve(Math.round(1000 / gaps[Math.floor(gaps.length / 2)]))
    }
    requestAnimationFrame(frame)
  })
}

/** Resolves once every one of `ms / 1000` consecutive seconds reached `fps` frames. */
function held(fps: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const need = Math.round(ms / 1000)
    let streak = 0
    let count = 0
    let windowStart = 0
    const frame = (now: number) => {
      if (!windowStart) windowStart = now
      count++
      if (now - windowStart >= 1000) {
        streak = !document.hidden && count >= fps ? streak + 1 : 0
        count = 0
        windowStart = now
      }
      if (streak >= need) resolve()
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

export async function initLite() {
  const forced = new URLSearchParams(location.search).get('lite')
  if (forced === '1') return set(true, 'forced on (?lite=1)')
  if (forced === '0') return set(false, 'forced off (?lite=0)')

  const atLoad = await measure(LOAD_WINDOW)
  lite.loadFps = atLoad
  if (atLoad === null) return set(false, 'not measured (tab was hidden at load)')
  if (atLoad >= SLOW_FPS) return set(false, `${atLoad} fps at load`)
  set(true, `${atLoad} fps at load, under ${SLOW_FPS}`)

  await held(HEALTHY_FPS, HEALTHY_FOR)
  set(false, `recovered: held ${HEALTHY_FPS}+ fps for ${HEALTHY_FOR / 1000}s (was ${atLoad} at load)`)

  const withEffects = await measure(LOAD_WINDOW)
  if (withEffects !== null && withEffects < SLOW_FPS) {
    set(true, `${withEffects} fps with effects back on (was ${atLoad} at load); staying lite`)
  }
}
