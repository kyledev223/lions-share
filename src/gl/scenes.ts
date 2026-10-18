import * as THREE from 'three'
import symbolSvg from '../brand/symbol.svg?raw'
import { fx } from '../fx-config'
import type { Clickable, Stage } from './engine'
import type { Mascot } from './mascot'
import { THRONE, throneArms } from './throne-pose'
import { PODIUM, podiumHands } from './podium'
import { reachPose } from './reach'
import { stridePose } from './stride'
import { COIN, coinPoint, trophyPose } from './trophy'
import { Cloud, n, seeded, shared, uniformsOf, type CloudLook } from './points'
import type { Ring } from './ring'
import type { AskLink } from '../ask'
import { ambientQuestion } from '../content/lion-answers'
import { createBubbles, createPool, glanceOverlay, POOL, softGlow } from './watering-hole'
import {
  box,
  C,
  disc,
  goldMix,
  line,
  pillar,
  polyline,
  redMix,
  ring,
  roundedRect,
  sparkle,
  stamp,
  svgStamp,
  textStamp,
  volume,
  type Stamp,
} from './shapes'

/**
 * The twelve stages, in page order. Every environment is points: outlines of
 * rooms, floors, props, charts, text and the emblem, mostly white and red
 * with gold for warm accents. The mascot is placed by `mascot` (feet
 * position, turn, clip); the engine moves him in.
 *
 * Units are metres. The mascot is 1.9 tall and faces +Z at rotY 0. Cameras
 * are framed so he sits right of centre, clear of the copy on the left.
 */
export interface SceneDeps {
  ring: Ring
  openMeme(index: number): void
  /** Screen 09's Q&A card and question box (ask.ts). */
  ask: AskLink
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const FLAT = new THREE.Euler(-Math.PI / 2, 0, 0)

function baseScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#020308')
  return scene
}

/** Builds a cloud with `fill`, adds it to `parent`, returns the Points. */
function cloud(parent: THREE.Object3D, seed: number, fill: (c: Cloud) => void, look: CloudLook = {}) {
  const c = new Cloud(seed)
  fill(c)
  const p = c.build(look)
  parent.add(p)
  return p
}

/** Dust hanging in the air. */
function motes(parent: THREE.Object3D, seed: number, min: THREE.Vector3, max: THREE.Vector3, count: number, tint = sparkle) {
  return cloud(parent, seed, (c) => volume(c, min, max, count, { size: [0.008, 0.02], tint, glow: 0.7 }), { drift: 0.12, twinkle: 0.7, scatter: 3 })
}

