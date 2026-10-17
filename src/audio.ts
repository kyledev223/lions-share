/**
 * Generated music. No audio files: everything is synthesised with the Web
 * Audio API and sequenced by a small lookahead scheduler.
 *
 * Signal path
 *   voices → deck (per-track gain, used for crossfades) → tape filter + reverb
 *          → master gain → gentle compressor → limiter → speakers
 *
 * Each track's loudness is measured once, offline, and its deck gain is set
 * so all three sit at the same level.
 *
 * To use real tracks later, replace this module with one that exposes the
 * same `music` surface (start / setMuted / toggle / next / prev / onChange /
 * chirp) backed by an <audio> element.
 */
interface Chord {
  notes: number[]
  bass: number
}
interface Track {
  name: string
  bpm: number
  swing: number
  drums: boolean
  cutoff: number
  chords: Chord[]
}

const TRACKS: Track[] = [
  {
    name: 'Wire at Dusk',
    bpm: 72,
    swing: 0.16,
    drums: true,
    cutoff: 900,
    chords: [
      { notes: [53, 57, 60, 64], bass: 38 },
      { notes: [53, 57, 59, 64], bass: 43 },
      { notes: [52, 55, 59, 62], bass: 36 },
      { notes: [55, 59, 60, 64], bass: 45 },
    ],
  },
  {
    name: 'Shiny Things',
    bpm: 84,
    swing: 0.22,
    drums: true,
    cutoff: 1150,
    chords: [
      { notes: [53, 57, 60, 64], bass: 41 },
      { notes: [55, 59, 62, 64], bass: 40 },
      { notes: [53, 57, 60, 65], bass: 38 },
      { notes: [52, 55, 59, 64], bass: 36 },
    ],
  },
  {
    name: 'Nest Ledger',
    bpm: 58,
    swing: 0,
    drums: false,
    cutoff: 700,
    chords: [
      { notes: [57, 60, 64, 71], bass: 45 },
      { notes: [53, 57, 60, 64], bass: 41 },
      { notes: [55, 60, 64, 67], bass: 48 },
      { notes: [55, 59, 62, 64], bass: 43 },
    ],
  },
]

/** Master gain when unmuted. Sets how loud the whole page's music is. */
const LEVEL = 0.4
/** Loudness every track is trimmed to before the master chain (weighted RMS). */
const TARGET_RMS = 0.05
/** Used until the offline measurement finishes, or if it can't run (values it produced in Chromium). */
const FALLBACK_TRIM = [0.335, 0.343, 0.407]

const CROSSFADE = 1.2
const MUTE_FADE = 0.6
/** setTargetAtTime gets ~98% of the way in four time constants. */
const tau = (seconds: number) => seconds / 4

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9))

/** Small seeded PRNG so offline measurements are repeatable. */
const seeded = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function noiseBuffer(ctx: BaseAudioContext, rand: () => number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1
  return buf
}

/** Tape low-pass plus a generated-impulse reverb. Returns the two inputs. */
function buildFx(ctx: BaseAudioContext, dest: AudioNode, rand: () => number) {
  const tape = ctx.createBiquadFilter()
  tape.type = 'lowpass'
  tape.frequency.value = 5200
  tape.connect(dest)

  const len = Math.floor(ctx.sampleRate * 2.8)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * (1 - i / len) ** 2.6
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  const wetLevel = ctx.createGain()
  wetLevel.gain.value = 0.5
  conv.connect(wetLevel).connect(tape)
  return { dry: tape as AudioNode, wet: conv as AudioNode }
}

function buildMaster(ctx: BaseAudioContext, level: number) {
  const gain = ctx.createGain()
  gain.gain.value = level
  // Gentle glue: evens out the pads and drums without pumping.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -24
  comp.knee.value = 18
  comp.ratio.value = 2.5
  comp.attack.value = 0.02
  comp.release.value = 0.3
  // Limiter-style safety net for peaks.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -9
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  gain.connect(comp).connect(limiter).connect(ctx.destination)
  return gain
}

