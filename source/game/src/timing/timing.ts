/** Chronométrage par portes (ligne de départ/arrivée + 2 séparations de secteurs), robuste : points de passage
 *  obligatoires répartis sur le tour (pas de validation par simple distance, ni en marche arrière). */
export interface LapRecord { time: number; sectors: number[]; valid: boolean }
export class Timing {
  length: number; startS: number; gates: number[]; checkpoints: number[]
  lapStart = -1; sectorStart = 0; sector = 0; sectors: number[] = []
  passed: boolean[]; lastS = 0; laps: LapRecord[] = []
  best: LapRecord | null = null; bestSectors: number[] = [Infinity, Infinity, Infinity]
  current = 0; valid = true; lastLap: LapRecord | null = null; events: string[] = []
  /** temps de passage tous les 10 m (tour en cours / meilleur tour valide) → delta en direct sur l'écran du volant */
  trace: Float32Array; bestTrace: Float32Array | null = null; delta = NaN
  constructor(length: number, startS = 1, s1 = 2050, s2 = 5000) {
    this.length = length; this.startS = startS; this.gates = [s1, s2]
    this.checkpoints = Array.from({ length: 10 }, (_, k) => (startS + (k + 0.5) * length / 10) % length)
    this.passed = this.checkpoints.map(() => false)
    this.trace = new Float32Array(Math.ceil(length / 10) + 1).fill(NaN)
  }
  private rel(s: number) { return ((s - this.startS) % this.length + this.length) % this.length }
  /** Appelé à chaque pas physique avec l'abscisse s courante et le temps. */
  update(s: number, t: number, dt: number) {
    this.events.length = 0
    const a = this.rel(this.lastS), b = this.rel(s)
    this.lastS = s
    if (this.lapStart >= 0) this.current = t - this.lapStart
    // pas trop grand = téléportation (reset) → ignorer
    let delta = b - a
    if (delta < -this.length / 2) delta += this.length
    if (delta > this.length / 2) delta -= this.length
    if (Math.abs(delta) > 30) return
    if (delta <= 0) return
    // franchissement de la ligne (wrap)
    if (b < a) {
      const frac = (this.length - a) / Math.max(1e-6, delta)
      const tc = t - dt + dt * Math.min(1, Math.max(0, frac))
      if (this.lapStart >= 0 && this.passed.every(p => p)) {
        const time = tc - this.lapStart
        const sec3 = tc - this.sectorStart
        const sectors = [...this.sectors, sec3]
        const rec: LapRecord = { time, sectors, valid: this.valid }
        this.laps.push(rec); this.lastLap = rec
        if (rec.valid && (!this.best || time < this.best.time)) { this.best = rec; this.events.push('best'); this.bestTrace = this.trace.slice() }
        if (rec.valid) sectors.forEach((x, k) => { if (x < this.bestSectors[k]) this.bestSectors[k] = x })
        this.events.push('lap')
      } else this.events.push('start')
      this.lapStart = tc; this.sectorStart = tc; this.sector = 0; this.sectors = []; this.valid = true
      this.passed = this.passed.map(() => false); this.current = t - tc
      this.trace.fill(NaN); this.delta = NaN
      return
    }
    if (this.lapStart >= 0) {
      const bin = Math.floor(b / 10); if (isNaN(this.trace[bin])) this.trace[bin] = t - this.lapStart
      const bt = this.bestTrace?.[bin]; if (bt !== undefined && !isNaN(bt)) this.delta = (t - this.lapStart) - bt
    }
    for (let k = 0; k < this.checkpoints.length; k++) { const c = this.rel(this.checkpoints[k]); if (a < c && b >= c) this.passed[k] = true }
    for (let g = 0; g < 2; g++) {
      const gs = this.rel(this.gates[g])
      if (this.lapStart >= 0 && this.sector === g && a < gs && b >= gs) {
        const tc = t - dt + dt * (gs - a) / delta
        this.sectors.push(tc - this.sectorStart); this.sectorStart = tc; this.sector = g + 1; this.events.push('sector' + g)
      }
    }
  }
  invalidate() { if (this.valid) { this.valid = false; this.events.push('invalid') } }
}
export function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return '-:--.---'
  const m = Math.floor(t / 60), s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
