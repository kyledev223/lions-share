/**
 * What a label is made of while it resolves: strokes, digits and the letters of ROAR. Plain ASCII
 * on purpose: a glyph the label's font lacks sends every frame through system font fallback,
 * which costs hundreds of milliseconds of text shaping.
 */
const GLYPHS = '/\\|-=+#%$*<>0123456789ROAR'

const running = new WeakMap<HTMLElement, number>()

/**
 * Rewrites `el`'s text to `text` over `ms`: a front of random glyphs sweeps
 * left to right, the new text settling in behind it. `from` is what sits
 * ahead of the front (by default the text being replaced). A newer call on
 * the same element takes over from an older one.
 */
export function scramble(el: HTMLElement, text: string, ms: number, from = el.textContent ?? '') {
  const len = Math.max(from.length, text.length)
  const lead = 5
  const t0 = performance.now()
  const id = (running.get(el) ?? 0) + 1
  running.set(el, id)
  const step = (now: number) => {
    if (running.get(el) !== id) return
    const k = Math.min(1, (now - t0) / ms)
    const front = k * (len + lead)
    let out = ''
    for (let i = 0; i < len; i++) {
      const d = front - i
      if (d >= lead) out += text[i] ?? ''
      else if (d > 0) out += text[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      else out += from[i] ?? ''
    }
    el.textContent = k < 1 ? out : text
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
