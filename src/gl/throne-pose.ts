import * as THREE from 'three'
import { AnchoredFrame, Fidget, palmDown, PoseMemory, setWorldQuaternion, SIDES, twoBone } from './ik'
import type { PoseOverlay } from './mascot'

/**
 * The throne on screen 01, in its own frame (seat centred on x = 0, facing
 * +Z, floor at y = 0). The particle throne (scenes.ts) is drawn from these
 * numbers and the pose below sits him in it, so the two can't drift apart.
 */
export const THRONE = {
  /** Top of the seat cushion. */
  seatTop: 0.48,
  /** Front edge of the seat. */
  seatFront: 0.36,
  /** Half the seat's width. */
  seatHalf: 0.33,
  /** The backrest's plane. */
  back: -0.255,
  /** Half the backrest's width. */
  backHalf: 0.4,
  /** Armrest centre lines: x = ±armX, top at armY, running from the backrest to armFront. */
  armX: 0.27,
  armY: 0.752,
  armFront: 0.345,
  /** Armrest width and depth (the rail he rests his forearms on). */
  armW: 0.075,
  armH: 0.04,
  /** How far back (m) he sits from where the clip puts him, into the throne. */
  sitBack: 0.08,
}

/** The pose's own knobs. */
const POSE = {
  /** Hips settle this far into the cushion (m); the feet stay planted. */
  hipDrop: 0.015,
  /** Knees and feet drawn toward the middle (1 = as the clip has them). */
  kneeSpread: 0.74,
  footSpread: 0.75,
  /** Toes turned in from the clip's splay (radians). */
  toeIn: 0.18,
  /** Shoulders eased back and down (radians). */
  shoulderBack: 0.11,
  shoulderDown: 0.1,
  /** Sleeve radius at the elbow and the wrist's height over the rail (m), so the arm lies ON the armrest. */
  elbowLift: 0.047,
  wristLift: 0.032,
  /** Hands angle down the rail a little and turn in a touch (radians). */
  handPitch: 0.1,
  handYaw: 0.12,
  /** Finger curl at rest, per joint, so the fingertips drape over the front of the rail (radians). */
  curl: [0.22, 0.5, 0.42],
  /** Seconds between the small idle gestures (a finger tap or the hand easing along the rail). */
  every: [6, 10] as [number, number],
}

/**
 * Seats him in the throne with his forearms along the armrests, on top of
 * the sitting-idle clip (its breathing, head and torso stay):
 *
 *  - hips settle into the cushion, knees and feet draw in, feet stay flat;
 *  - shoulders ease back and down;
 *  - each arm is a two-bone IK onto its armrest: the elbow on the back third,
 *    the forearm along the rail, the wrist near the front, the pole out and
 *    back so the elbow neither flares nor tucks in;
 *  - hands palm down along the rail, fingers curled over its front end;
 *  - every 6–10 s, a slow finger tap on one hand or the hand easing a little
 *    along the rail.
 *
 * Everything is solved at full strength, then blended from the clip's pose
 * by the layer weight, so the arms settle in and release smoothly.
 */
