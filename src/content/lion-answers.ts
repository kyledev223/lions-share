import { B, cadenceText, feeShareText, nextBuybackText, retired, shorten, sinkName } from '../buyback'
import { config } from '../config'

/**
 * The lion's office hours (screen 09): a buyback FAQ in his voice. Every
 * figure he quotes comes from config.ts; anything not set yet is "TBA". He
 * never gives financial advice, predicts prices or promises anything:
 * questions about price, value, floors, pumps or "will it go up" get a
 * playful deflection.
 *
 * Nothing a visitor types is stored or sent anywhere: questions are matched
 * here, in the page, and forgotten.
 */

const T = config.ticker
const funding =
  B.feePercent === null
    ? `A share of ${B.feeSource ? `the ${B.feeSource}` : 'the fees'} (the exact share is TBA)`
    : `${feeShareText().charAt(0).toUpperCase()}${feeShareText().slice(1)}`
const schedule = B.cadence ? `Buybacks happen ${cadenceText()}.` : 'The buyback schedule is TBA.'
const next = B.nextBuyback ? `Next one: ${nextBuybackText()}.` : 'Next buyback: TBA. The countdown on this site wakes up when it’s set.'
const sink = sinkName().toLowerCase()
const burnWhat = 'Burned means sent to an address nobody controls. Those tokens are gone permanently, so the circulating supply shrinks.'
const lockWhat = 'Locked means held in a public lock, out of circulation, while the lock lasts.'
const sinkWhat = B.method === 'lock' ? lockWhat : B.method === 'burn' ? burnWhat : `${burnWhat} ${lockWhat}`

/** The general pool: picked at random, no repeats until every one has been used. */
const GENERAL = [
  'Ask me about buybacks, burns or the rules. Everything else gets a proverb.',
  `Fees in, ${T} bought, ${T} ${retired()}. That’s the whole hunt.`,
  'A lion takes the biggest slice. A good one puts it back.',
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
  'Never trust a gazelle who says “trust me”. Or a stranger who DMs you about a buyback.',
  'Pull up a rock. There’s room. There’s always room.',
]

