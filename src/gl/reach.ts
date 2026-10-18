import * as THREE from 'three'
import { AnchoredFrame, PoseMemory, setWorldQuaternion, twoBone } from './ik'
import type { PoseOverlay } from './mascot'

/** The held reach on screen 06: "this one is for you". */
const REACH = {
  /** How far the wrist reaches from the shoulder, as a share of the arm's length: mostly straight, never locked. */
  extend: 0.92,
  /** Where the hand heads: at the viewer, then this much lower and out toward his right (m). */
  aimDrop: 0.36,
  aimOut: 0.3,
  /** Right shoulder brought forward (radians). */
  shoulderForward: 0.14,
  /** The open hand: palm down, turned in toward his middle this much (radians), so the thumb side is up and the fingers
   *  point at the viewer; fingers lifted a touch at the wrist; together, with a gentle curve per joint. */
  palmIn: 2.5,
  fingersUp: 0.14,
  /** Fingers angle out toward his right from straight at the viewer (radians), so their length shows rather than the knuckles end-on. */
  fingersOut: 0.6,
  /** Per finger joint, from the clip's relaxed curl: negative straightens (kept small, within a natural range). */
  curl: [-0.18, -0.22, -0.15],
  /** Share of the hand's roll the forearm takes, so the wrist doesn't wring and the paw keeps its shape. */
  forearmShare: 0.5,
  /** Hand drift (m): a few millimetres, slow. */
  drift: 0.002,
  /** Look-at: share of the turn the neck takes, then how much of the rest the head takes. */
  neckLook: 0.4,
  headLook: 0.88,
  /** Chin level: how far the gaze may tilt up or down toward the viewer (radians). */
  pitchLimit: 0.12,
  /** A small nod every [a, b] seconds, this deep (radians), over this long (s). */
  nodEvery: [7, 11] as [number, number],
  nod: 0.06,
  nodLen: 1.5,
}

const ARM = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3']
const LOOK = ['Neck', 'Head']
const UP = new THREE.Vector3(0, 1, 0)
const FACE = new THREE.Vector3(0, 0, 1) // the Head bone's face direction (local +Z)
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _m = new THREE.Matrix4()

/**
 * Holds his right arm out toward the viewer, over the idle clip (breathing
 * and torso stay), with his head turned to the viewer. `viewer` is an empty
 * object at the camera's spot in the scene; the frame it gives travels with
 * him on the way out, so the arm lowers toward where it was reaching.
 */
