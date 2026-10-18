import gsap from 'gsap'
import { A, allocationText, cadenceText, capText, fmtDate, fmtNumber, minHoldingText, nextSnapshotText, tokenFacts } from './airdrop'
import { MAX_QUESTION } from './ask'
import { config, DISCLAIMER } from './config'
import { scramble } from './scramble'

/**
 * The twelve screens: names, URL hashes, the corner label, and the copy.
 * Together they explain the $ROAR airdrops. Every figure comes from
 * config.ts (via airdrop.ts); a missing one reads "TBA". `{{double braces}}`
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

/** Screen 03: the three steps. */
const steps = (items: [string, string][]) => `
  <ol class="steps" data-in>
    ${items.map(([t, d], i) => `<li><span class="steps__n">${String(i + 1).padStart(2, '0')}</span><b class="steps__t">${esc(t)}</b><span class="steps__d">${mark(d)}</span></li>`).join('')}
  </ol>`

/** Screen 05: the rules, one row each. */
const rules = (rows: { label: string; value: string }[]) =>
  `<dl class="rules" data-in>${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>`

/** Screen 04's card body: the cadence and a countdown (airdrop.ts keeps it ticking). */
const countdown = () => `
  <div class="countdown" data-countdown>
    <span class="countdown__label">Next snapshot</span>
    <span class="countdown__value">${esc(A.nextSnapshot ? '—' : 'TBA')}</span>
    ${A.nextSnapshot ? `<span class="countdown__date">${esc(nextSnapshotText())}</span>` : ''}
  </div>`

