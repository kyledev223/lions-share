import { config } from './config'

/**
 * Everything the screens say about the airdrops, worded from config.ts.
 * A value left `null` there reads "TBA" here; nothing is ever filled in
 * with an invented number.
 */
export const A = config.airdrop
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

export const supplyText = () => (config.supply === null ? TBA : fmtNumber(config.supply))
export const chainText = () => config.chain ?? TBA
export const allocationText = () => (A.allocationPercent === null ? TBA : `${A.allocationPercent}% of supply`)
export const cadenceText = () => A.cadence ?? TBA
export const minHoldingText = () => (A.minHolding === null ? TBA : `${fmtNumber(A.minHolding)} ${config.ticker}`)
export const capText = () => (A.perWalletCap === null ? TBA : `${A.perWalletCap}% of each round`)
export const nextSnapshotText = () => (A.nextSnapshot ? fmtDateTime(A.nextSnapshot) : TBA)

/** The token facts, as label/value rows (screens 10 and 12). */
export const tokenFacts = () => [
  { label: 'Token', value: `${config.name} · ${config.ticker}` },
  { label: 'Supply', value: supplyText() },
  { label: 'Chain', value: chainText() },
  { label: 'Airdrops', value: allocationText() },
]

/** "12D 04H 33M 10S" until `target`; null once it has passed. */
function remaining(target: number) {
  const ms = target - Date.now()
  if (ms <= 0) return null
  const s = Math.floor(ms / 1000)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${Math.floor(s / 86400)}D ${pad(Math.floor(s / 3600) % 24)}H ${pad(Math.floor(s / 60) % 60)}M ${pad(s % 60)}S`
}

/**
 * Screen 04's countdown to `nextSnapshot`. With no date set it stays on
 * "TBA"; once the moment passes it says the snapshot has been taken.
 */
export function initCountdown() {
  const value = document.querySelector<HTMLElement>('[data-countdown] .countdown__value')
  if (!value || !A.nextSnapshot) return
  const target = new Date(A.nextSnapshot).getTime()
  if (Number.isNaN(target)) return
  const tick = () => {
    const left = remaining(target)
    value.textContent = left ?? 'Taken · next date TBA'
    if (!left) window.clearInterval(timer)
  }
  const timer = window.setInterval(tick, 1000)
  tick()
}
