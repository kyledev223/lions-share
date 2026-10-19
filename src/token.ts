import { B, shorten, sinkName } from './buyback'
import { config, PLACEHOLDER_ADDRESS } from './config'

let toastTimer = 0
function toast(message: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.add('is-visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 1800)
}

const soonTag = () => {
  const tag = document.createElement('span')
  tag.className = 'tag'
  tag.textContent = 'Coming soon'
  return tag
}

/**
 * An address control: copy-to-clipboard once the address is set, greyed out until then.
 *   data-ca          corner pill: "CA 0x12…abcd COPY"
 *   data-ca="named"  "$ROAR CA COPY" (screen 10)
 *   data-ca="full"   the whole address with a COPY button (screen 12)
 *   data-wallet="buyback"  the buyback wallet: "WALLET 0x12…abcd COPY" (screen 07)
 *   data-wallet="burn"     the burn (or lock) address: "BURN 0x12…abcd COPY" (screen 07)
 */
function addressControl(host: HTMLElement, address: string | null, kind: string, pre: string, what: string) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `ca ca--${kind}`
  const preEl = document.createElement('span')
  preEl.className = 'ca__pre'
  preEl.textContent = pre
  const addr = document.createElement('span')
  addr.className = 'ca__addr'
  const copy = document.createElement('span')
  copy.className = 'ca__copy'
  copy.textContent = 'COPY'
  if (kind === 'full') btn.append(addr, copy)
  else if (kind === 'named') btn.append(preEl, copy)
  else btn.append(preEl, addr, copy)

  if (!address) {
    addr.textContent = PLACEHOLDER_ADDRESS
    btn.classList.add('is-disabled')
    btn.setAttribute('aria-disabled', 'true')
    btn.title = 'Coming soon'
    btn.setAttribute('aria-label', `${what}, coming soon`)
    host.append(btn)
    if (host.hasAttribute('data-tag')) host.append(soonTag())
    return
  }

  addr.textContent = kind === 'full' ? address : shorten(address)
  btn.setAttribute('aria-label', `Copy ${what.toLowerCase()} ${address}`)
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(address)
      copy.textContent = 'COPIED ✓'
      toast('Copied ✓')
      window.setTimeout(() => (copy.textContent = 'COPY'), 1800)
    } catch {
      toast('Copy failed. Select the address and copy it by hand.')
    }
  })
  host.append(btn)
}

/** variant: "primary" (red pill), "gold" or "ghost". */
function linkControl(host: HTMLElement, label: string, url: string | null, variant: string) {
  const cls = `btn btn--${variant}`
  if (!url) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `${cls} is-disabled`
    btn.setAttribute('aria-disabled', 'true')
    btn.title = 'Coming soon'
    btn.textContent = label
    host.append(btn)
    if (host.hasAttribute('data-tag')) host.append(soonTag())
    return
  }
  const a = document.createElement('a')
  a.className = cls
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = label
  host.append(a)
}

/**
 * Fills every [data-ca], [data-wallet], [data-buy], [data-explorer] and
 * [data-href] slot from config. Anything without a value yet shows greyed out
 * and does nothing.
 */
export function hydrateToken() {
  document.querySelectorAll<HTMLElement>('[data-ca]').forEach((el) => {
    const kind = el.dataset.ca || 'pill'
    addressControl(el, config.contractAddress, kind, kind === 'named' ? `${config.ticker} CA` : 'CA', 'Contract address')
  })
  const wallets: Record<string, { address: string | null; explorer: string | null; pre: string; what: string }> = {
    buyback: { address: B.buybackWallet, explorer: B.explorerUrl, pre: 'WALLET', what: 'Buyback wallet' },
    burn: { address: B.burnAddress, explorer: B.burnExplorerUrl, pre: B.method === 'lock' ? 'LOCK' : 'BURN', what: sinkName() },
  }
  document.querySelectorAll<HTMLElement>('[data-wallet]').forEach((el) => {
    const w = wallets[el.dataset.wallet ?? '']
    if (w) addressControl(el, w.address, 'pill', w.pre, w.what)
  })
  document.querySelectorAll<HTMLElement>('[data-wallet-explorer]').forEach((el) => {
    const w = wallets[el.dataset.walletExplorer ?? '']
    if (w) linkControl(el, 'View on explorer ↗', w.explorer, 'ghost')
  })
  document
    .querySelectorAll<HTMLElement>('[data-buy]')
    .forEach((el) => linkControl(el, `Buy ${config.ticker} ↗`, config.buyUrl, el.dataset.buy || 'primary'))
  document
    .querySelectorAll<HTMLElement>('[data-explorer]')
    .forEach((el) => linkControl(el, 'Explorer ↗', config.explorerUrl, 'ghost'))

  const links: Record<string, string> = { community: config.communityUrl, follow: config.followUrl }
  document.querySelectorAll<HTMLAnchorElement>('a[data-href]').forEach((a) => {
    const url = links[a.dataset.href ?? ''] ?? '#'
    a.href = url
    if (url !== '#') {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    } else {
      // Needs a real link before it does anything.
      a.classList.add('is-disabled')
      a.setAttribute('aria-disabled', 'true')
      a.title = 'Coming soon'
    }
  })

  // Placeholder "#" links shouldn't yank the page back to the top.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href="#"]')
    if (a) e.preventDefault()
  })
}
