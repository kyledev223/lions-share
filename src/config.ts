/**
 * Contract address, links and token stats in one place.
 *
 * While `contractAddress`, `buyUrl` or `explorerUrl` is `null` (or a link is
 * `'#'`), every control that depends on it renders greyed out with a "Coming
 * soon" tag and does nothing on click. Fill a value in and the matching
 * controls turn active on their own: the address becomes copy-to-clipboard,
 * the buttons become real links.
 */
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
  stats: { label: string; value: string }[]
}

export const config: SiteConfig = {
  name: 'Lion’s Share',
  ticker: '$ROAR',
  contractAddress: null,
  buyUrl: null,
  explorerUrl: null,
  communityUrl: '#',
  followUrl: '#',
  stats: [
    { label: 'Token', value: 'Lion’s Share · $ROAR' },
    { label: 'Supply', value: '1,000,000,000' },
    { label: 'Chain', value: 'TBA' },
    { label: 'Rewards', value: 'TBA' },
  ],
}

/** Shown in place of the address while `contractAddress` is null. */
export const PLACEHOLDER_ADDRESS = '0x0000…0000'
