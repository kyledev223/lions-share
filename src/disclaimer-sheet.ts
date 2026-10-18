import { DISCLAIMER } from './config'

/**
 * Screen 12 on phones: the one-line disclaimer's "Read more" opens the full
 * text in a small bottom sheet (a <dialog>, so Esc and focus trapping come
 * from the browser). A tap on the dimmed backdrop closes it too.
 */
export function createDisclaimerSheet(hooks: { onOpen(): void; onClose(): void }) {
  const sheet = document.getElementById('disclaimerSheet') as HTMLDialogElement
  document.getElementById('disclaimerSheetText')!.textContent = DISCLAIMER
  document.getElementById('disclaimerSheetClose')!.addEventListener('click', () => sheet.close())
  sheet.addEventListener('click', (e) => e.target === sheet && sheet.close())
  sheet.addEventListener('close', () => hooks.onClose())
  document.querySelectorAll('[data-disclaimer-open]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (sheet.open) return
      hooks.onOpen()
      sheet.showModal()
    }),
  )
}
