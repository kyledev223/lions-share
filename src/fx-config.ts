/**
 * Every knob for the look, in one place. Change a number, save, and the dev
 * server reloads.
 *
 * The picture is rendered crisp at the device pixel ratio (capped), with no
 * pixelation. Environments are glowing point clouds (gl/points.ts); the crow
 * is PBR-shaded with a hologram on top (gl/crow.ts). One full-screen pass (gl/post.ts) adds
 * bloom, film grain, a faint diagonal scan texture, colour fringing toward
 * the edges and a vignette.
 */
export const fx = {
  /** Highest device pixel ratio the canvas renders at. */
  maxPixelRatio: 2,

  palette: {
    blue: '#2F7BFF',
    pale: '#8CB4FF',
    white: '#EEF3FF',
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
    /** Red/blue offset at the screen corners, in CSS pixels. */
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

  /** The crow: PBR shading, with the hologram on top. */
  holo: {
    /** Key light (from the camera's upper left), fill (right), cool back light (outline). */
    key: 1.6,
    fill: 0.45,
    back: 0.6,
    /** Reflections of a soft room: shoes, beak, tie. */
    env: 0.3,
    /** How much the baked ambient occlusion also darkens direct light, 0–1. */
    aoDirect: 0.55,
    /** Brightest his lit surface gets (linear). Below the bloom threshold, so his face and shirt never glow. */
    ceiling: 0.58,
    /** Blue sheen on the dark feathers toward their edges. */
    sheen: 0.18,
    /** Blue rim glow strength, and how tight it hugs the silhouette (higher = tighter). */
    rim: 0.26,
    rimPower: 5,
    /** Horizontal scan bands per metre of height. */
    bands: 46,
    /** Band darkness, 0–1. */
    bandDepth: 0.14,
    /** Upward band speed, metres per second. */
    bandSpeed: 0.05,
    /** The slow bright band that sweeps up him every few seconds. */
    sweep: 0.1,
    /** Seconds between flickers (randomised ±50%). */
    flickerEvery: 4,
    /** Depth of a flicker, 0–1. */
    flicker: 0.3,
    /** Height above the floor (metres) over which his legs fade into the glow, and how far they fade, 0–1. */
    floorFade: 0.42,
    floorGlow: 0.6,
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
    /** Points in the crow's head inside the orb. */
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
