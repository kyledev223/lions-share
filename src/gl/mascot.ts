import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { fx } from '../fx-config'
import { shared } from './points'

/**
 * The mascot. There is a single one; each screen borrows him (engine.ts
 * reparents him into the active scene) and his clips crossfade on the way.
 *
 * Two forms, same surface:
 *
 *  - The lion: one rigged model (public/assets/lion/lion.glb, built by
 *    `npm run mascot`) with all ten clips on one mixer, PBR-shaded on his
 *    baked colour, AO and roughness maps. A key and a fill light follow the
 *    camera, a back light picks out his outline, and a soft room environment
 *    gives the shoes and tie their reflections. His lit surface is held under
 *    the bloom threshold, so his face and shirt stay crisp.
 *  - Until lion.glb exists: a dark hologram silhouette of a suited figure,
 *    built from simple solids on a small rig with the same bone names, posed
 *    procedurally for each clip and labelled "lion.glb pending". Props that
 *    follow his hands keep working.
 *
 * The hologram is the same on both: faint horizontal bands drifting up, a
 * red fresnel rim, legs that fade into the floor glow, a flicker every few
 * seconds, a top-to-bottom scan when he materialises, and a dissolve when he
 * leaves.
 */
export type ClipName =
  | 'idle'
  | 'sitting-idle'
  | 'presenting'
  | 'walking'
  | 'reaching'
  | 'looking-up'
  | 'toast'
  | 'typing'
  | 'looking-at-hand'
  | 'greeting'

export interface Mascot {
  root: THREE.Group
  uniforms: Record<string, THREE.IUniform>
  play(name: ClipName, fade?: number): void
  current: ClipName | null
  /** World position of a bone (Mixamo name without the prefix, e.g. "LeftHand"). */
  boneWorld(name: string, out: THREE.Vector3): THREE.Vector3
  /** The bone itself, for props that ride on it (undefined if the rig has no such bone). */
  bone(name: string): THREE.Object3D | undefined
  update(dt: number, time: number): void
  /** World height of the top of his head (for the scan). */
  topY(): number
  /** Builds his reflection environment; needs the renderer, so the engine calls it once. */
  useRenderer(renderer: THREE.WebGLRenderer): void
  /** True while the placeholder figure stands in for lion.glb. */
  placeholder: boolean
  /**
   * Layers a pose over the clip (IK and the like), run after the mixer every
   * frame; any other layer releases. Passing null releases them all. Layers
   * fade in and out over `fade` seconds, independently, so one can release
   * while the next settles in; `fade` 0 applies it at once.
   */
  setOverlay(overlay: PoseOverlay | null, fade?: number): void
}

/** A pose layered on top of the clip. `weight` is 0–1 (already eased); blend your changes by it. */
export type PoseOverlay = (mascot: Mascot, weight: number, dt: number) => void

// ---------------------------------------------------------------------------
// The hologram, shared by both forms
// ---------------------------------------------------------------------------
const HOLO_PARS = /* glsl */ `
uniform float uTime;
uniform float uRim;
uniform float uRimPower;
uniform vec3 uRimColor;
uniform float uBands;
uniform float uBandDepth;
uniform float uBandSpeed;
uniform float uSweep;
uniform float uFloorY;
uniform float uFloorFade;
uniform float uFloorGlow;
uniform float uTopY;
uniform float uFlicker;
uniform float uMaterialize;
uniform float uDissolve;
uniform float uOpacity;
uniform float uCeiling;
uniform float uAoDirect;
uniform float uSheen;
varying vec3 vW;

float holoHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}`

// Materialise: a scan line sweeps from the top of his head down to the soles. Dissolve: pixels drop out.
const HOLO_START = /* glsl */ `
float holoSpan = uTopY - uFloorY + 0.25;
float holoFront = uTopY + 0.05 - uMaterialize * holoSpan;
if (vW.y < holoFront) discard;
if (uDissolve > 0.0 && holoHash(floor(vW.xy * 160.0) + floor(vW.z * 40.0)) < uDissolve) discard;`

