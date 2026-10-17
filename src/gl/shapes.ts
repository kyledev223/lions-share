import * as THREE from 'three'
import { fx } from '../fx-config'
import { Cloud, n } from './points'

/**
 * Builders that sprinkle points along shapes: lines, rings, rounded panels,
 * boxes, discs, and anything drawable on a canvas (text, the emblem).
 * Densities are points per world unit (or per square unit for fills) and
 * go through the global density scale.
 */
export const C = {
  blue: new THREE.Color(fx.palette.blue),
  pale: new THREE.Color(fx.palette.pale),
  white: new THREE.Color(fx.palette.white),
  gold: new THREE.Color(fx.palette.gold),
}

/** Picks a colour: mostly `main`, sometimes one of the accents. */
export type Tint = THREE.Color | ((r: number) => THREE.Color)
const pick = (t: Tint, r: number) => (typeof t === 'function' ? t(r) : t)

/** The usual particle mix: mostly white, some pale blue, a little blue. */
export const sparkle = (r: number): THREE.Color => (r < 0.55 ? C.white : r < 0.85 ? C.pale : C.blue)
export const goldMix = (r: number): THREE.Color => (r < 0.7 ? C.gold : r < 0.92 ? C.white : C.pale)
export const blueMix = (r: number): THREE.Color => (r < 0.5 ? C.blue : r < 0.85 ? C.pale : C.white)

export interface Stroke {
  /** Points per world unit. */
  density?: number
  /** Random offset perpendicular to the line, world units. */
  jitter?: number
  size?: [number, number]
  tint?: Tint
  /** Brightness multiplier (above 1 feeds the bloom). */
  glow?: number
}

const v = new THREE.Vector3()
function scatterAdd(c: Cloud, p: THREE.Vector3, s: Stroke) {
  const j = s.jitter ?? 0.01
  const [a, b] = s.size ?? [0.008, 0.02]
  const r = c.rand()
  const big = c.rand() < 0.04 ? 1.8 : 1
  c.add(
    p.x + (c.rand() - 0.5) * 2 * j,
    p.y + (c.rand() - 0.5) * 2 * j,
    p.z + (c.rand() - 0.5) * 2 * j,
    pick(s.tint ?? sparkle, r),
    (a + (b - a) * c.rand()) * big,
    (s.glow ?? 1) * (0.55 + c.rand() * 0.7),
  )
}

export function line(c: Cloud, from: THREE.Vector3, to: THREE.Vector3, s: Stroke = {}) {
  const len = from.distanceTo(to)
  const count = n(len * (s.density ?? 120))
  for (let i = 0; i < count; i++) scatterAdd(c, v.lerpVectors(from, to, c.rand()), s)
}

export function polyline(c: Cloud, pts: THREE.Vector3[], closed = false, s: Stroke = {}) {
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) line(c, pts[i], pts[(i + 1) % pts.length], s)
}

/** A circle in the plane given by its normal (default: flat on the floor). */
export function ring(c: Cloud, center: THREE.Vector3, radius: number, s: Stroke = {}, normal = new THREE.Vector3(0, 1, 0), arc = [0, Math.PI * 2]) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize())
  const count = n(radius * (arc[1] - arc[0]) * (s.density ?? 120))
  for (let i = 0; i < count; i++) {
    const a = arc[0] + (arc[1] - arc[0]) * c.rand()
    v.set(Math.cos(a) * radius, 0, Math.sin(a) * radius).applyQuaternion(q).add(center)
    scatterAdd(c, v, s)
  }
}

/** Rounded rectangle outline, upright and facing +Z unless rotated by `euler`. */
export function roundedRect(c: Cloud, center: THREE.Vector3, w: number, h: number, r: number, s: Stroke = {}, euler = new THREE.Euler()) {
  const pts: THREE.Vector3[] = []
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = from + (i / 8) * (Math.PI / 2)
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0))
    }
  }
  corner(w / 2 - r, h / 2 - r, 0)
  corner(-w / 2 + r, h / 2 - r, Math.PI / 2)
  corner(-w / 2 + r, -h / 2 + r, Math.PI)
  corner(w / 2 - r, -h / 2 + r, Math.PI * 1.5)
  const m = new THREE.Matrix4().makeRotationFromEuler(euler).setPosition(center)
  polyline(c, pts.map((p) => p.applyMatrix4(m)), true, s)
}

/** The twelve edges of a box. */
export function box(c: Cloud, center: THREE.Vector3, size: THREE.Vector3, s: Stroke = {}) {
  const h = size.clone().multiplyScalar(0.5)
  const P = (x: number, y: number, z: number) => new THREE.Vector3(center.x + x * h.x, center.y + y * h.y, center.z + z * h.z)
  for (const [a, b] of [
    [P(-1, -1, -1), P(1, -1, -1)], [P(-1, 1, -1), P(1, 1, -1)], [P(-1, -1, 1), P(1, -1, 1)], [P(-1, 1, 1), P(1, 1, 1)],
    [P(-1, -1, -1), P(-1, 1, -1)], [P(1, -1, -1), P(1, 1, -1)], [P(-1, -1, 1), P(-1, 1, 1)], [P(1, -1, 1), P(1, 1, 1)],
    [P(-1, -1, -1), P(-1, -1, 1)], [P(1, -1, -1), P(1, -1, 1)], [P(-1, 1, -1), P(-1, 1, 1)], [P(1, 1, -1), P(1, 1, 1)],
  ]) line(c, a, b, s)
}

