/** Barrières RÉELLES de Spa : contours 2D (vue de dessus, glTF x/z) des rails, murs béton, murs de pneus, grillages
 *  et objets de bord de piste extraits de la géométrie rendue (tools/coll/*.py, raster 0,2 m → segments ≈ 0,12 m
 *  de tolérance) + hachage spatial 8 m. Chaque segment porte un type → frottement / restitution / absorption. */
export const BARRIER_KIND = {
  1: { name: 'pneus', e: 0.1, mu: 0.75, absorb: 0.55 },   // mur de pneus : très absorbant
  2: { name: 'rail', e: 0.28, mu: 0.32, absorb: 0.2 },    // glissière métallique (Armco) : la voiture glisse le long
  3: { name: 'béton', e: 0.2, mu: 0.45, absorb: 0.1 },    // mur béton / jersey : dur
  4: { name: 'objet', e: 0.2, mu: 0.5, absorb: 0.25 },    // poteaux, panneaux, postes de commissaires…
} as Record<number, { name: string; e: number; mu: number; absorb: number }>
export class Barriers {
  n: number; S: Float32Array; K: Uint8Array; keys: Uint32Array; off: Uint32Array; idx: Uint32Array
  x0: number; z0: number; C: number; gw: number
  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf); const n = dv.getUint32(0, true), nc = dv.getUint32(4, true)
    this.n = n; this.x0 = dv.getFloat32(8, true); this.z0 = dv.getFloat32(12, true); this.C = dv.getFloat32(16, true); this.gw = dv.getUint32(20, true)
    let o = 28
    this.S = new Float32Array(buf, o, n * 4); o += n * 16
    this.K = new Uint8Array(buf, o, n); o += n + ((4 - n % 4) % 4)
    this.keys = new Uint32Array(buf, o, nc); o += nc * 4
    this.off = new Uint32Array(buf, o, nc + 1); o += (nc + 1) * 4
    this.idx = new Uint32Array(buf, o, this.off[nc])
  }
  /** indices [a, b) dans idx des segments proches du point (x, z) (cellule de 8 m, marge 1,6 m incluse) */
  cell(x: number, z: number): [number, number] {
    const gx = Math.floor((x - this.x0) / this.C), gy = Math.floor((z - this.z0) / this.C)
    if (gx < 0 || gy < 0) return [0, 0]
    const key = gy * this.gw + gx, k = this.keys
    let lo = 0, hi = k.length - 1
    while (lo <= hi) { const m = (lo + hi) >> 1, v = k[m]; if (v === key) return [this.off[m], this.off[m + 1]]; if (v < key) lo = m + 1; else hi = m - 1 }
    return [0, 0]
  }
}
