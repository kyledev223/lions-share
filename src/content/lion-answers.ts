/**
 * The lion's office hours (screen 09): what he says back. All of it is
 * in-character fun. He never gives financial advice, predicts prices or
 * promises anything; questions about price, buying or the moon get a
 * playful deflection instead.
 *
 * Nothing a visitor types is stored or sent anywhere: questions are matched
 * here, in the page, and forgotten.
 */

/** The general pool: picked at random, no repeats until every one has been used. */
const GENERAL = [
  'A lion never asks for the biggest slice. He just sits where it lands.',
  'Patience is just hunting with better posture.',
  'I’ve never been late. Everyone else has been early.',
  'Kings don’t queue. We do, however, wait beautifully.',
  'The pride isn’t a club. Clubs have exits.',
  'I don’t roar to be heard. I roar so the echo has something to do.',
  'Every lion starts as a cub with an oversized opinion. Some of us grew into it.',
  'Rule one of the hunt: be the calmest thing in the long grass.',
  'Hyenas laugh at everything. That’s how you know they never get the joke.',
  'I nap eighteen hours a day. The other six are legendary.',
  'Strength isn’t loud. It just never has to repeat itself.',
  'A good pride eats together. A great one remembers who brought the napkins.',
  'I don’t chase. I arrive.',
  'The watering hole is where gossip comes to drink. I bring snacks.',
  'Ask me again at dusk. I get philosophical when the light turns gold.',
  'Want to be king of the jungle? First ask why lions live on the savanna.',
  'Zebras ask for directions. Lions give them.',
  'Being majestic is ten percent mane and ninety percent not tripping in public.',
  'Some days you’re the lion. Some days you’re the lion who forgot why he walked into the clearing.',
  'I keep my claws sharp and my replies sharper.',
  'Loyalty isn’t asked for. It’s who’s still at the watering hole when the sun goes down.',
  'The best seat at the watering hole is the one nobody dares to take. I’m sitting in it.',
  'Yes, I read every question. No, I don’t read the ones from hyenas.',
  'The trick to a good roar is the silence just before it.',
  'Cubs ask “why?”. Elders ask “why not after a nap?”',
  'A pride is only as strong as its quietest member on a bad day. Check on your quiet ones.',
  'I’ve been called intimidating. I’ve also been told I give excellent hugs. Both are true.',
  'Fortune favours the bold. The bold favour a long lunch first.',
  'Never trust a gazelle who says “trust me”.',
  'Pull up a rock. There’s room. There’s always room.',
]

/** Topics a question can be about, checked in order; the first match answers. */
const TOPICS: { match: RegExp; answers: string[] }[] = [
  {
    // Money talk gets a deflection, every time. Checked first so "buy a suit" is still a deflection.
    match: /\b(price|prices|pump\w*|moon\w*|buy\w*|sell\w*|invest\w*|worth|lambo|\d+x|charts?|wen|mcap|market ?cap|ath|dip|profits?|returns?|rich|money|cash|financ\w*|token\w*|coins?|\$roar|hodl\w*|holders?|gains?|presale|airdrop\w*|crypto\w*|bitcoin|btc|eth|solana|stocks?|trad(e|es|ing|er|ers)|portfolio|exchange|listing|launch\w*)\b/,
    answers: [
      'I don’t do predictions. I do patience.',
      'Charts are for hyenas. Lions watch the horizon and keep quiet.',
      'Ask the stars about the future. Ask me about naps.',
      'Nothing said on this ledge is advice. Especially the bits that sound like it.',
      'A lion never counts the herd out loud. Bad manners, worse luck.',
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
      'Out past the long grass, where the patient ones are already sitting.',
      'We hunt together, eat together and argue about the leftovers together.',
    ],
  },
  {
    match: /\b(leona|elder\w*|rex|marlo|ada|sam)\b/,
    answers: [
      'Leona taught me everything. Mostly how to look like I knew it already.',
      'The elders have seen a few seasons. I listen when they speak, and nod when they nap.',
    ],
  },
  {
    match: /\b(sleep\w*|naps?|napping|tired|rest\w*|bed)\b/,
    answers: [
      'Eighteen hours a day, on the warmest rock. Rest is a strategy.',
      'I don’t sleep. I recharge my majesty.',
    ],
  },
  {
    match: /\b(cubs?|join\w*|pride|members?|community|friends?|family)\b/,
    answers: [
      'Cubs are always welcome. Bring an appetite and an indoor voice.',
      'Anyone who turns up for dinner is pride. That’s the whole membership form.',
    ],
  },
  {
    match: /\b(feast\w*|food|eat\w*|dinner|lunch|snack\w*|hungry|bill)\b/,
    answers: [
      'The feast is at dusk. The lion eats first. Manners, not greed.',
      'Nobody splits the bill at a pride dinner. That’s rather the point of a pride.',
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

/** What rises from the water on its own: the pride's usual questions, short enough for a bubble. */
export const AMBIENT_QUESTIONS = [
  'WHY THE SUIT?',
  'IS THE MANE REAL?',
  'WHERE’S THE HUNT?',
  'WHO’S LEONA?',
  'FAVOURITE NAP SPOT?',
  'HOW LOUD IS THE ROAR?',
  'CAN CUBS JOIN?',
  'RED TIE OR CRIMSON?',
  'WHO PAYS FOR THE FEAST?',
  'BEST HUNTING TIP?',
  'DO YOU EVER SLEEP?',
  'WHY A LION?',
  'WEN ROAR?',
  'ANY ADVICE FOR CUBS?',
  'WHAT’S IN THE PHONE?',
  'COMB OR CLAWS?',
]

/** Made-up handles for the questions the pride sends in. */
export const ASKERS = ['@dusty.paw', '@tallgrass', '@kopje.kid', '@little.roar', '@dawn.patrol', '@sam.tuft', '@acacia.ana', '@ember.cub', '@long.grass', '@golden.hour']

const ambient = bag(AMBIENT_QUESTIONS)
const asker = bag(ASKERS)
/** The next question to rise on its own, and who asked it. */
export const ambientQuestion = () => ambient()
export const ambientAsker = () => asker()
