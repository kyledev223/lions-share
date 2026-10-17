/**
 * The Coupon Crow artwork. Original mascot, drawn as inline SVG so it can be
 * animated part by part. This file has no imports on purpose: the browser
 * uses it through crow.ts and scripts/og.mjs uses it to render the share image.
 *
 * `p` prefixes gradient ids so several crows can share a page. `still` drops
 * the eyelid, which only makes sense when a script is there to hold it open.
 *
 * To swap in real art later, keep these groups (crow.ts animates them):
 *   .crow-hop      everything that leaves the coins on a hop
 *   .crow-bird     breathing
 *   .crow-wing     rotates from the shoulder (236, 230)
 *   .crow-head     tilts from the neck (244, 214)
 *   .crow-turn     flips to look over the shoulder
 *   .crow-beakcoin the coin that gets tossed
 *   .crow-lid      blink
 *   .crow-glint--beak / .crow-glint--stack
 */
export function crowMarkup(p = 'c', still = false): string {
  const coin = (cx: number, y: number, rx: number) => `
    <path d="M${cx - rx} ${y} v20 a${rx} 17 0 0 0 ${rx * 2} 0 v-20 Z" fill="url(#${p}-coinside)"/>
    <ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="17" fill="url(#${p}-coin)"/>
    <ellipse cx="${cx}" cy="${y}" rx="${rx - 15}" ry="10.5" fill="none" stroke="#2F7BFF" stroke-opacity=".55" stroke-width="2"/>`

  return `
<svg class="crow" viewBox="0 0 440 460" role="img" aria-label="The Coupon Crow: a blue-black crow standing on a stack of coins with one more coin in its beak">
  <defs>
    <linearGradient id="${p}-body" x1=".1" y1="0" x2=".8" y2="1">
      <stop offset="0" stop-color="#1D45A8"/><stop offset=".42" stop-color="#0B1532"/><stop offset="1" stop-color="#04060F"/>
    </linearGradient>
    <linearGradient id="${p}-wing" x1=".9" y1="0" x2=".2" y2="1">
      <stop offset="0" stop-color="#3B86FF"/><stop offset=".35" stop-color="#16327C"/><stop offset="1" stop-color="#060A1A"/>
    </linearGradient>
    <linearGradient id="${p}-head" x1=".2" y1="0" x2=".7" y2="1">
      <stop offset="0" stop-color="#2452C4"/><stop offset=".55" stop-color="#0B1532"/><stop offset="1" stop-color="#05070F"/>
    </linearGradient>
    <linearGradient id="${p}-beak" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#27335C"/><stop offset="1" stop-color="#0A0E1F"/>
    </linearGradient>
    <linearGradient id="${p}-coin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#D5DEF2"/><stop offset="1" stop-color="#8FA8E0"/>
    </linearGradient>
    <linearGradient id="${p}-coinside" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7C93CC"/><stop offset=".5" stop-color="#C9D4EE"/><stop offset="1" stop-color="#3D5596"/>
    </linearGradient>
  </defs>

  <ellipse cx="214" cy="438" rx="150" ry="16" fill="#2F7BFF" opacity=".22"/>

  <g class="crow-coins">
    ${coin(206, 414, 92)}
    ${coin(222, 394, 86)}
    ${coin(210, 374, 84)}
    <path class="crow-glint crow-glint--stack" d="M150 352 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5 Z" fill="#FFFFFF"/>
  </g>

  <g class="crow-hop">
  <g class="crow-bird">
    <g stroke="#4A5A8C" stroke-width="7" stroke-linecap="round" fill="none">
      <path d="M196 326 L190 368 M190 368 l24 5 M190 368 l-20 4 M190 368 l8 8"/>
      <path d="M230 328 L236 368 M236 368 l24 5 M236 368 l-20 4 M236 368 l8 8"/>
    </g>

    <path d="M168 270 L36 322 L60 344 L88 338 L98 360 L184 322 Z" fill="url(#${p}-body)" stroke="#2F7BFF" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/>
    <path d="M268 232 C304 264 294 320 240 338 C194 352 148 334 126 296 C150 258 178 214 224 196 C248 190 262 208 268 232 Z" fill="url(#${p}-body)" stroke="#2F7BFF" stroke-opacity=".5" stroke-width="2"/>
    <path d="M272 220 L298 238 L280 240 L290 256 L262 246 Z" fill="#0B1532" stroke="#2F7BFF" stroke-opacity=".45" stroke-width="2" stroke-linejoin="round"/>

    <g class="crow-wing">
    <path d="M236 226 C266 262 238 314 182 322 C150 326 116 320 88 336 C116 290 162 232 236 226 Z" fill="url(#${p}-wing)" stroke="#5B9BFF" stroke-opacity=".8" stroke-width="2"/>
    <g fill="none" stroke="#7FB0FF" stroke-opacity=".5" stroke-width="2" stroke-linecap="round">
      <path d="M108 326 C150 302 192 288 226 256"/>
      <path d="M138 322 C174 306 208 294 234 270"/>
      <path d="M170 320 C198 312 222 300 240 284"/>
    </g>
    </g>

    <g class="crow-head">
    <g class="crow-turn">
      <path d="M222 148 L196 138 L224 132 L208 112 L244 126 Z" fill="#102257" stroke="#2F7BFF" stroke-opacity=".6" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="260" cy="176" r="52" fill="url(#${p}-head)" stroke="#2F7BFF" stroke-opacity=".5" stroke-width="2"/>
      <path d="M210 162 A52 52 0 0 1 286 131" fill="none" stroke="#5B9BFF" stroke-width="3.5" stroke-linecap="round"/>

      <path d="M302 186 L372 200 L304 208 Z" fill="url(#${p}-beak)" stroke="#2F7BFF" stroke-opacity=".45" stroke-width="2" stroke-linejoin="round"/>
      <g class="crow-beakcoin">
        <circle cx="384" cy="196" r="26" fill="url(#${p}-coin)"/>
        <circle cx="384" cy="196" r="17" fill="none" stroke="#2F7BFF" stroke-opacity=".6" stroke-width="2.5"/>
        <path d="M391 188 a10 10 0 1 0 0 16" fill="none" stroke="#2F7BFF" stroke-width="3.5" stroke-linecap="round"/>
      </g>
      <path d="M298 148 Q352 158 392 190 L302 190 Z" fill="url(#${p}-beak)" stroke="#2F7BFF" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/>

      <circle cx="272" cy="168" r="16" fill="#F4F6FB"/>
      <circle cx="275" cy="169" r="10" fill="#2F7BFF"/>
      <circle cx="276" cy="169" r="5" fill="#020308"/>
      <circle cx="279" cy="165" r="2.6" fill="#FFFFFF"/>
      <path d="M250 144 L294 156 L294 163 L250 158 Z" fill="#0B1838"/>
      ${still ? '' : '<ellipse class="crow-lid" cx="272" cy="168" rx="18" ry="18" fill="#0F1F4E"/>'}

      <path class="crow-glint crow-glint--beak" d="M402 160 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6 Z" fill="#FFFFFF"/>
    </g>
    </g>
  </g>
  </g>
</svg>`
}
