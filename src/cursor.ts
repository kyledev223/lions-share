import type { Engine } from './gl/engine'

const CLICKABLE = 'a, button, [role="button"], [tabindex]:not([tabindex="-1"]), summary, label'

/**
 * The visible cursor for mouse users: a thin ring with a small solid dot.
 * Dot and ring sit exactly on the pointer, moved in the same event, so
 * they never drift apart.
 * Over anything clickable (page controls, or clickable things in the scene)
 * the ring grows a little; over disabled controls it dims. Scene things can
 * carry a label (the meme ring says DRAG). The lens itself is invisible and
 * lives in the post-process shader.
 *
 * Touch devices and reduced-motion visitors keep the system cursor.
 */
export function initCursor(engine: Engine, isLocked: () => boolean) {
  const el = document.getElementById('cursor')!
  const ring = el.querySelector<HTMLElement>('.cursor__ring')!
  const dot = el.querySelector<HTMLElement>('.cursor__dot')!
  const label = el.querySelector<HTMLElement>('.cursor__label')!
  document.documentElement.classList.add('has-cursor')

  let x = -100
  let y = -100
  let target: Element | null = null

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    x = e.clientX
    y = e.clientY
    target = e.target as Element
    const at = `translate3d(${x}px, ${y}px, 0)`
    dot.style.transform = ring.style.transform = label.style.transform = at
    el.classList.add('is-on')
  })
  document.documentElement.addEventListener('pointerleave', () => el.classList.remove('is-on'))
  window.addEventListener('pointerdown', () => el.classList.add('is-down'))
  window.addEventListener('pointerup', () => el.classList.remove('is-down'))

  let checkAt = 0
  const frame = (now: number) => {
    requestAnimationFrame(frame)
    // What's under the pointer, a few times a second is plenty.
    if (now < checkAt) return
    checkAt = now + 80
    const control = target?.closest?.(CLICKABLE) ?? null
    const disabled = !!control && (control.getAttribute('aria-disabled') === 'true' || (control as HTMLButtonElement).disabled === true)
    const hit = !control && target instanceof HTMLCanvasElement && !isLocked() ? engine.pick(x, y) : null
    const text = hit?.label ?? ''
    if (label.textContent !== text) label.textContent = text
    el.classList.toggle('has-label', !!text)
    el.classList.toggle('is-hot', (!!control && !disabled) || !!hit)
    el.classList.toggle('is-blocked', disabled)
  }
  requestAnimationFrame(frame)
}
