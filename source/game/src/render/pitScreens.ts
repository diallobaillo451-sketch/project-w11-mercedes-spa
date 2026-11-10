/** Trois écrans de garage (timing, télémétrie, piste / stratégie).
 *  CanvasTexture posée sur anchor_pitscreen_1..3 (ou screen_1..3) quand Ty les a livrés.
 *  Sans ancre : bande DOM, visible dans la voie des stands et au garage. */
import * as THREE from 'three'
import type { RaceSim } from '../race/sim.ts'
import type { Vehicle } from '../physics/vehicle.ts'
import { teamAccent } from '../data/drivers.ts'
import { COMP_COLOR } from '../race/data.ts'
import type { Anchor } from './anchors.ts'

const W = 480, H = 270
const f3 = (t: number) => { if (!isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}` }

export class PitScreens {
  readonly tex: THREE.CanvasTexture[] = []
  private cvs: HTMLCanvasElement[] = []
  private g: CanvasRenderingContext2D[] = []
  private dom: HTMLElement | null = null
  bound = 0
  constructor() {
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const g = c.getContext('2d')!
      this.cvs.push(c); this.g.push(g)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4
      this.tex.push(t)
    }
  }
  /** pose la texture sur le plan d'ancre (UV 0..1). Retourne combien d'écrans ont trouvé une ancre. */
  bind(anchors: Map<string, Anchor>) {
    this.bound = 0
    for (let i = 0; i < 3; i++) {
      const a = anchors.get('anchor_pitscreen_' + (i + 1))
      const mesh = a?.node as THREE.Mesh | undefined
      const target = mesh?.isMesh ? mesh : mesh?.getObjectByProperty?.('isMesh', true) as THREE.Mesh | undefined
      if (!target?.isMesh) continue
      const basic = new THREE.MeshBasicMaterial({ map: this.tex[i], toneMapped: false })
      target.material = basic
      target.visible = true
      this.bound++
    }
    return this.bound
  }
  /** bande 2D de repli (aucun monde 3D, ou le joueur est au stand sans ancre) */
  setDom(on: boolean) {
    if (!on) { this.dom?.remove(); this.dom = null; return }
    if (this.bound > 0) { this.setDom(false); return }
    if (this.dom) return
    this.dom = document.createElement('div'); this.dom.id = 'pitscreens'
    for (const c of this.cvs) this.dom.appendChild(c)
    document.body.appendChild(this.dom)
  }
  update(sim: RaceSim | null, car: Vehicle | null, weather: string) {
    this.drawTiming(sim)
    this.drawCar(sim, car)
    this.drawStrat(sim, car, weather)
    for (const t of this.tex) t.needsUpdate = true
  }
  private bg(g: CanvasRenderingContext2D, title: string) {
    g.clearRect(0, 0, W, H)
    g.fillStyle = '#0c0e12'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#141820'; g.fillRect(0, 0, W, 28)
    g.fillStyle = '#ffd400'; g.font = '700 13px -apple-system, system-ui, sans-serif'
    g.fillText(title, 12, 19)
  }
  private drawTiming(sim: RaceSim | null) {
    const g = this.g[0]; this.bg(g, sim ? (sim.kind === 'race' ? 'COURSE' : sim.kind === 'qualifying' ? 'QUALIFICATIONS' : 'ESSAIS') : 'CHRONOS')
    if (!sim) return
    const A = sim.ordered()
    g.font = '600 12px ui-monospace, monospace'
    const rows = A.slice(0, 12)
    rows.forEach((r, i) => {
      const y = 46 + i * 18
      g.fillStyle = r.player ? 'rgba(255,255,255,0.14)' : 'transparent'; g.fillRect(6, y - 12, W - 12, 17)
      g.fillStyle = '#ddd'; g.fillText(String(r.pos).padStart(2, ' '), 12, y)
      g.fillStyle = teamAccent(r.team); g.fillRect(36, y - 10, 4, 12)
      g.fillStyle = '#fff'; g.fillText(r.code, 48, y)
      g.fillStyle = COMP_COLOR[r.tyre.c] ?? '#fff'; g.fillText(r.tyre.c, 100, y)
      let gap = ''
      if (r.out) gap = 'OUT'
      else if (sim.kind === 'race') gap = i === 0 ? 'TÊTE' : (isFinite(r.gap) ? '+' + r.gap.toFixed(1) : '')
      else gap = isNaN(r.best) ? (r.mode === 'garage' ? 'BOX' : '—') : (i === 0 ? f3(r.best) : '+' + r.gap.toFixed(3))
      g.fillStyle = '#cfd3da'; g.textAlign = 'right'; g.fillText(gap, W - 14, y); g.textAlign = 'left'
    })
  }
  private drawCar(sim: RaceSim | null, car: Vehicle | null) {
    const g = this.g[1]; this.bg(g, 'TÉLÉMÉTRIE')
    if (!car) return
    const kmh = Math.round(car.speed * 3.6)
    const gear = car.gear < 0 ? 'R' : car.gear === 0 ? 'N' : String(car.gear)
    g.fillStyle = '#fff'; g.font = '700 42px ui-monospace, monospace'; g.fillText(String(kmh), 16, 86)
    g.font = '600 14px -apple-system, sans-serif'; g.fillStyle = '#9aa'; g.fillText('km/h', 130, 86)
    g.fillStyle = '#ffd400'; g.font = '700 36px ui-monospace, monospace'; g.fillText(gear, 200, 86)
    g.font = '600 13px ui-monospace, monospace'; g.fillStyle = '#ddd'
    const ers = car.ers?.soc != null ? (car.ers.soc / 4e6 * 100) : 0
    const lines = [
      `RPM ${Math.round(car.rpm)}`,
      `ERS ${ers.toFixed(0)} %   ${car.ers?.mode ?? ''}`,
      `ESSENCE ${car.fuel.toFixed(1)} kg`,
      `DRS ${car.drsOpen ? 'OUVERT' : car.drsAvailable ? 'ARMÉ' : '—'}`,
    ]
    lines.forEach((t, i) => g.fillText(t, 16, 120 + i * 20))
    const names = ['AVG', 'AVD', 'ARG', 'ARD']
    car.wheels.forEach((w, i) => {
      const x = 250 + (i % 2) * 100, y = 120 + Math.floor(i / 2) * 56
      g.fillStyle = '#888'; g.font = '600 11px -apple-system, sans-serif'; g.fillText(names[i], x, y)
      g.fillStyle = '#fff'; g.font = '700 16px ui-monospace, monospace'
      g.fillText(Math.round(w.tyre.temp) + '°', x, y + 20)
      g.fillStyle = '#f80'; g.font = '600 12px ui-monospace, monospace'; g.fillText(Math.round(w.brakeT) + '° frein', x, y + 36)
    })
    void sim
  }
  private drawStrat(sim: RaceSim | null, car: Vehicle | null, weather: string) {
    const g = this.g[2]; this.bg(g, 'PISTE · STRATÉGIE')
    const C = sim?.ctrl
    g.font = '700 18px -apple-system, sans-serif'
    const flag = C ? (C.red ? 'DRAPEAU ROUGE' : C.sc.active ? 'SAFETY CAR' : C.vsc ? 'VSC' : C.playerFlag() || 'VERT') : '—'
    g.fillStyle = flag.includes('ROUGE') ? '#ff453a' : flag.includes('SAFETY') || flag === 'VSC' ? '#ffd400' : '#30d158'
    g.fillText(flag, 16, 58)
    g.fillStyle = '#ddd'; g.font = '600 13px -apple-system, sans-serif'
    const wx = ({ dry: 'sec', damp: 'humide', wet: 'mouillé', rain: 'pluie' } as Record<string, string>)[weather] ?? weather
    g.fillText('Météo  ' + wx, 16, 86)
    g.fillText('Sortie des stands  ' + (C?.pitExitGreen() ? 'VERT' : 'ROUGE'), 16, 108)
    g.fillText('Feu de case  ' + (C?.boxLight ?? '—'), 16, 130)
    if (sim) {
      const p = sim.player
      g.fillText(`P${p.pos}   pneus ${p.tyre.c}   âge ${p.tyre.age.toFixed(1)} tr`, 16, 160)
      g.fillText(`Pénalité ${p.pen}s   avert. ${p.warnings}   arrêts ${p.stops}`, 16, 182)
      const plan = p.plan?.map(x => `T${x.lap} ${x.c}`).join('  ') || (sim.kind === 'race' ? 'libre' : '—')
      g.fillText('Plan  ' + plan, 16, 204)
      const msg = sim.msgs[sim.msgs.length - 1]
      if (msg) { g.fillStyle = '#9ab'; g.font = '600 12px -apple-system, sans-serif'; g.fillText(msg.text.slice(0, 62), 16, 236) }
    }
    void car
  }
}