/** The instruments. Works in live and offline contexts alike. */
class Kit {
  constructor(
    private ctx: BaseAudioContext,
    private dry: AudioNode,
    private wet: AudioNode,
    private noise: AudioBuffer,
    private rand: () => number,
  ) {}

  step(track: Track, step: number, t: number, sixteenth: number) {
    const chord = track.chords[Math.floor(step / 16) % track.chords.length]
    const k = step % 16
    const bar = sixteenth * 16
    const pick = () => chord.notes[Math.floor(this.rand() * chord.notes.length)]

    if (k === 0) {
      this.pad(chord.notes, t, bar, track.cutoff)
      this.bass(chord.bass, t, bar * 0.55)
    }
    if (track.drums) {
      if (k === 10) this.bass(chord.bass, t, sixteenth * 4)
      if (k === 0 || k === 10 || (k === 7 && this.rand() < 0.35)) this.kick(t)
      if (k === 4 || k === 12) this.burst(t, 'bandpass', 1900, 0.2, 0.17, 0.35)
      if (k % 2 === 0) this.burst(t, 'highpass', 7500, 0.03 + this.rand() * 0.03, 0.04, 0)
      else if (this.rand() < 0.3) this.burst(t, 'highpass', 7500, 0.018, 0.04, 0)
      if ([3, 6, 8, 11, 14].includes(k) && this.rand() < 0.4) this.pluck(pick() + 12, t, 0.9, 0.09)
    } else if ([0, 4, 6, 10, 12].includes(k) && this.rand() < 0.4) {
      this.pluck(pick() + 24, t, 2.6, 0.06)
    }
  }

  private pad(notes: number[], t: number, dur: number, cutoff: number) {
    const { ctx } = this
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff * 0.6, t)
    filter.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5)
    filter.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur + 1)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.085, t + dur * 0.3)
    env.gain.setValueAtTime(0.085, t + dur * 0.8)
    env.gain.linearRampToValueAtTime(0, t + dur + 1.2)
    filter.connect(env)
    env.connect(this.dry)
    env.connect(this.wet)
    for (const note of notes) {
      for (const detune of [-8, 8]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(note)
        o.detune.value = detune
        o.connect(filter)
        o.start(t)
        o.stop(t + dur + 1.3)
      }
    }
  }

  private bass(note: number, t: number, dur: number) {
    const { ctx } = this
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = mtof(note)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 320
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.34, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(f).connect(g).connect(this.dry)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private kick(t: number) {
    const { ctx } = this
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
    o.connect(g).connect(this.dry)
    o.start(t)
    o.stop(t + 0.35)
  }

  /** Filtered noise hit: snare and hats. */
  private burst(t: number, type: BiquadFilterType, freq: number, level: number, decay: number, send: number) {
    const { ctx } = this
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(level, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    s.connect(f).connect(g).connect(this.dry)
    if (send) {
      const sg = ctx.createGain()
      sg.gain.value = send
      g.connect(sg).connect(this.wet)
    }
    s.start(t, this.rand() * 0.5, decay + 0.05)
  }

  private pluck(note: number, t: number, decay: number, level: number) {
    const { ctx } = this
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    g.connect(this.dry)
    const sg = ctx.createGain()
    sg.gain.value = 0.7
    g.connect(sg).connect(this.wet)
    for (const [type, mult, amt] of [['triangle', 1, 1], ['sine', 2, 0.25]] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = mtof(note) * mult
      const og = ctx.createGain()
      og.gain.value = amt
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + decay + 0.05)
    }
  }
}

/** Schedules every step of `track` that starts before `until` seconds. */
function sequence(kit: Kit, track: Track, until: number) {
  const sixteenth = 60 / track.bpm / 4
  for (let step = 0, t = 0.05; t < until; step++, t += sixteenth) {
    kit.step(track, step, t + (step % 2 ? track.swing * sixteenth : 0), sixteenth)
  }
}

type Legacy = { webkitAudioContext?: typeof AudioContext }
const LiveCtx: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as Legacy).webkitAudioContext