export function reachPose(viewer: THREE.Object3D, reduced: boolean): PoseOverlay {
  const R = REACH
  const memory = new PoseMemory()
  const frame = new AnchoredFrame(viewer)
  let clock = 0
  let nextNod = 4 + Math.random() * 3
  let nodT = -1
  const rootQ = new THREE.Quaternion()
  const fkFore = new THREE.Quaternion()
  const fkHand = new THREE.Quaternion()
  // The shoulder, smoothed over seconds in his own frame: the reach hangs off this, so the idle's sway
  // bends the elbow a little instead of carrying the hand around.
  const anchor = new THREE.Vector3()
  let anchored = false

  return (m, weight, dt) => {
    const bone = (n: string) => m.bone(n)!
    frame.update(m)
    clock += dt
    memory.begin([...ARM, ...LOOK].map(bone))

    m.root.getWorldQuaternion(rootQ)
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ)
    const hisRight = new THREE.Vector3(-1, 0, 0).applyQuaternion(rootQ)
    const viewerAt = frame.toWorld(0, 0, 0)

    // ---- shoulder forward ----------------------------------------------------------
    const shoulder = bone('RightShoulder')
    shoulder.getWorldQuaternion(_q).premultiply(_r.setFromAxisAngle(UP, R.shoulderForward))
    setWorldQuaternion(shoulder, _q)

    // ---- the arm: out toward the viewer, a little down and to his right ---------------
    const arm = bone('RightArm')
    const fore = bone('RightForeArm')
    const hand = bone('RightHand')
    fore.getWorldQuaternion(fkFore)
    hand.getWorldQuaternion(fkHand)
    const shoulderAt = arm.getWorldPosition(new THREE.Vector3())
    const E = fore.getWorldPosition(new THREE.Vector3())
    const reach = (shoulderAt.distanceTo(E) + E.distanceTo(hand.getWorldPosition(new THREE.Vector3()))) * R.extend
    const local = m.root.worldToLocal(shoulderAt.clone())
    if (!anchored) anchor.copy(local)
    anchored = true
    anchor.lerp(local, 1 - Math.exp(-dt / 30))
    const A = m.root.localToWorld(anchor.clone())
    const aim = viewerAt.clone().addScaledVector(UP, -R.aimDrop).addScaledVector(hisRight, R.aimOut)
    const dir = aim.sub(A).normalize()
    const t = reduced ? 0 : clock
    const drift = new THREE.Vector3(Math.sin(t * 0.7), Math.sin(t * 0.53 + 1), Math.sin(t * 0.41 + 2) * 0.5).multiplyScalar(R.drift)
    const wrist = A.clone().addScaledVector(dir, reach).add(drift)
    // Elbow: down and out, a touch back, so the arm reads relaxed rather than locked.
    const pole = A.clone().addScaledVector(UP, -0.4).addScaledVector(hisRight, 0.35).addScaledVector(fwd, -0.1)
    twoBone(arm, fore, bone('RightHand'), wrist, pole)

    // ---- the open hand: fingers on along the reach, palm down and turned in ------------
    const along = dir.clone().applyAxisAngle(UP, R.fingersOut * (hisRight.clone().cross(dir).y > 0 ? -1 : 1)).addScaledVector(UP, Math.sin(R.fingersUp)).normalize()
    const palm = new THREE.Vector3().addScaledVector(UP, -Math.cos(R.palmIn)).addScaledVector(hisRight, -Math.sin(R.palmIn))
    palm.addScaledVector(along, -palm.dot(along)).normalize()
    _m.makeBasis(new THREE.Vector3().crossVectors(along, palm), along, palm)
    const handQ = new THREE.Quaternion().setFromRotationMatrix(_m)
    // Share the hand's roll (relative to how the clip had it) with the forearm, so the wrist doesn't wring.
    fore.getWorldQuaternion(_q)
    const relClip = fkFore.clone().invert().multiply(fkHand)
    const relNow = _q.clone().invert().multiply(handQ)
    const d = relClip.invert().multiply(relNow)
    const twist = new THREE.Quaternion(0, d.y, 0, d.w).normalize()
    setWorldQuaternion(fore, _q.multiply(_q2.identity().slerp(twist, R.forearmShare)))
    setWorldQuaternion(hand, handQ)
    // Fingers together, a gentle curve (the rig's single finger chain).
    ;[1, 2, 3].forEach((k, j) => {
      const f = bone(`RightHandIndex${k}`)
      f.rotateX(R.curl[j])
      f.updateMatrixWorld(true)
    })

    // ---- head to the viewer, chin level, with a small nod now and then ------------------
    const head = bone('Head')
    const look = (b: THREE.Object3D, share: number) => {
      const at = head.getWorldPosition(new THREE.Vector3())
      const want = viewerAt.clone().sub(at).normalize()
      const flat = Math.hypot(want.x, want.z)
      const pitch = THREE.MathUtils.clamp(Math.atan2(want.y, flat), -R.pitchLimit, R.pitchLimit)
      want.set((want.x / flat) * Math.cos(pitch), Math.sin(pitch), (want.z / flat) * Math.cos(pitch))
      const face = FACE.clone().applyQuaternion(head.getWorldQuaternion(_q2))
      _r.setFromUnitVectors(face, want)
      _r.slerpQuaternions(_q.identity(), _r, share)
      b.getWorldQuaternion(_q2).premultiply(_r)
      setWorldQuaternion(b, _q2)
    }
    look(bone('Neck'), R.neckLook)
    look(head, R.headLook)
    if (!reduced) {
      if (nodT < 0 && clock > nextNod) nodT = 0
      if (nodT >= 0) {
        nodT += dt
        const u = nodT / R.nodLen
        head.rotateX(R.nod * Math.sin(Math.min(1, u) * Math.PI) ** 2)
        head.updateMatrixWorld(true)
        if (u >= 1) {
          nodT = -1
          nextNod = clock + R.nodEvery[0] + Math.random() * (R.nodEvery[1] - R.nodEvery[0])
        }
      }
    }

    memory.end(weight)
  }
}
