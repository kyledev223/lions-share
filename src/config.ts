/**
 * Contract address, links and token stats in one place.
 *
 * Controls that need a value only appear once it is set: while
 * `contractAddress`, `buyUrl` or `explorerUrl` is `null` (or a link is `'#'`),
 * the controls that depend on it aren't shown at all. Fill a value in and they
 * appear on their own: the address becomes copy-to-clipboard, the buttons
 * become real links.
 */
export interface SiteConfig {
  name: string
  ticker: string
  /** Full contract address, e.g. "0xAbc…". `null` = not shown. */
  contractAddress: string | null
  /** Where "Buy $CROW" goes. `null` = not shown. */
  buyUrl: string | null
  /** Where "Explorer" goes. `null` = not shown. */
  explorerUrl: string | null
  /** Community and follow links. `'#'` = not shown. */
  communityUrl: string
  followUrl: string
  stats: { label: string; value: string }[]
}

export const config: SiteConfig = {
  name: 'Coupon Crows',
  ticker: '$CROW',
  contractAddress: '9mDrSegcjj5QJP1Zf27XwzM7ScrE95RPRQdrPApzpump',
  buyUrl: 'https://pump.fun/coin/9mDrSegcjj5QJP1Zf27XwzM7ScrE95RPRQdrPApzpump',
  explorerUrl: 'https://solscan.io/token/9mDrSegcjj5QJP1Zf27XwzM7ScrE95RPRQdrPApzpump',
  communityUrl: '#',
  followUrl: 'https://x.com/couponcrowfun',
  stats: [
    { label: 'Token', value: 'Coupon Crows · $CROW' },
    { label: 'Supply', value: '1,000,000,000' },
    { label: 'Chain', value: 'Solana' },
  ],
}