/** Points spread over a filled box volume (dust, crowds). */
export function volume(c: Cloud, min: THREE.Vector3, max: THREE.Vector3, count: number, s: Stroke = {}) {
  for (let i = 0, k = n(count); i < k; i++) {
    v.set(min.x + (max.x - min.x) * c.rand(), min.y + (max.y - min.y) * c.rand(), min.z + (max.z - min.z) * c.rand())
    scatterAdd(c, v, { jitter: 0, ...s })
  }
}

/** Points spread over a flat disc on the floor, denser toward the middle if `falloff` > 1. */
export function disc(c: Cloud, center: THREE.Vector3, radius: number, count: number, s: Stroke = {}, falloff = 1) {
  for (let i = 0, k = n(count); i < k; i++) {
    const r = radius * Math.pow(c.rand(), 1 / (1 + falloff))
    const a = c.rand() * Math.PI * 2
    v.set(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r)
    scatterAdd(c, v, { jitter: 0, ...s })
  }
}

/** Vertical cylinder outline: top and bottom rings plus a few vertical lines. */
export function pillar(c: Cloud, base: THREE.Vector3, radius: number, height: number, s: Stroke = {}) {
  ring(c, base, radius, s)
  ring(c, base.clone().setY(base.y + height), radius, s)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const x = base.x + Math.cos(a) * radius
    const z = base.z + Math.sin(a) * radius
    line(c, new THREE.Vector3(x, base.y, z), new THREE.Vector3(x, base.y + height, z), { ...s, density: (s.density ?? 120) * 0.6 })
  }
}

// ---------------------------------------------------------------------------
// Anything drawable on a canvas: text and the emblem
// ---------------------------------------------------------------------------

export interface Stamp {
  /** Inside test in -0.5..0.5 space, x right, y up; plus whether the pixel is on an edge. */
  sample(x: number, y: number): 0 | 1 | 2
  aspect: number
}

function stampFromCanvas(cv: HTMLCanvasElement): Stamp {
  const { width: w, height: h } = cv
  const data = cv.getContext('2d')!.getImageData(0, 0, w, h).data
  const inside = (px: number, py: number) => px >= 0 && py >= 0 && px < w && py < h && data[(py * w + px) * 4 + 3] > 110
  return {
    aspect: w / h,
    sample(x, y) {
      const px = Math.floor((x + 0.5) * w)
      const py = Math.floor((0.5 - y) * h)
      if (!inside(px, py)) return 0
      const e = 2
      return inside(px - e, py) && inside(px + e, py) && inside(px, py - e) && inside(px, py + e) ? 1 : 2
    },
  }
}

/** Text drawn in the display face, trimmed to its ink. */
export function textStamp(lines: string[], weight = 900, px = 220): Stamp {
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const font = `${weight} ${px}px "Archivo Variable", "Archivo", sans-serif`
  const setFont = () => {
    g.font = font
    ;(g as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = 'expanded'
  }
  setFont()
  const lh = px * 0.92
  const widths = lines.map((l) => g.measureText(l).width)
  cv.width = Math.ceil(Math.max(...widths) + px * 0.2)
  cv.height = Math.ceil(lh * lines.length + px * 0.2)
  setFont()
  g.fillStyle = '#fff'
  g.textBaseline = 'alphabetic'
  lines.forEach((l, i) => g.fillText(l, px * 0.1, px * 0.1 + lh * (i + 0.86)))
  return stampFromCanvas(cv)
}

/** Rasterises an SVG string (e.g. the emblem) for sampling. */
export async function svgStamp(svg: string, size = 512): Promise<Stamp> {
  const img = new Image()
  img.src = URL.createObjectURL(new Blob([svg.replace(/currentColor/g, '#fff')], { type: 'image/svg+xml' }))
  await img.decode()
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  cv.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, size, size)
  URL.revokeObjectURL(img.src)
  return stampFromCanvas(cv)
}

export interface Fill extends Stroke {
  /** Total points to try for (before density scaling). */
  count: number
  /** Depth of the extrusion, world units. */
  depth?: number
  /** Share of points kept on the edges vs the face, 0–1. */
  edge?: number
}

/**
 * Fills a stamp with points, `width` world units wide, centred on the origin
 * in the XY plane, extruded `depth` toward -Z. Edges get more points so
 * letters and the emblem read as outlines with a glowing fill.
 */
export function stamp(c: Cloud, st: Stamp, width: number, f: Fill, at = new THREE.Vector3()) {
  const h = width / st.aspect
  const want = n(f.count)
  const depth = f.depth ?? 0
  const edgeShare = f.edge ?? 0.55
  let got = 0
  for (let tries = 0; got < want && tries < want * 40; tries++) {
    const x = c.rand() - 0.5
    const y = c.rand() - 0.5
    const s = st.sample(x, y)
    if (!s) continue
    if (s === 1 && c.rand() < edgeShare) continue
    const z = depth > 0 ? (s === 2 ? -c.rand() * depth : c.rand() < 0.7 ? 0 : -depth) : 0
    v.set(at.x + x * width, at.y + y * h, at.z + z)
    scatterAdd(c, v, { jitter: 0.004, ...f, glow: (f.glow ?? 1) * (s === 2 ? 1.25 : 0.8) })
    got++
  }
}
