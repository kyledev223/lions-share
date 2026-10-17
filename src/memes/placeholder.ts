/**
 * Placeholder meme cards, drawn on a canvas so they can be used both as
 * textures on the 3D ring and as images in the lightbox. They use the page
 * fonts, so draw them only after the fonts have loaded.
 */
interface Scheme {
  bg: string
  fg: string
  acc: string
}

const SCHEMES: Scheme[] = [
  { bg: '#120607', fg: '#FFF4EC', acc: '#E5232F' },
  { bg: '#E5232F', fg: '#120607', acc: '#FFF4EC' },
  { bg: '#FFF4EC', fg: '#120607', acc: '#E5232F' },
  { bg: '#5A0A12', fg: '#FFF4EC', acc: '#C9A24A' },
]

type Motif = 'coin' | 'head' | 'horizon' | 'stack' | 'eye'

export interface PlaceholderSpec {
  top: string[]
  bottom: string
  motif: Motif
  scheme: number
}

type Ctx = CanvasRenderingContext2D

const poly = (c: Ctx, pts: [number, number][], color: string) => {
  c.fillStyle = color
  c.beginPath()
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
  c.closePath()
  c.fill()
}
const disc = (c: Ctx, x: number, y: number, r: number, color: string) => {
  c.fillStyle = color
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fill()
}
const ring = (c: Ctx, x: number, y: number, r: number, color: string, width: number) => {
  c.strokeStyle = color
  c.lineWidth = width
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.stroke()
}

/** A four-point spark. */
function spark(c: Ctx, x: number, y: number, r: number, color: string) {
  const a = r * 0.28
  poly(c, [[x, y - r], [x + a, y - a], [x + r, y], [x + a, y + a], [x, y + r], [x - a, y + a], [x - r, y], [x - a, y - a]], color)
}

/** The emblem's lion head, simplified: a ray mane, a face, two eye slits and a nose. (x, y) is its centre. */
function lion(c: Ctx, x: number, y: number, s: number, sc: Scheme, mane = sc.fg, face = sc.acc) {
  const rays: [number, number][] = []
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 12
    const r = i % 2 ? 15.6 : i % 4 === 0 ? 23.2 : 21.4
    rays.push([x + Math.cos(a) * r * s, y + Math.sin(a) * r * s])
  }
  poly(c, rays, mane)
  const F = (pts: [number, number][]) => pts.map(([px, py]) => [x + (px - 32) * s, y + (py - 32.6) * s] as [number, number])
  poly(c, F([[25.2, 21.6], [38.8, 21.6], [43.2, 27.4], [42, 35.2], [36.4, 42.6], [32, 44.6], [27.6, 42.6], [22, 35.2], [20.8, 27.4]]), face)
  poly(c, F([[24.6, 28.4], [30.2, 30.2], [29.6, 31.9], [25.4, 30.6]]), sc.bg)
  poly(c, F([[39.4, 28.4], [33.8, 30.2], [34.4, 31.9], [38.6, 30.6]]), sc.bg)
  poly(c, F([[28.6, 34.6], [35.4, 34.6], [32, 38.8]]), sc.bg)
}

function art(c: Ctx, motif: Motif, s: Scheme) {
  switch (motif) {
    case 'coin':
      disc(c, 200, 286, 112, s.fg)
      ring(c, 200, 286, 88, s.acc, 5)
      c.fillStyle = s.bg
      c.textAlign = 'center'
      c.font = '64px Anton, Impact, sans-serif'
      c.fillText('ROAR', 200, 308)
      c.textAlign = 'left'
      spark(c, 300, 192, 36, s.acc)
      break
    case 'head':
      lion(c, 214, 288, 4.6, s)
      spark(c, 348, 196, 24, s.acc)
      break
    case 'horizon':
      // A low sun behind rolling grass, and a lion's mane rising over the ridge.
      c.save()
      c.beginPath()
      c.rect(0, 0, 400, 340)
      c.clip()
      disc(c, 250, 340, 120, s.acc)
      for (let i = 0; i < 5; i++) {
        c.fillStyle = s.bg
        c.fillRect(120, 250 + i * 18, 260, 5 + i)
      }
      c.restore()
      c.fillStyle = s.fg
      c.beginPath()
      c.moveTo(0, 360)
      for (let x = 0; x <= 400; x += 20) c.lineTo(x, 338 - Math.sin(x * 0.03) * 14 - (x % 40 ? 0 : 10))
      c.lineTo(400, 424)
      c.lineTo(0, 424)
      c.fill()
      lion(c, 120, 318, 1.9, s, s.fg, s.acc)
      break
    case 'stack':
      ;[1, 2, 4, 6].forEach((n, i) => {
        for (let j = 0; j < n; j++) {
          c.fillStyle = j % 2 ? s.acc : s.fg
          c.beginPath()
          c.roundRect(74 + i * 84 - 34, 396 - j * 24 - 18, 68, 18, 5)
          c.fill()
        }
      })
      lion(c, 112, 268, 1.9, s)
      break
    case 'eye':
      // A cat's eye, close up: the iris, a tall slit pupil, a hard brow.
      c.fillStyle = s.fg
      c.beginPath()
      c.ellipse(200, 292, 150, 92, 0, 0, Math.PI * 2)
      c.fill()
      disc(c, 206, 292, 78, s.acc)
      c.fillStyle = s.bg
      c.beginPath()
      c.ellipse(206, 292, 14, 70, 0, 0, Math.PI * 2)
      c.fill()
      disc(c, 232, 262, 10, s.fg)
      poly(c, [[40, 196], [360, 228], [360, 190], [40, 160]], s.bg)
      break
  }
}

/** Draws one 4:5 card. `n` is its 1-based number, shown as ROAR-0n. */
export function drawPlaceholder(spec: PlaceholderSpec, n: number): HTMLCanvasElement {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = 400 * scale
  canvas.height = 500 * scale
  const c = canvas.getContext('2d')!
  c.scale(scale, scale)
  const s = SCHEMES[spec.scheme % SCHEMES.length]

  c.fillStyle = s.bg
  c.fillRect(0, 0, 400, 500)
  art(c, spec.motif, s)

  c.fillStyle = s.fg
  c.globalAlpha = 0.7
  c.font = '500 13px "JetBrains Mono", monospace'
  c.fillText(`////// ROAR-${String(n).padStart(2, '0')}`, 24, 38)
  c.globalAlpha = 1

  c.font = '56px Anton, Impact, sans-serif'
  spec.top.forEach((line, i) => c.fillText(line, 24, 102 + i * 56))

  c.fillStyle = s.bg
  c.fillRect(0, 424, 400, 76)
  c.fillStyle = s.fg
  c.globalAlpha = 0.35
  c.fillRect(24, 424, 352, 2)
  c.globalAlpha = 1
  c.font = '27px Anton, Impact, sans-serif'
  c.fillText(spec.bottom, 24, 468)
  return canvas
}
