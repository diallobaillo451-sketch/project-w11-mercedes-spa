/** Trajectoire de course (courbure minimale approchée par lissage contraint) + profil de vitesse quasi-statique. */
import type { TrackSurface } from './surface.ts'
import { W11 } from '../physics/params.ts'
import { icePower } from '../physics/powertrain.ts'

export interface RacingLine { x: Float64Array; z: Float64Array; e: Float64Array; k: Float64Array; v: Float64Array; N: number; ds: number }

const O2MIN = Number((globalThis as any).process?.env?.O2MIN ?? 99)
const MU_M = 2.35, MU_A = 1.75
export function buildRacingLine(t: TrackSurface, iters = 1600, mu = 0.92): RacingLine {
  const N = t.N
  const lim = (arr: Float32Array) => {
    const o = new Float64Array(N)
    for (let i = 0; i < N; i++) { let m = 99; for (let k = -4; k <= 4; k++) m = Math.min(m, arr[(i + k + N) % N]); o[i] = Math.max(0.3, Math.min(m, 9) - 0.95) }
    return o
  }
  const L = lim(t.wlR ?? t.wl), Rr = lim(t.wrR ?? t.wr)
  const e = new Float64Array(N)
  const rx = new Float64Array(N), rz = new Float64Array(N)
  for (let i = 0; i < N; i++) { rx[i] = -t.tz[i]; rz[i] = t.tx[i] }
  const x = new Float64Array(N), z = new Float64Array(N)
  const upd = () => { for (let i = 0; i < N; i++) { x[i] = t.cx[i] + rx[i] * e[i]; z[i] = t.cz[i] + rz[i] * e[i] } }
  upd()
  // multi-résolution : lissage de courbure sur des pas de 24 m → 1 m (convergence rapide sur des virages de 100–300 m)
  void iters
  for (const st of [24, 12, 6, 3, 1]) {
    const M = Math.floor(N / st)
    const its = st === 1 ? 300 : 500
    for (let it = 0; it < its; it++) {
      for (let q = 0; q < M; q++) {
        const i = q * st
        const a = ((q - 1 + M) % M) * st, b = ((q + 1) % M) * st, a2 = ((q - 2 + M) % M) * st, b2 = ((q + 2) % M) * st
        const o2 = st >= O2MIN
        const tx = o2 ? (x[a] + x[b]) * 0.5 : (-x[a2] + 4 * x[a] + 4 * x[b] - x[b2]) / 6, tz = o2 ? (z[a] + z[b]) * 0.5 : (-z[a2] + 4 * z[a] + 4 * z[b] - z[b2]) / 6
        let ne = e[i] + ((tx - x[i]) * rx[i] + (tz - z[i]) * rz[i]) * 0.9
        ne = Math.max(-L[i], Math.min(Rr[i], ne))
        e[i] = ne; x[i] = t.cx[i] + rx[i] * ne; z[i] = t.cz[i] + rz[i] * ne
      }
    }
    if (st > 1) { // interpolation linéaire des nœuds intermédiaires
      for (let q = 0; q < M; q++) {
        const i0 = q * st, i1 = q + 1 < M ? (q + 1) * st : N
        const e0 = e[i0], e1 = e[i1 % N]
        for (let i = i0 + 1; i < i1; i++) { const u = (i - i0) / (i1 - i0); e[i] = Math.max(-L[i], Math.min(Rr[i], e0 + (e1 - e0) * u)) }
      }
      upd()
    }
  }
  // courbure
  const k = new Float64Array(N), W = 4
  for (let i = 0; i < N; i++) {
    const a = (i - W + N) % N, b = (i + W) % N
    const ax = x[i] - x[a], az = z[i] - z[a], bx = x[b] - x[i], bz = z[b] - z[i]
    const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(x[b] - x[a], z[b] - z[a])
    k[i] = 2 * cr / Math.max(1e-6, la * lb * lc)
  }
  const ks = new Float64Array(N)
  for (let i = 0; i < N; i++) { let s = 0; for (let j = -3; j <= 3; j++) s += k[(i + j + N) % N]; ks[i] = s / 7 }
  // profil de vitesse
  const m = W11.massMin + W11.fuelQuali, g = 9.81, rho = W11.rho
  const ClA = W11.ClA, CdA = W11.CdA
  // adhérence longitudinale relative (profil calé à l'origine pour muX = 0,78) : freinage et traction suivent le pneu
  const kx = W11.tyre.muX / 0.78
  const vmax = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const kk = Math.abs(ks[i])
    // capacité latérale ajustée sur le skidpad du modèle (tests/_skid.ts) : muM mécanique + muA aéro, × marge mu
    const den = m * kk - mu * MU_A * 0.5 * rho * ClA
    vmax[i] = den <= 0 ? 100 : Math.min(100, Math.sqrt(mu * MU_M * g * m / den))
  }
  const ds = t.ds, v = Float64Array.from(vmax)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N * 1.2; i++) { // accélération
      const a = i % N, b = (i + 1) % N, va = v[a]
      const q = 0.5 * rho * va * va
      const p = icePower(Math.min(12000, 9000 + va * 40), 1, 'quali') + W11.mgukPower * 0.9
      const fTrac = Math.min(p * W11.driveEff / Math.max(va, 5), kx * mu * (MU_M * m * g * 0.55 + MU_A * q * ClA * 0.6))
      // ellipse de friction : la part latérale consomme l'adhérence disponible
      const latA = va * va * Math.abs(ks[a]), latMax = mu * (MU_M * g + MU_A * q * ClA / m)
      const ell = Math.sqrt(Math.max(0.05, 1 - (latA / latMax) ** 2))
      const acc = (Math.min(fTrac, kx * mu * (MU_M * m * g * 0.55 + MU_A * q * ClA * 0.6) * ell) - q * CdA) / m
      v[b] = Math.min(v[b], Math.sqrt(Math.max(0, va * va + 2 * acc * ds)))
    }
    for (let i = Math.floor(N * 1.2); i > 0; i--) { // freinage
      const b = i % N, a = (i - 1) % N, vb = v[b]
      const q = 0.5 * rho * vb * vb
      const latB = vb * vb * Math.abs(ks[b]), latMaxB = mu * (MU_M * g + MU_A * q * ClA / m)
      const ellB = Math.sqrt(Math.max(0.03, 1 - (latB / latMaxB) ** 2))
      const dec = (kx * mu * 0.93 * (MU_M * m * g + MU_A * q * ClA) * ellB + q * CdA) / m
      v[a] = Math.min(v[a], Math.sqrt(vb * vb + 2 * dec * ds))
    }
  }
  return { x, z, e, k: ks, v, N, ds }
}

