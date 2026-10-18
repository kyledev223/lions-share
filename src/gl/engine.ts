import gsap from 'gsap'
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
}

/** One screen's 3D scene. Only the active one is updated and drawn. */
export interface Stage {
  id: string
  scene: THREE.Scene
  camera: StageCamera
  /** Overrides for portrait screens; by default the camera backs off and centres on the mascot. */
  portrait?: Partial<StageCamera>
  mascot?: MascotSpot
  update?(time: number, dt: number): void
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
 * Screen changes go through `go()`: the outgoing points scatter, the mascot
 * dissolves, then the next stage assembles and the mascot scans back in.
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
    /** Transition dolly: +1 pushed in (leaving), −1 pulled back (arriving). */
    dolly: 0,
  }

  let active = 0
  let width = 1
  let height = 1
  let pr = 1
  let liteOn = !lite.on
  const pointer = { x: 0, y: 0, cx: -1e4, cy: -1e4, inside: false }
  const view = { x: 0, y: 0, lens: 0 }
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
  }

  /** Lite mode: half the points (clouds are shuffled, so the first half is an even thinning), no bloom, 1× pixels. */
  function applyLite() {
    if (liteOn === lite.on) return
    liteOn = lite.on
    bloom.enabled = !liteOn
    shared.uSizeK.value = liteOn ? 1.35 : 1.08
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
  function placeCamera(stage: Stage, time: number) {
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
    fwd.subVectors(tgt, pos).normalize()
    right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize()
    up.crossVectors(right, fwd).normalize()
    const b = opts.reduced ? 0 : fx.breathing.amount
    const w = time * fx.breathing.speed * Math.PI * 2
    camera.position
      .copy(pos)
      .addScaledVector(right, view.x * fx.parallax.shift + Math.sin(w) * b)
      .addScaledVector(up, view.y * fx.parallax.lift + Math.sin(w * 1.3 + 1) * b * 0.6)
      .addScaledVector(fwd, state.dolly * 0.5)
    look.copy(tgt).addScaledVector(right, view.x * fx.parallax.shift * 0.25)
    camera.fov = portrait ? fov : fitFov(fov, width / height)
    camera.aspect = width / height
    camera.lookAt(look)
    camera.updateProjectionMatrix()
  }

  const setProj = (cam: THREE.PerspectiveCamera) => {
    shared.uProj.value = (height * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
  }

  // ---- the mascot moves into whichever stage is showing ---------------------------
  function seatMascot(stage: Stage) {
    mascot.root.removeFromParent()
    if (!stage.mascot) return
    const c = stage.mascot
    mascot.root.position.copy(c.pos)
    mascot.root.rotation.set(0, c.rotY, 0)
    mascot.root.scale.setScalar(c.scale ?? 1)
    stage.scene.add(mascot.root)
    mascot.play(c.clip, fx.mascot.crossfade)
    mascot.uniforms.uFloorY.value = c.pos.y
  }

  function setStage(index: number) {
    if (index === active && mascot.root.parent === stages[index].scene) return
    stages[active].leave?.(mascot)
    active = index
    seatMascot(stages[active])
    stages[active].enter?.(mascot, false)
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
    view.x += (tx - view.x) * follow
    view.y += (ty - view.y) * follow
    const lensOn = opts.finePointer && !opts.reduced && pointer.inside && state.mode === 'site' && !lite.on
    view.lens += ((lensOn ? 1 : 0) - view.lens) * (1 - Math.exp(-dt / 0.15))

    // Warm-up: draw one not-yet-seen stage per frame (see warm()).
    const cold = warming.shift()
    if (cold) {
      seatMascot(cold)
      placeCamera(cold, time)
      renderPass.scene = cold.scene
      renderPass.camera = camera
      composer.render(dt)
      if (!warming.length) {
        seatMascot(stages[active])
        warmed?.()
      }
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
    }
    entry.tickStreaks(dt)
    post.uTime.value = opts.reduced ? 0 : time
    post.uMouse.value.set(pointer.cx * pr, (height - pointer.cy) * pr, view.lens)
    mascot.uniforms.uGlitch.value = post.uGlitch.value
    composer.render(dt)
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
     * The screen change: scatter out (with a glitch), swap, assemble in.
     * Resolves when input may resume (~0.9s); the mascot keeps scanning in for a moment longer.
     */
    go(index: number, onSwap: () => void): Promise<void> {
      const tOut = opts.reduced ? 0.15 : fx.transition.out
      const tIn = opts.reduced ? 0.2 : fx.transition.in
      return new Promise((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve })
        if (opts.reduced) {
          tl.to(post.uFade, { value: 1, duration: tOut }, 0)
            .call(() => (setStage(index), onSwap()), [], tOut)
            .to(post.uFade, { value: 0, duration: tIn }, tOut)
          return
        }
        tl.to(shared.uAssemble, { value: 0, duration: tOut, ease: 'power2.in' }, 0)
          .to(post.uGlitch, { value: 1, duration: tOut * 0.8, ease: 'power2.in' }, 0)
          .to(post.uBurst, { value: 0.3, duration: tOut, ease: 'power2.in' }, 0)
          .to(mascot.uniforms.uDissolve, { value: 1, duration: tOut, ease: 'power1.in' }, 0)
          .to(state, { dolly: 1, duration: tOut, ease: 'power2.in' }, 0)
          .call(
            () => {
              setStage(index)
              mascot.uniforms.uDissolve.value = 0
              mascot.uniforms.uMaterialize.value = 0
              state.dolly = -1
              onSwap()
            },
            [],
            tOut,
          )
          .to(shared.uAssemble, { value: 1, duration: tIn + 0.35, ease: 'power3.out' }, tOut)
          .to(state, { dolly: 0, duration: tIn + 0.2, ease: 'power3.out' }, tOut)
          .to(post.uGlitch, { value: 0, duration: tIn * 0.8, ease: 'power2.out' }, tOut)
          .to(post.uBurst, { value: 0, duration: tIn, ease: 'power2.out' }, tOut)
          .to(mascot.uniforms.uMaterialize, { value: 1, duration: fx.transition.intro - 0.1, ease: 'power2.inOut' }, tOut + 0.05)
        // Input comes back after the swap settles, not after the mascot finishes scanning.
        tl.call(resolve, [], tOut + tIn)
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
      return `${where} · ${Math.round(width * pr)}×${Math.round(height * pr)} @${pr}x · points ${pointCount().toLocaleString()} built${liteOn && !builtThin() ? ', half drawn' : ''} · bloom ${bloom.enabled ? 'on' : 'off'}`
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