/** Screen 08: every round so far, newest first. */
const DROPS_SHOWN = 6
const drops = () => {
  const rounds = [...A.history].sort((a, b) => b.round - a.round)
  const row = (r: (typeof rounds)[number]) => `
    <li>
      <span>${esc(fmtDate(r.date))}</span>
      <span>Round ${r.round}</span>
      <span>${esc(`${fmtNumber(r.totalSent)} ${A.rewardToken}`)}</span>
      <span>${esc(fmtNumber(r.wallets))} wallets</span>
      ${
        r.txUrl
          ? `<a class="drops__tx" href="${esc(r.txUrl)}" target="_blank" rel="noopener noreferrer">Tx ↗</a>`
          : `<span class="drops__tx is-disabled" title="Coming soon">Tx</span>`
      }
    </li>`
  return `
    <ol class="drops" data-in aria-label="Airdrop rounds">${rounds.slice(0, DROPS_SHOWN).map(row).join('')}</ol>
    ${rounds.length > DROPS_SHOWN ? note(`Showing the latest ${DROPS_SHOWN} of ${rounds.length} rounds.`) : ''}`
}

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
        <span class="post__who"><b>${esc(config.name)} · Office Hours</b><small>Airdrop FAQ</small></span>
        <span class="post__net qa__live"><i aria-hidden="true"></i>LIVE</span>
      </header>
      <p class="qa__q" hidden></p>
      <p class="qa__who">PINNED</p>
      <p class="qa__typing" hidden>Lion is typing<span class="qa__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
      <p class="post__text qa__a">Office hours are open. Ask me how the drops work: snapshots, rules, claiming, where to check. <mark>Price questions get a roar, not an answer.</mark></p>
      <footer><time>OFFICE HOURS · AIRDROP FAQ</time></footer>
    </article>
    <p class="visually-hidden qa__live-text" aria-live="polite"></p>
  </div>`

const capLine =
  A.perWalletCap === null
    ? 'And a per-wallet cap (TBA) means {{the whales can’t take it all}}.'
    : `And no wallet can take more than ${A.perWalletCap}% of a round, so {{the whales can’t take it all}}.`

export const SCREENS: ScreenDef[] = [
  {
    id: 'hold',
    name: `Hold ${T}`,
    sub: `Hold ${T}. The airdrops go to the holders.`,
    side: 'left',
    html: `
      <p class="eyebrow hero__eyebrow" data-in><span class="slashes" aria-hidden="true">//////</span> THE THRONE ROOM · ${esc(T)} AIRDROPS</p>
      <h1 class="display hero__title" aria-label="${esc(`Hold ${T}. Take the lion’s share.`)}">${lines(`HOLD ${T}.`, 'TAKE THE', 'LION’S SHARE.')}</h1>
      ${lede(`Holders of ${T} receive airdrops. Be holding at the snapshot, and {{your share is sent straight to your wallet}}.`)}
      <div class="actions" data-in>
        <span class="slot" data-buy="primary"></span>
        <a class="btn btn--ghost" href="#how" data-goto="how">How it works <span aria-hidden="true">↓</span></a>
      </div>
      ${note('Airdrops are discretionary community rewards. They may change or end.')}`,
  },
  {
    id: 'name',
    name: 'Why the name',
    sub: 'The biggest cut goes to the ones who stay.',
    side: 'left',
    html: `
      ${eyebrow('WHY THE NAME')}
      ${head('THE BIGGEST', 'SLICE.')}
      ${lede('The lion’s share goes to {{the ones who hold}}.')}
      ${body('When the spoils are split, one cut is always bigger. Here it doesn’t go to whoever shouts loudest or moves fastest. It goes to the holders: the ones still in the pride when the snapshot is taken.')}
      ${note('HOLD. GET COUNTED. TAKE YOUR SHARE.')}`,
  },
  {
    id: 'how',
    name: 'How it works',
    sub: 'Hold, get counted, receive. Nothing to claim.',
    side: 'right',
    html: `
      ${eyebrow('ON STAGE · HOW IT WORKS')}
      ${head('HOW THE', 'DROPS WORK.')}
      ${steps([
        [`Hold ${T}`, 'In a wallet you control.'],
        ['Be holding at the snapshot', 'One moment, one record of every holder.'],
        ['Receive your share', 'Sent straight to your wallet. {{Nothing to claim, nothing to sign.}}'],
      ])}
      ${note('Airdrops are discretionary community rewards. They may change or end.')}`,
  },
  {
    id: 'snapshots',
    name: 'Snapshots',
    sub: 'One moment. One record of every holder.',
    side: 'left',
    html: `
      ${eyebrow('THE HUNT · SNAPSHOTS')}
      ${head('SNAPSHOTS.')}
      ${lede('No sign-ups, no forms, no queue. {{The snapshot does the counting.}}')}
      ${announcement(
        `A snapshot is a moment-in-time record of every wallet holding ${T}. Holding when it’s taken is what counts. ${A.cadence ? `Snapshots are taken ${cadenceText()}.` : 'Snapshot schedule: TBA.'}`,
        countdown(),
        'SNAPSHOT SCHEDULE',
      )}`,
  },
  {
    id: 'rules',
    name: 'The rules',
    sub: 'Who counts, how much, and who never does.',
    side: 'left',
    html: `
      ${eyebrow('THE PRIDE · THE RULES')}
      ${head('THE', 'RULES.')}
      ${rules([
        { label: 'Minimum holding', value: minHoldingText() },
        { label: 'Per-wallet cap', value: capText() },
        { label: 'Never counted', value: A.exclusions.length ? A.exclusions.join(' · ') : 'None' },
      ])}
      ${note('Rules may change before any round. This page always shows the current ones.')}`,
  },
  {
    id: 'holders',
    name: 'Every holder',
    sub: 'Shares in proportion. Small holders included.',
    side: 'left',
    html: `
      ${eyebrow('FOR YOU · EVERY HOLDER')}
      ${head('EVERY', 'HOLDER', 'COUNTS.')}
      ${lede('Your share is proportional to what you hold. {{Small holders included.}}')}
      ${body(`Above the minimum, every eligible wallet gets its cut: hold more, receive more; hold less, still receive your part. ${capLine}`)}`,
  },
  {
    id: 'proof',
    name: 'Nothing hidden',
    sub: 'One reserve wallet. Every round published.',
    side: 'left',
    html: `
      ${eyebrow('THE SUMMIT · PROOF')}
      ${head('NOTHING', 'HIDDEN.')}
      ${lede('Every drop leaves from one public reserve wallet. For every round, the snapshot, the holder list and the transactions are published, so {{anyone can check the split}}.')}`,
    aside: announcement(
      'The airdrop reserve. Every drop is sent from this wallet, and every transfer can be checked on the explorer.',
      `<div class="cabox">
        <span class="cabox__label">Airdrop reserve wallet</span>
        <span class="slot" data-reserve data-tag></span>
      </div>
      <div class="actions"><span class="slot" data-reserve-explorer></span></div>`,
      `ALLOCATION · ${allocationText()}`,
    ),
  },
  {
    id: 'drops',
    name: 'Drops so far',
    sub: 'Every round, on the record.',
    side: 'left',
    html: `
      ${eyebrow('CHEERS · THE RECORD')}
      ${head('DROPS', 'SO FAR.')}
      ${
        A.history.length
          ? `${lede(`Raise something golden: ${A.history.length} ${A.history.length === 1 ? 'round' : 'rounds'} sent, {{every one on the record}}.`)}${drops()}`
          : `${lede('The first drop is coming. {{Be holding when it lands.}}')}${note('Every round will be listed here: the date, the total sent, the wallets and the transactions.')}`
      }`,
  },
  {
    id: 'ask',
    name: 'Ask the lion',
    sub: 'Airdrop questions, answered from the rock.',
    side: 'left',
    html: `
      ${eyebrow('OFFICE HOURS · AIRDROP FAQ')}
      ${head('ASK THE', 'LION.')}
      ${lede('He’s up on the ledge above the water. Drop a question in and watch it float up to him. {{Ask about the drops}}: snapshots, rules, claiming, where to check.')}
      <form class="ask" data-in autocomplete="off" novalidate>
        <label class="visually-hidden" for="askInput">Your question for the lion</label>
        <span class="ask__field">
          <input id="askInput" type="text" maxlength="${MAX_QUESTION}" placeholder="Ask about the airdrops…" enterkeyhint="send" spellcheck="false" />
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
    sub: `${T}. The token that puts you in line for the drops.`,
    side: 'left',
    html: `
      ${eyebrow(`THE TOKEN · CHAIN ${(config.chain ?? 'TBA').toUpperCase()}`)}
      ${head('THE', 'TOKEN.')}
      ${lede(`${T} is the meme token of the pride. {{Holding it is what puts you in line for the drops.}}${config.buyUrl ? '' : ' Nothing to buy yet; these buttons wake up when there is.'}`)}
      ${facts(tokenFacts().slice(1))}
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
        <p>We’ll never DM you, ask for your seed phrase, or ask you to connect a wallet to receive an airdrop. Airdrops are sent automatically. Only trust links on this site.</p>
      </div>
      <div class="cabox" data-in>
        <span class="cabox__label">Contract address</span>
        <span class="slot" data-ca="full" data-tag></span>
      </div>
      <div class="actions" data-in>
        <span class="slot" data-buy="ghost"></span>
        <span class="slot" data-explorer></span>
      </div>
      ${facts(tokenFacts())}
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
