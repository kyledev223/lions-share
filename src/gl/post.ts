import * as THREE from 'three'
import { fx } from '../fx-config'

/**
 * The last full-screen pass, after bloom. For every device pixel:
 *
 *   claw shear + glitch tear → cursor lens (invisible magnifier) → chromatic
 *   aberration (grows toward the edges, plus a burst on the enter flash and the
 *   claw) → row smear → ACES tone map → vignette → sRGB → 1px film grain →
 *   faint diagonal scan → claw cuts and their red wash → blacks lifted toward
 *   the wash colour → flash/fade → reduced-motion crossfade
 *
 * The claw (screen changes): three thin, slightly curved cuts drawn across the
 * frame in quick succession, each a crisp gold line with a red glow, the picture
 * sliding a few pixels along it on either side. It lives for `uClawLen` seconds
 * (`uClawT` runs 0 → uClawLen). In lite mode it is a single soft red wipe.
 *
 * The sunburst (jumps): the picture breaks into a mane of cells, rings × spokes round the centre,
 * each a soft dot drawn in from further out, twisted and blurred along its spoke (`uSun` 0–1).
 *
 * Strengths come from src/fx-config.ts.
 */
export function finalPass() {
  return {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPR: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: fx.post.grain },
      uScan: { value: fx.post.scan },
      uAberr: { value: fx.post.aberration },
      uVignette: { value: fx.post.vignette },
      uExposure: { value: fx.post.exposure },
      uGlitch: { value: 0 },
      uBurst: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1.0, 0.9, 0.84) },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0.008, 0.01, 0.03) },
      uMouse: { value: new THREE.Vector3(-1e4, -1e4, 0) },
      uLens: { value: new THREE.Vector4(60, fx.lens.zoom, fx.lens.split, fx.lens.warp) },
      /** Seconds into the claw (< 0: none), its length, strength (1 full, ~0.5 light), direction (+1 forward, −1 back), and a seed. */
      uClawT: { value: -1 },
      uClawLen: { value: fx.transition.claw },
      uClawAmt: { value: 1 },
      uClawDir: { value: 1 },
      uClawSeed: { value: 0 },
      /** Lite mode: the claw is a plain wipe and the rows don't smear. */
      uLite: { value: 0 },
      /** Bright rows smearing sideways, 0–1 (follows the claw). */
      uSmear: { value: 0 },
      /** How far the blacks lift toward `uWash` (display colour), 0–1. */
      uLift: { value: 0 },
      uWash: { value: new THREE.Color(0.2, 0.05, 0.05) },
      // Display values (this part of the pass works after the sRGB encode).
      uDeep: { value: new THREE.Color(fx.palette.deep).convertLinearToSRGB() },
      /** Reduced motion: the previous frame, faded out over the new one. */
      uPrev: { value: null as THREE.Texture | null },
      uPrevMix: { value: 0 },
      /** Jumps: the sunburst, 0–1, and which way it twists (+1 / −1). */
      uSun: { value: 0 },
      uSunDir: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform vec2 uRes;
      uniform float uPR;
      uniform float uTime;
      uniform float uGrain;
      uniform float uScan;
      uniform float uAberr;
      uniform float uVignette;
      uniform float uExposure;
      uniform float uGlitch;
      uniform float uBurst;
      uniform float uFlash;
      uniform vec3 uFlashColor;
      uniform float uFade;
      uniform vec3 uFadeColor;
      uniform vec3 uMouse;   // device px from bottom-left, z = lens strength
      uniform vec4 uLens;    // radius px, zoom, extra split px, warp
      uniform float uClawT;
      uniform float uClawLen;
      uniform float uClawAmt;
      uniform float uClawDir;
      uniform float uClawSeed;
      uniform float uLite;
      uniform float uSmear;
      uniform float uLift;
      uniform vec3 uWash;
      uniform vec3 uDeep;
      uniform sampler2D uPrev;
      uniform float uPrevMix;
      uniform float uSun;
      uniform float uSunDir;
      varying vec2 vUv;

      // The sunburst: the frame as a mane of cells (rings × spokes round the centre), each a soft
      // dot of the picture drawn in from further out, twisted and blurred along its spoke.
      vec3 sunburst(vec2 frag, float s) {
        const float TAU = 6.28318;
        vec2 c = 0.5 * uRes;
        vec2 q = frag - c;
        float R = 0.5 * length(uRes);
        float r = length(q) / R;
        float a = atan(q.y, q.x) / TAU + 0.5;
        float rings = mix(120.0, 16.0, s);
        float spokes = floor(mix(300.0, 44.0, s));
        vec2 cell = vec2(r * rings, a * spokes);
        vec2 local = fract(cell) - 0.5;
        float rc = (floor(cell.x) + 0.5) / rings;
        float ac = ((floor(cell.y) + 0.5) / spokes - 0.5) * TAU + ${fx.transition.jump.twist.toFixed(3)} * s * uSunDir;
        float rs = rc * (1.0 + 0.65 * s);
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float rr = rs * (1.0 - 0.12 * s * float(i) / 5.0);
          acc += texture2D(tDiffuse, (c + vec2(cos(ac), sin(ac)) * rr * R) / uRes).rgb;
        }
        acc /= 6.0;
        float dotm = smoothstep(0.62, 0.15, length(local * vec2(1.0, 0.8)));
        return acc * mix(0.82, 1.2, dotm) * mix(vec3(1.0), vec3(1.14, 0.98, 0.72), s) + vec3(0.9, 0.62, 0.22) * 0.05 * s * dotm;
      }

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      // One claw cut: x = distance across it (px, signed), y = strength there (drawn, alive, tapered).
      vec2 cut(vec2 frag, float i) {
        // A light claw (amount under 0.75) makes two cuts, not three.
        if (i > 1.5 && uClawAmt < 0.75) return vec2(1e4, 0.0);
        float h1 = hash(vec2(uClawSeed, i * 7.1 + 1.0));
        float h2 = hash(vec2(uClawSeed + 3.7, i * 3.3 + 2.0));
        // From top-right to bottom-left going forward (mirrored going back), each a little steeper or shallower.
        vec2 d = normalize(vec2(-uClawDir, -0.6 - 0.16 * h1));
        vec2 n = vec2(-d.y, d.x);
        vec2 q = frag - 0.5 * uRes;
        float u = dot(q, d) / (0.34 * length(uRes)) + (h1 - 0.5) * 0.3;
        float off = ((i - 1.0) * 0.12 + (h2 - 0.5) * 0.05) * uRes.y;
        float bend = (0.05 + 0.04 * h2) * uRes.y;
        float v = dot(q, n) - off - bend * (u * u - 0.35);
        // Each one is drawn in 50ms, the next 30ms behind it, and all are gone by the end.
        float tau = uClawT - i * 0.03;
        float life = sin(3.14159 * clamp(tau / (uClawLen - i * 0.03), 0.0, 1.0));
        float k = clamp(tau / 0.05, 0.0, 1.0);
        float head = mix(-1.15, 1.15, 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k));
        float drawn = 1.0 - smoothstep(head - 0.015, head, u);
        float taper = pow(max(0.0, 1.0 - u * u), 0.6);
        return vec2(v, life * drawn * taper * uClawAmt);
      }

      void main() {
        vec2 frag = vUv * uRes;
        vec2 p = frag;
        float claw = uClawT >= 0.0 ? sin(3.14159 * clamp(uClawT / uClawLen, 0.0, 1.0)) : 0.0;
        claw *= claw;

        // The claw: the picture slides along each cut, opposite ways on either side.
        vec2 cuts[3];
        cuts[0] = cuts[1] = cuts[2] = vec2(0.0);
        if (uClawT >= 0.0 && uLite < 0.5) {
          for (int i = 0; i < 3; i++) {
            cuts[i] = cut(frag, float(i));
            vec2 d = normalize(vec2(-uClawDir, -0.68));
            p += d * sign(cuts[i].x) * 6.0 * uPR * cuts[i].y * exp(-abs(cuts[i].x) / (36.0 * uPR));
          }
        }

        // Glitch: horizontal bands slide sideways for a few frames.
        if (uGlitch > 0.001) {
          float tick = floor(uTime * 24.0);
          float band = floor(frag.y / uRes.y * mix(18.0, 60.0, hash(vec2(tick, 9.0))) + hash(vec2(tick, 1.0)) * 6.0);
          float torn = step(0.62, hash(vec2(band * 1.7, tick + 3.0)));
          p.x += (hash(vec2(band, tick)) - 0.5) * torn * 0.1 * uRes.x * uGlitch;
        }

        // Lens: gentle magnification toward the cursor, fading to nothing at the edge.
        vec2 d = p - uMouse.xy;
        float r = length(d) / uLens.x;
        float k = uMouse.z * (1.0 - smoothstep(0.0, 1.0, r));
        k *= k * (3.0 - 2.0 * k);
        p = uMouse.xy + d / mix(1.0, uLens.y, k);
        p += normalize(d + 1e-5) * sin(r * 9.0 - uTime * 3.0) * uLens.w * uLens.x * k;

        vec2 uv = p / uRes;
        vec2 dir = uv - 0.5;
        float edge = dot(dir, dir) * 2.0;
        float split = (uAberr * edge + uBurst * 16.0 * (0.25 + edge) + uGlitch * 5.0 + uLens.z * k) * uPR;
        vec2 off = normalize(dir + 1e-5) * split / uRes;
        vec3 col = vec3(
          texture2D(tDiffuse, uv + off).r,
          texture2D(tDiffuse, uv).g,
          texture2D(tDiffuse, uv - off).b
        );

        // Jumps: the sunburst takes over the picture.
        if (uSun > 0.001) col = mix(col, sunburst(frag, uSun), smoothstep(0.0, 0.2, uSun));

        // Row smear: in some bands the bright parts streak sideways.
        if (uSmear > 0.001) {
          float tick = floor(uTime * 12.0);
          float row = floor(frag.y / uRes.y * mix(24.0, 70.0, hash(vec2(tick, 4.0))) + tick * 7.0);
          if (hash(vec2(row, 5.0)) > 0.66) {
            vec3 s = col;
            float step1 = (hash(vec2(row, 6.0)) - 0.5) * 2.0 * 16.0 * uPR * uSmear / uRes.x;
            for (int j = 1; j <= 6; j++) s = max(s, texture2D(tDiffuse, uv + vec2(step1 * float(j), 0.0)).rgb * (1.0 - float(j) * 0.12));
            col = mix(col, s, uSmear);
          }
        }

        col = aces(col * uExposure);
        col *= 1.0 - uVignette * smoothstep(0.1, 1.0, edge);
        col = toSRGB(col);

        col += (hash(floor(frag) + fract(uTime * 7.31) * vec2(91.7, 17.3)) - 0.5) * uGrain * (1.0 + claw);
        vec2 css = floor(frag / uPR);
        col *= 1.0 - uScan * step(mod(css.x + css.y, 3.0), 0.5);

        // The claw's deep-red wash, then the cuts themselves: a crisp gold core in a red glow.
        if (uClawT >= 0.0) {
          col = mix(col, col * 0.85 + uDeep * 0.5, claw * 0.3 * uClawAmt);
          if (uLite > 0.5) {
            vec2 dw = normalize(vec2(-uClawDir, -0.68));
            float across = dot(frag - 0.5 * uRes, vec2(-dw.y, dw.x)) / uRes.y;
            float band = exp(-pow((across - mix(-1.1, 1.1, uClawT / uClawLen)) / 0.09, 2.0));
            col = mix(col, col * 0.7 + uDeep * 0.9 + vec3(0.2, 0.12, 0.04) * band, band * uClawAmt * 0.8);
          } else {
            for (int i = 0; i < 3; i++) {
              float a = cuts[i].y;
              if (a <= 0.0) continue;
              float w = (1.0 + 0.9 * hash(vec2(uClawSeed, float(i)))) * uPR;
              float core = 1.0 - smoothstep(w, w + uPR, abs(cuts[i].x));
              float halo = exp(-abs(cuts[i].x) / (2.5 * uPR + w * 1.5));
              float bloom = exp(-abs(cuts[i].x) / (10.0 * uPR));
              col += vec3(0.9, 0.22, 0.12) * bloom * a * 0.22 + vec3(1.0, 0.62, 0.25) * halo * a * 0.5;
              col = mix(col, vec3(1.0, 0.9, 0.66), core * a);
            }
          }
        }

        // Mid-change, the blacks lift toward the wash colour (never down to black).
        col += uWash * uLift * (1.0 - col);

        col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
        col = mix(col, uFadeColor, uFade);
        if (uPrevMix > 0.0) col = mix(col, texture2D(uPrev, vUv).rgb, uPrevMix);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }
}
