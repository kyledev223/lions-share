import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { fx } from '../fx-config'
import { lite } from '../lite'
import type { ClipName, Mascot } from './mascot'
import type { Entry } from './entry'
import { builtThin, pointCount, shared } from './points'
import { fitFov } from './frame'
import { finalPass } from './post'

export interface Clickable {
  object: THREE.Object3D
  onClick(): void
  /** Cursor label while hovering (e.g. "DRAG"). */
  label?: string
}

export interface StageCamera {
  pos: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

export interface MascotSpot {
  /** Where his feet are. */
  pos: THREE.Vector3
  /** Radians; 0 faces the camera (+Z). */
  rotY: number
  clip: ClipName
  scale?: number
  /** Playback speed here, if not the clip's usual (fx.mascot.speed). */
  speed?: number
}

/** One screen's 3D scene. Only the active one is updated and drawn. */
export interface Stage {
  id: string
  scene: THREE.Scene
  camera: StageCamera
  /** Overrides for portrait screens; by default the camera backs off and centres on the mascot. */
  portrait?: Partial<StageCamera>
  mascot?: MascotSpot
  /**
   * A screen he isn't in: where he stands out of the picture, so screen changes can still swing
   * round him and carry him out of (and back into) the frame.
   */
  offstage?: MascotSpot
  update?(time: number, dt: number): void
  /** Runs just before the stage is drawn, with the camera placed (e.g. to render a reflection). */
  beforeRender?(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void
  /** `instant`: his first arrival (no transition), so anything that settles in should be there already. */
  enter?(mascot: Mascot, instant: boolean): void
  leave?(mascot: Mascot): void
  clickables?: Clickable[]
}

export interface EngineOptions {
  reduced: boolean
  /** True on devices with a real mouse: parallax from the cursor and the lens. */
  finePointer: boolean
}

/**
 * Owns the canvas. Renders crisp at the device pixel ratio (capped), through
 * one composer: scene → bloom → final pass (post.ts).
 *
 *   entry  the star field and emblem (entry.ts)
 *   site   the active screen's stage (scenes.ts) with the mascot borrowed into it
 *
 * Screen changes go through `go()` ("the pounce", timings in fx.transition).
 * The lion never leaves: every camera is also known relative to him (angle
 * round him, distance, height, where it looks), and a change interpolates in
 * that frame, pulling back, rising and widening at the midpoint, so the camera
 * swings round him while his pose blends to the next clip. The old stage's
 * points lift off and swirl round him; at `swap`, under the claw, the stage
 * underneath him changes; the new stage's points settle in. Nothing dips to
 * black: the blacks lift toward a wash colour measured from each stage.
 */
export function createEngine(canvas: HTMLCanvasElement, parts: { stages: Stage[]; entry: Entry; mascot: Mascot }, opts: EngineOptions) {
  const { stages, entry, mascot } = parts
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
  renderer.setClearColor(0x020308, 1)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace // the final pass encodes sRGB itself
  mascot.useRenderer(renderer)

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400)
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  const renderPass = new RenderPass(entry.scene, entry.camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), fx.bloom.strength, fx.bloom.radius, fx.bloom.threshold)
  const final = new ShaderPass(finalPass())
  composer.addPass(renderPass)
  composer.addPass(bloom)
  composer.addPass(final)
  const post = final.uniforms

  /** Values the rest of the app animates. */
  const state = {
    mode: 'entry' as 'entry' | 'site',
  }

  let active = 0
  /** Reduced motion: the last frame, faded out over the new stage. */
  let prevTex: THREE.FramebufferTexture | null = null
  /** Each stage's wash colour (display), measured while warming up. */
  const washes = stages.map(() => new THREE.Color(fx.palette.deep).convertLinearToSRGB().multiplyScalar(0.6))
  let width = 1
  let height = 1
  let pr = 1
  let liteOn = !lite.on
  const pointer = { x: 0, y: 0, cx: -1e4, cy: -1e4, inside: false }
  const lean = { x: 0, y: 0, lens: 0 }
  const tilt = { x: 0, y: 0, live: false }

