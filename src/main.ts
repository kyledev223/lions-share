import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './style.css'

import gsap from 'gsap'
import { createAsk } from './ask'
import { initSoundControl, music } from './audio'
import { runBoot } from './boot'
import { initCursor } from './cursor'
import { loadMascot } from './gl/mascot'
import { createEngine, type Engine } from './gl/engine'
import { createEntry } from './gl/entry'
import { setDensity } from './gl/points'
import { createRing } from './gl/ring'
import { buildStages } from './gl/scenes'
import { createLightbox } from './lightbox'
import { initLite } from './lite'
import { buildMemes } from './memes'
import { createNav, type Nav } from './nav'
import { renderScreens } from './screens'
import { hydrateToken } from './token'

const root = document.documentElement
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
const params = new URLSearchParams(location.search)
root.classList.toggle('is-reduced', reduced)
history.scrollRestoration = 'manual'

// Forced lite mode builds half the points up front; measured lite mode thins
// them at draw time instead (engine.ts), since by then they're already built.
if (params.get('lite') === '1') setDensity(0.5)
void initLite()

const views = renderScreens(document.getElementById('screens')!, reduced)
hydrateToken()
initSoundControl()
// Screen 09's question box and live Q&A card; the stage sends the bubbles.
const ask = createAsk(views.find((v) => v.def.id === 'ask')!.el, reduced)

const canvas = document.getElementById('gl') as HTMLCanvasElement
const site = document.getElementById('site')!
let nav: Nav
/** Loader progress: the mascot's download is most of the wait; the last stretch is building and warming the scenes. */
let mascotLoaded = 0
let siteReady = false

/** Canvas text needs the fonts in memory first; don't let a slow font hold the page forever. */
const fonts = Promise.race([
  Promise.all(['900 120px "Archivo Variable"', '500 20px "JetBrains Mono"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
])

// The mascot is the biggest download (once lion.glb exists); start it straight away rather than after the fonts.
const mascotLoad = loadMascot('/assets/lion/lion.glb', reduced, (f) => (mascotLoaded = f))
mascotLoad.catch(() => {}) // reported through `ready`

const ready: Promise<Engine> = fonts.then(async () => {
  const memes = buildMemes()
  const ring = createRing(memes, reduced, 3.0)
  const lightbox = createLightbox(memes, {
    onOpen() {
      nav.setPaused(true)
      ring.paused = true
    },
    onClose(memeIndex) {
      nav.setPaused(false)
      ring.paused = false
      if (memeIndex !== null) ring.face(memeIndex)
    },
  })

  const [mascot, entry, stages] = await Promise.all([
    mascotLoad,
    createEntry(reduced),
    buildStages({ ring, openMeme: lightbox.showMeme, ask }),
  ])
  const engine = createEngine(canvas, { stages, entry, mascot }, { reduced, finePointer })
  engine.start()
  nav = createNav({ engine, views, reduced })
  if (finePointer && !reduced) initCursor(engine, () => nav.locked)
  if (params.has('debug')) {
    void import('./debug').then((m) => m.initDebug(() => `${String(nav.index + 1).padStart(2, '0')} ${views[nav.index].def.id} · ${engine.info()}`))
  }

  // ---- clicks into the 3D scene (bare canvas only) ---------------------------
  canvas.addEventListener('click', (e) => !nav.locked && engine.pick(e.clientX, e.clientY)?.onClick())

  // ---- the meme ring: drag on the canvas, keys on its focusable label ---------
  const MEMES = views.findIndex((v) => v.def.id === 'memes')
  canvas.addEventListener('pointerdown', (e) => {
    if (nav.index !== MEMES || nav.locked || (e.pointerType === 'mouse' && e.button !== 0)) return
    ring.down(e.clientX, e.timeStamp)
    root.classList.add('is-dragging')
  })
  window.addEventListener('pointermove', (e) => ring.move(e.clientX, e.timeStamp))
  const release = (e: PointerEvent) => {
    ring.up(e.timeStamp)
    root.classList.remove('is-dragging')
  }
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)

  const keys = document.getElementById('ringKeys')!
  keys.addEventListener('focus', () => (ring.paused = true))
  keys.addEventListener('blur', () => (ring.paused = false))
  keys.addEventListener('click', () => lightbox.showMeme(ring.front))
  keys.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    ring.stepBy(e.key === 'ArrowRight' ? 1 : -1)
  })

  if (import.meta.env.DEV || params.has('debug')) Object.assign(window, { __engine: engine, __ring: ring, __nav: nav })

  // The loader still covers the page, so this is the moment to pay for all twelve scenes.
  await engine.warm()
  return engine
})

ready.then(() => (siteReady = true)).catch(() => {})
ready.catch((err) => {
  console.error(err)
  document.getElementById('bootStatus')!.textContent = 'Something broke while loading. Try a refresh.'
})

runBoot({
  reduced,
  ready,
  progress: () => (siteReady ? 1 : mascotLoaded * 0.9),
  onEnter(withSound) {
    // Still inside the click, which is what lets browsers (iOS Safari included) start audio.
    music.start(withSound)
  },
  onArrive() {
    site.inert = false
    root.classList.remove('is-locked')
    views[0].intro?.restart()
    if (!reduced) gsap.fromTo('[data-after-enter]', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', delay: 0.3 })
    nav.unlock()
  },
})
