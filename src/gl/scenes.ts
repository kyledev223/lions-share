import * as THREE from 'three'
import symbolSvg from '../brand/symbol.svg?raw'
import type { Clickable, Stage } from './engine'
import type { Mascot } from './mascot'
import { Cloud, n, seeded, shared, uniformsOf, type CloudLook } from './points'
import type { Ring } from './ring'
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

/** The glowing pool and ring on the floor under the mascot. */
function floorGlow(parent: THREE.Object3D, at: THREE.Vector3, radius: number, strength = 1, color = C.red) {
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
  cloud(g, 901, (c) => {
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

/**
 * Props ride along with his hands in world space, so they stay readable
 * whatever the clip does with the wrist: `place` runs every frame while the
 * stage is up.
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
  // The throne, squared up to him: seat, legs, armrests, and a tall back crested with rays like the mane.
  const throne = new THREE.Group()
  throne.rotation.y = -0.25
  scene.add(throne)
  cloud(throne, 103, (c) => {
    const st = { density: 240, jitter: 0.006, size: [0.006, 0.014] as [number, number], glow: 1.25 }
    const gold = (r: number) => (r < 0.62 ? C.gold : r < 0.9 ? C.white : C.red)
    box(c, V(0, 0.44, 0), V(0.82, 0.08, 0.7), { ...st, glow: 1.45, tint: gold })
    for (const x of [-0.37, 0.37]) for (const z of [-0.3, 0.3]) line(c, V(x, 0.4, z), V(x, 0.02, z), st)
    const B = -0.38
    const back = [V(-0.46, 0.48, B), V(-0.46, 1.86, B)]
    const tips = 7
    for (let i = 0; i <= tips * 2; i++) {
      const x = -0.46 + (0.92 * i) / (tips * 2)
      const mid = 1 - Math.abs(i - tips) / tips
      back.push(V(x, i % 2 ? 1.88 : 2.02 + mid * 0.38, B))
    }
    back.push(V(0.46, 1.86, B), V(0.46, 0.48, B))
    polyline(c, back, false, { ...st, density: 280, glow: 1.5, tint: gold })
    roundedRect(c, V(0, 1.2, B + 0.01), 0.62, 1.1, 0.08, { ...st, density: 150, glow: 0.95, tint: redMix })
    for (const s of [-1, 1]) {
      line(c, V(s * 0.46, 0.76, B), V(s * 0.46, 0.76, 0.32), { ...st, tint: gold })
      line(c, V(s * 0.46, 0.76, 0.32), V(s * 0.46, 0.48, 0.32), st)
      ring(c, V(s * 0.46, 0.79, 0.32), 0.04, { ...st, density: 600, tint: gold })
    }
  }, { scatter: 2, twinkle: 0.3 })
  floorGlow(scene, V(0, 0, 0), 1.05, 1.15)
  motes(scene, 105, V(-8, 0, -9), V(8, 6, 3), 1400)
  return {
    id: 'lion',
    scene,
    camera: { pos: V(-0.95, 1.4, 5.1), target: V(-0.95, 1.0, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -0.25, clip: 'sitting-idle' },
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
    scene,
    camera: { pos: V(0, 0, 8.4), target: V(0, 0, 0), fov: 42 },
    portrait: { pos: V(1.4, 0, 12), target: V(1.4, 0, 0), fov: 52 },
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
function onStage(emblem: Stamp): Stage {
  const scene = baseScene()
  beam(scene, V(0, 7.5, 0.2), V(0, 0, 0.2), 0.25, 1.7, new THREE.Color('#ffd9cc'), 0.9)
  floorGlow(scene, V(0, 0, 0.1), 1.1, 0.9, C.light)
  // Stage edge and floor.
  cloud(scene, 301, (c) => {
    line(c, V(-9, 0, 1.6), V(9, 0, 1.6), { density: 120, jitter: 0.01, glow: 1 })
    line(c, V(-9, -0.9, 1.7), V(9, -0.9, 1.7), { density: 40, glow: 0.5 })
    floorGrid(c, -8, 8, -6, 1.6, 4, 8, 30, 0.45)
  }, { scatter: 5 })
  // Mic stand in front of him.
  cloud(scene, 302, (c) => {
    const base = V(0.05, 0, 0.62)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4
      line(c, base.clone().setY(0.1), V(base.x + Math.cos(a) * 0.32, 0, base.z + Math.sin(a) * 0.32), { density: 260, jitter: 0.003, size: [0.005, 0.01], glow: 1 })
    }
    line(c, base.clone().setY(0.1), V(0.05, 1.42, 0.62), { density: 300, jitter: 0.003, size: [0.005, 0.01], glow: 1 })
    line(c, V(0.05, 1.42, 0.62), V(0.03, 1.5, 0.5), { density: 300, jitter: 0.003, size: [0.005, 0.01], glow: 1.1 })
    volume(c, V(-0.01, 1.49, 0.44), V(0.07, 1.59, 0.51), 160, { size: [0.005, 0.01], tint: C.white, glow: 1.4 })
  }, { scatter: 2, twinkle: 0.2 })
  // Gold-dust audience: rows of heads and shoulders below the stage.
  cloud(scene, 303, (c) => {
    const r = c.rand
    for (let row = 0; row < 4; row++) {
      const z = 2.4 + row * 0.75
      for (let x = -7; x < 7; x += 0.55 + r() * 0.2) {
        const hx = x + (r() - 0.5) * 0.2
        const hy = -0.55 + row * 0.12 + r() * 0.08
        for (let k = 0; k < n(40); k++) {
          const a = r() * Math.PI * 2
          const rr = Math.sqrt(r()) * 0.13
          c.add(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 1.2, z + (r() - 0.5) * 0.1, goldMix(r()), 0.008 + r() * 0.012, 0.9)
        }
        for (let k = 0; k < n(50); k++) {
          const u = r() - 0.5
          c.add(hx + u * 0.6, hy - 0.2 - Math.abs(u) * 0.3 - r() * 0.35, z + (r() - 0.5) * 0.15, goldMix(r()), 0.008 + r() * 0.012, 0.7)
        }
      }
    }
    volume(c, V(-8, -1, 2.2), V(8, -0.2, 5.5), 2000, { size: [0.006, 0.014], tint: goldMix, glow: 0.8 })
  }, { drift: 0.01, twinkle: 0.6, scatter: 3 })
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
  motes(scene, 305, V(-6, 0, -5), V(6, 6, 2), 1200)
  return {
    id: 'stage',
    scene,
    camera: { pos: V(0.95, 1.5, 5.6), target: V(0.95, 1.15, 0), fov: 40 },
    mascot: { pos: V(0, 0, 0), rotY: 0.08, clip: 'clapping' },
  }
}

// ---------------------------------------------------------------------------
// 04 THE HUNT: a savanna horizon drawn in candlesticks; he walks the scrolling floor
// ---------------------------------------------------------------------------
function theHunt(): Stage {
  const scene = baseScene()
  const WALK = 1.25 // m/s, matches the stride
  // Floor lines scroll under his feet.
  cloud(scene, 401, (c) => {
    for (let z = -7; z <= 2.6; z += 0.9) line(c, V(-12, 0, z), V(12, 0, z), { density: 16, jitter: 0.01, glow: 0.45 + (z + 7) * 0.05 })
    for (let x = -12; x < 12; x += 1.6) line(c, V(x, 0, -7), V(x + 1.2, 0, 2.6), { density: 45, jitter: 0.012, glow: 1 })
  }, { flow: V(WALK, 0, 0), wrap: V(24, 0, 0), wrapMin: V(-12, 0, 0), scatter: 4, twinkle: 0.3 })
  // A low sun on the far horizon, holding still (it is very far away).
  cloud(scene, 404, (c) => {
    const at = V(2.2, 0.7, -10)
    const R = 3
    ring(c, at, R, { density: 220, jitter: 0.015, size: [0.012, 0.026], tint: goldMix, glow: 1.6 }, V(0, 0, 1), [0, Math.PI])
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
    id: 'hunt',
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

function thePride(): Stage {
  const scene = baseScene()
  driftingText(scene, 501, [['$ROAR'], ['THE PRIDE']], 6, [goldMix, sparkle, redMix])
  cloud(scene, 520, (c) => floorGrid(c, -9, 9, -10, 3, 9, 14, 13, 0.5), { scatter: 4, depthFade: [9, 14] })
  // A glowing rail at his waist on two posts.
  cloud(scene, 521, (c) => {
    line(c, V(-0.62, 1.0, 0.42), V(0.62, 1.0, 0.42), { density: 650, jitter: 0.005, size: [0.006, 0.012], glow: 1.5, tint: (r) => (r < 0.6 ? C.white : r < 0.85 ? C.gold : C.light) })
    for (const x of [-0.55, 0.55]) line(c, V(x, 1.0, 0.42), V(x, 0, 0.42), { density: 160, jitter: 0.006, size: [0.005, 0.01], glow: 0.9 })
    volume(c, V(-0.62, 0.99, 0.4), V(0.62, 1.01, 0.44), 220, { size: [0.005, 0.01], tint: C.light, glow: 1.2 })
  }, { twinkle: 0.5, scatter: 2 })
  floorGlow(scene, V(0, 0, 0), 0.95, 1)
  motes(scene, 522, V(-7, 0, -6), V(7, 5, 3), 1200)
  return {
    id: 'pride',
    scene,
    camera: { pos: V(-1.05, 1.4, 4.9), target: V(-1.05, 1.1, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -0.12, clip: 'idle' },
  }
}

// ---------------------------------------------------------------------------
// 06 FOR YOU: a tunnel of rings; close on him reaching out
// ---------------------------------------------------------------------------
function forYou(): Stage {
  const scene = baseScene()
  cloud(scene, 601, (c) => {
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 3
      ring(c, V(-0.3, 1.3, z), 3.1 + (i % 2) * 0.25, { density: 70, jitter: 0.04, size: [0.01, 0.03], glow: 1.4 }, V(0, 0, 1))
    }
  }, { flow: V(0, 0, 1.2), wrap: V(0, 0, 27), wrapMin: V(0, 0, -24), scatter: 5, twinkle: 0.4, depthFade: [14, 24] })
  // A bright halo behind his head.
  cloud(scene, 602, (c) => ring(c, V(0, 1.62, -0.45), 0.62, { density: 1000, jitter: 0.02, size: [0.007, 0.016], glow: 1.4, tint: (r) => (r < 0.6 ? C.white : r < 0.85 ? C.gold : C.light) }, V(0, 0, 1)), { twinkle: 0.5, scatter: 2 })
  cloud(scene, 603, (c) => {
    for (const r of [1.4, 2.6, 4, 5.6]) ring(c, V(0, 0, 0), r, { density: 70, jitter: 0.02, glow: 0.6 })
  }, { scatter: 4 })
  motes(scene, 604, V(-5, 0, -8), V(5, 4, 3), 1200, redMix)
  return {
    id: 'foryou',
    scene,
    camera: { pos: V(-0.42, 1.5, 2.5), target: V(-0.42, 1.28, 0), fov: 40 },
    portrait: { pos: V(0, 1.45, 3.4), target: V(0, 1.25, 0), fov: 48 },
    mascot: { pos: V(0, 0, 0), rotY: 0.18, clip: 'reaching' },
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
    id: 'summit',
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
  glass.scale.setScalar(1.35)
  const head = new THREE.Vector3()
  const tilt = new THREE.Vector3()
  const held = prop(scene, glass, (m, g) => {
    // The stem sits in his left fist; the glass stays upright until it nears his mouth, then tips to it.
    fist(m, 'Left', g.position)
    g.position.y -= 0.06
    m.boneWorld('Head', head)
    const drink = THREE.MathUtils.smoothstep(g.position.y, head.y - 0.45, head.y - 0.12)
    tilt.subVectors(head, g.position).setY(0).normalize()
    g.quaternion.setFromAxisAngle(V(tilt.z, 0, -tilt.x), drink * 1.1)
  })
  return {
    id: 'cheers',
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
// 09 ASK THE LION: floating questions; him on his phone
// ---------------------------------------------------------------------------
function phone(seed: number) {
  const g = new THREE.Group()
  cloud(g, seed, (c) => {
    roundedRect(c, V(0, 0, 0), 0.08, 0.155, 0.012, { density: 3000, jitter: 0.0012, size: [0.003, 0.005], tint: C.white, glow: 2.4 })
    volume(c, V(-0.035, -0.07, 0.002), V(0.035, 0.07, 0.004), 900, { size: [0.002, 0.004], tint: redMix, glow: 2.2 })
  }, { twinkle: 0.4, scatter: 1 })
  return g
}

function askTheLion(): Stage {
  const scene = baseScene()
  driftingText(scene, 901, [['WEN ROAR?'], ['WHY THE SUIT?'], ['HOW BIG IS A SHARE?'], ['ASK THE LION'], ['IS IT GOLD?'], ['$ROAR']], 6, [sparkle, goldMix, redMix])
  cloud(scene, 920, (c) => floorGrid(c, -9, 9, -10, 3, 9, 14, 13, 0.5), { scatter: 4, depthFade: [9, 14] })
  floorGlow(scene, V(0, 0, 0), 0.85, 1.2)
  motes(scene, 921, V(-7, 0, -6), V(7, 5, 3), 1000)
  const device = phone(922)
  device.scale.setScalar(1.3)
  const right = new THREE.Vector3()
  const eyes = new THREE.Vector3()
  const held = prop(scene, device, (m, d) => {
    // Between his hands, screen turned up to his eyes.
    fist(m, 'Left', d.position)
    fist(m, 'Right', right)
    d.position.lerp(right, 0.5)
    d.position.y += 0.03
    m.boneWorld('Head', eyes)
    d.lookAt(eyes)
  })
  return {
    id: 'ask',
    scene,
    camera: { pos: V(-0.45, 1.35, 4.6), target: V(-0.45, 1.1, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: 0.1, clip: 'typing' },
    enter: held.enter,
    leave: held.leave,
    update: held.update,
  }
}

// ---------------------------------------------------------------------------
// 10 THE TOKEN: drifting gold coins, the emblem, a coin over his hand
// ---------------------------------------------------------------------------
function theToken(emblem: Stamp): Stage {
  const scene = baseScene()
  const sym = new THREE.Group()
  sym.position.set(2.0, 3.0, -4.5)
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
  floorGlow(scene, V(0, 0, 0), 0.85, 1.05)
  motes(scene, 1004, V(-7, 0, -7), V(7, 6, 3), 1100, goldMix)
  const hover = new THREE.Group()
  const spin = new THREE.Group()
  hover.add(spin)
  cloud(spin, 1005, (c) => coin(c, emblem, 0.075, 2600, goldMix, 1.6), { twinkle: 0.4, scatter: 1 })
  const held = prop(scene, hover, (m, h) => {
    // Hovering just above his open left palm.
    fist(m, 'Left', h.position)
    h.position.y += 0.1
  })
  return {
    id: 'token',
    scene,
    camera: { pos: V(-0.9, 1.35, 4.7), target: V(-0.9, 1.15, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -0.2, clip: 'looking-at-hand' },
    update(t) {
      spin.rotation.y = t * 1.6
      sym.rotation.y = -0.35 + Math.sin(t * 0.17) * 0.1
      held.update()
    },
    enter: held.enter,
    leave: held.leave,
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
    scene,
    camera: { pos: V(-0.55, 1.75, 6.4), target: V(-0.55, 1.2, 0), fov: 40 },
    portrait: { pos: V(0, 2.1, 9.5), target: V(0, 1.2, 0), fov: 52 },
    mascot: { pos: V(0, 0, 0), rotY: 0, clip: 'idle' },
    clickables,
    update(_t, dt) {
      memeRing.update(dt)
    },
  }
}

// ---------------------------------------------------------------------------
// 12 JOIN THE PRIDE: the emblem behind him, gold lines, a wave
// ---------------------------------------------------------------------------
function joinThePride(emblem: Stamp): Stage {
  const scene = baseScene()
  const sym = new THREE.Group()
  sym.position.set(0, 2.2, -3.4)
  scene.add(sym)
  cloud(sym, 1201, (c) => stamp(c, emblem, 5.2, { count: 13000, depth: 0.3, edge: 0.6, size: [0.01, 0.022], tint: redMix, glow: 0.95 }), { drift: 0.008, twinkle: 0.5, scatter: 7 })
  cloud(scene, 1202, (c) => {
    const r = c.rand
    for (let i = 0; i < 16; i++) {
      const y = -0.2 + r() * 2.2
      const z = -4 + r() * 5
      const x0 = -10 + r() * 6
      line(c, V(x0, y, z), V(x0 + 6 + r() * 10, y, z), { density: 60, jitter: 0.006, size: [0.006, 0.014], tint: r() < 0.6 ? goldMix : sparkle, glow: 1.1 })
    }
  }, { flow: V(0.25, 0, 0), wrap: V(24, 0, 0), wrapMin: V(-12, 0, 0), twinkle: 0.6, scatter: 5 })
  floorGlow(scene, V(0, 0, 0), 0.95, 1.2)
  motes(scene, 1203, V(-7, 0, -6), V(7, 6, 3), 1200)
  return {
    id: 'join',
    scene,
    camera: { pos: V(-1.25, 1.4, 5.2), target: V(-1.25, 1.15, 0), fov: 38 },
    mascot: { pos: V(0, 0, 0), rotY: -0.15, clip: 'waving' },
    update(t) {
      sym.rotation.y = Math.sin(t * 0.2) * 0.25
    },
  }
}

export async function buildStages(deps: SceneDeps): Promise<Stage[]> {
  const emblem = await svgStamp(symbolSvg, 512)
  return [
    throneRoom(),
    theName(emblem),
    onStage(emblem),
    theHunt(),
    thePride(),
    forYou(),
    theSummit(emblem),
    cheers(),
    askTheLion(),
    theToken(emblem),
    theMemes(deps),
    joinThePride(emblem),
  ]
}

export { uniformsOf }
