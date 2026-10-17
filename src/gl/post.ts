import * as THREE from 'three'
import { fx } from '../fx-config'

/**
 * The last full-screen pass, after bloom. For every device pixel:
 *
 *   glitch tear → cursor lens (invisible magnifier) → chromatic aberration
 *   (grows toward the edges, plus a burst on the enter flash) → ACES tone
 *   map → vignette → sRGB → 1px film grain → faint diagonal scan → flash/fade
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
      varying vec2 vUv;

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

      void main() {
        vec2 frag = vUv * uRes;
        vec2 p = frag;

        // Glitch: horizontal bands slide sideways for a few frames.
        if (uGlitch > 0.001) {
          float tick = floor(uTime * 24.0);
          float band = floor(frag.y / uRes.y * 22.0 + hash(vec2(tick, 1.0)) * 6.0);
          float torn = step(0.62, hash(vec2(band * 1.7, tick + 3.0)));
          p.x += (hash(vec2(band, tick)) - 0.5) * torn * 0.12 * uRes.x * uGlitch;
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

        col = aces(col * uExposure);
        col *= 1.0 - uVignette * smoothstep(0.1, 1.0, edge);
        col = toSRGB(col);

        col += (hash(floor(frag) + fract(uTime * 7.31) * vec2(91.7, 17.3)) - 0.5) * uGrain;
        vec2 css = floor(frag / uPR);
        col *= 1.0 - uScan * step(mod(css.x + css.y, 3.0), 0.5);

        col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
        col = mix(col, uFadeColor, uFade);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }
}
