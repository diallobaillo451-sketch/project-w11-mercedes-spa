/** Volant W11 « vivant » : écran LCD du volant (CanvasTexture sur le quad gp21_LCD du modèle), rangée de 15 LEDs de
 *  régime + 3 LEDs de drapeaux de chaque côté, et panneau tactile des réglages (rotatifs et boutons du vrai volant :
 *  BBAL, DIFF entrée/sortie, STRAT/mode moteur, ERS, OT, DRS, PIT, N, RADIO, PAGE, ACK) reliés à la physique.
 *  Recherche : volant Mercedes 2020 (écran central multi-pages : rapport, delta, temps, ERS/SOC, modes, BB, diff,
 *  températures pneus/freins, carburant, messages ; LEDs de shift en haut, LEDs de drapeaux latérales FIA). */
import * as THREE from 'three'
import type { Game } from '../core/game.ts'
import { FLAG_LABEL, type Flag } from '../core/session.ts'
import { fmt } from '../timing/timing.ts'
import { tyreCompoundColor } from '../render/tyreColor.ts'

const FLAG_COL: Record<Flag, string> = { none: '#000', green: '#18d24a', yellow: '#ffd400', double: '#ffd400', red: '#ff2a1f', blue: '#2f7bff', chequered: '#ffffff', blackwhite: '#ffffff', sc: '#ffd400', vsc: '#ffd400' }
const ERS_L: Record<string, string> = { hotlap: 'HOTLAP', overtake: 'OVERTAKE', balanced: 'BALANCED', charge: 'CHARGE' }
const ENG_L: Record<string, string> = { quali: 'STRAT 1 · QUALI', race: 'STRAT 5 · RACE', save: 'STRAT 9 · SAVE' }
export class WheelDisplay {
  page = 0; pages = 3
  private cv = document.createElement('canvas'); private g: CanvasRenderingContext2D; tex: THREE.CanvasTexture
  private lcv = document.createElement('canvas'); private lg: CanvasRenderingContext2D; ltex: THREE.CanvasTexture
  private acc = 0; ok = false; msg = ''; msgT = 0
  constructor(root: THREE.Object3D) {
    this.cv.width = 512; this.cv.height = 300; this.g = this.cv.getContext('2d')!
    this.lcv.width = 512; this.lcv.height = 48; this.lg = this.lcv.getContext('2d')!
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4
    this.ltex = new THREE.CanvasTexture(this.lcv); this.ltex.colorSpace = THREE.SRGBColorSpace
    const sw = root.getObjectByName('STEERING_WHEEL'); if (!sw) return
    // écran : quad 0,10 × 0,058 m face au pilote (z +0,0468 dans le repère du volant)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0583), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    scr.position.set(0, 0, 0.0478); scr.name = 'SW_LIVE_LCD'; sw.add(scr)
    // LEDs : bande au-dessus de l'écran (position du modèle « vehicle_revs_type2 »), 15 régime + 2×3 drapeaux
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.118, 0.011), new THREE.MeshBasicMaterial({ map: this.ltex, toneMapped: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }))
    led.position.set(0, 0.0367, 0.0482); led.name = 'SW_LIVE_LED'; sw.add(led)
    // anciens écrans figés et pavés ERS imprimés du modèle (remplacés par l'écran vivant)
    sw.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || o === scr || o === led) return
      const mn = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? ''
      if (/gp21_LCD|W11_DISPLAY|kers_/i.test(mn)) o.visible = false })
    this.ok = true
  }
  say(m: string, sec = 2.5) { this.msg = m; this.msgT = sec }
  update(gm: Game, dt: number, visible: boolean) {
    if (!this.ok) return
    this.acc += dt; this.msgT = Math.max(0, this.msgT - dt)
    if (!visible || this.acc < 1 / 20) return // 20 Hz, seulement si le volant est à l'écran
    this.acc = 0
    const c = gm.car, se = gm.session, tm = se.timing, g = this.g, W = 512, H = 300
    const flag = se.flag
    // ---- LEDs
    const L = this.lg; L.clearRect(0, 0, 512, 48)
    const r = c.rpmVis, n = Math.max(0, Math.min(15, Math.round((r - 10500) / 1500 * 15))), flash = c.limiter && (performance.now() % 160 < 80)
    for (let i = 0; i < 15; i++) {
      const col = flash ? '#3a8bff' : i < n ? (i < 5 ? '#19e04f' : i < 10 ? '#ff2a1f' : '#6a3cff') : '#141414'
      L.fillStyle = col; L.beginPath(); L.arc(96 + i * 22.5, 24, 8.5, 0, Math.PI * 2); L.fill()
    }
    const fc = FLAG_COL[flag], blink = flag !== 'none' && (performance.now() % 500 < 330)
    for (let k = 0; k < 3; k++) for (const x of [16 + k * 22, 496 - k * 22]) { L.fillStyle = blink ? fc : '#141414'; L.beginPath(); L.arc(x, 24, 8.5, 0, Math.PI * 2); L.fill() }
    this.ltex.needsUpdate = true
    // ---- écran
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H)
    if (flag !== 'none') { // bandeau drapeau (toujours prioritaire, comme sur le vrai volant)
      if (flag === 'chequered') { for (let i = 0; i < 32; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#000'; g.fillRect(i * 16, j * 12, 16, 12) } }
      else { g.fillStyle = fc; g.fillRect(0, 0, W, 36) }
      g.fillStyle = flag === 'chequered' ? '#05070a' : '#000'; if (flag === 'chequered') { g.fillStyle = '#05070a'; g.fillRect(150, 4, 212, 28) ; g.fillStyle = '#fff' }
      g.font = '700 24px -apple-system,Helvetica,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(FLAG_LABEL[flag], W / 2, 19)
    }
    const top = flag !== 'none' ? 40 : 4
    g.textBaseline = 'middle'
    const box = (x: number, y: number, w: number, h: number, lbl: string, val: string, col = '#fff', size = 30) => {
      g.strokeStyle = '#1f2a33'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2)
      g.fillStyle = '#7f93a3'; g.font = '600 15px -apple-system,Helvetica,Arial'; g.textAlign = 'left'; g.fillText(lbl, x + 7, y + 13)
      g.fillStyle = col; g.font = `700 ${size}px -apple-system,Helvetica,Arial`; g.textAlign = 'right'; g.fillText(val, x + w - 8, y + h / 2 + 8)
    }
    const kmh = Math.max(0, Math.round(c.forwardSpeed() * 3.6)), gear = c.gear === -1 ? 'R' : c.gear === 0 ? 'N' : String(c.gear)
    const d = tm.delta, dS = isNaN(d) ? '+-.---' : (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(3), dC = isNaN(d) ? '#9aa' : d <= 0 ? '#19e04f' : '#ff3b30'
    if (this.page === 0) {
      // page COURSE : rapport géant au centre, delta, temps, ERS, BB, carburant
      g.fillStyle = c.limiter ? '#3a8bff' : '#fff'; g.font = '800 120px -apple-system,Helvetica,Arial'; g.textAlign = 'center'; g.fillText(gear, W / 2, top + 98)
      g.font = '700 30px -apple-system,Helvetica,Arial'; g.fillStyle = '#cfe'; g.fillText(kmh + ' km/h', W / 2, top + 176)
      box(4, top, 170, 56, 'DELTA', dS, dC); box(4, top + 60, 170, 56, 'TOUR ' + (tm.laps.length + 1), tm.lapStart >= 0 ? fmt(tm.current).slice(0, -1) : '-:--.--', '#fff', 26)
      box(4, top + 120, 170, 56, 'MEILLEUR', tm.best ? fmt(tm.best.time).slice(0, -1) : '—', '#b46cff', 26)
      box(338, top, 170, 56, 'BBAL %', (c.setup.brakeBias * 100).toFixed(1)); box(338, top + 60, 170, 56, 'SOC MJ', (c.ers.soc / 1e6).toFixed(2), '#ffd23f')
      box(338, top + 120, 170, 56, 'FUEL kg', c.fuel.toFixed(1))
      // jauge ERS
      const soc = c.ers.soc / 4e6; g.fillStyle = '#16212a'; g.fillRect(4, H - 30, W - 8, 24); g.fillStyle = c.ers.mode === 'overtake' ? '#ff9f0a' : '#ffd23f'; g.fillRect(4, H - 30, (W - 8) * soc, 24)
      g.fillStyle = '#000'; g.font = '700 16px -apple-system,Helvetica,Arial'; g.textAlign = 'left'; g.fillText('ERS ' + (ERS_L[c.ers.mode] ?? ''), 10, H - 18)
      g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText((c.drsOpen ? 'DRS OUVERT' : c.drsAvailable ? 'DRS DISPO' : '') + (c.pitLim ? '  PIT LIM' : ''), W - 10, H - 18)
    } else if (this.page === 1) {
      // page PNEUS : 3 zones de surface (int/mil/ext), carcasse, pression à chaud, usure, état (grainage, cloques, plat,
      // gommes ramassées, saleté, crevaison), disques ; bas d'écran : piste (eau, gomme, °C piste)
      const wn = ['AVG', 'AVD', 'ARG', 'ARD'], cmp = c.setup.compound
      const tc = (T: number) => T < 75 ? '#3a8bff' : T < 95 ? '#4fc3ff' : T < 120 ? '#19e04f' : T < 135 ? '#ffd23f' : '#ff3b30'
      const hh = (H - top - 40) / 2
      c.wheels.forEach((w, i) => {
        const t = w.tyre, x = (i % 2) * 256 + 4, y = top + Math.floor(i / 2) * (hh + 4)
        // 3 zones (intérieur côté châssis) : à gauche de la case pour les roues gauches, inversé pour les roues droites
        const z = w.left ? [t.zones[2], t.zones[1], t.zones[0]] : t.zones
        z.forEach((T, k) => { g.fillStyle = tc(T); g.fillRect(x + k * 9, y, 8, hh) })
        g.fillStyle = tyreCompoundColor(cmp); g.font = '700 15px -apple-system,Helvetica,Arial'; g.textAlign = 'left'; g.fillText(wn[i] + ' ' + cmp, x + 32, y + 12)
        g.fillStyle = '#fff'; g.font = '700 28px -apple-system,Helvetica,Arial'; g.fillText(Math.round(t.temp) + '°', x + 32, y + 40)
        g.font = '600 14px -apple-system,Helvetica,Arial'; g.fillStyle = '#cfe'
        g.fillText('carc. ' + Math.round(t.core) + '°  ' + t.pressure.toFixed(1) + ' psi', x + 100, y + 14)
        g.fillText('usure ' + Math.round(t.wear * 100) + '%  frein ' + Math.round(w.brakeT) + '°', x + 100, y + 32)
        const st: string[] = []
        if (t.puncture > 0) st.push('CREVÉ'); if (t.graining > 0.03) st.push('grain ' + Math.round(t.graining * 100)); if (t.blister > 0.03) st.push('cloq ' + Math.round(t.blister * 100))
        if (t.flatSpot > 0.02) st.push('plat ' + Math.round(t.flatSpot * 100)); if (t.pickup > 0.1) st.push('pick-up'); if (t.dirt > 0.1) st.push('sale'); if (t.thermalDeg > 0.03) st.push('surch.')
        g.fillStyle = t.puncture > 0 ? '#ff3b30' : st.length ? '#ff9f0a' : '#7f93a3'; g.fillText(st.length ? st.join(' · ') : 'état OK', x + 100, y + 50)
      })
      const e = gm.env; g.fillStyle = '#7f93a3'; g.font = '600 15px -apple-system,Helvetica,Arial'; g.textAlign = 'center'
      g.fillText(`PISTE ${Math.round(e.trackT)}°C · AIR ${Math.round(e.airT)}°C · EAU ${e.wetness.toFixed(1)} mm · ADH. ×${c.wetGrip.toFixed(2)}${c.aqua > 0.2 ? ' · AQUAPLANING' : ''}`, W / 2, H - 14)
    } else {
      // page RÉGLAGES : diff, mode moteur, ERS, aides
      box(4, top, 250, 56, 'DIFF ENTRÉE', String(Math.round(c.setup.diffOff * 10))); box(258, top, 250, 56, 'DIFF SORTIE', String(Math.round(c.setup.diffOn * 10)))
      box(4, top + 60, 250, 56, 'MOTEUR', ENG_L[c.setup.engineMode] ?? c.setup.engineMode, '#fff', 20); box(258, top + 60, 250, 56, 'ERS', ERS_L[c.ers.mode] ?? '', '#ffd23f', 22)
      box(4, top + 120, 250, 56, 'TC', String(c.setup.tc)); box(258, top + 120, 250, 56, 'BBAL', (c.setup.brakeBias * 100).toFixed(1))
      const dm = c.damage; g.fillStyle = dm.total > 0.05 ? '#ff9f0a' : '#7f93a3'; g.font = '600 18px -apple-system,Helvetica,Arial'; g.textAlign = 'center'
      const pn = c.wheels.map((w, i) => w.tyre.puncture > 0 ? ['AVG', 'AVD', 'ARG', 'ARD'][i] : '').filter(Boolean), wo = dm.wheelOff.map((o, i) => o ? ['AVG', 'AVD', 'ARG', 'ARD'][i] : '').filter(Boolean)
      g.font = '600 15px -apple-system,Helvetica,Arial'
      g.fillText(dm.total > 0.05 || pn.length ? `AV ${Math.round(dm.frontWing * 100)}% dérives ${Math.round(dm.endplate[0] * 100)}/${Math.round(dm.endplate[1] * 100)} · AR ${Math.round(dm.rearWing * 100)}% · fond ${Math.round(dm.floor * 100)}% · défl. ${Math.round(dm.barge[0] * 100)}/${Math.round(dm.barge[1] * 100)}` : 'AUCUN DÉGÂT', W / 2, H - 34)
      g.fillText(`${wo.length ? 'ROUE PERDUE ' + wo.join(' ') + ' · ' : ''}${pn.length ? 'CREVAISON ' + pn.join(' ') + ' · ' : ''}patin ${c.plankWear.toFixed(1)} mm · eau ${Math.round(c.waterT)}°`, W / 2, H - 14)
    }
    if (this.msgT > 0) { g.fillStyle = 'rgba(0,0,0,.82)'; g.fillRect(40, H / 2 - 34, W - 80, 68); g.strokeStyle = '#00d2be'; g.lineWidth = 3; g.strokeRect(40, H / 2 - 34, W - 80, 68)
      g.fillStyle = '#00d2be'; g.font = '700 30px -apple-system,Helvetica,Arial'; g.textAlign = 'center'; g.fillText(this.msg, W / 2, H / 2 + 2) }
    this.tex.needsUpdate = true
  }
}
