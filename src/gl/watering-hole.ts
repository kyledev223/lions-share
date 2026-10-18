import * as THREE from 'three'
import { lite } from '../lite'
import type { PoseOverlay } from './mascot'
import { Cloud, n, seeded, shared } from './points'
import { C } from './shapes'

/**
 * Screen 09, the Watering Hole: the pieces that aren't plain point outlines.
 *
 *   pool      a dark pool of fine points below his ledge, with slow ripple
 *             rings, a soft red edge, low mist, and a faint wobbling
 *             reflection (a low-res render of the scene from under the water)
 *   bubbles   glowing question bubbles that rise from the water; some drift
 *             off high, some curve to his phone and pop
 *   glance    a small look down at the phone when a bubble pops
 *
 * The stage itself (ledge, phone, camera, timing) is in scenes.ts.
 */

// ---------------------------------------------------------------------------
// The pool's shape: an ellipse with a wobbly edge, flat on the water level.
// The same function is in GLSL (POOL_GLSL), so points, glow and mask agree.
// ---------------------------------------------------------------------------
export const POOL = {
  /** Water level (m). His ledge's top is at 0. */
  y: -0.7,
  cx: 0.15,
  cz: 1.0,
  rx: 4.1,
  rz: 2.4,
}

const edgeK = (a: number) => 1 + 0.06 * Math.sin(2 * a + 0.7) + 0.045 * Math.sin(3 * a + 2.1) + 0.03 * Math.sin(5 * a + 0.4)

/** 0 at the pool's centre, 1 on its edge, more outside. */
export function poolRho(x: number, z: number) {
  const dx = (x - POOL.cx) / POOL.rx
  const dz = (z - POOL.cz) / POOL.rz
  return Math.hypot(dx, dz) / edgeK(Math.atan2(dz, dx))
}

/** The point on the edge in direction `a`, scaled by `k` (1 = on the edge). */
function poolAt(a: number, k: number, out = new THREE.Vector3()) {
  const r = edgeK(a) * k
  return out.set(POOL.cx + Math.cos(a) * POOL.rx * r, POOL.y, POOL.cz + Math.sin(a) * POOL.rz * r)
}

const RIPS = 12

/**
 * A true mirror would put his reflection below the bottom of the frame (he and it together span
 * more than the camera sees), so the reflection is squashed by `k` toward the waterline at `at`,
 * the foot of his rock.
 */
const SQUASH = { at: new THREE.Vector3(0, 0, 0.3), k: 4.4, fov: 2.6 }

const POOL_GLSL = /* glsl */ `
#define RIPS ${RIPS}
uniform vec4 uPool;        // cx, cz, rx, rz
uniform vec4 uRip[RIPS];   // x, z, start time, strength
uniform vec3 uSquash;      // the waterline under him in the reflection's uv, and how much to squash toward it
// The reflection, squashed toward his waterline, so his flipped figure fits in the water that's on screen.
vec2 reflUv(vec4 rc) {
  vec2 uv = rc.xy / rc.w;
  uv.y = uSquash.y + (uv.y - uSquash.y) * uSquash.z;
  return uv;
}
float poolRho(vec2 xz) {
  vec2 d = (xz - uPool.xy) / uPool.zw;
  float a = atan(d.y, d.x);
  return length(d) / (1.0 + 0.06 * sin(2.0 * a + 0.7) + 0.045 * sin(3.0 * a + 2.1) + 0.03 * sin(5.0 * a + 0.4));
}
// x: how bright the rings are here; yz: which way they push the surface.
vec3 ripples(vec2 xz, float t) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < RIPS; i++) {
    vec4 r = uRip[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    float k = r.w * (1.0 - age / 6.0) * smoothstep(0.0, 0.3, age);
    float d = distance(xz, r.xy);
    float w = 0.05 + age * 0.03;
    float x1 = (d - age * 0.42) / w;
    float x2 = (d - age * 0.27) / w;
    float ring = exp(-x1 * x1) + 0.55 * exp(-x2 * x2);
    o.x += k * ring;
    vec2 dir = d > 0.001 ? (xz - r.xy) / d : vec2(0.0);
    o.yz += dir * k * (-x1 * exp(-x1 * x1) - 0.55 * x2 * exp(-x2 * x2));
  }
  return o;
}`

