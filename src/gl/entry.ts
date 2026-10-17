import * as THREE from 'three'
import symbolSvg from '../brand/symbol.svg?raw'
import { fx } from '../fx-config'
import { fitFov } from './frame'
import { Cloud, n, seeded, shared } from './points'
import { C, stamp, svgStamp } from './shapes'

/**
 * The entry screen and the enter sequence.
 *
 * At rest: a deep star field orbiting the emblem, inner stars faster (the
 * cursor pushes nearby stars aside). The emblem is a glass orb of points:
 * a lit sphere shell (bright limb, a highlight, a dimmer far side showing
 * through), the emblem's notched coin ring as a band wrapped round it, a
 * faint orbit ring, and the crow's head inside as a solid point sculpture,
 * held still at a three-quarter angle. Its key light leans toward the cursor.
 *
 * Everything the enter sequence animates lives in `state` (boot.ts drives it):
 *   vortex   the field spirals into the emblem
 *   spin     the emblem spins up and brightens
 *   ring     a ring of points forms around it
 *   implode  emblem and ring collapse to a point
 *   shock    a ring of light races outward
 *   warp     hyperspace streak speed, 0–1
 *   streaks  hyperspace streak opacity
 */
const FIELD_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uSizeK;
uniform vec2 uMouse;
uniform float uAspect;
uniform float uPush;
uniform float uVortex;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  float s = aSeed * 6.2831;
  p += vec3(sin(uTime * 0.11 + s), cos(uTime * 0.13 + s * 1.7), sin(uTime * 0.07 + s * 2.3)) * 0.3;

  // Orbit: every star circles the emblem's vertical axis, the inner ones faster.
  float orbitR = length(p.xz);
  float orbitA = atan(p.z, p.x) + uTime * (0.025 + 0.32 / (1.0 + orbitR * 0.3));
  p.xz = vec2(cos(orbitA), sin(orbitA)) * orbitR;

  // Vortex: spiral into the emblem, nearer points first.
  float v = clamp(uVortex * 1.7 - aSeed * 0.7, 0.0, 1.0);
  v = v * v * (3.0 - 2.0 * v);
  float r = length(p.xy);
  float ang = atan(p.y, p.x) + v * (1.5 + 9.0 / (1.0 + r * 0.25));
  r *= 1.0 - v;
  p = vec3(cos(ang) * r, sin(ang) * r, mix(p.z, 0.0, v));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 ndc = gl_Position.xy / gl_Position.w;
  vec2 d = ndc - uMouse;
  d.x *= uAspect;
  float fall = exp(-dot(d, d) / 0.03);
  ndc += normalize(d + 1e-5) * vec2(1.0 / uAspect, 1.0) * uPush * fall;
  gl_Position.xy = ndc * gl_Position.w;

  float dist = max(-mv.z, 0.05);
  float px = aSize * uSizeK * uProj / dist;
  gl_PointSize = clamp(px, 1.3, 26.0);
  vColor = aColor * (1.0 + v * 2.5);
  // Stars swinging round past the camera fade out instead of filling the screen.
  vAlpha = (0.65 + 0.35 * sin(uTime * (1.0 + aSeed * 3.0) + s)) * min(1.0, px / 1.3) * (1.0 - smoothstep(0.75, 1.0, v)) * smoothstep(1.5, 5.0, dist);
}`

const DOT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float soft = (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(vColor * (soft * 0.8 + exp(-r2 * 9.0) * 0.5) * vAlpha, 1.0);
}`