/** iPhone, iPod, and iPad (which reports itself as a Mac with a touch screen). */
const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Half a second of silence as a WAV file, for the silent-switch workaround. */
function silentWav() {
  const rate = 8000
  const samples = rate / 2
  const bytes = new Uint8Array(44 + samples).fill(128)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true) // 8-bit, where 128 is silence
  text(36, 'data')
  view.setUint32(40, samples, true)
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

const OfflineCtx: typeof OfflineAudioContext | undefined =
  window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext

async function render(track: Track, build: (ctx: OfflineAudioContext) => AudioNode, trim = 1) {
  const rate = 44100
  // Two full bars: enough for every drum hit and a pad swell to register.
  const seconds = Math.min(10, (60 / track.bpm) * 8 + 1)
  const ctx = new OfflineCtx!(1, Math.ceil(rate * seconds), rate)
  const rand = seeded(7)
  const deck = ctx.createGain()
  deck.gain.value = trim
  const wetDeck = ctx.createGain()
  wetDeck.gain.value = trim
  const fx = buildFx(ctx, build(ctx), rand)
  deck.connect(fx.dry)
  wetDeck.connect(fx.wet)
  sequence(new Kit(ctx, deck, wetDeck, noiseBuffer(ctx, rand), rand), track, seconds)
  const data = (await ctx.startRendering()).getChannelData(0)
  let sum = 0
  let peak = 0
  const from = Math.floor(rate * 0.5)
  for (let i = from; i < data.length; i++) {
    sum += data[i] * data[i]
    peak = Math.max(peak, Math.abs(data[i]))
  }
  return { rms: Math.sqrt(sum / (data.length - from)), peak }
}

/**
 * Loudness of a track before the master chain. A high-pass and a gentle high
 * shelf (roughly the K-weighting used by loudness meters) keep sub-bass from
 * dominating the number, so it tracks what the ear hears better than raw RMS.
 */
async function measure(track: Track) {
  const { rms } = await render(track, (ctx) => {
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 60
    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 1500
    shelf.gain.value = 4
    hp.connect(shelf).connect(ctx.destination)
    return hp
  })
  return rms
}

export interface MusicState {
  muted: boolean
  track: string
  /** False when the browser has no Web Audio, or refused to start it. */
  available: boolean
}

interface Player {
  track: Track
  kit: Kit
  dry: GainNode
  wet: GainNode
  step: number
  next: number
  /** Context time after which this player is silent and can be dropped. */
  until: number
}

class Music {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private fx!: { dry: AudioNode; wet: AudioNode }
  private noise!: AudioBuffer
  private players: Player[] = []
  private trims = [...FALLBACK_TRIM]
  private index = 0
  private timer = 0
  private listeners: ((s: MusicState) => void)[] = []
  private available = LiveCtx !== undefined
  private silent: HTMLAudioElement | null = null
  private session = 'default session'
  muted = true

  constructor() {
    void this.calibrate()
  }

  get state(): MusicState {
    return { muted: this.muted, track: TRACKS[this.index].name, available: this.available }
  }

  /** For the ?debug overlay. */
  get debug() {
    return {
      context: !this.available ? 'unavailable' : (this.ctx?.state ?? 'not created yet'),
      session: this.session,
      track: TRACKS[this.index].name,
      muted: this.muted,
    }
  }

