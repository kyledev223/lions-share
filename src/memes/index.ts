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

/** Frames in the ring. More than ~12 gets too busy on phones. */
const RING_SIZE = 10

/** Alt text for real images, keyed by filename. */
const ALT: Record<string, string> = {
  // '01-throne.png': 'The lion on his throne, holding a gold coin',
}

const PLACEHOLDERS: PlaceholderSpec[] = [
  { top: ['POV: YOU GOT', 'THE BIG SLICE'], bottom: 'AND YOU EARNED IT', motif: 'coin', scheme: 0 },
  { top: ['ME WATCHING', 'THE CHART'], bottom: 'LOW IN THE LONG GRASS', motif: 'horizon', scheme: 1 },
  { top: ['SHARE? I TAKE', 'THE BIG ONE'], bottom: 'IT IS LITERALLY THE NAME', motif: 'head', scheme: 2 },
  { top: ['HYENAS LAUGH.', 'LIONS EAT.'], bottom: 'PICK YOUR SIDE OF THE FIRE', motif: 'stack', scheme: 3 },
  { top: ['SEES DIP.', 'POUNCES.'], bottom: 'APEX BEHAVIOUR', motif: 'eye', scheme: 0 },
  { top: ["HE'S NOT LAZY."], bottom: "HE'S CONSERVING ENERGY", motif: 'head', scheme: 1 },
  { top: ['DEN STATUS:', 'FULLY STOCKED'], bottom: 'THE PRIDE EATS TONIGHT', motif: 'stack', scheme: 2 },
  { top: ['ROAR IS A', 'LOVE LANGUAGE'], bottom: 'TELL YOUR CUBS', motif: 'eye', scheme: 3 },
  { top: ['SLEEPS 20 HOURS.', 'STILL AHEAD.'], bottom: 'WORK SMARTER, NAP HARDER', motif: 'horizon', scheme: 2 },
  { top: ['THE MANE IS', 'NON-NEGOTIABLE'], bottom: 'SO IS THE SUIT', motif: 'coin', scheme: 1 },
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
      return { id: file, src: files[path], alt: ALT[file] ?? 'Lion’s Share meme' }
    })
  const generated: Meme[] = PLACEHOLDERS.map((spec, i) => ({
    id: `ROAR-${String(i + 1).padStart(2, '0')}`,
    alt: [...spec.top, spec.bottom].join(' '),
    canvas: drawPlaceholder(spec, i + 1),
  }))
  return [...real, ...generated.slice(real.length)].slice(0, Math.max(RING_SIZE, real.length))
}
