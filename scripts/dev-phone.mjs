/**
 * `npm run dev:phone`: dev server reachable from other devices on the same
 * Wi-Fi, with a QR code to open it on a phone.
 */
import { networkInterfaces } from 'node:os'
import qrcode from 'qrcode-terminal'
import { createServer } from 'vite'

const server = await createServer({ server: { host: true } })
await server.listen()
const port = server.config.server.port

// Pick the address a phone can actually reach: the real Wi-Fi or Ethernet
// adapter, not a VPN tunnel or a virtual switch.
const VIRTUAL = /vethernet|virtual|wsl|hyper-v|vpn|nord|tailscale|zerotier|tap|tun|loopback|docker|vmware|bluetooth/i
const REAL = /wi-?fi|wlan|ethernet|^en\d|^eth\d/i
const candidates = Object.entries(networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })))
  .filter((a) => !a.ip.startsWith('169.254.'))
const score = (a) => (VIRTUAL.test(a.name) ? 0 : REAL.test(a.name) ? 2 : 1) + (a.ip.startsWith('192.168.') ? 0.5 : 0)
candidates.sort((a, b) => score(b) - score(a))
const best = candidates[0]

if (!best) {
  console.log('\n  No network address found. Is this computer connected to Wi-Fi?\n')
  server.printUrls()
} else {
  const url = `http://${best.ip}:${port}/`
  console.log(`\n  Coupon Crows is being served to your network.\n`)
  console.log(`  On this computer   http://localhost:${port}/`)
  console.log(`  On your phone      ${url}            (${best.name})`)
  console.log(`  With debug overlay ${url}?debug`)
  console.log(`\n  Scan to open it with the debug overlay:\n`)
  qrcode.generate(`${url}?debug`, { small: true }, (code) => console.log(code.replace(/^/gm, '  ')))
  const others = candidates.slice(1)
  if (others.length) {
    console.log(`  Other addresses on this machine (usually VPN or virtual adapters, not reachable from a phone):`)
    for (const a of others) console.log(`    http://${a.ip}:${port}/   (${a.name})`)
  }
  console.log(`\n  Phone and computer must be on the same Wi-Fi. If the page does not load,`)
  console.log(`  see "Test on a phone" in README.md (firewall and VPN notes). Ctrl+C stops the server.\n`)
}