/** Takes `col` (lit colour), `ndv` (|n·v|) and `base` (surface albedo); leaves the hologram in `col`. */
const HOLO_END = /* glsl */ `
{
  // Soft ceiling under the bloom threshold: his lit surface never blooms.
  float m = max(col.r, max(col.g, col.b));
  float knee = uCeiling * 0.7;
  if (m > knee) col *= (knee + (uCeiling - knee) * (1.0 - exp(-(m - knee) / (uCeiling - knee)))) / m;

  float y = vW.y;
  float fres = pow(1.0 - ndv, uRimPower);
  // The darkest parts keep a hint of red toward their edges.
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  col += uRimColor * uSheen * (1.0 - smoothstep(0.02, 0.1, lum)) * pow(1.0 - ndv, 2.0);

  // Faint horizontal bands drifting upward.
  float band = fract((y - uTime * uBandSpeed) * uBands);
  float bright = smoothstep(0.0, 0.22, band) * smoothstep(1.0, 0.6, band);
  col *= 1.0 - uBandDepth * (1.0 - bright);
  // A slower, brighter band that sweeps up every few seconds.
  float sweepY = mix(uFloorY - 0.3, uTopY + 0.3, fract(uTime * 0.11));
  col += uRimColor * uSweep * exp(-pow((y - sweepY) * 8.0, 2.0));

  // Rim.
  col += uRimColor * fres * uRim;

  // Legs fade into the glow on the floor.
  float h = clamp((y - uFloorY) / uFloorFade, 0.0, 1.0);
  h = h * h * (3.0 - 2.0 * h);
  col = mix(uRimColor * (0.3 + 0.25 * bright), col, 1.0 - uFloorGlow * (1.0 - h));

  // Flicker: a quick dip with a little line noise.
  col *= 1.0 - uFlicker * (0.35 + 0.65 * holoHash(vec2(floor(y * 70.0), floor(uTime * 40.0))));

  // The scan front glows.
  col += uRimColor * 3.0 * exp(-(y - holoFront) * 28.0) * step(0.001, 1.0 - uMaterialize);
  col *= uOpacity;
}`

const GLITCH = /* glsl */ `
if (uGlitch > 0.0) {
  float band = floor(vW.y * 9.0 + floor(uTime * 20.0) * 3.1);
  float tear = step(0.6, fract(sin(band * 12.9898) * 43758.5453));
  mvPosition.x += (fract(sin(band * 78.233) * 12345.678) - 0.5) * 0.5 * tear * uGlitch;
  gl_Position = projectionMatrix * mvPosition;
}`

function holoUniforms(reduced: boolean): Record<string, THREE.IUniform> {
  return {
    uTime: shared.uTime,
    uRim: { value: fx.holo.rim },
    uRimPower: { value: fx.holo.rimPower },
    uRimColor: { value: new THREE.Color(fx.palette.red).multiplyScalar(1.1) },
    uBands: { value: fx.holo.bands },
    uBandDepth: { value: fx.holo.bandDepth },
    uBandSpeed: { value: reduced ? 0 : fx.holo.bandSpeed },
    uSweep: { value: fx.holo.sweep },
    uFloorY: { value: 0 },
    uFloorFade: { value: fx.holo.floorFade },
    uFloorGlow: { value: fx.holo.floorGlow },
    uTopY: { value: 2 },
    uFlicker: { value: 0 },
    uMaterialize: { value: 1 },
    uDissolve: { value: 0 },
    uGlitch: { value: 0 },
    uOpacity: { value: 1 },
    uCeiling: { value: fx.holo.ceiling },
    uAoDirect: { value: fx.holo.aoDirect },
    uSheen: { value: fx.holo.sheen },
  }
}

/** A flicker every few seconds: two quick dips. */
function flicker(uniforms: Record<string, THREE.IUniform>, reduced: boolean) {
  let next = 2 + Math.random() * fx.holo.flickerEvery
  let t = -1
  return (dt: number, time: number) => {
    if (reduced) return
    if (time > next && t < 0) t = 0
    if (t < 0) return
    t += dt
    const f = t < 0.06 ? 1 : t < 0.11 ? 0.15 : t < 0.16 ? 0.8 : 0
    uniforms.uFlicker.value = f * fx.holo.flicker
    if (t > 0.18) {
      t = -1
      uniforms.uFlicker.value = 0
      next = time + fx.holo.flickerEvery * (0.5 + Math.random())
    }
  }
}

/** Rough size of lion.glb, for progress when the server sends no Content-Length (compressed responses). */
const EXPECTED_BYTES = 6.9e6

/**
 * Loads lion.glb; if it isn't there yet (or can't be read), returns the
 * placeholder figure instead. `onProgress` gets 0–1 as the .glb downloads.
 */
export async function loadMascot(url: string, reduced: boolean, onProgress?: (fraction: number) => void): Promise<Mascot> {
  try {
    return await loadModel(url, reduced, onProgress)
  } catch (err) {
    console.info(`${url} is not available yet (${(err as Error).message}); showing the placeholder figure.`)
    onProgress?.(1)
    return placeholderMascot(reduced)
  }
}

// ---------------------------------------------------------------------------
// The lion: lion.glb, PBR with the hologram patched in
// ---------------------------------------------------------------------------
const GLB_FRAG_AO = /* glsl */ `
#include <map_fragment>
#ifdef USE_AOMAP
  diffuseColor.rgb *= mix(1.0, texture2D(aoMap, vAoMapUv).r, uAoDirect);
#endif`

const GLB_FRAG_END = /* glsl */ `
{
  vec3 col = outgoingLight;
  vec3 base = diffuseColor.rgb;
  float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
  ${HOLO_END}
  outgoingLight = col;
}
#include <opaque_fragment>`

