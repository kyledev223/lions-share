import gsap from 'gsap'

/**
 * The twelve screens: names, URL hashes, the corner label, and the copy.
 * All of it is fiction: Corvus Black, the Hedgerow, the Perch and every bird
 * quoted are made up. `{{double braces}}` mark the phrase that gets the blue
 * highlight. The matching 3D stages are in gl/scenes.ts, in the same order.
 */
export interface ScreenDef {
  /** URL hash and element id. */
  id: string
  /** Shown on the rail and in the top-right label. */
  name: string
  /** One mono line under the top-right label. */
  sub: string
  /** Which side the copy sits on (the crow takes the other). */
  side: 'left' | 'right'
  html: string
  /** A card that sits on the far side of the screen (the fictional posts). */
  aside?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const mark = (s: string) => esc(s).replace(/\{\{(.+?)\}\}/g, '<mark>$1</mark>')
const lines = (...l: string[]) => l.map((t) => `<span class="line"><span class="line__in">${esc(t)}</span></span>`).join('')
const eyebrow = (s: string) => `<p class="eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> ${esc(s)}</p>`
const head = (...l: string[]) => `<h2 class="display" aria-label="${esc(l.join(' '))}">${lines(...l)}</h2>`
const lede = (s: string) => `<p class="lede" data-in>${mark(s)}</p>`
const body = (s: string) => `<p class="body" data-in>${mark(s)}</p>`
const note = (s: string) => `<p class="note" data-in>${esc(s)}</p>`
const quote = (q: string, who: string) => `
  <figure class="quote" data-in>
    <blockquote>${mark(q)}</blockquote>
    <figcaption>— ${esc(who)}</figcaption>
  </figure>`

interface Post {
  name: string
  handle: string
  hue: number
  text: string
  date: string
  counts: string[]
  quoted?: { name: string; handle: string; text: string }
}
/** A generic post card from "the Perch", the made-up network the birds use. */
const post = (p: Post) => `
  <article class="post" data-in aria-label="Post by ${esc(p.name)}">
    <header>
      <span class="post__avatar" style="--hue:${p.hue}" aria-hidden="true"></span>
      <span class="post__who"><b>${esc(p.name)}</b><small>${esc(p.handle)}</small></span>
      <span class="post__net">THE PERCH</span>
    </header>
    <p class="post__text">${mark(p.text)}</p>
    ${
      p.quoted
        ? `<div class="post__quoted"><span class="post__who"><b>${esc(p.quoted.name)}</b><small>${esc(p.quoted.handle)}</small></span><p>${mark(p.quoted.text)}</p></div>`
        : ''
    }
    <footer><time>${esc(p.date)}</time>${p.counts.map((c) => `<span>${esc(c)}</span>`).join('')}</footer>
  </article>`

const CORVUS = { name: 'Corvus Black', handle: '@corvus', hue: 218 }

export const SCREENS: ScreenDef[] = [
  {
    id: 'crow',
    name: 'The crow',
    sub: 'Coupon Crows. Paid on schedule.',
    side: 'left',
    html: `
      <p class="eyebrow hero__eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> THE WIRE · $CROW</p>
      <h1 class="display hero__title" aria-label="Coupon Crow">${lines('COUPON', 'CROW')}</h1>`,
  },
  {
    id: 'name',
    name: 'Why the name',
    sub: 'On the Hedgerow, a bird who waits for the payout is a coupon crow.',
    side: 'left',
    html: `
      ${eyebrow('WHY THE NAME')}
      ${head('NAMED BY', 'CORVUS.')}
      ${lede('On the Hedgerow, a bird who comes back for every payout is called a {{coupon crow}}.')}
      ${body('Corvus Black, who runs the Hedgerow Exchange, coined it for the members who collect small, regular payouts and never miss one. Not a product, not a tier: a flock. He has said it on stage, on the Perch and on every quarterly call. Every flock needs a mascot.')}
      ${note('NOBODY HAD DRAWN THE CROW. SO WE DID.')}`,
  },
  {
    id: 'stage',
    name: 'On stage',
    sub: 'On stage at Roost Live, 4 April. Where the name took off.',
    side: 'right',
    html: `
      ${eyebrow('MENTION · ON STAGE · ROOST LIVE, 4 APRIL')}
      ${head('ANY COUPON', 'CROWS?')}
      ${quote('“Show of wings: any coupon crows in tonight? There they are. … From next month, {{every payout lands on the day it’s due}}.”', 'CORVUS BLACK, ON STAGE')}
      ${note('WARMING UP THE ROOM, THE HOST: “IF YOU DON’T KNOW WHAT A COUPON CROW IS, YOU WILL BY THE END.”')}`,
  },
  {
    id: 'post',
    name: 'The post',
    sub: 'A week early, and the crows got named again.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · THE PERCH · 14 APRIL')}
      ${head('OUR COUPON', 'CROWS.')}
      ${lede('Launching Early Coupons, paid a full week before anywhere else on the Hedgerow, Corvus signed off with the birds who’d been waiting.')}
      ${post({
        ...CORVUS,
        text: '“Early Coupons are live: payouts land in your nest a full week before the rest of the hedgerow. No more waiting on the wire. {{Our coupon crows earned this one.}}”',
        date: '9:41 AM · 14 APR',
        counts: ['2.1K CAWS', '412 ECHOES', '218 REPLIES'],
      })}`,
  },
  {
    id: 'record',
    name: 'On the record',
    sub: 'On the record: the quarterly call, then the annual roost.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · Q1 FLOCK CALL, 29 APRIL · ANNUAL ROOST, 3 JUNE')}
      ${head('WE CALL', 'THEM COUPON', 'CROWS.')}
      ${quote('“The birds who come back for every payout? Around here we call them {{coupon crows}}.”', 'CORVUS BLACK, Q1 FLOCK CALL')}
      ${quote('“Plenty of our members never miss a payout. I call them {{Coupon Crows}}, and we build for them first.”', 'CORVUS BLACK, ANNUAL ROOST, 3 JUNE')}`,
  },
  {
    id: 'foryou',
    name: 'For you',
    sub: 'The Hedgerow’s own account, straight to the flock.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · @HEDGEROW ON THE PERCH · 22 AUGUST')}
      ${head('THIS ONE’S', 'FOR YOU.')}
      ${lede('Not Corvus this time: the Hedgerow’s own account, talking straight to the flock.')}
      ${quote('“This one goes out to every {{coupon crow}} on the wire.”', '@HEDGEROW ON THE PERCH')}`,
  },
  {
    id: 'onchain',
    name: 'On-chain',
    sub: 'The crows went on-chain. So did their mascot.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · THE PERCH · 17 SEPTEMBER')}
      ${head('ON-CHAIN', 'COUPON', 'CROWS.')}
      ${lede('Rook Ledger, who runs payouts at the Hedgerow, announced that on-chain coupons now settle the moment they’re due, not days later. Corvus quoted it and named the birds who’d been waiting. The crows went on-chain, and so did their mascot.')}`,
    aside: post({
      ...CORVUS,
      text: 'payouts now settle on the minute for our {{on-chain coupon crows}} ✦',
      quoted: {
        name: 'Rook Ledger',
        handle: '@rook.ledger',
        text: 'On-chain coupons just got an upgrade. Payouts now settle automatically on the due date instead of trickling in days later. Same coupon, no waiting on the wire.',
      },
      date: '4:12 PM · 17 SEP',
      counts: ['1.9K CAWS', '384 REPLIES'],
    }),
  },
  {
    id: 'cheers',
    name: 'Cheers',
    sub: 'A toast to the flock, under the fireworks.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · @HEDGEROW ON THE PERCH · 21 SEPTEMBER')}
      ${head('CHEERS TO', 'THE COUPON', 'CROWS.')}
      ${lede('Launching its payout tracker, the Hedgerow’s own account raised a glass to the flock: “{{cheers to the coupon crows}}.”')}`,
  },
  {
    id: 'ask',
    name: 'Ask the crow',
    sub: 'Roost Summit. Corvus answered live.',
    side: 'left',
    html: `
      ${eyebrow('MENTION · @CORVUS ON THE PERCH · 12 OCTOBER')}
      ${head('ASK THE', 'CROW.')}
      ${lede('After Roost Summit, Corvus opened the floor. For thirty minutes he answered every question that came in, as long as it was about coins.')}`,
    aside: post({
      ...CORVUS,
      text: 'Big week at Roost Summit. Drop your questions below and I’ll answer live for the next 30 minutes. {{Ask the crow.}}',
      date: '1:08 PM · 12 OCT',
      counts: ['2.4K CAWS', '1.6K REPLIES'],
    }),
  },
  {
    id: 'token',
    name: 'The token',
    sub: '$CROW. The community token of the flock, live on Solana.',
    side: 'left',
    html: `
      ${eyebrow('THE TOKEN · LIVE ON SOLANA')}
      ${head('HOLD $CROW.', 'COLLECT SHINY', 'THINGS.')}
      ${lede('$CROW is a community token: a mascot, a running joke about patience, and a flock that likes things that glitter.')}
      <div class="actions" data-in>
        <span class="slot" data-buy="gold"></span>
        <span class="slot" data-ca="named"></span>
        <span class="slot" data-explorer></span>
      </div>`,
  },
  {
    id: 'memes',
    name: 'The memes',
    sub: 'The memes. Drag them round, open one, drop yours.',
    side: 'left',
    html: `
      ${eyebrow('THE MEMES')}
      ${head('CROWS AT', 'WORK.')}
      ${lede('Every frame around him is a meme from the flock. Made one? Drop it on the wire.')}
      <button class="ringkeys" type="button" id="ringKeys" aria-roledescription="carousel"
        aria-label="Meme carousel. Left and right arrow keys turn it one frame. Enter opens the meme at the front." data-in>
        <span aria-hidden="true">⟵ ⟶</span> Drag to turn the memes · click one to open it
      </button>
      <div class="actions" data-in>
        <a class="btn btn--gold" data-href="community" href="#">Drop a meme in the community ↗</a>
      </div>`,
  },
  {
    id: 'flock',
    name: 'Join the flock',
    sub: 'Join the community. Follow the wire.',
    side: 'left',
    html: `
      ${eyebrow('JOIN THE FLOCK')}
      ${head('JOIN THE', 'FLOCK.')}
      ${lede('The crows gather on the wire. Join the community and follow along for every coin, every meme and every caw.')}
      <div class="actions" data-in>
        <a class="btn btn--gold" data-href="community" href="#">Join the community ↗</a>
        <a class="btn btn--ghost" data-href="follow" href="#">Follow the flock ↗</a>
      </div>
      <div class="cabox" data-in>
        <span class="cabox__label">Contract address</span>
        <span class="slot" data-ca="full"></span>
      </div>
      <div class="actions" data-in>
        <span class="slot" data-buy="ghost"></span>
        <span class="slot" data-explorer></span>
      </div>
      <dl class="stats" id="stats" data-in></dl>`,
  },
]

export interface ScreenView {
  def: ScreenDef
  el: HTMLElement
  /** Plays once when the screen arrives (~1.2s): label, headline, then the rest. */
  intro: gsap.core.Timeline | null
}

export function renderScreens(host: HTMLElement, reduced: boolean): ScreenView[] {
  host.innerHTML = SCREENS.map(
    (s, i) => `
    <section class="screen screen--${s.side} screen--${s.id}" id="${s.id}" data-screen="${i}" aria-label="${esc(s.name)}">
      <div class="screen__copy">${s.html}</div>
      ${s.aside ? `<div class="screen__aside">${s.aside}</div>` : ''}
    </section>`,
  ).join('')

  return SCREENS.map((def, i) => {
    const el = host.children[i] as HTMLElement
    if (reduced) return { def, el, intro: null }
    const intro = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' } })
    const rising = el.querySelectorAll('.line__in')
    intro.from(rising, { yPercent: 118, duration: 0.85, stagger: 0.08 }, 0.05)
    const blocks = el.querySelectorAll('.screen__copy [data-in]')
    intro.from(blocks, { autoAlpha: 0, y: 22, duration: 0.6, stagger: Math.min(0.12, 0.7 / Math.max(1, blocks.length)), ease: 'power3.out' }, 0.12)
    const aside = el.querySelector('.screen__aside')
    if (aside) intro.from(aside, { autoAlpha: 0, x: 40, duration: 0.8, ease: 'power3.out' }, 0.35)
    return { def, el, intro }
  })
}
