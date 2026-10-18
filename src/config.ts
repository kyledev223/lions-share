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
  /** Total sent in that round, in `rewardToken` units. */
  totalSent: number
  /** How many wallets received a share. */
  wallets: number
  /** Explorer link to the round's transactions. `null` = shown greyed out. */
  txUrl: string | null
}

export interface AirdropConfig {
  /** Share of total supply set aside for airdrops, in percent (e.g. 10 for 10%). `null` = TBA. */
  allocationPercent: number | null
  /** What the drops are paid in. */
  rewardToken: string
  /** How often snapshots are taken, in words that read after "Snapshots are taken…", e.g. "monthly". `null` = TBA. */
  cadence: string | null
  /** The next snapshot as an ISO date-time, e.g. "2026-11-01T16:00:00Z". `null` = "Next snapshot: TBA". */
  nextSnapshot: string | null
  /** Least $ROAR a wallet must hold at the snapshot to count. `null` = TBA. */
  minHolding: number | null
  /** Most one wallet can receive from a single round, in percent of that round (e.g. 1 for 1%). `null` = TBA. */
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

/** The disclaimer at the foot of screen 12 (and, shortened, in index.html's meta tags). Draft: needs a review. */
export const DISCLAIMER =
  '$ROAR is a meme token. It has no intrinsic value and comes with no expectation of financial return. Airdrops are discretionary community rewards and may change or stop at any time. Crypto is volatile, and you can lose everything you put in. Nothing on this site is financial advice. Check the laws where you live before taking part.'