function pbrHoloMaterial(src: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>) {
  const mat = new THREE.MeshStandardMaterial({
    map: src.map,
    roughnessMap: src.roughnessMap,
    roughness: 1,
    metalness: 0,
    aoMap: src.aoMap,
    aoMapIntensity: 1,
    envMapIntensity: fx.holo.env,
  })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `uniform float uGlitch;\nuniform float uTime;\nvarying vec3 vW;\nvoid main() {`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${GLITCH}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${HOLO_PARS}\nvoid main() {`)
      .replace('#include <clipping_planes_fragment>', `${HOLO_START}\n#include <clipping_planes_fragment>`)
      .replace('#include <map_fragment>', GLB_FRAG_AO)
      .replace('#include <opaque_fragment>', GLB_FRAG_END)
  }
  mat.customProgramCacheKey = () => 'mascot-holo'
  return mat
}

async function loadModel(url: string, reduced: boolean, onProgress?: (fraction: number) => void): Promise<Mascot> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url, (e) => onProgress?.(Math.min(1, e.loaded / (e.lengthComputable && e.total ? e.total : EXPECTED_BYTES))))
  onProgress?.(1)

  const root = new THREE.Group()
  root.name = 'mascot'
  root.add(gltf.scene)
  let mesh: THREE.SkinnedMesh | null = null
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh
  })
  if (!mesh) throw new Error('lion.glb has no skinned mesh')
  const skinned = mesh as THREE.SkinnedMesh
  const source = skinned.material as THREE.MeshStandardMaterial
  for (const t of [source.map, source.roughnessMap, source.aoMap]) if (t) t.anisotropy = 8

  const uniforms = holoUniforms(reduced)
  const material = pbrHoloMaterial(source, uniforms)
  skinned.material = material
  source.dispose()
  // Animated far from his bind pose, the rest-pose bounds would cull him by mistake.
  skinned.frustumCulled = false

  // ---- lights: key and fill ride with the camera, a back light outlines him ----
  const key = new THREE.DirectionalLight(0xfff4ea, fx.holo.key)
  const fill = new THREE.DirectionalLight(0xffe8e0, fx.holo.fill)
  const back = new THREE.DirectionalLight(0xffd6cc, fx.holo.back)
  for (const l of [key, fill, back]) root.add(l, l.target)
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const camBack = new THREE.Vector3()
  const aim = new THREE.Vector3()
  const place = (light: THREE.DirectionalLight, r: number, u: number, b: number) => {
    light.position.copy(aim).addScaledVector(camRight, r).addScaledVector(camUp, u).addScaledVector(camBack, b)
    root.worldToLocal(light.position)
    light.target.position.copy(aim)
    root.worldToLocal(light.target.position)
  }
  // Placed from the camera that is about to draw him (takes effect from the next frame).
  skinned.onBeforeRender = (_r, _s, camera) => {
    camera.matrixWorld.extractBasis(camRight, camUp, camBack)
    root.getWorldPosition(aim).y += 1.2 * root.scale.y
    place(key, -2.2, 2.4, 3)
    place(fill, 2.6, 0.4, 2.2)
    place(back, 0.6, 1.6, -3)
  }

  const bones = new Map<string, THREE.Bone>()
  skinned.skeleton.bones.forEach((b) => bones.set(b.name.replace(/^mixamorig:?/, ''), b))
  const hips = bones.get('Hips')!
  const head = bones.get('Head')!
  const neck = bones.get('Neck')!
  /** 0–1: how far the looking-up lift is applied (eases in and out with the clip). */
  let lift = 0

  // ---- clips ------------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const clips = new Map<string, THREE.AnimationClip>()
  for (const raw of gltf.animations) {
    const cut = CUTS[raw.name as ClipName]
    const clip = cut ? cutOut(raw, cut[0], cut[1]) : raw
    clips.set(clip.name, prepareClip(clip, hips.position.clone(), clip.name !== 'sitting-idle', !PING_PONG.has(clip.name as ClipName)))
  }
  const actions = new Map<string, THREE.AnimationAction>()
  let current: ClipName | null = null

  // ---- pose layers ------------------------------------------------------------
  const layers: { fn: PoseOverlay; w: number; to: number; fade: number }[] = []
  // The exporter drops tracks that never change, so the mixer doesn't rewrite every bone each
  // frame. Anything layered on top would pile up in those bones; a bone the mixer left holding
  // what we ended the last frame with gets the clip's value back before the layers run.
  const allBones = [...bones.values()]
  const clipPose = allBones.map((b) => ({ q: b.quaternion.clone(), p: b.position.clone() }))
  const lastPose = allBones.map(() => ({ q: new THREE.Quaternion(NaN, NaN, NaN, NaN), p: new THREE.Vector3(NaN, NaN, NaN) }))
  const restoreUntracked = () =>
    allBones.forEach((b, i) => {
      if (b.quaternion.equals(lastPose[i].q)) b.quaternion.copy(clipPose[i].q)
      if (b.position.equals(lastPose[i].p)) b.position.copy(clipPose[i].p)
      clipPose[i].q.copy(b.quaternion)
      clipPose[i].p.copy(b.position)
    })
  const rememberPose = () =>
    allBones.forEach((b, i) => {
      lastPose[i].q.copy(b.quaternion)
      lastPose[i].p.copy(b.position)
    })

  function play(name: ClipName, fade: number = fx.mascot.crossfade) {
    if (current === name) return
    const clip = clips.get(name)
    if (!clip) return console.warn(`lion.glb has no clip "${name}"`)
    let next = actions.get(name)
    if (!next) {
      next = mixer.clipAction(clip)
      next.setLoop(PING_PONG.has(name) ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity)
      actions.set(name, next)
    }
    const prev = current ? actions.get(current) : null
    next.reset().setEffectiveTimeScale(fx.mascot.speed[name] ?? 1).setEffectiveWeight(1).play()
    // No time warp: it would end the fade with the clip at 1×, undoing its speed.
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, false)
    else actions.forEach((a) => a !== next && a.stop())
    current = name
  }

  const flick = flicker(uniforms, reduced)
  const tmp = new THREE.Vector3()
  const self: Mascot = {
    root,
    uniforms,
    placeholder: false,
    get current() {
      return current
    },
    boneWorld: (name, out) => bones.get(name)!.getWorldPosition(out),
    bone: (name) => bones.get(name),
    play,
    setOverlay(next, fade = fx.mascot.crossfade) {
      for (const l of layers) {
        const to = l.fn === next ? 1 : 0
        // A layer already on its way out keeps its own release time.
        if (l.to !== to) Object.assign(l, { to, fade })
      }
      if (next && !layers.some((l) => l.fn === next)) layers.push({ fn: next, w: 0, to: 1, fade })
      if (fade <= 0) layers.forEach((l) => (l.w = l.to))
    },
    update(dt, time) {
      mixer.update(dt)
      restoreUntracked()
      for (const l of [...layers]) {
        const step = l.fade > 0 ? dt / l.fade : 1
        l.w = l.to > l.w ? Math.min(l.to, l.w + step) : Math.max(l.to, l.w - step)
        if (l.w > 0) {
          root.updateMatrixWorld(true)
          l.fn(self, THREE.MathUtils.smootherstep(l.w, 0, 1), dt)
        } else if (l.to === 0) layers.splice(layers.indexOf(l), 1)
      }
      // "looking-up" is a looking-around idle; lift his gaze toward the summit on top of it.
      lift += ((current === 'looking-up' ? 1 : 0) - lift) * (1 - Math.exp(-dt / 0.5))
      if (lift > 0.001) {
        neck.rotateX(-fx.mascot.lookUp * 0.4 * lift)
        head.rotateX(-fx.mascot.lookUp * 0.6 * lift)
      }
      rememberPose()
      flick(dt, time)
    },
    topY() {
      head.getWorldPosition(tmp)
      return tmp.y + 0.3 * root.scale.y
    },
    useRenderer(renderer) {
      if (material.envMap) return
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      material.envMap = pmrem.fromScene(room, 0.04).texture
      material.needsUpdate = true
      room.dispose()
      pmrem.dispose()
    },
  }
  return self
}