/** The glowing pool and ring on the floor under the mascot (`withRing` false: the pool alone). */
function floorGlow(parent: THREE.Object3D, at: THREE.Vector3, radius: number, strength = 1, color = C.red, withRing = true) {
  const g = new THREE.Group()
  g.position.copy(at)
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 3.2, radius * 3.2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: color.clone().multiplyScalar(strength) }, uAssemble: shared.uAssemble },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAssemble; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = exp(-r * r * 6.0) * 0.32 + exp(-r * r * 40.0) * 0.16;
          gl_FragColor = vec4(uColor * a * uAssemble, 1.0);
        }`,
    }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.005
  g.add(pool)
  if (withRing) cloud(g, 901, (c) => {
    ring(c, V(0, 0.01, 0), radius, { density: 1900 / (Math.PI * 2 * radius), jitter: 0.012, size: [0.007, 0.016], tint: (r) => (r < 0.6 ? C.white : C.light), glow: 1.15 * strength })
    ring(c, V(0, 0.01, 0), radius * 0.985, { density: 500 / (Math.PI * 2 * radius), jitter: 0.03, size: [0.006, 0.012], tint: color, glow: 1.1 * strength })
  }, { twinkle: 0.4, scatter: 2 })
  parent.add(g)
  return g
}

/** A volumetric cone of light from above (soft, additive). */
function beam(parent: THREE.Object3D, top: THREE.Vector3, bottom: THREE.Vector3, rTop: number, rBottom: number, color: THREE.Color, strength = 1) {
  const h = top.distanceTo(bottom)
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 48, 1, true)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone().multiplyScalar(strength) }, uAssemble: shared.uAssemble, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAssemble; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float fall = mix(0.35, 1.0, vY) * smoothstep(0.0, 0.12, vY);
        float shimmer = 0.9 + 0.1 * sin(uTime * 1.3 + vY * 9.0);
        gl_FragColor = vec4(uColor * core * fall * shimmer * 0.16 * uAssemble, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(top).add(bottom).multiplyScalar(0.5)
  mesh.lookAt(top)
  mesh.rotateX(Math.PI / 2)
  parent.add(mesh)
  // Motes caught in the light.
  cloud(parent, 77, (c) => {
    for (let i = 0, k = n(1400); i < k; i++) {
      const t = c.rand()
      const r = (rTop + (rBottom - rTop) * (1 - t)) * Math.sqrt(c.rand()) * 0.9
      const a = c.rand() * Math.PI * 2
      const p = new THREE.Vector3().lerpVectors(bottom, top, t)
      c.add(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, c.rand() < 0.5 ? C.light : C.white, 0.006 + c.rand() * 0.012, 0.8)
    }
  }, { drift: 0.08, twinkle: 0.8 })
  return mesh
}

/** A soft round glow (additive sprite), e.g. behind a coin. */
function glow(parent: THREE.Object3D, at: THREE.Vector3, size: number, color: string, strength = 0.5) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: strength })
  const sprite = new THREE.Sprite(mat)
  sprite.position.copy(at)
  sprite.scale.setScalar(size)
  sprite.onBeforeRender = () => (mat.opacity = strength * shared.uAssemble.value)
  parent.add(sprite)
  return sprite
}

/** Lines across the floor, receding: `rows` across X, `cols` along Z. */
function floorGrid(c: Cloud, x0: number, x1: number, z0: number, z1: number, rows: number, cols: number, density = 50, glowK = 0.7) {
  for (let i = 0; i <= rows; i++) {
    const z = z0 + ((z1 - z0) * i) / rows
    line(c, V(x0, 0, z), V(x1, 0, z), { density, jitter: 0.008, glow: glowK * (0.6 + 0.4 * (i / rows)), tint: sparkle })
  }
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols
    line(c, V(x, 0, z0), V(x, 0, z1), { density, jitter: 0.008, glow: glowK, tint: sparkle })
  }
}

/** Text stamp placed upright, `width` wide, centred at `at`. */
function words(c: Cloud, st: Stamp, width: number, at: THREE.Vector3, count: number, tint = sparkle, glowK = 1, depth = 0) {
  stamp(c, st, width, { count, depth, edge: 0.6, size: [0.008, 0.018], tint, glow: glowK }, at)
}

/** A coin: rim, face, and the emblem on it. Built flat in XY, facing +Z. */
function coin(c: Cloud, emblem: Stamp, radius: number, count: number, tint = goldMix, glowK = 1.4) {
  const thick = radius * 0.12
  for (const z of [thick / 2, -thick / 2]) ring(c, V(0, 0, z), radius, { density: count / (radius * 12), jitter: radius * 0.01, size: [radius * 0.02, radius * 0.045], tint, glow: glowK * 1.3 }, V(0, 0, 1))
  ring(c, V(0, 0, 0), radius * 0.82, { density: count / (radius * 30), jitter: radius * 0.01, size: [radius * 0.015, radius * 0.03], tint, glow: glowK }, V(0, 0, 1))
  stamp(c, emblem, radius * 1.55, { count: count * 0.45, depth: thick * 0.4, edge: 0.75, size: [radius * 0.015, radius * 0.035], tint, glow: glowK * 1.1 }, V(0, 0, thick / 2))
}

/** Where his fist is: between the wrist and the knuckles. */
const fist = (mascot: Mascot, side: 'Left' | 'Right', out: THREE.Vector3) => {
  const k = new THREE.Vector3()
  mascot.boneWorld(side + 'Hand', out)
  mascot.boneWorld(side + 'HandIndex1', k)
  return out.lerp(k, 0.75)
}

const handScale = new THREE.Vector3()
const handOffset = new THREE.Vector3()

/**
 * Puts `obj` on one of his hand bones: the bone's world position and turn
 * (its scale dropped), then `offset` (metres, along the hand's own axes) and
 * `turn`. Mixamo hand bones point down the fingers along +Y. The prop stays
 * in the scene rather than under the bone, so it keeps its own size and its
 * own point-cloud look.
 */
function onHand(m: Mascot, side: 'Left' | 'Right', obj: THREE.Object3D, offset: THREE.Vector3, turn?: THREE.Quaternion) {
  const bone = m.bone(side + 'Hand')
  if (!bone || m.placeholder) {
    fist(m, side, obj.position)
    return
  }
  bone.updateWorldMatrix(true, false)
  bone.matrixWorld.decompose(obj.position, obj.quaternion, handScale)
  obj.position.add(handOffset.copy(offset).multiplyScalar(m.root.scale.x).applyQuaternion(obj.quaternion))
  if (turn) obj.quaternion.multiply(turn)
}

/**
 * Props ride along with his hands, so they stay in his grip whatever the
 * clip does with the wrist: `place` runs every frame while the stage is up.
 */
function prop(scene: THREE.Scene, obj: THREE.Object3D, place: (mascot: Mascot, obj: THREE.Object3D) => void) {
  let held: Mascot | null = null
  return {
    enter(m: Mascot) {
      held = m
      scene.add(obj)
      place(m, obj)
    },
    leave() {
      obj.removeFromParent()
      held = null
    },
    update() {
      if (held) place(held, obj)
    },
  }
}

/**
 * A treasure chest on the floor at `at`, turned `rotY`, front facing +Z: the body with straps and a lock,
 * the barrel lid hinged open past upright, a heap of gold over the rim, coins spilled and stacked in front
 * of it (toward -X, the throne side) and a warm glow over it all.
 */
function treasureChest(parent: THREE.Object3D, at: THREE.Vector3, rotY: number) {
  const g = new THREE.Group()
  g.position.copy(at)
  g.rotation.y = rotY
  parent.add(g)
  const W = 0.36
  const D = 0.23
  const H = 0.36
  const st = { density: 220, jitter: 0.005, size: [0.006, 0.013] as [number, number], glow: 1.0 }
  const wood = (r: number) => (r < 0.45 ? C.gold : r < 0.75 ? C.white : r < 0.92 ? C.red : C.light)
  /** One coin: a small ring, tilted to `normal`. */
  const coinAt = (c: Cloud, p: THREE.Vector3, normal: THREE.Vector3, r = 0.034) =>
    ring(c, p, r, { density: 260, jitter: 0.002, size: [0.005, 0.01], tint: goldMix, glow: 1.1 }, normal)
  cloud(g, 106, (c) => {
    box(c, V(0, H / 2, 0), V(W * 2, H, D * 2), { ...st, tint: wood })
    volume(c, V(-W, 0.02, D - 0.004), V(W, H - 0.02, D + 0.004), 180, { size: [0.005, 0.01], tint: wood, glow: 0.35 })
    // Straps over the front and up the sides, a band round the foot, the lock plate.
    for (const x of [-0.22, 0.22]) polyline(c, [V(x, 0, D + 0.004), V(x, H, D + 0.004), V(x, H, -D)], false, { ...st, density: 260, glow: 1.4, tint: goldMix })
    for (const y of [0.04, H - 0.035]) polyline(c, [V(-W, y, -D), V(-W, y, D + 0.004), V(W, y, D + 0.004), V(W, y, -D)], false, { ...st, density: 200, tint: goldMix })
    roundedRect(c, V(0, H - 0.07, D + 0.006), 0.09, 0.11, 0.02, { ...st, density: 320, glow: 1.3, tint: goldMix })
    ring(c, V(0, H - 0.08, D + 0.008), 0.012, { ...st, density: 900, tint: C.red }, V(0, 0, 1))
    // The heap: a dome of gold dust over the rim, with coins lying in it.
    const r = c.rand
    for (let i = 0, k = n(1000); i < k; i++) {
      const u = (r() * 2 - 1) * 0.97
      const w = (r() * 2 - 1) * 0.95
      const h = 1 - u * u * 0.8 - w * w * 0.7
      c.add(u * W, H - 0.02 + h * 0.15 + r() * 0.012, w * D, goldMix(r()), 0.005 + r() * 0.01, 0.6 + r() * 0.5)
    }
    for (let i = 0; i < 18; i++) {
      const u = (r() * 2 - 1) * 0.8
      const w = (r() * 2 - 1) * 0.75
      const h = 1 - u * u * 0.8 - w * w * 0.7
      coinAt(c, V(u * W, H - 0.01 + h * 0.15, w * D), V((r() - 0.5) * 1.4, 1, (r() - 0.5) * 1.4))
    }
    // Spilled: coins on the floor and leaning on the front, and two stacks.
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 0.9 + Math.PI * 0.45
      const d = 0.08 + r() * 0.42
      coinAt(c, V(-W * 0.4 + Math.cos(a) * d, 0.006, D + 0.12 + Math.sin(a) * d * 0.45), V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5))
    }
    for (const x of [-0.25, 0.08]) coinAt(c, V(x, 0.045, D + 0.03), V(0, 0.35, 1))
    for (const [x, z, k] of [[-0.52, D + 0.05, 9], [-0.44, D + 0.2, 6]] as const)
      for (let i = 0; i < k; i++) coinAt(c, V(x + (r() - 0.5) * 0.008, 0.008 + i * 0.013, z + (r() - 0.5) * 0.008), V(0, 1, 0))
  }, { scatter: 2, twinkle: 0.55 })
  // The lid: a half barrel hinged at the back of the rim, thrown open past upright.
  const lid = new THREE.Group()
  lid.position.set(0, H, -D)
  lid.rotation.x = -1.9
  g.add(lid)
  cloud(lid, 107, (c) => {
    const arc = (x: number, s: Parameters<typeof polyline>[3]) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI
        pts.push(V(x, Math.sin(a) * D, D + Math.cos(a) * D))
      }
      polyline(c, pts, false, s)
    }
    for (const x of [-W, W]) arc(x, { ...st, tint: wood })
    for (const x of [-0.22, 0.22]) arc(x, { ...st, density: 260, glow: 1.4, tint: goldMix })
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI
      line(c, V(-W, Math.sin(a) * D, D + Math.cos(a) * D), V(W, Math.sin(a) * D, D + Math.cos(a) * D), { ...st, glow: i % 4 ? 0.9 : 1.2, tint: wood })
    }
  }, { scatter: 2, twinkle: 0.4 })
  glow(g, V(0, H + 0.1, 0), 0.9, 'rgba(226,186,96,0.45)', 0.22)
  return g
}

// ---------------------------------------------------------------------------
// 01 THE LION: the throne room
// ---------------------------------------------------------------------------
function throneRoom(): Stage {
  const scene = baseScene()
  // Floor: lines receding, arcs round the dais, a red runner toward the viewer.
  cloud(scene, 101, (c) => {
    floorGrid(c, -9, 9, -12, 3, 6, 10, 24, 0.55)
    for (const r of [2.2, 3.6]) ring(c, V(0, 0, 0), r, { density: 90, jitter: 0.02, glow: 0.8 }, V(0, 1, 0), [Math.PI * 0.95, Math.PI * 2.05])
    roundedRect(c, V(0, 0.01, -0.1), 3.1, 2.5, 0.35, { density: 70, jitter: 0.01, glow: 0.7, tint: (r) => (r < 0.6 ? C.gold : C.white) }, FLAT)
    for (const x of [-0.6, 0.6]) line(c, V(x, 0.01, 1.15), V(x * 1.3, 0.01, 3.4), { density: 150, jitter: 0.008, glow: 1, tint: redMix })
  }, { scatter: 5, twinkle: 0.35 })
  // Columns down both sides, receding, with capitals and plinths.
  cloud(scene, 102, (c) => {
    const trim = (r: number) => (r < 0.5 ? C.gold : C.white)
    for (const z of [-1.8, -4.6, -7.4]) {
      for (const x of [-4.2, 4.2, -6.6, 6.6]) {
        const base = V(x, 0, z)
        pillar(c, base, 0.3, 6.2, { density: 34, jitter: 0.012, glow: 0.9 })
        box(c, base.clone().setY(0.12), V(0.86, 0.24, 0.86), { density: 40, jitter: 0.01, glow: 0.8, tint: trim })
        box(c, base.clone().setY(6.3), V(0.9, 0.2, 0.9), { density: 40, jitter: 0.01, glow: 0.8, tint: trim })
      }
    }
  }, { scatter: 7, twinkle: 0.35, depthFade: [13, 20] })
  // Back wall: tall pointed windows, red banners between them, a cornice.
  cloud(scene, 104, (c) => {
    const Z = -9.5
    for (const [x, w, h] of [[-5.2, 1.6, 4.6], [0, 2.4, 6], [5.2, 1.6, 4.6]] as const) {
      const arch = (t: number) => h + w * 0.75 * Math.sin(t * Math.PI * 0.5) ** 0.7
      const pts = [V(x - w / 2, 0.8, Z)]
      for (let i = 0; i <= 12; i++) pts.push(V(x - w / 2 + (w / 2) * (1 - Math.cos((i / 12) * Math.PI * 0.5)), arch(i / 12), Z))
      for (let i = 12; i >= 0; i--) pts.push(V(x + w / 2 - (w / 2) * (1 - Math.cos((i / 12) * Math.PI * 0.5)), arch(i / 12), Z))
      pts.push(V(x + w / 2, 0.8, Z))
      polyline(c, pts, false, { density: 60, jitter: 0.012, glow: 1 })
      line(c, V(x, 0.8, Z), V(x, h + w * 0.6, Z), { density: 26, jitter: 0.01, glow: 0.55 })
    }
    for (const x of [-2.6, 2.6, -7.6, 7.6]) {
      polyline(c, [V(x - 0.45, 6.4, Z + 0.1), V(x - 0.45, 2.7, Z + 0.1), V(x, 2.2, Z + 0.1), V(x + 0.45, 2.7, Z + 0.1), V(x + 0.45, 6.4, Z + 0.1)], false, { density: 70, jitter: 0.01, glow: 1.15, tint: redMix })
      line(c, V(x, 6.2, Z + 0.1), V(x, 2.6, Z + 0.1), { density: 50, jitter: 0.006, glow: 1, tint: goldMix })
    }
    line(c, V(-11, 7.2, Z), V(11, 7.2, Z), { density: 30, glow: 0.6 })
    line(c, V(-11, 7.5, Z), V(11, 7.5, Z), { density: 24, glow: 0.45, tint: goldMix })
  }, { scatter: 8, twinkle: 0.4, depthFade: [14, 22] })
  // The throne, squared up to him: a stepped plinth, a solid base under a deep cushion, broad armrest blocks,
  // and a tall back between two posts, crested with rays like the mane.
  // Its measurements are THRONE (throne-pose.ts), which also seats him in it.
  const throne = new THREE.Group()
  throne.rotation.y = -0.25
  scene.add(throne)
  cloud(throne, 103, (c) => {
    const T = THRONE
    const st = { density: 240, jitter: 0.006, size: [0.006, 0.014] as [number, number], glow: 1.25 }
    const gold = (r: number) => (r < 0.62 ? C.gold : r < 0.9 ? C.white : C.red)
    // A faint scatter over a face, so the solid parts read as bodies rather than wireframes.
    const face = (min: THREE.Vector3, max: THREE.Vector3, count: number) => volume(c, min, max, count, { size: [0.005, 0.01], tint: gold, glow: 0.35 })
    const B = T.back
    const W = T.backHalf
    const front = T.seatFront + 0.02
    const outer = 0.44
    const baseTop = T.seatTop - 0.1
    // Plinth step on the floor, wider and deeper than the throne.
    box(c, V(0, 0.05, (B - 0.06 + 0.46) / 2), V(0.98, 0.1, 0.46 - B + 0.06), { ...st, glow: 1.0, tint: gold })
    // Base: a solid block from the step to the cushion, a red panel and a medallion on its front.
    box(c, V(0, (0.1 + baseTop) / 2, (B + front) / 2), V(outer * 2 - 0.04, baseTop - 0.1, front - B), { ...st, density: 200, glow: 1.1, tint: gold })
    face(V(-outer + 0.02, 0.1, front - 0.004), V(outer - 0.02, baseTop, front + 0.004), 520)
    roundedRect(c, V(0, (0.1 + baseTop) / 2, front + 0.004), 0.6, 0.17, 0.04, { ...st, density: 200, glow: 1.1, tint: redMix })
    ring(c, V(0, (0.1 + baseTop) / 2, front + 0.008), 0.045, { ...st, density: 450, glow: 1.2, tint: gold }, V(0, 0, 1))
    // Cushion: deep, with a red top.
    box(c, V(0, baseTop + 0.05, (B + front) / 2), V(T.seatHalf * 2 + 0.04, 0.1, front - B), { ...st, glow: 1.3, tint: gold })
    roundedRect(c, V(0, T.seatTop + 0.004, (B + front) / 2), T.seatHalf * 2 - 0.04, front - B - 0.06, 0.05, { ...st, density: 180, glow: 1.05, tint: redMix }, FLAT)
    // Back: posts floor to crest with ball finials, a crest of rays, a shadow line inside it, the red panel, a medallion.
    const finial = (at: THREE.Vector3, r: number) => {
      for (const nrm of [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)]) ring(c, at, r, { ...st, density: 320, glow: 1.05, tint: gold }, nrm)
    }
    for (const s of [-1, 1]) {
      pillar(c, V(s * W, 0.1, B), 0.04, 1.8, { ...st, density: 200, glow: 1.15, tint: gold })
      finial(V(s * W, 1.96, B), 0.055)
    }
    const tips = 9
    const crest = (inset: number, drop: number) => {
      const pts = [V(-W + inset, 1.86 - drop, B)]
      for (let i = 0; i <= tips * 2; i++) {
        const x = (-W + inset) + (2 * (W - inset) * i) / (tips * 2)
        const mid = 1 - Math.abs(i - tips) / tips
        pts.push(V(x, (i % 2 ? 1.88 : 2.02 + mid * 0.38) - drop, B))
      }
      pts.push(V(W - inset, 1.86 - drop, B))
      return pts
    }
    polyline(c, crest(0, 0), false, { ...st, density: 280, glow: 1.5, tint: gold })
    polyline(c, crest(0.07, 0.09), false, { ...st, density: 130, glow: 0.7, tint: gold })
    line(c, V(-W, T.seatTop + 0.02, B), V(W, T.seatTop + 0.02, B), { ...st, density: 200, tint: gold })
    roundedRect(c, V(0, 1.2, B - 0.01), W * 1.3, 1.1, 0.08, { ...st, density: 150, glow: 0.95, tint: redMix })
    ring(c, V(0, 2.03, B + 0.01), 0.08, { ...st, density: 400, glow: 1.2, tint: gold }, V(0, 0, 1))
    // Armrests: a broad rail each (his forearms lie along its inner half), a solid block down to the base,
    // a scroll on the outside and a ball finial at the outer front corner, clear of his hand.
    for (const s of [-1, 1]) {
      const inner = T.armX - T.armW / 2
      const railH = T.armH + 0.03
      const len = T.armFront + 0.02 - B
      box(c, V(s * (inner + outer) / 2, T.armY - railH / 2, B + len / 2), V(outer - inner, railH, len), { ...st, density: 300, tint: gold })
      const panelTop = T.armY - railH
      box(c, V(s * (T.armX + outer) / 2, (baseTop + panelTop) / 2, B + len / 2), V(outer - T.armX, panelTop - baseTop, len - 0.03), { ...st, density: 160, glow: 0.9, tint: gold })
      face(V(s * outer - 0.004, baseTop, B), V(s * outer + 0.004, panelTop, T.armFront), 260)
      const scroll = V(s * (outer + 0.006), panelTop - 0.07, T.armFront - 0.07)
      ring(c, scroll, 0.065, { ...st, density: 400, tint: gold }, V(1, 0, 0))
      ring(c, scroll, 0.03, { ...st, density: 400, glow: 1.1, tint: gold }, V(1, 0, 0))
      finial(V(s * (outer - 0.035), T.armY + 0.04, T.armFront - 0.015), 0.035)
    }
  }, { scatter: 2, twinkle: 0.3 })
  // Beside the throne: his share, a chest of gold with the lid thrown back, coins heaped over the rim and spilled on the floor.
  treasureChest(scene, V(1.2, 0, -0.2), -0.45)
  const seated = throneArms(throne, matchMedia('(prefers-reduced-motion: reduce)').matches)
  floorGlow(scene, V(0, 0, 0), 1.05, 1.15)
  motes(scene, 105, V(-8, 0, -9), V(8, 6, 3), 1400)
  return {
    id: 'hold',
    transition: { claw: 'full', wind: [0, 0.4, 0] }, // his throne's rays: the points rise
    scene,
    // Close in: the crest near the top of the frame, the plinth near the bottom, the chest off his left hand.
    camera: { pos: V(-0.8, 1.75, 4.3), target: V(-0.8, 1.1, 0), fov: 38 },
    // Back into the throne from where the clip sits him.
    mascot: { pos: V(0, 0, -THRONE.sitBack).applyAxisAngle(V(0, 1, 0), -0.25), rotY: -0.25, clip: 'sitting-idle' },
    enter: (m, instant) => m.setOverlay(seated, instant ? 0 : fx.mascot.crossfade),
    leave: (m) => m.setOverlay(null, fx.mascot.crossfade),
  }
}

// ---------------------------------------------------------------------------
// 02 WHY THE NAME: the name in giant 3D points, a glowing coin rising
// ---------------------------------------------------------------------------
function theName(emblem: Stamp): Stage {
  const scene = baseScene()
  const title = new THREE.Group()
  title.position.set(2.7, 1.0, -0.8)
  title.rotation.set(-0.32, -0.42, 0.14)
  scene.add(title)
  cloud(title, 201, (c) => stamp(c, textStamp(['THE LION’S', 'SHARE'], 900, 260), 7, { count: 15500, depth: 0.35, edge: 0.75, size: [0.012, 0.026], tint: sparkle, glow: 1.6 }), { drift: 0.006, twinkle: 0.35, scatter: 6 })
  motes(scene, 202, V(-8, -5, -8), V(8, 5, 3), 1800, redMix)
  const coinGroup = new THREE.Group()
  coinGroup.position.set(2.5, -3.6, 0.2)
  scene.add(coinGroup)
  glow(coinGroup, V(0, 0, -0.3), 4.4, 'rgba(226,186,96,0.55)', 0.55)
  cloud(coinGroup, 203, (c) => coin(c, emblem, 1.2, 4400, (r) => (r < 0.62 ? C.gold : r < 0.86 ? C.white : C.light), 1.25), { drift: 0.004, twinkle: 0.4 })
  return {
    id: 'name',
    transition: { claw: 'light', wind: [0.3, 0.5, 0] }, // stars drifting up into the name
    scene,
    camera: { pos: V(0, 0, 8.4), target: V(0, 0, 0), fov: 42 },
    portrait: { pos: V(1.4, 0, 12), target: V(1.4, 0, 0), fov: 52 },
    // Not in the picture here: he stands below the frame looking up at his name, so the camera
    // rises away from him on the way in and comes back down to him on the way out.
    offstage: { pos: V(-1.2, -7, 3.6), rotY: 0, clip: 'looking-up' },
    update(t) {
      title.rotation.y = -0.42 + Math.sin(t * 0.18) * 0.16
      title.rotation.x = -0.32 + Math.sin(t * 0.13) * 0.05
      coinGroup.rotation.y = t * 0.6
      coinGroup.position.y = -3.6 + Math.sin(t * 0.5) * 0.12
    },
  }
}

// ---------------------------------------------------------------------------
// 03 ON STAGE: spotlight, mic, gold audience, dot-matrix screen
// ---------------------------------------------------------------------------
/**
 * A round riser in points: a bright rim at the top (the ring he stands in sits on it), a red LED band
 * under the lip, faint ribs and bands down the side to the hall floor, and a dark body so the crowd
 * behind it is hidden and it reads as solid.
 */
function riser(parent: THREE.Object3D, radius: number, floorY: number) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.012, radius - 0.012, -floorY, 72), new THREE.MeshBasicMaterial({ color: '#030409' }))
  body.position.y = floorY / 2
  parent.add(body)
  cloud(parent, 306, (c) => {
    const lip = { jitter: 0.004, size: [0.006, 0.014] as [number, number] }
    ring(c, V(0, 0.002, 0), radius, { ...lip, density: 420, glow: 1.4, tint: (r) => (r < 0.55 ? C.white : r < 0.85 ? C.gold : C.light) })
    ring(c, V(0, -0.07, 0), radius, { ...lip, density: 300, glow: 1.25, tint: redMix })
    for (const [y, k] of [[-0.32, 0.6], [-0.62, 0.45], [-1.1, 0.35]] as const) ring(c, V(0, y, 0), radius, { ...lip, density: 90, glow: k, tint: sparkle })
    ring(c, V(0, floorY + 0.01, 0), radius, { ...lip, density: 140, glow: 0.7, tint: goldMix })
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      const x = Math.cos(a) * radius
      const z = Math.sin(a) * radius
      line(c, V(x, -0.09, z), V(x, floorY, z), { density: 45, jitter: 0.004, size: [0.005, 0.011], glow: 0.55, tint: sparkle })
    }
  }, { scatter: 3, twinkle: 0.35 })
}

const AMBER = new THREE.Color('#E0913F')

/**
 * An audience round the riser, standing on the hall floor: heads and shoulders in fine gold and amber
 * dust, lit from the spotlight (brightest near the riser, fading with distance), thinner behind it.
 */
function crowd(parent: THREE.Object3D, seed: number, rMin: number, rMax: number, floorY: number, camera: THREE.Vector3) {
  cloud(parent, seed, (c) => {
    const r = c.rand
    const tint = (k: number) => (k < 0.48 ? C.gold : k < 0.86 ? AMBER : k < 0.95 ? C.white : C.red)
    const dir = new THREE.Vector3()
    for (let rad = rMin; rad < rMax; rad += 0.42 + r() * 0.12) {
      const count = Math.floor((Math.PI * 2 * rad) / (0.46 + r() * 0.1))
      const phase = r() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2 + (r() - 0.5) * 0.08
        const px = Math.cos(a) * (rad + (r() - 0.5) * 0.18)
        const pz = Math.sin(a) * (rad + (r() - 0.5) * 0.18)
        // Behind the riser most of them are hidden: keep a few for depth. None right under the camera.
        if (pz < -0.6 && r() > 0.4) continue
        if (Math.hypot(px - camera.x, pz - camera.z) < 1.8) continue
        const top = floorY + 1.6 + r() * 0.26
        // Light: the spotlight spills onto the nearest rows; the far ones are embers.
        const light = 0.45 + 1.25 * Math.exp(-((rad - rMin) ** 2) / (2 * 1.8 ** 2))
        const few = rad > 5 ? 0.65 : 1
        // Across the shoulders runs round the riser (they face the stage).
        const tx = -Math.sin(a)
        const tz = Math.cos(a)
        const head = { x: px, y: top - 0.12, z: pz }
        for (let k = 0, m = n(95 * few); k < m; k++) {
          dir.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize()
          // On the shell, so each head reads as a shape; lit from above.
          const s = 0.9 + 0.1 * r()
          const lit = light * (0.45 + 0.55 * Math.max(0, dir.y))
          c.add(head.x + dir.x * 0.095 * s, head.y + dir.y * 0.115 * s, head.z + dir.z * 0.1 * s, tint(r()), 0.008 + r() * 0.009, lit)
        }
        for (let k = 0, m = n(180 * few); k < m; k++) {
          dir.set(r() * 2 - 1, r() * 1.2 - 0.2, r() * 2 - 1).normalize()
          const s = 0.9 + 0.1 * r()
          const wide = dir.x * 0.25 * s
          const deep = dir.z * 0.14 * s
          const lit = light * (0.3 + 0.7 * Math.max(0, dir.y)) * 0.85
          c.add(px + tx * wide + Math.cos(a) * deep, top - 0.42 + dir.y * 0.26 * s, pz + tz * wide + Math.sin(a) * deep, tint(r()), 0.008 + r() * 0.01, lit)
        }
      }
    }
  }, { drift: 0.008, twinkle: 0.35, scatter: 3 })
}

function onStage(emblem: Stamp): Stage {
  const scene = baseScene()
  beam(scene, V(0, 7.5, 0.2), V(0, 0, 0.2), 0.25, 1.7, new THREE.Color('#ffd9cc'), 0.9)
  floorGlow(scene, V(0, 0, 0.1), 1.1, 0.9, C.light)
  // He stands on a round riser in the middle of the hall; the hall floor and the crowd are a stage-height below.
  const HALL = -1.9
  riser(scene, 1.3, HALL)
  const hall = new THREE.Group()
  hall.position.y = HALL
  scene.add(hall)
  cloud(hall, 301, (c) => floorGrid(c, -9, 9, -8, 5, 7, 10, 22, 0.35), { scatter: 5, depthFade: [9, 14] })
  crowd(scene, 303, 1.75, 7.2, HALL, V(0.95, 1.05, 5.6))
  // Mic stand beside him, on his left (clear of the hand he gestures with), the mic angled to his mouth.
  cloud(scene, 302, (c) => {
    const st = { density: 300, jitter: 0.003, size: [0.005, 0.01] as [number, number], glow: 1 }
    const base = V(0.58, 0, 0.32)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4
      line(c, base.clone().setY(0.1), V(base.x + Math.cos(a) * 0.26, 0, base.z + Math.sin(a) * 0.26), { ...st, density: 260 })
    }
    const top = base.clone().setY(1.36)
    const mic = V(0.4, 1.5, 0.3)
    line(c, base.clone().setY(0.1), top, st)
    ring(c, top, 0.016, { ...st, density: 900, glow: 1.2 })
    line(c, top, mic, { ...st, glow: 1.1 })
    volume(c, mic.clone().add(V(-0.03, -0.02, -0.025)), mic.clone().add(V(0.02, 0.06, 0.025)), 180, { size: [0.005, 0.01], tint: C.white, glow: 1.4 })
  }, { scatter: 2, twinkle: 0.2 })
  // Dot-matrix screen behind him, showing the emblem.
  const screen = new THREE.Group()
  screen.position.set(4.2, 3.2, -5.5)
  scene.add(screen)
  const SW = 7.2
  const SH = 4.05
  cloud(screen, 304, (c) => {
    const cols = 96
    const rows = 54
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = i / (cols - 1) - 0.5
        const v = j / (rows - 1) - 0.5
        const inside = emblem.sample(u * (SW / SH) * 0.9, v * 0.9)
        const lit = inside ? 1 : 0.12 + 0.1 * Math.sin(i * 0.3 + j * 0.17)
        if (!inside && c.rand() < 0.35) continue
        c.add(u * SW, v * SH, 0, inside ? (c.rand() < 0.3 ? C.light : C.white) : C.red, 0.03, lit * 1.3)
      }
    }
    roundedRect(c, V(0, 0, 0), SW + 0.3, SH + 0.3, 0.12, { density: 70, jitter: 0.01, glow: 0.8 })
  }, { twinkle: 0.25, scatter: 6 })
  motes(scene, 305, V(-6, HALL, -5), V(6, 6, 2), 1200)
  return {
    id: 'how',
    transition: { claw: 'full', wind: [0, 0.6, 0.2], swing: 12 }, // a roar from the hall
    scene,
    // At the crowd's eye level, so the front rows overlap his feet.
    camera: { pos: V(0.95, 1.05, 5.6), target: V(0.95, 1.25, 0), fov: 40 },
    // Phones: a little above the crowd, so the riser reads as a drum; he stays in the top half.
    portrait: { pos: V(0.1, 1.9, 8.8), target: V(0.1, -0.75, 0), fov: 50 },
    mascot: { pos: V(0, 0, 0), rotY: 0.08, clip: 'presenting' },
  }
}

/** Speed of the walk clip's planted foot at 1× (m/s), measured from walking.fbx. */
const WALK_STRIDE = 0.99

// ---------------------------------------------------------------------------
// 04 THE HUNT: a savanna horizon drawn in candlesticks; he walks the scrolling floor
// ---------------------------------------------------------------------------
function theHunt(): Stage {
  const scene = baseScene()
  // The floor moves at his stride: the walk clip's planted foot travels WALK_STRIDE m/s at 1×.
  const WALK = WALK_STRIDE * fx.mascot.speed.walking
  // Floor lines scroll under his feet.
  cloud(scene, 401, (c) => {
    for (let z = -7; z <= 2.6; z += 0.9) line(c, V(-12, 0, z), V(12, 0, z), { density: 16, jitter: 0.01, glow: 0.45 + (z + 7) * 0.05 })
    for (let x = -12; x < 12; x += 1.6) line(c, V(x, 0, -7), V(x + 1.2, 0, 2.6), { density: 45, jitter: 0.012, glow: 1 })
  }, { flow: V(WALK, 0, 0), wrap: V(24, 0, 0), wrapMin: V(-12, 0, 0), scatter: 4, twinkle: 0.3 })
  // A low sun on the far horizon, holding still (it is very far away): striped bands, no outline.
  cloud(scene, 404, (c) => {
    const at = V(2.2, 0.7, -10)
    const R = 3
    for (let i = 1; i < 9; i++) {
      const y = (i / 9) * R
      const half = Math.sqrt(R * R - y * y)
      line(c, V(at.x - half, at.y + y, at.z), V(at.x + half, at.y + y, at.z), { density: 36, jitter: 0.01, glow: 1, tint: i < 5 ? redMix : goldMix })
    }
  }, { twinkle: 0.4, scatter: 9 })
  // The horizon: rolling hills as a line, candlesticks standing on it like tall grass, an acacia among them.
  // It drifts slower than the floor (it is further away) and wraps.
  cloud(scene, 402, (c) => {
    const r = c.rand
    const Z = -6
    const hill = (x: number) => 0.75 + Math.sin(x * 0.42) * 0.32 + Math.sin(x * 1.1 + 1.3) * 0.1
    const horizon: THREE.Vector3[] = []
    for (let x = -15; x <= 15; x += 0.2) horizon.push(V(x, hill(x), Z - 0.2))
    polyline(c, horizon, false, { density: 110, jitter: 0.01, glow: 1.2, tint: (k) => (k < 0.55 ? C.gold : k < 0.85 ? C.white : C.red) })
    let trend = 0
    for (let i = 0; i < 40; i++) {
      const x = -15 + i * 0.75 + r() * 0.15
      trend = Math.max(-0.2, Math.min(1.4, trend + (r() - 0.42) * 0.5))
      const up = r() < 0.6
      const lo = hill(x) + 0.08 + r() * 0.2 + trend * 0.3
      const hi = lo + 0.18 + r() * 0.55 + trend * 0.35
      const col = up ? (r() < 0.55 ? C.gold : C.white) : C.red
      box(c, V(x, (lo + hi) / 2, Z), V(0.3, hi - lo, 0.22), { density: 50, jitter: 0.01, glow: 1.1, tint: col })
      line(c, V(x, hi, Z), V(x, hi + 0.15 + r() * 0.35, Z), { density: 90, glow: 1, tint: col })
      line(c, V(x, lo, Z), V(x, hill(x), Z), { density: 90, glow: 0.8, tint: col })
      volume(c, V(x - 0.13, lo, Z - 0.1), V(x + 0.13, hi, Z + 0.1), 50, { size: [0.008, 0.014], tint: col, glow: 0.8 })
    }
    // An acacia: a trunk that forks, and a wide flat canopy in a few loose layers.
    const tx = 6.5
    const ty = hill(tx)
    const tz = Z - 0.6
    const fork = V(tx + 0.1, ty + 1.2, tz)
    const trunk = { density: 160, jitter: 0.01, glow: 1.1 }
    line(c, V(tx, ty, tz), fork, trunk)
    line(c, fork, V(tx + 0.5, ty + 2.05, tz), trunk)
    line(c, fork, V(tx - 0.7, ty + 2.0, tz), trunk)
    line(c, V(tx + 0.5, ty + 2.05, tz), V(tx + 1.1, ty + 2.1, tz), trunk)
    for (let k = 0; k < 3; k++) {
      const cy = ty + 2.1 + k * 0.12
      const w = 1.9 - k * 0.45
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2
        pts.push(V(tx + 0.2 + Math.cos(a) * w, cy + Math.sin(a) * 0.1 * (1 + k * 0.3), tz + Math.sin(a) * 0.25))
      }
      polyline(c, pts, true, { density: 70, jitter: 0.02, glow: 0.95, tint: k === 0 ? goldMix : sparkle })
    }
  }, { flow: V(WALK * 0.18, 0, 0), wrap: V(30, 0, 0), wrapMin: V(-15, 0, 0), scatter: 7, twinkle: 0.3 })
  floorGlow(scene, V(0, 0, 0), 0.8, 1.1)
  motes(scene, 403, V(-8, 0, -8), V(8, 5, 3), 1600, goldMix)
  return {
    id: 'snapshots',
    transition: { claw: 'light', wind: [0.6, 0, 0], swing: -10 }, // streaming out behind his stride
    scene,
    camera: { pos: V(-0.9, 1.2, 4.6), target: V(-0.9, 1.05, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -Math.PI / 2, clip: 'walking' },
  }
}

// ---------------------------------------------------------------------------
// 05 THE PRIDE: drifting strips of text; a low rail in front of him
// ---------------------------------------------------------------------------
function driftingText(scene: THREE.Scene, seed: number, phrases: string[][], rows: number, tints: ((r: number) => THREE.Color)[]) {
  const stamps = phrases.map((p) => textStamp(p, 900, 160))
  const r = seeded(seed)
  for (let row = 0; row < rows; row++) {
    const z = -2.5 - r() * 8
    const y = -0.4 + r() * 5.6
    const speed = (0.15 + r() * 0.35) * (r() < 0.5 ? 1 : -1)
    cloud(scene, seed + row, (c) => {
      for (let x = -14; x < 14; x += 0) {
        const st = stamps[Math.floor(r() * stamps.length)]
        const w = 1.1 + r() * 1.6
        words(c, st, w, V(x + w / 2, y + (r() - 0.5) * 0.3, z), 300 * w, tints[Math.floor(r() * tints.length)], 1.1)
        x += w + 1.2 + r() * 3
      }
    }, { flow: V(speed, 0, 0), wrap: V(28, 0, 0), wrapMin: V(-14, 0, 0), scatter: 6, twinkle: 0.4, depthFade: [9, 15] })
  }
}

function thePride(emblem: Stamp): Stage {
  const scene = baseScene()
  driftingText(scene, 501, [['$ROAR'], ['THE PRIDE']], 6, [goldMix, sparkle, redMix])
  cloud(scene, 520, (c) => floorGrid(c, -9, 9, -10, 3, 9, 14, 13, 0.5), { scatter: 4, depthFade: [9, 14] })
  // A podium in front of him, his hands resting on it: a slanted top whose far edge is a bright bar,
  // a body tapering to a narrower foot, the emblem on its face. Its measurements are PODIUM (podium.ts).
  const podium = new THREE.Group()
  podium.rotation.y = -0.12
  scene.add(podium)
  cloud(podium, 521, (c) => {
    const P = PODIUM
    const st = { density: 320, jitter: 0.004, size: [0.006, 0.013] as [number, number], glow: 1.05 }
    const bright = (r: number) => (r < 0.62 ? C.white : r < 0.86 ? C.gold : C.light)
    // The top: the far edge glows like a bar, the near edge and sides quieter, a little dust on the surface.
    line(c, V(-P.halfW - 0.03, P.farY, P.far), V(P.halfW + 0.03, P.farY, P.far), { ...st, density: 650, glow: 1.3, tint: bright })
    volume(c, V(-P.halfW, P.farY - 0.012, P.far - 0.02), V(P.halfW, P.farY + 0.012, P.far + 0.012), 160, { size: [0.005, 0.01], tint: bright, glow: 0.95 })
    line(c, V(-P.halfW, P.nearY, P.near), V(P.halfW, P.nearY, P.near), { ...st, density: 300, glow: 0.85, tint: bright })
    for (const x of [-P.halfW, P.halfW]) line(c, V(x, P.nearY, P.near), V(x, P.farY, P.far), { ...st, density: 360 })
    for (let i = 0, k = n(700); i < k; i++) {
      const z = P.near + c.rand() * (P.far - P.near)
      c.add((c.rand() * 2 - 1) * P.halfW, P.topY(z) + 0.002, z, c.rand() < 0.7 ? C.white : C.gold, 0.004 + c.rand() * 0.005, 0.35)
    }
    // The body, under the top and tapering to its foot.
    const bodyY = P.topY(P.far) - 0.05
    for (const sx of [-1, 1]) {
      line(c, V(sx * P.bodyHalfW, bodyY, P.far - 0.02), V(sx * P.footHalfW, 0.02, P.far - 0.04), { ...st, density: 380, glow: 1.25, tint: bright })
      line(c, V(sx * P.bodyHalfW, P.topY(P.bodyNear) - 0.04, P.bodyNear), V(sx * P.footHalfW, 0.02, P.footNear), { ...st, density: 180, glow: 0.7 })
    }
    roundedRect(c, V(0, 0.015, (P.footNear + P.far - 0.04) / 2), P.footHalfW * 2 + 0.08, P.far - 0.04 - P.footNear + 0.08, 0.03, { ...st, density: 260, glow: 0.9 }, FLAT)
    // Bands across the face, faint dust on it, and the emblem.
    for (const y of [bodyY - 0.06, 0.12]) {
      const w = P.footHalfW + ((P.bodyHalfW - P.footHalfW) * y) / bodyY
      line(c, V(-w, y, P.far - 0.02 - 0.02 * (1 - y / bodyY)), V(w, y, P.far - 0.02 - 0.02 * (1 - y / bodyY)), { ...st, density: 220, glow: 0.85, tint: redMix })
    }
    for (let i = 0, k = n(900); i < k; i++) {
      const y = c.rand() * bodyY
      const w = P.footHalfW + ((P.bodyHalfW - P.footHalfW) * y) / bodyY
      c.add((c.rand() * 2 - 1) * w, y, P.far - 0.02 - 0.02 * (1 - y / bodyY), c.rand() < 0.6 ? C.red : C.white, 0.004 + c.rand() * 0.006, 0.35)
    }
    stamp(c, emblem, 0.3, { count: 1500, depth: 0.01, edge: 0.8, size: [0.004, 0.008], tint: redMix, glow: 0.9 }, V(0, 0.72, P.far - 0.015))
  }, { twinkle: 0.45, scatter: 2 })
  const resting = podiumHands(podium, matchMedia('(prefers-reduced-motion: reduce)').matches)
  floorGlow(scene, V(0, 0, 0), 0.95, 1)
  motes(scene, 522, V(-7, 0, -6), V(7, 5, 3), 1200)
  return {
    id: 'rules',
    transition: { claw: 'full', wind: [0, 0.2, 0], swing: 10 },
    scene,
    // Close, from the thighs up, like a press shot.
    camera: { pos: V(-0.5, 1.42, 2.95), target: V(-0.5, 1.22, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -0.12, clip: 'idle' },
    enter: (m, instant) => m.setOverlay(resting, instant ? 0 : fx.mascot.crossfade),
    leave: (m) => m.setOverlay(null, fx.mascot.crossfade),
  }
}

// ---------------------------------------------------------------------------
// 06 FOR YOU: a tunnel of rings; close on him reaching out
// ---------------------------------------------------------------------------
function forYou(emblem: Stamp): Stage {
  const scene = baseScene()
  // Where he is seen from: the camera, framed from mid-thigh up with him right of centre; he faces it.
  const CAM = V(-0.4, 1.5, 2.03)
  const PORTRAIT = V(-0.1, 1.55, 3.3)
  // A tunnel of rings round his head, flowing toward the viewer.
  cloud(scene, 601, (c) => {
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 3
      ring(c, V(-0.15, 1.6, z), 3.1 + (i % 2) * 0.25, { density: 70, jitter: 0.04, size: [0.01, 0.03], glow: 1.4 }, V(0, 0, 1))
    }
  }, { flow: V(0, 0, 1.2), wrap: V(0, 0, 27), wrapMin: V(0, 0, -24), scatter: 5, twinkle: 0.4, depthFade: [14, 24] })
  // The viewer, for him to reach toward and look at.
  const viewer = new THREE.Object3D()
  viewer.position.copy(CAM)
  scene.add(viewer)
  let him: Mascot | null = null
  const floorRings = cloud(scene, 603, (c) => {
    for (const r of [1.4, 2.6, 4, 5.6]) ring(c, V(0, 0, 0), r, { density: 70, jitter: 0.02, glow: 0.6 })
  }, { scatter: 4 })
  // Always drawn, so it can follow the framing: the viewer sits where the landscape or portrait camera is.
  floorRings.frustumCulled = false
  floorRings.onBeforeRender = (_r, _s, camera) => {
    viewer.position.copy((camera as THREE.PerspectiveCamera).aspect < 0.85 ? PORTRAIT : CAM)
  }
  motes(scene, 604, V(-5, 0, -8), V(5, 4, 3), 1200, redMix)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const reaching = reachPose(viewer, reduced)

  // What he offers: the emblem in points, floating just over his open palm, turning slowly, with a
  // red-gold glow and a small warm light that catches his palm and muzzle. It has its own assemble
  // value: it gathers as the arm finishes rising and scatters with the scene on the way out.
  const gift = new THREE.Group()
  const giftSpin = new THREE.Group()
  gift.add(giftSpin)
  const giftPoints = cloud(giftSpin, 605, (c) => {
    stamp(c, emblem, 0.16, { count: 2100, depth: 0.003, edge: 0.9, size: [0.0019, 0.003], tint: (r) => (r < 0.55 ? C.gold : r < 0.85 ? C.red : C.white), glow: 0.95 })
  }, { twinkle: 0.15, scatter: 0.25, drift: 0.0004 })
  giftPoints.frustumCulled = false
  const giftAssemble = { value: 0 }
  uniformsOf(giftPoints).uOwn = giftAssemble
  const giftGlow = glow(gift, V(0, 0, -0.01), 0.2, 'rgba(240,120,70,0.7)', 0.3)
  giftGlow.onBeforeRender = () => {} // its opacity follows the gift's own assemble (placeGift)
  giftGlow.material.opacity = 0
  // In the scene from the start (hidden until he arrives), so the warm-up compiles his shader with its light.
  scene.add(gift)
  const giftLight = new THREE.PointLight('#ff9a5a', 0, 0.75, 2)
  gift.add(giftLight)
  let giftT = -1
  const giftAt = new THREE.Vector3()
  const along = new THREE.Vector3()
  const placeGift = (m: Mascot, time: number, dt: number) => {
    // Gather from 0.45s to 1.2s after arrival (the arm settles at 0.8s); scatter with the scene.
    if (giftT >= 0) giftT += dt
    const own = giftT < 0 ? 1 : THREE.MathUtils.smootherstep(giftT, 0.45, 1.2)
    const k = own * THREE.MathUtils.smoothstep(shared.uAssemble.value, 0.35, 1)
    giftAssemble.value = k
    giftGlow.material.opacity = 0.3 * k * shared.uAssemble.value
    giftLight.intensity = 0.16 * k
    // Over the middle of the paw: from the wrist, along the fingers, then up.
    m.boneWorld('RightHand', giftAt)
    m.boneWorld('RightHandIndex1', along).sub(giftAt)
    giftAt.addScaledVector(along, 1.05).y += 0.14 + (reduced ? 0 : Math.sin(time * 1.1) * 0.0025)
    gift.position.copy(giftAt)
    // Faces the viewer and turns slowly to and fro, so it never shows its edge.
    gift.lookAt(viewer.position.x, giftAt.y, viewer.position.z)
    giftSpin.rotation.y = reduced ? 0 : Math.sin(time * 0.55) * 0.6
  }
  return {
    id: 'holders',
    transition: { claw: 'light', wind: [0, 0, 0.6] }, // toward you
    scene,
    camera: { pos: CAM, target: V(CAM.x, 1.42, 0), fov: 40 },
    portrait: { pos: PORTRAIT, target: V(PORTRAIT.x, 1.2, 0), fov: 50 },
    // Facing the camera; the reach and the gaze are a layer over the idle clip (reach.ts).
    mascot: { pos: V(0, 0, 0), rotY: Math.atan2(CAM.x, CAM.z), clip: 'idle' },
    update(t, dt) {
      if (him) placeGift(him, t, dt)
    },
    enter(m, instant) {
      him = m
      giftT = instant ? -1 : 0
      // The arm rises into the reach over 0.8s (the scan-in finishes on the held pose).
      m.setOverlay(reaching, instant ? 0 : 0.8)
    },
    leave(m) {
      him = null
      giftAssemble.value = 0
      giftGlow.material.opacity = 0
      giftLight.intensity = 0
      m.setOverlay(null, fx.mascot.crossfade)
    },
  }
}

// ---------------------------------------------------------------------------
// 07 THE SUMMIT: a beam from above, the emblem, ridges behind, him small beneath it
// ---------------------------------------------------------------------------
function theSummit(emblem: Stamp): Stage {
  const scene = baseScene()
  beam(scene, V(0, 11, -0.6), V(0, 0, 0), 0.35, 1.3, C.red, 1.3)
  const sym = new THREE.Group()
  sym.position.set(0.1, 3.0, -3.0)
  sym.rotation.set(-0.5, -0.3, 0.38)
  scene.add(sym)
  cloud(sym, 701, (c) => stamp(c, emblem, 5.8, { count: 14000, depth: 0.35, edge: 0.72, size: [0.012, 0.026], tint: (r) => (r < 0.45 ? C.red : r < 0.72 ? C.light : r < 0.9 ? C.white : C.gold), glow: 1.9 }), { drift: 0.006, twinkle: 0.45, scatter: 7 })
  floorGlow(scene, V(0, 0, 0), 0.75, 1.1)
  // The top of the rock: a jagged edge round his feet, and two ridgelines behind, far below.
  cloud(scene, 702, (c) => {
    const r = c.rand
    const edge: THREE.Vector3[] = []
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const rr = 1.6 + r() * 0.5
      edge.push(V(Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.8))
    }
    polyline(c, edge, true, { density: 80, jitter: 0.015, glow: 0.9, tint: (k) => (k < 0.6 ? C.gold : C.white) })
    for (const [z, y0, amp, tint] of [[-7, -0.4, 1.6, sparkle], [-11, -0.9, 2.4, redMix]] as const) {
      const ridge: THREE.Vector3[] = []
      for (let x = -14; x <= 14; x += 0.9 + r() * 0.6) ridge.push(V(x, y0 + r() * amp * (1 - Math.abs(x) / 20), z))
      polyline(c, ridge, false, { density: 50, jitter: 0.015, glow: 0.7, tint })
    }
  }, { scatter: 5, twinkle: 0.35, depthFade: [12, 18] })
  cloud(scene, 703, (c) => floorGrid(c, -7, 7, -9, 2, 7, 10, 18, 0.3), { scatter: 4, depthFade: [9, 13] })
  motes(scene, 704, V(-7, 0, -8), V(7, 8, 3), 1500, redMix)
  return {
    id: 'proof',
    transition: { claw: 'full', wind: [0, 0.6, 0], swing: 18, wash: '#5a0a12' }, // up the red beam
    scene,
    camera: { pos: V(0.15, 2.1, 7.6), target: V(0.15, 2.4, 0), fov: 44 },
    mascot: { pos: V(0, 0, 0), rotY: Math.PI, clip: 'looking-up', scale: 0.85 },
    update(t) {
      sym.rotation.y = -0.35 + Math.sin(t * 0.2) * 0.12
    },
  }
}

// ---------------------------------------------------------------------------
// 08 CHEERS: gold and red fireworks; close on him raising a glass
// ---------------------------------------------------------------------------
const FIREWORK_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uAssemble;
attribute vec3 aDir;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
attribute float aPhase;
attribute float aPeriod;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float age = fract(uTime / aPeriod + aPhase);
  float spread = 1.0 - exp(-age * 6.0);
  vec3 p = position + aDir * spread * (0.85 + aSeed * 0.3) - vec3(0.0, 0.9 * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uProj / max(-mv.z, 0.1);
  gl_PointSize = max(px, 1.3);
  float flash = exp(-age * 40.0) * 1.2;
  vColor = aColor * (1.0 + flash);
  vAlpha = pow(1.0 - age, 2.2) * smoothstep(0.02, 0.06, age) * uAssemble * min(1.0, px / 1.3) * (0.6 + 0.4 * sin(uTime * 20.0 + aSeed * 40.0));
}`
const DOT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor * ((1.0 - r2) * (1.0 - r2) * 0.8 + exp(-r2 * 9.0) * 0.5) * vAlpha, 1.0);
}`

function fireworks(scene: THREE.Scene, seed: number, bursts: number, each: number) {
  const r = seeded(seed)
  const pos: number[] = []
  const dir: number[] = []
  const col: number[] = []
  const size: number[] = []
  const sd: number[] = []
  const phase: number[] = []
  const period: number[] = []
  const palettes = [[C.gold, C.white], [C.red, C.light], [C.gold, C.gold], [C.red, C.gold], [C.gold, C.red]]
  for (let b = 0; b < bursts; b++) {
    const center = V(-6 + r() * 12, 2.2 + r() * 3.6, -6 - r() * 6)
    const pal = palettes[b % palettes.length]
    const radius = 1.6 + r() * 1.4
    const ph = r()
    const per = 2.6 + r() * 1.8
    for (let i = 0, k = n(each); i < k; i++) {
      const u = r() * 2 - 1
      const a = r() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      pos.push(center.x, center.y, center.z)
      dir.push(Math.cos(a) * s * radius, u * radius, Math.sin(a) * s * radius)
      const c = pal[r() < 0.7 ? 0 : 1]
      col.push(c.r * 1.2, c.g * 1.2, c.b * 1.2)
      size.push(0.014 + r() * 0.018)
      sd.push(r())
      phase.push(ph)
      period.push(per)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3))
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1))
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
  g.setAttribute('aPeriod', new THREE.Float32BufferAttribute(period, 1))
  const pts = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      vertexShader: FIREWORK_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: { uTime: shared.uTime, uProj: shared.uProj, uAssemble: shared.uAssemble },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }),
  )
  pts.frustumCulled = false
  scene.add(pts)
}

/** A champagne coupe in points, with gold fizz rising in the bowl. Origin at the foot. */
function coupe(seed: number) {
  const g = new THREE.Group()
  cloud(g, seed, (c) => {
    ring(c, V(0, 0, 0), 0.045, { density: 1300, jitter: 0.0015, size: [0.0025, 0.0045], tint: C.white, glow: 1.1 })
    line(c, V(0, 0, 0), V(0, 0.085, 0), { density: 1400, jitter: 0.001, size: [0.0025, 0.0045], tint: C.white, glow: 1.1 })
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      const rad = 0.012 + Math.sin(t * Math.PI * 0.5) * 0.068
      ring(c, V(0, 0.085 + t * 0.055, 0), rad, { density: 900 * (i === 8 ? 2 : 0.6), jitter: 0.001, size: [0.0025, 0.0045], tint: i === 8 ? C.white : C.light, glow: i === 8 ? 1.3 : 0.8 })
    }
  }, { scatter: 1, twinkle: 0.3 })
  cloud(g, seed + 1, (c) => {
    for (let i = 0, k = n(500); i < k; i++) {
      const a = c.rand() * Math.PI * 2
      const r = Math.sqrt(c.rand()) * 0.06
      c.add(Math.cos(a) * r, 0.1 + c.rand() * 0.04, Math.sin(a) * r, goldMix(c.rand()), 0.0025 + c.rand() * 0.003, 1.4)
    }
  }, { flow: V(0, 0.05, 0), wrap: V(0, 0.04, 0), wrapMin: V(0, 0.1, 0), twinkle: 0.9, scatter: 1, drift: 0.002 })
  return g
}

function cheers(): Stage {
  const scene = baseScene()
  fireworks(scene, 801, 10, 700)
  motes(scene, 802, V(-6, -1, -8), V(6, 5, 1), 1600, goldMix)
  const glass = coupe(803)
  glass.scale.setScalar(1.05)
  // The stem runs across his left fist with the bowl on the thumb side (the hand's −X), foot below the
  // little finger. He holds it at his chest (the sip is cut from the clip, see CUTS in mascot.ts).
  const GLASS_AT = V(0.055, 0.05, 0.035)
  const GLASS_TURN = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(-1, 0, 0))
  const held = prop(scene, glass, (m, g) => onHand(m, 'Left', g, GLASS_AT, GLASS_TURN))
  return {
    id: 'drops',
    transition: { claw: 'light', wind: [0, 0.35, 0.1], swing: -6, wash: '#4a3410' }, // rising like the fizz
    scene,
    camera: { pos: V(-0.55, 1.62, 1.75), target: V(-0.55, 1.48, 0), fov: 42 },
    portrait: { pos: V(0, 1.55, 2.6), target: V(0, 1.45, 0), fov: 50 },
    mascot: { pos: V(0, 0, 0), rotY: -0.3, clip: 'toast' },
    enter: held.enter,
    leave: held.leave,
    update: held.update,
  }
}

// ---------------------------------------------------------------------------
// 09 ASK THE LION: the Watering Hole. Him on a rock ledge, typing on a red-lit
// phone; questions rise from the pool below as bubbles, and some reach him.
// ---------------------------------------------------------------------------
function phone(seed: number) {
  const g = new THREE.Group()
  cloud(g, seed, (c) => {
    roundedRect(c, V(0, 0, 0), 0.08, 0.155, 0.012, { density: 2400, jitter: 0.0012, size: [0.003, 0.005], tint: (r) => (r < 0.7 ? C.light : C.white), glow: 1.5 })
    volume(c, V(-0.035, -0.07, 0.002), V(0.035, 0.07, 0.004), 1400, { size: [0.002, 0.004], tint: (r) => (r < 0.7 ? C.red : C.light), glow: 2.8 })
  }, { twinkle: 0.4, scatter: 1 })
  return g
}

/**
 * The rock he stands on: a rugged outcrop rising from the water, its flat top
 * at y 0. Rings of jagged outline at the rim, a lip just under it, the middle
 * and the waterline, joined by creases, with dust on the faces, a few strata
 * and boulders at its foot; a dark body inside hides what's behind it.
 */
function ledge(scene: THREE.Scene, foot: number) {
  const r = seeded(941)
  const N = 16
  // It leans out over the water: the top sits forward of the foot, with a lip jutting under the rim.
  const at = V(0.02, 0, -0.08)
  const around = (y: number, back: number, radius: number, rough: number, dy = 0) =>
    Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.2
      const k = radius * (1 + (r() - 0.5) * rough)
      return V(at.x + Math.cos(a) * k * 1.15, y + (r() - 0.5) * dy, at.z - back + Math.sin(a) * k * 0.85)
    })
  const rings = [around(0, 0, 0.6, 0.16), around(-0.1, 0, 0.68, 0.3, 0.07), around(foot * 0.55, 0.16, 0.6, 0.42, 0.12), around(foot, 0.3, 0.76, 0.34)]
  /** An outline broken into jagged bits: each edge split in three, the new corners pushed in or out. */
  const jag = (pts: THREE.Vector3[], amount: number) =>
    pts.flatMap((p, i) => {
      const q = pts[(i + 1) % pts.length]
      return [1, 2].reduce(
        (out, k) => {
          const m = new THREE.Vector3().lerpVectors(p, q, k / 3)
          const out2 = m.clone().sub(at).setY(0).normalize().multiplyScalar((r() - 0.4) * amount)
          out.push(m.add(out2))
          return out
        },
        [p],
      )
    })

  // The dark body: the rings lofted, capped on top.
  const verts: number[] = []
  const index: number[] = []
  for (const ringPts of rings) for (const p of ringPts) verts.push(p.x, p.y - 0.004, p.z)
  verts.push(at.x, -0.004, at.z)
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const a = k * N + i
      const b = k * N + ((i + 1) % N)
      index.push(a, a + N, b, b, a + N, b + N)
    }
  }
  for (let i = 0; i < N; i++) index.push(rings.length * N, i, (i + 1) % N)
  const bodyGeo = new THREE.BufferGeometry()
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  bodyGeo.setIndex(index)
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: '#030409', side: THREE.DoubleSide }))
  scene.add(body)

  const rim = (k: number) => (k < 0.5 ? C.gold : k < 0.9 ? C.white : C.light)
  cloud(scene, 942, (c) => {
    const st = { jitter: 0.008, size: [0.006, 0.014] as [number, number] }
    polyline(c, jag(rings[0], 0.05), true, { ...st, density: 300, glow: 1.35, tint: rim })
    polyline(c, jag(rings[1], 0.09), true, { ...st, density: 130, glow: 0.85, tint: (k) => (k < 0.6 ? C.white : C.gold) })
    polyline(c, jag(rings[2], 0.12), true, { ...st, density: 70, glow: 0.6, tint: sparkle })
    polyline(c, jag(rings[3], 0.1), true, { ...st, density: 140, glow: 0.8, tint: (k) => (k < 0.5 ? C.white : k < 0.8 ? C.light : C.gold) })
    // Creases down the faces, some running the full height, some breaking off.
    for (let i = 0; i < N; i++) {
      const stop = r() < 0.35 ? 2 : 3
      const path = rings.slice(0, stop + 1).flatMap((ringPts, k) => {
        const p = ringPts[i].clone().add(V((r() - 0.5) * 0.08 * k, 0, (r() - 0.5) * 0.06 * k))
        // A kink halfway down each stretch, so the creases zig-zag like cracked rock.
        if (!k) return [p]
        const above = rings[k - 1][i]
        return [new THREE.Vector3().lerpVectors(above, p, 0.5).add(V((r() - 0.5) * 0.1, (r() - 0.5) * 0.05, (r() - 0.5) * 0.08)), p]
      })
      polyline(c, path, false, { ...st, density: 110, glow: 0.7, tint: (k) => (k < 0.55 ? C.white : C.gold) })
    }
    // Strata: short ledges across a few faces.
    for (let s = 0; s < 9; s++) {
      const k = 1 + Math.floor(r() * 2)
      const f = 0.25 + r() * 0.5
      const i0 = Math.floor(r() * N)
      const pts = [0, 1, 2].map((j) => new THREE.Vector3().lerpVectors(rings[k][(i0 + j) % N], rings[k + 1][(i0 + j) % N], f))
      polyline(c, pts, false, { ...st, density: 90, glow: 0.5, tint: goldMix })
    }
    // Dust over the faces and the top, so it reads as a solid.
    const p = new THREE.Vector3()
    for (let i = 0, count = n(2600); i < count; i++) {
      const k = Math.floor(r() * (rings.length - 1))
      const j = Math.floor(r() * N)
      const u = r()
      const v = r()
      p.lerpVectors(rings[k][j], rings[k][(j + 1) % N], u).lerp(new THREE.Vector3().lerpVectors(rings[k + 1][j], rings[k + 1][(j + 1) % N], u), v)
      c.add(p.x, p.y, p.z, r() < 0.6 ? C.white : r() < 0.6 ? C.gold : C.red, 0.004 + r() * 0.007, 0.32 - k * 0.06)
    }
    for (let i = 0, count = n(700); i < count; i++) {
      const j = Math.floor(r() * N)
      p.lerpVectors(rings[0][j], rings[0][(j + 1) % N], r()).lerp(at, r())
      c.add(p.x, 0.002, p.z, r() < 0.7 ? C.white : C.gold, 0.004 + r() * 0.005, 0.3)
    }
    // Boulders at its foot, half in the water.
    for (const [bx, bz, br] of [[-0.95, 0.15, 0.2], [1.0, -0.05, 0.15], [-1.35, -0.45, 0.11]] as const) {
      const base = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        const k = br * (0.8 + r() * 0.4)
        return V(bx + Math.cos(a) * k, foot, bz + Math.sin(a) * k * 0.8)
      })
      const top = base.map((q) => V(bx + (q.x - bx) * 0.55, foot + br * (0.7 + r() * 0.5), bz + (q.z - bz) * 0.55))
      polyline(c, base, true, { ...st, density: 160, glow: 0.7, tint: sparkle })
      polyline(c, top, true, { ...st, density: 160, glow: 0.9, tint: rim })
      for (let i = 0; i < 9; i += 2) line(c, base[i], top[i], { ...st, density: 160, glow: 0.6, tint: rim })
    }
  }, { twinkle: 0.35, scatter: 3 })
  return body
}

/**
 * How he holds the phone on 09. The typing clip cups his paws together, the left palm facing the right
 * with its fingers curled and the right fingers tapping into it, so a phone lying flat on the palm sits
 * inside both paws and edge-on to the viewer. Instead it stands up in the cupped paws: placed from the
 * left hand (out from the palm `palm`, along the fingers `along`, then up `up`, in metres at his 1.9m
 * scale), and turned so its screen faces between his eyes and the viewer (`toFace`: 0 = straight at
 * the viewer, 1 = straight at his eyes), upright.
 */
const PHONE = { scale: 1.15, palm: 0.06, along: 0.07, up: 0.075, toFace: 0.45 }
const phoneHand = {
  q: new THREE.Quaternion(),
  p: new THREE.Vector3(),
  s: new THREE.Vector3(),
  head: new THREE.Vector3(),
  face: new THREE.Vector3(),
  side: new THREE.Vector3(),
  up: new THREE.Vector3(),
  basis: new THREE.Matrix4(),
}
function holdPhone(m: Mascot, phoneObj: THREE.Object3D) {
  const bone = m.bone('LeftHand')
  if (!bone || m.placeholder) return onHand(m, 'Left', phoneObj, V(0, 0.06, 0.025))
  const h = phoneHand
  const k = m.root.scale.x
  bone.updateWorldMatrix(true, false)
  bone.matrixWorld.decompose(h.p, h.q, h.s)
  // Mixamo hand bones: fingers along +Y, palm facing +Z.
  phoneObj.position
    .copy(h.p)
    .addScaledVector(h.face.set(0, 0, 1).applyQuaternion(h.q), PHONE.palm * k)
    .addScaledVector(h.face.set(0, 1, 0).applyQuaternion(h.q), PHONE.along * k)
  phoneObj.position.y += PHONE.up * k
  // The screen faces a blend of his eyes and the viewer (his forward); the phone stands upright.
  m.boneWorld('Head', h.head).sub(phoneObj.position).normalize()
  h.face.set(Math.sin(m.root.rotation.y), 0, Math.cos(m.root.rotation.y)).lerp(h.head, PHONE.toFace).normalize()
  h.up.set(0, 1, 0).addScaledVector(h.face, -h.face.y).normalize()
  h.side.crossVectors(h.up, h.face)
  phoneObj.quaternion.setFromRotationMatrix(h.basis.makeBasis(h.side, h.up, h.face))
}

function askTheLion(link: AskLink): Stage {
  const scene = baseScene()
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const W = POOL.y
  // The rock's dark body stays out of the reflection, so he shows in the water above it.
  const rockBody = ledge(scene, W)
  const pool = createPool(931)
  scene.add(pool.group)
  motes(scene, 921, V(-7, W, -6), V(7, 4.5, 3.5), 520)

  // His phone, glowing red: a light that catches his paw and muzzle, and a soft halo that flares when a bubble pops.
  const device = phone(922)
  device.scale.setScalar(PHONE.scale)
  const held = prop(scene, device, holdPhone)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#ff2a3a'), opacity: 0 }))
  const shine = new THREE.PointLight('#ff2638', 0, 1.1, 2)
  // In the scene from the start, so the warm-up compiles his shader with this light.
  scene.add(halo, shine)
  let flare = 0

  const bubbles = createBubbles()
  scene.add(bubbles.group)
  const glance = glanceOverlay(reduced)
  let him: Mascot | null = null
  let now = 0
  let spawnIn = 0
  let phoneIn = 0
  let rippleIn = 0
  const phoneAt = new THREE.Vector3()
  /**
   * Where a question may rise from: not inside the rock, not so near the camera that it fills the
   * screen, and not where it would drift up behind the copy (left) or the card and rail (right).
   */
  const spot = (p: THREE.Vector3) => Math.hypot(p.x - 0.02, p.z + 0.3) > 1.15 && p.z < 1.3 && p.x > -1.3 - p.z * 0.2 && p.x < 1.9 - p.z * 0.25

  bubbles.onPop = (text, visitor) => {
    glance.trigger()
    flare = 1
    link.popped(text, visitor)
  }
  link.launch = (text) => {
    if (reduced || !him) return false
    // A visitor's question rises nearer the middle, clear of the headline.
    const from = pool.randomPoint(0.7, true, (p) => spot(p) && p.x > -0.7)
    if (!bubbles.spawn(text, from, { toPhone: true, visitor: true })) return false
    bubbles.divert()
    pool.ripple(from.x, from.z, 1.5, now)
    return true
  }

  return {
    id: 'ask',
    transition: { claw: 'light', wind: [0, -0.7, 0], swing: 8 }, // dropping like water into the pool
    scene,
    // Lower and closer than the other screens, so the ledge stands up out of the water and the pool fills the bottom third.
    camera: { pos: V(-0.6, 1.0, 4.4), target: V(-0.6, 0.5, 0), fov: 40 },
    // Phones: back and looking down, so he and his ledge sit in the top third, above the card and the question box.
    portrait: { pos: V(0.1, 1.4, 7.6), target: V(0.1, -0.85, 0), fov: 52 },
    mascot: { pos: V(0, 0, 0), rotY: 0.1, clip: 'typing' },
    enter(m, instant) {
      him = m
      held.enter(m)
      m.setOverlay(glance.fn, instant ? 0 : fx.mascot.crossfade)
      bubbles.clear()
      spawnIn = 0.5
      phoneIn = 2.6
      link.setActive(true)
    },
    leave(m) {
      bubbles.flush()
      him = null
      held.leave()
      m.setOverlay(null, fx.mascot.crossfade)
      link.setActive(false)
    },
    update(t, dt) {
      now = t
      held.update()
      const live = him !== null && !reduced
      if (him) phoneAt.copy(device.position)
      // Every ~2.5s a question rises; every ~8s one of them is for him (unless a visitor is busy asking).
      spawnIn -= dt
      phoneIn -= dt
      rippleIn -= dt
      if (live && spawnIn <= 0) {
        spawnIn = 2.2 + Math.random() * 0.6
        const toPhone = phoneIn <= 0 && !link.holdAmbient && !bubbles.pending
        const from = pool.randomPoint(0.85, toPhone, spot)
        if (bubbles.spawn(ambientQuestion(), from, { toPhone, visitor: false })) {
          pool.ripple(from.x, from.z, 1, t)
          if (toPhone) phoneIn = 7.6 + Math.random() * 0.8
        }
      }
      if (live && rippleIn <= 0) {
        rippleIn = 1.1 + Math.random() * 1.4
        const at = pool.randomPoint(0.9, false, (p) => Math.hypot(p.x - 0.02, p.z + 0.3) > 1.15)
        pool.ripple(at.x, at.z, 0.35 + Math.random() * 0.3, t)
      }
      bubbles.update(dt, him ? phoneAt : null)
      // The phone's red light: steady, with a flare on each pop.
      flare = Math.max(0, flare - dt * 1.6)
      const k = shared.uAssemble.value
      halo.position.copy(phoneAt)
      halo.scale.setScalar(0.32 + flare * 0.45)
      halo.material.opacity = him ? k * (0.5 + flare * 0.9) * (reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 3.1)) : 0
      shine.position.copy(phoneAt).add(V(0, 0.05, 0.12))
      shine.intensity = him ? k * (0.55 + flare * 1.6) : 0
    },
    beforeRender(renderer, camera) {
      pool.reflect(renderer, scene, camera, him?.root ?? null, [rockBody])
    },
  }
}

// ---------------------------------------------------------------------------
// 10 THE TOKEN: drifting gold coins, the emblem, him holding up the coin
// ---------------------------------------------------------------------------
const COIN_GOLD = new THREE.Color('#F4C45A')
const COIN_HI = new THREE.Color('#FFE6A6')
const coinGold = (r: number) => (r < 0.66 ? COIN_GOLD : r < 0.9 ? COIN_HI : C.gold)

/**
 * The coin he holds up: a solid gold face, a bright milled rim, a bead ring,
 * and the lion embossed on the front. Flat in XY, facing +Z, centred.
 */
function heroCoin(c: Cloud, lion: Stamp, R: number) {
  const T = R * 0.12
  const fine = { jitter: R * 0.006, size: [R * 0.018, R * 0.034] as [number, number] }
  // The face, then the back (seen through the gaps, it keeps the coin reading solid).
  for (const [z, count, glowK] of [[T / 2, 1100, 0.3], [-T / 2, 450, 0.16]] as const) {
    for (let i = 0, k = n(count); i < k; i++) {
      const r = R * 0.97 * Math.sqrt(c.rand())
      const a = c.rand() * Math.PI * 2
      c.add(Math.cos(a) * r, Math.sin(a) * r, z, coinGold(c.rand()), fine.size[0] + c.rand() * (fine.size[1] - fine.size[0]), glowK * (0.6 + c.rand() * 0.6))
    }
  }
  // The rim: both edges and the band between, bright.
  for (const z of [T / 2 + T * 0.15, -T / 2]) ring(c, V(0, 0, z), R, { ...fine, density: 1500, tint: coinGold, glow: 1.35 }, V(0, 0, 1))
  for (let i = 0, k = n(500); i < k; i++) {
    const a = c.rand() * Math.PI * 2
    c.add(Math.cos(a) * R, Math.sin(a) * R, (c.rand() - 0.5) * T, coinGold(c.rand()), fine.size[1], 1.0)
  }
  // A raised bead ring inside the rim.
  ring(c, V(0, 0, T / 2 + T * 0.1), R * 0.85, { ...fine, density: 900, tint: (r) => (r < 0.7 ? COIN_HI : COIN_GOLD), glow: 1.1 }, V(0, 0, 1))
  // The lion, embossed: its edges catch the most light.
  stamp(c, lion, R * 1.95, { count: 1700, depth: T * 0.5, edge: 0.45, ...fine, jitter: R * 0.004, tint: (r) => (r < 0.55 ? COIN_HI : COIN_GOLD), glow: 1.3 }, V(0, 0, T / 2 + T * 0.5))
}

/** Tiny gold sparks that now and then lift off the coin and fade (in the coin's frame, +Y up). */
const SPARK_VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uK;
attribute float aSeed;
attribute float aPeriod;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  // Each spark is out for the first third of its period, then rests.
  float life = fract(uTime / aPeriod + aSeed * 7.13) * 3.0;
  float on = step(life, 1.0);
  vec3 p = position + vec3(sin(aSeed * 40.0 + life * 2.0) * 0.012, 0.13 * life, 0.03 * life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = (0.0028 + aSeed * 0.002) * uProj / max(-mv.z, 0.1);
  gl_PointSize = max(px, 1.4);
  vColor = aColor;
  vAlpha = on * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.45, 1.0, life)) * uK * min(1.0, px / 1.4);
}`

