/** Moteur audio dynamique (Web Audio) — v2 « 3D ».
 *  - Moteur : boucles par régime (charge / décharge) issues des enregistrements fournis (droits inconnus), fondu à
 *    puissance constante + varispeed. CORRIGÉ : sous 6 200 tr/min les boucles étaient coupées et seule une onde
 *    synthétique restait (son « cassé » à très bas régime) → la boucle la plus basse descend maintenant jusqu'au
 *    ralenti (varispeed ≥ 0,5), complétée par une couche d'harmoniques d'allumage V6 qui reste discrète.
 *  - Spatialisation : PannerNode HRTF (moteur à l'arrière de la voiture, pneus/sol au centre), auditeur = caméra,
 *    atténuation par distance, absorption de l'air (passe-bas selon la distance), Doppler, réverbération légère
 *    (tribunes, murs) selon la caméra.
 *  - Profils caméra : cockpit (casque : graves, admission, transmission, vent fort, aigus filtrés), T-cam (admission
 *    au-dessus de la boîte à air), onboard/poursuite (échappement), TV (distance, réverbération, Doppler).
 *  - Sol : asphalte (roulement), vibreurs (battement selon l'espacement des bandes), herbe (frottement sourd),
 *    gravier (crépitement granulaire + cailloux sur la coque), frottement du plancher, chocs (sourd + métal + débris),
 *    passage de rapport, vent. Déverrouillage iOS au premier geste, reprise auto après interruption (appel, Siri). */
