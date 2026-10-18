import * as THREE from 'three'
import { PoseMemory, setWorldQuaternion } from './ik'
import type { Mascot, PoseOverlay } from './mascot'

/** The executive stride on screen 12: the walking clip, toward the viewer, composed. */
const STRIDE = {
  /** Share of the clip's arm swing kept, around the swing's average pose (0.7 = 30% less swing). */
  armSwing: 0.7,
  /** Chest lifted (the upper spine eased back) and shoulders drawn back (radians). */
  chestUp: 0.05,
  shouldersBack: 0.07,
  /** Gaze: share of the turn toward the viewer taken, and how much of that the neck takes (the head the rest). */
  look: 0.92,
  neckShare: 0.35,
  /** Chin level: the gaze tilts at most this far toward the viewer (radians); the camera is below his eyes. */
  pitchLimit: 0.12,
  /**
   * Seconds the gaze correction is smoothed over. Longer than a step, so only the average error is taken
   * out and the walk's own head motion stays on top of it.
   */
  lookLag: 0.9,
}

const ARMS = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']
const UP = new THREE.Vector3(0, 1, 0)
const FACE = new THREE.Vector3(0, 0, 1) // the Head bone's face direction (local +Z)
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** The average local rotation of a bone over a clip (hemisphere-aligned, normalised). */
function meanRotation(clip: THREE.AnimationClip, boneName: string) {
  const track = clip.tracks.find((t) => t.name === `${boneName}.quaternion`)
  if (!track) return null
  const v = track.values
  const ref = new THREE.Quaternion().fromArray(v, 0)
  const sum = new THREE.Vector4()
  for (let i = 0; i < v.length; i += 4) {
    const s = ref.x * v[i] + ref.y * v[i + 1] + ref.z * v[i + 2] + ref.w * v[i + 3] < 0 ? -1 : 1
    sum.x += v[i] * s
    sum.y += v[i + 1] * s
    sum.z += v[i + 2] * s
    sum.w += v[i + 3] * s
  }
  return new THREE.Quaternion(sum.x, sum.y, sum.z, sum.w).normalize()
}

const yawOf = (v: THREE.Vector3) => Math.atan2(v.x, v.z)
const pitchOf = (v: THREE.Vector3) => Math.asin(THREE.MathUtils.clamp(v.y, -1, 1))
const fromYawPitch = (yaw: number, pitch: number, out: THREE.Vector3) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))

/**
 * Over the walking clip: the arm swing eased toward its average, chest up and
 * shoulders back, and the head turned to the viewer with the chin level.
 * `viewer` is where he looks (the stage camera's spot).
 */
export function stridePose(viewer: THREE.Vector3): PoseOverlay {
  const S = STRIDE
  const memory = new PoseMemory()
  const means = new Map<string, THREE.Quaternion>()
  let meansFrom: THREE.AnimationClip | null = null
  // The smoothed gaze correction (radians), measured on the clip's pose each frame.
  let yawFix = 0
  let pitchFix = 0
  let fresh = true
  const rootQ = new THREE.Quaternion()

  const turnWorld = (b: THREE.Object3D, axis: THREE.Vector3, angle: number) => {
    b.getWorldQuaternion(_q).premultiply(_r.setFromAxisAngle(axis, angle))
    setWorldQuaternion(b, _q)
  }

  return (m: Mascot, weight, dt) => {
    const bone = (n: string) => m.bone(n)
    const clip = m.clip('walking')
    if (clip && clip !== meansFrom) {
      meansFrom = clip
      for (const name of ARMS) {
        const b = bone(name)
        const q = b && meanRotation(clip, b.name)
        if (q) means.set(name, q)
      }
    }
    const touched = ['Spine2', 'LeftShoulder', 'RightShoulder', ...ARMS, 'Neck', 'Head'].map(bone).filter((b): b is THREE.Object3D => !!b)
    memory.begin(touched)

    // ---- arm swing: each arm bone eased toward its average over the clip --------------------
    for (const name of ARMS) {
      const b = bone(name)
      const mean = means.get(name)
      if (b && mean) b.quaternion.copy(_q.copy(mean).slerp(b.quaternion, S.armSwing))
    }
    m.root.updateMatrixWorld(true)

    // ---- chest up, shoulders back -------------------------------------------------------------
    m.root.getWorldQuaternion(rootQ)
    const hisRight = _a.set(-1, 0, 0).applyQuaternion(rootQ)
    const chest = bone('Spine2')
    if (chest) turnWorld(chest, hisRight, S.chestUp)
    const left = bone('LeftShoulder')
    const right = bone('RightShoulder')
    if (left) turnWorld(left, UP, S.shouldersBack)
    if (right) turnWorld(right, UP, -S.shouldersBack)

    // ---- gaze: to the viewer, chin level, smoothed so the walk's head motion stays ---------------
    const head = bone('Head')
    const neck = bone('Neck')
    if (head && neck) {
      const at = head.getWorldPosition(new THREE.Vector3())
      const face = FACE.clone().applyQuaternion(head.getWorldQuaternion(_q2))
      const want = viewer.clone().sub(at).normalize()
      const wantPitch = THREE.MathUtils.clamp(pitchOf(want), -S.pitchLimit, S.pitchLimit)
      let yawErr = yawOf(want) - yawOf(face)
      yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr))
      const pitchErr = wantPitch - pitchOf(face)
      const k = fresh ? 1 : 1 - Math.exp(-dt / S.lookLag)
      fresh = false
      yawFix += (yawErr - yawFix) * k
      pitchFix += (pitchErr - pitchFix) * k
      // Where the head ends up: the clip's own facing, turned by the smoothed correction.
      const aim = fromYawPitch(yawOf(face) + yawFix * S.look, pitchOf(face) + pitchFix * S.look, _b)
      _r.setFromUnitVectors(face, aim)
      neck.getWorldQuaternion(_q).premultiply(_q2.identity().slerp(_r, S.neckShare))
      setWorldQuaternion(neck, _q)
      const face2 = FACE.clone().applyQuaternion(head.getWorldQuaternion(_q2))
      _r.setFromUnitVectors(face2, aim)
      head.getWorldQuaternion(_q).premultiply(_r)
      setWorldQuaternion(head, _q)
    }

    memory.end(weight)
  }
}