  function resize() {
    width = window.innerWidth
    height = window.innerHeight
    pr = Math.min(window.devicePixelRatio || 1, lite.on ? 1 : fx.maxPixelRatio)
    renderer.setPixelRatio(pr)
    renderer.setSize(width, height, false)
    composer.setPixelRatio(pr)
    composer.setSize(width, height)
    post.uRes.value.set(width * pr, height * pr)
    post.uPR.value = pr
    post.uLens.value.x = (fx.lens.diameterAt1080 / 2) * (height / 1080) * pr
    entry.resize(width, height)
    if (opts.reduced) {
      prevTex?.dispose()
      prevTex = new THREE.FramebufferTexture(Math.round(width * pr), Math.round(height * pr))
      post.uPrev.value = prevTex
    }
  }

  /** Lite mode: half the points (clouds are shuffled, so the first half is an even thinning), no bloom, 1× pixels. */
  function applyLite() {
    if (liteOn === lite.on) return
    liteOn = lite.on
    bloom.enabled = !liteOn
    shared.uSizeK.value = liteOn ? 1.35 : 1.08
    // Half the points take flight on a screen change; the claw is a plain wipe and the rows don't smear.
    shared.uFlightShare.value = liteOn ? 0.5 : 1
    post.uLite.value = liteOn ? 1 : 0
    const thin = (o: THREE.Object3D) => {
      if (!(o as THREE.Points).isPoints) return
      const g = (o as THREE.Points).geometry
      g.setDrawRange(0, liteOn && !builtThin() ? Math.ceil(g.attributes.position.count / 2) : Infinity)
    }
    stages.forEach((s) => s.scene.traverse(thin))
    entry.scene.traverse(thin)
    resize()
  }

  // ---- camera ----------------------------------------------------------------
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const look = new THREE.Vector3()

  /** Where a stage's camera sits at rest (portrait framing included), before parallax and breathing. */
  interface View {
    pos: THREE.Vector3
    tgt: THREE.Vector3
    fov: number
  }
  function restView(stage: Stage, out: View) {
    const portrait = width / height < 0.85
    let pos = stage.camera.pos
    let tgt = stage.camera.target
    let fov = stage.camera.fov
    if (portrait) {
      if (stage.portrait) {
        pos = stage.portrait.pos ?? pos
        tgt = stage.portrait.target ?? tgt
        fov = stage.portrait.fov ?? fov
      } else {
        // Back off and swing round to keep the mascot (or the scene centre) in frame.
        const focusX = stage.mascot ? stage.mascot.pos.x : tgt.x
        tgt = tgt.clone().setX(THREE.MathUtils.lerp(tgt.x, focusX, 0.85))
        pos = pos.clone().setX(THREE.MathUtils.lerp(pos.x, focusX, 0.85))
        pos = tgt.clone().add(pos.clone().sub(tgt).multiplyScalar(1.45))
        // Look lower, so he stands in the top half and the copy has the bottom.
        const drop = pos.distanceTo(tgt) * 0.2
        tgt = tgt.clone().setY(tgt.y - drop)
        pos = pos.clone().setY(pos.y - drop * 0.6)
        fov = Math.min(fov + 12, 70)
      }
    }
    out.pos.copy(pos)
    out.tgt.copy(tgt)
    out.fov = fov
    return out
  }

  /** Where he stands on a stage (or out of its picture); null if he has no place there at all. */
  const spotOf = (stage: Stage) => stage.mascot ?? stage.offstage ?? null
  /** What the points swirl round: his feet, or the middle of the view on a screen he isn't in. */
  const pivotOf = (stage: Stage, out: THREE.Vector3) => out.copy(stage.mascot ? stage.mascot.pos : stage.camera.target)

