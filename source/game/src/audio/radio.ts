/** Radio de l'ingénieur (bibliothèque FR, /workspace/w11-shared/radio → public/radio/bank.*) :
 *  - banque unique (un seul téléchargement, décodage à la demande, cache) ;
 *  - file à priorités (3 = critique, coupe le message en cours), anti-répétition, délai minimal entre messages ;
 *  - assemblage de clips (40–80 ms de silence) : temps au tour, delta, secteur ;
 *  - filtre radio dans le jeu : passe-bande 300 Hz–3,4 kHz, légère saturation, compression, souffle ; bips ffmpeg ;
 *  - bulle HUD style Apple avec la photo (portrait générique, personne réelle non imitée) et le texte. */
type Rng = [number, number]
interface Bank { messages: Record<string, { p: number; cat: string; v: { r: Rng; t: string; ms: number }[] }>; clips: Record<string, { r: Rng; t: string; ms: number }>; sfx: Record<string, Rng> }
interface Item { parts: { r: Rng; t: string }[]; text: string; p: number; key: string }
export class Radio {
  enabled = true; volume = 0.9
  private bank: Bank | null = null; private bin: ArrayBuffer | null = null
  private ctx: BaseAudioContext | null = null; private out: GainNode | null = null; private dest: AudioNode | null = null
  private cache = new Map<string, Promise<AudioBuffer>>()
  private q: Item[] = []; private busy = false; private cur: { srcs: AudioBufferSourceNode[]; p: number } | null = null
  private lastAt = new Map<string, number>(); private lastVar = new Map<string, number>(); private lastEnd = 0
  private el: HTMLElement | null = null
  async load(base = './radio/') {
    const [j, b] = await Promise.all([fetch(base + 'bank.json').then(r => r.json()), fetch(base + 'bank.bin').then(r => r.arrayBuffer())])
    this.bank = j as Bank; this.bin = b
  }
  /** branche la radio sur le contexte audio du jeu (après le geste iOS) */
  attach(ctx: BaseAudioContext, dest: AudioNode) {
    if (this.ctx) return
    this.ctx = ctx; this.dest = dest
    // chaîne radio : passe-haut 300 Hz → passe-bas 3,4 kHz → bosse 1,8 kHz → saturation douce → compresseur → volume
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.8
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.9
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1800; pk.gain.value = 5; pk.Q.value = 1
    const sh = ctx.createWaveShaper(); const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 1.8) / Math.tanh(1.8) } sh.curve = c
    const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -20; cp.ratio.value = 4; cp.attack.value = 0.003; cp.release.value = 0.15
    this.out = ctx.createGain(); this.out.gain.value = this.volume * 1.4
    hp.connect(lp); lp.connect(pk); pk.connect(sh); sh.connect(cp); cp.connect(this.out); this.out.connect(dest)
    ;(this as unknown as { inp: AudioNode }).inp = hp
  }
  setVolume(v: number) { this.volume = v; if (this.out) this.out.gain.value = v * 1.4 }
  private buf(r: Rng): Promise<AudioBuffer> {
    const k = r[0] + ':' + r[1]; let p = this.cache.get(k)
    if (!p) { p = this.ctx!.decodeAudioData(this.bin!.slice(r[0], r[0] + r[1])); this.cache.set(k, p) }
    return p
  }
  /** message de la bibliothèque (variante au hasard, jamais la même deux fois de suite) ; cool = délai anti-répétition (s) */
  driver = 'ham'
  say(id: string, cool = 20) {
    const m = this.bank?.messages[id]; if (!m || !this.enabled) return
    const now = performance.now() / 1000; if (now - (this.lastAt.get(id) ?? -1e9) < cool) return
    this.lastAt.set(id, now)
    // la banque est enregistrée pour Lewis : avec un autre pilote, on écarte les variantes qui l'appellent par son prénom
    const ok = m.v.map((v, j) => this.driver === 'ham' || !/Lewis/.test(v.t) ? j : -1).filter(j => j >= 0); if (!ok.length) return
    let i = ok[Math.floor(Math.random() * ok.length)]; if (ok.length > 1 && i === this.lastVar.get(id)) i = ok[(ok.indexOf(i) + 1) % ok.length]
    this.lastVar.set(id, i)
    this.push({ parts: [{ r: m.v[i].r, t: m.v[i].t }], text: m.v[i].t, p: m.p, key: id })
  }
  /** suite de clips assemblés (ex. ['seg_temps_au_tour','seg_une_minute','num_41','dixieme_7','seg_secondes']) */
  sayClips(ids: string[], p = 1, key = ids.join(',')) {
    if (!this.bank || !this.enabled) return
    const parts = ids.map(i => this.bank!.clips[i]).filter(Boolean).map(c => ({ r: c.r, t: c.t }))
    if (parts.length !== ids.length) return
    this.push({ parts, text: parts.map(x => x.t.replace(/[.:]$/, '')).join(' ').replace(/ virgule /g, ',') + '.', p, key })
  }
  /** temps (s) → clips : « une minute quarante et un virgule sept secondes » */
  timeClips(t: number): string[] {
    const m = Math.floor(t / 60), s = Math.floor(t - m * 60), d = Math.min(9, Math.floor((t - m * 60 - s) * 10))
    const out: string[] = []; if (m === 1) out.push('seg_une_minute'); else if (m === 2) out.push('seg_deux_minutes')
    out.push('num_' + s, 'dixieme_' + d, 'seg_secondes'); return out
  }
  private push(it: Item) {
    if (this.q.some(x => x.key === it.key)) return
    if (it.p >= 3 && this.cur && this.cur.p < 3) { this.cur.srcs.forEach(s => { try { s.stop() } catch { /* */ } }) }
    this.q.push(it); this.q.sort((a, b) => b.p - a.p); if (this.q.length > 4) this.q.length = 4
    void this.pump()
  }
  private async pump() {
    if (this.busy || !this.ctx || !this.out || !this.bank) return
    const it = this.q.shift(); if (!it) return
    this.busy = true
    try {
      const ctx = this.ctx, sfx = this.bank.sfx
      const [op, cl, hs, ...bs] = await Promise.all([this.buf(sfx.open), this.buf(sfx.close), this.buf(sfx.hiss), ...it.parts.map(p => this.buf(p.r))])
      const inp = (this as unknown as { inp: AudioNode }).inp
      let t = Math.max(ctx.currentTime + 0.05, this.lastEnd + 0.6)
      const srcs: AudioBufferSourceNode[] = [], play = (b: AudioBuffer, at: number, to: AudioNode, g = 1) => { const s = ctx.createBufferSource(); s.buffer = b; const gn = ctx.createGain(); gn.gain.value = g; s.connect(gn); gn.connect(to); s.start(at); srcs.push(s); return s }
      play(op, t, this.out, 0.55); t += op.duration * 0.85
      const t0 = t
      for (let i = 0; i < bs.length; i++) { play(bs[i], t, inp); t += bs[i].duration + (i < bs.length - 1 ? 0.04 + Math.random() * 0.04 : 0) } // 40–80 ms entre clips
      const hiss = play(hs, t0 - 0.05, this.out, 0.5); hiss.loop = true; hiss.stop(t + 0.1)
      play(cl, t + 0.05, this.out, 0.55); t += 0.05 + cl.duration
      this.cur = { srcs, p: it.p }; this.lastEnd = t
      this.bubble(it.text, (t0 - ctx.currentTime) * 1000, (t - ctx.currentTime) * 1000)
      await new Promise(r => { const last = srcs[srcs.length - 1]; last.onended = r; setTimeout(r, (t - ctx.currentTime) * 1000 + 400) })
    } catch (e) { console.warn('radio', e) }
    this.cur = null; this.busy = false
    if (this.q.length) void this.pump()
  }
  /** bulle radio (style Apple) avec photo de l'ingénieur, affichée pendant le message */
  private bubble(text: string, inMs: number, endMs: number) {
    if (!this.el) {
      this.el = document.createElement('div'); this.el.className = 'radiob'
      this.el.innerHTML = '<img src="./radio/engineer.webp" alt=""><div><b>Ingénieur · Radio</b><span></span></div><i class="rwave"></i>'
      document.body.appendChild(this.el)
    }
    const el = this.el
    setTimeout(() => { el.querySelector('span')!.textContent = text; el.classList.add('on') }, Math.max(0, inMs - 150))
    clearTimeout((el as unknown as { _t: number })._t); (el as unknown as { _t: number })._t = window.setTimeout(() => el.classList.remove('on'), endMs + 600)
  }
}
