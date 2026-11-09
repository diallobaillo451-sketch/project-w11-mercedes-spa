// Tests unitaires du gyroscope avec événements deviceorientation SIMULÉS (aucun capteur réel).
// On fabrique la verticale appareil pour un angle de volant θ et une inclinaison d'écran φ, on en déduit (beta, gamma)
// selon la convention W3C, puis on vérifie que wheelAngleDeg retrouve θ, en paysage gauche (90) et droite (270).
import { wheelAngleDeg } from '../src/controls/gyro.ts'
const d = Math.PI / 180
let fail = 0
const ok = (n: string, c: boolean, info = '') => { console.log(c ? 'OK  ' : 'ÉCHEC', n, info); if (!c) fail++ }
/** θ : rotation horaire vue par le joueur ; φ : écran incliné vers l'arrière (0 = vertical) ; ang : screen.orientation.angle */
function simulate(theta: number, phi: number, ang: number) {
  // haut de l'écran (repère appareil) pour cette orientation
  const a = ((ang % 360) + 360) % 360
  const up = a === 90 ? [1, 0] : a === 270 ? [-1, 0] : a === 180 ? [0, -1] : [0, 1]
  const right = [up[1], -up[0]]
  // appareil tourné de θ dans le sens horaire → la verticale tourne de θ dans le sens anti-horaire dans le repère écran
  const t = theta * d, h = Math.cos(phi * d)
  const sx = -Math.sin(t) * h, sy = Math.cos(t) * h, uz = Math.sin(phi * d)
  const ux = sx * right[0] + sy * up[0], uy = sx * right[1] + sy * up[1]
  // inversion W3C : u = (−sinγ cosβ, sinβ, cosγ cosβ), γ ∈ (−90, 90)
  const gamma = Math.atan2(-ux, uz) / d
  const cg = Math.cos(gamma * d)
  const beta = Math.atan2(uy, uz / cg) / d
  return { beta, gamma: Math.abs(gamma) >= 90 ? Math.sign(gamma) * 89.999 : gamma }
}
for (const ang of [90, 270, -90, 0]) {
  let maxErr = 0
  for (const phi of [5, 20, 40, 60]) for (let th = -60; th <= 60; th += 5) {
    const e = simulate(th, phi, ang)
    const r = wheelAngleDeg(e.beta, e.gamma, ang)
    maxErr = Math.max(maxErr, Math.abs(r - th))
  }
  ok(`orientation ${ang}° : angle de volant retrouvé (θ −60…60°, écran incliné 5–60°)`, maxErr < 0.01, `erreur max ${maxErr.toFixed(4)}°`)
}
// sens : tourner à droite donne une valeur positive en paysage gauche ET droite
for (const ang of [90, 270]) { const e = simulate(20, 25, ang); ok(`sens horaire → + en paysage ${ang}°`, wheelAngleDeg(e.beta, e.gamma, ang) > 0) }
// changement d'orientation en cours de route : même geste physique, même commande
{ const a = simulate(15, 30, 90), b = simulate(15, 30, 270); ok('paysage 90° et 270° donnent la même commande', Math.abs(wheelAngleDeg(a.beta, a.gamma, 90) - wheelAngleDeg(b.beta, b.gamma, 270)) < 0.01) }
// écran presque vertical (blocage de cardan) : pas de saut
{ let prev = NaN, jump = 0; for (let phi = 0.5; phi < 10; phi += 0.5) { const e = simulate(10, phi, 90); const r = wheelAngleDeg(e.beta, e.gamma, 90); if (!isNaN(prev)) jump = Math.max(jump, Math.abs(r - prev)); prev = r } ok('écran quasi vertical : continuité', jump < 0.05, `saut max ${jump.toFixed(4)}°`) }
console.log(fail ? `${fail} échec(s)` : 'tous les tests gyroscope passent'); process.exit(fail ? 1 : 0)
