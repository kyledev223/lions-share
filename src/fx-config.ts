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

  /** Screen transitions (seconds). */
  transition: { out: 0.4, in: 0.5, intro: 1.2 },
}

export type Fx = typeof fx
