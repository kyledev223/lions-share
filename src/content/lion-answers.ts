import { A, cadenceText, fmtNumber, nextSnapshotText, shorten } from '../airdrop'
import { config } from '../config'

/**
 * The lion's office hours (screen 09): an airdrop FAQ in his voice. Every
 * figure he quotes comes from config.ts; anything not set yet is "TBA". He
 * never gives financial advice, predicts prices or promises anything:
 * questions about price, value or "will it go up" get a playful deflection.
 *
 * Nothing a visitor types is stored or sent anywhere: questions are matched
 * here, in the page, and forgotten.
 */

const T = config.ticker
const minimum = A.minHolding === null ? 'the minimum (TBA)' : `at least ${fmtNumber(A.minHolding)} ${T}`
const cap = A.perWalletCap === null ? 'A per-wallet cap (TBA) keeps' : `No wallet takes more than ${A.perWalletCap}% of a round, which keeps`
const excluded = A.exclusions.length ? A.exclusions.join(', ').toLowerCase() : 'nothing yet'
const exchangesOut = A.exclusions.some((e) => /exchange/i.test(e))
const schedule = A.cadence ? `Snapshots are taken ${cadenceText()}.` : 'The snapshot schedule is TBA.'
const next = A.nextSnapshot ? `Next one: ${nextSnapshotText()}.` : 'Next snapshot: TBA. The countdown on this site wakes up when it’s set.'

/** The general pool: picked at random, no repeats until every one has been used. */
const GENERAL = [
  'Ask me about snapshots, rules or claiming. Everything else gets a proverb.',
  'Hold, get counted, receive. That’s the whole hunt.',
  'A lion never asks for the biggest slice. He just sits where it lands.',
  'Patience is just hunting with better posture.',
  'I’ve never been late. Everyone else has been early.',
  'Kings don’t queue. We do, however, wait beautifully.',
  'I don’t roar to be heard. I roar so the echo has something to do.',
  'Every lion starts as a cub with an oversized opinion. Some of us grew into it.',
  'Rule one of the hunt: be the calmest thing in the long grass.',
  'Hyenas laugh at everything. That’s how you know they never get the joke.',
  'I nap eighteen hours a day. The other six are legendary.',
  'Strength isn’t loud. It just never has to repeat itself.',
  'I don’t chase. I arrive.',
  'Ask me again at dusk. I get philosophical when the light turns gold.',
  'Zebras ask for directions. Lions give them.',
  'Being majestic is ten percent mane and ninety percent not tripping in public.',
  'I keep my claws sharp and my comebacks sharper.',
  'The trick to a good roar is the silence just before it.',
  'Never trust a gazelle who says “trust me”. Or a stranger who DMs you about an airdrop.',
  'Pull up a rock. There’s room. There’s always room.',
]

