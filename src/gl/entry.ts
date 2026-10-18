import * as THREE from 'three'
import symbolSvg from '../brand/symbol.svg?raw'
import { fx } from '../fx-config'
import { fitFov } from './frame'
import { Cloud, n, seeded, shared } from './points'
import { C, svgRelief } from './shapes'

/**
 * The entry screen and the enter sequence.
 *
 * At rest: a deep star field orbiting the emblem, inner stars faster (the
 * cursor pushes nearby stars aside). The emblem is a hollow coin of points:
 * just its rim, a very short tube, with the lion's head inside it as a
 * bevelled point sculpture. At rest he faces you square on; the whole coin
 * tilts toward the cursor, so the rim's band and the head's thickness show,
 * and its key light leans the same way, so the bevels and the rim follow it.
 *
 * Everything the enter sequence animates lives in `state` (boot.ts drives it):
 *   vortex   the field spirals into the emblem
 *   spin     the emblem spins up and brightens
 *   rings    0 → ringCount: thick rings lock on round it, one per whole step
 *   gyro     the rings tumble round it on their own axes, faster, drawing in tight
 *   charge   it trembles and pulses, harder as it rises
 *   implode  emblem and rings collapse to a point
 *   blast    a white-hot core bursts out from the centre, 0–1
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
uniform float uForm;      // 0 = scattered, 1 = formed (used by the rings)
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
  // Every point lands within the last few percent, so a ring locks on all at once.
  float f = clamp(uForm * 1.12 - aSeed * 0.12, 0.0, 1.0);
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

// The orb's points, lit like a surface: each point's normal is radial from its
// centre, or (NORMALS defined: the coin shell, the head's bevelled relief)
// carried per point.
const ORB_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uSizeK;
uniform float uGlow;
uniform float uImplode;
uniform vec3 uLight;      // key light direction, view space
uniform vec4 uLook;       // ambient, diffuse, highlight, rim
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
#ifdef NORMALS
attribute vec3 aNormal;
#endif
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position * (1.0 - uImplode);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

#ifdef NORMALS
  vec3 nObj = aNormal;
#else
  vec3 nObj = normalize(position + 1e-5);
#endif
  vec3 n = normalize(normalMatrix * nObj);
  vec3 v = normalize(-mv.xyz);
  float ndv = dot(n, v);
  float facing = mix(0.3, 1.0, smoothstep(-0.3, 0.3, ndv));
  float rim = pow(1.0 - abs(ndv), 3.0);
  // Edges are brightest on the lit side and fall away on the far one, so the orb reads round
  // and the head's outline reads as a lit wall rather than a flat glow.
  rim *= 0.3 + 0.7 * clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
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

// The orb's resting turn: a little away and tipped toward the viewer.
const EMBLEM_REST = new THREE.Euler(0.3, -0.5, 0.04)

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
    // Warm: mostly white, a good share of red, more gold than a cold field would carry.
    const col = r < 0.17 ? C.red : r < 0.27 ? C.light : r < 0.33 ? C.gold : C.white
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

  // ---- emblem: a hollow coin of points with the lion's head inside ----------------
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
  const orbPart = (c: Cloud, look: [number, number, number, number]) => {
    const pts = c.build()
    const u = { ...orbU, uLook: { value: new THREE.Vector4(...look) } }
    pts.material = new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: DOT_FRAG, uniforms: u, defines: c.nrm.length ? { NORMALS: '' } : {}, ...additive })
    return pts
  }
  const silver = (r: number) => (r < 0.68 ? C.white : r < 0.86 ? C.light : r < 0.95 ? C.red : C.gold)

  // The orb is held at three-quarters; the coin and the head on it undo that turn exactly, so
  // at rest he faces you square on, and the tilt toward the cursor turns them all as one.
  const headHolder = new THREE.Group()
  headHolder.quaternion.setFromEuler(EMBLEM_REST).invert()
  emblem.add(headHolder)

  // The coin: hollow, just its rim, a very short tube. An outer wall and an inner one, joined at
  // the front and back by a thin lip, and nothing across the faces. Its four edges are drawn as
  // crisp bright circles and the walls and lips between them faintly, so face on it reads as a
  // tube seen down its length, and tipped as a band between two ellipses.
  const shell = new Cloud(12)
  const shellN = n(fx.entry.orb)
  const rimHalf = R * 0.24 // half the coin's thickness, front to back
  const rimIn = R * 0.94 // the inner wall's radius
  for (let i = 0; i < shellN; i++) {
    const a = shell.rand() * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const part = shell.rand()
    const front = shell.rand() < 0.5
    let r: number, z: number, glow: number
    if (part < 0.34) {
      // The edges: outer and inner, front and back, each normal halfway between wall and lip.
      const outer = shell.rand() < 0.55
      r = (outer ? R : rimIn) + (shell.rand() - 0.5) * 0.006
      z = (front ? 1 : -1) * rimHalf
      glow = 1.7
      const nl = Math.SQRT1_2
      shell.normal((outer ? c : -c) * nl, (outer ? s : -s) * nl, (front ? 1 : -1) * nl)
    } else if (part < 0.74) {
      // The walls, outer facing out and inner facing in.
      const outer = shell.rand() < 0.6
      r = outer ? R : rimIn
      z = (shell.rand() * 2 - 1) * rimHalf
      glow = outer ? 0.45 : 0.35
      shell.normal(outer ? c : -c, outer ? s : -s, 0)
    } else {
      // The lips, front and back.
      r = rimIn + shell.rand() * (R - rimIn)
      z = (front ? 1 : -1) * rimHalf
      glow = 0.7
      shell.normal(0, 0, front ? 1 : -1)
    }
    shell.add(c * r, s * r, z, silver(shell.rand()), 0.007 + shell.rand() * 0.008, glow * (0.75 + shell.rand() * 0.4))
  }
  headHolder.add(orbPart(shell, [0.3, 1.3, 1.8, 1.6]))

  // The lion's head inside: the emblem without its coin ring, extruded into a solid sculpture.
  // Its whole face bulges like a struck coin's, and every piece on it is bevelled, rising from its
  // outline to a rounded crown (thin rays come to a ridge). Each point carries its surface's
  // normal, so the key light models it; the bevels' feet sit a little in shadow.
  const st = await svgRelief(symbolSvg.replace(/<circle[^>]*\/>/, ''), 640)
  const box = R * 2.15 // the 64-unit viewBox; head and mane span ~43 of it, about 1.65R wide
  const depth = R * 0.32
  const bevel = 0.035 // how far in the slope runs, share of the viewBox (~2 units)
  const lift = depth * 0.8 // how far the crown stands proud of the outline
  const dome = depth * 0.7 // how far the middle bulges past the ray tips
  // Centred front to back in the coin: from his back to the top of the bulge.
  const at = new THREE.Vector3(0, -((32.6 - 32) / 64) * box, (depth - dome) / 2)
  const domeR = 0.36 // the bulge's radius, share of the viewBox (just past the ray tips)
  const domeY = (32.6 - 32) / 64 // the head's centre sits that far below the viewBox's
  const head = new Cloud(18)
  const hn = new THREE.Vector3()
  const e = 1.5 / 640
  for (let got = 0, want = n(fx.entry.symbol), tries = 0; got < want && tries < want * 40; tries++) {
    const x = head.rand() - 0.5
    const y = head.rand() - 0.5
    const s = st.sample(x, y)
    if (!s) continue
    const t = Math.min(1, st.inset(x, y) / bevel)
    // The face: sparse on the flat crown, denser down the bevel so its shading reads.
    if (s === 1 && head.rand() > 0.08 + 0.3 * (1 - t)) continue
    // Slope of the inset (share of the viewBox per share of it), for the bevel's normals and the walls' outward direction.
    const gx = (st.inset(x + e, y) - st.inset(x - e, y)) / (2 * e)
    const gy = (st.inset(x, y + e) - st.inset(x, y - e)) / (2 * e)
    // The bulge: a shallow paraboloid, and its slope per world unit.
    const dy = y + domeY
    const inDome = x * x + dy * dy < domeR * domeR
    const bulge = inDome ? dome * (1 - (x * x + dy * dy) / (domeR * domeR)) : 0
    const bx = inDome ? (-2 * dome * x) / (domeR * domeR * box) : 0
    const by = inDome ? (-2 * dome * dy) / (domeR * domeR * box) : 0
    let z: number
    let shade: number
    if (s === 2) {
      // The wall: from the outline down to the back, facing straight out.
      const top = bulge - lift
      z = top - head.rand() * (top + depth)
      hn.set(-gx, -gy, 0)
      shade = 1.25
    } else if (head.rand() < 0.75) {
      // The front: up the bevel (a quarter-sine shoulder) to the crown, riding the bulge.
      z = bulge + lift * Math.sin((t * Math.PI) / 2) - lift
      const k = t < 1 ? (lift * (Math.PI / 2) * Math.cos((t * Math.PI) / 2)) / (bevel * box) : 0
      hn.set(-gx * k - bx, -gy * k - by, 1)
      shade = 0.8 * (0.7 + 0.3 * Math.sin((t * Math.PI) / 2))
    } else if (head.rand() < 0.4) {
      // A sparse back, so tipped he doesn't show a ghost of himself through the front.
      z = -depth
      hn.set(0, 0, -1)
      shade = 0.4
    } else continue
    if (hn.lengthSq() < 1e-8) hn.set(0, 0, 1)
    hn.normalize()
    const big = head.rand() < 0.04 ? 1.8 : 1
    const j = () => (head.rand() - 0.5) * 0.008
    head.add(at.x + x * box + j(), at.y + y * box + j(), at.z + z + j(), silver(head.rand()), (0.008 + 0.008 * head.rand()) * big, shade * (0.55 + head.rand() * 0.7))
    head.normal(hn.x, hn.y, hn.z)
    got++
  }
  headHolder.add(orbPart(head, [0.3, 2.5, 2.6, 1.5]))

  // Cursor bookkeeping for the vortex rings.
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

  // The rings ride their own group: the emblem's resting turn and the cursor tilt, but not its
  // spin, so once they're all on they can tumble round it independently, like a gyroscope.
  const ringGroup = new THREE.Group()
  scene.add(ringGroup)

  // The rings that lock on one by one as it charges: thick solid bands, all the same size (so they
  // cross one another), turning in their own planes. Each lands tipped the same RING_TIP away from facing you, so all
  // read as equally thick, but leaning a different way (`lean`, degrees round the view, 120° apart).
  // radius and width ×R, notches (0 = solid), lean, turn speed; points follow the circumference.
  // Once all are on they flip about a diameter of their own (`flip`: its angle in the ring's
  // plane; `flipSpeed`: radians a second at full tumble), each at its own speed and direction.
  const RING_R = 1.42
  const RING_W = 0.14
  const RING_TIP = THREE.MathUtils.degToRad(40)
  const RING_SPECS = [
    { r: RING_R, w: RING_W, dashes: 0, lean: -75, turn: 1.1, flip: 0.3, flipSpeed: 11 },
    { r: RING_R, w: RING_W, dashes: 0, lean: 45, turn: -0.8, flip: 2.0, flipSpeed: -8.5 },
    { r: RING_R, w: RING_W, dashes: 0, lean: 165, turn: 0.6, flip: 4.1, flipSpeed: 6.5 },
  ] as const
  // The ring group carries the emblem's resting turn; undo it so the tips are as seen from the camera.
  const unrest = new THREE.Quaternion().setFromEuler(EMBLEM_REST).invert()
  const rings = RING_SPECS.map((spec, ri) => {
    const c = new Cloud(130 + ri)
    for (let i = 0, k = n(6000 * (spec.r / 1.42)); i < k; i++) {
      const t = c.rand()
      const cell = spec.dashes ? t * spec.dashes - Math.floor(t * spec.dashes) : 0.5
      if (spec.dashes && cell > 0.84) continue
      const a = t * Math.PI * 2
      const across = c.rand() - 0.5
      const rr = R * (spec.r + across * spec.w)
      // The band's edges and the notches' ends are drawn brighter, so it reads as a solid ring.
      const edge = Math.abs(across) > 0.4 || (spec.dashes > 0 && (cell < 0.03 || cell > 0.81))
      const r = c.rand()
      const col = r < 0.55 ? C.white : r < 0.75 ? C.light : r < 0.92 ? C.gold : C.red
      c.add(Math.cos(a) * rr, Math.sin(a) * rr, (c.rand() - 0.5) * spec.w * 0.35, col, 0.012 + c.rand() * 0.02, edge ? 1.5 : 0.85)
    }
    const pts = c.build()
    const u = { ...symU, uForm: { value: 0 }, uGlow: { value: 0 }, uImplode: { value: 0 } }
    pts.material = new THREE.ShaderMaterial({ vertexShader: SYMBOL_VERT, fragmentShader: DOT_FRAG, uniforms: u, ...additive })
    const holder = new THREE.Group()
    const lean = THREE.MathUtils.degToRad(spec.lean)
    const facing = new THREE.Vector3(Math.sin(RING_TIP) * Math.cos(lean), Math.sin(RING_TIP) * Math.sin(lean), Math.cos(RING_TIP))
    const base = unrest.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), facing))
    holder.quaternion.copy(base)
    holder.add(pts)
    ringGroup.add(holder)
    const axis = new THREE.Vector3(Math.cos(spec.flip), Math.sin(spec.flip), 0)
    return { holder, pts, u, base, axis, flipSpeed: spec.flipSpeed, flipAngle: 0, turn: spec.turn, lockedAt: -1 }
  })

  // Soft halo behind the emblem.
  const haloTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,214,196,0.07)')
    grad.addColorStop(0.35, 'rgba(229,35,47,0.03)')
    grad.addColorStop(1, 'rgba(2,3,8,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  })()
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.setScalar(R * 4.5)
  scene.add(halo)

  // The blast: a white-hot core that bursts out from the centre with the shockwave.
  const blastTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.18, 'rgba(255,240,226,0.9)')
    grad.addColorStop(0.45, 'rgba(255,170,130,0.35)')
    grad.addColorStop(0.75, 'rgba(229,35,47,0.1)')
    grad.addColorStop(1, 'rgba(2,3,8,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  })()
  const blast = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
  scene.add(blast)

  // ---- shockwave ------------------------------------------------------------------
  const shock = new Cloud(14)
  for (let i = 0, k = n(3000); i < k; i++) {
    const a = shock.rand() * Math.PI * 2
    shock.add(Math.cos(a), Math.sin(a), (shock.rand() - 0.5) * 0.2, shock.rand() < 0.4 ? C.light : C.white, 0.02 + shock.rand() * 0.02)
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
    const c = sr() < 0.3 ? C.red : sr() < 0.45 ? C.light : sr() < 0.25 ? C.gold : C.white
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

  const state = { vortex: 0, spin: 0, rings: 0, gyro: 0, charge: 0, implode: 0, blast: 0, shock: 0, warp: 0, streaks: 0, fov: 55 }
  let spinAngle = 0
  let travel = 0
  const ndcV = new THREE.Vector3()
  const lightRest = new THREE.Vector3(-0.5, 0.6, 0.65).normalize()
  const lightAim = new THREE.Vector3()
  // Tilt toward the cursor: up to this many radians each way, eased.
  const TILT = 0.45
  const tilt = new THREE.Vector2()
  const tiltAim = new THREE.Vector2()
  const tiltQ = new THREE.Quaternion()
  const restQ = new THREE.Quaternion()
  const ringRestQ = new THREE.Quaternion().setFromEuler(EMBLEM_REST)
  const flipQ = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const all =[fieldU, symU, ...rings.map((r) => r.u)]

  return {
    scene,
    camera,
    state,
    streaks,
    ringCount: rings.length,
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
      // A fixed camera: the emblem only tilts toward the cursor; the stars orbit.
      camera.position.set(0, 0, 10)
      camera.fov = camera.aspect < 0.8 ? state.fov + 14 : fitFov(state.fov, camera.aspect, 95)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()

      // Emblem: still at rest, spinning up during the vortex.
      // Still at rest; it only spins once the enter sequence spins it up.
      spinAngle += dt * state.spin * state.spin * 14
      // The orb's resting turn (which the head undoes, so he faces you), then the tilt toward
      // the cursor on top, so orb, head and rings all turn together like one coin. With no
      // cursor, once the enter sequence starts, or with reduced motion, it eases back square on.
      if (mouse && state.vortex === 0 && !reduced) tiltAim.set(-mouse.y * TILT, mouse.x * TILT)
      else tiltAim.set(0, 0)
      tilt.lerp(tiltAim, 1 - Math.exp(-dt / 0.35))
      tiltQ.setFromEuler(euler.set(tilt.x, tilt.y, 0))
      restQ.setFromEuler(euler.set(EMBLEM_REST.x, EMBLEM_REST.y + spinAngle, EMBLEM_REST.z))
      emblem.quaternion.multiplyQuaternions(tiltQ, restQ)
      // Charging: it trembles harder and pulses faster as the charge builds.
      const charge = state.charge * (1 - state.implode)
      const shake = charge * charge * 0.06
      emblem.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0)
      const pulse = charge * (0.55 + 0.45 * Math.sin(time * (10 + charge * 26)))
      // Key light: upper left at rest, leaning toward the cursor.
      if (mouse && state.vortex === 0) lightAim.set(mouse.x * 1.3, mouse.y * 1.3, 0.75).normalize()
      else lightAim.copy(lightRest)
      orbU.uLight.value.lerp(lightAim, 1 - Math.exp(-dt / 0.25)).normalize()
      // The rings share the coin's tilt and tremble but not its spin. As the gyro winds up they
      // tumble faster and faster and draw in tight round it, glowing hotter.
      const gyro = state.gyro * (1 - state.implode)
      ringGroup.quaternion.multiplyQuaternions(tiltQ, ringRestQ)
      ringGroup.position.copy(emblem.position)
      ringGroup.scale.setScalar(1 - 0.16 * state.gyro * state.gyro)
      rings.forEach((r, i) => {
        r.flipAngle = state.gyro === 0 ? 0 : r.flipAngle + dt * state.gyro * state.gyro * r.flipSpeed
        r.holder.quaternion.copy(r.base).multiply(flipQ.setFromAxisAngle(r.axis, r.flipAngle))
        r.pts.rotation.z = r.turn * (t * 0.6 + state.spin * 10)
        r.u.uForm.value = THREE.MathUtils.clamp(state.rings - i, 0, 1)
        // The moment it locks on (with the flash), the ring flares, then settles.
        if (r.u.uForm.value >= 0.999 && r.lockedAt < 0) r.lockedAt = time
        if (r.u.uForm.value < 0.999) r.lockedAt = -1
        const flare = r.lockedAt < 0 ? 0 : 2.5 * Math.exp(-(time - r.lockedAt) * 7)
        r.u.uGlow.value = state.spin * 0.6 + pulse * 1.4 + flare + gyro * gyro * 1.6
        r.u.uImplode.value = state.implode
      })
      halo.material.opacity = (1 - state.implode) * (1 + state.spin * 1.5 + pulse * 2)
      // From a point to past the frame's edges, fading as it grows.
      blast.visible = state.blast > 0.001 && state.blast < 0.999
      blast.scale.setScalar(0.2 + Math.pow(state.blast, 0.6) * 34)
      blast.material.opacity = 1.6 * (1 - THREE.MathUtils.smoothstep(state.blast, 0.25, 1))

      ndcV.set(0, 0, 0).project(camera)
      for (const u of all) {
        if (mouse && state.vortex === 0) u.uMouse.value.set(mouse.x, mouse.y)
        else u.uMouse.value.set(9, 9)
      }
      symU.uCenter.value.set(ndcV.x, ndcV.y)
      fieldU.uVortex.value = state.vortex
      orbU.uGlow.value = state.spin * 0.8 + pulse
      orbU.uImplode.value = state.implode
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