/**
 * Stretches cut out of clips (seconds, at 1×). toast loses the sip (the glass
 * rising to his mouth and back), so he just stands holding his drink.
 */
const CUTS: Partial<Record<ClipName, [number, number]>> = { toast: [2.43, 7.03] }

/**
 * Removes [a, b] from a looping clip: it plays from b to the end, then on
 * from the start to a (the clip already loops, so that join is seamless).
 * Resampled at 30 fps; the new loop point (a → b) is eased by prepareClip.
 */
function cutOut(clip: THREE.AnimationClip, a: number, b: number) {
  const T = clip.duration
  const D = T - b + a
  const n = Math.round(D * 30) + 1
  const times = Float32Array.from({ length: n }, (_, i) => (i / (n - 1)) * D)
  const source = (t: number) => (t < T - b ? b + t : t - (T - b))
  const tracks = clip.tracks.map((track) => {
    const sample = track.InterpolantFactoryMethodLinear() // quaternion tracks slerp
    const size = track.getValueSize()
    const values = new Float32Array(n * size)
    times.forEach((t, i) => values.set(sample.evaluate(Math.min(T, source(t))), i * size))
    const Track = track.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack
    return new Track(track.name, times, values)
  })
  return new THREE.AnimationClip(clip.name, D, tracks)
}

/**
 * Clips that don't come back to where they started (reaching ends with his
 * arm out). Blending their end into their start would snap the arm back, so
 * they play forward and back instead: reach out, then draw the hand in.
 */
