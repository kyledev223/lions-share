import { drawPlaceholder, type PlaceholderSpec } from './placeholder'

/**
 * The meme list the 3D ring reads.
 *
 * TO ADD REAL MEMES: drop image files (png, jpg, webp, gif, avif) into this
 * folder. They are picked up automatically, sorted by filename, and replace
 * the generated placeholders one for one. Name them 01-something.png,
 * 02-something.png… to control the order. Optional alt text goes in `ALT`.
 */
export interface Meme {
  id: string
  alt: string
  /** Image URL (real memes)… */
  src?: string
  /** …or a drawn canvas (generated placeholders). */
  canvas?: HTMLCanvasElement
}

/** Frames in the ring. More than ~12 gets crowded on phones. */
const RING_SIZE = 10

/** Alt text for real images, keyed by filename. */
const ALT: Record<string, string> = {
  // '01-wire.png': 'Three crows on a wire, one holding a coin',
}

const PLACEHOLDERS: PlaceholderSpec[] = [
  { top: ['POV: THE', 'COUPON LANDED'], bottom: 'RIGHT ON SCHEDULE', motif: 'coin', scheme: 0 },
  { top: ['ME WAITING FOR', 'THE NEXT ONE'], bottom: 'PATIENTLY. MENACINGLY.', motif: 'wire', scheme: 1 },
  { top: ['FOUND: ONE (1)', 'SHINY THING'], bottom: 'IT LIVES IN THE NEST NOW', motif: 'head', scheme: 2 },
  { top: ['GULLS SHOUT.', 'CROWS COLLECT.'], bottom: 'KNOW THE DIFFERENCE', motif: 'stack', scheme: 3 },
  { top: ['SEES COIN.', 'REMEMBERS COIN.'], bottom: 'FOR SEVEN TO TEN YEARS', motif: 'eye', scheme: 0 },
  { top: ["HE'S NOT LATE."], bottom: "HE'S ACCRUING", motif: 'head', scheme: 1 },
  { top: ['NEST STATUS:', 'FULL OF FOIL'], bottom: 'NO FURTHER QUESTIONS', motif: 'stack', scheme: 2 },
  { top: ['CAW IS A FULL', 'SENTENCE'], bottom: 'YOU HEARD THE BIRD', motif: 'eye', scheme: 3 },
  { top: ['MONDAY: WIRE.', 'TUESDAY: WIRE.'], bottom: 'CONSISTENCY IS A STRATEGY', motif: 'wire', scheme: 2 },
  { top: ['ONE MORE COIN', "WON'T HURT"], bottom: 'SAID EVERY CROW, EVERY DAY', motif: 'coin', scheme: 1 },
]

const files = import.meta.glob<string>('./*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Builds the list. Call after the fonts have loaded: placeholders are drawn with them. */
export function buildMemes(): Meme[] {
  const real: Meme[] = Object.keys(files)
    .sort()
    .map((path) => {
      const file = path.replace('./', '')
      return { id: file, src: files[path], alt: ALT[file] ?? 'Coupon Crows meme' }
    })
  const generated: Meme[] = PLACEHOLDERS.map((spec, i) => ({
    id: `CAW-${String(i + 1).padStart(2, '0')}`,
    alt: [...spec.top, spec.bottom].join(' '),
    canvas: drawPlaceholder(spec, i + 1),
  }))
  return [...real, ...generated.slice(real.length)].slice(0, Math.max(RING_SIZE, real.length))
}
