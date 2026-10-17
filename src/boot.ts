import gsap from 'gsap'
import { music } from './audio'
import type { Engine } from './gl/engine'
import { shared } from './gl/points'

const STATUS = [
  [0, 'Collecting shiny things…'],
  [38, 'Counting them twice…'],
  [72, 'Pressing the suit…'],
  [100, 'The nest is ready.'],
] as const

export interface BootOptions {
  reduced: boolean
  /** Resolves with the engine once every scene is built and warmed up. */
  ready: Promise<Engine>
  /** How far loading has got, 0–1 (1 once `ready` has resolved). */
  progress(): number
  /** Runs inside the click, so audio is allowed to start. */
  onEnter(withSound: boolean): void
  /** Screen 01 is up: reveal its copy and hand over the controls. */
  onArrive(): void
}

/**
 * Loader → entry → site.
 *
 * 1. A big 000 → 100 counter on black while everything loads.
 * 2. The entry screen: star field, the emblem in points, Enter /
 *    Enter without sound.
 * 3. Enter (~3.8s; click or Esc skips):
 *      0.0–0.4  buttons drop away; a low riser starts (with sound)
 *      0.4–1.2  the field spirals into the emblem, which spins up and
 *               brightens; a ring of points forms around it
 *      1.2–1.6  implosion to a point, a beat of darkness, then a shockwave,
 *               a blue-white flash and a colour burst (bass hit)
 *      1.6–3.0  hyperspace: streaks, accelerating
 *      3.0–3.8  the streaks slow and settle into screen 01's hall; the crow
 *               scans in from the top, the title slides in
 *    Reduced motion: a 0.6s fade instead.
 */