const PING_PONG = new Set<ClipName>(['reaching'])

/**
 * Makes a Mixamo clip behave on the site:
 *  - in place: the hips keep their sway but lose any travel (a few clips walk
 *    off or start offset), so every clip stays centred on his spot;
 *  - seamless: the last `fx.mascot.loopEase` seconds of every track ease
 *    into its first frame, so LoopRepeat wraps without a pop.
 */
function prepareClip(clip: THREE.AnimationClip, restHips: THREE.Vector3, inPlace: boolean, seamless: boolean) {
  const hipsTrack = clip.tracks.find((t) => /Hips\.position$/.test(t.name))
  if (hipsTrack) {
    const rest = restHips.toArray()
    const up = rest.map(Math.abs).indexOf(Math.max(...rest.map(Math.abs)))
    const { times, values } = hipsTrack
    const count = times.length
    for (let axis = 0; axis < 3; axis++) {
      if (axis === up) continue
      const raw = Array.from({ length: count }, (_, i) => values[i * 3 + axis])
      const meanAll = raw.reduce((a, b) => a + b, 0) / count
      for (let i = 0; i < count; i++) {
        // Travel = the slow-moving average over ~1.2s; keep only the sway around it.
        let sum = 0
        let k = 0
        for (let j = 0; j < count; j++) {
          if (Math.abs(times[j] - times[i]) <= 0.6) {
            sum += raw[j]
            k++
          }
        }
        const travel = inPlace ? sum / k : meanAll
        values[i * 3 + axis] = raw[i] - travel + rest[axis]
      }
    }
  }

  if (!seamless) return clip
  const T = clip.duration
  const B = Math.min(fx.mascot.loopEase, T * 0.25)
  const qa = new THREE.Quaternion()
  const qb = new THREE.Quaternion()
  for (const track of clip.tracks) {
    const { times, values } = track
    const size = values.length / times.length
    const first = Array.from(values.slice(0, size))
    for (let i = 0; i < times.length; i++) {
      const t = times[i]
      if (t < T - B) continue
      let w = (t - (T - B)) / B
      w = w * w * (3 - 2 * w)
      if (size === 4) {
        qa.fromArray(values, i * 4)
        qb.fromArray(first)
        if (qa.dot(qb) < 0) qb.set(-qb.x, -qb.y, -qb.z, -qb.w)
        qa.slerp(qb, w).toArray(values, i * 4)
      } else {
        for (let c = 0; c < size; c++) values[i * size + c] += (first[c] - values[i * size + c]) * w
      }
    }
  }
  return clip
}

// ---------------------------------------------------------------------------
// The placeholder: a suited figure in dark hologram, posed per clip
// ---------------------------------------------------------------------------
const FIGURE_VERT = /* glsl */ `
uniform float uGlitch;
uniform float uTime;
varying vec3 vW;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  ${GLITCH}
}`

const FIGURE_FRAG = /* glsl */ `
${HOLO_PARS}
uniform vec3 uBase;
varying vec3 vN;
varying vec3 vV;
void main() {
  ${HOLO_START}
  vec3 n = normalize(vN);
  float ndv = clamp(abs(dot(n, normalize(vV))), 0.0, 1.0);
  // A key light from the camera's upper left and a little ambient: just enough to read the form.
  float diff = max(0.0, dot(n, normalize(vec3(-0.45, 0.7, 0.55))));
  vec3 base = uBase;
  vec3 col = base * (0.25 + 0.75 * diff);
  // A silhouette: the edge carries most of the light.
  col += uRimColor * pow(1.0 - ndv, 2.5) * 0.18;
  ${HOLO_END}
  gl_FragColor = vec4(col, 1.0);
}`

/** Dark tints: a silhouette with just enough colour to read suit, shirt, tie, fur and mane. */
const FIGURE = {
  suit: '#111114',
  trousers: '#0e0e11',
  shirt: '#4a4644',
  tie: '#7a121a',
  fur: '#3a2913',
  muzzle: '#4a3418',
  mane: '#24170a',
  nose: '#0a0705',
  shoe: '#060607',
}

type Joint =
  | 'Hips' | 'Spine' | 'Neck' | 'Head'
  | 'LeftArm' | 'LeftForeArm' | 'LeftHand' | 'RightArm' | 'RightForeArm' | 'RightHand'
  | 'LeftUpLeg' | 'LeftLeg' | 'LeftFoot' | 'RightUpLeg' | 'RightLeg' | 'RightFoot'
type Pose = Partial<Record<Joint, [number, number, number]>> & { hipsY?: number }

const STAND_Y = 0.98
const TAU = Math.PI * 2
/** 0 → 1 → 0 once every `period` seconds, holding at the top for a moment. */
const pulse = (t: number, period: number, offset = 0) => {
  const p = ((t + offset) % period) / period
  return THREE.MathUtils.smoothstep(p, 0.1, 0.3) * (1 - THREE.MathUtils.smoothstep(p, 0.62, 0.82))
}