interface Sample { id: string; load: 'on' | 'off'; rpm_measured: number; file: string }
interface Loop { rpm: number; src: AudioBufferSourceNode; g: GainNode }
export type AudioCam = 'cockpit' | 'tcam' | 'close' | 'chase' | 'tv' | 'free'
export interface AudioFrame {
  rpm: number; throttle: number; speed: number; slip: number; kerb: number; gravel: number; scrape: number; impact: number
  /** type de barrière touchée (1 pneus, 2 rail, 3 béton, 4 objet) */
  hitKind?: number
  /** ers : puissance MGU-K normalisée −1…1 (fraction des 120 kW ; − = récupération). */
  shift: number; gear: number; limiter: boolean; ers: number; inside: boolean; pan: number; dist: number; radialV: number
  /** v2 (facultatifs) : herbe séparée du gravier, caméra, positions monde (spatialisation HRTF) */
  grass?: number; cam?: AudioCam
  /** pluie (mm/h), film d'eau sous les roues (mm), blocage de roue 0..1 */
  rain?: number; wet?: number; lock?: number
  src?: [number, number, number]; fwd?: [number, number, number]
  lis?: [number, number, number]; lisF?: [number, number, number]; lisU?: [number, number, number]
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const live = (c: BaseAudioContext): c is AudioContext => typeof OfflineAudioContext === 'undefined' || !(c instanceof OfflineAudioContext)
/** profil de mixage par caméra : passe-bas moteur, graves, admission, vent, réverbération, transmission */
const PROFILE: Record<AudioCam, { lp: number; low: number; intake: number; wind: number; wet: number; trans: number; gain: number }> = {
  cockpit: { lp: 4200, low: 6, intake: 0.55, wind: 1.0, wet: 0.04, trans: 0.9, gain: 0.95 },
  tcam:    { lp: 9000, low: 3, intake: 1.0, wind: 0.6, wet: 0.05, trans: 0.5, gain: 1.0 },
  close:   { lp: 12000, low: 2, intake: 0.25, wind: 0.35, wet: 0.1, trans: 0.2, gain: 1.0 },
  chase:   { lp: 12000, low: 1, intake: 0.15, wind: 0.25, wet: 0.14, trans: 0.12, gain: 1.0 },
  free:    { lp: 12000, low: 1, intake: 0.2, wind: 0.2, wet: 0.18, trans: 0.15, gain: 1.0 },
  tv:      { lp: 14000, low: 0, intake: 0.1, wind: 0.1, wet: 0.32, trans: 0.05, gain: 1.15 },
}
export class AudioEngine {
  radioIn: GainNode | null = null
  ctx: BaseAudioContext | null = null; ready = false; volume = 0.8; muted = false
  private master!: GainNode; private engBus!: GainNode; private engLP!: BiquadFilterNode; private engLow!: BiquadFilterNode
  private engP!: PannerNode | StereoPannerNode; private wheelP!: PannerNode | StereoPannerNode; private air!: BiquadFilterNode
  private wet!: GainNode; private spatial = false
  private on: Loop[] = []; private off: Loop[] = []
  private idle!: OscillatorNode; private idle2!: OscillatorNode; private idleG!: GainNode; private idleLP!: BiquadFilterNode
  private intakeG!: GainNode; private intakeF!: BiquadFilterNode; private transO!: OscillatorNode; private transG!: GainNode
  private mguhF!: BiquadFilterNode
  private turbo!: OscillatorNode; private turboG!: GainNode; private mguk!: OscillatorNode; private mgukG!: GainNode
  private windG!: GainNode; private windF!: BiquadFilterNode
  private tyreG!: GainNode; private tyreF!: BiquadFilterNode; private squealG!: GainNode
  private kerbO!: OscillatorNode; private kerbG!: GainNode; private gravelG!: GainNode; private gravelF!: BiquadFilterNode
  private grassG!: GainNode; private scrapeG!: GainNode
  private ambG!: GainNode; private noise!: AudioBuffer
  private rainG!: GainNode; private rainLowG!: GainNode; private hissG!: GainNode; private mguh!: OscillatorNode; private mguhG!: GainNode; private lockG!: GainNode
  private spool = 0; private crackT = 0
  private cut = 0; private dop = 1; private lastThr = 0; private pebT = 0; private popT = 0
  async init(base = './audio/engine/', offline?: BaseAudioContext) {
    if (this.ctx) { if (live(this.ctx)) await this.ctx.resume(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = this.ctx = offline ?? new AC({ latencyHint: 'interactive' })
    const sil = ctx.createBufferSource(); sil.buffer = ctx.createBuffer(1, 1, 22050); sil.connect(ctx.destination); sil.start()
    if (live(ctx)) {
      await ctx.resume()
      // iOS : contexte « interrupted » (appel, Siri, autre app) → reprise au prochain toucher / retour
      const kick = () => { if (ctx.state !== 'running' && !this.muted) void ctx.resume() }
      ctx.addEventListener('statechange', () => { if (ctx.state !== 'running') setTimeout(kick, 300) })
      addEventListener('touchend', kick, { passive: true }); addEventListener('pointerup', kick, { passive: true })
    }
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2
    this.master = ctx.createGain(); this.master.gain.value = this.volume
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08
    const makeup = ctx.createGain(); makeup.gain.value = 1.6
    this.master.connect(comp); comp.connect(makeup); makeup.connect(lim); lim.connect(ctx.destination)
    this.radioIn = ctx.createGain(); this.radioIn.connect(lim) // radio de l'ingénieur : hors bus moteur, même limiteur
    // bruit partagé (blanc + rose léger)
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = this.noise.getChannelData(0); let b = 0
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2 }
    // réverbération courte synthétique (réponse impulsionnelle stéréo décroissante 1,1 s) : murs, tribunes
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.1), ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) { const t = i / ctx.sampleRate; x[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4.2) * (t < 0.012 ? 0 : 1) * 0.5 } }
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir
    this.wet = ctx.createGain(); this.wet.gain.value = 0.1; conv.connect(this.wet); this.wet.connect(this.master)
    // spatialisation : HRTF si disponible (Safari iOS ≥ 14), sinon panoramique stéréo
    const mkPanner = (): PannerNode | StereoPannerNode => {
      try {
        const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 7; p.rolloffFactor = 1; p.maxDistance = 3000
        this.spatial = true; return p
      } catch { return ctx.createStereoPanner() }
    }
    this.air = ctx.createBiquadFilter(); this.air.type = 'lowpass'; this.air.frequency.value = 16000; this.air.Q.value = 0.4
    const bus = ctx.createGain(); this.air.connect(bus); bus.connect(this.master); bus.connect(conv)
    this.engP = mkPanner(); this.engP.connect(this.air)
    this.wheelP = mkPanner(); this.wheelP.connect(this.air)
    this.engLP = ctx.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 9000; this.engLP.Q.value = 0.5
    this.engLow = ctx.createBiquadFilter(); this.engLow.type = 'lowshelf'; this.engLow.frequency.value = 220; this.engLow.gain.value = 0
    this.engLow.connect(this.engLP); this.engLP.connect(this.engP)
    this.engBus = ctx.createGain(); this.engBus.gain.value = 0.9; this.engBus.connect(this.engLow)
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
    // corps du moteur à bas régime : harmoniques d'allumage V6 (sous la boucle, jamais seules)
    this.idleLP = ctx.createBiquadFilter(); this.idleLP.type = 'lowpass'; this.idleLP.frequency.value = 700; this.idleLP.Q.value = 0.8
    this.idleG = ctx.createGain(); this.idleG.gain.value = 0; this.idleLP.connect(this.idleG); this.idleG.connect(this.engBus)
    this.idle = ctx.createOscillator(); this.idle.type = 'sawtooth'; this.idle.connect(this.idleLP); this.idle.start()
    this.idle2 = ctx.createOscillator(); this.idle2.type = 'triangle'; const g2 = ctx.createGain(); g2.gain.value = 0.5; this.idle2.connect(g2); g2.connect(this.idleLP); this.idle2.start()
    const noiseNode = (type: BiquadFilterType, f: number, q: number, dest: AudioNode) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q
      const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(dest); s.start(0, Math.random() * 2)
      return { g, fl }
    }
    // admission (au-dessus de la tête du pilote) : souffle filtré à la fréquence d'allumage
    ;({ g: this.intakeG, fl: this.intakeF } = noiseNode('bandpass', 900, 2.5, this.engLP))
    // transmission (pignons droits) : gémissement proportionnel à la vitesse
    this.transO = ctx.createOscillator(); this.transO.type = 'triangle'; this.transG = ctx.createGain(); this.transG.gain.value = 0
    this.transO.connect(this.transG); this.transG.connect(this.engLP); this.transO.start()
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turboG = ctx.createGain(); this.turboG.gain.value = 0
    this.turbo.connect(this.turboG); this.turboG.connect(this.engLP); this.turbo.start()
    this.mguk = ctx.createOscillator(); this.mguk.type = 'triangle'; this.mgukG = ctx.createGain(); this.mgukG.gain.value = 0
    this.mguk.connect(this.mgukG); this.mgukG.connect(this.engLP); this.mguk.start()
    ;({ g: this.windG, fl: this.windF } = noiseNode('bandpass', 700, 0.6, this.master))
    ;({ g: this.tyreG, fl: this.tyreF } = noiseNode('bandpass', 1100, 3, this.wheelP))
    this.squealG = noiseNode('bandpass', 1350, 14, this.wheelP).g
    ;({ g: this.gravelG, fl: this.gravelF } = noiseNode('bandpass', 2600, 0.9, this.wheelP))
    this.grassG = noiseNode('lowpass', 380, 0.7, this.wheelP).g
    this.scrapeG = noiseNode('highpass', 3200, 0.7, this.wheelP).g
    this.ambG = noiseNode('lowpass', 650, 0.5, this.master).g; this.ambG.gain.value = 0.02
    // pluie : crépitement aigu (gouttes) + grondement sourd (sur le casque / la coque) ; chuintement des pneus dans l'eau
    this.rainG = noiseNode('bandpass', 5200, 0.5, this.master).g; this.rainLowG = noiseNode('lowpass', 260, 0.6, this.master).g
    this.hissG = noiseNode('highpass', 2400, 0.6, this.wheelP).g
    // blocage : crissement aigu et serré (gomme qui frotte en un point)
    this.lockG = noiseNode('bandpass', 2300, 18, this.wheelP).g
    // MGU-H : moteur-générateur sur l'arbre du turbo (sifflement électrique qui suit la vitesse du turbo)
    this.mguh = ctx.createOscillator(); this.mguh.type = 'sawtooth'; const mf = ctx.createBiquadFilter(); mf.type = 'bandpass'; mf.Q.value = 6
    this.mguhG = ctx.createGain(); this.mguhG.gain.value = 0; this.mguh.connect(mf); mf.connect(this.mguhG); this.mguhG.connect(this.engLP); this.mguh.start(); this.mguhF = mf
    const kl = ctx.createBiquadFilter(); kl.type = 'lowpass'; kl.frequency.value = 240
    this.kerbO = ctx.createOscillator(); this.kerbO.type = 'sawtooth'; this.kerbG = ctx.createGain(); this.kerbG.gain.value = 0
    this.kerbO.connect(kl); kl.connect(this.kerbG); this.kerbG.connect(this.wheelP); this.kerbO.start()
    this.ready = true
  }
  setVolume(v: number) { this.volume = v; if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05) }
  setMuted(m: boolean) { this.muted = m; this.setVolume(this.volume) }
  suspend() { if (this.ctx && live(this.ctx)) void this.ctx.suspend() } resume() { if (this.ctx && live(this.ctx)) void this.ctx.resume() }
  private xfade(set: Loop[], rpm: number, level: number, t: number, rate: number) {
    let i = set.findIndex(l => l.rpm > rpm)
    if (i < 0) i = set.length; const lo = set[Math.max(0, i - 1)], hi = set[Math.min(set.length - 1, i)]
    const f = lo === hi ? 0 : clamp(Math.log(rpm / lo.rpm) / Math.log(hi.rpm / lo.rpm), 0, 1)
    for (const l of set) {
      const g = l === lo ? Math.cos(f * Math.PI / 2) : l === hi ? Math.sin(f * Math.PI / 2) : 0
      l.g.gain.setTargetAtTime(g * level, t, 0.025)
      // varispeed : la boucle la plus basse descend jusqu'au ralenti (×0,5) → plus de trou sous 7 000 tr/min
      if (g > 0 || l.g.gain.value > 1e-3) l.src.playbackRate.setTargetAtTime(clamp(rpm / l.rpm, 0.5, 1.6) * rate, t, 0.02)
    }
  }
  private place(p: PannerNode | StereoPannerNode, x: number, y: number, z: number, t: number, pan: number) {
    const P = p as PannerNode
    if ('positionX' in P && P.positionX) { P.positionX.setTargetAtTime(x, t, 0.02); P.positionY.setTargetAtTime(y, t, 0.02); P.positionZ.setTargetAtTime(z, t, 0.02) }
    else if ('setPosition' in P) (P as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(x, y, z)
    else (p as StereoPannerNode).pan.setTargetAtTime(pan, t, 0.05)
  }
  private listener(f: AudioFrame, t: number) {
    const L = this.ctx!.listener as AudioListener & { setPosition?: (a: number, b: number, c: number) => void; setOrientation?: (a: number, b: number, c: number, d: number, e: number, g: number) => void }
    const p = f.lis!, F = f.lisF ?? [0, 0, -1], U = f.lisU ?? [0, 1, 0]
    if (L.positionX) { L.positionX.setValueAtTime(p[0], t); L.positionY.setValueAtTime(p[1], t); L.positionZ.setValueAtTime(p[2], t)
      L.forwardX.setValueAtTime(F[0], t); L.forwardY.setValueAtTime(F[1], t); L.forwardZ.setValueAtTime(F[2], t); L.upX.setValueAtTime(U[0], t); L.upY.setValueAtTime(U[1], t); L.upZ.setValueAtTime(U[2], t) }
    else { L.setPosition?.(p[0], p[1], p[2]); L.setOrientation?.(F[0], F[1], F[2], U[0], U[1], U[2]) }
  }
  update(a: AudioFrame, dt: number) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    const cam: AudioCam = a.cam ?? (a.inside ? 'cockpit' : 'chase'), P = PROFILE[cam]
    if (a.shift) this.cut = 0.045
    this.cut = Math.max(0, this.cut - dt)
    const lim = a.limiter ? 0.55 + 0.45 * Math.round(Math.random()) : 1
    const load = clamp(a.throttle, 0, 1) * (this.cut > 0 ? 0.15 : 1) * lim
    const dTarget = a.inside ? 1 : clamp(343 / (343 - clamp(a.radialV, -120, 120)), 0.7, 1.4)
    this.dop += (dTarget - this.dop) * Math.min(1, dt * 6)
    const rpm = Math.max(3800, a.rpm)
    // spatialisation : moteur ~1,2 m derrière le CdG, roues/sol au CdG ; sinon distance/pan simplifiés (tests hors ligne)
    const spatial = this.spatial && !!a.src && !!a.lis
    let dist = a.inside ? 1 : clamp(18 / Math.max(6, a.dist), 0.04, 1)
    if (spatial) {
      this.listener(a, t)
      const s = a.src!, fw = a.fwd ?? [0, 0, -1]
      this.place(this.engP, s[0] - fw[0] * 1.2, s[1] + 0.35, s[2] - fw[2] * 1.2, t, 0)
      this.place(this.wheelP, s[0], s[1], s[2], t, 0)
      dist = 1 // l'atténuation est faite par les PannerNode
    } else { this.place(this.engP, 0, 0, -1, t, a.inside ? 0 : clamp(a.pan, -0.9, 0.9)); this.place(this.wheelP, 0, 0, -1, t, a.inside ? 0 : clamp(a.pan, -0.9, 0.9)) }
    // absorption de l'air : aigus atténués avec la distance (≈ −1 octave par 100 m), sauf à bord
    const far = a.inside ? 0 : clamp(a.dist, 0, 800)
    this.air.frequency.setTargetAtTime(clamp(16000 / (1 + far / 60), 1800, 16000), t, 0.08)
    this.wet.gain.setTargetAtTime(P.wet * (1 + clamp(far / 150, 0, 1)), t, 0.2)
    // boucles : à bas régime la décharge (dont la plus basse est 7 500) est remplacée progressivement par la charge
    const lowOff = clamp((7600 - rpm) / 1500, 0, 1)
    this.xfade(this.on, rpm, (0.25 + 0.75 * load + (1 - load) * 0.4 * lowOff) * P.gain, t, this.dop)
    this.xfade(this.off, rpm, (1 - load) * 0.55 * (1 - lowOff) * P.gain, t, this.dop)
    const fire = rpm / 60 * 3 * this.dop // fréquence d'allumage V6
    this.idle.frequency.setTargetAtTime(fire, t, 0.02); this.idle2.frequency.setTargetAtTime(fire * 0.5, t, 0.02)
    const lowR = clamp((8500 - rpm) / 3500, 0, 1)
    this.idleG.gain.setTargetAtTime(lowR * (0.05 + 0.05 * load), t, 0.04)
    this.idleLP.frequency.setTargetAtTime(500 + rpm * 0.08, t, 0.05)
    this.engBus.gain.setTargetAtTime(0.9 * dist, t, 0.05)
    this.engLP.frequency.setTargetAtTime(spatial ? P.lp : (a.inside ? 5200 : 2500 + 9000 * dist), t, 0.08)
    this.engLow.gain.setTargetAtTime(P.low, t, 0.1)
    this.intakeF.frequency.setTargetAtTime(clamp(fire * 2, 300, 4000), t, 0.03)
    this.intakeG.gain.setTargetAtTime(P.intake * 0.05 * (0.3 + load) * clamp(rpm / 12000, 0.3, 1), t, 0.05)
    this.transO.frequency.setTargetAtTime(40 + a.speed * 21, t, 0.05)
    this.transG.gain.setTargetAtTime(P.trans * 0.008 * clamp(a.speed / 40, 0, 1) * (1.2 - load * 0.6), t, 0.08)
    // turbo : inertie de l'arbre (montée ≈ 0,25 s, descente ≈ 0,8 s) ; au lever de pied le MGU-H garde le turbo lancé (anti-lag 2020)
    const spT = clamp(load * rpm / 11500, 0, 1.1) * 0.85 + (load < 0.2 && rpm > 8000 ? 0.35 : 0)
    this.spool += (spT - this.spool) * Math.min(1, dt / (spT > this.spool ? 0.25 : 0.8))
    this.turbo.frequency.setTargetAtTime(2600 + this.spool * 6200, t, 0.03)
    this.turboG.gain.setTargetAtTime(0.014 * this.spool * this.spool * dist * (cam === 'cockpit' || cam === 'tcam' ? 1.4 : 0.8), t, 0.05)
    this.mguh.frequency.setTargetAtTime(700 + this.spool * 2400, t, 0.03); this.mguhF.frequency.setTargetAtTime(1400 + this.spool * 4800, t, 0.03)
    this.mguhG.gain.setTargetAtTime(0.006 * this.spool * (load < 0.2 ? 1.4 : 0.7) * dist, t, 0.08)
    this.mguk.frequency.setTargetAtTime(260 + a.speed * 9, t, 0.05)
    this.mgukG.gain.setTargetAtTime(clamp(Math.abs(a.ers), 0, 1) * 0.012 * dist, t, 0.1)
    const v = a.speed
    this.windG.gain.setTargetAtTime(clamp((v / 90) ** 2, 0, 1.3) * 0.1 * P.wind, t, 0.1)
    this.windF.frequency.setTargetAtTime(400 + v * 9, t, 0.1)
    const sl = clamp(a.slip, 0, 1)
    this.tyreG.gain.setTargetAtTime((sl * 0.12 + 0.012 * clamp(v / 60, 0, 1)) * clamp(v / 15, 0, 1) * dist, t, 0.04)
    this.tyreF.frequency.setTargetAtTime(800 + sl * 900, t, 0.05)
    const wetK = clamp((a.wet ?? 0) / 0.3, 0, 1)
    this.squealG.gain.setTargetAtTime(clamp((a.slip - 0.45) * 2, 0, 1) * 0.16 * dist * (1 - 0.8 * wetK), t, 0.04)
    this.lockG.gain.setTargetAtTime(clamp(a.lock ?? 0, 0, 1) * 0.14 * clamp(v / 15, 0, 1) * dist * (1 - 0.8 * wetK), t, 0.03)
    // eau : chuintement des pneus ∝ vitesse × film ; pluie : plus forte à bord (gouttes sur le casque)
    this.hissG.gain.setTargetAtTime(wetK * clamp(v / 50, 0, 1.4) * 0.12 * dist, t, 0.1)
    const rr = clamp((a.rain ?? 0) / 9, 0, 1)
    this.rainG.gain.setTargetAtTime(rr * (cam === 'cockpit' ? 0.09 : 0.05), t, 0.3); this.rainLowG.gain.setTargetAtTime(rr * (cam === 'cockpit' ? 0.12 : 0.03), t, 0.3)
    // vibreurs de Spa : bandes ≈ 1 m → battement = vitesse / 1 m
    this.kerbO.frequency.setTargetAtTime(clamp(v / 1.0, 8, 110), t, 0.02)
    this.kerbG.gain.setTargetAtTime(clamp(a.kerb, 0, 1) * 0.24 * clamp(v / 20, 0, 1) * dist, t, 0.02)
    // gravier : crépitement granulaire (gain modulé aléatoirement) ; herbe : frottement sourd
    const grass = a.grass ?? 0, gravel = a.grass === undefined ? a.gravel : clamp(a.gravel, 0, 1)
    const gv = clamp(gravel, 0, 1) * clamp(v / 10, 0, 1)
    this.gravelG.gain.setTargetAtTime(gv * (0.18 + 0.14 * Math.random()) * dist, t, 0.01)
    this.gravelF.frequency.setTargetAtTime(1800 + Math.random() * 1800, t, 0.01)
    this.grassG.gain.setTargetAtTime(clamp(grass, 0, 1) * 0.22 * clamp(v / 12, 0, 1) * dist, t, 0.05)
    this.scrapeG.gain.setTargetAtTime(clamp(a.scrape, 0, 1) * 0.12 * dist, t, 0.02)
    // cailloux projetés sur la coque (cockpit / proches)
    this.pebT -= dt
    if (gv > 0.1 && this.pebT <= 0) { this.pebT = 0.03 + Math.random() * 0.12 / gv; this.burst(0.02, 3500 + Math.random() * 3000, 'bandpass', 0.06 * gv * (a.inside ? 1.5 : 0.6) * dist, this.wheelP) }
    // retour de flamme léger au lever de pied à haut régime (rare sur les V6 hybrides 2020)
    this.popT -= dt
    if (this.lastThr > 0.7 && a.throttle < 0.2 && rpm > 10000 && this.popT <= 0) { this.popT = 0.4; for (let k = 0; k < 3; k++) setTimeout(() => this.burst(0.03, 700, 'lowpass', 0.12 * dist, this.engP), k * 55 + Math.random() * 30) }
    // décélération : crépitements d'échappement en frein moteur à haut régime (irréguliers)
    this.crackT -= dt
    if (a.throttle < 0.08 && rpm > 8500 && a.speed > 25 && this.crackT <= 0) { this.crackT = 0.08 + Math.random() * 0.35; this.burst(0.018 + Math.random() * 0.02, 500 + Math.random() * 900, 'bandpass', (0.04 + Math.random() * 0.05) * dist * (cam === 'cockpit' ? 0.6 : 1), this.engP) }
    this.lastThr = a.throttle
    // un seul son par choc (le pic d'impact décroît sur ~0,2 s) ; timbre selon la barrière (pneus sourds, rail métallique, béton sec)
    this.crashT -= dt
    if (a.impact > 0.3 && (a.impact > this.lastImp + 0.15 || this.crashT <= 0) && a.impact >= this.lastImp) { this.crash(Math.min(1, a.impact), dist, a.hitKind ?? 0); this.crashT = 0.35 }
    this.lastImp = a.impact
    if (a.shift) this.click(a.inside)
  }
  private burst(dur: number, f: number, type: BiquadFilterType, gain: number, dest?: AudioNode) {
    const ctx = this.ctx!, s = ctx.createBufferSource(); s.buffer = this.noise
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f
    const g = ctx.createGain(); const t = ctx.currentTime
    g.gain.setValueAtTime(Math.max(1e-4, gain), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(fl); fl.connect(g); g.connect(dest ?? this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02)
  }
  /** bip du volant (limiteur, confirmation) */
  beep(f = 1000) { if (!this.ready || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime
    o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.12); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.14) }
  /** radio équipe : souffle + double bip (pas de voix enregistrée : texte affiché à l'écran) */
  radio() { if (!this.ready) return; this.burst(0.25, 2000, 'bandpass', 0.05); this.beep(1500); setTimeout(() => this.beep(1900), 140) }
  private click(inside: boolean) { this.burst(0.05, 2500, 'bandpass', inside ? 0.2 : 0.1, inside ? this.master : this.engP) }
  /** choc : sourd (masse) + froissement carbone/métal (aigus) + débris */
  private crashT = 0; private lastImp = 0
  private crash(k: number, dist: number, kind: number) {
    const tyre = kind === 1, rail = kind === 2
    this.burst(tyre ? 0.45 : 0.35, tyre ? 110 : 160, 'lowpass', (tyre ? 1.0 : 0.9) * k * dist, this.wheelP)
    this.burst(rail ? 0.5 : 0.22, rail ? 1800 : 2400, rail ? 'bandpass' : 'highpass', (tyre ? 0.12 : rail ? 0.4 : 0.35) * k * dist, this.wheelP)
    for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.04, 3000 + Math.random() * 4000, 'bandpass', 0.12 * k * dist, this.wheelP), 60 + i * 70 + Math.random() * 60)
  }
}
