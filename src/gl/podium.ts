import * as THREE from 'three'
import { AnchoredFrame, Fidget, palmDown, PoseMemory, SIDES, twoBone } from './ik'
import type { PoseOverlay } from './mascot'

/**
 * The podium on screen 05, in its own frame: origin on the floor where he
 * stands, facing +Z (toward the audience). The particle podium (scenes.ts)
 * is drawn from these numbers and the pose below rests his hands on it.
 */
export const PODIUM = {
  /** The reading top: its near (speaker) edge and far edge, and their heights (it rises toward the front). */
  near: 0.3,
  nearY: 1.06,
  far: 0.52,
  farY: 1.1,
  /** Half the top's width. */
  halfW: 0.38,
  /** The body: under the top, then tapering to a narrower foot on the floor. */
  bodyHalfW: 0.33,
  footHalfW: 0.25,
  bodyNear: 0.34,
  footNear: 0.38,
  /** Height of the top at depth z. */
  topY(z: number) {
    return this.nearY + ((this.farY - this.nearY) * (z - this.near)) / (this.far - this.near)
  },
}

const POSE = {
  /** Where the wrists rest: half the spacing between them, and how far onto the top from its near edge (m). */
  wristX: 0.2,
  wristIn: 0.075,
  /** Wrist joint height over the top's surface (m). */
  wristLift: 0.034,
  /** Hands turn in a touch (radians), fingers relaxed over the top. */
  handYaw: 0.16,
  curl: [0.12, 0.28, 0.22],
  /** Seconds between the small idle gestures. */
  every: [6, 10] as [number, number],
}

/**
 * Rests his hands on the podium top, on top of the idle clip (its breathing,
 * sway and head stay): a two-bone IK per arm with the elbows bending down,
 * back and a little out; palms flat on the top, fingers relaxed, a slow
 * finger tap or a small shift of one hand now and then. Solved at full
 * strength, then blended from the clip by the layer weight.
 */
export function podiumHands(podium: THREE.Object3D, reduced: boolean): PoseOverlay {
  const P = PODIUM
  const S = POSE
  const memory = new PoseMemory()
  const frame = new AnchoredFrame(podium)
  const fidget = new Fidget(S.every, 0.015, reduced)
  const slope = (P.farY - P.nearY) / (P.far - P.near)

  return (m, weight, dt) => {
    const bone = (n: string) => m.bone(n)!
    frame.update(m)
    fidget.update(dt)
    memory.begin(SIDES.flatMap(([s]) => ['Arm', 'ForeArm', 'Hand', 'HandIndex1', 'HandIndex2', 'HandIndex3'].map((n) => bone(s + n))))

    SIDES.forEach(([s, sign], i) => {
      const z = P.near + S.wristIn + fidget.shift[i]
      const wrist = frame.toWorld(sign * S.wristX, P.topY(z) + S.wristLift, z)
      // Elbows bend down, back and a little out.
      const pole = frame.toWorld(sign * (S.wristX + 0.35), P.nearY - 0.35, z - 0.45)
      twoBone(bone(`${s}Arm`), bone(`${s}ForeArm`), bone(`${s}Hand`), wrist, pole)
      // Palm flat on the top, fingers toward the audience and turned in a touch.
      palmDown(bone(`${s}Hand`), frame.dirToWorld(-sign * Math.sin(S.handYaw), slope * Math.cos(S.handYaw), Math.cos(S.handYaw)), frame.dirToWorld(0, 1, -slope))
      ;[1, 2, 3].forEach((k, j) => {
        const f = bone(`${s}HandIndex${k}`)
        f.rotateX(S.curl[j] * (1 - 0.8 * fidget.tap[i]) - 0.25 * fidget.tap[i] * (j === 0 ? 1 : 0))
        f.updateMatrixWorld(true)
      })
    })

    memory.end(weight)
  }
}
