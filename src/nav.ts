import gsap from 'gsap'
import type { Engine } from './gl/engine'
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

  rail.innerHTML = views
    .map(
      (v, i) =>
        `<a class="rail__tick" href="#${v.def.id}" data-i="${i}"><span class="rail__name">${v.def.name}</span><span class="rail__num">${String(i + 1).padStart(2, '0')}</span><i aria-hidden="true"></i></a>`,
    )
    .join('')
  const ticks = [...rail.querySelectorAll<HTMLAnchorElement>('.rail__tick')]

  let index = 0
  let locked = true
  const indexOfHash = () => views.findIndex((v) => v.def.id === location.hash.slice(1))

  /** Updates everything that says "which screen is this": rail, corner label, URL. */
  function reflect(push: boolean) {
    ticks.forEach((t, i) => {
      t.classList.toggle('is-active', i === index)
      if (i === index) t.setAttribute('aria-current', 'true')
      else t.removeAttribute('aria-current')
    })
    const def = views[index].def
    hudNum.textContent = String(index + 1).padStart(2, '0')
    hudName.textContent = def.name.toUpperCase()
    hudSub.textContent = def.sub.toUpperCase()
    root.dataset.screen = def.id
    root.classList.toggle('is-last', index === count - 1)
    const hash = '#' + def.id
    // Before Enter the URL is left alone, so an incoming #hash survives to be honoured.
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
        const i = indexOfHash()
        if (i > 0) jump(i)
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

  function go(to: number, pushHistory = true) {
    if (busy || to === index || to < 0 || to >= count) return
    busy = true
    const from = views[index]
    const next = views[to]
    from.intro?.pause()
    gsap.to(from.el, { autoAlpha: 0, y: to > index ? -24 : 24, duration: 0.32, ease: 'power2.in' })
    void engine
      .go(to, () => {
        from.el.classList.remove('is-active')
        index = to
        next.el.classList.add('is-active')
        gsap.set(next.el, { autoAlpha: 1, y: 0 })
        next.intro?.restart()
        reflect(pushHistory)
      })
      .then(() => {
        busy = false
        settling = true
      })
  }

  const next = () => go(index + 1)
  const prev = () => go(index - 1)
  const blocked = () => locked || paused || busy

  // ---- wheel / trackpad --------------------------------------------------------
  let acc = 0
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
      if (blocked()) {
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
      if (!touch || blocked()) return
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
        go(0)
        break
      case 'End':
        go(count - 1)
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
      if (!locked) go(i)
    }),
  )
  const fromHash = () => {
    const i = indexOfHash()
    if (!locked) go(i < 0 ? 0 : i, false)
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
    /** Called when the visitor has arrived on screen 01. Honours a #hash in the URL. */
    unlock() {
      locked = false
      const i = indexOfHash()
      if (i > 0) go(i, false)
    },
    jump: (i: number) => go(i),
    /** Suspends input while a lightbox is open. */
    setPaused(v: boolean) {
      paused = v
    },
  }
}

export type Nav = ReturnType<typeof createNav>
