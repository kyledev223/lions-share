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
  { bg: '#050818', fg: '#EDEEF2', acc: '#2F7BFF' },
  { bg: '#2F7BFF', fg: '#020308', acc: '#EDEEF2' },
  { bg: '#EDEEF2', fg: '#020308', acc: '#2F7BFF' },
  { bg: '#0B1B45', fg: '#EDEEF2', acc: '#7FB0FF' },
]

type Motif = 'wire' | 'coin' | 'eye' | 'stack' | 'head'

export interface PlaceholderSpec {
  top: string[]
  bottom: string
  motif: Motif
  scheme: number
}

type Ctx = CanvasRenderingContext2D

const fill = (c: Ctx, d: string, color: string) => {
  c.fillStyle = color
  c.fill(new Path2D(d))
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

function star(c: Ctx, x: number, y: number, r: number, color: string) {
  const a = r * 0.28
  c.fillStyle = color
  c.beginPath()
  c.moveTo(x, y - r)
  c.lineTo(x + a, y - a)
  c.lineTo(x + r, y)
  c.lineTo(x + a, y + a)
  c.lineTo(x, y + r)
  c.lineTo(x - a, y + a)
  c.lineTo(x - r, y)
  c.lineTo(x - a, y - a)
  c.fill()
}

/** Small crow silhouette; (x, y) is where the feet touch down. */
function bird(c: Ctx, x: number, y: number, s: number, color: string, eye: string, flip = false) {
  c.save()
  c.translate(x, y)
  c.scale(flip ? -s : s, s)
  fill(c, 'M-14 -20 L-58 -2 L-48 8 L-6 -8 Z', color)
  c.save()
  c.translate(0, -26)
  c.rotate((-22 * Math.PI) / 180)
  c.beginPath()
  c.ellipse(0, 0, 27, 20, 0, 0, Math.PI * 2)
  c.fill()
  c.restore()
  disc(c, 19, -52, 16, color)
  fill(c, 'M31 -60 L60 -50 L31 -43 Z', color)
  c.fillRect(-8, -8, 4, 9)
  c.fillRect(6, -8, 4, 9)
  disc(c, 24, -55, 4, eye)
  c.restore()
}

function art(c: Ctx, motif: Motif, s: Scheme) {
  switch (motif) {
    case 'wire':
      c.strokeStyle = s.fg
      c.lineWidth = 4
      c.beginPath()
      c.moveTo(-10, 318)
      c.quadraticCurveTo(200, 348, 410, 318)
      c.stroke()
      bird(c, 96, 326, 1.15, s.fg, s.acc)
      bird(c, 206, 334, 1.5, s.fg, s.acc)
      bird(c, 318, 328, 1.05, s.fg, s.acc, true)
      star(c, 318, 196, 26, s.acc)
      break
    case 'coin':
      disc(c, 200, 286, 112, s.fg)
      ring(c, 200, 286, 88, s.acc, 5)
      c.fillStyle = s.bg
      c.textAlign = 'center'
      c.font = '64px Anton, Impact, sans-serif'
      c.fillText('CROW', 200, 308)
      c.textAlign = 'left'
      star(c, 292, 196, 40, s.acc)
      break
    case 'eye':
      disc(c, 200, 290, 118, s.fg)
      disc(c, 212, 294, 72, s.acc)
      disc(c, 218, 296, 36, s.bg)
      disc(c, 238, 270, 13, s.fg)
      fill(c, 'M60 180 L340 232 L340 196 L60 150 Z', s.bg)
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
      bird(c, 326, 256, 1.05, s.fg, s.acc)
      break
    case 'head':
      disc(c, 96, 300, 150, s.fg)
      fill(c, 'M206 232 Q318 250 372 306 L214 318 Z', s.fg)
      fill(c, 'M216 326 L330 322 L220 356 Z', s.fg)
      disc(c, 352, 318, 30, s.acc)
      ring(c, 352, 318, 18, s.bg, 3)
      disc(c, 150, 262, 30, s.bg)
      disc(c, 156, 264, 15, s.acc)
      star(c, 382, 268, 22, s.acc)
      break
  }
}

/** Draws one 4:5 card. `n` is its 1-based number, shown as CAW-0n. */
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
  c.fillText(`////// CAW-${String(n).padStart(2, '0')}`, 24, 38)
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
