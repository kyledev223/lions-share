# Coupon Crows ($CROW)

A twelve-screen, full-viewport site for a **fictional** community art project. No real token, contract, company or people are involved. Every quote is from a made-up bird.

Every environment is built from glowing points: outlines of rooms, floors, props, charts, text and the emblem, mostly white and blue with gold accents, under soft bloom, fine film grain and a little colour fringing toward the edges. The crow is a real rigged 3D model, PBR-shaded with a light hologram treatment on top, with a different animation on each screen. The site opens on a star field around a glass orb of points with the crow's head inside. Built with Vite, vanilla TypeScript, Three.js and GSAP. The music is generated in the browser and the fonts are bundled.

## Run it

```bash
npm install
npm run dev       # dev server, http://localhost:5173
npm run dev:phone # same, but reachable from your phone, with a QR code
npm run crow      # rebuild the crow model from assets-raw/crow/ (see below)
npm run build     # regenerate share images, type-check, build to dist/
npm run preview   # serve the built site
npm run og        # regenerate the share image on its own
```

Needs Node 22.18 or newer. `npm run crow` also needs Blender 4.2 or newer (see below).

## The crow: `npm run crow`

Source files live in `assets-raw/crow/`:

| File | What it is |
|---|---|
| `Meshy_AI_…fbx` | the model as generated (kept for reference; the rigged copy inside the Mixamo files is what's used) |
| `crow-apose.png` | the front image the model was generated from; it becomes his texture |
| `idle.fbx`, `sitting-idle.fbx`, `clapping.fbx`, `walking.fbx`, `reaching.fbx`, `looking-up.fbx`, `toast.fbx`, `typing.fbx`, `looking-at-hand.fbx`, `waving.fbx` | Mixamo exports on the same rig, one clip each |

Drop new files in and run `npm run crow`. It writes `public/assets/crow/crow.glb` (about 4.6 MB: the full 441k-triangle mesh, two 2048px textures, ten clips) and previews in `assets-raw/crow/preview/`. Step by step:

1. **Renames** Mixamo's names to the slugs above ("Breathing Idle.fbx" → `idle.fbx`, "Drinking.fbx" → `toast.fbx`, and so on; the table is `RENAMES` in `scripts/crow.mjs`).
2. **Blender** (`scripts/crow/build.py`, run headless):
   - takes the skinned mesh and rig from one clip file, scales him to 1.9 m, triangulates and drops the FBX's split normals (which would split every vertex);
   - **unwraps it with xatlas** (`scripts/crow/unwrap.py`, run in Blender's own Python outside Blender; ~2.6k charts, ~80% of the texture used). The atlas takes about six minutes and is cached in `preview/uv-*.npz`, so later runs take about a minute and a half. xatlas is pip-installed into `.venv-assets/blender-py/` on first use;
   - **projects `crow-apose.png` onto the bind pose from the front**, orthographically. The projection is fitted to the model's silhouette (scale and offset, by overlap), then a smooth warp lines up the limbs' edges row by row and column by column; the fit is saved as `preview/projection-fit.png` (photo, figure edge green, model edge red). The figure's colours are bled outward so the grey backdrop never leaks in;
   - gives every vertex a **region** (feathers, beak, hands, suit, shirt, tie, shoes) from bone weights plus the colour the front sees; unseen vertices take the nearest seen region across the surface, within limits (the beak by its shape, shoes below the shoe line, no shirt down his back). `preview/regions-*.png` shows them;
   - fills what the front can't see (back, sides, under the arms) with **region colours** (half the named colour, half the photo's: blue-black feathers, charcoal suit, white shirt, `#2F7BFF` tie, black shoes), carrying the photo's local shade across the seam and fading it out over ~6 cm, and adds **procedural detail in 3D**: fabric grain and twill on the suit, feather streaks flowing back from the beak with a blue sheen, a fine grain on the hands;
   - bakes **ambient occlusion and roughness** into a second texture for PBR (glossy shoes and beak, silky tie, matte suit);
   - pulls every clip onto the one rig as a named animation, and exports a single `.glb`: the mesh once, plus all ten clips;
   - renders `preview/turntable-{front,three-quarter,side,back}.png` (flat-lit: the texture as it is).
3. **glTF-Transform** attaches the AO/roughness texture, converts both textures to WebP, prunes, resamples, quantises (no decimation) and meshopt-compresses it.

Blender is found via `$BLENDER`, then `PATH`, then the usual install folders (and `~/tools/blender-*`). The portable zip from <https://www.blender.org/download/> works; no install needed.

**On the site** (`src/gl/crow.ts`) each clip is cleaned on load: the hips lose any travel (so every clip stays on his spot; `looking-up` walks a few steps otherwise) and the last half second of every track blends into its first frame, so loops never pop. Clips crossfade on screen changes.

## Where things live

```
index.html              canvas, loader, entry, HUD, lightbox
src/
  main.ts               boot order and wiring
  fx-config.ts          EVERY strength for the look: bloom, grain, scan, fringing, hologram, particle budget
  screens.ts            the twelve screens: names, hashes, corner labels, all the copy, the post cards
  nav.ts                one gesture = one screen (wheel, trackpad, keys, swipe, rail, hashes)
  boot.ts               loader → entry → the enter sequence
  brand/symbol.svg      the emblem (also the favicon, the entry, screens 07, 10, 12)
  gl/
    engine.ts           renderer, composer (scene → bloom → final), cameras, transitions, lite mode
    points.ts           the point-cloud material and builder every environment uses
    shapes.ts           lines, rings, panels, boxes, discs, and text/SVG sampled into points
    crow.ts             loads crow.glb, PBR material + hologram patch, lights, clips, crossfades, flicker
    entry.ts            star field, the orb (shell, notched band, crow head) in points, vortex, shockwave, hyperspace streaks
    post.ts             the final pass: tone map, grain, scan texture, fringing, vignette, flash, glitch, lens
    scenes.ts           the twelve stages, in page order
    ring.ts             the 3D meme ring (drag, inertia, snap)
  cursor.ts             ring + dot cursor (shows DRAG over the meme ring)
  lightbox.ts           meme viewer
  config.ts             contract address, links, stats
  token.ts              turns config into live controls (and leaves out any without a value)
  audio.ts              generated music, the enter riser and bass hit, the music pill
  lite.ts               decides when lite mode is on
  debug.ts              the ?debug overlay
  memes/                the meme list and the drawn placeholder cards
  crow-art.ts           the old SVG mascot, still used for the share image
  style.css             tokens on :root, then one block per piece of UI
scripts/
  crow.mjs, crow/build.py, crow/unwrap.py   the `npm run crow` pipeline
  dev-phone.mjs         the `dev:phone` server and QR code
  og.mjs                share image and icons
assets-raw/             source files (never shipped)
reference/              comparison screenshots (git-ignored, never shipped)
public/assets/crow/     crow.glb, written by npm run crow
```

## The twelve screens

| # | Hash | Screen | Crow | Environment (all points) |
|---|---|---|---|---|
| 01 | `#crow` | The crow | sitting-idle, on a stool in a floor ring | a hall: rounded wall panels, tall bars, a curved desk, floor lines |
| 02 | `#name` | Why the name | — | "COUPON CROWS" in giant 3D points, slowly turning; a coin rising at the bottom edge |
| 03 | `#stage` | On stage | clapping | spotlight cone, mic stand, gold-dust audience, a dot-matrix screen |
| 04 | `#post` | The post | walking, side view | candlestick chart and a line across the back; the floor scrolls under him |
| 05 | `#record` | On the record | idle, behind a glowing ledger rail | drifting strips of "$CROW" and "COUPON CROWS" |
| 06 | `#foryou` | For you | reaching, close up | a tunnel of rings, a halo behind his head |
| 07 | `#onchain` | On-chain | looking-up, small, from behind | a beam from above and the emblem, huge and tilted |
| 08 | `#cheers` | Cheers | toast, close up, with a coupe of gold fizz | fireworks in white, blue and gold |
| 09 | `#ask` | Ask the crow | typing on a glowing phone | drifting questions |
| 10 | `#token` | The token | looking-at-hand, a coin above his palm | drifting gold coins, the emblem |
| 11 | `#memes` | The memes | idle | the meme ring around him, gold dust on the floor |
| 12 | `#flock` | Join the flock | waving | the emblem behind him, gold light lines |

The crow is PBR-shaded everywhere: his baked colours, AO and roughness under a key and fill light that follow the camera, a cool back light and soft room reflections, kept below the bloom threshold so his face and shirt never glow. The hologram sits on top, lightly: faint bands drifting upward, a thin blue rim, legs fading into the floor glow, a flicker every few seconds; he scans in from the top on arrival and dissolves on the way out.

Copy for all of them is in `src/screens.ts`; wrap a phrase in `{{double braces}}` to highlight it in blue. The "posts" are generic cards on a made-up network called the Perch.

### Getting around

- **One gesture, one screen.** A wheel flick, a trackpad swipe, a touch swipe or a key press moves exactly one screen; twelve flicks take you through. Wheel deltas add up to a threshold; then input is locked for the ~0.9s transition, and the trackpad's leftover inertia is ignored until the wheel goes quiet or a fresh flick starts.
- **Transitions.** The outgoing points scatter and the crow dissolves, with a short glitch and colour burst; the next screen assembles and he scans back in. Each screen's intro (text, crow) plays on its own over ~1.2s; nothing depends on scroll position.
- **Keys.** Arrow down/up, Page Down/Up, Space / Shift+Space step one screen; Home and End go to the ends.
- **Rail.** Twelve ticks on the right edge; hover for a name, click to jump. A slim strip on phones.
- **Links.** Every screen has a hash (`…/#onchain`), and Back/Forward move between screens.

## Tuning the look: `src/fx-config.ts`

| Setting | What it does |
|---|---|
| `maxPixelRatio` | Highest device pixel ratio rendered (2) |
| `palette` | The particle colours: blue `#2F7BFF`, pale `#8CB4FF`, white, gold `#C9A24A` |
| `bloom.*` | Glow strength, spread and threshold |
| `post.*` | Film grain, diagonal scan texture, edge fringing (px), vignette, exposure |
| `lens.*` | The invisible cursor magnifier |
| `parallax.*`, `breathing.*` | How the camera follows the cursor, and its slow drift |
| `holo.*` | The crow: key/fill/back light, reflections, AO, brightness ceiling (under bloom), feather sheen; then the hologram: rim, band count/depth/speed, sweep, flicker rate and depth, how high and how far his legs fade |
| `particles.density` | Global multiplier on every point count |
| `entry.*` | Star field, orb and crow-head point counts, cursor push, streaks |
| `transition.*` | Out / in / intro timings |

**Budget.** About 295,000 points are built in total (entry plus twelve screens); only the active screen's are drawn, at most ~35,000. `?debug` shows the total.

## The enter sequence (`src/boot.ts`)

About 3.8s; click or Esc skips to the end.

1. 0–0.4s: the buttons drop away; with sound on, a low riser starts.
2. 0.4–1.2s: the star field spirals into the orb, which spins up and brightens while a ring of points forms around it.
3. 1.2–1.6s: it implodes to a point, a beat of darkness, then a shockwave ring, a blue-white flash and a colour burst (with a bass hit).
4. 1.6–3.0s: hyperspace streaks, accelerating.
5. 3.0–3.8s: the streaks slow and settle into screen 01's hall; the crow scans in from the top and the title slides in.

Reduced motion gets a 0.6s fade instead. "Enter without sound" is the same picture, silent.

## Going live: contract address, buy buttons, links

Everything is driven by `src/config.ts`:

```ts
contractAddress: null,   // e.g. '0xAbC…123'
buyUrl: null,            // e.g. 'https://…'
explorerUrl: null,       // e.g. 'https://…/token/0xAbC…123'
communityUrl: '#',       // "Join the community" / "Drop a meme"
followUrl: '#',          // "Follow the flock"
```

While a value is `null` (or `'#'` for the links), the controls that need it aren't shown at all. Fill a value in and they appear: the CA pills copy to the clipboard and the buy/explorer/community buttons become real links. They live in the bottom-right corner, on screen 10, 11 (the meme link) and 12. The token stats on screen 12 are the `stats` list.

## Test on a phone

1. Put the phone on the **same Wi-Fi** as this computer.
2. Run `npm run dev:phone`. It prints a QR code and an address like `http://192.168.x.x:5173/`.
3. Scan the QR code with the phone's camera and open the link. It opens with the debug overlay on.

If the page does not load on the phone:

- **VPN.** A VPN on the computer (NordVPN, for example) usually hides it from other devices on the Wi-Fi. Pause the VPN, or turn on its "allow LAN access" / turn off its "invisibility on LAN" setting, and restart `npm run dev:phone`.
- **Windows Firewall.** The first time Node listens on the network, Windows shows "Windows Security Alert: allow Node.js JavaScript Runtime?". Tick both **Private** and **Public** networks and choose **Allow access**. If you dismissed it, or it never appeared:
  1. Press Start, type **Allow an app through Windows Firewall**, open it.
  2. Click **Change settings**.
  3. Find **Node.js JavaScript Runtime** in the list. Tick the box on its left, and tick the column that matches your Wi-Fi (**Public** if Windows treats the Wi-Fi as a public network, which is the default; otherwise **Private**). If there are several Node.js rows, do the same for each.
  4. If Node.js is not listed: **Allow another app…** → **Browse…** → `C:\Program Files\nodejs\node.exe` → **Add**, then tick the columns as above.
  5. Click **OK** and restart `npm run dev:phone`.

  The same thing as one command, in a PowerShell window opened with "Run as administrator" (remove it later with `Remove-NetFirewallRule -DisplayName "Coupon Crows dev server"`):

  ```powershell
  New-NetFirewallRule -DisplayName "Coupon Crows dev server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private,Public
  ```
- **Guest Wi-Fi.** Guest networks and some routers keep devices from seeing each other ("client isolation"). Use the main network.

The phone loads the site over plain `http`, which is fine for everything here. Copy-to-clipboard (once a contract address is set) needs `https`, so test that on the deployed site.

## Debug overlay and URL switches

| URL | What it does |
|---|---|
| `?debug` | Corner overlay: live FPS, lite mode and why, audio state, track, and the current screen with render size, pixel ratio, points built and whether bloom is on |
| `?lite=1` | Forces lite mode on (half the points are built, no bloom, 1× pixels) |
| `?lite=0` | Forces lite mode off |

## Deploy

The site is plain static files. `npm run build` puts everything in `dist/` (about 6 MB, the crow included).

### Netlify, drag and drop (no Git needed)

1. In this folder, run `npm install` once, then `npm run build`.
2. Go to <https://app.netlify.com/drop> and sign up or log in.
3. Drag the `dist` folder from File Explorer onto the page. Netlify gives the site an address like `https://something-random-123.netlify.app`. (Rename it under **Site configuration → Change site name** if you like.)
4. Make the share card work. Open the file `.env` in this folder with Notepad and put the address after the `=`, with no slash at the end:
   ```
   VITE_SITE_URL=https://your-site-name.netlify.app
   ```
5. Run `npm run build` again.
6. In Netlify, open the site's **Deploys** tab and drag the new `dist` folder onto it.

Repeat steps 5 and 6 whenever you change the site. If you later add your own domain, put that in `.env` instead and rebuild.

### Netlify or Vercel from a Git repository (rebuilds on every push)

1. Put this folder in a GitHub repository.
2. **Netlify:** Add new site → Import an existing project → pick the repository → Deploy. The settings come from `netlify.toml`.
   **Vercel:** Add New → Project → pick the repository → Deploy. It detects Vite on its own and needs no config file.
3. Nothing to set for the share card: the build picks up the site's address from the host automatically, including a custom domain once you add one and redeploy. To override it, add an environment variable named `VITE_SITE_URL` in the host's settings.

## Share image and meta tags

`npm run og` (also the first step of `npm run build`) writes `public/og.png` and the home-screen icon (drawn from `public/favicon.svg`, the emblem). **The share image still shows the earlier drawn mascot** (`src/crow-art.ts`); replace `public/og.png` by hand with a 1200×630 image and remove `og` from the build script if you want the hologram crow there.

Social crawlers need an absolute image URL, which is built from `VITE_SITE_URL`. With it empty, `og:image` stays relative (`/og.png`), which is fine locally but will not unfurl on most platforms.

## Other things to swap

**Memes.** Drop image files (png, jpg, webp, gif, avif) into `src/memes/`. They are picked up automatically, sorted by filename, and replace the drawn placeholders one for one. Prefix with `01-`, `02-`… to set the order. Add alt text per file in the `ALT` map in `src/memes/index.ts`. Portrait 4:5 images fit the frames best.

**Music.** `src/audio.ts` synthesises three looping tracks. To add or change one, edit the `TRACKS` array (tempo, swing, chords as MIDI notes); its loudness is measured and matched automatically. Overall volume is `LEVEL`.

**The emblem.** `src/brand/symbol.svg`. The entry screen and screens 03, 07, 10 and 12 sample it into points at load, so editing it updates them all. `public/favicon.svg` is the same emblem on a dark disc; update it by hand.

**Colours and type.** UI colours are tokens at the top of `src/style.css`; the particle colours are `palette` in `src/fx-config.ts`. Headlines are Archivo at width 125, weight 900; body is Archivo; labels are JetBrains Mono.

## Behaviour notes

- **Loader and entry.** A big 000 → 100 counter that follows the crow's download, while every scene is built and drawn once behind it (so nothing stutters later). Then the star field: near stars move more as the cursor leans the camera, and stars near the cursor drift out of its way; the orb's key light leans toward the cursor. Audio starts inside the Enter click, as browsers require.
- **Mouse.** An invisible lens around the cursor magnifies the picture slightly. The cursor is a thin ring with a dot: the dot is on the pointer, the ring follows with easing, grows over anything clickable, dims over disabled controls, and says DRAG over the meme ring.
- **Touch.** No lens. The camera drifts slowly, or follows device tilt where the browser allows it without asking (not iOS). Portrait screens frame the crow in the top half and the copy in the bottom.
- **Music.** Tracks are loudness-matched, crossfade on change, fade on mute, and pause while the tab is hidden. On iPhones the page declares itself as media playback so the music plays with the ringer switch on silent.
- **Lite mode.** For the first 1.5 seconds the site times its frames. A median under 30fps turns lite mode on: half the points drawn, no bloom, 1× pixels, no lens. If the device then holds 50+ fps for 3 seconds, full quality returns. `?lite=1` and `?lite=0` override this.
- **Reduced motion.** With `prefers-reduced-motion` there is no scroll-jacking: the twelve screens are an ordinary page that snaps one screen at a time, the entry is a 0.6s fade, and particles, bands and the lens hold still.
- **No WebGL.** The scenes need WebGL 2. Every current browser has it.

## Disclaimer

A fictional community art project. Not affiliated with any company. Nothing here is financial advice.