/** Topics a question can be about, checked in order; the first match answers. */
const TOPICS: { match: RegExp; answers: string[] }[] = [
  {
    // Safety first: seed phrases, DMs and anyone offering "help".
    match: /\b(seed|phrase|private ?key|keys|dms?|messaged?|scam\w*|support|admin\w*|mods?|impost\w*|fake|phish\w*|recover\w*)\b/,
    answers: [
      'We’ll never DM you, never ask for your seed phrase and never ask you to connect a wallet. Anyone who does is a hyena in a borrowed mane.',
      'Your seed phrase stays with you. Always. Airdrops are sent automatically; nobody needs it, least of all me.',
      'Only trust links on this site. The rest of the savanna is full of very convincing hyenas.',
    ],
  },
  {
    match: /\b(claim\w*|redeem\w*|collect\w*|apply|register\w*|sign ?up|whitelist\w*)\b/,
    answers: [
      'Nothing to claim, nothing to sign. Your share is sent straight to your wallet.',
      'No forms, no claiming. If someone asks you to “claim” a drop, walk away. It arrives on its own.',
    ],
  },
  {
    match: /\b(connect\w*|sign\w*|approv\w*|permission\w*|metamask|phantom|link (my|your) wallet)\b/,
    answers: [
      'Never. You don’t connect a wallet to receive a drop. Anyone who asks is a hyena.',
      'No connecting, no signing. Drops are sent automatically to holders’ wallets.',
    ],
  },
  {
    // Money talk gets a deflection, every time. Checked before the airdrop topics so "will the airdrop pump" is still a deflection.
    match: /\b(prices?|pump\w*|moon\w*|go(es|ing)? up|worth|value|lambo|\d+x|charts?|wen|mcap|market ?cap|ath|dip|profits?|returns?|rich|gains?|invest\w*|predict\w*|sell\w*|dump\w*|financ\w*|money|cash)\b/,
    answers: [
      'I don’t do predictions. I do patience.',
      'Will it go up? Ask a giraffe. They see further than I do.',
      'Charts are for hyenas. Lions watch the horizon and keep quiet.',
      'Ask the stars about prices. Ask me about snapshots.',
      'Nothing said on this ledge is advice. Especially the bits that sound like it.',
    ],
  },
  {
    match: /\b(exclu\w*|exchanges?|cex\w*|lp|liquidity|pools?|burn\w*|team|devs?|binance|coinbase|kraken|okx|bybit)\b/,
    answers: [`Never counted: ${excluded}. Hold in a wallet you control.`],
  },
  {
    match: /\b(qualif\w*|eligib\w*|minimum|min|requir\w*|need to hold|how much do i need|how do i get|enough)\b/,
    answers: [
      `Hold ${minimum} in a wallet you control when the snapshot is taken. That’s the whole test.`,
      `Be holding at the snapshot, in your own wallet.${exchangesOut ? ' Exchange balances don’t count.' : ''}`,
    ],
  },
  {
    match: /\b(snapshots?|when|schedule\w*|next|how often|cadence|date|countdown|monthly|weekly)\b/,
    answers: [`${schedule} ${next}`, `A snapshot is a moment-in-time record of every holder. ${schedule}`],
  },
  {
    match: /\b(how much|caps?|capped|whales?|proportion\w*|small|tiny|shrimp|fair\w*|split\w*|big holders?)\b/,
    answers: [
      `Your share is proportional to what you hold. Small holders included. ${cap} the whales from taking it all.`,
      `Hold more, receive more; hold less, still receive your part. ${cap} it fair.`,
    ],
  },
  {
    match: /\b(verif\w*|proof|prove|check\w*|trust\w*|transparen\w*|explorer|tx|txs|transactions?|reserve|on ?chain|audit\w*|list)\b/,
    answers: [
      'Every round’s snapshot, holder list and transactions are published. Check them on the explorer yourself.',
      A.reserveWallet
        ? `Every drop leaves the reserve wallet, ${shorten(A.reserveWallet)}. Watch it on the explorer.`
        : 'Every drop leaves one public reserve wallet. Its address is TBA; it goes up on this site’s Nothing Hidden screen.',
    ],
  },
  {
    match: /\b(chain|network|contract|address|ca)\b/,
    answers: [
      `${T} lives on ${config.chain ?? 'a chain that’s still TBA'}. ${config.contractAddress ? 'Copy the contract from this site, nowhere else.' : 'The contract address goes up here when it’s live. Anything before that is an impostor.'}`,
    ],
  },
  {
    match: /\b(buy\w*|purchase\w*|get some|launch\w*|listing|listed|presale|live)\b/,
    answers: [
      config.buyUrl ? 'The Buy button on this site is the only link I’d trust.' : 'Nothing to buy yet. The Buy button wakes up when it’s live. Only trust links on this site.',
      'Use the links on this site and nothing else. Nothing said here is advice.',
    ],
  },
  {
    // "$roar" arrives here as "sroar": normalise() reads $ as s.
    match: /\b(airdrop\w*|drops?|rewards?|sroar|tokens?|coins?|holders?|holding|hold)\b/,
    answers: [
      `An airdrop is ${A.rewardToken} sent straight to holders’ wallets. Be holding at the snapshot and a share comes to you.`,
      'The pride’s reward for staying: a share sent to every eligible holder after a snapshot. Discretionary, like all good gifts, and it may change or end.',
      `${T} is the meme token of the pride. Hold it, get counted at the snapshot, receive your share.`,
    ],
  },
  {
    match: /\b(suit\w*|tie|ties|tailor\w*|jacket|dress\w*|outfit|wear\w*|fashion|shoes?|charcoal|crimson)\b/,
    answers: [
      'The suit is tailored. The confidence came pre-assembled.',
      'Charcoal hides the dust of the hunt. The red tie hides nothing. That’s the point.',
      'Why the suit? The mane was already doing casual.',
    ],
  },
  {
    match: /\b(manes?|hair\w*|fur|wig|groom\w*|blow ?dry|comb\w*|shampoo)\b/,
    answers: [
      'The mane is real. The upkeep is a full-time job with no days off.',
      'The wind does my hair. I just stand where it’s flattering.',
      'Real, golden and entirely self-styled. Next question.',
    ],
  },
  {
    match: /\b(roar\w*|loud\w*|voice|growl\w*|shout\w*|noise)\b/,
    answers: [
      'You’ll know the roar when you hear it. So will the neighbours.',
      'My roar has two settings: dinner bell and do not disturb.',
      'I only roar when the moment earns it. This one’s getting close.',
    ],
  },
  {
    match: /\b(hunt\w*|prey|chase\w*|stalk\w*|gazelles?|zebras?|wildebeest|catch\w*)\b/,
    answers: [
      'The hunt is ninety percent waiting, nine percent stretching, one percent glory.',
      'We hunt together, eat together and argue about the leftovers together.',
    ],
  },
  {
    match: /\b(sleep\w*|naps?|napping|tired|rest\w*|bed)\b/,
    answers: ['Eighteen hours a day, on the warmest rock. Rest is a strategy.', 'I don’t sleep. I recharge my majesty.'],
  },
  {
    match: /\b(cubs?|join\w*|pride|members?|community|friends?|family)\b/,
    answers: [
      'Cubs are always welcome. Bring an appetite and an indoor voice.',
      'Anyone who turns up is pride. The links on this site are the way in.',
    ],
  },
]