const POINT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float soft = (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(vColor * (soft * 0.75 + exp(-r2 * 9.0) * 0.6) * vAlpha, 1.0);
}`

/** The surface: fine points that ripple and pick up the reflection. */
const SURFACE_VERT = /* glsl */ `
${POOL_GLSL}
uniform float uTime;
uniform float uAssemble;
uniform float uProj;
uniform float uSizeK;
uniform sampler2D tRefl;
uniform mat4 uTexMat;
uniform float uReflK;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
vec3 hash3(float n) { return fract(sin(vec3(n, n + 1.31, n + 2.77)) * vec3(43758.5453, 22578.1459, 19642.349)) * 2.0 - 1.0; }
void main() {
  vec3 p = position;
  vec3 rip = ripples(p.xz, uTime);
  p.y += rip.x * 0.01 + sin(uTime * 0.7 + aSeed * 37.0) * 0.003;
  // The reflection, wobbling, sampled where this point sits on the water.
  vec4 rc = uTexMat * vec4(position, 1.0);
  vec2 uv = reflUv(rc) + vec2(sin(p.z * 9.0 + uTime * 1.3) * 0.006, sin(p.x * 6.0 + uTime) * 0.003) + rip.yz * 0.012;
  vec3 refl = texture2D(tRefl, clamp(uv, 0.001, 0.999)).rgb;
  float a = clamp(uAssemble * 1.6 - aSeed * 0.6, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  p += normalize(hash3(aSeed * 91.7) + vec3(0.0, 0.15, 0.45)) * (1.0 - a) * 3.0 * (0.5 + aSeed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uSizeK * uProj / max(-mv.z, 0.05);
  gl_PointSize = max(px, 1.4);
  float tw = 0.75 + 0.25 * sin(uTime * (0.9 + aSeed * 2.5) + aSeed * 60.0);
  vAlpha = a * tw * min(1.0, px / 1.4) * smoothstep(1.0, 0.9, poolRho(position.xz));
  vColor = aColor * (1.0 + rip.x * 2.6) + refl * uReflK + vec3(1.0, 0.35, 0.38) * rip.x * 0.22;
}`

/** The water under the points: near black, with the reflection wobbling in it. */
const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const WATER_FRAG = /* glsl */ `
${POOL_GLSL}
uniform float uTime;
uniform float uAssemble;
uniform sampler2D tRefl;
uniform mat4 uTexMat;
uniform vec3 uDeep;
uniform float uReflK;
varying vec3 vW;
void main() {
  float rho = poolRho(vW.xz);
  if (rho > 1.0) discard;
  vec3 rip = ripples(vW.xz, uTime);
  vec4 rc = uTexMat * vec4(vW, 1.0);
  // A slow wobble (stronger across than up and down, like water) plus the rings' push.
  vec2 wob = vec2(
    sin(vW.z * 13.0 + uTime * 1.5) * 0.007 + sin(vW.x * 7.0 - uTime * 0.8) * 0.004,
    sin(vW.x * 5.0 + uTime * 0.9) * 0.003 + sin(vW.z * 9.0 - uTime * 1.2) * 0.002
  );
  vec2 uv = reflUv(rc) + wob + rip.yz * 0.018;
  // Smeared up and down a little, as reflections in water are.
  vec3 refl = (texture2D(tRefl, uv).rgb * 2.0 + texture2D(tRefl, uv + vec2(0.0, 0.008)).rgb + texture2D(tRefl, uv - vec2(0.0, 0.008)).rgb) * 0.25;
  vec3 V = normalize(cameraPosition - vW);
  float fres = mix(0.35, 1.0, pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5));
  float edge = smoothstep(1.0, 0.82, rho);
  vec3 col = uDeep + refl * uReflK * fres * edge + vec3(1.0, 0.4, 0.42) * rip.x * 0.025 * edge;
  gl_FragColor = vec4(mix(uDeep, col, uAssemble), 1.0);
}`

/** The soft red glow along the edge (additive). */
const EDGE_FRAG = /* glsl */ `
${POOL_GLSL}
uniform float uAssemble;
uniform float uTime;
uniform vec3 uColor;
varying vec3 vW;
void main() {
  float rho = poolRho(vW.xz);
  float x = (rho - 1.0);
  float a = exp(-x * x / 0.0016) * 0.55 + exp(-x * x / 0.012) * 0.22 * step(x, 0.0) + exp(-x * x / 0.03) * 0.08;
  a *= 0.85 + 0.15 * sin(atan(vW.z - uPool.y, vW.x - uPool.x) * 7.0 + uTime * 0.6);
  gl_FragColor = vec4(uColor * a * uAssemble, 1.0);
}`

/** Low mist: slow drifting noise, thickest over the middle of the water (additive). */
const MIST_FRAG = /* glsl */ `
${POOL_GLSL}
uniform float uAssemble;
uniform float uTime;
uniform float uStrength;
uniform float uSeed;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
void main() {
  vec2 p = vW.xz * 0.9 + vec2(uTime * 0.05, uTime * 0.018) + uSeed;
  float m = smoothstep(0.42, 0.85, fbm(p + fbm(p * 0.6 - uTime * 0.03)));
  float rho = poolRho(vW.xz);
  float inside = smoothstep(1.25, 0.55, rho);
  vec3 tint = mix(vec3(1.0, 0.93, 0.88), vec3(1.0, 0.42, 0.42), smoothstep(0.75, 1.15, rho));
  gl_FragColor = vec4(tint * m * inside * uStrength * uAssemble, 1.0);
}`

const additive = (uniforms: Record<string, THREE.IUniform>, fragmentShader: string) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  })

const NOOP = THREE.Object3D.prototype.onBeforeRender

/**
 * The pool, with its reflection. Add `group` to the scene; call `update`
 * every frame and `reflect` just before the scene is drawn.
 */
export function createPool(seed: number) {
  const group = new THREE.Group()
  const rand = seeded(seed)
  const ripplesU = { value: Array.from({ length: RIPS }, () => new THREE.Vector4(0, 0, -100, 0)) }
  let nextRipple = 0
  const common = {
    uPool: { value: new THREE.Vector4(POOL.cx, POOL.cz, POOL.rx, POOL.rz) },
    uRip: ripplesU,
    uTime: shared.uTime,
    uAssemble: shared.uAssemble,
  }

  // ---- the reflection: the scene drawn from under the water, small ------------------
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true })
  rt.texture.generateMipmaps = false
  const reflU = { tRefl: { value: rt.texture }, uTexMat: { value: new THREE.Matrix4() }, uSquash: { value: new THREE.Vector3(0, 0, 1) } }
  const waterline = new THREE.Vector4()
  const mirror = new THREE.PerspectiveCamera()
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
  const size = new THREE.Vector2()
  const look = new THREE.Vector3()
  let frame = 0

  // ---- the water itself, under everything else ---------------------------------------
  const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2)
  const water = new THREE.Mesh(
    plane(POOL.rx * 2.6, POOL.rz * 2.6),
    new THREE.ShaderMaterial({
      uniforms: { ...common, ...reflU, uDeep: { value: new THREE.Color('#020309') }, uReflK: { value: 0.9 } },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
    }),
  )
  water.position.set(POOL.cx, POOL.y - 0.004, POOL.cz)
  group.add(water)

  // ---- fine points on the surface ----------------------------------------------------
  const surface = new Cloud(seed + 1)
  for (let i = 0, k = n(15000); i < k; i++) {
    // Even over the area, a little denser toward the edge where the glow is.
    const a = rand() * Math.PI * 2
    const r = Math.pow(rand(), 0.42)
    const at = poolAt(a, r)
    const tint = rand()
    const col = tint < 0.62 ? C.white : tint < 0.86 ? C.light : tint < 0.95 ? C.red : C.gold
    surface.add(at.x, POOL.y + 0.002, at.z, col, 0.0045 + rand() * 0.006, 0.07 + rand() * 0.16 + (r > 0.9 ? 0.1 : 0))
  }
  const surfaceGeo = surface.build().geometry
  const surfacePts = new THREE.Points(
    surfaceGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...common, ...reflU, uProj: shared.uProj, uSizeK: shared.uSizeK, uReflK: { value: 0.9 } },
      vertexShader: SURFACE_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }),
  )
  surfacePts.frustumCulled = false
  group.add(surfacePts)

  // ---- the edge: a soft red glow, and points along it ----------------------------------
  const edge = new THREE.Mesh(plane(POOL.rx * 2.9, POOL.rz * 2.9), additive({ ...common, uColor: { value: C.red.clone().multiplyScalar(0.55) } }, EDGE_FRAG))
  edge.position.set(POOL.cx, POOL.y + 0.006, POOL.cz)
  group.add(edge)
  const rim = new Cloud(seed + 2)
  for (let i = 0, k = n(2600); i < k; i++) {
    const a = rand() * Math.PI * 2
    const at = poolAt(a, 1 + (rand() - 0.5) * 0.025)
    const tint = rand()
    rim.add(at.x, POOL.y + 0.01, at.z, tint < 0.5 ? C.red : tint < 0.8 ? C.light : C.white, 0.006 + rand() * 0.01, 0.55 + rand() * 0.5)
  }
  const rimPts = rim.build({ twinkle: 0.45, scatter: 3, drift: 0.004 })
  group.add(rimPts)

  // ---- low mist, two layers ----------------------------------------------------------------
  const mist = [0.05, 0.2].map((h, i) => {
    const m = new THREE.Mesh(plane(POOL.rx * 3.2, POOL.rz * 3.2), additive({ ...common, uStrength: { value: i ? 0.035 : 0.05 }, uSeed: { value: i * 13.7 } }, MIST_FRAG))
    m.position.set(POOL.cx, POOL.y + h, POOL.cz)
    m.renderOrder = 2
    group.add(m)
    return m
  })

  /** Drawn in the reflection: everything but the water's own layers. */
  const ownLayers = [water, surfacePts, edge, rimPts, ...mist]

  return {
    group,
    /** A ring spreading from (x, z) on the water, starting at `time`. */
    ripple(x: number, z: number, strength: number, time: number) {
      ripplesU.value[nextRipple].set(x, z, time, strength)
      nextRipple = (nextRipple + 1) % RIPS
    },
    /**
     * A random point on the water, `k` (0–1) of the way out from the middle at most; `front` keeps it on
     * the near half. `ok` can turn spots down (inside the rock, behind the copy); after 60 tries, the last one stands.
     */
    randomPoint(k: number, front = false, ok: (p: THREE.Vector3) => boolean = () => true) {
      const out = new THREE.Vector3()
      for (let tries = 0; tries < 60; tries++) {
        const a = front ? Math.PI * (0.1 + Math.random() * 0.8) : Math.random() * Math.PI * 2
        poolAt(a, Math.sqrt(0.08 + Math.random() * 0.92) * k, out)
        if (ok(out)) return out
      }
      return out
    },
    /**
     * Renders the reflection: the scene from a camera mirrored under the water, with a wider lens,
     * at a third of the screen's resolution (a fifth in lite mode), every
     * other frame (every third in lite mode).
     */
    reflect(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, mascotRoot: THREE.Object3D | null, hide: THREE.Object3D[] = []) {
      if (frame++ % (lite.on ? 3 : 2) !== 0 && rt.width > 4) return
      renderer.getDrawingBufferSize(size)
      const div = lite.on ? 5 : 3
      const w = Math.max(96, Math.round(size.x / div))
      const h = Math.max(54, Math.round(size.y / div))
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h)

      // The camera mirrored in the water plane: same lens, position and aim flipped in y.
      camera.updateMatrixWorld()
      mirror.position.copy(camera.position)
      mirror.position.y = 2 * POOL.y - camera.position.y
      camera.getWorldDirection(look).add(camera.position)
      look.y = 2 * POOL.y - look.y
      mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      mirror.up.y *= -1
      mirror.lookAt(look)
      // A wider lens than the camera's: the squashed reflection reaches well past what the camera sees.
      mirror.fov = Math.min(SQUASH.fov * camera.fov, 120)
      mirror.aspect = camera.aspect
      mirror.near = camera.near
      mirror.far = camera.far
      mirror.updateProjectionMatrix()
      mirror.updateMatrixWorld()
      reflU.uTexMat.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse)
      waterline.set(SQUASH.at.x, POOL.y, SQUASH.at.z, 1).applyMatrix4(reflU.uTexMat.value)
      reflU.uSquash.value.set(waterline.x / waterline.w, waterline.y / waterline.w, SQUASH.k)

      // Points are sized in device pixels: match them to the small target.
      const proj = shared.uProj.value
      shared.uProj.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(mirror.fov) / 2))
      // Left out: the water's own layers, and whatever would hide him in it (his rock's dark body).
      const hidden = [...ownLayers, ...hide]
      hidden.forEach((o) => (o.visible = false))
      // He places his lights from whichever camera draws him; keep the main camera's placement.
      const hooks: [THREE.Object3D, THREE.Object3D['onBeforeRender']][] = []
      mascotRoot?.traverse((o) => {
        if (o.onBeforeRender === NOOP) return
        hooks.push([o, o.onBeforeRender])
        o.onBeforeRender = NOOP
      })
      const prev = renderer.getRenderTarget()
      renderer.setRenderTarget(rt)
      renderer.clear()
      renderer.render(scene, mirror)
      renderer.setRenderTarget(prev)
      hooks.forEach(([o, fn]) => (o.onBeforeRender = fn))
      hidden.forEach((o) => (o.visible = true))
      shared.uProj.value = proj
    },
  }
}

export type Pool = ReturnType<typeof createPool>

// ---------------------------------------------------------------------------
// Question bubbles
// ---------------------------------------------------------------------------
const SLOTS = 8
/** Points per bubble: its shell, and the sparks it bursts into. */
const SHELL = 420
const SPARKS = 110

const BUBBLE_VERT = /* glsl */ `
#define SLOTS ${SLOTS}
uniform float uTime;
uniform float uProj;
uniform float uSizeK;
uniform float uAssemble;
uniform vec4 uC[SLOTS];   // centre, radius
uniform vec4 uS[SLOTS];   // alpha, pop (0–1), brightness, -
attribute float aSlot;
attribute vec3 aDir;
attribute float aSpark;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  int s = int(aSlot + 0.5);
  vec4 c = uC[s];
  vec4 st = uS[s];
  float pop = st.y;
  vec3 p;
  float lum;
  if (aSpark < 0.5) {
    // The shell breathes a little, and swells as it pops. Its rim (side-on to the eye) is brightest.
    float wob = 1.0 + 0.03 * sin(uTime * 2.4 + aSeed * 40.0) + 0.02 * sin(uTime * 1.3 + aDir.y * 6.0);
    p = c.xyz + aDir * c.w * wob * (1.0 + pop * 0.9);
    float rim = 1.0 - abs(dot(aDir, normalize(cameraPosition - c.xyz)));
    lum = (0.16 + 1.3 * pow(rim, 3.0)) * (1.0 - pop) * (1.0 - pop);
  } else {
    // Sparks wait inside, then fly out when it pops, falling a touch.
    float fly = 1.0 - pow(1.0 - pop, 3.0);
    p = c.xyz + aDir * c.w * (0.25 + fly * (1.4 + aSeed * 2.4)) - vec3(0.0, 0.3 * pop * pop, 0.0);
    lum = pop > 0.0 ? 2.6 * (1.0 - pop) : 0.0;
  }
  float a = st.x * st.z * lum * uAssemble;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uSizeK * uProj / max(-mv.z, 0.05);
  gl_PointSize = a > 0.002 ? max(px, 1.4) : 0.0;
  vAlpha = a * min(1.0, px / 1.4);
  vColor = aColor;
}`

/** One soft round glow texture, shared by every bubble's core and the phone. */
let glowTexture: THREE.Texture | null = null
export function softGlow() {
  if (glowTexture) return glowTexture
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(cv)
  return glowTexture
}

const TEXT_PX = 512

/** Writes `text` into the canvas, wrapped and sized to sit inside the bubble. */
function drawQuestion(cv: HTMLCanvasElement, text: string, visitor: boolean) {
  const g = cv.getContext('2d')!
  g.clearRect(0, 0, TEXT_PX, TEXT_PX)
  const words = text.toUpperCase().split(/\s+/).filter(Boolean)
  const maxW = TEXT_PX * 0.68
  const maxH = TEXT_PX * 0.56
  let size = 64
  let lines: string[] = []
  for (; size >= 22; size -= 2) {
    g.font = `500 ${size}px "JetBrains Mono", ui-monospace, monospace`
    lines = []
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (g.measureText(next).width <= maxW || !line) line = next
      else {
        lines.push(line)
        line = w
      }
    }
    if (line) lines.push(line)
    // The middle lines of a round bubble are its widest; keep the block short enough to sit inside.
    if (lines.length * size * 1.18 <= maxH && lines.every((l) => g.measureText(l).width <= maxW)) break
  }
  const lh = size * 1.18
  const top = TEXT_PX / 2 - ((lines.length - 1) * lh) / 2
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // A red haze behind the letters, then the letters crisp on top.
  g.shadowColor = visitor ? 'rgba(255,190,120,0.95)' : 'rgba(255,80,90,0.9)'
  g.shadowBlur = size * 0.45
  g.fillStyle = visitor ? '#fff7e8' : '#fff1ea'
  lines.forEach((l, i) => g.fillText(l, TEXT_PX / 2, top + i * lh))
  g.shadowBlur = 0
  lines.forEach((l, i) => g.fillText(l, TEXT_PX / 2, top + i * lh))
}

export interface BubbleOptions {
  /** Curves to his phone and pops there (otherwise it drifts up and fades). */
  toPhone: boolean
  /** A visitor's question: a little larger and brighter, and it always reaches him. */
  visitor: boolean
}

interface Slot {
  live: boolean
  order: number
  text: string
  opts: BubbleOptions
  age: number
  life: number
  r0: number
  from: THREE.Vector3
  at: THREE.Vector3
  side: number
  sway: number
  freq: number
  phase: number
  drift: THREE.Vector2
  rise: number
  pop: number
  radius: number
  alpha: number
  sprite: THREE.Sprite
  core: THREE.Sprite
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
}

const ease = (u: number) => u * u * (3 - 2 * u)
const bezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3) => {
  const m = 1 - t
  return out
    .copy(a)
    .multiplyScalar(m * m * m)
    .addScaledVector(b, 3 * m * m * t)
    .addScaledVector(c, 3 * m * t * t)
    .addScaledVector(d, t * t * t)
}

/**
 * Up to eight glowing bubbles (four in lite mode), each a shell of points
 * with its question written inside. All of them are one draw call for the
 * points plus a sprite each for the text and the core glow.
 */
export function createBubbles() {
  const group = new THREE.Group()
  const rand = seeded(951)
  const pos: number[] = []
  const slot: number[] = []
  const dir: number[] = []
  const spark: number[] = []
  const col: number[] = []
  const size: number[] = []
  const seed: number[] = []
  const d = new THREE.Vector3()
  // Interleaved by slot, so lite mode's half draw range thins every bubble evenly.
  for (let j = 0, k = n(SHELL + SPARKS); j < k; j++) {
    const isSpark = j % 5 === 0 && j / 5 < SPARKS
    for (let s = 0; s < SLOTS; s++) {
      d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      if (d.lengthSq() < 1e-4) d.set(0, 1, 0)
      d.normalize()
      const t = rand()
      const c = isSpark ? (t < 0.45 ? C.gold : t < 0.8 ? C.white : C.light) : t < 0.5 ? C.white : t < 0.8 ? C.light : C.red
      const glow = isSpark ? 1.4 : 1.15
      pos.push(0, 0, 0)
      slot.push(s)
      dir.push(d.x, d.y, d.z)
      spark.push(isSpark ? 1 : 0)
      col.push(c.r * glow, c.g * glow, c.b * glow)
      size.push(isSpark ? 0.007 + rand() * 0.008 : 0.005 + rand() * 0.007)
      seed.push(rand())
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1))
  geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3))
  geo.setAttribute('aSpark', new THREE.Float32BufferAttribute(spark, 1))
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  const centres = Array.from({ length: SLOTS }, () => new THREE.Vector4())
  const states = Array.from({ length: SLOTS }, () => new THREE.Vector4())
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uProj: shared.uProj, uSizeK: shared.uSizeK, uAssemble: shared.uAssemble, uC: { value: centres }, uS: { value: states } },
      vertexShader: BUBBLE_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }),
  )
  points.frustumCulled = false
  group.add(points)

  const slots: Slot[] = centres.map(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TEXT_PX
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // Under the bloom threshold, so the words stay crisp.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: new THREE.Color(0.6, 0.58, 0.56) }))
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#ff5560') }))
    sprite.visible = core.visible = false
    sprite.renderOrder = 3
    group.add(core, sprite)
    return {
      live: false,
      order: 0,
      text: '',
      opts: { toPhone: false, visitor: false },
      age: 0,
      life: 1,
      r0: 0.2,
      from: new THREE.Vector3(),
      at: new THREE.Vector3(),
      side: 1,
      sway: 0,
      freq: 1,
      phase: 0,
      drift: new THREE.Vector2(),
      rise: 0.4,
      pop: 0,
      radius: 0,
      alpha: 0,
      sprite,
      core,
      canvas,
      texture,
    }
  })
  let born = 0
  const p1 = new THREE.Vector3()
  const p2 = new THREE.Vector3()
  const p3 = new THREE.Vector3()

  const self = {
    group,
    /** Called once when a bubble reaches his phone and pops. */
    onPop: null as ((text: string, visitor: boolean, at: THREE.Vector3) => void) | null,
    get live() {
      return slots.filter((s) => s.live).length
    },
    /** Visitor or phone bubbles still on their way. */
    get pending() {
      return slots.some((s) => s.live && s.opts.toPhone && s.pop === 0)
    },
    /**
     * Sends a bubble up from `from` (on the water). Returns false when the
     * scene is full; a visitor's bubble takes the place of the oldest drifting one instead.
     */
    spawn(text: string, from: THREE.Vector3, opts: BubbleOptions) {
      const cap = lite.on ? 4 : SLOTS
      let s = slots.find((x) => !x.live)
      if (self.live >= cap) s = undefined
      if (!s && opts.visitor) {
        s = slots.filter((x) => x.live && !x.opts.toPhone).sort((a, b) => a.order - b.order)[0]
        s ??= slots.filter((x) => x.live && !x.opts.visitor).sort((a, b) => a.order - b.order)[0]
      }
      if (!s) return false
      Object.assign(s, {
        live: true,
        order: born++,
        text,
        opts,
        age: 0,
        pop: 0,
        r0: opts.visitor ? 0.33 : 0.2 + Math.random() * 0.06,
        // Phone-bound bubbles bow out toward the middle of the screen, away from the copy on the left.
        side: opts.toPhone ? (from.x < 0.3 ? 1 : -1) : Math.random() < 0.5 ? -1 : 1,
        sway: 0.1 + Math.random() * 0.2,
        freq: 0.45 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        rise: 0.42 + Math.random() * 0.12,
        // Drifting ones rise about three metres, fading out high in the frame.
        life: opts.toPhone ? (opts.visitor ? 3.6 : 4.2) : 6.2 + Math.random() * 1.4,
      })
      s.drift.set((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.08)
      s.from.copy(from)
      s.at.copy(from)
      drawQuestion(s.canvas, text, opts.visitor)
      s.texture.needsUpdate = true
      return true
    },
    /** Drifting questions already on their way to the phone veer off and fade instead (a visitor's question takes their turn). */
    divert() {
      for (const s of slots) {
        if (!s.live || s.opts.visitor || !s.opts.toPhone || s.pop > 0) continue
        s.opts = { toPhone: false, visitor: false }
        s.from.copy(s.at).y -= 0.05
        s.age = 0.7
        s.life = 3.2
        s.sway = 0.12
        s.phase = 0
        s.drift.set(-s.side * 0.25, -0.05)
      }
    },
    /** Every bubble gone at once (on arrival, so nothing is left hanging from last time). */
    clear() {
      slots.forEach((s) => (s.live = false))
      self.update(0, null)
    },
    /** Delivers whatever is on its way to the phone straight away (leaving the screen), and clears the rest. */
    flush() {
      for (const s of slots) if (s.live && s.opts.toPhone && s.pop === 0) self.onPop?.(s.text, s.opts.visitor, s.at)
      self.clear()
    },
    update(dt: number, phone: THREE.Vector3 | null) {
      slots.forEach((s, i) => {
        if (s.live) {
          if (s.pop > 0) {
            s.pop += dt / 0.75
            if (s.pop >= 1) s.live = false
          } else if (s.opts.toPhone && phone) {
            s.age += dt
            const u = Math.min(1, s.age / s.life)
            // Up off the water, then a curve that comes in to the phone from above and in front.
            p1.copy(s.from).add(d.set(s.side * 0.45, 1.5, 0.35))
            p2.copy(phone).add(d.set(s.side * 0.55, 0.75, 0.6))
            p3.copy(phone).add(d.set(0, 0.03, 0.05))
            bezier(s.from, p1, p2, p3, ease(u), s.at)
            s.radius = s.r0 * THREE.MathUtils.smoothstep(s.age, 0, 0.7) * THREE.MathUtils.lerp(1, 0.5, THREE.MathUtils.smoothstep(u, 0.55, 1))
            s.alpha = THREE.MathUtils.smoothstep(s.age, 0, 0.45)
            if (u >= 1) {
              s.pop = 1e-4
              self.onPop?.(s.text, s.opts.visitor, s.at)
            }
          } else {
            // Drifting: up on a gentle curve, fading out high above the water.
            s.age += dt
            const t = s.age
            s.at.set(
              s.from.x + s.drift.x * t + s.sway * (Math.sin(s.freq * t + s.phase) - Math.sin(s.phase)),
              s.from.y + 0.05 + s.rise * t,
              s.from.z + s.drift.y * t + s.sway * 0.5 * (Math.cos(s.freq * 0.8 * t + s.phase) - Math.cos(s.phase)),
            )
            s.radius = s.r0 * THREE.MathUtils.smoothstep(t, 0, 0.7) * (1 + 0.06 * Math.min(1, t / s.life))
            // Fades with age, and in any case before it climbs into the corner label.
            s.alpha = THREE.MathUtils.smoothstep(t, 0, 0.5) * (1 - THREE.MathUtils.smoothstep(t, s.life - 2.4, s.life)) * (1 - THREE.MathUtils.smoothstep(s.at.y, 1.9, 2.4))
            if (t >= s.life) s.live = false
          }
        }
        const on = s.live
        const bright = s.opts.visitor ? 1.6 : 1
        centres[i].set(s.at.x, s.at.y, s.at.z, s.radius)
        states[i].set(on ? s.alpha : 0, s.pop, bright, 0)
        const fade = on ? s.alpha * shared.uAssemble.value : 0
        s.sprite.visible = s.core.visible = on
        s.sprite.position.copy(s.at)
        s.sprite.scale.setScalar(s.radius * 2 * (1 + s.pop * 0.4))
        s.sprite.material.opacity = fade * Math.max(0, 1 - s.pop * 3.5)
        s.core.position.copy(s.at)
        // The core flares as it pops.
        s.core.scale.setScalar(s.radius * (2.4 + s.pop * 5))
        s.core.material.opacity = fade * (0.16 * bright + (s.pop > 0 ? 0.9 * (1 - s.pop) : 0))
      })
    },
  }
  return self
}

export type Bubbles = ReturnType<typeof createBubbles>

// ---------------------------------------------------------------------------
// The glance: a small look down at the phone
// ---------------------------------------------------------------------------
/** Head and neck dip toward the phone for about a second, then come back up. */
export function glanceOverlay(reduced: boolean) {
  let t = -1
  const fn: PoseOverlay = (m, weight, dt) => {
    if (t < 0 || reduced) return
    t += dt
    const env = t < 0.28 ? ease(t / 0.28) : t < 0.95 ? 1 : 1 - ease(Math.min(1, (t - 0.95) / 0.55))
    if (t > 1.5) t = -1
    const k = env * weight
    m.bone('Neck')?.rotateX(0.09 * k)
    const head = m.bone('Head')
    head?.rotateX(0.2 * k)
    head?.updateMatrixWorld(true)
  }
  return {
    fn,
    trigger() {
      t = 0
    },
  }
}
