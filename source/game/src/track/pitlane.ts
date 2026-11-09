/** Voie des stands : chemin praticable calculé sur la géométrie réelle (tools/coll/pitpath.py → track/pitlane.json).
 *  Zone limitée à 80 km/h entre la ligne d'entrée et la ligne de sortie ; détection de la voiture dans la voie.
 *  Générique : un fichier par circuit (mode course multi-circuits). */
export interface PitlaneData { x: number[]; z: number[]; s: number[]; d: number[]; length: number }
export class Pitlane {
  x: Float32Array; z: Float32Array; d: Float32Array; s: Int32Array; n: number
  /** indices du chemin où commence / finit la limitation de vitesse */
  iIn: number; iOut: number
  private last = 0
  constructor(p: PitlaneData, opts: { limitFromS?: number; limitToS?: number; wall?: number } = {}) {
    this.x = Float32Array.from(p.x); this.z = Float32Array.from(p.z); this.d = Float32Array.from(p.d); this.s = Int32Array.from(p.s); this.n = p.x.length
    // par défaut : premier point derrière le muret (|d| > wall) → ligne d'entrée ; dernier point avant de rejoindre la piste
    const wall = opts.wall ?? 10.5
    let a = 0; while (a < this.n && Math.abs(this.d[a]) < wall) a++
    let b = this.n - 1; while (b > a && Math.abs(this.d[b]) < wall) b--
    if (opts.limitFromS !== undefined) { let k = 0; while (k < this.n - 1 && !(this.s[k] >= opts.limitFromS && this.s[k] < opts.limitFromS + 300 && Math.abs(this.d[k]) >= wall)) k++; a = k }
    if (opts.limitToS !== undefined) { let k = a; while (k < b && !(this.s[k] >= opts.limitToS && this.s[k] < opts.limitToS + 300)) k++; b = k }
    this.iIn = a; this.iOut = b
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
}
