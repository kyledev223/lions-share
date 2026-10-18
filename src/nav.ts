import gsap from 'gsap'
import { music } from './audio'
import { fx } from './fx-config'
import type { Engine } from './gl/engine'
import { scramble } from './scramble'
import type { ScreenView } from './screens'

/** Wheel distance (px) that counts as one deliberate flick. */
const WHEEL_STEP = 50
/** A pause this long (ms) between wheel events means the next one is a new gesture. */
const GESTURE_GAP = 170
const SWIPE_PX = 40

export interface NavOptions {
  engine: Engine
  views: ScreenView[]
  reduced: boolean
  /** Fired after the active screen changes. */
  onChange?(index: number): void
}

/**
 * Screen-by-screen navigation: one wheel flick, swipe or key press moves
 * exactly one screen. Twelve flicks take you through the site.
 *
 * Wheel: deltas add up until they pass WHEEL_STEP, then the transition runs
 * (~0.9s) and input is locked. Trackpads keep sending a decaying tail of
 * "inertia" events for a second or more after the fingers lift; those are
 * ignored until either the wheel goes quiet for GESTURE_GAP ms or the
 * deltas suddenly grow again (a fresh flick).
 *
 * Each screen's intro (text reveal, mascot materialising) plays on arrival;
 * nothing is tied to scroll position. The rail and #hash links jump directly.
 *
 * Reduced motion: the screens are a plain scroll-snapped page instead, and
 * this module only tracks which one is in view.
 */
