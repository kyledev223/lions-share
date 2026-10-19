/**
 * Contract address, links, token facts and the buyback rules in one place.
 *
 * While `contractAddress`, `buyUrl` or `explorerUrl` is `null` (or a link is
 * `'#'`), every control that depends on it renders greyed out with a "Coming
 * soon" tag and does nothing on click. Fill a value in and the matching
 * controls turn active on their own: the address becomes copy-to-clipboard,
 * the buttons become real links.
 *
 * Every number the site shows comes from here. Anything left `null` shows
 * "TBA" (or "Coming soon" on a control), never an invented figure. Total
 * burned and circulating supply are worked out from `supply` and
 * `buyback.history` (see buyback.ts), never typed in.
 */
export interface BuybackRound {
  /** ISO date the buyback was made, e.g. "2026-11-01". */
  date: string
  /** Round number, 1 for the first buyback. */
  round: number
  /** What was spent on the buyback, e.g. `{ amount: 12.5, currency: 'SOL' }`. */
  spent: { amount: number; currency: string }
  /** Unit: whole $ROAR tokens bought on the open market in that round. */
  tokensBought: number
  /** Unit: whole $ROAR tokens burned in that round (0 if they were locked instead). */
  tokensBurned: number
  /** Explorer link to the round's transactions. `null` = shown greyed out. */
  txUrl: string | null
}

export interface BuybackConfig {
  /** Unit: a phrase naming where the money comes from, e.g. "creator trading fees". `null` = TBA. */
  feeSource: string | null
  /** Unit: percent of `feeSource` used for buybacks (50 means 50%). `null` = TBA. */
  feePercent: number | null
  /** Unit: a phrase that completes "Buybacks happen…", e.g. "every Monday" or "weekly". `null` = TBA. */
  cadence: string | null
  /** Unit: an ISO 8601 date-time, shown in UTC, e.g. "2026-11-01T16:00:00Z". `null` = "Next buyback: TBA". */
  nextBuyback: string | null
  /** What happens to the bought $ROAR: sent to the burn address, or locked. `null` = TBA. */
  method: 'burn' | 'lock' | null
  /** The public wallet every buyback is made from. `null` = disabled placeholder. */
  buybackWallet: string | null
  /** Where bought $ROAR is sent: the burn address (or the lock, if `method` is "lock"). `null` = disabled placeholder. */
  burnAddress: string | null
  /** Explorer page for the buyback wallet. `null` = disabled placeholder. */
  explorerUrl: string | null
  /** Explorer page for the burn address. `null` = disabled placeholder. */
  burnExplorerUrl: string | null
  /** Every buyback made so far, oldest first. Empty = "The first buyback is coming." */
  history: BuybackRound[]
}

export interface SiteConfig {
  name: string
  ticker: string
  /** Full contract address, e.g. "0xAbc…". `null` = disabled placeholder. */
  contractAddress: string | null
  /** Where "Buy $ROAR" goes. `null` = disabled placeholder. */
  buyUrl: string | null
  /** Where "Explorer" goes. `null` = disabled placeholder. */
  explorerUrl: string | null
  /** "Join the pride" and "Follow the roar" (also the X button in the corner). `'#'` = disabled placeholder. */
  communityUrl: string
  followUrl: string
  /** Unit: whole tokens at launch, before any burn. `null` = TBA. */
  supply: number | null
  /** The chain $ROAR lives on, e.g. "Solana". `null` = TBA. */
  chain: string | null
  buyback: BuybackConfig
}

export const config: SiteConfig = {
  name: 'Lion’s Share',
  ticker: '$ROAR',
  contractAddress: null,
  buyUrl: null,
  explorerUrl: null,
  communityUrl: '#',
  followUrl: '#',
  supply: 1_000_000_000,
  chain: null,
  buyback: {
    feeSource: null,
    feePercent: null,
    cadence: null,
    nextBuyback: null,
    method: null,
    buybackWallet: null,
    burnAddress: null,
    explorerUrl: null,
    burnExplorerUrl: null,
    history: [],
  },
}

/** Shown in place of an address while it's null. */
export const PLACEHOLDER_ADDRESS = '0x0000…0000'

/**
 * The disclaimer at the foot of screen 12 and in the phone "Read more" sheet.
 * index.html's meta descriptions carry a shortened version: keep them in sync.
 */
export const DISCLAIMER =
  '$ROAR is a meme token. It has no intrinsic value and comes with no expectation of financial return. Buybacks are made under published rules that may change with notice, and they do not guarantee or support any price. Crypto is volatile, and you can lose everything you put in. Nothing on this site is financial advice. Check the laws where you live before taking part. Lion’s Share is an independent community project, not affiliated with or endorsed by any exchange, launchpad or company.'

/** The one-line version on phones (screen 12), with "Read more" opening the full text. */
export const SHORT_DISCLAIMER = 'Meme token. No expectation of financial return. Not financial advice.'