function sparks(R: number, count: number) {
  const r = seeded(1009)
  const pos: number[] = []
  const col: number[] = []
  const seed: number[] = []
  const period: number[] = []
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2
    const d = R * Math.sqrt(r())
    pos.push(Math.cos(a) * d, Math.abs(Math.sin(a)) * d, R * 0.1)
    const c = r() < 0.7 ? COIN_GOLD : COIN_HI
    col.push(c.r * 1.5, c.g * 1.5, c.b * 1.5)
    seed.push(r())
    period.push(3.5 + r() * 4)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  g.setAttribute('aPeriod', new THREE.Float32BufferAttribute(period, 1))
  const pts = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: { uTime: shared.uTime, uProj: shared.uProj, uK: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    }),
  )
  pts.frustumCulled = false
  return pts
}

/** A band of light that sweeps across the coin's face (a disc, additive, just in front of it). */
function glint(R: number) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: -1 }, uK: { value: 0 }, uColor: { value: COIN_HI.clone() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT; uniform float uK; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float mask = 1.0 - smoothstep(0.86, 1.0, length(p));
        float d = dot(p, vec2(0.8, 0.6)) - mix(-1.5, 1.5, uT);
        float band = exp(-d * d * 30.0) + 0.3 * exp(-d * d * 4.0);
        gl_FragColor = vec4(uColor * band * mask * uK, 1.0);
      }`,
  })
  return new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), mat)
}

function theToken(emblem: Stamp, lion: Stamp): Stage {
  const scene = baseScene()
  // The emblem sits up and to the right, so his head and the raised coin read against dark space.
  const sym = new THREE.Group()
  sym.position.set(2.6, 3.45, -4.6)
  sym.rotation.set(0.1, -0.35, 0.05)
  scene.add(sym)
  cloud(sym, 1001, (c) => stamp(c, emblem, 4.2, { count: 10000, depth: 0.3, edge: 0.6, size: [0.01, 0.022], tint: sparkle, glow: 1.2 }), { drift: 0.006, twinkle: 0.4, scatter: 7 })
  // Drifting coins: small rings of gold, falling slowly and wrapping.
  cloud(scene, 1002, (c) => {
    const r = c.rand
    for (let i = 0; i < 44; i++) {
      const at = V(-7 + r() * 14, -1 + r() * 8, -7 + r() * 6)
      const nrm = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      const rad = 0.08 + r() * 0.12
      ring(c, at, rad, { density: 280, jitter: 0.006, size: [0.006, 0.014], tint: goldMix, glow: 1.6 }, nrm)
      ring(c, at, rad * 0.6, { density: 160, jitter: 0.006, size: [0.005, 0.01], tint: goldMix, glow: 1.2 }, nrm)
    }
  }, { flow: V(0.04, -0.18, 0), wrap: V(0, 8, 0), wrapMin: V(0, -1, 0), drift: 0.05, twinkle: 0.5, scatter: 5 })
  cloud(scene, 1003, (c) => {
    for (const r of [1.3, 2.4, 3.6, 5]) ring(c, V(0, 0, 0), r, { density: 90, jitter: 0.02, glow: 0.6, tint: (x) => (x < 0.5 ? C.gold : C.white) }, V(0, 1, 0), [Math.PI, Math.PI * 2])
  }, { scatter: 4 })
  const SPOT = V(-0.25, 0, 0)
  floorGlow(scene, SPOT, 0.85, 1.05)
  motes(scene, 1004, V(-7, 0, -7), V(7, 6, 3), 1100, goldMix)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // The viewer, for him to glance at and the coin to face: kept at the camera.
  const viewer = new THREE.Object3D()
  viewer.position.set(-0.9, 1.35, 4.7)
  scene.add(viewer)
  const holding = trophyPose(viewer, reduced)

  // The coin in his raised fist: upright, its face to the viewer, with a soft gold glow and a warm light
  // on his paw, muzzle and the underside of his mane; a glint sweeps across it every few seconds and
  // tiny sparks lift off now and then. It has its own assemble value: it gathers from gold points as the
  // arm finishes rising, and dissolves with the scene on the way out (before the arm lowers).
  const R = COIN.radius
  const held = new THREE.Group()
  const coinPoints = cloud(held, 1005, (c) => heroCoin(c, lion, R), { twinkle: 0.3, scatter: 0.45, drift: 0.0004 })
  const coinAssemble = { value: 0 }
  uniformsOf(coinPoints).uOwn = coinAssemble
  const coinGlow = glow(held, V(0, 0, -0.02), R * 5, 'rgba(255,190,90,0.85)', 0)
  coinGlow.onBeforeRender = (_r, _s, camera) => viewer.position.copy(camera.position)
  const shine = glint(R)
  shine.position.z = R * 0.14
  held.add(shine)
  const spark = sparks(R, 14)
  held.add(spark)
  // Out in front of the coin and a little low, so it reaches up under his mane and across his muzzle
  // without burning out the paw right next to it.
  const coinLight = new THREE.PointLight('#ffb54f', 0, 1.3, 2)
  coinLight.position.set(0, -0.08, 0.25)
  held.add(coinLight)
  // In the scene from the start, so the warm-up compiles his shader with its light.
  scene.add(held)
  let coinT = -1
  let him: Mascot | null = null
  let nextSweep = 2.5
  let sweepT = -1
  const placeCoin = (m: Mascot, dt: number) => {
    // Gather from 0.45s to 1.2s after arrival (the arm settles at 0.8s).
    if (coinT >= 0) coinT += dt
    const own = coinT < 0 ? 1 : THREE.MathUtils.smootherstep(coinT, 0.45, 1.2)
    // Gone a quarter of a second into the scatter, before the arm starts to lower.
    const k = own * THREE.MathUtils.smoothstep(shared.uAssemble.value, 0.55, 1)
    coinAssemble.value = k
    coinGlow.material.opacity = 0.3 * k
    coinLight.intensity = 0.12 * k
    ;(spark.material as THREE.ShaderMaterial).uniforms.uK.value = reduced ? 0 : k
    coinPoint(m, held.position)
    held.lookAt(viewer.position.x, held.position.y, viewer.position.z)
    // The sweep: across the face in 0.9s, every 3.5–5s.
    if (!reduced) {
      sweepT = sweepT < 0 ? ((nextSweep -= dt) <= 0 ? 0 : -1) : sweepT + dt / 0.9
      if (sweepT > 1) {
        sweepT = -1
        nextSweep = 3.5 + Math.random() * 1.5
      }
    }
    const u = shine.material.uniforms
    u.uT.value = sweepT
    u.uK.value = sweepT < 0 ? 0 : 0.9 * k * Math.sin(sweepT * Math.PI)
  }
  const hide = () => {
    coinAssemble.value = 0
    coinGlow.material.opacity = 0
    coinLight.intensity = 0
    shine.material.uniforms.uK.value = 0
    ;(spark.material as THREE.ShaderMaterial).uniforms.uK.value = 0
  }
  hide()
  return {
    id: 'token',
    transition: { claw: 'full', wind: [0, 0.3, 0], swing: -14, wash: '#4a3812' }, // gold
    scene,
    camera: { pos: V(-0.9, 1.35, 4.7), target: V(-0.9, 1.15, 0), fov: 38 },
    // The pose is a layer over the idle clip (trophy.ts): his breathing stays, the arm holds.
    mascot: { pos: SPOT, rotY: -0.05, clip: 'idle' },
    update(t, dt) {
      sym.rotation.y = -0.35 + Math.sin(t * 0.17) * 0.1
      if (him) placeCoin(him, dt)
    },
    enter(m, instant) {
      him = m
      coinT = instant ? -1 : 0
      // The arm rises into the pose over 0.8s, so the scan-in lands on the held pose.
      m.setOverlay(holding, instant ? 0 : 0.8)
    },
    leave(m) {
      him = null
      hide()
      m.setOverlay(null, fx.mascot.crossfade)
    },
  }
}

// ---------------------------------------------------------------------------
// 11 THE MEMES: the meme ring round him, gold dust on the floor
// ---------------------------------------------------------------------------
function theMemes({ ring: memeRing, openMeme }: SceneDeps): Stage {
  const scene = baseScene()
  memeRing.group.position.set(0, 1.7, 0)
  memeRing.group.scale.setScalar(0.78)
  scene.add(memeRing.group)
  cloud(scene, 1101, (c) => disc(c, V(0, 0, 0), 6, 9500, { size: [0.007, 0.018], tint: (r) => (r < 0.8 ? C.gold : r < 0.94 ? C.white : C.red), glow: 1.35 }, 1.1), { drift: 0.01, twinkle: 0.6, scatter: 4 })
  cloud(scene, 1102, (c) => {
    for (const r of [1.2, 3.2, 6.4]) ring(c, V(0, 0, 0), r, { density: 110, jitter: 0.02, glow: 1 })
  }, { scatter: 4 })
  floorGlow(scene, V(0, 0, 0), 0.9, 1.25)
  motes(scene, 1103, V(-7, 0, -6), V(7, 6, 3), 1200, redMix)
  const clickables: Clickable[] = memeRing.faces.map((face, i) => ({
    object: face,
    label: 'DRAG',
    onClick: () => !memeRing.wasDrag && openMeme(i),
  }))
  return {
    id: 'memes',
    transition: { claw: 'light', wind: [0.3, 0.15, 0], swing: 10 }, // round with the ring
    scene,
    camera: { pos: V(-0.55, 1.75, 6.4), target: V(-0.55, 1.2, 0), fov: 40 },
    portrait: { pos: V(0, 2.1, 9.5), target: V(0, 1.2, 0), fov: 52 },
    mascot: { pos: V(0, 0, 0), rotY: 0, clip: 'idle' },
    clickables,
    update(_t, dt) {
      memeRing.update(dt)
      // Shrinks back toward him while a screen change is under way (exactly 0.78 at rest).
      memeRing.group.scale.setScalar(0.78 * THREE.MathUtils.lerp(0.55, 1, THREE.MathUtils.smoothstep(shared.uAssemble.value, fx.transition.presence, 1)))
    },
  }
}

// ---------------------------------------------------------------------------
// 12 JOIN THE PRIDE: walking toward the viewer down a runway of light, the emblem far behind
// ---------------------------------------------------------------------------
/**
 * The runway: rows of light across the floor, carried along by uScroll (metres, x and z) and wrapped
 * in a box, fading in under the camera and out toward the horizon. uScroll is advanced from the
 * stride each frame, so the rows keep pace with his planted foot whatever his speed or size.
 */
const RUNWAY_VERT = /* glsl */ `
uniform float uTime;
uniform float uAssemble;
uniform float uProj;
uniform float uSizeK;
uniform vec2 uScroll;
uniform vec2 uWrapX;  // start, width
uniform vec2 uWrapZ;  // far edge, length
uniform vec2 uFadeZ;  // fade length at the near edge, at the far edge
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
  p.xz += uScroll;
  p.x = uWrapX.x + mod(p.x - uWrapX.x, uWrapX.y);
  p.z = uWrapZ.x + mod(p.z - uWrapZ.x, uWrapZ.y);
  float near = uWrapZ.x + uWrapZ.y;
  float fade = (1.0 - smoothstep(near - uFadeZ.x, near, p.z)) * smoothstep(uWrapZ.x, uWrapZ.x + uFadeZ.y, p.z);
  float a = clamp(uAssemble * 1.6 - aSeed * 0.6, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  vec3 dir = normalize(hash3(aSeed * 91.7) + vec3(0.0, 0.15, 0.45));
  p += dir * (1.0 - a) * 4.0 * (0.5 + aSeed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * uSizeK * uProj / max(-mv.z, 0.05);
  // Held to a few pixels up close, so the near rows stay fine lines rather than blobs.
  gl_PointSize = clamp(px, 1.4, 4.5);
  float tw = 0.78 + 0.22 * sin(uTime * (1.3 + aSeed * 4.0) + aSeed * 69.0);
  vAlpha = fade * tw * a * min(1.0, px / 1.4);
  vColor = aColor;
}`

function joinThePride(emblem: Stamp): Stage {
  const scene = baseScene()
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // From hip height, looking very slightly up: the whole of him, head to shoes, right of centre.
  const CAM = V(-0.92, 1.03, 5.0)
  // Phones: the whole of him in the top half, above the copy.
  const PORTRAIT = V(0, 1.0, 5.8)
  // He walks straight at the camera.
  const ROT_Y = Math.atan2(CAM.x, CAM.z)
  /** Playback speed of the walk here: a steady, unhurried stride. */
  const SPEED = 0.85
  /** His size grows 3% over 10s and eases back over 10s, so the approach loops without a seam. */
  const GROW = 0.03
  const GROW_PERIOD = 20

  // The emblem, far back and dimmed, so he stands out against it.
  const sym = new THREE.Group()
  sym.position.set(0, 2.4, -7.5)
  scene.add(sym)
  cloud(sym, 1201, (c) => stamp(c, emblem, 7.6, { count: 13000, depth: 0.3, edge: 0.6, size: [0.012, 0.026], tint: redMix, glow: 0.66 }), { drift: 0.008, twinkle: 0.5, scatter: 7 })

  // The runway: rows across the floor in dashes of white and gold, a few red sparks.
  const X0 = -16
  const WIDTH = 32
  const FAR = -21
  const LENGTH = CAM.z + 1.5 - FAR
  const rows = cloud(scene, 1202, (c) => {
    const r = c.rand
    for (let z = FAR; z < FAR + LENGTH - 0.5; z += 0.75 + r() * 0.6) {
      // Each row its own brightness and warmth: long dashes with short gaps, a few red sparks.
      const bright = 0.85 + r() * 1.1
      const warm = r() < 0.5
      for (let x = X0 + r() * 2; x < X0 + WIDTH; ) {
        const end = Math.min(x + 1 + r() * 5, X0 + WIDTH)
        for (let i = 0, k = n((end - x) * 95); i < k; i++) {
          const k2 = r()
          const spark = k2 < 0.035
          const tint = spark ? C.red : warm ? (k2 < 0.7 ? C.gold : C.white) : k2 < 0.75 ? C.white : C.gold
          c.add(x + r() * (end - x), 0.003, z + (r() - 0.5) * 0.008, tint, spark ? 0.01 + r() * 0.008 : 0.004 + r() * 0.005, bright * (spark ? 1.8 : 1) * (0.6 + 0.4 * r()))
        }
        x = end + 0.1 + r() * 0.9
      }
    }
  })
  const scroll = new THREE.Vector2()
  rows.material = new THREE.ShaderMaterial({
    vertexShader: RUNWAY_VERT,
    fragmentShader: DOT_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uAssemble: shared.uAssemble,
      uProj: shared.uProj,
      uSizeK: shared.uSizeK,
      uScroll: { value: scroll },
      uWrapX: { value: new THREE.Vector2(X0, WIDTH) },
      uWrapZ: { value: new THREE.Vector2(FAR, LENGTH) },
      uFadeZ: { value: new THREE.Vector2(2.2, 9) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  })
  // The floor moves the other way to his facing, at his planted foot's speed (scaled with him).
  const floorDir = V(-Math.sin(ROT_Y), 0, -Math.cos(ROT_Y))

  // A soft red pool under his feet that follows his hips.
  const pool = floorGlow(scene, V(0, 0, 0), 1.0, 1.35, C.red, false)
  motes(scene, 1203, V(-7, 0, -9), V(7, 6, 3), 1200)

  const viewer = CAM.clone()
  const striding = stridePose(viewer)
  let him: Mascot | null = null
  const hips = new THREE.Vector3()
  return {
    id: 'join',
    transition: { claw: 'full', wind: [0, 0, 0.6], swing: -8 }, // walking out toward you
    scene,
    camera: { pos: CAM, target: V(CAM.x, 1.17, 0), fov: 29.7 },
    portrait: { pos: PORTRAIT, target: V(PORTRAIT.x, -0.3, 0), fov: 50 },
    mascot: { pos: V(0, 0, 0), rotY: ROT_Y, clip: 'walking', speed: SPEED },
    update(t, dt) {
      sym.rotation.y = Math.sin(t * 0.2) * 0.18
      viewer.copy(innerWidth / innerHeight < 0.85 ? PORTRAIT : CAM)
      if (!him) return
      const grow = reduced ? 1 : 1 + (GROW / 2) * (1 - Math.cos((t / GROW_PERIOD) * Math.PI * 2))
      him.root.scale.setScalar(grow)
      if (!reduced) {
        const step = WALK_STRIDE * SPEED * grow * dt
        scroll.x = (scroll.x + floorDir.x * step) % WIDTH
        scroll.y = (scroll.y + floorDir.z * step) % LENGTH
      }
      him.boneWorld('Hips', hips)
      pool.position.x += (hips.x - pool.position.x) * Math.min(1, dt * 6)
      pool.position.z += (hips.z - pool.position.z) * Math.min(1, dt * 6)
      pool.scale.setScalar(grow)
    },
    enter(m, instant) {
      him = m
      m.setOverlay(striding, instant ? 0 : fx.mascot.crossfade)
    },
    leave(m) {
      him = null
      m.setOverlay(null, fx.mascot.crossfade)
    },
  }
}

export async function buildStages(deps: SceneDeps): Promise<Stage[]> {
  const emblem = await svgStamp(symbolSvg, 512)
  // The lion head alone (the emblem without its coin ring, the first <circle>), as on the entry orb.
  const lionHead = await svgStamp(symbolSvg.replace(/<circle[^>]*\/>/, ''), 512)
  return [
    throneRoom(),
    theName(emblem),
    onStage(emblem),
    theHunt(),
    thePride(emblem),
    forYou(lionHead),
    theSummit(emblem),
    cheers(),
    askTheLion(deps.ask),
    theToken(emblem, lionHead),
    theMemes(deps),
    joinThePride(emblem),
  ]
}

export { uniformsOf }
