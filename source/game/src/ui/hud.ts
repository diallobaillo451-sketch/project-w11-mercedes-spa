/** HUD : chrono, secteurs (violet = meilleur, vert = meilleur perso du tour précédent… ici : violet/jaune), vitesse,
 *  rapport, LEDs de régime, températures pneus (couleur selon la fenêtre Pirelli), ERS, DRS, répartition, mode. */
import type { Game } from '../core/game.ts'
import { fmt } from '../timing/timing.ts'
const $ = (id: string) => document.getElementById(id)!
const cache = new Map<string, string>()
function txt(id: string, v: string) { if (cache.get(id) !== v) { cache.set(id, v); $(id).textContent = v } }
function cls(id: string, v: string) { const k = id + '.c'; if (cache.get(k) !== v) { cache.set(k, v); $(id).className = v } }
const MODE: Record<string, string> = { quali: 'QUALI', race: 'COURSE', save: 'ÉCO' }
const ERS: Record<string, string> = { hotlap: 'ERS HOTLAP', overtake: 'ERS DÉPASS.', balanced: 'ERS ÉQUIL.', charge: 'ERS RECHARGE' }
export class Hud {
  leds: HTMLElement[] = []; private toastT = 0
  constructor() {
    const L = $('leds'); for (let i = 0; i < 15; i++) { const e = document.createElement('i'); L.appendChild(e); this.leds.push(e) }
  }
  toast(msg: string, ms = 1800) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); this.toastT = performance.now() + ms }
  update(g: Game) {
    const c = g.car, tm = g.session.timing
    txt('hSpd', String(Math.max(0, Math.round(c.forwardSpeed() * 3.6))))
    txt('hGear', c.gear === -1 ? 'R' : c.gear === 0 ? 'N' : String(c.gear))
    // LEDs : 10 500 → 12 000 tr/min (vert, rouge, bleu), clignotent au limiteur
    const r = c.rpmVis ?? c.rpm, n = Math.max(0, Math.min(15, Math.round((r - 10500) / 1500 * 15)))
    const flash = c.limiter && (performance.now() % 160 < 80)
    for (let i = 0; i < 15; i++) { const v = flash ? 'b' : i < n ? (i < 5 ? 'g' : i < 10 ? 'r' : 'b') : ''; if (this.leds[i].className !== v) this.leds[i].className = v }
    txt('hTime', tm.lapStart >= 0 ? fmt(tm.current) : '--:--.---')
    txt('hLap', tm.lapStart >= 0 ? `Tour ${tm.laps.length + 1}${tm.valid ? '' : ' · invalide'}` : g.autopilot ? 'Démo' : 'Tour de lancement')
    cls('hLap', 'pill' + (tm.valid ? '' : ' inv'))
    txt('hLast', 'Dernier ' + (tm.lastLap ? fmt(tm.lastLap.time) + (tm.lastLap.valid ? '' : ' ✕') : '—'))
    const best = g.storedBest
    txt('hBest', 'Meilleur ' + (best ? fmt(best) : '—'))
    for (let k = 0; k < 3; k++) {
      let v = ''
      if (k < tm.sectors.length) v = tm.sectors[k] <= tm.bestSectors[k] + 1e-6 ? 'p' : 'y'
      else if (k === tm.sector && tm.lapStart >= 0 && tm.lastLap) v = ''
      cls('s' + k, v)
    }
    // pneus : bleu froid < 90 °C, vert 90–115, jaune 115–130, rouge > 130 (fenêtre Pirelli C3 ≈ 105–135 °C, P/E)
    c.wheels.forEach((w, i) => {
      const T = w.tyre.temp, col = T < 75 ? '#3a8bff' : T < 95 ? '#4fc3ff' : T < 120 ? '#2fd45a' : T < 135 ? '#ffd23f' : '#ff453a'
      const el = $('t' + i); if (el.style.background !== col) el.style.background = col
    })
    const soc = c.ers.soc / 4e6
    const e = $('hErs'); const w = Math.round(soc * 100) + '%'; if (e.style.width !== w) e.style.width = w
    txt('hErsMode', ERS[c.ers.mode] ?? 'ERS')
    cls('hDrs', 'tag' + (c.drsOpen ? ' open' : c.drsAvailable ? ' avail' : ''))
    cls('bDrs', 'abtn' + (c.drsOpen ? ' on' : c.drsAvailable ? ' avail' : ''))
    txt('hBias', 'BB ' + (c.setup.brakeBias * 100).toFixed(1).replace('.', ','))
    txt('hMode', MODE[c.setup.engineMode] ?? '')
    if (this.toastT && performance.now() > this.toastT) { $('toast').classList.remove('show'); this.toastT = 0 }
  }
}
