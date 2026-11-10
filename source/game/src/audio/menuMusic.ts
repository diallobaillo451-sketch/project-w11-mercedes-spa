/** Musique de menu. Cinq morceaux AAC (~128 kb/s, 48 kHz) lus en flux par deux
 *  éléments audio : un seul est décodé à la fois, le suivant est préchargé, jamais les cinq.
 *  Rien n'est téléchargé avant le premier geste (règle d'autoplay iOS). Fondu égal-puissance
 *  entre morceaux, fondu d'entrée / sortie quand on quitte ou retrouve les menus. */
const IDS = [1, 2, 3, 4, 5]
const XFADE = 5
const url = (id: number) => `./audio/menu/menu_${id}.m4a`

export class MenuMusic {
  private els: HTMLAudioElement[]
  private cur = 0
  /** file : [en cours, suivant, …] */
  private queue: number[] = []
  private unlocked = false
  private inMenu = false
  private enabled = true
  private volume = 0.7
  private env = 0
  private bridging = false
  private alive = false

  constructor() {
    this.els = [0, 1].map(() => {
      const a = new Audio()
      a.preload = 'none'
      a.loop = false
      a.addEventListener('error', () => { if (a === this.els[this.cur]) this.skipBroken() })
      return a
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.els.forEach(e => e.pause())
      else if (this.inMenu && this.enabled) this.resume()
    })
  }

  setInMenu(on: boolean) { this.inMenu = on; if (on) this.resume() }
  setEnabled(on: boolean) { this.enabled = on; if (on) this.resume() }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)) }

  /** Dans le geste utilisateur : débloque les deux lecteurs et lance le premier morceau. */
  arm() {
    if (this.unlocked) { this.resume(); return }
    this.unlocked = true
    this.queue = shuffle(IDS)
    const a = this.els[0], b = this.els[1]
    this.point(a, this.queue[0])
    this.point(b, this.queue[1])
    a.volume = 0
    b.muted = true
    b.volume = 0
    // les deux play() partent dans le geste, sinon iOS refuse le second lecteur plus tard
    void b.play().then(() => { b.pause(); try { b.currentTime = 0 } catch { /* métadonnées pas encore là */ } b.muted = false }).catch(() => { b.muted = false })
    this.cur = 0
    this.bridging = false
    this.alive = true
    void a.play().catch(() => { this.alive = false })
  }

  update(dt: number) {
    const target = this.inMenu && this.enabled && this.unlocked ? 1 : 0
    this.env += (target - this.env) * (1 - Math.exp(-Math.max(0.001, dt) / 0.65))
    if (!this.alive) return
    const base = this.volume * this.env
    const a = this.els[this.cur]
    const b = this.els[1 - this.cur]
    if (target === 0 && this.env < 0.015) {
      if (!a.paused) a.pause()
      if (!b.paused) b.pause()
      a.volume = 0
      b.volume = 0
      return
    }
    if (a.paused && target > 0) void a.play().catch(() => {})
    const dur = a.duration
    const left = dur - a.currentTime
    if (!this.bridging && Number.isFinite(dur) && dur > XFADE + 2 && left <= XFADE) this.beginBridge(b)
    if (this.bridging && Number.isFinite(left)) {
      const t = Math.max(0, Math.min(1, 1 - left / XFADE))
      a.volume = base * Math.cos(t * Math.PI / 2)
      b.volume = base * Math.sin(t * Math.PI / 2)
      if (t >= 0.995 || a.ended) this.commit(a)
    } else {
      a.volume = base
      if (!this.bridging) b.volume = 0
    }
    if (a.ended && !this.bridging) this.beginBridge(b)
  }

  private beginBridge(b: HTMLAudioElement) {
    this.ensureAhead()
    const next = this.queue[1]
    if (next == null) return
    this.bridging = true
    if (b.dataset.track !== String(next)) this.point(b, next)
    b.volume = 0
    void b.play().catch(() => { this.bridging = false })
  }

  private commit(finished: HTMLAudioElement) {
    finished.pause()
    finished.removeAttribute('src')
    finished.load()
    delete finished.dataset.track
    this.queue.shift()
    this.cur = 1 - this.cur
    this.bridging = false
    this.ensureAhead()
    const idle = this.els[1 - this.cur]
    const nxt = this.queue[1]
    if (nxt != null) { this.point(idle, nxt); idle.pause(); try { idle.currentTime = 0 } catch { /* */ } }
  }

  private skipBroken() {
    const a = this.els[this.cur]
    a.pause()
    a.removeAttribute('src')
    a.load()
    this.queue.shift()
    this.ensureAhead()
    const id = this.queue[0]
    if (id == null) return
    this.point(a, id)
    this.bridging = false
    if (this.inMenu && this.enabled) void a.play().catch(() => {})
  }

  private ensureAhead() {
    if (this.queue.length >= 2) return
    const avoid = this.queue[0]
    for (const n of shuffle(IDS, avoid)) if (n !== avoid && !this.queue.includes(n)) this.queue.push(n)
    if (this.queue.length < 2) this.queue.push(...shuffle(IDS, avoid))
  }

  private resume() {
    if (!this.unlocked || !this.alive || !this.inMenu || !this.enabled) return
    const a = this.els[this.cur]
    if (a.paused && a.src) void a.play().catch(() => {})
    if (this.bridging) {
      const b = this.els[1 - this.cur]
      if (b.paused && b.src) void b.play().catch(() => {})
    }
  }

  private point(el: HTMLAudioElement, id: number) {
    if (el.dataset.track === String(id) && el.src) return
    el.dataset.track = String(id)
    el.preload = 'auto'
    el.src = url(id)
  }
}

function shuffle(ids: number[], avoid?: number): number[] {
  const a = ids.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  if (avoid != null && a[0] === avoid && a.length > 1) { const t = a[0]; a[0] = a[1]; a[1] = t }
  return a
}
