/** Voie des stands : chemin praticable (pitlane.json) ou spline `pitlane_path` livrée par Ty.
 *  Lignes : entrée, début / fin des 80 km/h, sortie. Deux voies : rapide (sur le chemin) et de travail
 *  (décalée vers les garages). Sans ancres, les lignes retombent sur le fichier de piste. */
export interface PitlaneData { x: number[]; z: number[]; s: number[]; d: number[]; length: number }
export interface XZ { x: number; z: number }
/** Noms tels que Ty les pose dans le GLB. Tous facultatifs. */
export interface PitAnchors {
  pit_entry?: XZ
  pit_speed_start?: XZ
  pit_speed_end?: XZ
  pit_exit?: XZ
  pit_exit_light?: XZ
  pitlane_path?: { x: number[]; z: number[] }
}
export type PitLaneName = 'fast' | 'work' | 'off'
export interface PitProbe { i: number; dist: number; p: number; lat: number; lane: PitLaneName }
export class Pitlane {
  x: Float32Array; z: Float32Array; d: Float32Array; s: Int32Array; n: number
  /** distance cumulée le long du chemin (m) */
  cum: Float32Array
  /** indices : ligne d'entrée, début 80, fin 80, ligne de sortie */
  iEntry: number; iIn: number; iOut: number; iExit: number
  /** +1 : la voie de travail est à gauche du sens de marche */
  workSign = 1
  light: XZ = { x: 0, z: 0 }
  anchored = false
  private last = 0
  constructor(p: PitlaneData, opts: { limitFromS?: number; limitToS?: number; wall?: number } = {}) {
    this.x = Float32Array.from(p.x); this.z = Float32Array.from(p.z); this.d = Float32Array.from(p.d); this.s = Int32Array.from(p.s); this.n = p.x.length
    this.cum = cumOf(this.x, this.z)
    // par défaut : premier point derrière le muret (|d| > wall) → début de la limitation ; dernier avant de rejoindre la piste
    const wall = opts.wall ?? 10.5
    let a = 0; while (a < this.n && Math.abs(this.d[a]) < wall) a++
    let b = this.n - 1; while (b > a && Math.abs(this.d[b]) < wall) b--
    if (opts.limitFromS !== undefined) { let k = 0; while (k < this.n - 1 && !(this.s[k] >= opts.limitFromS && this.s[k] < opts.limitFromS + 300 && Math.abs(this.d[k]) >= wall)) k++; a = k }
    if (opts.limitToS !== undefined) { let k = a; while (k < b && !(this.s[k] >= opts.limitToS && this.s[k] < opts.limitToS + 300)) k++; b = k }
    this.iEntry = 0; this.iIn = a; this.iOut = b; this.iExit = this.n - 1
    this.light = { x: this.x[this.iExit], z: this.z[this.iExit] }
    this.workSign = Math.sign(this.d[Math.min(this.n - 1, (a + b) >> 1)] || 1) || 1
  }
  /** Remplace les lignes (et le chemin, si `pitlane_path` est là). `locate` donne s/d piste d'un point monde. */
  applyAnchors(a: PitAnchors, locate?: (x: number, z: number) => { s: number; d: number }) {
    if (a.pitlane_path && a.pitlane_path.x.length > 4) {
      const path = resample(a.pitlane_path.x, a.pitlane_path.z, 2)
      const s = new Int32Array(path.x.length), d = new Float32Array(path.x.length)
      if (locate) for (let i = 0; i < path.x.length; i++) { const q = locate(path.x[i], path.z[i]); s[i] = Math.round(q.s); d[i] = q.d }
      this.x = path.x; this.z = path.z; this.s = s; this.d = d; this.n = path.x.length
      this.cum = cumOf(this.x, this.z)
      this.iEntry = 0; this.iIn = Math.min(2, this.n - 1); this.iOut = Math.max(this.iIn, this.n - 3); this.iExit = this.n - 1
    }
    const snap = (p?: XZ) => p ? this.indexNear(p.x, p.z) : -1
    const e = snap(a.pit_entry), a0 = snap(a.pit_speed_start), b0 = snap(a.pit_speed_end), x = snap(a.pit_exit)
    if (e >= 0) this.iEntry = e
    if (a0 >= 0) this.iIn = a0
    if (b0 >= 0) this.iOut = Math.max(this.iIn, b0)
    if (x >= 0) this.iExit = x
    if (a.pit_exit_light) this.light = { x: a.pit_exit_light.x, z: a.pit_exit_light.z }
    else this.light = { x: this.x[this.iExit], z: this.z[this.iExit] }
    this.anchored = true
    this.workSign = Math.sign(this.d[Math.min(this.n - 1, (this.iIn + this.iOut) >> 1)] || this.workSign) || this.workSign
  }
  /** sondage : abscisse le long du chemin, écart latéral signé (gauche > 0), voie */
  probe(x: number, z: number): PitProbe {
    const i = this.nearest(x, z).i
    const i1 = Math.min(this.n - 1, i + 1)
    const tx = this.x[i1] - this.x[i], tz = this.z[i1] - this.z[i]
    const tn = Math.hypot(tx, tz) || 1
    const dx = x - this.x[i], dz = z - this.z[i]
    const along = (dx * tx + dz * tz) / tn
    const lat = (tx * dz - tz * dx) / tn
    const dist = Math.hypot(dx, dz)
    const p = Math.max(0, Math.min(this.cum[this.n - 1], this.cum[i] + along))
    let lane: PitLaneName = 'off'
    if (dist < 7) lane = lat * this.workSign > 1.35 ? 'work' : 'fast'
    return { i, dist, p, lat, lane }
  }
  inSpeedZone(x: number, z: number) {
    const q = this.probe(x, z)
    return q.dist < 6 && q.p >= this.cum[this.iIn] - 1 && q.p <= this.cum[this.iOut] + 1
  }
  /** point le plus proche (recherche locale autour du dernier, puis globale si loin) */
  nearest(x: number, z: number) {
    let best = -1, bd = Infinity
    const scan = (i0: number, i1: number) => { for (let i = Math.max(0, i0); i < Math.min(this.n, i1); i++) { const dx = x - this.x[i], dz = z - this.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i } } }
    scan(this.last - 30, this.last + 30)
    if (bd > 36) scan(0, this.n)
    this.last = best
    return { i: best, dist: Math.sqrt(bd) }
  }
  /** la voiture est-elle dans la zone limitée (à moins de 6 m du chemin, entre les lignes) ? */
  inLimitZone(x: number, z: number) { const r = this.nearest(x, z); return r.dist < 6 && r.i >= this.iIn && r.i <= this.iOut }
  private indexNear(x: number, z: number) {
    let best = 0, bd = Infinity
    for (let i = 0; i < this.n; i++) { const d = (x - this.x[i]) ** 2 + (z - this.z[i]) ** 2; if (d < bd) { bd = d; best = i } }
    return best
  }
}
function cumOf(x: ArrayLike<number>, z: ArrayLike<number>) {
  const c = new Float32Array(x.length)
  for (let i = 1; i < x.length; i++) c[i] = c[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1])
  return c
}
/** rééchantillonne une spline en pas d'environ `step` mètres, en gardant les extrémités */
function resample(x: number[], z: number[], step: number) {
  const c = cumOf(x, z), L = c[c.length - 1]
  const n = Math.max(2, Math.round(L / step) + 1)
  const ox = new Float32Array(n), oz = new Float32Array(n)
  let j = 0
  for (let i = 0; i < n; i++) {
    const p = i === n - 1 ? L : i * L / (n - 1)
    while (j < c.length - 2 && c[j + 1] < p) j++
    const span = Math.max(1e-4, c[j + 1] - c[j]), f = Math.max(0, Math.min(1, (p - c[j]) / span))
    ox[i] = x[j] + (x[j + 1] - x[j]) * f
    oz[i] = z[j] + (z[j + 1] - z[j]) * f
  }
  return { x: ox, z: oz }
}