const IGNORED = 'The lion ignores that one.'

/**
 * Profanity and slurs, ROT13'd so the list isn't a wall of them. `WORDS`
 * only match a whole word (plus a plural or -ed/-ing), since some sit inside
 * harmless ones ("spicy", "grape", "swanky"); `ROOTS` match inside a word.
 */
const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))
const ROOTS = ['shpx', 'fuvg', 'phag', 'ovgpu', 'nffubyr', 'jube', 'avttre', 'avttn', 'snttbg'].map(rot13)
const WORDS = new Set(
  ['qvpx', 'pbpx', 'chffl', 'fyhg', 'onfgneq', 'cevpx', 'gjng', 'jnax', 'jnaxre', 'snt', 'ergneq', 'xvxr', 'fcvp', 'puvax', 'genaal', 'qlxr', 'jrgonpx', 'enturnq', 'cnxv', 'tbbx', 'pbba', 'encr', 'encvfg'].map(rot13),
)
/** Real words with a root inside. */
const ALLOW = new Set(['scunthorpe', 'shiitake', 'shitake', 'cocktail', 'cocktails'])
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' }
const squash = (w: string) => w.replace(/(.)\1+/g, '$1')

function normalise(q: string) {
  return q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[013457@$!|]/g, (c) => LEET[c] ?? c)
}

/** True if a question contains profanity or a slur. */
export function isBlocked(question: string) {
  const words: string[] = []
  // Letters spelled out one at a time ("f u c k", "f.u.c.k") are joined back into a word.
  let run = ''
  for (const w of normalise(question).split(/[^a-z]+/)) {
    if (w.length === 1) run += w
    else {
      if (run) words.push(run)
      run = ''
      if (w) words.push(w)
    }
  }
  if (run) words.push(run)
  return words.some(
    (w) =>
      !ALLOW.has(w) &&
      (WORDS.has(w) ||
        WORDS.has(w.replace(/(es|s|ed|ing)$/, '')) ||
        // Stretched letters ("fuuuck") only count against roots without a double letter of their own.
        ROOTS.some((r) => w.includes(r) || (!/(.)\1/.test(r) && squash(w).includes(r)))),
  )
}

/** A shuffled bag: every item once, then a fresh shuffle that doesn't start with the last one. */
function bag<T>(items: T[]) {
  let left: T[] = []
  let last: T | undefined
  return () => {
    if (!left.length) {
      left = [...items]
      for (let i = left.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[left[i], left[j]] = [left[j], left[i]]
      }
      if (left.length > 1 && left[left.length - 1] === last) [left[0], left[left.length - 1]] = [left[left.length - 1], left[0]]
    }
    last = left.pop()!
    return last
  }
}

const general = bag(GENERAL)
const topical = TOPICS.map((t) => ({ match: t.match, next: bag(t.answers) }))

/** Tidies a visitor's question: trimmed, single spaces, at most `max` characters. */
export function cleanQuestion(raw: string, max = 80) {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** The lion's answer to a question. Blocked questions get the same brush-off every time. */
export function answerFor(question: string) {
  if (isBlocked(question)) return IGNORED
  const text = normalise(question)
  for (const t of topical) if (t.match.test(text)) return t.next()
  return general()
}

/** What rises from the water on its own: the questions holders ask most, short enough for a bubble. */
export const AMBIENT_QUESTIONS = [
  'WHAT’S AN AIRDROP?',
  'HOW DO I QUALIFY?',
  'WHEN’S THE SNAPSHOT?',
  'DO I NEED TO CLAIM?',
  'CONNECT MY WALLET?',
  'WHAT’S EXCLUDED?',
  'WHERE CAN I VERIFY?',
  'IS THERE A MINIMUM?',
  'DO SMALL HOLDERS GET ANY?',
  'WHAT ABOUT WHALES?',
  'DO EXCHANGES COUNT?',
  'WHO SENDS THE DROPS?',
  'WHAT CHAIN?',
  'WILL IT GO UP?',
  'WHY THE SUIT?',
  'IS THE MANE REAL?',
]

const ambient = bag(AMBIENT_QUESTIONS)
/** The next question to rise on its own, and the label it's shown under (no invented askers). */
export const ambientQuestion = () => ambient()
export const ambientAsker = () => 'OFTEN ASKED'