export function runBoot({ reduced, ready, progress, onEnter, onArrive }: BootOptions) {
  const root = document.documentElement
  const boot = document.getElementById('boot')!
  const count = document.getElementById('bootCount')!
  const status = document.getElementById('bootStatus')!
  const bar = document.getElementById('bootBar')!
  const entry = document.getElementById('entry')!

  // The counter follows a 2.4s ease, but never runs ahead of the real load
  // (the crow's download, then the scenes being built and warmed).
  const timed = { v: 0 }
  gsap.to(timed, { v: 100, duration: reduced ? 0.6 : 2.4, ease: 'power2.inOut' })
  let shown = 0
  let drawn = -1
  const counted = new Promise<void>((resolve) => {
    const tick = (_t: number, dt: number) => {
      const target = Math.min(timed.v, progress() * 100)
      shown += (target - shown) * Math.min(1, dt / 120)
      if (target - shown < 0.5) shown = target
      const v = Math.round(shown)
      if (v !== drawn) {
        drawn = v
        count.textContent = String(v).padStart(3, '0')
        gsap.set(bar, { scaleX: v / 100 })
        const line = [...STATUS].reverse().find(([at]) => v >= at)
        if (line && status.textContent !== line[1]) status.textContent = line[1]
      }
      if (v >= 100) {
        gsap.ticker.remove(tick)
        resolve()
      }
    }
    gsap.ticker.add(tick)
  })

  let engine: Engine
  Promise.all([ready, counted]).then(([e]) => {
    engine = e
    root.classList.remove('is-booting')
    root.classList.add('is-entry')
    entry.hidden = false
    gsap.to(boot, { autoAlpha: 0, duration: reduced ? 0.3 : 0.9, ease: 'power2.inOut', onComplete: () => boot.remove() })
    if (!reduced) gsap.from(entry.querySelectorAll('.entry__actions > *, .entry__hint'), { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', delay: 0.5 })
    entry.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  })

  let entered = false
  entry.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-enter]')
    if (!btn || entered || !engine) return
    entered = true
    const withSound = btn.dataset.enter === 'sound'
    // Whatever goes wrong in there, the gate still opens.
    try {
      onEnter(withSound)
    } catch (err) {
      console.error(err)
    }
    if (reduced) fade()
    else sequence(withSound)
  })

  /** Reduced motion: a plain 0.6s fade into screen 01. */
  function fade() {
    const post = engine.post
    gsap
      .timeline()
      .to(entry, { autoAlpha: 0, duration: 0.3 }, 0)
      .to(post.uFade, { value: 1, duration: 0.3 }, 0)
      .call(() => {
        engine.showSite(0)
        entry.remove()
        root.classList.remove('is-entry')
        onArrive()
      })
      .to(post.uFade, { value: 0, duration: 0.3 })
  }

  function sequence(withSound: boolean) {
    const es = engine.entry.state
    const post = engine.post
    const crowU = engine.crow.uniforms
    let arrived = false
    let siteShown = false

    const toSite = () => {
      if (siteShown) return
      siteShown = true
      engine.showSite(0)
      engine.entry.carryStreaks(engine.stages[0].scene)
      shared.uAssemble.value = 0
      crowU.uMaterialize.value = 0
    }
    const arrive = () => {
      if (arrived) return
      arrived = true
      root.classList.remove('is-entry')
      entry.remove()
      onArrive()
    }

    if (withSound) music.riser(1.45)
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    // 0–0.4: the controls drop away.
    tl.to(entry.querySelectorAll('.entry__actions > *, .entry__hint'), { y: 40, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, 0)
      // 0.4–1.2: vortex, spin-up, the ring forms.
      .to(es, { vortex: 1, duration: 0.85, ease: 'power2.in' }, 0.35)
      .to(es, { spin: 1, duration: 0.85, ease: 'power3.in' }, 0.4)
      .to(es, { ring: 1, duration: 0.6, ease: 'power2.out' }, 0.55)
      // 1.2–1.6: implode, darkness, shockwave + flash + burst.
      .to(es, { implode: 1, duration: 0.14, ease: 'power3.in' }, 1.2)
      .call(() => withSound && music.impact(), [], 1.44)
      .set(es, { shock: 0.001 }, 1.45)
      .to(es, { shock: 1, duration: 0.65, ease: 'power2.out' }, 1.45)
      .to(post.uFlash, { value: 0.92, duration: 0.05, ease: 'none' }, 1.45)
      .to(post.uFlash, { value: 0, duration: 0.5, ease: 'power2.out' }, 1.5)
      .to(post.uBurst, { value: 1, duration: 0.05, ease: 'none' }, 1.45)
      .to(post.uBurst, { value: 0.15, duration: 0.7, ease: 'power2.out' }, 1.5)
      // 1.6–3.0: hyperspace, accelerating.
      .to(es, { streaks: 1, duration: 0.25, ease: 'power1.out' }, 1.55)
      .to(es, { warp: 1, duration: 1.4, ease: 'power2.in' }, 1.6)
      .to(es, { fov: 78, duration: 1.4, ease: 'power2.in' }, 1.6)
      // 3.0–3.8: decelerate into the hall; the crow scans in; the title arrives.
      .call(toSite, [], 3.0)
      .to(post.uBurst, { value: 0.45, duration: 0.08, ease: 'none' }, 3.0)
      .to(post.uBurst, { value: 0, duration: 0.6, ease: 'power2.out' }, 3.08)
      .to(es, { warp: 0, duration: 0.8, ease: 'power3.out' }, 3.0)
      .to(es, { streaks: 0, duration: 0.75, ease: 'power2.in' }, 3.05)
      .to(shared.uAssemble, { value: 1, duration: 0.9, ease: 'power3.out' }, 3.0)
      .to(crowU.uMaterialize, { value: 1, duration: 1.1, ease: 'power2.inOut' }, 3.1)
      .call(arrive, [], 3.3)
      .call(finish, [], 3.85)

    function finish() {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onSkip, true)
      engine.entry.carryStreaks(null)
      es.streaks = es.warp = 0
    }

    /** Click or Esc: jump to the end state. */
    function skip() {
      if (tl.progress() >= 1) return
      tl.kill()
      toSite()
      Object.assign(es, { vortex: 1, spin: 1, ring: 1, implode: 1, shock: 0, warp: 0, streaks: 0, fov: 55 })
      post.uFlash.value = post.uBurst.value = 0
      gsap.to(shared.uAssemble, { value: 1, duration: 0.5, ease: 'power3.out' })
      gsap.to(crowU.uMaterialize, { value: 1, duration: 0.6, ease: 'power2.out' })
      arrive()
      finish()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && skip()
    // The enter click itself is still propagating; listen from the next tick.
    const onSkip = () => skip()
    document.addEventListener('keydown', onKey)
    setTimeout(() => window.addEventListener('pointerdown', onSkip, true), 0)
  }
}
