import { config } from './config'

/**
 * Everything the screens say about the buybacks, worded from config.ts.
 * A value left `null` there reads "TBA" here; nothing is ever filled in
 * with an invented number. Total burned and circulating supply are summed
 * from the `history` tallies, so they can't drift from the record.
 */
export const B = config.buyback
export const TBA = 'TBA'

export const fmtNumber = (n: number) => n.toLocaleString('en-US')
export const shorten = (a: string) => (a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/** "1 NOV 2026", from an ISO date, in UTC so every visitor reads the same day. */
export function fmtDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`
}

/** Whole $ROAR burned across every tally so far. */
export const totalBurned = () => B.history.reduce((sum, r) => sum + r.tokensBurned, 0)
/** Supply minus everything burned. `null` while `supply` is TBA. */
export const circulating = () => (config.supply === null ? null : config.supply - totalBurned())

export const supplyText = () => (config.supply === null ? TBA : fmtNumber(config.supply))
export const chainText = () => config.chain ?? TBA
/**
 * Buybacks run on every buy, so the totals are only as fresh as the last
 * tally: their labels say "as of" its date. Before launch (no contract
 * address) nothing can have burned yet. After launch with no tally yet they
 * point to the explorer rather than show a number that's already out of date.
 */
const lastTally = () => B.history[B.history.length - 1]
const untracked = () => !lastTally() && config.contractAddress !== null
const asOf = (label: string, untallied: string) => (lastTally() ? `${label} as of ${fmtDate(lastTally().date)}` : untallied)
export const burnedText = () =>
  lastTally() ? `${fmtNumber(totalBurned())} ${config.ticker}` : untracked() ? 'On the explorer' : 'None yet'
export const circulatingText = () => {
  const c = circulating()
  return c === null ? TBA : untracked() ? 'On the explorer' : fmtNumber(c)
}

/** "50% of creator trading fees". */
export const feeShareText = () =>
  B.feePercent === null ? TBA : `${B.feePercent}% of ${B.feeSource ?? 'fees (source TBA)'}`
export const cadenceText = () => B.cadence ?? TBA

/** What happens to bought $ROAR, as a rule: "Burned", "Locked" or TBA. */
export const methodText = () => (B.method === 'burn' ? 'Burned' : B.method === 'lock' ? 'Locked' : TBA)
/** The same as a past participle for running copy: "burned", "locked", or "burned or locked" while TBA. */
export const retired = () => (B.method === 'lock' ? 'locked' : B.method === 'burn' ? 'burned' : 'burned or locked')
/** What to call `burnAddress`. */
export const sinkName = () => (B.method === 'lock' ? 'Lock address' : 'Burn address')

/** The token facts, as label/value rows (screens 10 and 12). */
export const tokenFacts = () => ({
  token: { label: 'Token', value: `${config.name} · ${config.ticker}` },
  supply: { label: 'Initial supply', value: supplyText() },
  burned: { label: asOf('Burned', 'Burned so far'), value: burnedText() },
  circulating: { label: asOf('Circulating', 'Circulating'), value: circulatingText() },
  chain: { label: 'Chain', value: chainText() },
})