  onChange(fn: (s: MusicState) => void) {
    this.listeners.push(fn)
    fn(this.state)
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state)
  }

  /** Measures every track offline and levels them. Needs no user gesture. */
  private async calibrate() {
    if (!OfflineCtx) return
    try {
      const levels = await Promise.all(TRACKS.map(measure))
      this.trims = levels.map((rms) => Math.min(4, Math.max(0.25, TARGET_RMS / rms)))
      // Already playing? Glide the live deck to its measured level.
      const live = this.players.find((p) => p.until === Infinity)
      if (live && this.ctx) this.fade(live, this.trims[TRACKS.indexOf(live.track)], 0.3)
    } catch {
      // Keep the fallback trims.
    }
  }

  /**
   * Must be called from the click that enters the site. With sound, this is
   * where the AudioContext is created and resumed, which is what iOS Safari
   * requires. Without sound, nothing is created until the toggle is clicked.
   */
  start(withSound: boolean) {
    if (withSound) this.setMuted(false, 1.8)
    else this.emit()
  }

  /** Call from a user gesture when unmuting. */
  setMuted(muted: boolean, fade = MUTE_FADE) {
    // No audio is never a reason to break the page: stay muted and say so.
    if (!muted && !this.ready()) {
      this.muted = true
      this.emit()
      return
    }
    this.muted = muted
    if (!muted) {
      const ctx = this.ctx!
      this.claimSession()
      void ctx.resume()
      this.unlock()
      this.rampMaster(LEVEL, fade)
      if (!this.players.some((p) => p.until === Infinity)) this.play(this.index, 0.05)
      this.run()
    } else if (this.ctx) {
      const ctx = this.ctx
      this.rampMaster(0, MUTE_FADE)
      window.setTimeout(() => {
        if (!this.muted) return
        this.halt()
        this.drop(...this.players)
        this.silent?.pause()
        void ctx.suspend()
      }, MUTE_FADE * 1000 + 250)
    }
    this.emit()
  }

  toggle() {
    this.setMuted(!this.muted)
  }
  next() {
    this.setTrack(this.index + 1)
  }
  prev() {
    this.setTrack(this.index - 1)
  }

  /** A small two-note caw. Silent unless the music is on. */
  chirp() {
    const ctx = this.ctx
    if (this.muted || !ctx || ctx.state !== 'running') return
    const out = ctx.createGain()
    out.gain.value = 0.16
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1500
    band.Q.value = 1.4
    band.connect(out).connect(this.master)
    for (const [at, from, to] of [[0, 760, 520], [0.15, 700, 440]] as const) {
      const t = ctx.currentTime + 0.01 + at
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(from, t)
      o.frequency.exponentialRampToValueAtTime(to, t + 0.11)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      // A fast wobble on the level gives the note its rasp.
      const rasp = ctx.createOscillator()
      rasp.frequency.value = 68
      const depth = ctx.createGain()
      depth.gain.value = 0.45
      rasp.connect(depth).connect(g.gain)
      o.connect(g).connect(band)
      o.start(t)
      rasp.start(t)
      o.stop(t + 0.15)
      rasp.stop(t + 0.15)
    }
    window.setTimeout(() => out.disconnect(), 800)
  }

  /**
   * Enter sequence: a low riser, filtered noise plus two detuned saws
   * sweeping up over `seconds`. Straight to the speakers (the music fades
   * in underneath). Silent unless the music is on.
   */
  riser(seconds: number) {
    const ctx = this.ctx
    if (this.muted || !ctx) return
    const t = ctx.currentTime + 0.02
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(0.32, t + seconds * 0.92)
    out.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.08)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 6
    lp.frequency.setValueAtTime(120, t)
    lp.frequency.exponentialRampToValueAtTime(2400, t + seconds)
    lp.connect(out).connect(ctx.destination)
    const noise = ctx.createBufferSource()
    noise.buffer = this.noise
    noise.loop = true
    const ng = ctx.createGain()
    ng.gain.value = 0.5
    noise.connect(ng).connect(lp)
    noise.start(t)
    noise.stop(t + seconds + 0.1)
    for (const detune of [-14, 9]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(41, t)
      o.frequency.exponentialRampToValueAtTime(165, t + seconds)
      const g = ctx.createGain()
      g.gain.value = 0.22
      o.connect(g).connect(lp)
      o.start(t)
      o.stop(t + seconds + 0.1)
    }
    window.setTimeout(() => out.disconnect(), (seconds + 0.4) * 1000)
  }

  /** Enter sequence: the bass hit on the shockwave. Silent unless the music is on. */
  impact() {
    const ctx = this.ctx
    if (this.muted || !ctx) return
    const t = ctx.currentTime + 0.01
    const out = ctx.createGain()
    out.gain.value = 0.9
    out.connect(ctx.destination)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(32, t + 0.45)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(1, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 1.35)
    // A short burst of filtered noise for the crack on top.
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'lowpass'
    bp.frequency.setValueAtTime(3000, t)
    bp.frequency.exponentialRampToValueAtTime(200, t + 0.4)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.35, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    n.connect(bp).connect(ng).connect(out)
    n.start(t)
    n.stop(t + 0.5)
    window.setTimeout(() => out.disconnect(), 1800)
  }

  /** Dev helper: renders each track through the full chain and reports levels in dBFS. */
  async levels() {
    await this.calibrate()
    return Promise.all(
      TRACKS.map(async (track, i) => {
        const raw = await measure(track)
        const out = await render(track, (ctx) => buildMaster(ctx, LEVEL), this.trims[i])
        return {
          track: track.name,
          rawWeightedRmsDb: +db(raw).toFixed(1),
          trimDb: +db(this.trims[i]).toFixed(1),
          trimmedWeightedRmsDb: +db(raw * this.trims[i]).toFixed(1),
          outputRmsDb: +db(out.rms).toFixed(1),
          outputPeakDb: +db(out.peak).toFixed(1),
        }
      }),
    )
  }

  private setTrack(i: number) {
    this.index = (i + TRACKS.length) % TRACKS.length
    const ctx = this.ctx
    if (ctx && !this.muted) {
      const now = ctx.currentTime
      for (const p of this.players) {
        if (p.until !== Infinity) continue
        this.fade(p, 0, CROSSFADE)
        p.until = now + CROSSFADE + 0.3
      }
      this.play(this.index, CROSSFADE)
    }
    this.emit()
  }

  private fade(p: Player, to: number, seconds: number) {
    const t = this.ctx!.currentTime
    for (const g of [p.dry.gain, p.wet.gain]) {
      g.cancelScheduledValues(t)
      g.setTargetAtTime(to, t, tau(seconds))
    }
  }

  private rampMaster(to: number, seconds: number) {
    const t = this.ctx!.currentTime
    const g = this.master.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(to, t, tau(seconds))
  }

  /** Starts a track on its own deck, fading in from silence. */
  private play(index: number, fadeIn: number) {
    const ctx = this.ctx!
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    dry.gain.value = 0
    wet.gain.value = 0
    dry.connect(this.fx.dry)
    wet.connect(this.fx.wet)
    const p: Player = {
      track: TRACKS[index],
      kit: new Kit(ctx, dry, wet, this.noise, Math.random),
      dry,
      wet,
      step: 0,
      next: ctx.currentTime + 0.1,
      until: Infinity,
    }
    this.players.push(p)
    this.fade(p, this.trims[index], fadeIn)
  }

  private drop(...gone: Player[]) {
    this.players = this.players.filter((p) => !gone.includes(p))
    // Let reverb tails and pad releases finish before unplugging.
    window.setTimeout(() => gone.forEach((p) => (p.dry.disconnect(), p.wet.disconnect())), 4000)
  }

  private ready(): boolean {
    if (this.ctx) return true
    if (!LiveCtx) return false
    try {
      this.build(LiveCtx)
    } catch {
      this.ctx = null
      this.available = false
    }
    return this.ctx !== null
  }

  private build(Ctx: typeof AudioContext) {
    const ctx = new Ctx()
    this.ctx = ctx
    this.master = buildMaster(ctx, 0)
    this.fx = buildFx(ctx, this.master, Math.random)
    this.noise = noiseBuffer(ctx, Math.random)

    // Vinyl crackle: faint hiss plus sparse pops, looped under everything.
    const crackle = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const c = crackle.getChannelData(0)
    for (let i = 0; i < c.length; i++) {
      c[i] = (Math.random() * 2 - 1) * 0.012
      if (Math.random() < 0.00035) c[i] += (Math.random() * 2 - 1) * 0.5
    }
    const cs = ctx.createBufferSource()
    cs.buffer = crackle
    cs.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1400
    const cg = ctx.createGain()
    cg.gain.value = 0.2
    cs.connect(hp).connect(cg).connect(this.fx.dry)
    cs.start()

    // Pause with the tab, pick up where it left off on return.
    document.addEventListener('visibilitychange', () => {
      if (this.muted) return
      if (document.hidden) {
        this.rampMaster(0, 0.08)
        this.silent?.pause()
        window.setTimeout(() => document.hidden && !this.muted && (this.halt(), void ctx.suspend()), 120)
      } else {
        void this.silent?.play().catch(() => {})
        void ctx.resume()
        this.rampMaster(LEVEL, MUTE_FADE)
        this.run()
      }
    })

    // iOS can interrupt the context (calls, backgrounding). The next touch revives it.
    document.addEventListener('pointerdown', () => {
      if (!this.muted && !document.hidden && ctx.state !== 'running') void ctx.resume()
    })
  }

  /**
   * iPhones mute Web Audio when the ringer switch is on silent, because they
   * treat it as an incidental sound effect. Two ways to say "this is music",
   * both of which must run inside the user's tap:
   *   1. Safari 17+: the Audio Session API.
   *   2. Older iOS: a looping silent <audio> element, which moves the whole
   *      page onto the media channel.
   * Everything is feature-checked; other browsers skip straight through.
   */
  private claimSession() {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback'
        this.session = 'audioSession: playback'
        return
      } catch {
        // Fall through to the element workaround.
      }
    }
    if (!IS_IOS) return
    try {
      if (!this.silent) {
        this.silent = new Audio(silentWav())
        this.silent.loop = true
        this.silent.setAttribute('playsinline', '')
      }
      const el = this.silent
      void el
        .play()
        .then(() => (this.session = 'silent <audio> loop'))
        .catch(() => (this.session = 'silent <audio> refused'))
    } catch {
      this.session = 'default session'
    }
  }

  /** iOS only counts the context as unlocked once a source starts inside the gesture. */
  private unlock() {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    s.connect(ctx.destination)
    s.start()
  }

  private run() {
    if (this.timer) return
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  private halt() {
    window.clearInterval(this.timer)
    this.timer = 0
  }

  private schedule() {
    const ctx = this.ctx!
    if (ctx.state !== 'running') return
    const now = ctx.currentTime
    const done = this.players.filter((p) => now > p.until)
    if (done.length) this.drop(...done)
    for (const p of this.players) {
      const sixteenth = 60 / p.track.bpm / 4
      // After a stall (throttled timer, resumed tab) skip ahead instead of bursting.
      if (p.next < now - 0.2) p.next = now + 0.05
      while (p.next < now + 0.15) {
        const swung = p.step % 2 === 1 ? p.track.swing * sixteenth : 0
        p.kit.step(p.track, p.step, p.next + swung, sixteenth)
        p.next += sixteenth
        p.step = (p.step + 1) % (16 * p.track.chords.length)
      }
    }
  }
}

export const music = new Music()
if (import.meta.env.DEV) (window as unknown as { __music: Music }).__music = music

/** Wires the persistent corner control to the engine. */
export function initSoundControl() {
  const marquee = document.getElementById('sndMarquee')!
  const toggle = document.getElementById('sndToggle')!
  const label = document.getElementById('sndLabel')!
  const pill = toggle.closest('.music')!
  document.getElementById('sndPrev')!.addEventListener('click', () => music.prev())
  document.getElementById('sndNext')!.addEventListener('click', () => music.next())
  toggle.addEventListener('click', () => music.toggle())
  const buttons = document.querySelectorAll<HTMLButtonElement>('.music button')
  music.onChange(({ muted, track, available }) => {
    // The button says what clicking it will do.
    label.textContent = !available ? 'No audio' : muted ? 'Play music' : 'Stop music'
    // Two copies side by side, so the ticker can loop seamlessly.
    const text = `${track} — `
    marquee.innerHTML = `<span>${text}</span><span aria-hidden="true">${text}</span>`
    toggle.setAttribute('aria-pressed', String(!muted))
    pill.classList.toggle('is-on', !muted)
    buttons.forEach((b) => (b.disabled = !available))
  })
}
