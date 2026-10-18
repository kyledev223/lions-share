import * as THREE from 'three'
import { PoseMemory, setWorldQuaternion, SIDES, twoBone } from './ik'
import type { Mascot, PoseOverlay } from './mascot'

/** The held pose on screen 10: the coin raised in his right fist, like a trophy. */
export const TROPHY = {
  /** Where the right wrist goes, in his own frame (x = his left, y up, z forward; m): out to his right, at head height. */
  wrist: [-0.4, 1.63, 0.12] as [number, number, number],
  /** Where the elbow points, from the shoulder (his frame, m): out to his right, down and a little back. */
  elbow: [-0.6, -0.35, -0.05] as [number, number, number],
  /** The fist: fingers on along the forearm, tipped back this much at the wrist (radians); the palm faces
   *  between his head (0) and straight forward (π/2). */
  wristBack: 0.12,
  palmForward: 1.35,
  /** Per finger joint, added to the clip's relaxed curl: a closed fist round the coin. */
  curl: [1.15, 1.35, 0.9],
  /** Share of the hand's roll the forearm takes, so the wrist doesn't wring. */
  forearmShare: 0.5,
  /** Fist drift (m): a few millimetres, slow. */
  drift: 0.003,
  /** Right collarbone lifted with the raised arm (radians). */
  shoulderUp: 0.12,

  /** Body: weight on his left leg, his left hip out and up; the spine counters it so the shoulders stay level. */
  hipShift: 0.028,
  hipTilt: 0.05,
  hipDrop: 0.008,
  spineCounter: [-0.03, -0.025, -0.012],
  /** Chest out (upper spine extended) and shoulders back (radians). */
  chestOut: [0.0, -0.035, -0.04],
  shoulderBack: 0.07,
  /** A little of the turn toward the coin taken by the chest (radians, about the vertical). */
  chestTurn: 0.08,

  /** Look-at: share of the turn the neck takes, then how much of the rest the head takes. */
  neckLook: 0.4,
  headLook: 0.9,
  /** The most he turns his head from straight ahead (radians), and how far up or down he may look. */
  yawLimit: 1.0,
  pitchUp: 0.42,
  pitchDown: 0.12,
  /** Chin lift on top of the gaze (radians). */
  chin: 0.07,
  /** Every [a, b] seconds he turns to the camera: over `turn` seconds, holds `hold` seconds, turns back. */
  glanceEvery: [6, 9] as [number, number],
  turn: 1.1,
  hold: 2.2,

  /** Breathing, on a body otherwise held at the idle clip's average (its slow sway left out): seconds per breath,
   *  the chest's lift (radians, upper spine) and the shoulders' (radians). */
  breath: 4.6,
  breathChest: 0.014,
  breathShoulders: 0.012,
}

/** The coin: its radius (m), and its centre in the right hand's frame (+Y down the fingers, +Z out of the palm). */
export const COIN = {
  radius: 0.1,
  at: new THREE.Vector3(-0.012, 0.118, -0.035),
}

const UP = new THREE.Vector3(0, 1, 0)
const FACE = new THREE.Vector3(0, 0, 1) // the Head bone's face direction (local +Z)
/** The bones the layer sets: held at the idle's average pose, then posed (the arm and the gaze are solved over it). */
const STILL = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  ...SIDES.flatMap(([s]) => [`${s}Shoulder`, `${s}Arm`, `${s}ForeArm`, `${s}Hand`, `${s}HandIndex1`, `${s}HandIndex2`, `${s}HandIndex3`]),
  ...SIDES.flatMap(([s]) => [`${s}UpLeg`, `${s}Leg`, `${s}Foot`, `${s}ToeBase`]),
]
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _s = new THREE.Vector3()

/** A clip's average pose for `names`: each bone's mean local rotation (hemisphere-aligned), plus the hips' mean position. */
function meanPose(m: Mascot, clip: THREE.AnimationClip, names: string[]) {
  const rot = new Map<THREE.Object3D, THREE.Quaternion>()
  for (const n of names) {
    const b = m.bone(n)
    const v = b && clip.tracks.find((t) => t.name === `${b.name}.quaternion`)?.values
    if (!b || !v) continue
    const q = new THREE.Quaternion()
    const ref = new THREE.Quaternion().fromArray(v, 0)
    for (let i = 0; i < v.length; i += 4) {
      const k = ref.x * v[i] + ref.y * v[i + 1] + ref.z * v[i + 2] + ref.w * v[i + 3] < 0 ? -1 : 1
      q.set(q.x + v[i] * k, q.y + v[i + 1] * k, q.z + v[i + 2] * k, q.w + v[i + 3] * k)
    }
    rot.set(b, q.normalize())
  }
  const hips = m.bone('Hips')
  const p = hips && clip.tracks.find((t) => t.name === `${hips.name}.position`)?.values
  let hipsAt: THREE.Vector3 | null = null
  if (p) {
    hipsAt = new THREE.Vector3()
    for (let i = 0; i < p.length; i += 3) hipsAt.x += p[i], hipsAt.y += p[i + 1], hipsAt.z += p[i + 2]
    hipsAt.multiplyScalar(3 / p.length)
  }
  return { rot, hipsAt }
}