/** Topics a question can be about, checked in order; the first match answers. */
const TOPICS: { match: RegExp; answers: string[] }[] = [
  {
    // Safety first: seed phrases, DMs, anyone offering "help" or asking for funds.
    match: /\b(seed|phrase|private ?key|keys|dms?|messaged?|scam\w*|(customer|tech) support|support (team|staff|desk)|admin\w*|mods?|impost\w*|fake|phish\w*|recover\w*|send (you|funds|money|sol|eth)|giveaway)\b/,
    answers: [
      'We’ll never DM you, ask for your seed phrase, or ask you to send funds. Anyone who does is a hyena in a borrowed mane.',
      'Your seed phrase stays with you. Always. Buybacks happen on-chain from our public wallet; nobody needs anything from you.',
      'Only trust links on this site. The rest of the savanna is full of very convincing hyenas.',
    ],
  },
  {
    // Money talk gets a deflection, every time. Checked before the buyback topics so "will the buyback pump it" is still a deflection.
    match: /\b(prices?|pump\w*|moon\w*|go(es|ing)? up|number go|worth|value|floors?|lambo|\d+x|charts?|wen|mcap|market ?cap|ath|dip|profits?|returns?|rich|gains?|invest\w*|predict\w*|sell\w*|dump\w*|financ\w*|make money|earn\w*|guarantee\w*|support the|prop\w* up)\b/,
    answers: [
      'I don’t do predictions. I do patience.',
      'Will it go up? Ask a giraffe. They see further than I do.',
      'Charts are for hyenas. Lions watch the horizon and keep quiet.',
      'Ask the stars about prices. Ask me about buybacks.',
      'Buybacks follow the rules. Prices follow nobody. I only answer for the first one.',
      'Nothing said on this ledge is advice. Especially the bits that sound like it.',
    ],
  },
  {
    match: /\b(do anything|need to do|have to do|claim\w*|redeem\w*|collect\w*|apply|register\w*|sign ?up|whitelist\w*|stak\w*|connect\w*|approv\w*|permission\w*|metamask|phantom|link (my|your) wallet)\b/,
    answers: [
      'Nothing. No forms, no signing, no connecting. The buybacks happen on their own.',
      'Holders don’t need to do a thing. If someone asks you to connect, sign or send something “for the buyback”, walk away.',
    ],
  },
  {
    match: /\b(fees?|fund\w*|money|cash|budget|treasury|source|pays?|paid|where does|come from|how much|percent\w*|share)\b/,
    answers: [
      `${funding} goes to the lion’s wallet and is spent buying ${T} on the open market.`,
      `The money comes from fees, not from holders. ${funding} is used for buybacks.`,
    ],
  },
  {
    match: /\b(verif\w*|proof|prove|check\w*|trust\w*|transparen\w*|explorer|tx|txs|transactions?|wallets?|burn address|lock address|on ?chain|audit\w*|publish\w*|history|record)\b/,
    answers: [
      'Every buyback transaction is published, with the date, what was spent and what was bought. Check them on the explorer yourself.',
      B.buybackWallet
        ? `Every buyback is made from one public wallet, ${shorten(B.buybackWallet)}. Watch it on the explorer.`
        : 'Every buyback is made from one public wallet. Its address is TBA; it goes up on this site’s Nothing Hidden screen.',
      B.burnAddress
        ? `Bought ${T} goes to the ${sink}, ${shorten(B.burnAddress)}. It’s on the Nothing Hidden screen with an explorer link.`
        : `The ${sink} is TBA. It goes up on the Nothing Hidden screen, with an explorer link.`,
    ],
  },
  {
    match: /\b(burn\w*|lock\w*|destroy\w*|dead|gone|incinerat\w*|supply|circulat\w*|scarce)\b/,
    answers: [
      B.method === null ? `Bought ${T} is burned or locked; which one is in the published rules (TBA). ${sinkWhat}` : sinkWhat,
      `Every buyback takes ${T} out of circulation. Fewer tokens, same pride.`,
    ],
  },
  {
    match: /\b(when|schedule\w*|next|how often|cadence|date|countdown|monthly|weekly|daily|time)\b/,
    answers: [`${schedule} ${next}`, `Buybacks follow fixed, pre-announced rules. ${schedule}`],
  },
  {
    match: /\b(rules?|change\w*|stop\w*|end|forever|promise\w*|who decides)\b/,
    answers: [
      'The rules are published in advance on this site. Any change is announced before it applies.',
      'Same rules every time, published first. If they change, you hear it here before it happens.',
    ],
  },
  {
    // "buyback" before "buy", so it isn't read as a question about buying.
    match: /\b(buy ?backs?|bought|how (does|do) (it|this|they) work|explain|what is this)\b/,
    answers: [
      `A buyback: ${funding.charAt(0).toLowerCase()}${funding.slice(1)} is used to buy ${T} on the open market. Then it’s ${retired()}, and every one is published.`,
      `The lion takes his share of the fees and puts it back into the pride: ${T} bought on the open market, then ${retired()}.`,
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
      `${T} is the meme token of the pride. Nothing gets sent to wallets: a share of the fees goes into buybacks instead.`,
      `Holders don’t need to do anything. The lion buys ${T} back and it’s ${retired()}, all on the record.`,
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
  'WHAT’S A BUYBACK?',
  'WHERE DO THE FEES GO?',
  'WHEN’S THE NEXT BUYBACK?',
  'WHAT DOES BURNING MEAN?',
  'BURNED OR LOCKED?',
  'DO I NEED TO DO ANYTHING?',
  'HOW DO I VERIFY?',
  'WHERE’S THE BURN ADDRESS?',
  'WHO MAKES THE BUYBACKS?',
  'CAN THE RULES CHANGE?',
  'HOW OFTEN?',
  'WHAT CHAIN?',
  'WILL IT GO UP?',
  'WHY THE SUIT?',
  'IS THE MANE REAL?',
]

const ambient = bag(AMBIENT_QUESTIONS)
/** The next question to rise on its own, and the label it's shown under (no invented askers). */
export const ambientQuestion = () => ambient()
export const ambientAsker = () => 'OFTEN ASKED'
