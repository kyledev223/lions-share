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
  /** ISO date the tally runs up to, e.g. "2026-11-01". */
  date: string
  /** Tally number, 1 for the first. */
  round: number
  /** What the buybacks in this tally spent, e.g. `{ amount: 12.5, currency: 'SOL' }`. */
  spent: { amount: number; currency: string }
  /** Unit: whole $ROAR tokens bought on the open market since the previous tally. */
  tokensBought: number
  /** Unit: whole $ROAR tokens burned since the previous tally (0 if they were locked instead). */
  tokensBurned: number
  /** Explorer link for the period, e.g. the buyback wallet's transactions. `null` = shown greyed out. */
  txUrl: string | null
}

export interface BuybackConfig {
  /** Unit: a phrase naming where the money comes from, e.g. "creator trading fees". `null` = TBA. */
  feeSource: string | null
  /** Unit: percent of `feeSource` used for buybacks (50 means 50%). `null` = TBA. */
  feePercent: number | null
  /** Unit: a phrase that completes "Buybacks happen…", e.g. "automatically, every time someone buys". `null` = TBA. */
  cadence: string | null
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
  /**
   * Buybacks run on every buy, so they aren't listed one by one: each entry is
   * a tally of everything bought and burned since the previous entry, oldest
   * first. "Burned so far" and "Circulating" are summed from it and read "as of"
   * the last tally's date. Empty = "None yet" before launch, the explorer after.
   */
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
  chain: 'Solana',
  buyback: {
    feeSource: 'creator trading fees',
    feePercent: 20,
    cadence: 'automatically, every time someone buys',
    method: 'burn',
    buybackWallet: null,
    burnAddress: '1nc1nerator11111111111111111111111111111111',
    explorerUrl: null,
    burnExplorerUrl: 'https://solscan.io/account/1nc1nerator11111111111111111111111111111111',
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
