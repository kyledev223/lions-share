# Lion's Share ($ROAR)

*Take the lion's share.*

A twelve-screen, full-viewport site for a **fictional** community art project. No real token, contract, company or people are involved. Every quote comes from a made-up lion.

Every environment is built from glowing points: outlines of rooms, floors, props, charts, text and the emblem, mostly white and red with gold accents, under soft bloom, fine film grain and a little colour fringing toward the edges. The mascot is a lion in a suit, shown as a hologram, with a different animation on each screen. The site opens on a star field around a glass orb of points with the lion's head inside. Built with Vite, vanilla TypeScript, Three.js and GSAP. The music is generated in the browser and the fonts are bundled.

**The lion model isn't in yet.** Until `public/assets/lion/lion.glb` exists, every screen shows a dark hologram silhouette of a suited figure, labelled "lion.glb pending" (see [The mascot](#the-mascot-npm-run-mascot)).

## Run it

```bash
npm install
npm run dev       # dev server, http://localhost:5173
npm run dev:phone # same, but reachable from your phone, with a QR code
npm run mascot    # build the lion from assets-raw/lion/ (see below)
npm run build     # regenerate share images, type-check, build to dist/
npm run preview   # serve the built site
npm run og        # regenerate the share image on its own
```

Needs Node 22.18 or newer. `npm run mascot` also needs Blender 4.2 or newer.

## The mascot: `npm run mascot`

**Until the lion arrives.** `src/gl/mascot.ts` tries to load `/assets/lion/lion.glb`. If the file isn't there, it builds a placeholder instead: a dark hologram silhouette of a suited figure (jacket, white shirt, red tie, a mane of angular rays), posed for each screen's clip, with a small "LION.GLB PENDING" label over its head. It has the same bone names as a Mixamo rig, so the glass on screen 08, the phone on 09 and the coin on 10 follow its hands. Once `lion.glb` exists, the site uses it with no code changes.

**Building the lion.** Source files go in `assets-raw/lion/`:

| File | What it is |
|---|---|
| the generated model (`.fbx`) | kept for reference; the rigged copy inside the Mixamo files is what's used |
| `lion-apose.png` | the front image the model was generated from; it becomes his texture |
| `idle.fbx`, `sitting-idle.fbx`, `clapping.fbx`, `walking.fbx`, `reaching.fbx`, `looking-up.fbx`, `toast.fbx`, `typing.fbx`, `looking-at-hand.fbx`, `waving.fbx` | Mixamo exports on the same rig, one clip each |

Drop the files in and run `npm run mascot`. It writes `public/assets/lion/lion.glb` and previews in `assets-raw/lion/preview/`. Step by step:

1. **Renames** Mixamo's names to the slugs above ("Breathing Idle.fbx" → `idle.fbx`, "Drinking.fbx" → `toast.fbx`, and so on; the table is `RENAMES` in `scripts/mascot.mjs`).
2. **Blender** (`scripts/mascot/build.py`, run headless):
   - takes the skinned mesh and rig from one clip file, scales him to 1.9 m, triangulates and drops the FBX's split normals;
   - **unwraps it with xatlas** (`scripts/mascot/unwrap.py`, run in Blender's own Python outside Blender). The atlas is cached in `preview/uv-*.npz`, so later runs are much faster. xatlas is pip-installed into `.venv-assets/blender-py/` on first use;
   - **projects `lion-apose.png` onto the bind pose from the front**, orthographically, fitted to the model's silhouette and then warped so the limbs' edges line up; the fit is saved as `preview/projection-fit.png`;
   - gives every vertex a **region** from bone weights plus the colour the front sees: **mane**, **fur** (face and hands), **suit**, **shirt**, **tie**, **shoes**. The face is found from the muzzle (the head's most forward point); behind the head it is all mane. `preview/regions-*.png` shows them;
   - fills what the front can't see with **region colours** (half the named colour, half the photo's): golden-tan fur `#C08A3E`, a darker mane `#7A4F1E`, charcoal suit, white shirt, `#E5232F` tie, black shoes. It carries the photo's local shade across the seam and adds **procedural detail in 3D**: fabric grain and twill on the suit, strands radiating out through the mane with golden tips, a fine grain on the fur;
   - bakes **ambient occlusion and roughness** into a second texture for PBR (glossy shoes, silky tie, matte suit and fur);
   - pulls every clip onto the one rig as a named animation and exports a single `.glb`;
   - renders `preview/turntable-{front,three-quarter,side,back}.png`.
3. **glTF-Transform** attaches the AO/roughness texture, converts both textures to WebP, prunes, resamples, quantises and meshopt-compresses it.

Blender is found via `$BLENDER`, then `PATH`, then the usual install folders (and `~/tools/blender-*`). The portable zip from <https://www.blender.org/download/> works. `MASCOT_TEX=4096` bakes bigger textures; `MASCOT_STOP=fit` or `MASCOT_STOP=texture` stops early to check the projection or the bake.

**On the site** each clip is cleaned on load: the hips lose any travel (so every clip stays on his spot) and the last half second of every track blends into its first frame, so loops never pop. Clips crossfade on screen changes.

## Where things live

```
index.html              canvas, loader, entry, HUD, lightbox
src/
  main.ts               boot order and wiring
  fx-config.ts          EVERY strength for the look: palette, bloom, grain, scan, fringing, hologram, particle budget
  screens.ts            the twelve screens: names, hashes, corner labels, all the copy, the post cards
  nav.ts                one gesture = one screen (wheel, trackpad, keys, swipe, rail, hashes)
  boot.ts               loader → entry → the enter sequence
  brand/symbol.svg      the emblem (also the favicon, the entry, screens 03, 07, 10, 12)
  gl/
    engine.ts           renderer, composer (scene → bloom → final), cameras, transitions, lite mode
    points.ts           the point-cloud material and builder every environment uses
    shapes.ts           lines, rings, panels, boxes, discs, and text/SVG sampled into points
    mascot.ts           loads lion.glb (PBR + hologram) or builds the placeholder figure; lights, clips, flicker
    entry.ts            star field, the orb (shell, notched band, lion head) in points, vortex, shockwave, hyperspace streaks
    post.ts             the final pass: tone map, grain, scan texture, fringing, vignette, flash, glitch, lens
    scenes.ts           the twelve stages, in page order
    ring.ts             the 3D meme ring (drag, inertia, snap)
  cursor.ts             ring + dot cursor (shows DRAG over the meme ring)
  lightbox.ts           meme viewer
  config.ts             contract address, links, stats
  token.ts              turns config into controls (greyed out until a value is set)
  audio.ts              generated music, the enter riser and bass hit, the music pill
  lite.ts               decides when lite mode is on
  debug.ts              the ?debug overlay
  memes/                the meme list and the drawn placeholder cards
  style.css             tokens on :root, then one block per piece of UI
scripts/
  mascot.mjs, mascot/build.py, mascot/unwrap.py   the `npm run mascot` pipeline
  dev-phone.mjs         the `dev:phone` server and QR code
  og.mjs                share image and icons
assets-raw/lion/        mascot source files (never shipped)
public/assets/lion/     lion.glb, written by npm run mascot
```

## The twelve screens

| # | Hash | Screen | Mascot | Environment (all points) |
|---|---|---|---|---|
| 01 | `#lion` | The lion | sitting-idle, on a throne in a red floor ring | a throne room: columns, pointed windows, red banners, a dais and a runner |
| 02 | `#name` | Why the name | — | "THE LION'S SHARE" in giant 3D points, slowly turning; a glowing gold coin rising at the bottom edge |
| 03 | `#stage` | On stage | clapping | spotlight cone, mic stand, gold-dust audience, a dot-matrix screen showing the emblem |
| 04 | `#hunt` | The hunt | walking, side view | a savanna horizon drawn in candlesticks, an acacia, a low striped sun; the floor scrolls under him |
| 05 | `#pride` | The pride | idle, behind a glowing rail | drifting strips of "$ROAR" and "THE PRIDE" |
| 06 | `#foryou` | For you | reaching, close up | a tunnel of rings, a halo behind his head |
| 07 | `#summit` | The summit | looking-up, small, from behind | a red beam from above, the emblem huge and tilted, ridgelines below |
| 08 | `#cheers` | Cheers | toast, close up, with a coupe of gold fizz | fireworks in gold and red |
| 09 | `#ask` | Ask the lion | typing on a glowing phone | drifting questions |
| 10 | `#token` | The token | looking-at-hand, a coin above his palm | drifting gold coins, the emblem |
| 11 | `#memes` | The memes | idle | the meme ring around him, gold dust on the floor |
| 12 | `#join` | Join the pride | waving | the emblem behind him, gold light lines |

The hologram is the same on the lion and the placeholder: faint bands drifting upward, a thin red rim, legs fading into the floor glow, a flicker every few seconds; he scans in from the top on arrival and dissolves on the way out.

Copy for all of them is in `src/screens.ts`; wrap a phrase in `{{double braces}}` to highlight it in red. The "posts" are generic cards on a made-up network called the Watering Hole.

### Getting around

- **One gesture, one screen.** A wheel flick, a trackpad swipe, a touch swipe or a key press moves exactly one screen; twelve flicks take you through. Input is locked for the ~0.9s transition.
- **Transitions.** The outgoing points scatter and the mascot dissolves, with a short glitch and colour burst; the next screen assembles and he scans back in.
- **Keys.** Arrow down/up, Page Down/Up, Space / Shift+Space step one screen; Home and End go to the ends.
- **Rail.** Twelve ticks on the right edge; hover for a name, click to jump. A slim strip on phones.
- **Links.** Every screen has a hash (`…/#hunt`), and Back/Forward move between screens.

## Tuning the look: `src/fx-config.ts`

| Setting | What it does |
|---|---|
| `palette` | The particle colours: red `#E5232F`, light `#FF6B6B`, deep `#5A0A12`, warm white, gold `#C9A24A` |
| `bloom.*` | Glow strength, spread and threshold |
| `post.*` | Film grain, diagonal scan texture, edge fringing (px), vignette, exposure |
| `lens.*` | The invisible cursor magnifier |
| `parallax.*`, `breathing.*` | How the camera follows the cursor, and its slow drift |
| `holo.*` | The mascot's lights, reflections, brightness ceiling, then the hologram: rim, bands, sweep, flicker, floor fade |
| `particles.density` | Global multiplier on every point count |
| `entry.*` | Star field, orb and lion-head point counts, cursor push, streaks |
| `transition.*` | Out / in / intro timings |

The particle mixes (mostly white and red, a fair share of gold) are `sparkle`, `goldMix` and `redMix` in `src/gl/shapes.ts`. UI colours are tokens at the top of `src/style.css` (`--red`, `--light`, `--deep`, `--glow`, `--gold`).

## The enter sequence (`src/boot.ts`)

About 3.8s; click or Esc skips to the end. The buttons drop away, the star field spirals into the orb, it implodes, a shockwave and a warm white flash, hyperspace streaks, then the streaks settle into screen 01's throne room as the mascot scans in. Reduced motion gets a 0.6s fade instead. "Enter without sound" is the same picture, silent.

## Going live: contract address, buy buttons, links

Everything is driven by `src/config.ts`:

```ts
contractAddress: null,   // e.g. '0xAbC…123'
buyUrl: null,            // e.g. 'https://…'
explorerUrl: null,       // e.g. 'https://…/token/0xAbC…123'
communityUrl: '#',       // "Join the pride" / "Bring a meme to the den"
followUrl: '#',          // "Follow the roar" and the X button in the corner
```

While a value is `null` (or `'#'` for the links), its controls show greyed out with a "Coming soon" tag and do nothing. Fill a value in and they turn on: the CA pills copy to the clipboard and the buy/explorer/community buttons become real links. They live in the bottom-right corner, on screen 10, 11 (the meme link) and 12. The token stats on screen 12 are the `stats` list (Chain and Rewards say TBA for now).

## Test on a phone

1. Put the phone on the **same Wi-Fi** as this computer.
2. Run `npm run dev:phone`. It prints a QR code and an address like `http://192.168.x.x:5173/`.
3. Scan the QR code with the phone's camera and open the link. It opens with the debug overlay on.

If it doesn't load: pause any VPN (or allow LAN access in it), allow Node.js through Windows Firewall on Private and Public networks, and avoid guest Wi-Fi (client isolation). Copy-to-clipboard needs `https`, so test that on the deployed site.

## Debug overlay and URL switches

| URL | What it does |
|---|---|
| `?debug` | Corner overlay: live FPS, lite mode and why, audio state, track, and the current screen with render size, pixel ratio, points built and whether bloom is on |
| `?lite=1` | Forces lite mode on (half the points are built, no bloom, 1× pixels) |
| `?lite=0` | Forces lite mode off |

## Deploy

This folder is linked to its own Vercel project, **lions-share** (`.vercel/project.json`, git-ignored). Deploy with `npx vercel` (preview) or `npx vercel --prod`, or connect the GitHub repo in the Vercel dashboard so every push builds. Vercel detects Vite on its own; `netlify.toml` is there if you'd rather use Netlify.

The share card needs an absolute image URL. The build picks up the site's address from the host automatically (Vercel: `VERCEL_PROJECT_PRODUCTION_URL`; Netlify: `URL`). To override it, set `VITE_SITE_URL` in `.env` or in the host's environment settings, with no trailing slash.

## Share image and meta tags

`npm run og` (also the first step of `npm run build`) writes `public/og.png` (1200×630: the emblem, "LION'S SHARE" and the tagline) and the home-screen icon (from `public/favicon.svg`). Both are drawn from `src/brand/symbol.svg`, so they follow the emblem.

## Other things to swap

**Memes.** Drop image files (png, jpg, webp, gif, avif) into `src/memes/`. They are picked up automatically, sorted by filename, and replace the drawn placeholders one for one. Prefix with `01-`, `02-`… to set the order. Add alt text per file in the `ALT` map in `src/memes/index.ts`. Portrait 4:5 images fit the frames best.

**Music.** `src/audio.ts` synthesises three looping tracks (Savanna at Dusk, Golden Mane, Long Grass). To add or change one, edit the `TRACKS` array; its loudness is measured and matched automatically. Overall volume is `LEVEL`.

**The emblem.** `src/brand/symbol.svg`: a geometric lion head facing forward, its mane as angular rays, inside a notched coin ring. The entry screen and screens 03, 07, 10 and 12 sample it into points at load, and the entry orb uses it without the ring (the first `<circle>`), so keep the ring as that first circle. `public/favicon.svg` is the same emblem on a dark disc; update it by hand.

**Type.** Headlines are Archivo at width 125, weight 900; body is Archivo; labels are JetBrains Mono.

## Behaviour notes

- **Loader and entry.** A big 000 → 100 counter ("Gathering the pride…") while every scene is built and drawn once behind it, so nothing stutters later. Then the star field: near stars move more as the cursor leans the camera, and stars near the cursor drift out of its way. Audio starts inside the Enter click, as browsers require.
- **Mouse.** An invisible lens around the cursor magnifies the picture slightly. The cursor is a thin ring with a dot that grows over anything clickable, dims over disabled controls, and says DRAG over the meme ring.
- **Touch.** No lens. The camera drifts slowly, or follows device tilt where the browser allows it without asking (not iOS). Portrait screens frame the mascot in the top half and the copy in the bottom.
- **Lite mode.** For the first 1.5 seconds the site times its frames. A median under 30fps turns lite mode on: half the points drawn, no bloom, 1× pixels, no lens. If the device then holds 50+ fps for 3 seconds, full quality returns.
- **Reduced motion.** With `prefers-reduced-motion` there is no scroll-jacking: the twelve screens are an ordinary page that snaps one screen at a time, the entry is a 0.6s fade, and particles, bands and the lens hold still.
- **No WebGL.** The scenes need WebGL 2. Every current browser has it.

## Disclaimer

A fictional community art project. Lion's Share, Leona Gold, Rex Mane, Marlo Kopje, the Great Hall, the Watering Hole and every lion quoted here are made up. Not affiliated with any company or person. Nothing here is financial advice.
