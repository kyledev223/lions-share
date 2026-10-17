import { config, PLACEHOLDER_ADDRESS } from './config'

const shorten = (a: string) => (a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

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
 * The contract address control, three ways:
 *   data-ca          corner pill: "CA 0x12…abcd COPY"
 *   data-ca="named"  "$ROAR CA COPY" (screen 10)
 *   data-ca="full"   the whole address with a COPY button (screen 12)
 */
function contractControl(host: HTMLElement) {
  const address = config.contractAddress
  const kind = host.dataset.ca || 'pill'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `ca ca--${kind}`
  const pre = document.createElement('span')
  pre.className = 'ca__pre'
  pre.textContent = kind === 'named' ? `${config.ticker} CA` : 'CA'
  const addr = document.createElement('span')
  addr.className = 'ca__addr'
  const copy = document.createElement('span')
  copy.className = 'ca__copy'
  copy.textContent = 'COPY'
  if (kind === 'full') btn.append(addr, copy)
  else if (kind === 'named') btn.append(pre, copy)
  else btn.append(pre, addr, copy)

  if (!address) {
    addr.textContent = PLACEHOLDER_ADDRESS
    btn.classList.add('is-disabled')
    btn.setAttribute('aria-disabled', 'true')
    btn.title = 'Coming soon'
    btn.setAttribute('aria-label', 'Contract address, coming soon')
    host.append(btn)
    if (host.hasAttribute('data-tag')) host.append(soonTag())
    return
  }

  addr.textContent = kind === 'full' ? address : shorten(address)
  btn.setAttribute('aria-label', `Copy contract address ${address}`)
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
 * Fills every [data-ca], [data-buy], [data-explorer] and [data-href] slot from
 * config. Anything without a value yet shows greyed out and does nothing.
 */
export function hydrateToken() {
  document.querySelectorAll<HTMLElement>('[data-ca]').forEach(contractControl)
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

  const stats = document.getElementById('stats')
  if (stats) {
    for (const s of config.stats) {
      const cell = document.createElement('div')
      cell.className = 'stat'
      const dt = document.createElement('dt')
      dt.textContent = s.label
      const dd = document.createElement('dd')
      dd.textContent = s.value
      cell.append(dt, dd)
      stats.append(cell)
    }
  }

  // Placeholder "#" links shouldn't yank the page back to the top.
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href="#"]')
    if (a) e.preventDefault()
  })
}