export function throneArms(throne: THREE.Object3D, reduced: boolean): PoseOverlay {
  const T = THRONE
  const P = POSE
  const memory = new PoseMemory()
  const frame = new AnchoredFrame(throne)
  const fidget = new Fidget(P.every, 0.022, reduced)
  const Y = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const r = new THREE.Quaternion()
  const world = new THREE.Vector3()

  return (m, weight, dt) => {
    const bone = (n: string) => m.bone(n)!
    frame.update(m)
    fidget.update(dt)

    const touched = SIDES.flatMap(([s]) =>
      ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandIndex1', 'HandIndex2', 'HandIndex3', 'UpLeg', 'Leg', 'Foot'].map((n) => bone(s + n)),
    )
    const hips = bone('Hips')
    memory.begin(touched, hips)

    // ---- seat: hips into the cushion, knees and feet drawn in -------------------
    const feet = SIDES.map(([s]) => ({
      foot: bone(`${s}Foot`).getWorldPosition(new THREE.Vector3()),
      knee: bone(`${s}Leg`).getWorldPosition(new THREE.Vector3()),
      q: bone(`${s}Foot`).getWorldQuaternion(new THREE.Quaternion()),
    }))
    hips.getWorldPosition(world).y -= P.hipDrop
    hips.position.copy(hips.parent!.worldToLocal(world))
    hips.updateMatrixWorld(true)
    SIDES.forEach(([s, sign], i) => {
      const f = feet[i]
      // In the throne's frame: draw toward x = 0.
      frame.toLocal(f.foot)
      frame.toLocal(f.knee)
      const target = frame.toWorld(f.foot.x * P.footSpread, f.foot.y, f.foot.z)
      const pole = frame.toWorld(f.knee.x * P.kneeSpread, f.knee.y, f.knee.z + 0.5)
      twoBone(bone(`${s}UpLeg`), bone(`${s}Leg`), bone(`${s}Foot`), target, pole)
      // Feet keep the clip's flat footing, toes turned in a little.
      setWorldQuaternion(bone(`${s}Foot`), q.setFromAxisAngle(Y, -sign * P.toeIn).multiply(f.q))
    })

    // ---- shoulders back and down --------------------------------------------------
    const fwd = frame.dirToWorld(0, 0, 1)
    SIDES.forEach(([s, sign]) => {
      const sh = bone(`${s}Shoulder`)
      sh.getWorldQuaternion(q)
      q.premultiply(r.setFromAxisAngle(Y, sign * P.shoulderBack))
      q.premultiply(r.setFromAxisAngle(fwd, -sign * P.shoulderDown))
      setWorldQuaternion(sh, q)
    })

    // ---- arms onto the armrests ---------------------------------------------------
    SIDES.forEach(([s, sign], i) => {
      const arm = bone(`${s}Arm`)
      const fore = bone(`${s}ForeArm`)
      const hand = bone(`${s}Hand`)
      const shoulder = arm.getWorldPosition(new THREE.Vector3())
      const elbowW = fore.getWorldPosition(new THREE.Vector3())
      const l1 = shoulder.distanceTo(elbowW)
      const l2 = elbowW.distanceTo(hand.getWorldPosition(new THREE.Vector3()))
      const A = frame.toLocal(shoulder)
      // The elbow sits on the rail where the upper arm can reach it from the shoulder:
      // as far forward as its length allows, never behind the backrest.
      const ex = sign * T.armX
      const ey = T.armY + P.elbowLift
      const h2 = l1 * l1 - (ex - A.x) ** 2 - (ey - A.y) ** 2
      const ez = Math.max(T.back + 0.06, A.z + (h2 > 0 ? Math.sqrt(h2) : 0)) + fidget.shift[i]
      // The wrist lies along the rail, a little lower than the elbow.
      const drop = P.elbowLift - P.wristLift
      const run = Math.sqrt(Math.max(0, l2 * l2 - drop * drop))
      const wristL = new THREE.Vector3(ex, ey - drop, ez + run)
      // Pole: through the elbow point, away from the shoulder–wrist line (so the elbow lands on the rail),
      // nudged out and slightly back so it neither flares nor tucks in.
      const axis = wristL.clone().sub(A).normalize()
      const toElbow = new THREE.Vector3(ex, ey, ez).sub(A)
      const off = toElbow.addScaledVector(axis, -toElbow.dot(axis)).normalize()
      const pole = frame.toWorld(ex + off.x * 0.25 + sign * 0.04, ey + off.y * 0.25, ez + off.z * 0.25 - 0.04)
      twoBone(arm, fore, hand, frame.toWorld(wristL.x, wristL.y, wristL.z), pole)

      // Palm down, fingers along the rail and angled down toward its front end, turned in a touch.
      palmDown(hand, frame.dirToWorld(-sign * Math.sin(P.handYaw), -Math.sin(P.handPitch), Math.cos(P.handYaw)), frame.dirToWorld(0, 1, 0))

      // Fingers curl over the front of the rail; a tap lifts them a little.
      ;[1, 2, 3].forEach((k, j) => {
        const f = bone(`${s}HandIndex${k}`)
        f.rotateX(P.curl[j] * (1 - 0.75 * fidget.tap[i]))
        f.updateMatrixWorld(true)
      })
    })

    memory.end(weight)
  }
}