/** Arms hang a little out from the jacket and bend a touch at the elbow. */
const relaxed = (t: number, sway = 0.02): Pose => ({
  LeftArm: [Math.sin(t * 0.9) * sway, 0, 0.13],
  LeftForeArm: [-0.18, 0, 0],
  RightArm: [Math.sin(t * 0.9 + 1) * sway, 0, -0.13],
  RightForeArm: [-0.18, 0, 0],
  Spine: [Math.sin(t * 1.6) * 0.012, 0, 0],
})

/**
 * One pose per clip, as joint rotations (radians, XYZ). Left is his left, +X;
 * a negative X rotation swings a limb forward.
 */
const POSES: Record<ClipName, (t: number) => Pose> = {
  idle: (t) => ({ ...relaxed(t), Head: [0.04, Math.sin(t * 0.35) * 0.18, 0] }),
  'sitting-idle': (t) => ({
    hipsY: 0.6,
    Spine: [-0.06 + Math.sin(t * 1.4) * 0.01, 0, 0],
    LeftUpLeg: [-1.5, 0, 0.14],
    RightUpLeg: [-1.5, 0, -0.14],
    LeftLeg: [1.42, 0, -0.1],
    RightLeg: [1.42, 0, 0.1],
    LeftArm: [-0.32, 0, 0.32],
    LeftForeArm: [-0.95, 0, 0],
    RightArm: [-0.32, 0, -0.32],
    RightForeArm: [-0.95, 0, 0],
    Head: [0.02, Math.sin(t * 0.3) * 0.22, 0],
  }),
  presenting: (t) => {
    const g = pulse(t, 4.4)
    return {
      ...relaxed(t),
      RightArm: [-0.45 - g * 0.25, 0, -0.32 - g * 0.2],
      RightForeArm: [-1.1, 0, 0.25 + g * 0.2],
      Head: [0, -0.08 + Math.sin(t * 0.5) * 0.08, 0],
    }
  },
  walking: (t) => {
    const w = t * TAU * 0.9
    const s = Math.sin(w)
    return {
      hipsY: STAND_Y - 0.025 * Math.abs(Math.cos(w)),
      LeftUpLeg: [-0.42 * s, 0, 0.02],
      RightUpLeg: [0.42 * s, 0, -0.02],
      LeftLeg: [0.1 + 0.55 * Math.max(0, Math.sin(w - 1.4)), 0, 0],
      RightLeg: [0.1 + 0.55 * Math.max(0, Math.sin(w + Math.PI - 1.4)), 0, 0],
      LeftArm: [0.34 * s, 0, 0.1],
      LeftForeArm: [-0.3, 0, 0],
      RightArm: [-0.34 * s, 0, -0.1],
      RightForeArm: [-0.3, 0, 0],
      Spine: [0.04, Math.sin(w) * 0.05, 0],
    }
  },
  reaching: (t) => {
    const r = Math.sin(t * 0.8) * 0.08
    return {
      ...relaxed(t),
      Spine: [0.08, -0.08, 0],
      RightArm: [-1.3 - r, 0.1, -0.15],
      RightForeArm: [-0.25, 0, 0.05],
      Head: [0.06, -0.06, 0],
    }
  },
  'looking-up': (t) => ({ ...relaxed(t), Neck: [-0.22, 0, 0], Head: [-0.42 + Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.25) * 0.25, 0] }),
  toast: (t) => {
    const d = pulse(t, 5.2)
    return {
      ...relaxed(t),
      LeftArm: [-0.42 - d * 0.35, 0, 0.12 - d * 0.18],
      LeftForeArm: [-1.55 - d * 0.55, 0, -0.3 - d * 0.15],
      Head: [-0.04 - d * 0.18, 0.08, 0],
    }
  },
  typing: (t) => {
    const tap = Math.sin(t * 17) * 0.025
    return {
      ...relaxed(t),
      LeftArm: [-0.3, 0, 0.08],
      LeftForeArm: [-1.25 + tap, 0, -0.5],
      RightArm: [-0.3, 0, -0.08],
      RightForeArm: [-1.25 - tap, 0, 0.5],
      Neck: [0.18, 0, 0],
      Head: [0.32, 0, 0],
    }
  },
  'looking-at-hand': (t) => ({
    ...relaxed(t),
    LeftArm: [-0.4, 0, 0.1],
    LeftForeArm: [-1.45, 0, -0.32],
    Neck: [0.12, 0, 0],
    Head: [0.32, 0.22 + Math.sin(t * 0.6) * 0.04, 0],
  }),
  greeting: (t) => ({
    ...relaxed(t),
    RightArm: [-0.2, 0, -1.25],
    RightForeArm: [-1.2, 0, 0.2 + Math.sin(t * TAU * 0.6) * 0.18],
    Head: [0, -0.1, 0.04],
  }),
}