const SYMBOL_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uSizeK;
uniform vec2 uMouse;      // NDC, or far away
uniform vec2 uCenter;     // emblem centre in NDC
uniform float uAspect;
uniform float uGlow;
uniform float uImplode;
uniform float uForm;      // 0 = scattered, 1 = formed (used by the ring)
uniform float uRadius;    // emblem radius in its own units
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
  float f = clamp(uForm * 1.5 - aSeed * 0.5, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  p += hash3(aSeed * 77.0) * (1.0 - f) * 6.0;
  p *= 1.0 - uImplode;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Rim toward the cursor: points near the edge of the coin, on the cursor's side.
  vec2 ndc = gl_Position.xy / gl_Position.w;
  vec2 toP = (ndc - uCenter) * vec2(uAspect, 1.0);
  vec2 toM = (uMouse - uCenter) * vec2(uAspect, 1.0);
  float rim = smoothstep(0.78, 0.95, length(position.xy) / uRadius);
  float facing = max(0.0, dot(normalize(toP + 1e-5), normalize(toM + 1e-5)));
  float near = exp(-max(0.0, length(toM) - length(toP)) * 1.2);
  float lit = rim * pow(facing, 3.0) * near * step(length(toM), 4.0);

  float dist = max(-mv.z, 0.05);
  float px = aSize * uSizeK * uProj / dist;
  gl_PointSize = max(px, 1.3);
  float shimmer = 0.6 + 0.4 * sin(uTime * (2.0 + aSeed * 5.0) + s * 13.0);
  vColor = aColor * (shimmer + lit * 3.2 + uGlow * 2.0 + uImplode * 4.0);
  vAlpha = min(1.0, px / 1.3) * f * (1.0 - smoothstep(0.85, 1.0, uImplode));
}`

// The orb's points, lit like a surface: each point's normal is radial from the
// orb's centre (shell, band) or, for the head, its face or its outline.
const ORB_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uSizeK;
uniform float uGlow;
uniform float uImplode;
uniform vec3 uLight;      // key light direction, view space
uniform float uHead;      // 1 = head sculpture normals
uniform vec3 uHeadMid;    // head centre (its own space)
uniform float uHeadHalf;  // half its depth
uniform vec4 uLook;       // ambient, diffuse, highlight, rim
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position * (1.0 - uImplode);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vec3 nObj = normalize(position + 1e-5);
  if (uHead > 0.5) {
    vec3 q = position - uHeadMid;
    nObj = abs(q.z) > uHeadHalf * 0.8 ? vec3(0.0, 0.0, sign(q.z)) : normalize(vec3(q.xy, 0.0) + 1e-5);
  }
  vec3 n = normalize(normalMatrix * nObj);
  vec3 v = normalize(-mv.xyz);
  float ndv = dot(n, v);
  float facing = mix(0.3, 1.0, smoothstep(-0.3, 0.3, ndv));
  float rim = pow(1.0 - abs(ndv), 3.0);
  float diff = max(0.0, dot(n, uLight));
  float spec = pow(max(0.0, dot(reflect(-uLight, n), v)), 28.0);
  float shimmer = 0.78 + 0.22 * sin(uTime * (1.5 + aSeed * 4.0) + aSeed * 80.0);
  float lum = (uLook.x + uLook.y * diff + uLook.z * spec + uLook.w * rim) * facing * shimmer;
  vColor = aColor * (lum + uGlow * 2.0 + uImplode * 4.0);

  float dist = max(-mv.z, 0.05);
  float px = aSize * uSizeK * uProj / dist;
  gl_PointSize = max(px, 1.0);
  vAlpha = min(1.0, px / 1.2) * (1.0 - smoothstep(0.85, 1.0, uImplode));
}`

const SHOCK_VERT = /* glsl */ `
uniform float uProj;
uniform float uShock;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = mix(0.05, 16.0, pow(uShock, 0.7)) * (0.96 + aSeed * 0.08);
  vec3 p = vec3(position.xy * r, position.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(aSize * uProj / max(-mv.z, 0.05) * (1.0 + uShock * 2.0), 1.5);
  vColor = aColor * 3.0;
  vAlpha = step(0.001, uShock) * (1.0 - smoothstep(0.35, 1.0, uShock));
}`

const STREAK_VERT = /* glsl */ `
uniform float uTravel;
uniform float uLen;
uniform float uAlpha;
uniform float uDepth;
attribute float aTail;
attribute float aSeed;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // Streaks live in camera space: x/y around the axis, z ahead of the camera.
  float z = -0.6 - mod(position.z + uTravel * (0.8 + aSeed * 0.4), uDepth);
  z -= aTail * uLen * (0.6 + aSeed * 0.8);
  vec4 mv = modelViewMatrix * vec4(position.xy, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float near = smoothstep(uDepth, uDepth * 0.4, -z);
  vColor = aColor;
  vAlpha = uAlpha * near * (1.0 - aTail * 0.85);
}`

