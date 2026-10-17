import gsap from 'gsap'

/**
 * The twelve screens: names, URL hashes, the corner label, and the copy.
 * All of it is fiction: Leona Gold, Rex Mane, the Great Hall, the Watering
 * Hole and every lion quoted are made up. `{{double braces}}` mark the
 * phrase that gets the red highlight. The matching 3D stages are in
 * gl/scenes.ts, in the same order.
 */
export interface ScreenDef {
  /** URL hash and element id. */
  id: string
  /** Shown on the rail and in the top-right label. */
  name: string
  /** One mono line under the top-right label. */
  sub: string
  /** Which side the copy sits on (the mascot takes the other). */
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
/** A generic post card from "the Watering Hole", the made-up network the pride uses. */
const post = (p: Post) => `
  <article class="post" data-in aria-label="Post by ${esc(p.name)}">
    <header>
      <span class="post__avatar" style="--hue:${p.hue}" aria-hidden="true"></span>
      <span class="post__who"><b>${esc(p.name)}</b><small>${esc(p.handle)}</small></span>
      <span class="post__net">THE WATERING HOLE</span>
    </header>
    <p class="post__text">${mark(p.text)}</p>
    ${
      p.quoted
        ? `<div class="post__quoted"><span class="post__who"><b>${esc(p.quoted.name)}</b><small>${esc(p.quoted.handle)}</small></span><p>${mark(p.quoted.text)}</p></div>`
        : ''
    }
    <footer><time>${esc(p.date)}</time>${p.counts.map((c) => `<span>${esc(c)}</span>`).join('')}</footer>
  </article>`

const LEONA = { name: 'Leona Gold', handle: '@leona.gold', hue: 38 }
const SHARE = { name: 'Lion’s Share', handle: '@lionsshare', hue: 356 }

export const SCREENS: ScreenDef[] = [
  {
    id: 'lion',
    name: 'The lion',
    sub: 'Lion’s Share. Take the lion’s share.',
    side: 'left',
    html: `
      <p class="eyebrow hero__eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> THE THRONE ROOM · $ROAR</p>
      <h1 class="display hero__title" aria-label="Lion’s Share">${lines('LION’S', 'SHARE')}</h1>`,
  },
  {
    id: 'name',
    name: 'Why the name',
    sub: 'When the spoils are split, one cut is always bigger.',
    side: 'left',
    html: `
      ${eyebrow('WHY THE NAME')}
      ${head('THE BIGGEST', 'SLICE.')}
      ${lede('When the hunt is shared out, one cut is always bigger. Out here, we call it {{the lion’s share}}.')}
      ${body('Leona Gold, eldest of the pride, says it at every feast: whoever turns up gets fed, and whoever stays gets the lion’s share. It isn’t a product and it isn’t a club. It’s a pride, and a pride needs a face it can put on a flag.')}
      ${note('THE PRIDE HAD A NAME AND NO FACE. NOW IT HAS A MANE.')}`,
  },
  {
    id: 'stage',
    name: 'On stage',
    sub: 'Opening night at the Great Hall. The room answered back.',
    side: 'right',
    html: `
      ${eyebrow('LIVE · THE GREAT HALL · OPENING NIGHT')}
      ${head('ANY LIONS', 'IN HERE?')}
      ${quote('“Big room tonight. Let me hear it: who came here for {{the lion’s share}}? … Thought so. Nobody leaves this hall hungry.”', 'REX MANE, MASTER OF CEREMONIES')}
      ${note('HE WALKED ON FOUR MINUTES LATE AND DIDN’T APOLOGISE. “KINGS DON’T QUEUE,” HE TOLD THE FRONT ROW.')}`,
  },
  {
    id: 'hunt',
    name: 'The hunt',
    sub: 'Every candle on the horizon is a day on the savanna.',
    side: 'left',
    html: `
      ${eyebrow('THE HUNT · THE WATERING HOLE · DAWN')}
      ${head('ON THE', 'HUNT.')}
      ${lede('A lion doesn’t chase every candle on the horizon. He picks one, waits in the long grass, then walks.')}
      ${post({
        ...LEONA,
        text: 'Lesson from an old hunter: lie low, keep your eyes on the horizon, {{move when it counts}}. Chasing everything is how you end up chasing nothing. The pride eats tonight.',
        date: '6:02 AM · DAY ONE',
        counts: ['3.4K ROARS', '906 RE-ROARS', '311 REPLIES'],
      })}`,
  },
  {
    id: 'pride',
    name: 'The pride',
    sub: 'One lion is a rumour. A pride is a weather system.',
    side: 'left',
    html: `
      ${eyebrow('THE PRIDE · OVERHEARD AT THE WATERING HOLE')}
      ${head('STRENGTH', 'IN', 'NUMBERS.')}
      ${quote('“One lion is a rumour. Forty lions is {{a pride}}. Forty thousand is a weather system.”', 'OLD SAM TUFT, WHO HAS SEEN A FEW SEASONS')}
      ${quote('“We don’t count members. We count {{who turns up for dinner}}.”', 'ADA PRIDEWELL, KEEPER OF THE DEN')}`,
  },
  {
    id: 'foryou',
    name: 'For you',
    sub: 'Not for the tourists. For the ones who stayed.',
    side: 'left',
    html: `
      ${eyebrow('A NOTE FROM THE ROCK · FOR YOU')}
      ${head('THIS ROAR’S', 'FOR YOU.')}
      ${lede('Not for the tourists, not for the drive-by safari. For the cub who showed up on day one and never left the grass.')}
      ${quote('“If you’re reading this, {{you’re already part of the pride}}. Walk like it.”', 'LEONA GOLD, PRIDE ELDER')}`,
  },
  {
    id: 'summit',
    name: 'The summit',
    sub: 'One rock, one beam of light, one very large lion.',
    side: 'left',
    html: `
      ${eyebrow('THE SUMMIT · HIGH NOON')}
      ${head('TOP OF', 'THE', 'ROCK.')}
      ${lede('Every pride keeps a high rock for the big announcements. Marlo Kopje, who runs the den’s treasury, climbed it to say the share now lands {{the moment the hunt is done}}. Leona quoted him and added a line of her own.')}`,
    aside: post({
      ...LEONA,
      text: 'no more waiting at the edge of the clearing. {{the share is served hot}} ✦',
      quoted: {
        name: 'Marlo Kopje',
        handle: '@marlo.kopje',
        text: 'Big one from the rock today: from this season, every share is split and served the moment the hunt ends. No queue, no leftovers, no hyenas.',
      },
      date: '12:00 PM · HIGH NOON',
      counts: ['2.8K ROARS', '540 REPLIES'],
    }),
  },
  {
    id: 'cheers',
    name: 'Cheers',
    sub: 'Something golden in the glass. Fireworks overhead.',
    side: 'left',
    html: `
      ${eyebrow('THE FEAST · AFTER DARK')}
      ${head('A TOAST', 'TO THE', 'PRIDE.')}
      ${lede('Raise something golden. The hunt went well, the fireworks are paid for, and {{nobody is splitting the bill}}.')}`,
  },
  {
    id: 'ask',
    name: 'Ask the lion',
    sub: 'Thirty minutes on the rock. No question too small.',
    side: 'left',
    html: `
      ${eyebrow('OFFICE HOURS · @LIONSSHARE ON THE WATERING HOLE')}
      ${head('ASK THE', 'LION.')}
      ${lede('Questions go in, roars come out. For half an hour he answers everything, as long as it’s about the hunt, the mane or the suit.')}`,
    aside: post({
      ...SHARE,
      text: 'On the rock for the next 30 minutes. Ask me anything. {{No question is too small. Most answers are roars.}}',
      date: '7:30 PM · OFFICE HOURS',
      counts: ['4.1K ROARS', '2.2K REPLIES'],
    }),
  },
  {
    id: 'token',
    name: 'The token',
    sub: '$ROAR. The community token of the pride. Chain to be announced.',
    side: 'left',
    html: `
      ${eyebrow('THE TOKEN · CHAIN TBA')}
      ${head('HOLD $ROAR.', 'TAKE YOUR', 'SHARE.')}
      ${lede('$ROAR is a community token: a mascot, a mane, and a pride that thinks the biggest slice belongs to whoever stays at the table. Nothing to buy yet. These buttons wake up when there is.')}
      <div class="actions" data-in>
        <span class="slot" data-buy="gold"></span>
        <span class="slot" data-ca="named"></span>
        <span class="slot" data-explorer></span>
      </div>`,
  },
  {
    id: 'memes',
    name: 'The memes',
    sub: 'The memes. Spin them, open one, bring your own.',
    side: 'left',
    html: `
      ${eyebrow('THE MEMES')}
      ${head('THE PRIDE', 'PROVIDES.')}
      ${lede('Every frame around him came from the pride. Made a better one? Bring it back to the den.')}
      <button class="ringkeys" type="button" id="ringKeys" aria-roledescription="carousel"
        aria-label="Meme carousel. Left and right arrow keys turn it one frame. Enter opens the meme at the front." data-in>
        <span aria-hidden="true">⟵ ⟶</span> Drag to turn the memes · click one to open it
      </button>
      <div class="actions" data-in>
        <a class="btn btn--gold" data-href="community" href="#">Bring a meme to the den ↗</a>
      </div>`,
  },
  {
    id: 'join',
    name: 'Join the pride',
    sub: 'Pull up a rock. Keep an eye on the horizon.',
    side: 'left',
    html: `
      ${eyebrow('JOIN THE PRIDE')}
      ${head('JOIN THE', 'PRIDE.')}
      ${lede('The pride gathers at dusk. Pull up a rock, say hello, and keep one eye on the horizon.')}
      <div class="actions" data-in>
        <a class="btn btn--gold" data-href="community" href="#">Join the pride ↗</a>
        <a class="btn btn--ghost" data-href="follow" href="#">Follow the roar ↗</a>
      </div>
      <div class="cabox" data-in>
        <span class="cabox__label">Contract address</span>
        <span class="slot" data-ca="full" data-tag></span>
      </div>
      <div class="actions" data-in>
        <span class="slot" data-buy="ghost"></span>
        <span class="slot" data-explorer></span>
      </div>
      <dl class="stats" id="stats" data-in></dl>
      <p class="disclaimer" data-in>A fictional community art project. Lion’s Share, Leona Gold, Rex Mane, Marlo Kopje, the Great Hall, the Watering Hole and every lion quoted here are made up. Not affiliated with any company or person. Nothing here is financial advice.</p>`,
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
