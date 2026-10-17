import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { fx } from '../fx-config'
import { shared } from './points'

/**
 * The crow: one rigged model (public/assets/crow/crow.glb, built by
 * `npm run crow`) with all ten clips on one mixer. There is a single crow;
 * each screen borrows him (engine.ts reparents him into the active scene)
 * and the clips crossfade on the way.
 *
 * Shading: PBR (three's standard material) on his baked colour, AO and
 * roughness maps, so feathers, fabric and the tie's sheen read. A key and a
 * fill light follow the camera, a cool back light picks out his outline, and
 * a soft room environment gives the shoes, beak and tie their reflections.
 * His lit surface is held under the bloom threshold, so his face and shirt
 * stay crisp; only the hologram's own glow blooms.
 *
 * Hologram, on top and lighter than before: faint horizontal bands drifting
 * up, a blue fresnel rim, legs that fade into the floor glow, a flicker
 * every few seconds, a top-to-bottom scan when he materialises, and a
 * dissolve when he leaves.
 */
export type ClipName =
  | 'idle'
  | 'sitting-idle'
  | 'clapping'
  | 'walking'
  | 'reaching'
  | 'looking-up'
  | 'toast'
  | 'typing'
  | 'looking-at-hand'
  | 'waving'

const VERT_PARS = /* glsl */ `
uniform float uGlitch;
uniform float uTime;
varying vec3 vW;`

const VERT_MAIN = /* glsl */ `
#include <project_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
if (uGlitch > 0.0) {
  float band = floor(vW.y * 9.0 + floor(uTime * 20.0) * 3.1);
  float tear = step(0.6, fract(sin(band * 12.9898) * 43758.5453));
  mvPosition.x += (fract(sin(band * 78.233) * 12345.678) - 0.5) * 0.5 * tear * uGlitch;
  gl_Position = projectionMatrix * mvPosition;
}`

const FRAG_PARS = /* glsl */ `
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

// Materialise: a scan line sweeps from the crown down to the soles. Dissolve: pixels drop out.
const FRAG_START = /* glsl */ `
float holoSpan = uTopY - uFloorY + 0.25;
float holoFront = uTopY + 0.05 - uMaterialize * holoSpan;
if (vW.y < holoFront) discard;
if (uDissolve > 0.0 && holoHash(floor(vW.xy * 160.0) + floor(vW.z * 40.0)) < uDissolve) discard;
#include <clipping_planes_fragment>`

// Baked AO also darkens direct light a little, so folds and feathers keep their depth under the key light.
const FRAG_AO = /* glsl */ `
#include <map_fragment>
#ifdef USE_AOMAP
  diffuseColor.rgb *= mix(1.0, texture2D(aoMap, vAoMapUv).r, uAoDirect);
#endif`

const FRAG_END = /* glsl */ `
{
  vec3 col = outgoingLight;
  // Soft ceiling under the bloom threshold: his lit surface never blooms.
  float m = max(col.r, max(col.g, col.b));
  float knee = uCeiling * 0.7;
  if (m > knee) col *= (knee + (uCeiling - knee) * (1.0 - exp(-(m - knee) / (uCeiling - knee)))) / m;

  float y = vW.y;
  float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
  float fres = pow(1.0 - ndv, uRimPower);
  // Blue-black feathers keep a hint of blue toward their edges.
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
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

  outgoingLight = col * uOpacity;
}
#include <opaque_fragment>`

/** A standard (PBR) material with the hologram patched in. */
function holoMaterial(src: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>) {
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
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${VERT_PARS}\nvoid main() {`).replace('#include <project_vertex>', VERT_MAIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${FRAG_PARS}\nvoid main() {`)
      .replace('#include <clipping_planes_fragment>', FRAG_START)
      .replace('#include <map_fragment>', FRAG_AO)
      .replace('#include <opaque_fragment>', FRAG_END)
  }
  mat.customProgramCacheKey = () => 'crow-holo'
  return mat
}

export interface Crow {
  root: THREE.Group
  mesh: THREE.SkinnedMesh
  uniforms: Record<string, THREE.IUniform>
  bone(name: string): THREE.Bone
  play(name: ClipName, fade?: number): void
  current: ClipName | null
  /** Hangs something off a bone; returns a function that takes it off again. */
  attach(boneName: string, obj: THREE.Object3D, offset: THREE.Vector3, rotation?: THREE.Euler): () => void
  /** World position of a bone (Mixamo name without the prefix, e.g. "LeftHand"). */
  boneWorld(name: string, out: THREE.Vector3): THREE.Vector3
  update(dt: number, time: number): void
  /** World height of his crown (for the scan). */
  topY(): number
  /** Builds his reflection environment; needs the renderer, so the engine calls it once. */
  useRenderer(renderer: THREE.WebGLRenderer): void
}