/** Lot 8 C — profil de vitesse générique (même méthode que ci-dessus) pour une voiture quelconque : adversaires IA
 *  (paramètres 2020 de leur équipe), safety car (voiture de route). `drs` : indices où l'aileron est ouvert (traînée × drsCd). */
export interface ProfileCar { m: number; ClA: number; CdA: number; power: (v: number) => number; muM?: number; muA?: number; vCap?: number; tracFrac?: number; brakeK?: number }
export function speedProfile(t: TrackSurface, Ln: RacingLine, P: ProfileCar, mu = 1, drs?: Uint8Array, drsCd = 0.84): Float64Array {
  const N = Ln.N, g = 9.81, rho = W11.rho, m = P.m, ClA = P.ClA, muM = P.muM ?? MU_M, muA = P.muA ?? MU_A, kx = W11.tyre.muX / 0.78
  const tf = P.tracFrac ?? 0.55, bk = P.brakeK ?? 0.93, cap = P.vCap ?? 100, ks = Ln.k
  const cd = (i: number) => drs && drs[i] ? P.CdA * drsCd : P.CdA
  const v = new Float64Array(N)
  for (let i = 0; i < N; i++) { const kk = Math.abs(ks[i]), den = m * kk - mu * muA * 0.5 * rho * ClA; v[i] = den <= 0 ? cap : Math.min(cap, Math.sqrt(mu * muM * g * m / den)) }
  const ds = t.ds
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N * 1.2; i++) {
      const a = i % N, b = (i + 1) % N, va = v[a], q = 0.5 * rho * va * va
      const grip = kx * mu * (muM * m * g * tf + muA * q * ClA * 0.6)
      const latA = va * va * Math.abs(ks[a]), latMax = mu * (muM * g + muA * q * ClA / m)
      const ell = Math.sqrt(Math.max(0.05, 1 - (latA / latMax) ** 2))
      const acc = (Math.min(P.power(va) / Math.max(va, 5), grip * ell) - q * cd(a)) / m
      v[b] = Math.min(v[b], Math.sqrt(Math.max(0, va * va + 2 * acc * ds)))
    }
    for (let i = Math.floor(N * 1.2); i > 0; i--) {
      const b = i % N, a = (i - 1) % N, vb = v[b], q = 0.5 * rho * vb * vb
      const latB = vb * vb * Math.abs(ks[b]), latMaxB = mu * (muM * g + muA * q * ClA / m)
      const ellB = Math.sqrt(Math.max(0.03, 1 - (latB / latMaxB) ** 2))
      v[a] = Math.min(v[a], Math.sqrt(vb * vb + 2 * (kx * mu * bk * (muM * m * g + muA * q * ClA) * ellB + q * cd(b)) / m * ds))
    }
  }
  return v
}
/** temps au tour d'un profil (s) */
export function profileLapTime(v: Float64Array | number[], ds: number) { let T = 0; for (let i = 0; i < v.length; i++) T += ds / Math.max(1, v[i]); return T }
