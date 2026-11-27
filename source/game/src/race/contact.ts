/** Contacts voiture ↔ voiture : géométrie pure (aucune dépendance), testée dans tests/contact.test.ts.
 *  Chaque voiture est un rectangle orienté dans le plan horizontal (centre monde, direction avant unitaire).
 *  Détection par axes séparateurs (SAT) : profondeur de pénétration minimale, normale (de A vers B) et point de contact
 *  (centre du polygone de recouvrement). Remplace l'ancienne enveloppe « abscisse / écart latéral » qui ignorait le cap
 *  réel des voitures (voiture en travers, courbe) et laissait les voitures se traverser. */
export interface Box { x: number; z: number; fx: number; fz: number }
export interface Hit { nx: number; nz: number; depth: number; px: number; pz: number }
/** demi-longueur / demi-largeur de l'empreinte d'une F1 2020 (5,5 × 1,94 m : ailerons et pneus inclus, un peu sous les 5,6 × 2,0 m officiels) */
export const HL = 2.75, HW = 0.97

type Pt = [number, number]
const corners = (b: Box): Pt[] => {
  const rx = -b.fz, rz = b.fx
  return [
    [b.x + b.fx * HL + rx * HW, b.z + b.fz * HL + rz * HW], [b.x + b.fx * HL - rx * HW, b.z + b.fz * HL - rz * HW],
    [b.x - b.fx * HL - rx * HW, b.z - b.fz * HL - rz * HW], [b.x - b.fx * HL + rx * HW, b.z - b.fz * HL + rz * HW],
  ]
}
/** polygone convexe `poly` découpé par le demi-plan {p : (p − c)·u ≤ h} (Sutherland–Hodgman) */
function clip(poly: Pt[], cx: number, cz: number, ux: number, uz: number, h: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const da = (a[0] - cx) * ux + (a[1] - cz) * uz - h, db = (b[0] - cx) * ux + (b[1] - cz) * uz - h
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
  }
  return out
}

/** recouvrement de deux voitures : null si elles ne se touchent pas. `nx, nz` pointe de A vers B ; `depth` en m. */
export function boxHit(a: Box, b: Box): Hit | null {
  const dx = b.x - a.x, dz = b.z - a.z
  let depth = Infinity, nx = 0, nz = 0
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? a.fx : k === 1 ? -a.fz : k === 2 ? b.fx : -b.fz
    const uz = k === 0 ? a.fz : k === 1 ? a.fx : k === 2 ? b.fz : b.fx
    const ra = HL * Math.abs(a.fx * ux + a.fz * uz) + HW * Math.abs(-a.fz * ux + a.fx * uz)
    const rb = HL * Math.abs(b.fx * ux + b.fz * uz) + HW * Math.abs(-b.fz * ux + b.fx * uz)
    const dist = dx * ux + dz * uz, o = ra + rb - Math.abs(dist)
    if (o <= 0) return null
    if (o < depth) { depth = o; const s = dist >= 0 ? 1 : -1; nx = ux * s; nz = uz * s }
  }
  // point de contact : centre du polygone de recouvrement (B découpé par les 4 côtés de A)
  let poly = corners(b)
  poly = clip(poly, a.x, a.z, a.fx, a.fz, HL); poly = clip(poly, a.x, a.z, -a.fx, -a.fz, HL)
  poly = clip(poly, a.x, a.z, -a.fz, a.fx, HW); poly = clip(poly, a.x, a.z, a.fz, -a.fx, HW)
  let px = (a.x + b.x) / 2, pz = (a.z + b.z) / 2
  if (poly.length) { px = 0; pz = 0; for (const p of poly) { px += p[0]; pz += p[1] } px /= poly.length; pz /= poly.length }
  return { nx, nz, depth, px, pz }
}

/** paramètres du choc (F1 : structures carbone, peu de rebond ; frottement pneu / carrosserie) */
export const RESTITUTION = 0.1, FRICTION = 0.3
/** impulsion normale j ≥ 0 et tangentielle jt pour une vitesse relative `rel` (B − A) et des inverses de masse effectives iA, iB.
 *  vn < 0 : les voitures se rapprochent. Retourne null si elles s'écartent déjà. */
export function solveImpulse(nx: number, nz: number, relx: number, relz: number, iA: number, iB: number, e = RESTITUTION, mu = FRICTION) {
  const vn = relx * nx + relz * nz
  if (vn >= -0.01) return null
  const inv = iA + iB
  if (!(inv > 0)) return null
  const j = -(1 + (vn > -1 ? 0 : e)) * vn / inv
  const tx = -nz, tz = nx, vt = relx * tx + relz * tz
  const jt = Math.max(-mu * j, Math.min(mu * j, -vt / inv))
  return { j, jt, tx, tz, vn }
}