function placeholderMascot(reduced: boolean): Mascot {
  const uniforms = holoUniforms(reduced)
  const materials = new Map<string, THREE.ShaderMaterial>()
  const mat = (hex: string) => {
    let m = materials.get(hex)
    if (!m) {
      m = new THREE.ShaderMaterial({
        vertexShader: FIGURE_VERT,
        fragmentShader: FIGURE_FRAG,
        // Spread: every material shares the same uniform objects, so the scan and dissolve drive them all.
        uniforms: { ...uniforms, uBase: { value: new THREE.Color(hex) } },
      })
      materials.set(hex, m)
    }
    return m
  }
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat(color))
    m.position.set(x, y, z)
    m.scale.set(sx, sy, sz)
    m.frustumCulled = false
    parent.add(m)
    return m
  }
  /** A limb segment hanging down from its joint. */
  const limb = (parent: THREE.Object3D, length: number, radius: number, color: string) =>
    part(parent, new THREE.CapsuleGeometry(radius, length - radius, 6, 14), color, 0, -length / 2, 0)

  const root = new THREE.Group()
  root.name = 'mascot'
  const joints = new Map<string, THREE.Object3D>()
  const J = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Group()
    o.name = name
    o.position.set(x, y, z)
    parent.add(o)
    joints.set(name, o)
    return o
  }

  // ---- rig: 1.9 m tall, feet at the origin, facing +Z -------------------------
  const hips = J('Hips', root, 0, STAND_Y, 0)
  const spine = J('Spine', hips, 0, 0.08, 0)
  const neck = J('Neck', spine, 0, 0.5, 0)
  const head = J('Head', neck, 0, 0.1, 0)

  // Trousers and the jacket: a tapered torso, broad shoulders, a hem over the hips.
  part(hips, new THREE.CylinderGeometry(0.155, 0.15, 0.2, 24), FIGURE.trousers, 0, -0.02, 0, 1, 1, 0.68)
  part(spine, new THREE.CylinderGeometry(0.2, 0.165, 0.5, 28), FIGURE.suit, 0, 0.22, 0, 1, 1, 0.64)
  part(spine, new THREE.CylinderGeometry(0.17, 0.175, 0.12, 28), FIGURE.suit, 0, -0.06, 0, 1, 1, 0.72)
  part(spine, new THREE.CapsuleGeometry(0.075, 0.32, 6, 14), FIGURE.suit, 0, 0.44, -0.005, 1, 1, 0.85).rotation.z = Math.PI / 2
  // Shirt front in a V, and the tie.
  const front = 0.131
  const shirt = new THREE.Shape([new THREE.Vector2(-0.085, 0.47), new THREE.Vector2(0.085, 0.47), new THREE.Vector2(0, 0.17)])
  part(spine, new THREE.ShapeGeometry(shirt), FIGURE.shirt, 0, 0, front)
  const tie = new THREE.Shape([
    new THREE.Vector2(-0.02, 0.46), new THREE.Vector2(0.02, 0.46), new THREE.Vector2(0.013, 0.425),
    new THREE.Vector2(0.032, 0.2), new THREE.Vector2(0, 0.165), new THREE.Vector2(-0.032, 0.2), new THREE.Vector2(-0.013, 0.425),
  ])
  part(spine, new THREE.ShapeGeometry(tie), FIGURE.tie, 0, 0, front + 0.004)
  part(neck, new THREE.CylinderGeometry(0.052, 0.058, 0.13, 16), FIGURE.fur, 0, 0.02, 0)

  // Head: skull, muzzle, nose, ears, and the mane as angular rays (the emblem's).
  part(head, new THREE.SphereGeometry(0.105, 24, 18), FIGURE.fur, 0, 0.11, 0.01, 1, 1.06, 0.95)
  part(head, new THREE.SphereGeometry(0.058, 18, 12), FIGURE.muzzle, 0, 0.065, 0.085, 1.05, 0.8, 0.9)
  part(head, new THREE.SphereGeometry(0.018, 10, 8), FIGURE.nose, 0, 0.09, 0.14, 1.3, 0.8, 1)
  for (const s of [-1, 1]) part(head, new THREE.SphereGeometry(0.028, 10, 8), FIGURE.fur, s * 0.075, 0.205, -0.005, 1, 1, 0.6)
  part(head, new THREE.SphereGeometry(0.15, 20, 14), FIGURE.mane, 0, 0.09, -0.05, 1.08, 1.12, 0.95)
  // Rays in three rings round the head (face-on, then tipped back), so the mane reads from any side.
  const ray = new THREE.ConeGeometry(0.05, 0.13, 4)
  const up = new THREE.Vector3(0, 1, 0)
  const out = new THREE.Vector3()
  for (const [count, back, reach] of [[12, 0, 0.155], [12, 0.75, 0.16], [8, 1.5, 0.14]] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + (back ? Math.PI / count : 0)
      out.set(Math.sin(a) * Math.cos(back), Math.cos(a) * Math.cos(back), -Math.sin(back)).normalize()
      const long = i % 2 === 0 ? 1.15 : 0.9
      const m = part(head, ray, FIGURE.mane, out.x * reach, 0.1 + out.y * reach, -0.03 + out.z * reach, 1, long, 0.6)
      m.quaternion.setFromUnitVectors(up, out)
    }
  }

  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    const arm = J(side + 'Arm', spine, s * 0.205, 0.43, 0)
    limb(arm, 0.3, 0.056, FIGURE.suit)
    const fore = J(side + 'ForeArm', arm, 0, -0.3, 0)
    limb(fore, 0.26, 0.048, FIGURE.suit)
    part(fore, new THREE.CylinderGeometry(0.044, 0.044, 0.03, 14), FIGURE.shirt, 0, -0.255, 0)
    const hand = J(side + 'Hand', fore, 0, -0.28, 0)
    part(hand, new THREE.SphereGeometry(0.046, 14, 10), FIGURE.fur, 0, -0.045, 0, 0.78, 1.15, 0.6)
    J(side + 'HandIndex1', hand, 0, -0.085, 0.012)

    const up = J(side + 'UpLeg', hips, s * 0.095, -0.04, 0)
    limb(up, 0.45, 0.074, FIGURE.trousers)
    const leg = J(side + 'Leg', up, 0, -0.45, 0)
    limb(leg, 0.45, 0.06, FIGURE.trousers)
    const foot = J(side + 'Foot', leg, 0, -0.45, 0)
    part(foot, new THREE.BoxGeometry(0.1, 0.07, 0.27), FIGURE.shoe, 0, -0.005, 0.06)
  }

  // ---- the label ---------------------------------------------------------------
  const cv = document.createElement('canvas')
  cv.width = 640
  cv.height = 96
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const drawLabel = () => {
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, cv.width, cv.height)
    g.strokeStyle = fx.palette.red
    g.lineWidth = 3
    g.beginPath()
    g.roundRect(4, 4, cv.width - 8, cv.height - 8, 44)
    g.stroke()
    g.fillStyle = fx.palette.red
    g.beginPath()
    g.arc(52, cv.height / 2, 9, 0, TAU)
    g.fill()
    g.fillStyle = fx.palette.white
    g.font = '500 36px "JetBrains Mono", ui-monospace, monospace'
    g.textBaseline = 'middle'
    g.fillText('LION.GLB PENDING', 84, cv.height / 2 + 2)
    tex.needsUpdate = true
  }
  drawLabel()
  void document.fonts?.ready.then(drawLabel)
  const labelMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(0.55, 0.55, 0.55) })
  const label = new THREE.Sprite(labelMat)
  label.scale.set(0.6, 0.09, 1)
  root.add(label)

  // ---- posing --------------------------------------------------------------------
  let current: ClipName | null = null
  let snap = true
  const rest = new Map<string, THREE.Euler>()
  joints.forEach((j, name) => rest.set(name, j.rotation.clone()))
  const tmp = new THREE.Vector3()
  const flick = flicker(uniforms, reduced)
  let clock = 0

  function pose(dt: number) {
    if (!current) return
    const target = POSES[current](reduced ? 0 : clock)
    const k = snap ? 1 : 1 - Math.exp(-dt / 0.16)
    snap = false
    joints.forEach((j, name) => {
      const want = target[name as Joint]
      const r = rest.get(name)!
      j.rotation.x += ((want ? want[0] : r.x) - j.rotation.x) * k
      j.rotation.y += ((want ? want[1] : r.y) - j.rotation.y) * k
      j.rotation.z += ((want ? want[2] : r.z) - j.rotation.z) * k
    })
    hips.position.y += ((target.hipsY ?? STAND_Y) - hips.position.y) * k
    root.updateMatrixWorld(true)
    // The label floats over his head, whatever the pose.
    head.getWorldPosition(tmp)
    root.worldToLocal(tmp)
    label.position.set(tmp.x, tmp.y + 0.42, tmp.z)
    labelMat.opacity = uniforms.uMaterialize.value * (1 - uniforms.uDissolve.value)
  }

  return {
    root,
    uniforms,
    placeholder: true,
    get current() {
      return current
    },
    play(name, fade = 0.6) {
      if (current === name) return
      current = name
      if (fade <= 0) snap = true
    },
    boneWorld(name, out) {
      const j = joints.get(name)
      if (!j) return root.getWorldPosition(out)
      return j.getWorldPosition(out)
    },
    bone: (name) => joints.get(name),
    update(dt, time) {
      clock += dt
      pose(dt)
      flick(dt, time)
    },
    topY() {
      head.getWorldPosition(tmp)
      return tmp.y + 0.3 * root.scale.y
    },
    useRenderer() {},
    setOverlay() {},
  }
}
