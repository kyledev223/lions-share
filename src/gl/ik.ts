import * as THREE from 'three'
import type { Mascot } from './mascot'

/**
 * Small IK kit for pose layers (mascot.setOverlay): world-space bone turns,
 * a two-bone solver, the bookkeeping that blends a solved pose with the
 * clip's, and a prop frame that stays put relative to him.
 */

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _e = new THREE.Vector3()
const _n = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qp = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _m = new THREE.Matrix4()

export const SIDES = [
  ['Left', 1],
  ['Right', -1],
] as const

/** Sets a bone's world rotation (its scale is left alone) and refreshes its children. */
export function setWorldQuaternion(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_qp)
  bone.quaternion.copy(_qp.invert().multiply(q))
  bone.updateMatrixWorld(true)
}

/** Turns `bone` (about its own joint) so the world point `from`, which rides with it, swings onto `to`. */
export function swing(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  bone.getWorldPosition(_a)
  _b.subVectors(from, _a).normalize()
  _c.subVectors(to, _a).normalize()
  _r.setFromUnitVectors(_b, _c)
  bone.getWorldQuaternion(_q).premultiply(_r)
  setWorldQuaternion(bone, _q)
}

/**
 * Two-bone IK (upper → lower → end), in world space: the end joint goes to
 * `target`, the middle joint bends toward `pole`. Only swings the two bones,
 * so each keeps the twist the clip gave it.
 */
export function twoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  const A = upper.getWorldPosition(new THREE.Vector3())
  const B = lower.getWorldPosition(new THREE.Vector3())
  const C = end.getWorldPosition(new THREE.Vector3())
  const l1 = A.distanceTo(B)
  const l2 = B.distanceTo(C)
  const dir = _d.subVectors(target, A)
  const d = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995)
  dir.normalize()
  _n.subVectors(pole, A)
  _n.addScaledVector(dir, -_n.dot(dir)).normalize()
  const cos = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)
  const elbow = _e.copy(A).addScaledVector(dir, l1 * cos).addScaledVector(_n, l1 * Math.sqrt(1 - cos * cos))
  swing(upper, B, elbow)
  end.getWorldPosition(C)
  swing(lower, C, A.addScaledVector(dir, d))
}

/**
 * Lays a Mixamo hand palm-down with its fingers pointing along `along`
 * (world). Mixamo hand bones run down the fingers on +Y with the palm on +Z.
 */
export function palmDown(hand: THREE.Object3D, along: THREE.Vector3, up: THREE.Vector3) {
  const y = _a.copy(along).normalize()
  const z = _b.copy(up).negate()
  z.addScaledVector(y, -z.dot(y)).normalize()
  const x = _c.crossVectors(y, z)
  _m.makeBasis(x, y, z)
  setWorldQuaternion(hand, _q.setFromRotationMatrix(_m))
}

/**
 * The pose of the bones a layer touches as it found them (the clip, plus any
 * layer before it), so the solved pose can be blended from it by the layer
 * weight. (Bones the mixer doesn't animate are reset by the mascot first.)
 */
export class PoseMemory {
  private saved = new Map<THREE.Object3D, THREE.Quaternion>()
  private savedHips = new THREE.Vector3()
  private bones: THREE.Object3D[] = []
  private hips: THREE.Object3D | null = null
  private tq = new THREE.Quaternion()

  /** Call first: remembers the pose of `bones` (and the hips' position, if given). */
  begin(bones: THREE.Object3D[], hips?: THREE.Object3D) {
    this.bones = bones
    for (const b of bones) this.saved.set(b, (this.saved.get(b) ?? new THREE.Quaternion()).copy(b.quaternion))
    this.hips = hips ?? null
    if (hips) this.savedHips.copy(hips.position)
  }

  /** Call last: blends the solved pose back toward the remembered one by `weight` (0–1). */
  end(weight: number) {
    if (weight >= 1) return
    for (const b of this.bones) {
      this.tq.copy(b.quaternion)
      b.quaternion.copy(this.saved.get(b)!).slerp(this.tq, weight)
    }
    this.hips?.position.lerpVectors(this.savedHips, this.hips.position, weight)
  }
}

/**
 * A prop's frame (throne, podium) held relative to his body. While he is in
 * the prop's scene it tracks the prop; once he has moved on, the frame
 * travels with him, so a layer fading out releases toward where the prop was
 * relative to him, not toward a prop left behind in the old scene.
 */
export class AnchoredFrame {
  readonly matrix = new THREE.Matrix4()
  readonly inverse = new THREE.Matrix4()
  readonly quaternion = new THREE.Quaternion()
  private rel = new THREE.Matrix4()

  constructor(private prop: THREE.Object3D) {}

  update(m: Mascot) {
    if (m.root.parent && m.root.parent === this.prop.parent) {
      this.prop.updateMatrixWorld()
      this.rel.copy(m.root.matrixWorld).invert().multiply(this.prop.matrixWorld)
    }
    this.matrix.multiplyMatrices(m.root.matrixWorld, this.rel)
    this.inverse.copy(this.matrix).invert()
    this.matrix.decompose(_a, this.quaternion, _b)
  }

  /** Prop-frame point → world. */
  toWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.matrix)
  }

  /** World point → prop frame (in place). */
  toLocal(v: THREE.Vector3) {
    return v.applyMatrix4(this.inverse)
  }

  /** Prop-frame direction → world. */
  dirToWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.quaternion)
  }
}

/**
 * A small idle gesture for resting hands, every `every` seconds: a slow
 * finger tap (two lifts) on one hand, or that hand easing a little forward
 * and most of the way back. Read `tap` (0–1 per hand) and `shift` (metres
 * per hand) after `update`.
 */
export class Fidget {
  readonly tap = [0, 0]
  readonly shift = [0, 0]
  private clock = 0
  private next = 3 + Math.random() * 3
  private gesture: { kind: 'tap' | 'shift'; side: 0 | 1; t: number; len: number } | null = null

  constructor(
    private every: [number, number],
    private reach = 0.022,
    private still = false,
  ) {}

  update(dt: number) {
    this.clock += dt
    this.tap[0] = this.tap[1] = 0
    if (this.still) return
    if (!this.gesture && this.clock > this.next) {
      const kind = Math.random() < 0.55 ? 'tap' : 'shift'
      this.gesture = { kind, side: Math.random() < 0.5 ? 0 : 1, t: 0, len: kind === 'tap' ? 1.6 : 2.4 }
    }
    const g = this.gesture
    if (g) {
      g.t += dt
      const u = g.t / g.len
      if (g.kind === 'tap') this.tap[g.side] = Math.max(0, Math.sin(Math.min(1, u) * Math.PI * 2)) ** 1.5
      else this.shift[g.side] = (THREE.MathUtils.smootherstep(u, 0, 0.45) - 0.7 * THREE.MathUtils.smootherstep(u, 0.55, 1)) * this.reach
      if (u >= 1) {
        this.gesture = null
        this.next = this.clock + this.every[0] + Math.random() * (this.every[1] - this.every[0])
      }
    }
    // A shifted hand drifts home between gestures.
    for (const i of [0, 1]) if (!this.gesture || this.gesture.side !== i || this.gesture.kind !== 'shift') this.shift[i] *= Math.exp(-dt / 2.5)
  }
}
