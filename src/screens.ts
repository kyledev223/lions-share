import gsap from 'gsap'
import { B, cadenceText, feeShareText, methodText, retired, sinkName, tokenFacts } from './buyback'
import { MAX_QUESTION } from './ask'
import { config, DISCLAIMER, SHORT_DISCLAIMER } from './config'
import { scramble } from './scramble'

/**
 * The twelve screens: names, URL hashes, the corner label, and the copy.
 * Together they explain the $ROAR buybacks. Every figure comes from
 * config.ts (via buyback.ts); a missing one reads "TBA". `{{double braces}}`
 * mark the phrase that gets the red highlight. The matching 3D stages are
 * in gl/scenes.ts, in the same order.
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
  /** A card that sits on the far side of the screen (an official announcement). */
  aside?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
/** Label/value rows in the gold mono style. */
const facts = (rows: { label: string; value: string }[]) =>
  `<dl class="stats" data-in>${rows.map((r) => `<div class="stat"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>`

const T = config.ticker

/** An official Lion’s Share announcement card: no handles, no counts. */
const announcement = (text: string, extra: string, footer: string) => `
  <article class="post" data-in aria-label="Official announcement from ${esc(config.name)}">
    <header>
      <span class="post__avatar" style="--hue:356" aria-hidden="true"></span>
      <span class="post__who"><b>${esc(config.name)}</b><small>Official announcement</small></span>
      <span class="post__net">OFFICIAL</span>
    </header>
    <p class="post__text">${mark(text)}</p>
    ${extra}
    <footer><span>${esc(footer)}</span></footer>
  </article>`

/** Screen 03: the four steps. */
const steps = (items: [string, string][]) => `
  <ol class="steps" data-in>
    ${items.map(([t, d], i) => `<li><span class="steps__n">${String(i + 1).padStart(2, '0')}</span><b class="steps__t">${esc(t)}</b><span class="steps__d">${mark(d)}</span></li>`).join('')}
  </ol>`

/** Screen 05: the rules, one row each. */
const rules = (rows: { label: string; value: string }[]) =>
  `<dl class="rules" data-in>${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>`

/** Screen 04's card body: where a countdown would go, if there were anything to wait for. */
const nextBuy = `
  <div class="nextbuy">
    <span class="nextbuy__label">Next buyback</span>
    <span class="nextbuy__value">The next buy</span>
    <span class="nextbuy__note">No countdown. No waiting.</span>
  </div>`

/** Screen 07: one public address with its explorer link (token.ts fills both slots from config). */
const walletBox = (label: string, which: 'buyback' | 'burn') => `
  <div class="cabox">
    <span class="cabox__label">${esc(label)}</span>
    <span class="slot" data-wallet="${which}" data-tag></span>
  </div>
  <div class="actions"><span class="slot" data-wallet-explorer="${which}"></span></div>`

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
        <span class="post__who"><b>${esc(config.name)} · Office Hours</b><small>Buyback FAQ</small></span>
        <span class="post__net qa__live"><i aria-hidden="true"></i>LIVE</span>
      </header>
      <p class="qa__q" hidden></p>
      <p class="qa__who">PINNED</p>
      <p class="qa__typing" hidden>Lion is typing<span class="qa__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
      <p class="post__text qa__a">Office hours are open. Ask me how the buybacks work: the fees, when they happen, the burn, where to check. <mark>Price questions get a roar, not an answer.</mark></p>
      <footer><time>OFFICE HOURS · BUYBACK FAQ</time></footer>
    </article>
    <p class="visually-hidden qa__live-text" aria-live="polite"></p>
  </div>`

/** Where the money comes from, in running copy: "the creator trading fees", or "the fees" while TBA. */
const fees = B.feeSource ? `the ${B.feeSource}` : 'the fees'
/** What happens next, as a punchline. Until `method` is set it stays true to both. */
const fate =
  B.method === 'lock' ? 'Then the lion locks it away.' : B.method === 'burn' ? 'Then the lion burns it.' : 'Then it’s taken out of circulation.'
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Screen 03, step 3: what happens to the bought tokens, per `method`. */
const sinkStep: [string, string] =
  B.method === 'lock'
    ? [`Bought ${T} is locked`, 'Held in a public lock, {{out of circulation}}.']
    : B.method === 'burn'
      ? [`Bought ${T} is burned`, 'Sent to an address nobody controls. {{Gone for good.}}']
      : [`Bought ${T} is burned or locked`, 'Which one is in the published rules (TBA).']

/** Screen 06 explains what taking tokens out of circulation does, for the method in config (burn until told otherwise). */
const supplyCopy =
  B.method === 'lock'
    ? {
        lede: 'Locked tokens are held out of circulation, so {{the circulating supply shrinks}}.',
        body: 'While they stay locked, there are fewer tokens in circulation, so each one left is a larger share of what circulates. That’s arithmetic, not a promise about price.',
      }
    : {
        lede: 'Burned tokens are gone permanently, so {{the circulating supply shrinks}}.',
        body: 'A burned token can never be spent, sold or brought back. With fewer tokens left in circulation, each remaining one is a larger share of the total. That’s arithmetic, not a promise about price.',
      }

/** Old #hashes, sent to the screen that took their place. */
export const HASH_ALIASES: Record<string, string> = {
  snapshots: 'every-buy',
  schedule: 'every-buy',
  holders: 'supply',
  drops: 'relax',
  buybacks: 'relax',
}

export const SCREENS: ScreenDef[] = [
  {
    id: 'hold',
    name: `Hold ${T}`,
    sub: `Hold ${T}. The lion buys back.`,
    side: 'left',
    html: `
      <p class="eyebrow hero__eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> THE THRONE ROOM · ${esc(T)} BUYBACKS</p>
      <h1 class="display hero__title" aria-label="${esc(`Hold ${T}. The lion buys back.`)}">${lines(`HOLD ${T}.`, 'THE LION', 'BUYS BACK.')}</h1>
      ${lede(
        B.feePercent === null
          ? `A share of ${fees} is used to buy ${T} on the open market. {{${fate}}}`
          : `{{${feeShareText()}}} buys ${T} on the open market${B.cadence ? `, ${cadenceText()}` : ''}. ${fate}`,
      )}
      <div class="actions" data-in>
        <span class="slot" data-buy="primary"></span>
        <a class="btn btn--ghost" href="#how" data-goto="how">How it works <span aria-hidden="true">↓</span></a>
      </div>
      ${note('Buybacks follow published rules. Any change is announced before it applies.')}`,
  },
  {
    id: 'name',
    name: 'Why the name',
    sub: 'He takes his share and puts it back.',
    side: 'left',
    html: `
      ${eyebrow('WHY THE NAME')}
      ${head('THE BIGGEST', 'SLICE.')}
      ${lede('The lion takes his share, then {{puts it back into the pride}}.')}
      ${body(`When the spoils are split, one cut is always bigger. Here the lion’s cut is a share of ${fees}, and it doesn’t go into anyone’s pocket. It goes back into the pride: spent on ${T} from the open market, which is then ${retired()}.`)}
      ${note('HE TAKES HIS SHARE. HE PUTS IT BACK.')}`,
  },
  {
    id: 'how',
    name: 'How it works',
    sub: `Fees in. ${T} bought. ${T} ${retired()}.`,
    side: 'right',
    html: `
      ${eyebrow('ON STAGE · HOW IT WORKS')}
      ${head('HOW BUYBACKS', 'WORK.')}
      ${steps([
        [
          `Someone buys ${T}`,
          B.feePercent === null ? `A share of ${fees} (TBA) goes to his wallet.` : `${capFirst(feeShareText())} goes to his wallet.`,
        ],
        [`The lion buys ${T} back`, 'Automatically, on the open market, {{like anyone else}}.'],
        sinkStep,
        ['Every buyback is on-chain', 'From one public wallet. {{Check it on the explorer.}}'],
      ])}
      ${note('Buybacks follow published rules. Any change is announced before it applies.')}`,
  },
  {
    id: 'every-buy',
    name: 'Every buy',
    sub: 'No schedule. No waiting.',
    side: 'left',
    html: `
      ${eyebrow('THE HUNT · EVERY BUY')}
      ${head('EVERY', 'BUY.')}
      ${lede(`No schedule, no countdown, nobody deciding when. {{Every time someone buys ${T}, the lion buys back.}}`)}
      ${announcement(
        B.feePercent === null
          ? `One published rule, no improvising: a share of ${fees} (TBA) buys ${T} back${B.cadence ? `, ${cadenceText()}` : ''}.`
          : `One published rule, no improvising: {{${feeShareText()} buys ${T} back}}${B.cadence ? `, ${cadenceText()}` : ''}.`,
        nextBuy,
        'AUTOMATIC BUYBACKS',
      )}`,
  },
  {
    id: 'rules',
    name: 'The rules',
    sub: 'Published in advance. Changes announced first.',
    side: 'left',
    html: `
      ${eyebrow('THE PRIDE · THE RULES')}
      ${head('THE', 'RULES.')}
      ${rules([
        { label: 'Share of fees for buybacks', value: B.feePercent === null ? 'TBA' : `${B.feePercent}%` },
        { label: 'When', value: B.cadence ? capFirst(cadenceText()) : 'TBA' },
        { label: `Bought ${T} is`, value: methodText() },
      ])}
      ${note('These rules are published in advance. Any change is announced here before it applies.')}`,
  },
  {
    id: 'supply',
    name: 'Fewer tokens',
    sub: 'A smaller supply. The same pride.',
    side: 'left',
    html: `
      ${eyebrow('FOR YOU · THE SUPPLY')}
      ${head('FEWER', 'TOKENS,', 'SAME PRIDE.')}
      ${lede(supplyCopy.lede)}
      ${body(supplyCopy.body)}`,
  },
  {
    id: 'proof',
    name: 'Nothing hidden',
    sub: 'One public wallet. Every buyback on-chain.',
    side: 'left',
    html: `
      ${eyebrow('THE SUMMIT · PROOF')}
      ${head('NOTHING', 'HIDDEN.')}
      ${lede(`Every buyback is made from one public wallet, and every ${T} it buys goes to a public ${sinkName().toLowerCase()}. {{Every buyback is an on-chain transaction}}, so anyone can check.`)}`,
    aside: announcement(
      `The buyback wallet and the ${sinkName().toLowerCase()}. Every buyback is an on-chain transaction from this wallet, so anyone can check it on the explorer.`,
      `${walletBox('Buyback wallet', 'buyback')}${walletBox(sinkName(), 'burn')}`,
      `FUNDED BY · ${feeShareText()}`,
    ),
  },
  {
    id: 'relax',
    name: 'Sit back',
    sub: 'Nothing to claim, sign or send.',
    side: 'left',
    html: `
      ${eyebrow('CHEERS · FOR HOLDERS')}
      ${head('SIT', 'BACK.')}
      ${lede('Buybacks happen on their own. {{Holders don’t have to do a thing.}}')}
      ${body(`The lion’s wallet does the buying with ${fees}, never with yours. Nothing to register for, nothing to stake, nothing to connect. If anyone asks you to do any of it, it isn’t us.`)}
      ${facts([
        { label: 'To claim', value: 'Nothing' },
        { label: 'To sign', value: 'Nothing' },
        { label: 'To send', value: 'Nothing' },
      ])}
      ${note('THE LION HUNTS. THE PRIDE RAISES A GLASS.')}`,
  },
  {
    id: 'ask',
    name: 'Ask the lion',
    sub: 'Buyback questions, answered from the rock.',
    side: 'left',
    html: `
      ${eyebrow('OFFICE HOURS · BUYBACK FAQ')}
      ${head('ASK THE', 'LION.')}
      ${lede('He’s up on the ledge above the water. Drop a question in and watch it float up to him. {{Ask about the buybacks}}: the fees, when they happen, the burn, where to check.')}
      <form class="ask" data-in autocomplete="off" novalidate>
        <label class="visually-hidden" for="askInput">Your question for the lion</label>
        <span class="ask__field">
          <input id="askInput" type="text" maxlength="${MAX_QUESTION}" placeholder="Ask about the buybacks…" enterkeyhint="send" spellcheck="false" />
          <span class="ask__count" aria-hidden="true"></span>
        </span>
        <button class="btn btn--gold" type="submit">Ask</button>
      </form>
      ${note('Answers are in character and for fun. Not financial advice. The rules on this site are the ones that count.')}`,
    aside: officeHours(),
  },
  {
    id: 'token',
    name: 'The token',
    sub: `${T}. The meme token of the pride.`,
    side: 'left',
    html: `
      ${eyebrow(`THE TOKEN · CHAIN ${(config.chain ?? 'TBA').toUpperCase()}`)}
      ${head('THE', 'TOKEN.')}
      ${lede(`${T} is the meme token of the pride. {{${B.feePercent === null ? `A share of ${fees}` : capFirst(feeShareText())} buys it back.}}${config.buyUrl ? '' : ' Nothing to buy yet; these buttons wake up when there is.'}`)}
      ${facts([tokenFacts().supply, tokenFacts().burned, tokenFacts().circulating, tokenFacts().chain])}
      <div class="actions" data-in>
        <span class="slot" data-buy="gold"></span>
        <span class="slot" data-ca="named"></span>
        <span class="slot" data-explorer></span>
      </div>`,
  },
  {
    id: 'memes',
    name: 'Spread the roar',
    sub: 'The memes. Spin them, open one, bring your own.',
    side: 'left',
    html: `
      ${eyebrow('THE MEMES')}
      ${head('SPREAD THE', 'ROAR.')}
      ${lede('Every frame around him came from the pride. Made a better one? {{Bring it back to the den}} and let it travel.')}
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
    sub: 'Pull up a rock. Mind the impostors.',
    side: 'left',
    html: `
      ${eyebrow('JOIN THE PRIDE')}
      ${head('JOIN THE', 'PRIDE.')}
      ${lede('The pride gathers at dusk. Pull up a rock, say hello, and {{keep one eye out for impostors}}.')}
      <div class="actions" data-in>
        <a class="btn btn--gold" data-href="community" href="#">Join the pride ↗</a>
        <a class="btn btn--ghost" data-href="follow" href="#">Follow the roar ↗</a>
      </div>
      <div class="safety" data-in role="note" aria-label="Safety notice">
        <span class="safety__label">Stay safe</span>
        <p>We’ll never DM you, ask for your seed phrase, or ask you to send funds. Buybacks happen on-chain from our public wallet. Only trust links on this site.</p>
      </div>
      <p class="disclaimer-short" data-in>${esc(SHORT_DISCLAIMER)} <button class="disclaimer-short__more" type="button" data-disclaimer-open aria-haspopup="dialog">Read more</button></p>
      <div class="cabox" data-in>
        <span class="cabox__label">Contract address</span>
        <span class="slot" data-ca="full" data-tag></span>
      </div>
      <div class="actions" data-in>
        <span class="slot" data-buy="ghost"></span>
        <span class="slot" data-explorer></span>
      </div>
      ${facts([tokenFacts().token, tokenFacts().chain, tokenFacts().burned, tokenFacts().circulating])}
      <p class="disclaimer" data-in>${esc(DISCLAIMER)}</p>`,
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
  /** The visitor flicked back before the change: the leaving copy comes back the way it went. */
  stay(): void
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
      return { def, el, intro: null, leave() {}, stay() {} }
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
    const stay = () => {
      if (!out) return
      out.eventCallback('onReverseComplete', () => still(true))
      out.reverse()
    }
    return { def, el, intro, leave, stay }
  })
}
