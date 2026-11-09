/** Moteur audio dynamique (Web Audio) : boucles moteur par régime (charge / décharge) issues des enregistrements
 *  fournis (droits inconnus), fondu à puissance constante entre régimes voisins + varispeed, couches synthétisées
 *  (régime bas/ralenti, turbo/MGU-H, vent, pneus, crissement, vibreurs, gravier, frottement, chocs, passage de
 *  rapport, ambiance), panoramique + Doppler selon la caméra. Déverrouillage iOS au premier geste. */
interface Sample { id: string; load: 'on' | 'off'; rpm_measured: number; file: string }
interface Loop { rpm: number; src: AudioBufferSourceNode; g: GainNode }
export interface AudioFrame {
  rpm: number; throttle: number; speed: number; slip: number; kerb: number; gravel: number; scrape: number; impact: number
  /** ers : puissance MGU-K normalisée −1…1 (fraction des 120 kW ; − = récupération). Bug corrigé : on passait des watts (gain ×720 → saturation). */
  shift: number; gear: number; limiter: boolean; ers: number; inside: boolean; pan: number; dist: number; radialV: number
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** Contexte temps réel (AudioContext / webkitAudioContext) et non OfflineAudioContext. */
const live = (c: BaseAudioContext): c is AudioContext => typeof OfflineAudioContext === 'undefined' || !(c instanceof OfflineAudioContext)
export class AudioEngine {
  ctx: BaseAudioContext | null = null; ready = false; volume = 0.8; muted = false
  private master!: GainNode; private engBus!: GainNode; private engFilter!: BiquadFilterNode; private pan!: StereoPannerNode
  private on: Loop[] = []; private off: Loop[] = []
  private idle!: OscillatorNode; private idle2!: OscillatorNode; private idleG!: GainNode
  private turbo!: OscillatorNode; private turboG!: GainNode; private mguk!: OscillatorNode; private mgukG!: GainNode
  private windG!: GainNode; private windF!: BiquadFilterNode
  private tyreG!: GainNode; private tyreF!: BiquadFilterNode; private squealG!: GainNode
  private kerbO!: OscillatorNode; private kerbG!: GainNode; private gravelG!: GainNode; private scrapeG!: GainNode
  private ambG!: GainNode; private noise!: AudioBuffer
  private cut = 0; private dop = 1
  /** `offline` : OfflineAudioContext fourni par les tests (rendu hors ligne d'un tour → analyse du signal / WAV). */
  async init(base = './audio/engine/', offline?: BaseAudioContext) {
    if (this.ctx) { if (live(this.ctx)) await this.ctx.resume(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = this.ctx = offline ?? new AC({ latencyHint: 'interactive' })
    // iOS : un tampon muet joué dans le geste déverrouille la sortie
    const sil = ctx.createBufferSource(); sil.buffer = ctx.createBuffer(1, 1, 22050); sil.connect(ctx.destination); sil.start()
    if (live(ctx)) await ctx.resume()
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2
    this.master = ctx.createGain(); this.master.gain.value = this.volume
    // limiteur de sécurité (crête ≤ ~−1 dBFS) après le compresseur
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08
    const makeup = ctx.createGain(); makeup.gain.value = 1.6 // +4 dB (rendu hors ligne : RMS −22 dBFS jugé faible pour un haut-parleur de téléphone)
    this.master.connect(comp); comp.connect(makeup); makeup.connect(lim); lim.connect(ctx.destination)
    this.pan = ctx.createStereoPanner(); this.pan.connect(this.master)
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 9000; this.engFilter.Q.value = 0.5
    this.engFilter.connect(this.pan)
    this.engBus = ctx.createGain(); this.engBus.gain.value = 0.9; this.engBus.connect(this.engFilter)
    // bruit blanc partagé
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = this.noise.getChannelData(0); let b = 0
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2 }
    const map = await (await fetch(base + 'engine-map.json')).json() as { samples: Sample[] }
    const bufs = await Promise.all(map.samples.map(async s => {
      const ab = await (await fetch(base + s.file)).arrayBuffer()
      return await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej))
    }))
    map.samples.forEach((s, i) => {
      const src = ctx.createBufferSource(); src.buffer = bufs[i]; src.loop = true
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.engBus)
      src.start(ctx.currentTime + 0.01, Math.random() * bufs[i].duration)
      ;(s.load === 'on' ? this.on : this.off).push({ rpm: s.rpm_measured, src, g })
    })
    this.on.sort((a, b) => a.rpm - b.rpm); this.off.sort((a, b) => a.rpm - b.rpm)
    // couche régime bas (ralenti / sous 7000 tr/min) : harmoniques d'allumage V6 synthétisées
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.9
    this.idleG = ctx.createGain(); this.idleG.gain.value = 0; lp.connect(this.idleG); this.idleG.connect(this.engBus)
    this.idle = ctx.createOscillator(); this.idle.type = 'sawtooth'; this.idle.connect(lp); this.idle.start()
    this.idle2 = ctx.createOscillator(); this.idle2.type = 'square'; const g2 = ctx.createGain(); g2.gain.value = 0.35; this.idle2.connect(g2); g2.connect(lp); this.idle2.start()
    // turbo / MGU-H (sifflement) et MGU-K (gémissement électrique)
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turboG = ctx.createGain(); this.turboG.gain.value = 0
    this.turbo.connect(this.turboG); this.turboG.connect(this.engFilter); this.turbo.start()
    this.mguk = ctx.createOscillator(); this.mguk.type = 'triangle'; this.mgukG = ctx.createGain(); this.mgukG.gain.value = 0
    this.mguk.connect(this.mgukG); this.mgukG.connect(this.engFilter); this.mguk.start()
    const noiseNode = (type: BiquadFilterType, f: number, q: number) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q
      const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(0, Math.random() * 2)
      return { g, fl }
    }
    ;({ g: this.windG, fl: this.windF } = noiseNode('bandpass', 700, 0.6))
    ;({ g: this.tyreG, fl: this.tyreF } = noiseNode('bandpass', 1100, 3))
    this.squealG = noiseNode('bandpass', 1350, 14).g
    this.gravelG = noiseNode('lowpass', 500, 0.7).g
    this.scrapeG = noiseNode('highpass', 3200, 0.7).g
    this.ambG = noiseNode('lowpass', 650, 0.5).g; this.ambG.gain.value = 0.025
    const kl = ctx.createBiquadFilter(); kl.type = 'lowpass'; kl.frequency.value = 260
    this.kerbO = ctx.createOscillator(); this.kerbO.type = 'square'; this.kerbG = ctx.createGain(); this.kerbG.gain.value = 0
    this.kerbO.connect(kl); kl.connect(this.kerbG); this.kerbG.connect(this.master); this.kerbO.start()
    this.ready = true
  }
  setVolume(v: number) { this.volume = v; if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05) }
  setMuted(m: boolean) { this.muted = m; this.setVolume(this.volume) }
  suspend() { if (this.ctx && live(this.ctx)) void this.ctx.suspend() } resume() { if (this.ctx && live(this.ctx)) void this.ctx.resume() }
  /** Fondu à puissance constante entre les deux boucles encadrant le régime ; renvoie rien, écrit les gains. */
  private xfade(set: Loop[], rpm: number, level: number, t: number, rate: number) {
    let i = set.findIndex(l => l.rpm > rpm)
    if (i < 0) i = set.length; const lo = set[Math.max(0, i - 1)], hi = set[Math.min(set.length - 1, i)]
    const f = lo === hi ? 0 : clamp(Math.log(rpm / lo.rpm) / Math.log(hi.rpm / lo.rpm), 0, 1)
    for (const l of set) {
      const g = l === lo ? Math.cos(f * Math.PI / 2) : l === hi ? Math.sin(f * Math.PI / 2) : 0
      l.g.gain.setTargetAtTime(g * level, t, 0.025)
      l.src.playbackRate.setTargetAtTime(clamp(rpm / l.rpm, 0.45, 1.6) * rate, t, 0.02)
    }
  }
  update(a: AudioFrame, dt: number) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    // coupure d'allumage au passage de rapport (~45 ms) et au limiteur
    if (a.shift) this.cut = 0.045
    this.cut = Math.max(0, this.cut - dt)
    const lim = a.limiter ? 0.55 + 0.45 * Math.round(Math.random()) : 1
    const load = clamp(a.throttle, 0, 1) * (this.cut > 0 ? 0.15 : 1) * lim
    // Doppler (caméras extérieures), lissé
    const dTarget = a.inside ? 1 : clamp(343 / (343 - clamp(a.radialV, -120, 120)), 0.7, 1.4)
    this.dop += (dTarget - this.dop) * Math.min(1, dt * 6)
    const rpm = Math.max(3800, a.rpm)
    const dist = a.inside ? 1 : clamp(18 / Math.max(6, a.dist), 0.04, 1)
    const hiOn = clamp((rpm - 6200) / 1200, 0, 1)
    this.xfade(this.on, rpm, (0.25 + 0.75 * load) * hiOn, t, this.dop)
    this.xfade(this.off, rpm, (1 - load) * 0.55 * hiOn, t, this.dop)
    const fire = rpm / 60 * 3 * this.dop // fréquence d'allumage V6
    this.idle.frequency.setTargetAtTime(fire, t, 0.02); this.idle2.frequency.setTargetAtTime(fire * 0.5, t, 0.02)
    this.idleG.gain.setTargetAtTime((1 - hiOn) * (0.16 + 0.12 * load), t, 0.03)
    this.engBus.gain.setTargetAtTime(0.9 * dist, t, 0.05)
    this.engFilter.frequency.setTargetAtTime(a.inside ? 5200 : 2500 + 9000 * dist, t, 0.05)
    this.pan.pan.setTargetAtTime(a.inside ? 0 : clamp(a.pan, -0.9, 0.9), t, 0.05)
    this.turbo.frequency.setTargetAtTime(1800 + rpm * 0.32, t, 0.05)
    this.turboG.gain.setTargetAtTime(0.012 * load * clamp(rpm / 11000, 0, 1) * dist, t, 0.08)
    this.mguk.frequency.setTargetAtTime(260 + a.speed * 9, t, 0.05)
    this.mgukG.gain.setTargetAtTime(clamp(Math.abs(a.ers), 0, 1) * 0.012 * dist, t, 0.1)
    const v = a.speed
    this.windG.gain.setTargetAtTime(clamp((v / 90) ** 2, 0, 1.3) * (a.inside ? 0.09 : 0.05), t, 0.1)
    this.windF.frequency.setTargetAtTime(400 + v * 9, t, 0.1)
    const sl = clamp(a.slip, 0, 1)
    this.tyreG.gain.setTargetAtTime(sl * 0.12 * clamp(v / 15, 0, 1) * dist, t, 0.04)
    this.tyreF.frequency.setTargetAtTime(800 + sl * 900, t, 0.05)
    this.squealG.gain.setTargetAtTime(clamp((a.slip - 0.45) * 2, 0, 1) * 0.16 * dist, t, 0.04)
    this.kerbO.frequency.setTargetAtTime(clamp(v / 0.9, 8, 120), t, 0.02)
    this.kerbG.gain.setTargetAtTime(clamp(a.kerb, 0, 1) * 0.22 * clamp(v / 20, 0, 1) * dist, t, 0.02)
    this.gravelG.gain.setTargetAtTime(clamp(a.gravel, 0, 1) * 0.3 * clamp(v / 10, 0, 1) * dist, t, 0.04)
    this.scrapeG.gain.setTargetAtTime(clamp(a.scrape, 0, 1) * 0.12 * dist, t, 0.02)
    if (a.impact > 0.5) this.thud(Math.min(1, a.impact / 4))
    if (a.shift) this.click()
  }
  private burst(dur: number, f: number, type: BiquadFilterType, gain: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(); s.buffer = this.noise
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f
    const g = ctx.createGain(); const t = ctx.currentTime
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02)
  }
  private click() { this.burst(0.05, 2500, 'bandpass', 0.18) }
  private thud(k: number) { this.burst(0.35, 180, 'lowpass', 0.9 * k) }
}
