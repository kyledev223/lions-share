/**
 * Contract address, links, token facts and the airdrop rules in one place.
 *
 * While `contractAddress`, `buyUrl` or `explorerUrl` is `null` (or a link is
 * `'#'`), every control that depends on it renders greyed out with a "Coming
 * soon" tag and does nothing on click. Fill a value in and the matching
 * controls turn active on their own: the address becomes copy-to-clipboard,
 * the buttons become real links.
 *
 * Every number the site shows comes from here. Anything left `null` shows
 * "TBA" (or "Coming soon" on a control), never an invented figure.
 */
export interface AirdropRound {
  /** ISO date the drop was sent, e.g. "2026-11-01". */
  date: string
  /** Round number, 1 for the first drop. */
  round: number
  /** Unit: whole `rewardToken` tokens sent in that round. */
  totalSent: number
  /** How many wallets received a share. */
  wallets: number
  /** Explorer link to the round's transactions. `null` = shown greyed out. */
  txUrl: string | null
}

export interface AirdropConfig {
  /** Unit: percent of total supply set aside for airdrops (10 means 10%). `null` = TBA. */
  allocationPercent: number | null
  /** What the drops are paid in. */
  rewardToken: string
  /** Unit: a phrase that completes "Snapshots are taken…", e.g. "monthly" or "every two weeks". `null` = TBA. */
  cadence: string | null
  /** Unit: an ISO 8601 date-time, shown in UTC, e.g. "2026-11-01T16:00:00Z". `null` = "Next snapshot: TBA". */
  nextSnapshot: string | null
  /** Unit: whole $ROAR tokens a wallet must hold at the snapshot to count (100000 means 100,000 $ROAR). `null` = TBA. */
  minHolding: number | null
  /** Unit: percent of a single round, the most one wallet can receive from it (1 means 1% of each round). `null` = TBA. */
  perWalletCap: number | null
  /** The public wallet every drop is sent from. `null` = disabled placeholder. */
  reserveWallet: string | null
  /** Explorer page for the reserve wallet. `null` = disabled placeholder. */
  explorerUrl: string | null
  /** Wallets that never count toward a snapshot. */
  exclusions: string[]
  /** Every round sent so far, oldest first. Empty = "The first drop is coming." */
  history: AirdropRound[]
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
  /** Total supply in whole tokens. `null` = TBA. */
  supply: number | null
  /** The chain $ROAR lives on, e.g. "Solana". `null` = TBA. */
  chain: string | null
  airdrop: AirdropConfig
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
  airdrop: {
    allocationPercent: null,
    rewardToken: '$ROAR',
    cadence: null,
    nextSnapshot: null,
    minHolding: null,
    perWalletCap: null,
    reserveWallet: null,
    explorerUrl: null,
    exclusions: ['The liquidity pool', 'Exchange wallets', 'The burn address', 'Team wallets'],
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
  '$ROAR is a meme token. It has no intrinsic value and comes with no expectation of financial return. Airdrops are discretionary community rewards and may change or stop at any time. Crypto is volatile, and you can lose everything you put in. Nothing on this site is financial advice. Check the laws where you live before taking part. Lion’s Share is an independent community project, not affiliated with or endorsed by any exchange, launchpad or company.'

/** The one-line version on phones (screen 12), with "Read more" opening the full text. */
export const SHORT_DISCLAIMER = 'Meme token. No expected returns. Not financial advice.'
