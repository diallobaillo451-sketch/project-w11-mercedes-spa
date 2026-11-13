/** Surface physique : grille (s, d) précalculée dans Blender (t9_surface.py). Coordonnées glTF (Y haut). */
export interface SurfaceMeta {
  N: number; ND: number; D0: number; DSTEP: number; ds: number; length: number
  /** limite de décalage de la ligne de course, si la piste l’exige (m) */
  lineOffsetMax?: number
  cx: number[]; cy: number[]; cz: number[]; wl: number[]; wr: number[]; wallL: number[]; wallR: number[]
}
export interface SurfaceSample { h: number; nx: number; ny: number; nz: number; type: number; s: number; d: number; i: number }
export interface Surface {
  length: number
  sample(x: number, z: number, hint: number, out: SurfaceSample): SurfaceSample
  walls(i: number, s: number): [number, number]
  edges(i: number, s: number): [number, number]
  centre(s: number): { x: number; y: number; z: number; tx: number; tz: number; i: number }
}

export class TrackSurface implements Surface {
  N: number; ND: number; D0: number; DS: number; ds: number; length: number; lineOffsetMax: number
  cx: Float64Array; cy: Float64Array; cz: Float64Array; tx: Float64Array; tz: Float64Array
  wl: Float32Array; wr: Float32Array; WL: Float32Array; WR: Float32Array
  grid: Uint16Array; H: Float32Array; T: Uint8Array
  /** largeur exploitable par la trajectoire (asphalte + vibreurs contigus depuis le centre, bornée par les murs) */
  wlR: Float32Array; wrR: Float32Array
  /** barrières réelles (facultatif) : la voiture les reçoit à sa création */
  barriers: import('./barriers.ts').Barriers | null = null
  constructor(meta: SurfaceMeta, grid: Uint16Array) {
    this.N = meta.N; this.ND = meta.ND; this.D0 = meta.D0; this.DS = meta.DSTEP; this.ds = meta.ds; this.length = meta.length
    this.lineOffsetMax = Number.isFinite(meta.lineOffsetMax) ? Math.max(0.3, meta.lineOffsetMax!) : 9
    this.cx = Float64Array.from(meta.cx); this.cy = Float64Array.from(meta.cy); this.cz = Float64Array.from(meta.cz)
    this.wl = Float32Array.from(meta.wl); this.wr = Float32Array.from(meta.wr)
    this.WL = Float32Array.from(meta.wallL); this.WR = Float32Array.from(meta.wallR)
    for (let i = 0; i < this.wl.length; i++) { this.wl[i] = Math.min(this.wl[i], Math.max(1.2, this.WL[i] - 0.3)); this.wr[i] = Math.min(this.wr[i], Math.max(1.2, this.WR[i] - 0.3)) }
    this.grid = grid
    // hauteurs lissées (quantification 1 cm du bake → micro-marches qui excitent les amortisseurs)
    const N0 = meta.N, ND0 = meta.ND, raw = new Float32Array(N0 * ND0)
    this.T = new Uint8Array(N0 * ND0)
    for (let k = 0; k < raw.length; k++) { raw[k] = ((grid[k] >> 3) - 4096) * 0.01; this.T[k] = grid[k] & 7 }
    const tmp = new Float32Array(raw.length), W = [1, 2, 3, 4, 3, 2, 1]
    for (let i = 0; i < N0; i++) for (let j = 0; j < ND0; j++) {
      const h0 = raw[i * ND0 + j]; let s = 0, ws = 0
      for (let k = -3; k <= 3; k++) { const h = raw[((i + k + N0) % N0) * ND0 + j]; if (Math.abs(h - h0) < 0.06) { s += h * W[k + 3]; ws += W[k + 3] } }
      tmp[i * ND0 + j] = s / ws
    }
    this.H = new Float32Array(raw.length)
    for (let i = 0; i < N0; i++) for (let j = 0; j < ND0; j++) {
      const h0 = tmp[i * ND0 + j]; let s = h0 * 2, ws = 2
      for (const k of [-1, 1]) { const jj = j + k; if (jj < 0 || jj >= ND0) continue; const h = tmp[i * ND0 + jj]; if (Math.abs(h - h0) < 0.04) { s += h; ws++ } }
      this.H[i * ND0 + j] = s / ws
    }
    this.wlR = new Float32Array(this.N); this.wrR = new Float32Array(this.N)
    const jc = (ND0 - 1) >> 1
    for (let i = 0; i < this.N; i++) for (const sg of [-1, 1]) {
      let j = jc
      let hard = false
      while (j + sg >= 0 && j + sg < ND0) { const t = this.T[i * ND0 + j + sg]; if (t !== 1 && t !== 2 && t !== 3) { hard = t === 7 || t === 0; break } j += sg }
      const ext = Math.abs(j - jc) * this.DS - (hard ? 0.6 : 0), base = sg < 0 ? this.wl[i] : this.wr[i], wall = sg < 0 ? this.WL[i] : this.WR[i]
      const v = hard ? Math.min(ext, wall - 0.4) : Math.max(base, Math.min(ext, base + 1.6, wall - 0.4))
      if (sg < 0) this.wlR[i] = v; else this.wrR[i] = v
    }
    // les élargissements courts (sorties de stand, dégagements, voies parallèles) ne sont pas de la piste :
    // minimum glissant ±20 m puis plafond à 8 m par côté
    for (const A of [this.wlR, this.wrR]) {
      const src = A.slice(), n = this.N
      for (let i = 0; i < n; i++) { let m = 1e9; for (let k = -20; k <= 20; k++) m = Math.min(m, src[(i + k + n) % n]); A[i] = Math.min(m, 8) }
    }
    const N = this.N; this.tx = new Float64Array(N); this.tz = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      const a = (i + 2) % N, b = (i - 2 + N) % N
      const dx = this.cx[a] - this.cx[b], dz = this.cz[a] - this.cz[b], n = Math.hypot(dx, dz) || 1
      this.tx[i] = dx / n; this.tz[i] = dz / n
    }
  }
  /** Projection locale (recherche autour de l'indice « hint »). */
  project(x: number, z: number, hint: number): { i: number; f: number } {
    const N = this.N
    let best = -1, bd = Infinity
    const span = hint < 0 ? N : 12
    const start = hint < 0 ? 0 : hint - span
    const step = hint < 0 ? 4 : 1
    for (let k = start; k <= (hint < 0 ? N - 1 : hint + span); k += step) {
      const i = ((k % N) + N) % N
      const dx = x - this.cx[i], dz = z - this.cz[i], d = dx * dx + dz * dz
      if (d < bd) { bd = d; best = i }
    }
    if (hint < 0) return this.project(x, z, best)
    // loin de la ligne centrale (voie des stands, route de sortie autour de La Source) : la recherche locale peut rester
    // sur un minimum local (épingle) → recherche globale grossière puis locale
    if (bd > 625 && span === 12) {
      let g = -1, gd = Infinity
      for (let i = 0; i < N; i += 3) { const dx = x - this.cx[i], dz = z - this.cz[i], d = dx * dx + dz * dz; if (d < gd) { gd = d; g = i } }
      if (gd < bd - 4) return this.project(x, z, g)
    }
    // projection sur les segments voisins
    const i0 = best, im = (i0 - 1 + N) % N, ip = (i0 + 1) % N
    const proj = (a: number, b: number) => {
      const ex = this.cx[b] - this.cx[a], ez = this.cz[b] - this.cz[a]
      const L2 = ex * ex + ez * ez || 1
      let t = ((x - this.cx[a]) * ex + (z - this.cz[a]) * ez) / L2
      t = Math.max(0, Math.min(1, t))
      const px = this.cx[a] + ex * t - x, pz = this.cz[a] + ez * t - z
      return { t, d2: px * px + pz * pz }
    }
    const A = proj(i0, ip), B = proj(im, i0)
    if (A.d2 <= B.d2) return { i: i0, f: A.t }
    return { i: im, f: B.t }
  }
  cell(i: number, j: number): number { return this.grid[i * this.ND + j] }
  sample(x: number, z: number, hint: number, out: SurfaceSample): SurfaceSample {
    const { i, f } = this.project(x, z, hint)
    const N = this.N, i1 = (i + 1) % N
    const cx = this.cx[i] + (this.cx[i1] - this.cx[i]) * f
    const cz = this.cz[i] + (this.cz[i1] - this.cz[i]) * f
    const cy = this.cy[i] + (this.cy[i1] - this.cy[i]) * f
    const tx = this.tx[i] + (this.tx[i1] - this.tx[i]) * f, tz = this.tz[i] + (this.tz[i1] - this.tz[i]) * f
    const tn = Math.hypot(tx, tz) || 1, Tx = tx / tn, Tz = tz / tn
    const Rx = -Tz, Rz = Tx // droite (glTF, Y haut)
    const d = (x - cx) * Rx + (z - cz) * Rz
    const u = (d - this.D0) / this.DS
    const ND = this.ND
    let j = Math.floor(u); let g = u - j
    if (j < 0) { j = 0; g = 0 } else if (j >= ND - 1) { j = ND - 2; g = 1 }
    const Hh = this.H, b0 = i * ND + j, b1 = i1 * ND + j
    const h00 = Hh[b0], h01 = Hh[b0 + 1], h10 = Hh[b1], h11 = Hh[b1 + 1]
    const h0 = h00 + (h01 - h00) * g, h1 = h10 + (h11 - h10) * g
    const rel = h0 + (h1 - h0) * f
    const cy1 = this.cy[i1] - this.cy[i]
    const dhds = (h1 - h0 + cy1) / this.ds
    const dhdd = ((h01 - h00) * (1 - f) + (h11 - h10) * f) / this.DS
    // normale = normalize(-dhds·T - dhdd·R + Y)
    let nx = -dhds * Tx - dhdd * Rx, ny = 1, nz = -dhds * Tz - dhdd * Rz
    const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn
    out.h = cy + rel; out.nx = nx; out.ny = ny; out.nz = nz
    out.type = this.T[(f < 0.5 ? b0 : b1) + (g < 0.5 ? 0 : 1)]
    out.s = (i + f) * this.ds; out.d = d; out.i = i
    return out
  }
  walls(i: number, _s: number): [number, number] { return [this.WL[i], this.WR[i]] }
  edges(i: number, _s: number): [number, number] { return [this.wl[i], this.wr[i]] }
  centre(s: number) {
    const N = this.N; let u = s / this.ds; u = ((u % N) + N) % N
    const i = Math.floor(u), f = u - i, i1 = (i + 1) % N
    return { x: this.cx[i] + (this.cx[i1] - this.cx[i]) * f, y: this.cy[i] + (this.cy[i1] - this.cy[i]) * f,
      z: this.cz[i] + (this.cz[i1] - this.cz[i]) * f, tx: this.tx[i], tz: this.tz[i], i }
  }
}

/** Plan infini (tests). */
export class FlatSurface implements Surface {
  length = 1e9
  type: number
  constructor(type = 1) { this.type = type }
  sample(_x: number, z: number, _h: number, out: SurfaceSample) {
    out.h = 0; out.nx = 0; out.ny = 1; out.nz = 0; out.type = this.type; out.s = -z; out.d = _x; out.i = 0; return out
  }
  walls(): [number, number] { return [1e9, 1e9] }
  edges(): [number, number] { return [1e9, 1e9] }
  centre(s: number) { return { x: 0, y: 0, z: -s, tx: 0, tz: -1, i: 0 } }
}
export const newSample = (): SurfaceSample => ({ h: 0, nx: 0, ny: 1, nz: 0, type: 1, s: 0, d: 0, i: -1 })
