import * as THREE from 'three'
import { fx } from '../fx-config'

/**
 * Glowing point clouds: the material every environment is drawn with.
 *
 * One draw call per cloud. Each point carries its colour (linear, may go
 * above 1 to feed the bloom), a size in world units and a random seed. The
 * shader adds a slow drift, an optional twinkle, optional wrap-around flow
 * (scrolling floors, tunnels), and the scatter/assemble used by screen
 * transitions: at `uAssemble` 0 every point is thrown out along its own
 * random direction; at 1 it sits where it was built.
 */

/** Uniforms shared by every cloud (only one screen renders at a time). */
export const shared = {
  uTime: { value: 0 },
  /** 0 = scattered, 1 = in place. Animated by screen transitions. */
  uAssemble: { value: 1 },
  /** Device pixels per world unit at distance 1 (set from the camera each frame). */
  uProj: { value: 800 },
  /** Lite mode and density tweaks scale sizes a touch up when counts go down. */
  uSizeK: { value: 1.08 },
}

let total = 0
/** Points created so far (for the ?debug overlay and the budget). */
export const pointCount = () => total

/** Lite mode halves every count. Set once at startup. */
let densityScale = 1
export function setDensity(scale: number) {
  densityScale = scale
  shared.uSizeK.value = scale < 1 ? 1.3 : 1.08
}
/** Scales a requested count by the global density. */
/** True when the counts were already halved at build time (forced lite). */
export const builtThin = () => densityScale < 1
export const n = (count: number) => Math.max(1, Math.round(count * densityScale * fx.particles.density))

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAssemble;
uniform float uProj;
uniform float uSizeK;
uniform float uDrift;
uniform float uTwinkle;
uniform float uScatter;
uniform float uOpacity;
uniform vec3 uFlow;       // velocity, world units per second
uniform vec3 uWrap;       // wrap size per axis (0 = no wrap)
uniform vec3 uWrapMin;    // wrap box start
uniform vec2 uDepthFade;  // fade out between these view distances (0 = off)
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;

vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 1.31, n + 2.77)) * vec3(43758.5453, 22578.1459, 19642.349)) * 2.0 - 1.0;
}

void main() {
  vec3 p = position;
  float s = aSeed * 6.2831;
  p += vec3(sin(uTime * 0.37 + s * 3.0), cos(uTime * 0.29 + s * 5.0), sin(uTime * 0.23 + s * 7.0)) * uDrift;
  p += uFlow * uTime;
  if (uWrap.x > 0.0) p.x = uWrapMin.x + mod(p.x - uWrapMin.x, uWrap.x);
  if (uWrap.y > 0.0) p.y = uWrapMin.y + mod(p.y - uWrapMin.y, uWrap.y);
  if (uWrap.z > 0.0) p.z = uWrapMin.z + mod(p.z - uWrapMin.z, uWrap.z);

  // Each point assembles on its own beat.
  float a = clamp(uAssemble * 1.6 - aSeed * 0.6, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  vec3 dir = normalize(hash3(aSeed * 91.7) + vec3(0.0, 0.15, 0.45));
  p += dir * (1.0 - a) * uScatter * (0.5 + aSeed);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.05);
  float px = aSize * uSizeK * uProj / dist;
  // Below ~1.4 device px a point would shimmer; hold the size and dim it instead.
  gl_PointSize = max(px, 1.4);
  float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.3 + aSeed * 4.0) + s * 11.0));
  vAlpha = uOpacity * tw * a * min(1.0, px / 1.4);
  if (uDepthFade.y > 0.0) vAlpha *= 1.0 - smoothstep(uDepthFade.x, uDepthFade.y, dist);
  vColor = aColor;
}`

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float soft = (1.0 - r2) * (1.0 - r2);
  float core = exp(-r2 * 9.0);
  gl_FragColor = vec4(vColor * (soft * 0.75 + core * 0.6) * vAlpha, 1.0);
}`

export interface CloudLook {
  /** Wobble amplitude in world units. */
  drift?: number
  /** 0 = steady, 1 = fully twinkling. */
  twinkle?: number
  /** How far points fly out when scattered. */
  scatter?: number
  opacity?: number
  flow?: THREE.Vector3
  wrap?: THREE.Vector3
  wrapMin?: THREE.Vector3
  depthFade?: [number, number]
}

export function pointMaterial(look: CloudLook = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    uniforms: {
      ...shared,
      uDrift: { value: look.drift ?? 0.01 },
      uTwinkle: { value: look.twinkle ?? 0.3 },
      uScatter: { value: look.scatter ?? 4 },
      uOpacity: { value: look.opacity ?? 1 },
      uFlow: { value: look.flow ?? new THREE.Vector3() },
      uWrap: { value: look.wrap ?? new THREE.Vector3() },
      uWrapMin: { value: look.wrapMin ?? new THREE.Vector3() },
      uDepthFade: { value: new THREE.Vector2(...(look.depthFade ?? [0, 0])) },
    },
  })
}

/** Collects points, then turns them into one THREE.Points. */
export class Cloud {
  pos: number[] = []
  col: number[] = []
  size: number[] = []
  seed: number[] = []
  /** Seeded random, so a scene looks the same on every visit. */
  rand: () => number

  constructor(seed = 1) {
    this.rand = seeded(seed)
  }

  get count() {
    return this.size.length
  }

  add(x: number, y: number, z: number, color: THREE.Color, size: number, intensity = 1) {
    this.pos.push(x, y, z)
    this.col.push(color.r * intensity, color.g * intensity, color.b * intensity)
    this.size.push(size)
    this.seed.push(this.rand())
    return this
  }

  build(look: CloudLook = {}) {
    // Shuffle, so drawing only the first half (lite mode) thins every shape evenly.
    for (let i = this.count - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1))
      for (const [arr, k] of [[this.pos, 3], [this.col, 3], [this.size, 1], [this.seed, 1]] as const) {
        for (let c = 0; c < k; c++) {
          const t = arr[i * k + c]
          arr[i * k + c] = arr[j * k + c]
          arr[j * k + c] = t
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3))
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1))
    const pts = new THREE.Points(geo, pointMaterial(look))
    pts.frustumCulled = false
    total += this.count
    return pts
  }
}

/** Small fast seeded PRNG (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const uniformsOf = (p: THREE.Points) => (p.material as THREE.ShaderMaterial).uniforms