/** The coin's centre (world), from his right hand. */
export function coinPoint(m: Mascot, out: THREE.Vector3) {
  const hand = m.bone('RightHand')
  if (!hand || m.placeholder) {
    m.boneWorld('RightHand', out)
    return out.setY(out.y + 0.12)
  }
  hand.updateWorldMatrix(true, false)
  hand.matrixWorld.decompose(out, _q, _s)
  return out.add(_s.copy(COIN.at).multiplyScalar(m.root.scale.x).applyQuaternion(_q))
}

/**
 * Holds the coin up in his right fist over the idle clip, held at its
 * average pose with a slow breath of its own: upper arm out to his side, elbow bent about 90°, fist at head
 * height clear of his mane; weight on his left leg with the hip out, chest
 * up, shoulders back. He looks at the coin, chin up, and every 6–9 s turns
 * slowly to the camera for a couple of seconds and back. `viewer` is an
 * object kept at the camera.
 */
export function trophyPose(viewer: THREE.Object3D, reduced: boolean): PoseOverlay {
  const P = TROPHY
  const memory = new PoseMemory()
  let clock = 0
  let nextGlance = 5 + Math.random() * 2
  let glanceT = -1
  const rootQ = new THREE.Quaternion()
  const fkFore = new THREE.Quaternion()
  const fkHand = new THREE.Quaternion()
  const coin = new THREE.Vector3()
  let still: ReturnType<typeof meanPose> | null = null

  return (m, weight, dt) => {
    const bone = (n: string) => m.bone(n)!
    clock += dt
    const hips = bone('Hips')
    memory.begin(STILL.map(bone).filter(Boolean), hips)

    // ---- a still body: the idle's average pose, without its slow sway ---------------------
    const clip = m.clip('idle')
    if (clip && !still) still = meanPose(m, clip, STILL)
    if (still) {
      still.rot.forEach((q, b) => b.quaternion.copy(q))
      if (still.hipsAt) hips.position.copy(still.hipsAt)
      m.root.updateMatrixWorld(true)
    }

    m.root.getWorldQuaternion(rootQ)
    const toWorld = (x: number, y: number, z: number) => m.root.localToWorld(new THREE.Vector3(x, y, z))
    const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(rootQ)
    const fwd = dir(0, 0, 1)
    const hisLeft = dir(1, 0, 0)

    // ---- weight on his left leg: hips out to his left and tipped, feet planted ------------
    const feet = SIDES.map(([s]) => ({
      at: bone(`${s}Foot`).getWorldPosition(new THREE.Vector3()),
      q: bone(`${s}Foot`).getWorldQuaternion(new THREE.Quaternion()),
      knee: bone(`${s}Leg`).getWorldPosition(new THREE.Vector3()),
    }))
    const hipAt = hips.getWorldPosition(new THREE.Vector3()).addScaledVector(hisLeft, P.hipShift).addScaledVector(UP, -P.hipDrop)
    hips.position.copy(hips.parent!.worldToLocal(hipAt))
    hips.getWorldQuaternion(_q).premultiply(_r.setFromAxisAngle(fwd, P.hipTilt))
    setWorldQuaternion(hips, _q)
    SIDES.forEach(([s, sign], i) => {
      const f = feet[i]
      // Knees forward; the free (right) knee eases in a touch.
      const pole = f.knee.clone().addScaledVector(fwd, 0.5).addScaledVector(hisLeft, sign < 0 ? 0.08 : 0)
      twoBone(bone(`${s}UpLeg`), bone(`${s}Leg`), bone(`${s}Foot`), f.at, pole)
      setWorldQuaternion(bone(`${s}Foot`), f.q)
    })

    // ---- spine: counter the tilt, chest out, a little turn toward the coin -----------------
    ;['Spine', 'Spine1', 'Spine2'].forEach((n, j) => {
      const b = bone(n)
      b.getWorldQuaternion(_q)
      _q.premultiply(_r.setFromAxisAngle(fwd, P.spineCounter[j]))
      _q.premultiply(_r.setFromAxisAngle(hisLeft, P.chestOut[j]))
      _q.premultiply(_r.setFromAxisAngle(UP, -P.chestTurn / 3))
      setWorldQuaternion(b, _q)
    })
    // Shoulders back; the right collarbone lifts with the raised arm. Breathing: the chest and shoulders rise a little.
    const breath = reduced ? 0 : 0.5 - 0.5 * Math.cos((clock / P.breath) * Math.PI * 2)
    ;['Spine1', 'Spine2'].forEach((n) => {
      const b = bone(n)
      setWorldQuaternion(b, b.getWorldQuaternion(_q).premultiply(_r.setFromAxisAngle(hisLeft, -P.breathChest * breath)))
    })
    SIDES.forEach(([s, sign]) => {
      const sh = bone(`${s}Shoulder`)
      sh.getWorldQuaternion(_q).premultiply(_r.setFromAxisAngle(UP, sign * P.shoulderBack))
      _q.premultiply(_r.setFromAxisAngle(fwd, sign * P.breathShoulders * breath))
      if (sign < 0) _q.premultiply(_r.setFromAxisAngle(fwd, -P.shoulderUp))
      setWorldQuaternion(sh, _q)
    })

    // ---- the raised arm: two-bone IK to the wrist target -------------------------------
    const arm = bone('RightArm')
    const fore = bone('RightForeArm')
    const hand = bone('RightHand')
    fore.getWorldQuaternion(fkFore)
    hand.getWorldQuaternion(fkHand)
    // The fist holds its place in his frame (the elbow takes up his breathing), with a slow drift of a few mm.
    const t = reduced ? 0 : clock
    const wrist = toWorld(
      P.wrist[0] + Math.sin(t * 0.61) * P.drift,
      P.wrist[1] + Math.sin(t * 0.47 + 1) * P.drift,
      P.wrist[2] + Math.sin(t * 0.37 + 2) * P.drift * 0.6,
    )
    const shoulderW = arm.getWorldPosition(new THREE.Vector3())
    const pole = shoulderW.clone().add(dir(...P.elbow))
    twoBone(arm, fore, hand, wrist, pole)

    // ---- the fist: fingers on along the forearm, palm toward his head and forward ----------
    const forearm = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize()
    const palmWant = hisLeft.clone().multiplyScalar(Math.cos(P.palmForward)).addScaledVector(fwd, Math.sin(P.palmForward))
    const along = forearm.clone().addScaledVector(palmWant, -Math.sin(P.wristBack)).normalize()
    const palm = palmWant.addScaledVector(along, -palmWant.dot(along)).normalize()
    _m.makeBasis(new THREE.Vector3().crossVectors(along, palm), along, palm)
    const handQ = new THREE.Quaternion().setFromRotationMatrix(_m)
    // Share the hand's roll (relative to the clip's) with the forearm, so the wrist doesn't wring.
    fore.getWorldQuaternion(_q)
    const relClip = fkFore.clone().invert().multiply(fkHand)
    const relNow = _q.clone().invert().multiply(handQ)
    const d = relClip.invert().multiply(relNow)
    const twist = new THREE.Quaternion(0, d.y, 0, d.w).normalize()
    setWorldQuaternion(fore, _q.multiply(_q2.identity().slerp(twist, P.forearmShare)))
    setWorldQuaternion(hand, handQ)
    ;[1, 2, 3].forEach((k, j) => {
      const f = bone(`RightHandIndex${k}`)
      f.rotateX(P.curl[j])
      f.updateMatrixWorld(true)
    })

    // ---- the gaze: on the coin, chin up; now and then a slow turn to the camera ------------
    let glance = 0
    if (!reduced) {
      if (glanceT < 0 && clock > nextGlance) glanceT = 0
      if (glanceT >= 0) {
        glanceT += dt
        const back = P.turn + P.hold
        glance = THREE.MathUtils.smootherstep(glanceT, 0, P.turn) * (1 - THREE.MathUtils.smootherstep(glanceT, back, back + P.turn))
        if (glanceT > back + P.turn) {
          glanceT = -1
          nextGlance = clock + P.glanceEvery[0] + Math.random() * (P.glanceEvery[1] - P.glanceEvery[0])
        }
      }
    }
    coinPoint(m, coin)
    const head = bone('Head')
    const at = head.getWorldPosition(new THREE.Vector3())
    // Blend the two directions (not the two points), so the turn sweeps evenly between them.
    const toCoin = coin.clone().sub(at).normalize()
    const toViewer = viewer.position.clone().sub(at).normalize()
    const want = toCoin.lerp(toViewer, glance).normalize()
    // Within a natural range: yaw from his forward, pitch up or down; then the chin lift.
    const yaw = THREE.MathUtils.clamp(Math.atan2(want.dot(hisLeft), want.dot(fwd)), -P.yawLimit, P.yawLimit)
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(want.y, -1, 1)), -P.pitchDown, P.pitchUp) + P.chin
    want.copy(fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(hisLeft, Math.sin(yaw)).multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch))
    const look = (b: THREE.Object3D, share: number) => {
      const face = FACE.clone().applyQuaternion(head.getWorldQuaternion(_q2))
      _q.setFromUnitVectors(face, want)
      _r.identity().slerp(_q, share)
      b.getWorldQuaternion(_q2).premultiply(_r)
      setWorldQuaternion(b, _q2)
    }
    look(bone('Neck'), P.neckLook)
    look(head, P.headLook)

    memory.end(weight)
  }
}