  /** A camera in his own frame: angle round him (radians, 0 = in front), distance and height, and the same for where it looks. */
  interface Rel {
    a: number
    r: number
    y: number
    ta: number
    tr: number
    ty: number
    fov: number
  }
  const relA: Rel = { a: 0, r: 1, y: 0, ta: 0, tr: 0, ty: 0, fov: 40 }
  const relB: Rel = { ...relA }
  const relNow: Rel = { ...relA }
  const viewTmp: View = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40 }
  const q = new THREE.Vector3()
  function toRel(stage: Stage, v: View, out: Rel) {
    const s = spotOf(stage)
    const at = s ? s.pos : stage.camera.target
    const rot = s ? s.rotY : 0
    const k = s?.scale ?? 1
    q.subVectors(v.pos, at).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -rot).divideScalar(k)
    out.a = Math.atan2(q.x, q.z)
    out.r = Math.hypot(q.x, q.z)
    out.y = q.y
    q.subVectors(v.tgt, at).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -rot).divideScalar(k)
    out.ta = Math.atan2(q.x, q.z)
    out.tr = Math.hypot(q.x, q.z)
    out.ty = q.y
    out.fov = v.fov
    return out
  }
  function fromRel(stage: Stage, rel: Rel, out: View) {
    const s = spotOf(stage)
    const at = s ? s.pos : stage.camera.target
    const rot = s ? s.rotY : 0
    const k = s?.scale ?? 1
    out.pos.set(Math.sin(rel.a) * rel.r, rel.y, Math.cos(rel.a) * rel.r).multiplyScalar(k).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot).add(at)
    out.tgt.set(Math.sin(rel.ta) * rel.tr, rel.ty, Math.cos(rel.ta) * rel.tr).multiplyScalar(k).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot).add(at)
    out.fov = rel.fov
    return out
  }
  /** The shortest turn from angle a to b; a half-turn either way goes the way the visitor is heading. */
  const turn = (a: number, b: number, dir: number) => {
    let d = THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI
    if (Math.abs(d) > Math.PI * 0.92) d = Math.abs(d) * dir
    return d
  }

  /** The camera mid-change: `k` 0→1 from the old screen's view to the new one's, `bump` the midpoint pull-back. */
  function journey(from: Stage, to: Stage, on: Stage, k: number, bump: number, dir: number, out: View) {
    toRel(from, restView(from, viewTmp), relA)
    toRel(to, restView(to, viewTmp), relB)
    const C = fx.transition.camera
    const lerp = THREE.MathUtils.lerp
    relNow.a = relA.a + turn(relA.a, relB.a, dir) * k
    relNow.r = lerp(relA.r, relB.r, k) * (1 + C.pull * bump)
    relNow.y = lerp(relA.y, relB.y, k) + C.rise * bump
    relNow.ta = relA.ta + turn(relA.ta, relB.ta, dir) * k
    relNow.tr = lerp(relA.tr, relB.tr, k)
    relNow.ty = lerp(relA.ty, relB.ty, k) + C.rise * bump * 0.6
    relNow.fov = lerp(relA.fov, relB.fov, k) + C.fov * bump
    return fromRel(on, relNow, out)
  }

  const view: View = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40 }
  function placeCamera(stage: Stage, time: number) {
    const portrait = width / height < 0.85
    if (trans && !trans.reduced) {
      const { k, bump } = trans.cam
      journey(stages[trans.from], stages[trans.to], stage, k, bump, trans.dir, view)
    } else restView(stage, view)
    const pos = view.pos
    const tgt = view.tgt
    const fov = view.fov
    fwd.subVectors(tgt, pos).normalize()
    right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize()
    up.crossVectors(right, fwd).normalize()
    const b = opts.reduced ? 0 : fx.breathing.amount
    const w = time * fx.breathing.speed * Math.PI * 2
    camera.position
      .copy(pos)
      .addScaledVector(right, lean.x * fx.parallax.shift + Math.sin(w) * b)
      .addScaledVector(up, lean.y * fx.parallax.lift + Math.sin(w * 1.3 + 1) * b * 0.6)
    look.copy(tgt).addScaledVector(right, lean.x * fx.parallax.shift * 0.25)
    camera.fov = portrait ? fov : fitFov(fov, width / height)
    camera.aspect = width / height
    camera.lookAt(look)
    camera.updateProjectionMatrix()
  }

  const setProj = (cam: THREE.PerspectiveCamera) => {
    shared.uProj.value = (height * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
  }

  // ---- the mascot moves into whichever stage is showing ---------------------------
  /** On a screen he isn't in he still stands (out of the picture) for the camera to swing round, but isn't drawn at rest. */
  function seatMascot(stage: Stage) {
    mascot.root.removeFromParent()
    const c = spotOf(stage)
    if (!c) return
    mascot.root.position.copy(c.pos)
    mascot.root.rotation.set(0, c.rotY, 0)
    mascot.root.scale.setScalar(c.scale ?? 1)
    mascot.root.visible = !!stage.mascot || (!!trans && !trans.reduced)
    stage.scene.add(mascot.root)
    mascot.play(c.clip, fx.mascot.crossfade, c.speed)
    mascot.uniforms.uFloorY.value = c.pos.y
  }

  /** Hands the screen over: the old stage lets go of him and its props, the new one takes him. */
  function swapTo(index: number) {
    stages[active].leave?.(mascot)
    active = index
    seatMascot(stages[active])
    stages[active].enter?.(mascot, false)
    pivotOf(stages[active], shared.uPivot.value)
  }

  /** Straight to a screen (reduced motion's scrolling page): a short crossfade, nothing else. */
  function setStage(index: number) {
    if (index === active && mascot.root.parent === stages[index].scene) return
    if (state.mode === 'site' && opts.reduced && prevTex && !trans) {
      trans = { from: active, to: index, dir: 1, t0: -1, swapped: false, clip: false, reduced: true, cam: { k: 0, bump: 0 }, frames: [], onSwap: () => {}, unlock: () => {} }
      return
    }
    swapTo(index)
  }

  // ---- the screen change ----------------------------------------------------------
  interface Transition {
    from: number
    to: number
    dir: number
    /** Start time (s, the loop's clock); −1 until its first frame. */
    t0: number
    swapped: boolean
    clip: boolean
    reduced: boolean
    cam: { k: number; bump: number }
    /** Frame times (ms) while it runs, for ?debug. */
    frames: number[]
    onSwap(): void
    unlock(): void
  }
  let trans: Transition | null = null
  /** Frame-time summary of the last screen change, for ?debug. */
  let lastStats = ''
  const washNow = new THREE.Color()
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
  const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)

  /** Advances the screen change to time `T` (s since it started): every envelope comes from here. */
  function tickTransition(tr: Transition, T: number) {
    const X = fx.transition
    if (tr.reduced) {
      post.uPrevMix.value = 1 - smoother(span(T, 0, X.reducedFade))
      if (T >= X.reducedFade) finish(tr)
      return
    }
    // The clip starts blending to the next screen's, and the old pose layer lets go before the swap.
    if (!tr.clip && T >= X.clip.at) {
      tr.clip = true
      const spot = spotOf(stages[tr.to])
      mascot.setOverlay(null, X.clip.release)
      if (spot) mascot.play(spot.clip, X.clip.fade, spot.speed)
    }
    if (!tr.swapped && T >= X.swap) {
      tr.swapped = true
      swapTo(tr.to)
      mascot.root.visible = true
      tr.onSwap()
    }
    if (T >= X.unlock) tr.unlock()

    // Camera: one move from view to view, pulled back, raised and widened most at the swap. `ks` is how
    // far it has come by the swap: about half, but to or from a screen he isn't in (02), most of the move
    // happens in that screen's world, so the other stage is never seen from an angle it wasn't built for.
    const ks = !stages[tr.from].mascot ? 0.8 : !stages[tr.to].mascot ? 0.2 : 0.45
    tr.cam.k = T < X.swap ? ks * span(T, 0, X.swap) ** 2 : ks + (1 - ks) * (1 - (1 - span(T, X.swap, X.camera.end)) ** 2)
    tr.cam.bump = T < X.swap ? Math.sin((Math.PI / 2) * (T / X.swap)) : Math.cos((Math.PI / 2) * span(T, X.swap, X.camera.end))
    // Points: lift off (each on its own beat), swirl; the new stage's settle in.
    const [o0, o1] = X.flight.out
    const [i0, i1] = X.flight.in
    shared.uMorph.value = T < X.swap ? span(T, o0, o1) ** 2 : 1 - (1 - (1 - span(T, i0, i1)) ** 3)
    // Props and lights dim toward the swap and come back after.
    const P = X.presence
    shared.uAssemble.value = T < X.swap ? 1 - (1 - P) * span(T, 0.15, X.swap) ** 2 : P + (1 - P) * (1 - (1 - span(T, X.swap, 1.1)) ** 2)
    // The claw: one sharp hit centred on the swap.
    const c = T - (X.swap - X.claw / 2)
    const hit = c >= 0 && c <= X.claw ? Math.sin((Math.PI * c) / X.claw) ** 2 : 0
    post.uClawT.value = c >= 0 && c <= X.claw ? c : -1
    post.uGlitch.value = hit * 0.28
    post.uBurst.value = hit * 0.45
    post.uSmear.value = lite.on ? 0 : hit
    // The blacks lift toward the wash, sliding from the old stage's to the new one's.
    post.uLift.value = X.lift * tr.cam.bump ** 1.5
    post.uWash.value.copy(washNow.copy(washes[tr.from]).lerp(washes[tr.to], tr.cam.k))
    // Gold embers off his outline, rising to the claw and settling back.
    mascot.uniforms.uEmber.value = Math.sin(Math.PI * span(T, X.embers[0], X.embers[1])) * 0.9
    if (T >= X.end) finish(tr)
  }

  function finish(tr: Transition) {
    if (!tr.swapped) {
      tr.swapped = true
      swapTo(tr.to)
      tr.onSwap()
    }
    tr.unlock()
    shared.uMorph.value = 0
    shared.uAssemble.value = 1
    post.uClawT.value = -1
    post.uGlitch.value = post.uBurst.value = post.uSmear.value = post.uLift.value = post.uPrevMix.value = 0
    mascot.uniforms.uEmber.value = 0
    mascot.root.visible = !!stages[active].mascot
    if (tr.frames.length) {
      const f = tr.frames
      const avg = f.reduce((s, x) => s + x, 0) / f.length
      lastStats = `last change ${stages[tr.from].id}→${stages[tr.to].id}: ${(1000 / avg).toFixed(0)} fps · avg ${avg.toFixed(1)}ms · worst ${Math.max(...f).toFixed(1)}ms · ${f.length} frames`
    }
    trans = null
  }

  /**
   * A stage's wash: the hue of its picture at rest (drawn small and averaged), at a set strength,
   * leaning a third of the way to our deep red. Mid-change the blacks lift toward it.
   */
  const washRT = new THREE.WebGLRenderTarget(48, 27)
  const washPx = new Uint8Array(48 * 27 * 4)
  const deep = new THREE.Color(fx.palette.deep).convertLinearToSRGB()
  function measureWash(i: number) {
    if (i < 0) return
    renderer.setRenderTarget(washRT)
    renderer.render(stages[i].scene, camera)
    renderer.setRenderTarget(null)
    renderer.readRenderTargetPixels(washRT, 0, 0, 48, 27, washPx)
    let r = 0
    let g = 0
    let b = 0
    for (let p = 0; p < washPx.length; p += 4) {
      r += washPx[p]
      g += washPx[p + 1]
      b += washPx[p + 2]
    }
    const n = 48 * 27 * 255
    const c = washes[i].setRGB(r / n + 1e-4, g / n + 1e-4, b / n + 1e-4).convertLinearToSRGB()
    c.multiplyScalar(0.32 / Math.max(c.r, c.g, c.b)).lerp(deep, 0.35)
  }

  // ---- render loop ---------------------------------------------------------------
  let last = 0
  let running = false
  let warming: Stage[] = []
  let warmed: (() => void) | null = null

  function loop(now: number) {
    if (!running) return
    requestAnimationFrame(loop)
    const time = now / 1000
    const dt = Math.min(0.1, time - last)
    last = time
    applyLite()
    shared.uTime.value = opts.reduced ? 0 : time

    // Where the camera leans: the cursor, device tilt, or a slow drift.
    let tx = pointer.x
    let ty = pointer.y
    if (opts.reduced) tx = ty = 0
    else if (!opts.finePointer) {
      tx = tilt.live ? tilt.x : Math.sin(time * 0.31) * fx.parallax.drift
      ty = tilt.live ? tilt.y : Math.cos(time * 0.23) * fx.parallax.drift * 0.6
    }
    const follow = 1 - Math.exp(-dt / fx.parallax.lag)
    lean.x += (tx - lean.x) * follow
    lean.y += (ty - lean.y) * follow
    const lensOn = opts.finePointer && !opts.reduced && pointer.inside && state.mode === 'site' && !lite.on
    lean.lens += ((lensOn ? 1 : 0) - lean.lens) * (1 - Math.exp(-dt / 0.15))

    // Warm-up: draw one not-yet-seen stage per frame (see warm()).
    const cold = warming.shift()
    if (cold) {
      seatMascot(cold)
      placeCamera(cold, time)
      cold.beforeRender?.(renderer, camera)
      renderPass.scene = cold.scene
      renderPass.camera = camera
      composer.render(dt)
      measureWash(stages.indexOf(cold))
      if (!warming.length) {
        seatMascot(stages[active])
        mascot.uniforms.uEmber.value = 0
        warmed?.()
      }
    }

    // The screen change, if one is under way (time in seconds since its first frame).
    let snapshot = false
    if (trans) {
      if (trans.t0 < 0) {
        trans.t0 = time
        snapshot = trans.reduced
      } else trans.frames.push(dt * 1000)
      if (!snapshot) tickTransition(trans, time - trans.t0)
    }

    mascot.update(dt, time)
    if (state.mode === 'entry') {
      entry.update(time, dt, opts.finePointer && pointer.inside ? { x: pointer.x, y: pointer.y } : null)
      renderPass.scene = entry.scene
      renderPass.camera = entry.camera
      setProj(entry.camera)
    } else {
      const stage = stages[active]
      stage.update?.(opts.reduced ? 0 : time, dt)
      placeCamera(stage, time)
      if (mascot.root.parent) mascot.uniforms.uTopY.value = mascot.topY()
      entry.followCamera(camera)
      renderPass.scene = stage.scene
      renderPass.camera = camera
      setProj(camera)
      stage.beforeRender?.(renderer, camera)
    }
    entry.tickStreaks(dt)
    post.uTime.value = opts.reduced ? 0 : time
    post.uMouse.value.set(pointer.cx * pr, (height - pointer.cy) * pr, lean.lens)
    // He stays solid through the claw: only a trace of its tear reaches him.
    mascot.uniforms.uGlitch.value = post.uGlitch.value * 0.25
    composer.render(dt)
    // Reduced motion: keep this frame, then fade it out over the new stage.
    if (snapshot && trans && prevTex) {
      renderer.copyFramebufferToTexture(prevTex)
      post.uPrevMix.value = 1
      trans.swapped = true
      swapTo(trans.to)
      trans.onSwap()
    }
  }

  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    pointer.cx = e.clientX
    pointer.cy = e.clientY
    pointer.x = (e.clientX / width) * 2 - 1
    pointer.y = -((e.clientY / height) * 2 - 1)
    pointer.inside = true
  })
  document.documentElement.addEventListener('pointerleave', () => (pointer.inside = false))

  // Device tilt, only where the browser hands it over without asking (not iOS).
  type Gated = { requestPermission?: () => Promise<string> }
  if (!opts.finePointer && !opts.reduced && typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof (DeviceOrientationEvent as unknown as Gated).requestPermission !== 'function') {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma === null || e.beta === null) return
        tilt.live = true
        tilt.x = THREE.MathUtils.clamp(e.gamma / 30, -1, 1)
        tilt.y = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1)
      })
    }
  }

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  resize()
  applyLite()

  return {
    state,
    post,
    entry,
    stages,
    mascot,
    camera,
    get active() {
      return active
    },
    start() {
      if (running) return
      running = true
      last = performance.now() / 1000
      requestAnimationFrame(loop)
    },
    setStage,
    /** Switch from the entry screen to the site, on stage `index`. */
    showSite(index = active) {
      state.mode = 'site'
      active = index
      seatMascot(stages[active])
      stages[active].enter?.(mascot, true)
    },
    /**
     * The screen change (see the top of this file). `onSwap` runs when the stage underneath him
     * changes (the copy and HUD follow it); the promise resolves when input may resume
     * (fx.transition.unlock); the picture keeps settling a little longer.
     */
    go(index: number, onSwap: () => void): Promise<void> {
      return new Promise((resolve) => {
        if (trans) finish(trans)
        if (index === active) return resolve()
        let done = false
        const unlock = () => {
          if (done) return
          done = true
          resolve()
        }
        trans = { from: active, to: index, dir: index > active ? 1 : -1, t0: -1, swapped: false, clip: false, reduced: opts.reduced, cam: { k: 0, bump: 0 }, frames: [], onSwap, unlock }
        if (opts.reduced) return
        pivotOf(stages[active], shared.uPivot.value)
        shared.uSwirl.value = fx.transition.flight.swirl * trans.dir
        post.uClawDir.value = trans.dir
        post.uClawSeed.value = Math.random() * 100
        mascot.root.visible = true
      })
    },
    /**
     * Draws every stage once, one per frame, so shaders are compiled and
     * buffers are on the GPU before anyone visits them. Call it while the
     * loader covers the page.
     */
    warm(): Promise<void> {
      return new Promise((resolve) => {
        renderer.compile(entry.scene, entry.camera)
        warming = [...stages]
        warmed = resolve
        // His embers are drawn only mid-change; show them while warming so their shader is ready too.
        mascot.uniforms.uEmber.value = 0.5
      })
    },
    /** The clickable thing under a screen point in the active stage, if any. */
    pick(clientX: number, clientY: number): Clickable | null {
      if (state.mode !== 'site') return null
      const list = stages[active].clickables
      if (!list?.length) return null
      ndc.set((clientX / width) * 2 - 1, -((clientY / height) * 2 - 1))
      ray.setFromCamera(ndc, camera)
      for (const c of list) if (ray.intersectObject(c.object, true).length) return c
      return null
    },
    /** For the ?debug overlay. */
    info() {
      const where = state.mode === 'entry' ? 'entry' : stages[active].id
      return (
        `${where} · ${Math.round(width * pr)}×${Math.round(height * pr)} @${pr}x · points ${pointCount().toLocaleString()} built${liteOn && !builtThin() ? ', half drawn' : ''} · bloom ${bloom.enabled ? 'on' : 'off'}` +
        `\nCHANGE ${trans ? 'under way…' : lastStats || 'none yet'}`
      )
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