export function createNav({ engine, views, reduced, onChange }: NavOptions) {
  const count = views.length
  const rail = document.getElementById('rail')!
  const hudNum = document.getElementById('hudNum')!
  const hudName = document.getElementById('hudName')!
  const hudSub = document.getElementById('hudSub')!
  const root = document.documentElement

  rail.innerHTML =
    views
      .map(
        (v, i) =>
          `<a class="rail__tick" href="#${v.def.id}" data-i="${i}"><span class="rail__name">${v.def.name}</span><span class="rail__num">${String(i + 1).padStart(2, '0')}</span><i aria-hidden="true"></i></a>`,
      )
      .join('') + '<i class="rail__bead" aria-hidden="true"></i>'
  const ticks = [...rail.querySelectorAll<HTMLAnchorElement>('.rail__tick')]
  const bead = rail.querySelector<HTMLElement>('.rail__bead')!

  let index = 0
  let locked = true
  const indexOfHash = () => views.findIndex((v) => v.def.id === location.hash.slice(1))
  /** Enter always lands on screen 01, so a #hash left over from a refresh or a pasted link is dropped (the query, e.g. ?debug, stays). */
  const dropHash = () => location.hash && history.replaceState(null, '', location.pathname + location.search)

  /**
   * A gold bead runs down the rail from the old tick to the new one, arriving as the stage changes
   * (0.12–0.52s), and flashes out as the new tick's line grows. Ticks it passes on a jump blink.
   */
  const tickY = (i: number) => ticks[i].offsetTop + ticks[i].offsetHeight / 2
  let beadRun: gsap.core.Timeline | null = null
  function runBead(from: number, to: number) {
    gsap.killTweensOf(bead)
    // Measured once per run: reading layout every frame while the copy animates would force a reflow each time.
    const ys = ticks.map((_t, i) => tickY(i))
    let near = from
    beadRun = gsap
      .timeline()
      .set(bead, { y: ys[from], autoAlpha: 0, scale: 0.4 })
      .to(bead, { autoAlpha: 1, scale: 1, duration: 0.12, ease: 'power2.out' })
      .to(bead, {
        y: ys[to],
        duration: 0.4,
        ease: 'expo.inOut',
        onUpdate() {
          const y = gsap.getProperty(bead, 'y') as number
          const i = ys.reduce((best, v, k) => (Math.abs(v - y) < Math.abs(ys[best] - y) ? k : best), near)
          if (i === near) return
          near = i
          if (i === to) return
          ticks[i].classList.remove('is-passed')
          void ticks[i].offsetWidth
          ticks[i].classList.add('is-passed')
        },
      })
      .to(bead, { scale: 2.2, autoAlpha: 0, duration: 0.35, ease: 'power2.out' })
  }

  /** Updates everything that says "which screen is this": rail, corner label, URL. `animate`: the label scrambles over. */
  function reflect(push: boolean, animate = false) {
    ticks.forEach((t, i) => {
      t.classList.toggle('is-active', i === index)
      if (i === index) t.setAttribute('aria-current', 'true')
      else t.removeAttribute('aria-current')
    })
    const def = views[index].def
    const num = String(index + 1).padStart(2, '0')
    if (animate) {
      scramble(hudNum, num, 400)
      scramble(hudName, def.name.toUpperCase(), 600)
      scramble(hudSub, def.sub.toUpperCase(), 800)
    } else {
      hudNum.textContent = num
      hudName.textContent = def.name.toUpperCase()
      hudSub.textContent = def.sub.toUpperCase()
    }
    root.dataset.screen = def.id
    root.classList.toggle('is-last', index === count - 1)
    const hash = '#' + def.id
    // Before Enter the URL is left alone; unlock() then clears any incoming #hash.
    if (!locked && location.hash !== hash && !(index === 0 && !location.hash)) {
      if (push) history.pushState(null, '', hash)
      else history.replaceState(null, '', hash)
    }
    onChange?.(index)
  }

  // =========================================================================
  // Reduced motion: native scrolling with CSS scroll-snap
  // =========================================================================
  if (reduced) {
    root.classList.add('is-native')
    views.forEach((v) => v.el.classList.add('is-active'))
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          index = views.findIndex((v) => v.el === e.target)
          engine.setStage(index)
          reflect(false)
        }
      },
      { threshold: 0.55 },
    )
    views.forEach((v) => seen.observe(v.el))
    const jump = (i: number) => views[i]?.el.scrollIntoView()
    ticks.forEach((t, i) =>
      t.addEventListener('click', (e) => {
        e.preventDefault()
        jump(i)
      }),
    )
    reflect(false)
    return {
      get index() {
        return index
      },
      get locked() {
        return locked
      },
      unlock() {
        locked = false
        dropHash()
        jump(0)
      },
      jump,
      setPaused(_p: boolean) {},
    }
  }

  // =========================================================================
  // Normal mode: one gesture, one screen
  // =========================================================================
  root.classList.add('is-jacked')
  let busy = false
  let paused = false // lightbox open
  views[0].el.classList.add('is-active')
  views.forEach((v, i) => i && gsap.set(v.el, { autoAlpha: 0 }))

  /** The change under way: which way it goes, and how to undo the copy if the visitor flicks back. */
  let moving: { dir: number; from: ScreenView } | null = null

  /**
   * `jump`: arriving from the rail, a link or Home/End rather than a step. Only a jump of more than
   * one screen gets the sunburst; a rail click to a neighbour is just a step.
   */
  function go(to: number, pushHistory = true, jump = false) {
    if (busy || to === index || to < 0 || to >= count) return
    busy = true
    const from = views[index]
    const next = views[to]
    const dir = to > index ? 1 : -1
    const far = jump && Math.abs(to - index) > 1
    moving = { dir, from }
    from.leave(dir)
    runBead(index, to)
    if (far) music.rush(fx.transition.jump.cut)
    else music.whoosh('out')
    void engine
      .go(
        to,
        () => {
          from.el.classList.remove('is-active')
          gsap.set(from.el, { autoAlpha: 0 })
          index = to
          next.el.classList.add('is-active')
          gsap.set(next.el, { autoAlpha: 1, y: 0 })
          next.intro?.restart()
          reflect(pushHistory, true)
          // The claw (or the sunburst's cut) lands: a low thump, then the air settles.
          music.thump()
          music.whoosh('in')
        },
        far,
      )
      .then(() => {
        busy = false
        moving = null
        settling = true
      })
  }

  /**
   * A flick the other way early in a step turns it back (fx.transition.reverseWithin): the engine plays
   * it back to rest, and the copy and the bead go back with it. True if it turned.
   */
  function turnBack(dir: number) {
    if (!moving || dir !== -moving.dir || !engine.reverse()) return false
    moving.from.stay()
    beadRun?.reverse()
    return true
  }

  const next = () => (busy ? void turnBack(1) : go(index + 1))
  const prev = () => (busy ? void turnBack(-1) : go(index - 1))
  const blocked = () => locked || paused || busy
  /** Someone is typing in a field (screen 09's question box): the wheel and swipes leave the screen alone. Esc leaves the field. */
  const typing = () => !!(document.activeElement as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')

  // ---- wheel / trackpad --------------------------------------------------------
  let acc = 0
  /** Wheel distance flicked against the change under way. */
  let back = 0
  let lastAt = 0
  let lastMag = 0
  /** After a transition: ignoring the leftover inertia of the flick that caused it. */
  let settling = false
  window.addEventListener(
    'wheel',
    (e) => {
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      const now = performance.now()
      const gap = now - lastAt
      lastAt = now
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY
      const mag = Math.abs(dy)
      const prevMag = lastMag
      lastMag = mag
      if (busy && !locked && !paused && !typing() && moving && Math.sign(dy) === -moving.dir) {
        // A new flick the other way while a step is under way: maybe turn it back.
        back += mag
        if (back >= WHEEL_STEP && turnBack(-moving.dir)) back = 0
        return
      }
      back = 0
      if (blocked() || typing()) {
        acc = 0
        return
      }
      if (settling) {
        // A quiet moment or a sudden surge means a new flick has started.
        if (gap > GESTURE_GAP || (mag > prevMag * 1.8 && mag > 12)) settling = false
        else return
      }
      if (gap > GESTURE_GAP * 1.5 || Math.sign(dy) !== Math.sign(acc)) acc = 0
      acc += dy
      if (Math.abs(acc) >= WHEEL_STEP) {
        const dir = Math.sign(acc)
        acc = 0
        if (dir > 0) next()
        else prev()
      }
    },
    { passive: false },
  )

  // ---- touch: one swipe, one screen -------------------------------------------
  let touch: { x: number; y: number } | null = null
  window.addEventListener('touchstart', (e) => (touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }), { passive: true })
  window.addEventListener(
    'touchend',
    (e) => {
      if (!touch || locked || paused || typing() || (busy && !moving)) return
      const dx = e.changedTouches[0].clientX - touch.x
      const dy = e.changedTouches[0].clientY - touch.y
      touch = null
      if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.2) return
      if (dy < 0) next()
      else prev()
    },
    { passive: true },
  )

  // ---- keyboard ---------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (locked || paused || e.altKey || e.ctrlKey || e.metaKey) return
    const el = e.target as HTMLElement
    if (el.closest('input, textarea, select, [contenteditable]')) return
    const onControl = el.closest('button, a, [role="button"]')
    let handled = true
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
        next()
        break
      case 'ArrowUp':
      case 'PageUp':
        prev()
        break
      case ' ':
        if (onControl) return
        e.shiftKey ? prev() : next()
        break
      case 'Home':
        go(0, true, true)
        break
      case 'End':
        go(count - 1, true, true)
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  })

  // ---- rail and URL hash ----------------------------------------------------------
  ticks.forEach((t, i) =>
    t.addEventListener('click', (e) => {
      e.preventDefault()
      if (!locked) go(i, true, true)
    }),
  )
  const fromHash = () => {
    const i = indexOfHash()
    if (!locked) go(i < 0 ? 0 : i, false, true)
  }
  window.addEventListener('popstate', fromHash)
  window.addEventListener('hashchange', fromHash)

  reflect(false)

  return {
    get index() {
      return index
    },
    get locked() {
      return locked
    },
    /** Called when the visitor has arrived on screen 01. Always starts there, ignoring any #hash in the URL. */
    unlock() {
      locked = false
      dropHash()
    },
    jump: (i: number) => go(i),
    /** Suspends input while a lightbox is open. */
    setPaused(v: boolean) {
      paused = v
    },
  }
}

export type Nav = ReturnType<typeof createNav>
