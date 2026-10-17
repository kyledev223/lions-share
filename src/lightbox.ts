import type { Meme } from './memes'

/**
 * One <dialog> for the memes from the ring. Esc and focus trapping come from
 * the browser.
 */
export function createLightbox(memes: Meme[], hooks: { onOpen(): void; onClose(memeIndex: number | null): void }) {
  const box = document.getElementById('lightbox') as HTMLDialogElement
  const stage = document.getElementById('lightboxStage')!
  const caption = document.getElementById('lightboxCaption')!
  const prev = document.getElementById('lightboxPrev')!
  const next = document.getElementById('lightboxNext')!
  const n = memes.length
  let current: number | null = null

  const open = () => {
    if (box.open) return
    hooks.onOpen()
    box.showModal()
  }

  function showMeme(i: number) {
    current = ((i % n) + n) % n
    const m = memes[current]
    const img = new Image()
    img.alt = m.alt
    img.draggable = false
    img.src = m.canvas ? m.canvas.toDataURL('image/png') : m.src!
    stage.replaceChildren(img)
    caption.textContent = `${String(current + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')} · ${m.id}`
    open()
  }

  document.getElementById('lightboxClose')!.addEventListener('click', () => box.close())
  prev.addEventListener('click', () => current !== null && showMeme(current - 1))
  next.addEventListener('click', () => current !== null && showMeme(current + 1))
  box.addEventListener('click', (e) => e.target === box && box.close())
  box.addEventListener('keydown', (e) => {
    if (current === null) return
    if (e.key === 'ArrowLeft') showMeme(current - 1)
    if (e.key === 'ArrowRight') showMeme(current + 1)
  })
  box.addEventListener('close', () => {
    hooks.onClose(current)
    stage.replaceChildren()
  })

  return { showMeme }
}
