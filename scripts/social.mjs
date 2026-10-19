/**
 * Renders the X (Twitter) banner and profile picture in the site style.
 *
 *   node scripts/social.mjs
 *
 *   social/x-banner.png  1500×500. The bottom-left corner stays clear: on
 *                        desktop the profile picture covers about x < 380, y > 330.
 *   social/x-pfp.png     1000×1000. X crops it to a circle, so the emblem sits
 *                        well inside the edge.
 *
 * Same emblem, fonts and colours as scripts/og.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import opentype from 'opentype.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'social')
mkdirSync(out, { recursive: true })

const font = (pkg, file) => {
  const buf = readFileSync(resolve(root, 'node_modules/@fontsource', pkg, 'files', file))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}
const anton = font('anton', 'anton-latin-400-normal.woff')
const mono = font('jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff')
const sans = font('instrument-sans', 'instrument-sans-latin-500-normal.woff')

const INK = '#FFF4EC'
const ACCENT = '#E5232F'
const GOLD = '#C9A24A'
const BG = '#020308'
const symbol = readFileSync(resolve(root, 'src/brand/symbol.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<svg[^>]*>|<\/svg>/g, '')

function measure(f, str, size, tracking = 0) {
  const scale = size / f.unitsPerEm
  const glyphs = [...str].map((ch) => f.charToGlyph(ch))
  return glyphs.map(
    (g, i) => (g.advanceWidth + (glyphs[i + 1] ? f.getKerningValue(g, glyphs[i + 1]) : 0)) * scale + tracking * size,
  )
}

/** Text as an outlined <path>, placed glyph by glyph like og.mjs. */
function text(f, str, x, y, size, fill, { anchor = 'start', tracking = 0, opacity = 1 } = {}) {
  const advances = measure(f, str, size, tracking)
  const glyphs = [...str].map((ch) => f.charToGlyph(ch))
  let pen = anchor === 'end' ? x - advances.reduce((a, b) => a + b, 0) : x
  const d = glyphs
    .map((g, i) => {
      const path = g.getPath(pen, y, size).toPathData(2)
      pen += advances[i]
      return path
    })
    .join('')
  return `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`
}

const width = (f, str, size, tracking) => measure(f, str, size, tracking).reduce((a, b) => a + b, 0)

/** Seeded star field: mostly white points, some red, a few gold; `dim(x, y)` thins it behind text. */
function stars(W, H, count, seed, dim = () => 1) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  let dots = ''
  for (let i = 0; i < count; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const t = rnd()
    const color = t < 0.72 ? INK : t < 0.93 ? ACCENT : GOLD
    const big = rnd() < 0.06
    const r = big ? 1.6 + rnd() * 1.4 : 0.5 + rnd() * 1.1
    const o = (0.25 + rnd() * 0.65) * dim(x, y)
    if (o < 0.04) continue
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${color}" fill-opacity="${o.toFixed(2)}"${big ? ' filter="url(#soft)"' : ''}/>`
  }
  return dots
}

/** The emblem with a blurred copy under it, the site's bloom. */
const emblem = (x, y, size) => `
  <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" color="${ACCENT}" overflow="visible">
    <g filter="url(#bloom)" opacity=".75">${symbol}</g>
    <g>${symbol}</g>
  </svg>`

const defs = (bloom) => `
  <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${bloom}"/></filter>
  <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.2"/></filter>`

const png = (svg) => new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng()

// ---------------------------------------------------------------- banner 1500×500
{
  const W = 1500
  const H = 500
  const X = 100

  const headline = 'THE LION BUYS BACK.'
  const hSize = Math.min(150, (980 - X) / (width(anton, headline, 100) / 100))
  const sub = '20% of creator fees buys $ROAR back every two weeks. Then it burns.'

  const ex = 1215
  const ey = 245
  const es = 380
  // Fewer stars behind the words, none right on the emblem.
  const dim = (x, y) => {
    if (x < 1000 && y > 70 && y < 340) return 0.35
    if (Math.hypot(x - ex, y - ey) < es * 0.46) return 0
    return 1
  }

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      ${defs(2.4)}
      <radialGradient id="g1" cx="${ex / W}" cy="${ey / H}" r=".42" gradientTransform="translate(${ex / W} ${ey / H}) scale(.34 1) translate(${-ex / W} ${-ey / H})">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity=".5"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="g2" cx="0" cy="1.15" r="1" gradientTransform="translate(0 1.15) scale(.45 1) translate(0 -1.15)">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity=".28"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect width="${W}" height="${H}" fill="url(#g2)"/>
    <rect width="${W}" height="${H}" fill="url(#g1)"/>
    ${stars(W, H, 900, 7, dim)}

    ${text(mono, '//////', X + 4, 112, 22, ACCENT, { tracking: -0.08 })}
    ${text(mono, 'LION’S SHARE', X + 90, 112, 22, INK, { tracking: 0.06 })}
    ${text(mono, '$ROAR', X + 90 + width(mono, 'LION’S SHARE', 22, 0.06) + 22, 112, 22, GOLD, { tracking: 0.06 })}

    ${text(anton, headline, X - 4, 112 + 30 + hSize * 0.9, hSize, INK)}

    <rect x="${X + 4}" y="${112 + 30 + hSize * 0.9 + 44}" width="44" height="3" fill="${GOLD}"/>
    ${text(sans, sub, X + 64, 112 + 30 + hSize * 0.9 + 56, 26, INK, { opacity: 0.86 })}

    ${emblem(ex - es / 2, ey - es / 2, es)}
  </svg>`
  writeFileSync(resolve(out, 'x-banner.png'), png(svg))
}

// ---------------------------------------------------------------- profile picture 1000×1000
{
  const S = 1000
  const c = S / 2
  // The ring's outer edge lands at about 82% of the circle's radius.
  const es = 700
  const dim = (x, y) => (Math.hypot(x - c, y - c) < es * 0.47 ? 0 : 1)
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs>
      ${defs(2.2)}
      <radialGradient id="g" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity=".42"/><stop offset=".75" stop-color="${ACCENT}" stop-opacity=".08"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="${BG}"/>
    <rect width="${S}" height="${S}" fill="url(#g)"/>
    ${stars(S, S, 260, 11, dim)}
    ${emblem(c - es / 2, c - es / 2, es)}
  </svg>`
  writeFileSync(resolve(out, 'x-pfp.png'), png(svg))
}

console.log('wrote social/x-banner.png (1500×500) and social/x-pfp.png (1000×1000)')
