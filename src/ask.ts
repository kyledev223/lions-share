import { ambientAsker, answerFor, cleanQuestion, isBlocked } from './content/lion-answers'

/**
 * Screen 09's live Q&A, a buyback FAQ in the lion's voice: the card on the
 * right and the visitor's question box.
 *
 * Questions rise from the watering hole as bubbles (gl/watering-hole.ts);
 * when one pops on his phone the card shows it, "Lion is typing…" for a
 * moment, then his answer typing out, with the last three Q&As stacked
 * faintly behind like a thread. Visitors can ask their own: it rises as a
 * bigger, brighter bubble that always reaches him.
 *
 * Nothing typed here is stored or sent anywhere.
 */

/** How the Watering Hole stage (gl/scenes.ts) and the card talk to each other. */
export interface AskLink {
  /** Set by the stage: sends a visitor's bubble up from the water. False when it can't (reduced motion, screen not up). */
  launch: ((text: string) => boolean) | null
  /** The stage calls this when a bubble pops on his phone. */
  popped(text: string, visitor: boolean): void
  /** While true, drifting bubbles don't go to the phone: a visitor is typing, waiting, or reading their answer. */
  readonly holdAmbient: boolean
  /** Screen 09 arriving or leaving. */
  setActive(on: boolean): void
}

/** "Lion is typing…" before the answer starts. */
const DOTS_MS = 1200
/** Typing speed of the answer, characters per second. */
const CHARS_PER_SEC = 34
/** One visitor question per this long. */
const COOLDOWN_MS = 4000
/** After answering a visitor, the drifting questions leave the phone alone this long, so the answer can be read. */
const READING_MS = 7000
const THREAD = 3
export const MAX_QUESTION = 80

interface Entry {
  q: string
  who: string
  a: string
}

const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase()

export function createAsk(view: HTMLElement, reduced: boolean): AskLink {
  const form = view.querySelector<HTMLFormElement>('.ask')!
  const input = form.querySelector<HTMLInputElement>('input')!
  const button = form.querySelector<HTMLButtonElement>('button')!
  const counter = form.querySelector<HTMLElement>('.ask__count')!
  const card = view.querySelector<HTMLElement>('.qa__card')!
  const qEl = card.querySelector<HTMLElement>('.qa__q')!
  const whoEl = card.querySelector<HTMLElement>('.qa__who')!
  const dots = card.querySelector<HTMLElement>('.qa__typing')!
  const aEl = card.querySelector<HTMLElement>('.qa__a')!
  const foot = card.querySelector<HTMLElement>('footer')!
  const thread = view.querySelector<HTMLElement>('.qa__thread')!
  const announce = view.querySelector<HTMLElement>('.qa__live-text')!

  let current: Entry | null = null
  const history: Entry[] = []
  let typing = false
  /** The card is answering a visitor right now. */
  let forVisitor = false
  /** A visitor's question on its way up: the original text (the bubble may show a placeholder). */
  let waiting: string | null = null
  let cooldownUntil = 0
  let readingUntil = 0
  let timers: number[] = []
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))

  const refresh = () => {
    const busy = typing || waiting !== null || performance.now() < cooldownUntil
    button.disabled = busy
    form.classList.toggle('is-busy', busy)
  }

  function renderThread(fresh: boolean) {
    thread.replaceChildren(
      ...history.map((h, i) => {
        const ghost = document.createElement('div')
        ghost.className = 'qa__ghost' + (fresh && i === 0 ? ' is-new' : '')
        ghost.style.setProperty('--k', String(i + 1))
        const q = document.createElement('p')
        q.className = 'qa__ghostq'
        q.textContent = h.q ? `“${h.q}” · ${h.who}` : h.who
        const a = document.createElement('p')
        a.className = 'qa__ghosta'
        a.textContent = h.a
        ghost.append(q, a)
        return ghost
      }),
    )
  }

  function finish(entry: Entry) {
    typing = false
    aEl.textContent = entry.a
    card.classList.remove('is-typing', 'is-writing')
    const time = document.createElement('time')
    time.textContent = `${clock()} · OFFICE HOURS`
    foot.replaceChildren(time)
    announce.textContent = `${entry.q ? `${entry.who}: ${entry.q}. ` : ''}The lion answers: ${entry.a}`
    refresh()
  }

  /** A question reached him: the card moves the last answer back into the thread and answers this one. */
  function answer(question: string, who: string, visitor: boolean) {
    timers.forEach(clearTimeout)
    timers = []
    if (current) history.unshift(current)
    history.length = Math.min(history.length, THREAD)
    renderThread(true)
    const blocked = isBlocked(question)
    const entry: Entry = { q: blocked ? 'Question withheld' : question, who, a: answerFor(question) }
    current = entry
    forVisitor = visitor
    if (visitor) readingUntil = performance.now() + READING_MS
    qEl.textContent = blocked ? entry.q : `“${entry.q}”`
    qEl.hidden = false
    whoEl.textContent = who
    aEl.textContent = ''
    foot.replaceChildren()
    typing = true
    card.classList.add('is-typing')
    card.classList.remove('is-writing')
    dots.hidden = false
    refresh()
    later(DOTS_MS, () => {
      dots.hidden = true
      card.classList.add('is-writing')
      if (reduced) return finish(entry)
      const start = performance.now()
      const step = () => {
        const shown = Math.min(entry.a.length, Math.ceil(((performance.now() - start) / 1000) * CHARS_PER_SEC))
        aEl.textContent = entry.a.slice(0, shown)
        if (shown < entry.a.length) later(1000 / CHARS_PER_SEC, step)
        else finish(entry)
      }
      step()
    })
  }

  const link: AskLink = {
    launch: null,
    popped(text, visitor) {
      if (visitor && waiting !== null) {
        const q = waiting
        waiting = null
        answer(q, 'You asked', true)
      } else if (!visitor && waiting === null && !(typing && forVisitor)) answer(text, ambientAsker(), false)
      // (A drifting question never talks over a visitor's: it's dropped while theirs is on its way or being answered.)
    },
    get holdAmbient() {
      return waiting !== null || document.activeElement === input || input.value.trim() !== '' || performance.now() < readingUntil
    },
    setActive(on) {
      if (!on && document.activeElement === input) input.blur()
    },
  }

  const updateCount = () => {
    counter.textContent = `${input.value.length}/${MAX_QUESTION}`
    form.classList.toggle('is-full', input.value.length >= MAX_QUESTION)
  }
  input.maxLength = MAX_QUESTION
  input.addEventListener('input', () => {
    form.classList.remove('is-invalid')
    updateCount()
  })
  // Esc leaves the box, so the arrow keys and the wheel move between screens again.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    input.blur()
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = cleanQuestion(input.value, MAX_QUESTION)
    if (!q) {
      form.classList.remove('is-invalid')
      void form.offsetWidth // restart the shake
      form.classList.add('is-invalid')
      input.value = ''
      updateCount()
      input.focus()
      return
    }
    if (button.disabled) return
    cooldownUntil = performance.now() + COOLDOWN_MS
    window.setTimeout(refresh, COOLDOWN_MS + 20)
    waiting = q
    input.value = ''
    updateCount()
    refresh()
    // The bubble never shows a blocked question; the card says it was withheld.
    const shown = isBlocked(q) ? '· · ·' : q
    if (!link.launch?.(shown)) link.popped(shown, true)
  })
  updateCount()
  refresh()
  return link
}
