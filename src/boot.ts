import gsap from 'gsap'
import { music } from './audio'
import type { Engine } from './gl/engine'
import { shared } from './gl/points'

const STATUS = [
  [0, 'Gathering the pride…'],
  [38, 'Measuring out the share…'],
  [72, 'Straightening the tie…'],
  [100, 'The throne is warm.'],
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
 * 3. Enter (~6.2s; the skip button in the corner or Esc cuts it short, a click elsewhere does not):
 *      0.0–0.4  buttons drop away; a low riser starts (with sound)
 *      0.4–3.5  the field spirals into the emblem, which spins up and
 *               brightens; four thick rings lock on round it one by one
 *               (a thump and a flicker each); from 1.4 it charges, pulsing
 *               and trembling harder
 *      3.5–3.9  implosion to a point, a beat of darkness, then a
 *               shockwave, a warm white flash and a colour burst (bass hit)
 *      3.9–5.4  hyperspace: streaks, accelerating
 *      5.4–6.2  the streaks slow and settle into screen 01's throne room; the mascot
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
  // (the mascot's download, then the scenes being built and warmed).
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
    const mascotU = engine.mascot.uniforms
    let arrived = false
    let siteShown = false

    const toSite = () => {
      if (siteShown) return
      siteShown = true
      engine.showSite(0)
      engine.entry.carryStreaks(engine.stages[0].scene)
      shared.uAssemble.value = shared.uGather.value = 0
      mascotU.uMaterialize.value = 0
    }
    const arrive = () => {
      if (arrived) return
      arrived = true
      root.classList.remove('is-entry')
      entry.remove()
      onArrive()
    }

    /** When the implosion starts; everything after it is timed from here. */
    const IMPLODE = 3.5
    const IN = IMPLODE + 1.9 // the streaks settle into screen 01
    if (withSound) music.riser(IMPLODE + 0.35)
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    // 0–0.4: the controls drop away.
    tl.to(entry.querySelectorAll('.entry__actions > *, .entry__hint'), { y: 40, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, 0)
      // 0.4–3.5: vortex and spin-up; the rings lock on one by one; it charges and trembles.
      .to(es, { vortex: 1, duration: IMPLODE - 0.5, ease: 'power2.in' }, 0.35)
      .to(es, { spin: 1, duration: IMPLODE - 0.4, ease: 'power3.in' }, 0.4)
      .to(es, { charge: 1, duration: IMPLODE - 1.4, ease: 'power2.in' }, 1.4)
    for (let i = 0; i < engine.entry.ringCount; i++) {
      // Each ring gathers in from the scattered points and locks on with a thump and a flicker.
      const lock = 1.2 + i * 0.6
      tl.to(es, { rings: i + 1, duration: 0.5, ease: 'power3.out' }, lock - 0.5)
        .call(() => withSound && music.thump(), [], lock - 0.05)
        .to(post.uFlash, { value: 0.12 + i * 0.05, duration: 0.04, ease: 'none' }, lock - 0.05)
        .to(post.uFlash, { value: 0, duration: 0.3, ease: 'power2.out' }, lock)
    }
    // 3.5–3.9: implode, darkness, a shockwave + flash + burst.
    tl.to(es, { implode: 1, duration: 0.18, ease: 'power3.in' }, IMPLODE)
      .call(() => withSound && music.impact(), [], IMPLODE + 0.29)
      .set(es, { shock: 0.001 }, IMPLODE + 0.3)
      .to(es, { shock: 1, duration: 0.75, ease: 'power2.out' }, IMPLODE + 0.3)
      // The core bursts out from the centre first; the whole frame flashes as it reaches the edges.
      .set(es, { blast: 0.001 }, IMPLODE + 0.3)
      .to(es, { blast: 1, duration: 0.7, ease: 'power2.out' }, IMPLODE + 0.3)
      .to(post.uFlash, { value: 0.7, duration: 0.12, ease: 'power1.in' }, IMPLODE + 0.36)
      .to(post.uFlash, { value: 0, duration: 0.6, ease: 'power2.out' }, IMPLODE + 0.48)
      .to(post.uBurst, { value: 1, duration: 0.05, ease: 'none' }, IMPLODE + 0.3)
      .to(post.uBurst, { value: 0.15, duration: 0.8, ease: 'power2.out' }, IMPLODE + 0.35)
      // Hyperspace, accelerating.
      .to(es, { streaks: 1, duration: 0.25, ease: 'power1.out' }, IMPLODE + 0.4)
      .to(es, { warp: 1, duration: 1.45, ease: 'power2.in' }, IMPLODE + 0.45)
      .to(es, { fov: 78, duration: 1.45, ease: 'power2.in' }, IMPLODE + 0.45)
      // Decelerate into the throne room; the mascot scans in; the title arrives.
      .call(toSite, [], IN)
      .to(post.uBurst, { value: 0.45, duration: 0.08, ease: 'none' }, IN)
      .to(post.uBurst, { value: 0, duration: 0.6, ease: 'power2.out' }, IN + 0.08)
      .to(es, { warp: 0, duration: 0.8, ease: 'power3.out' }, IN)
      .to(es, { streaks: 0, duration: 0.75, ease: 'power2.in' }, IN + 0.05)
      .to([shared.uAssemble, shared.uGather], { value: 1, duration: 0.9, ease: 'power3.out' }, IN)
      .to(mascotU.uMaterialize, { value: 1, duration: 1.1, ease: 'power2.inOut' }, IN + 0.1)
      .call(arrive, [], IN + 0.3)
      .call(finish, [], IN + 0.85)

    function finish() {
      document.removeEventListener('keydown', onKey)
      engine.entry.carryStreaks(null)
      es.streaks = es.warp = 0
    }

    /** The skip button or Esc: jump to the end state. */
    function skip() {
      if (tl.progress() >= 1) return
      tl.kill()
      toSite()
      Object.assign(es, { vortex: 1, spin: 1, rings: engine.entry.ringCount, charge: 1, implode: 1, blast: 0, shock: 0, warp: 0, streaks: 0, fov: 55 })
      post.uFlash.value = post.uBurst.value = 0
      gsap.to([shared.uAssemble, shared.uGather], { value: 1, duration: 0.5, ease: 'power3.out' })
      gsap.to(mascotU.uMaterialize, { value: 1, duration: 0.6, ease: 'power2.out' })
      arrive()
      finish()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && skip()
    document.addEventListener('keydown', onKey)
    // A click anywhere no longer cuts it short; only the skip button in the corner (or Esc) does.
    // It goes with the entry overlay when the site arrives.
    const skipBtn = entry.querySelector<HTMLButtonElement>('.entry__skip')!
    skipBtn.hidden = false
    skipBtn.addEventListener('click', skip)
    skipBtn.focus({ preventScroll: true })
    gsap.fromTo(skipBtn, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out', delay: 0.6 })
  }
}
