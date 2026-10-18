/**
 * Every knob for the look, in one place. Change a number, save, and the dev
 * server reloads.
 *
 * The picture is rendered crisp at the device pixel ratio (capped), with no
 * pixelation. Environments are glowing point clouds (gl/points.ts); the mascot
 * is a hologram (gl/mascot.ts). One full-screen pass (gl/post.ts) adds
 * bloom, film grain, a faint diagonal scan texture, colour fringing toward
 * the edges and a vignette.
 */
export const fx = {
  /** Highest device pixel ratio the canvas renders at (3 = every current device at its native resolution). */
  maxPixelRatio: 3,

  palette: {
    /** Primary. */
    red: '#E5232F',
    /** The light red, for highlights and pale accents. */
    light: '#FF6B6B',
    /** Deep red, for the darkest tints. */
    deep: '#5A0A12',
    white: '#FFF4EC',
    gold: '#C9A24A',
  },

  bloom: {
    /** Overall glow strength. 0 turns it off. */
    strength: 0.7,
    /** How far the glow spreads, 0–1. */
    radius: 0.55,
    /** Brightness above which things start to glow (linear, before tone mapping). */
    threshold: 0.62,
  },

  post: {
    /** Animated 1px film grain, 0–1. */
    grain: 0.075,
    /** Faint diagonal scan texture, 0–1. */
    scan: 0.06,
    /** Colour-channel offset at the screen corners, in CSS pixels. */
    aberration: 2.4,
    /** Darkening toward the corners, 0–1. */
    vignette: 0.42,
    /** Exposure before tone mapping. */
    exposure: 1.0,
  },

  /** The invisible magnifier that follows the cursor (mouse only). */
  lens: {
    diameterAt1080: 120,
    zoom: 1.12,
    split: 1.6,
    warp: 0.03,
  },

  /** Camera response to the cursor (or slow auto-drift on touch screens). */
  parallax: { shift: 0.22, lift: 0.12, lag: 0.5, drift: 0.5 },
  /** Slow handheld "breathing" of the camera. */
  breathing: { amount: 0.03, speed: 0.18 },

  /** The mascot: PBR shading (once lion.glb exists), with the hologram on top. */
  holo: {
    /** Key light (from the camera's upper left), fill (right), back light (outline). */
    key: 1.6,
    fill: 0.45,
    back: 0.6,
    /** Reflections of a soft room: shoes, tie. */
    env: 0.3,
    /** How much the baked ambient occlusion also darkens direct light, 0–1. */
    aoDirect: 0.55,
    /** Brightest his lit surface gets (linear). Below the bloom threshold, so his face and shirt never glow. */
    ceiling: 0.58,
    /** Red sheen on the darkest parts of the mane toward their edges. */
    sheen: 0,
    /** Red rim glow strength, and how tight it hugs the silhouette (higher = tighter). */
    rim: 0.18,
    rimPower: 8,
    /** Horizontal scan bands per metre of height. */
    bands: 46,
    /** Band darkness, 0–1. */
    bandDepth: 0.06,
    /** Upward band speed, metres per second. */
    bandSpeed: 0.05,
    /** The slow bright band that sweeps up him every few seconds. */
    sweep: 0.04,
    /** Seconds between flickers (randomised ±50%). */
    flickerEvery: 10,
    /** Depth of a flicker, 0–1. */
    flicker: 0.14,
    /** Height above the floor (metres) over which his legs fade into the glow, and how far they fade, 0–1. */
    floorFade: 0.36,
    floorGlow: 0.5,
  },

  /** How the lion moves. */
  mascot: {
    /** Playback speed per clip: gestures at about 0.8×, idles at about 0.9×, so he reads as composed. */
    speed: {
      idle: 0.9,
      'sitting-idle': 0.9,
      presenting: 0.8,
      walking: 0.9,
      reaching: 0.8,
      'looking-up': 0.9,
      toast: 0.8,
      typing: 0.9,
      'looking-at-hand': 0.9,
      greeting: 0.8,
    },
    /** Crossfade between clips on a screen change, seconds. */
    crossfade: 0.6,
    /** Seconds (of clip time) at the end of each loop that ease back into its first frame. */
    loopEase: 0.7,
    /** Radians his gaze lifts on top of the looking-up clip (split between neck and head). */
    lookUp: 0.5,
  },

  /** Particle budget. Lite mode halves every count. */
  particles: {
    /** Global multiplier on every scene's point counts. */
    density: 0.85,
    /** Base point size, in CSS pixels at 1 unit distance. */
    size: 1,
  },

  /** The entry screen. */
  entry: {
    /** Points in the star field. */
    field: 82000,
    /** Points in the lion's head inside the orb. */
    symbol: 11000,
    /** Points in the orb's shell (its band gets about half as many). */
    orb: 16000,
    /** How hard the cursor pushes nearby stars. */
    push: 0.07,
    /** Hyperspace streaks. */
    streaks: 2200,
  },

  /**
   * Screen transitions ("the pounce"). Times are seconds from the input. The lion stays on screen:
   * the camera swings round him while the old stage swirls away, the frame is cut by the claw at
   * `swap`, and the new stage settles in around him.
   */
  transition: {
    /** The stage changes here, under the claw. */
    swap: 0.49,
    /** Input is accepted again. */
    unlock: 0.95,
    /** Everything has settled. */
    end: 1.3,
    /** His clip starts crossfading to the next screen's at `at`, over `fade`; the old pose layer releases over `release`. */
    clip: { at: 0.1, fade: 0.8, release: 0.38 },
    /** Camera journey, as fractions of his distance / metres at his scale / degrees, at the midpoint. */
    camera: { pull: 0.35, rise: 0.35, fov: 6, end: 1.25 },
    /** Points fly out over `out` and settle over `in` (seconds), swirling `swirl` radians round him at most. */
    flight: { out: [0.1, 0.49] as [number, number], in: [0.49, 1.2] as [number, number], swirl: 1.1 },
    /** How far props and lights dim at the swap (1 = not at all). */
    presence: 0.55,
    /** The claw: how long the hit lasts, centred on `swap`. */
    claw: 0.15,
    /** How far the blacks lift toward the wash colour at the midpoint, 0–1. */
    lift: 0.3,
    /** Gold embers off his silhouette, rising from and settling back to nothing over this window. */
    embers: [0.2, 0.98] as [number, number],
    /** Reduced motion: a plain crossfade. */
    reducedFade: 0.4,
  },
}

export type Fx = typeof fx
