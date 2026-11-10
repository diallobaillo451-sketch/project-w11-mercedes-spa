/** Radio d'ingénieur branchée sur la course réelle : écarts, drapeaux, arrêt, dégâts, météo.
 *  Les phrases qui existent dans la banque audio partent en voix ; les autres en texte (bulle + bip). */
import type { RaceSim, Racer } from './sim.ts'

export interface EngineerOut { say?: string; text?: string; critical?: boolean }
export class Engineer {
  private t = 0
  private last: Record<string, number> = {}
  private toldBox = -1
  private toldFlag = ''
  tick(sim: RaceSim, dt: number): EngineerOut | null {
    this.t += dt
    const p = sim.player, C = sim.ctrl
    const cool = (k: string, s: number) => { if (this.t - (this.last[k] ?? -1e9) < s) return false; this.last[k] = this.t; return true }
    const flag = C.playerFlag()
    if (flag && flag !== this.toldFlag) {
      this.toldFlag = flag
      if (flag === 'yellow') return { say: 'drapeau_jaune', critical: true }
      if (flag === 'double') return { say: 'double_jaune', critical: true }
      if (flag === 'red') return { say: 'drapeau_rouge', text: 'Drapeau rouge. Rentre au stand, au ralenti.', critical: true }
      if (flag === 'blue') return { text: 'Bleu, bleu. Laisse-le passer.', critical: true }
      if (flag === 'sc') return { text: 'Safety car. Écart groupé, pas de dépassement. On peut rentrer.', critical: true }
      if (flag === 'vsc') return { text: 'VSC. Respecte le delta, pas de dépassement.', critical: true }
      if (flag === 'green') return { say: 'drapeau_vert' }
    }
    if (!flag) this.toldFlag = ''
    if (p.out && cool('out', 999)) {
      return { text: p.dmg.floor > 0.5 || p.dmg.fw > 0.8 ? 'C’est fini. On ne peut pas rentrer. Les commissaires sortent la voiture — tu peux suivre la course.' : 'Abandon. On te sort.', critical: true }
    }
    if (sim.kind === 'race' && C.phase === 'racing' && !p.out) {
      const ahead = carAhead(sim, p)
      if (ahead && cool('gap', 22)) {
        const g = sim.road(p.s, ahead.s) / Math.max(10, p.v)
        if (g < 1.2) return { text: `${ahead.code} devant, ${g.toFixed(1)} s. Tu peux attaquer.` }
        if (g < 8) return { text: `Écart ${ahead.code} : ${g.toFixed(1)} s.` }
      }
      const age = p.tyre.age * sim.wearScale
      const cliff = age > 16 && p.tyre.c === 'S' || age > 24 && p.tyre.c === 'M' || age > 32
      if ((C.sc.active || C.vsc) && cliff && p.laps < sim.laps - 1 && this.toldBox !== p.laps && cool('boxsc', 30)) {
        this.toldBox = p.laps
        return { text: C.sc.active ? 'Safety car : box this lap, on gagne le temps d’arrêt.' : 'VSC : fenêtre d’arrêt, rentre si les pneus sont finis.', critical: true }
      }
      if (sim.wetness() > 0.35 && (p.tyre.c === 'S' || p.tyre.c === 'M' || p.tyre.c === 'H') && cool('rain', 40)) return { text: 'La pluie arrive. Inter ou pluie, dis-moi quand tu rentres.', critical: true }
      if (sim.wetness() < 0.12 && (p.tyre.c === 'I' || p.tyre.c === 'W') && cool('dry', 40)) return { text: 'Une ligne sèche se dessine. On repasse en slicks dès que tu peux.' }
      if (p.fuel < 2.2 && p.laps < sim.laps && cool('fuel', 30)) return { text: 'Essence juste. Lève le pied dans les lignes droites.', critical: true }
      if (p.dmg.fw > 0.35 && cool('wing', 50)) return { say: 'degats_aileron', text: 'Aileron avant touché. Rentre si la voiture part tout droit.' }
      if (p.pen >= 5 && cool('pen', 40)) return { text: `Pénalité de ${p.pen} s à purger au prochain arrêt.` }
    }
    return null
  }
}
function carAhead(sim: RaceSim, r: Racer) {
  let best: Racer | null = null, g = 1e9
  for (const o of sim.cars) {
    if (o === r || !sim.onTrack(o)) continue
    const d = sim.road(r.s, o.s)
    if (d > 0 && d < g) { g = d; best = o }
  }
  return best
}