const LINE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() { gl_FragColor = vec4(vColor * vAlpha, 1.0); }`

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
}

export async function createEntry(reduced: boolean) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#020308')
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200)
  camera.position.set(0, 0, 10)
  scene.add(camera)

  // ---- star field --------------------------------------------------------------
  const field = new Cloud(11)
  const rnd = field.rand
  for (let i = 0, k = n(fx.entry.field); i < k; i++) {
    // A thin disc round the emblem, denser toward the middle, thicker toward the rim.
    const radius = 3 + Math.sqrt(rnd()) * 52
    const a = rnd() * Math.PI * 2
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(rnd() * Math.PI * 2)
    // Most stars fill the whole view; the rest thicken a band through the middle.
    const thick = 0.4 + radius * (rnd() < 0.62 ? 0.3 : 0.07)
    const r = rnd()
    const col = r < 0.16 ? C.blue : r < 0.3 ? C.pale : r < 0.315 ? C.gold : C.white
    field.add(Math.cos(a) * radius, g * thick, Math.sin(a) * radius, col, rnd() < 0.04 ? 0.05 + rnd() * 0.06 : 0.018 + rnd() * 0.024, 0.5 + rnd() * 0.9)
  }
  const fieldPts = field.build()
  // Tilted a touch, so the orbit reads as a slow sweep rather than straight across.
  fieldPts.rotation.set(0.1, 0, -0.06)
  const fieldU = {
    ...shared,
    uMouse: { value: new THREE.Vector2(9, 9) },
    uAspect: { value: 1 },
    uPush: { value: reduced ? 0 : fx.entry.push },
    uVortex: { value: 0 },
  }
  fieldPts.material = new THREE.ShaderMaterial({ vertexShader: FIELD_VERT, fragmentShader: DOT_FRAG, uniforms: fieldU, ...additive })
  scene.add(fieldPts)

  // ---- emblem: a glass orb of points with the crow's head inside -----------------
  const R = 1.75
  const emblem = new THREE.Group()
  scene.add(emblem)
  const orbU = {
    ...shared,
    uGlow: { value: 0 },
    uImplode: { value: 0 },
    uLight: { value: new THREE.Vector3(-0.5, 0.6, 0.65).normalize() },
  }
  /** look: ambient, diffuse, highlight, rim. */
  const orbPart = (c: Cloud, look: [number, number, number, number], head = 0, mid = new THREE.Vector3(), half = 0) => {
    const pts = c.build()
    const u = { ...orbU, uHead: { value: head }, uHeadMid: { value: mid }, uHeadHalf: { value: half }, uLook: { value: new THREE.Vector4(...look) } }
    pts.material = new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: DOT_FRAG, uniforms: u, ...additive })
    return pts
  }
  const silver = (r: number) => (r < 0.7 ? C.white : r < 0.93 ? C.pale : C.blue)

  // The shell: an even spread over the sphere; seen in perspective, the limb gathers into a bright edge.
  const shell = new Cloud(12)
  const shellN = n(fx.entry.orb)
  for (let i = 0; i < shellN; i++) {
    const y = 1 - (2 * (i + 0.5)) / shellN
    const rr = Math.sqrt(1 - y * y)
    const a = i * 2.399963 + shell.rand() * 0.02
    const k = R * (1 + (shell.rand() - 0.5) * 0.012)
    shell.add(Math.cos(a) * rr * k, y * k, Math.sin(a) * rr * k, silver(shell.rand()), 0.007 + shell.rand() * 0.008, 0.75 + shell.rand() * 0.4)
  }
  // Glass: a faint face, the light gathered at the limb and in the highlight.
  emblem.add(orbPart(shell, [0.02, 0.05, 1.2, 1.7]))

  // The emblem's notched coin ring, as a dashed band wrapped round the orb.
  const band = new Cloud(16)
  const dashes = 12
  for (let i = 0, k = n(fx.entry.orb * 0.45); i < k; i++) {
    const t = band.rand()
    const cell = t * dashes - Math.floor(t * dashes)
    if (cell > 0.86) continue
    const a = t * Math.PI * 2
    const lat = (band.rand() - 0.5) * 0.24
    const rr = R * 1.015 * (1 + (band.rand() - 0.5) * 0.01)
    const edge = Math.abs(lat) > 0.1 || cell < 0.03 || cell > 0.83
    band.add(Math.cos(a) * Math.cos(lat) * rr, Math.sin(lat) * rr, Math.sin(a) * Math.cos(lat) * rr, band.rand() < 0.85 ? C.white : C.pale, 0.008 + band.rand() * 0.008, edge ? 1.5 : 1)
  }
  const bandPts = orbPart(band, [1.5, 1.2, 2, 1])
  const bandHolder = new THREE.Group()
  bandHolder.rotation.set(0.95, 0, 0.18)
  bandHolder.add(bandPts)
  emblem.add(bandHolder)

  // A faint orbit ring, wider and tipped the other way.
  const orbit = new Cloud(17)
  for (let i = 0, k = n(2600); i < k; i++) {
    const a = orbit.rand() * Math.PI * 2
    const rr = R * 1.24 + (orbit.rand() - 0.5) * 0.02
    orbit.add(Math.cos(a) * rr, (orbit.rand() - 0.5) * 0.015, Math.sin(a) * rr, orbit.rand() < 0.75 ? C.white : C.blue, 0.006 + orbit.rand() * 0.006, 0.7)
  }
  const orbitPts = orbPart(orbit, [0.5, 0.3, 1, 0.3])
  const orbitHolder = new THREE.Group()
  orbitHolder.rotation.set(-0.25, 0, -0.38)
  orbitHolder.add(orbitPts)
  emblem.add(orbitHolder)

  // The crow's head inside: the emblem's head, extruded into a solid sculpture.
  const st = await svgStamp(symbolSvg.replace(/<circle[^>]*\/>/, ''), 640)
  const box = R * 2.55 // the 64-unit viewBox; the head spans ~37 of it, about 1.5R wide
  const depth = R * 0.42
  const at = new THREE.Vector3(-((38.1 - 32) / 64) * box, ((34.15 - 32) / 64) * box, depth / 2)
  const head = new Cloud(18)
  stamp(head, st, box, { count: fx.entry.symbol, depth, edge: 0.92, size: [0.008, 0.016], tint: silver, glow: 1 }, at)
  // Turned back toward the camera (the orb is at three-quarters), so his profile reads.
  const headHolder = new THREE.Group()
  headHolder.rotation.set(-0.12, 0.36, 0)
  headHolder.add(orbPart(head, [1.3, 1.4, 1.8, 1.2], 1, new THREE.Vector3(0, 0, 0), depth / 2))
  emblem.add(headHolder)

  // Cursor bookkeeping for the vortex ring.
  const symU = {
    ...shared,
    uMouse: { value: new THREE.Vector2(9, 9) },
    uCenter: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
    uGlow: { value: 0 },
    uImplode: { value: 0 },
    uForm: { value: 1 },
    uRadius: { value: 99 },
  }

  // The ring that forms around it during the vortex.
  const ringCloud = new Cloud(13)
  for (let i = 0, k = n(3000); i < k; i++) {
    const a = ringCloud.rand() * Math.PI * 2
    const rr = R * 1.32 + (ringCloud.rand() - 0.5) * 0.12
    ringCloud.add(Math.cos(a) * rr, Math.sin(a) * rr, (ringCloud.rand() - 0.5) * 0.08, ringCloud.rand() < 0.3 ? C.pale : C.white, 0.012 + ringCloud.rand() * 0.016, 0.9)
  }
  const ringPts = ringCloud.build()
  const ringU = { ...symU, uForm: { value: 0 }, uGlow: { value: 0 } }
  ringPts.material = new THREE.ShaderMaterial({ vertexShader: SYMBOL_VERT, fragmentShader: DOT_FRAG, uniforms: ringU, ...additive })
  const ringHolder = new THREE.Group()
  ringHolder.rotation.set(1.15, 0, 0.3)
  ringHolder.add(ringPts)
  emblem.add(ringHolder)

  // Soft halo behind the emblem.
  const haloTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(190,210,255,0.07)')
    grad.addColorStop(0.35, 'rgba(47,123,255,0.028)')
    grad.addColorStop(1, 'rgba(2,3,8,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  })()
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.setScalar(R * 4.5)
  scene.add(halo)

  // ---- shockwave ------------------------------------------------------------------
  const shock = new Cloud(14)
  for (let i = 0, k = n(3000); i < k; i++) {
    const a = shock.rand() * Math.PI * 2
    shock.add(Math.cos(a), Math.sin(a), (shock.rand() - 0.5) * 0.2, shock.rand() < 0.4 ? C.pale : C.white, 0.02 + shock.rand() * 0.02)
  }
  const shockPts = shock.build()
  const shockU = { uProj: shared.uProj, uShock: { value: 0 } }
  shockPts.material = new THREE.ShaderMaterial({ vertexShader: SHOCK_VERT, fragmentShader: DOT_FRAG, uniforms: shockU, ...additive })
  scene.add(shockPts)

  // ---- hyperspace streaks (also carried into screen 01 while they slow down) --------
  const streakCount = n(fx.entry.streaks)
  const sp = new Float32Array(streakCount * 2 * 3)
  const sTail = new Float32Array(streakCount * 2)
  const sSeed = new Float32Array(streakCount * 2)
  const sCol = new Float32Array(streakCount * 2 * 3)
  const sr = seeded(15)
  const DEPTH = 60
  for (let i = 0; i < streakCount; i++) {
    const a = sr() * Math.PI * 2
    const rad = 0.35 + Math.pow(sr(), 0.7) * 7
    const z = sr() * DEPTH
    const seed = sr()
    const c = sr() < 0.3 ? C.blue : sr() < 0.5 ? C.pale : C.white
    const k = 1.2 + sr() * 1.8
    for (let e = 0; e < 2; e++) {
      const j = i * 2 + e
      sp.set([Math.cos(a) * rad, Math.sin(a) * rad, z], j * 3)
      sTail[j] = e
      sSeed[j] = seed
      sCol.set([c.r * k, c.g * k, c.b * k], j * 3)
    }
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  sg.setAttribute('aTail', new THREE.BufferAttribute(sTail, 1))
  sg.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1))
  sg.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3))
  const streakU = { uTravel: { value: 0 }, uLen: { value: 0 }, uAlpha: { value: 0 }, uDepth: { value: DEPTH } }
  const streaks = new THREE.LineSegments(sg, new THREE.ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: LINE_FRAG, uniforms: streakU, ...additive }))
  streaks.frustumCulled = false
  camera.add(streaks)

  const state = { vortex: 0, spin: 0, ring: 0, implode: 0, shock: 0, warp: 0, streaks: 0, fov: 55 }
  let spinAngle = 0
  let travel = 0
  const ndcV = new THREE.Vector3()
  const lightRest = new THREE.Vector3(-0.5, 0.6, 0.65).normalize()
  const lightAim = new THREE.Vector3()
  const all = [fieldU, symU, ringU]

  return {
    scene,
    camera,
    state,
    streaks,
    resize(w: number, h: number) {
      camera.aspect = w / h
      for (const u of all) u.uAspect.value = w / h
    },
    /** While the streaks are carried over into screen 01, they ride along with its camera. */
    followCamera(cam: THREE.Camera) {
      if (streaks.parent === camera) return
      streaks.position.copy(cam.position)
      streaks.quaternion.copy(cam.quaternion)
    },
    /** Moves the streaks into another scene (for the settle into screen 01) or back home. */
    carryStreaks(into: THREE.Scene | null) {
      streaks.removeFromParent()
      if (into) into.add(streaks)
      else {
        streaks.position.set(0, 0, 0)
        streaks.quaternion.identity()
        camera.add(streaks)
      }
    },
    /** mouse: NDC (−1..1) or null when there is no cursor. */
    update(time: number, dt: number, mouse: { x: number; y: number } | null) {
      const t = reduced ? 0 : time
      // A fixed camera: the emblem holds perfectly still; only the stars orbit.
      camera.position.set(0, 0, 10)
      camera.fov = camera.aspect < 0.8 ? state.fov + 14 : fitFov(state.fov, camera.aspect, 95)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()

      // Emblem: still at rest, spinning up during the vortex.
      // Still at rest; it only spins once the enter sequence spins it up.
      spinAngle += dt * state.spin * state.spin * 14
      // Held still: turned a little away and tipped toward the viewer, so its
      // depth shows along the right and top edges.
      emblem.rotation.set(0.3, -0.5 + spinAngle, 0.04)
      // The band and the orbit ring drift slowly round the still orb.
      bandPts.rotation.y = -t * 0.12
      orbitPts.rotation.y = t * 0.07
      // Key light: upper left at rest, leaning toward the cursor.
      if (mouse && state.vortex === 0) lightAim.set(mouse.x * 1.3, mouse.y * 1.3, 0.75).normalize()
      else lightAim.copy(lightRest)
      orbU.uLight.value.lerp(lightAim, 1 - Math.exp(-dt / 0.25)).normalize()
      ringHolder.rotation.z = t * 0.6 + state.spin * 8
      halo.material.opacity = (1 - state.implode) * (1 + state.spin * 1.5)

      ndcV.set(0, 0, 0).project(camera)
      for (const u of all) {
        if (mouse && state.vortex === 0) u.uMouse.value.set(mouse.x, mouse.y)
        else u.uMouse.value.set(9, 9)
      }
      symU.uCenter.value.set(ndcV.x, ndcV.y)
      fieldU.uVortex.value = state.vortex
      orbU.uGlow.value = state.spin
      orbU.uImplode.value = state.implode
      ringU.uForm.value = state.ring
      ringU.uGlow.value = state.spin
      ringU.uImplode.value = state.implode
      shockU.uShock.value = state.shock
    },
    /** Hyperspace streaks: speed eases in, then out; length follows speed. Runs in both modes. */
    tickStreaks(dt: number) {
      const speed = state.warp * state.warp * 140
      travel += speed * dt
      streakU.uTravel.value = travel
      streakU.uLen.value = 0.05 + speed * 0.045
      streakU.uAlpha.value = state.streaks
      streaks.visible = state.streaks > 0.001
    },
  }
}

export type Entry = Awaited<ReturnType<typeof createEntry>>
