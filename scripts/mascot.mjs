/**
 * Builds public/assets/lion/lion.glb from the raw files in assets-raw/lion/.
 *
 *   npm run mascot
 *
 * Drop new files into assets-raw/lion/ and run it again:
 *   - the generated model and/or Mixamo FBX exports (Mixamo names such as
 *     "Sitting Idle.fbx" are renamed to the site's slugs, see RENAMES)
 *   - lion-apose.png, the front image the model was generated from
 *
 * Steps: rename → Blender (scripts/mascot/build.py: unwrap with xatlas,
 * project + bake the colour and AO/roughness textures, merge every clip onto
 * one rig, export) → glTF-Transform (attach the AO/roughness map, WebP
 * textures, prune, resample, quantize, meshopt) → public/assets/lion/lion.glb.
 * Previews of the bake (turntable, projection fit, regions) go to
 * assets-raw/lion/preview/, along with the cached UV atlas.
 *
 * Needs Blender 4.2+. It is found via $BLENDER, then PATH, then the usual
 * install folders. xatlas is pip-installed for Blender's Python into
 * .venv-assets/blender-py/ on first run.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { dirname, join, resolve, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'assets-raw', 'lion')
const PREVIEW = join(SRC, 'preview')
const OUT = join(root, 'public', 'assets', 'lion', 'lion.glb')

/** Mixamo export name (lower case, no extension) → slug used by the site. */
const RENAMES = {
  'sitting idle': 'sitting-idle',
  clapping: 'clapping',
  walking: 'walking',
  'breathing idle': 'idle',
  'reaching out': 'reaching',
  'looking around': 'looking-up',
  drinking: 'toast',
  'texting while standing': 'typing',
  inspecting: 'looking-at-hand',
  waving: 'waving',
}

const log = (...a) => console.log('[mascot]', ...a)

// ---- 1. rename -------------------------------------------------------------
if (!existsSync(SRC)) throw new Error(`Missing ${SRC}`)
for (const file of readdirSync(SRC)) {
  if (extname(file).toLowerCase() !== '.fbx') continue
  const stem = basename(file, extname(file)).toLowerCase().trim()
  const slug = RENAMES[stem]
  if (!slug || file === `${slug}.fbx`) continue
  const to = join(SRC, `${slug}.fbx`)
  const sameFile = file.toLowerCase() === `${slug}.fbx` // case-only rename (Windows/macOS see one file)
  if (!sameFile && existsSync(to) && statSync(to).mtimeMs >= statSync(join(SRC, file)).mtimeMs) {
    log(`skip rename ${file}: ${slug}.fbx is newer`)
    continue
  }
  if (sameFile) renameSync(join(SRC, file), to + '.tmp')
  renameSync(sameFile ? to + '.tmp' : join(SRC, file), to)
  log(`renamed "${file}" → ${slug}.fbx`)
}
if (!existsSync(join(SRC, 'lion-apose.png'))) throw new Error('Missing assets-raw/lion/lion-apose.png (the front image the model was made from)')

// ---- 2. Blender --------------------------------------------------------------
function findBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' })
  if (which.status === 0) return which.stdout.split(/\r?\n/)[0].trim()
  const dirs = [
    'C:/Program Files/Blender Foundation',
    join(homedir(), 'tools'),
    join(homedir(), 'AppData/Local/Programs'),
    '/Applications',
  ]
  for (const d of dirs) {
    if (!existsSync(d)) continue
    for (const sub of readdirSync(d).filter((s) => /blender/i.test(s)).sort().reverse()) {
      for (const exe of ['blender.exe', 'blender', 'Contents/MacOS/Blender']) {
        const p = join(d, sub, exe)
        if (existsSync(p)) return p
      }
    }
  }
  throw new Error('Blender not found. Install Blender 4.2+ or set BLENDER=/path/to/blender')
}

const blender = findBlender()
log('blender:', blender)
mkdirSync(PREVIEW, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'lion-'))
const tmp = join(work, 'lion.glb')
execFileSync(blender, ['-b', '--factory-startup', '-noaudio', '--python', join(root, 'scripts/mascot/build.py'), '--', SRC, tmp, PREVIEW, work], {
  stdio: ['ignore', 'inherit', 'inherit'],
})
if (!existsSync(tmp)) throw new Error('Blender did not write the .glb')

// ---- 3. compress -------------------------------------------------------------
const { NodeIO } = await import('@gltf-transform/core')
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
const { prune, dedup, resample, quantize, meshopt, weld, textureCompress } = await import('@gltf-transform/functions')
const { MeshoptEncoder, MeshoptDecoder } = await import('meshoptimizer')
const sharp = (await import('sharp')).default
await MeshoptEncoder.ready
await MeshoptDecoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(tmp)

// AO (R) and roughness (G), baked alongside the colour; glTF reads both from one texture.
const material = doc.getRoot().listMaterials()[0]
const orm = doc.createTexture('lion-orm').setImage(readFileSync(join(work, 'lion-orm.png'))).setMimeType('image/png').setURI('lion-orm.png')
material.setMetallicRoughnessTexture(orm).setRoughnessFactor(1).setMetallicFactor(0).setOcclusionTexture(orm).setOcclusionStrength(1)

await doc.transform(
  dedup(),
  prune(),
  resample({ tolerance: 1e-4 }),
  weld(),
  // Full detail: no decimation. Texture coordinates get 14 bits for the dense atlas, normals 10 for smooth shading.
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14, quantizeWeight: 8 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, quality: 90, effort: 100 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(metallicRoughness|occlusion)/, quality: 86, effort: 100 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
mkdirSync(dirname(OUT), { recursive: true })
await io.write(OUT, doc)
rmSync(work, { recursive: true, force: true })

const root_ = doc.getRoot()
const anims = root_.listAnimations().map((a) => a.getName())
const texKB = root_.listTextures().map((t) => `${t.getName() || t.getURI()} ${(t.getImage().byteLength / 1024).toFixed(0)} KB`)
log(`wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`)
log('textures:', texKB.join(', '))
log('clips:', anims.join(', '))
log('previews:', PREVIEW)
