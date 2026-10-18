import gsap from 'gsap'
import { MAX_QUESTION } from './ask'
import { scramble } from './scramble'

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
/**
 * Each letter its own span, so headlines rise and drop letter by letter inside their line's mask.
 * Letters sit in unbreakable word spans, so a narrow screen still wraps between words, never inside one.
 */
const letters = (t: string) =>
  t
    .split(' ')
    .map((w) => `<span class="w">${[...w].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</span>`)
    .join(' ')
/** Each line twice: as plain text (shown at rest, so kerning is untouched) and split into letters (shown while moving). */
const lines = (...l: string[]) =>
  l.map((t) => `<span class="line" aria-hidden="true"><span class="line__in"><span class="line__plain">${esc(t)}</span><span class="line__split">${letters(t)}</span></span></span>`).join('')
const eyebrow = (s: string) => `<p class="eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> <span class="eyebrow__t">${esc(s)}</span></p>`
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

/**
 * Screen 09's live Q&A card (ask.ts fills it in): the current question and
 * answer, with the last few stacked faintly behind it like a thread.
 */
const officeHours = () => `
  <div class="qa">
    <div class="qa__thread" aria-hidden="true"></div>
    <article class="post qa__card" aria-label="Office hours: the lion’s latest answer">
      <header>
        <span class="post__avatar" style="--hue:356" aria-hidden="true"></span>
        <span class="post__who"><b>Lion’s Share · Office Hours</b><small>@lionsshare</small></span>
        <span class="post__net qa__live"><i aria-hidden="true"></i>LIVE</span>
      </header>
      <p class="qa__q" hidden></p>
      <p class="qa__who">PINNED</p>
      <p class="qa__typing" hidden>Lion is typing<span class="qa__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
      <p class="post__text qa__a">Office hours are open. Drop a question in the water and I’ll answer whatever floats up. <mark>Most answers are roars.</mark></p>
      <footer><time>7:30 PM · OFFICE HOURS</time><span>4.1K ROARS</span><span>2.2K REPLIES</span></footer>
    </article>
    <p class="visually-hidden qa__live-text" aria-live="polite"></p>
  </div>`

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
      ${eyebrow('OFFICE HOURS · THE WATERING HOLE')}
      ${head('ASK THE', 'LION.')}
      ${lede('He’s up on the ledge above the watering hole. Drop a question in the water and watch it float up to him. {{Questions go in, roars come out}}, as long as it’s about the hunt, the mane or the suit.')}
      <form class="ask" data-in autocomplete="off" novalidate>
        <label class="visually-hidden" for="askInput">Your question for the lion</label>
        <span class="ask__field">
          <input id="askInput" type="text" maxlength="${MAX_QUESTION}" placeholder="Ask the lion…" enterkeyhint="send" spellcheck="false" />
          <span class="ask__count" aria-hidden="true"></span>
        </span>
        <button class="btn btn--gold" type="submit">Ask</button>
      </form>
      ${note('Answers are for fun. Not financial advice.')}`,
    aside: officeHours(),
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
  /**
   * Plays when the screen arrives (~1.45s): the eyebrow scrambles in, the headline rises letter
   * by letter, then the rest fades up. A screen change starts it at the swap (0.49s).
   */
  intro: gsap.core.Timeline | null
  /** The copy leaving (~0.35s): the headline drops letter by letter, the rest slides away; +1 forward, −1 back. */
  leave(dir: number): void
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
    // Headlines set as plain text whenever their letters aren't moving (see .is-still in style.css).
    const heads = [...el.querySelectorAll('.display')]
    const still = (on: boolean) => heads.forEach((h) => h.classList.toggle('is-still', on))
    if (reduced) {
      still(true)
      return { def, el, intro: null, leave() {} }
    }
    const chars = el.querySelectorAll('.line__in .ch')
    const blocks = el.querySelectorAll('.screen__copy [data-in]')
    const aside = el.querySelector('.screen__aside')
    const kicker = el.querySelector<HTMLElement>('.eyebrow__t')
    const kickerText = kicker?.textContent ?? ''

    const intro = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' } })
    intro.call(() => still(false), [], 0)
    // 22ms a letter, squeezed for long headlines so the last one has landed by ~1.45s.
    intro.from(chars, { yPercent: 118, force3D: false, duration: 0.85, stagger: Math.min(0.022, 0.45 / Math.max(1, chars.length)), ease: 'expo.out', onComplete: () => still(true) }, 0.13)
    if (kicker) intro.call(() => scramble(kicker, kickerText, 400, ''), [], 0.11)
    intro.from(blocks, { autoAlpha: 0, y: 22, duration: 0.6, stagger: Math.min(0.12, 0.6 / Math.max(1, blocks.length)), ease: 'power3.out' }, 0.23)
    if (aside) intro.from(aside, { autoAlpha: 0, x: 40, duration: 0.8, ease: 'power3.out' }, 0.43)

    let out: gsap.core.Timeline | null = null
    const leave = (dir: number) => {
      intro.pause()
      out?.kill()
      still(false)
      out = gsap.timeline()
      out.to(chars, { yPercent: 118 * dir, force3D: false, duration: 0.3, stagger: Math.min(0.014, 0.18 / Math.max(1, chars.length)), ease: 'power3.in' }, 0)
      out.to(blocks, { autoAlpha: 0, y: 16 * dir, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, 0.02)
      if (aside) out.to(aside, { autoAlpha: 0, x: 24, duration: 0.3, ease: 'power2.in' }, 0.04)
    }
    return { def, el, intro, leave }
  })
}