/** Rough size of crow.glb, for progress when the server sends no Content-Length (compressed responses). */
const EXPECTED_BYTES = 4.6e6

/** `onProgress` gets 0–1 as the .glb downloads. */
export async function loadCrow(url: string, reduced: boolean, onProgress?: (fraction: number) => void): Promise<Crow> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url, (e) => onProgress?.(Math.min(1, e.loaded / (e.lengthComputable && e.total ? e.total : EXPECTED_BYTES))))
  onProgress?.(1)

  const root = new THREE.Group()
  root.name = 'crow'
  root.add(gltf.scene)
  let mesh: THREE.SkinnedMesh | null = null
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh
  })
  if (!mesh) throw new Error('crow.glb has no skinned mesh')
  const skinned = mesh as THREE.SkinnedMesh
  const source = skinned.material as THREE.MeshStandardMaterial
  for (const t of [source.map, source.roughnessMap, source.aoMap]) if (t) t.anisotropy = 8

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: shared.uTime,
    uRim: { value: fx.holo.rim },
    uRimPower: { value: fx.holo.rimPower },
    uRimColor: { value: new THREE.Color(fx.palette.blue).multiplyScalar(1.1) },
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
  const material = holoMaterial(source, uniforms)
  skinned.material = material
  source.dispose()
  // Animated far from his bind pose, the rest-pose bounds would cull him by mistake.
  skinned.frustumCulled = false

  // ---- lights: key and fill ride with the camera, a cool back light outlines him ----
  const key = new THREE.DirectionalLight(0xfff4ea, fx.holo.key)
  const fill = new THREE.DirectionalLight(0xdbe6ff, fx.holo.fill)
  const back = new THREE.DirectionalLight(0xc4d6ff, fx.holo.back)
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

  // ---- clips ------------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const clips = new Map<string, THREE.AnimationClip>()
  for (const clip of gltf.animations) clips.set(clip.name, prepareClip(clip, hips.position.clone(), clip.name !== 'sitting-idle'))
  const actions = new Map<string, THREE.AnimationAction>()
  let current: ClipName | null = null

  function play(name: ClipName, fade = 0.6) {
    if (current === name) return
    const clip = clips.get(name)
    if (!clip) return console.warn(`crow.glb has no clip "${name}"`)
    let next = actions.get(name)
    if (!next) {
      next = mixer.clipAction(clip)
      next.setLoop(THREE.LoopRepeat, Infinity)
      actions.set(name, next)
    }
    const prev = current ? actions.get(current) : null
    next.reset().setEffectiveWeight(1).play()
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, true)
    else actions.forEach((a) => a !== next && a.stop())
    current = name
  }

  // ---- flicker ---------------------------------------------------------------
  let nextFlicker = 2 + Math.random() * fx.holo.flickerEvery
  let flickerT = -1

  const tmp = new THREE.Vector3()
  return {
    root,
    mesh: skinned,
    uniforms,
    get current() {
      return current
    },
    bone: (name) => bones.get(name)!,
    boneWorld: (name, out) => bones.get(name)!.getWorldPosition(out),
    play,
    attach(boneName, obj, offset, rotation) {
      const b = bones.get(boneName)!
      b.updateWorldMatrix(true, false)
      const s = b.getWorldScale(tmp).x / root.getWorldScale(new THREE.Vector3()).x
      obj.scale.setScalar(1 / s)
      obj.position.copy(offset).multiplyScalar(1 / s)
      if (rotation) obj.rotation.copy(rotation)
      b.add(obj)
      return () => b.remove(obj)
    },
    update(dt, time) {
      mixer.update(dt)
      if (reduced) return
      // A flicker every few seconds: two quick dips.
      if (time > nextFlicker && flickerT < 0) flickerT = 0
      if (flickerT >= 0) {
        flickerT += dt
        const f = flickerT < 0.06 ? 1 : flickerT < 0.11 ? 0.15 : flickerT < 0.16 ? 0.8 : 0
        uniforms.uFlicker.value = f * fx.holo.flicker
        if (flickerT > 0.18) {
          flickerT = -1
          uniforms.uFlicker.value = 0
          nextFlicker = time + fx.holo.flickerEvery * (0.5 + Math.random())
        }
      }
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
}

/**
 * Makes a Mixamo clip behave on the site:
 *  - in place: the hips keep their sway but lose any travel (a few clips walk
 *    off or start offset), so every clip stays centred on his spot;
 *  - seamless: the last half second of every track blends into its first
 *    frame, so LoopRepeat wraps without a pop.
 */
function prepareClip(clip: THREE.AnimationClip, restHips: THREE.Vector3, inPlace: boolean) {
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

  const T = clip.duration
  const B = Math.min(0.5, T * 0.25)
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
