import { config } from './config'

/**
 * Everything the screens say about the buybacks, worded from config.ts.
 * A value left `null` there reads "TBA" here; nothing is ever filled in
 * with an invented number. Total burned and circulating supply are summed
 * from `history`, so they can't drift from the record.
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

/** "1 NOV 2026 · 16:00 UTC". */
export function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${fmtDate(iso)} · ${time} UTC`
}

/** Whole $ROAR burned across every buyback so far. */
export const totalBurned = () => B.history.reduce((sum, r) => sum + r.tokensBurned, 0)
/** Supply minus everything burned. `null` while `supply` is TBA. */
export const circulating = () => (config.supply === null ? null : config.supply - totalBurned())

export const supplyText = () => (config.supply === null ? TBA : fmtNumber(config.supply))
export const chainText = () => config.chain ?? TBA
export const burnedText = () => (B.history.length ? `${fmtNumber(totalBurned())} ${config.ticker}` : 'None yet')
export const circulatingText = () => {
  const c = circulating()
  return c === null ? TBA : fmtNumber(c)
}

export const feeSourceText = () => B.feeSource ?? TBA
/** "50% of creator trading fees". */
export const feeShareText = () =>
  B.feePercent === null ? TBA : `${B.feePercent}% of ${B.feeSource ?? 'fees (source TBA)'}`
export const cadenceText = () => B.cadence ?? TBA
export const nextBuybackText = () => (B.nextBuyback ? fmtDateTime(B.nextBuyback) : TBA)
/** What happens to bought $ROAR, as a rule: "Burned", "Locked" or TBA. */
export const methodText = () => (B.method === 'burn' ? 'Burned' : B.method === 'lock' ? 'Locked' : TBA)
/** The same as a past participle for running copy: "burned", "locked", or "burned or locked" while TBA. */
export const retired = () => (B.method === 'lock' ? 'locked' : B.method === 'burn' ? 'burned' : 'burned or locked')
/** What to call `burnAddress`. */
export const sinkName = () => (B.method === 'lock' ? 'Lock address' : 'Burn address')

/** One round's tokens, for the history list: "4,200,000 $ROAR bought and burned". */
export function roundTokens(r: (typeof B.history)[number]) {
  const T = config.ticker
  if (r.tokensBurned === r.tokensBought) return `${fmtNumber(r.tokensBought)} ${T} bought and burned`
  if (r.tokensBurned === 0) return `${fmtNumber(r.tokensBought)} ${T} bought${B.method === 'lock' ? ' and locked' : ''}`
  return `${fmtNumber(r.tokensBought)} bought · ${fmtNumber(r.tokensBurned)} burned`
}

/** The token facts, as label/value rows (screens 10 and 12). */
export const tokenFacts = () => ({
  token: { label: 'Token', value: `${config.name} · ${config.ticker}` },
  supply: { label: 'Initial supply', value: supplyText() },
  burned: { label: 'Burned so far', value: burnedText() },
  circulating: { label: 'Circulating', value: circulatingText() },
  chain: { label: 'Chain', value: chainText() },
})

/** "12D 04H 33M 10S" until `target`; null once it has passed. */
function remaining(target: number) {
  const ms = target - Date.now()
  if (ms <= 0) return null
  const s = Math.floor(ms / 1000)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${Math.floor(s / 86400)}D ${pad(Math.floor(s / 3600) % 24)}H ${pad(Math.floor(s / 60) % 60)}M ${pad(s % 60)}S`
}

/**
 * Screen 04's countdown to `nextBuyback`. With no date set it stays on
 * "TBA"; once the moment passes it says the buyback is due.
 */
export function initCountdown() {
  const value = document.querySelector<HTMLElement>('[data-countdown] .countdown__value')
  if (!value || !B.nextBuyback) return
  const target = new Date(B.nextBuyback).getTime()
  if (Number.isNaN(target)) return
  const tick = () => {
    const left = remaining(target)
    value.textContent = left ?? 'Due · next date TBA'
    if (!left) window.clearInterval(timer)
  }
  const timer = window.setInterval(tick, 1000)
  tick()
}
