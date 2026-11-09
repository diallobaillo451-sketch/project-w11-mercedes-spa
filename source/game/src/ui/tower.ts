/** Lot 8 C — tour de chronométrage en direct (style TV F1 2020) + bandeau des messages de la direction de course.
 *  Compact par défaut (P1–P3 + le joueur et ses voisins), toucher pour déplier les 20 lignes. Mis à jour à 4 Hz. */
import type { RaceSim, Racer, Msg } from '../race/sim.ts'
import { teamAccent } from '../data/drivers.ts'
import { COMP_COLOR } from '../race/data.ts'
const f3 = (t: number) => { if (!isFinite(t)) return ''; const m = Math.floor(t / 60), s = t - m * 60; return m ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3) }
export class Tower {
  el: HTMLElement; msgEl: HTMLElement; private acc = 0; open = false; private rows: HTMLElement[] = []; private msgT = 0; private q: Msg[] = []
  sim: RaceSim | null = null
  private lastNow = 0
  constructor() {
    this.el = document.createElement('div'); this.el.id = 'tower'; this.el.hidden = true
    this.el.addEventListener('pointerdown', e => { e.stopPropagation(); this.open = !this.open; this.acc = 1 })
    this.msgEl = document.createElement('div'); this.msgEl.id = 'rcmsg'; this.msgEl.hidden = true
    const hud = document.getElementById('hud')!; hud.append(this.el, this.msgEl)
    for (let i = 0; i < 20; i++) { const r = document.createElement('div'); r.className = 'tr'; r.innerHTML = '<b></b><i></i><span></span><em></em><u></u>'; this.el.appendChild(r); this.rows.push(r) }
    const h = document.createElement('div'); h.className = 'th'; this.el.prepend(h)
  }
  bind(sim: RaceSim | null) {
    this.sim = sim; this.el.hidden = !sim; this.msgEl.hidden = true; this.q = []
    if (sim) sim.onMsg = m => { if (m.kind !== 'team' || /joueur|stand/.test(m.text)) this.q.push(m); if (this.q.length > 4) this.q.shift() }
  }
  update(dt: number) {
    const S = this.sim; if (!S) return
    // messages : un à la fois, 4 s chacun (pénalités et drapeaux prioritaires)
    // horloge murale (une image lente ne fige pas le bandeau) ; messages trop anciens (> 12 s de séance) ignorés
    const now = performance.now() / 1000; this.msgT -= Math.max(dt, now - this.lastNow); this.lastNow = now
    while (this.q.length && S.t - this.q[0].t > 12) this.q.shift()
    if (this.msgT <= 0) { const m = this.q.shift(); if (m) { this.msgEl.textContent = m.text; this.msgEl.className = 'rc ' + m.kind; this.msgEl.hidden = false; this.msgT = m.kind === 'pen' || m.kind === 'flag' ? 4.5 : 3.5 } else this.msgEl.hidden = true }
    this.acc += dt; if (this.acc < 0.25) return; this.acc = 0
    const A = S.ordered(), race = S.kind === 'race', p = S.player, pk = A.indexOf(p)
    const head = this.el.firstElementChild as HTMLElement
    const C = S.ctrl
    head.textContent = race ? (C.phase === 'formation' || C.phase === 'gridding' || C.phase === 'pre' ? 'FORMATION' : C.phase === 'lights' ? 'DÉPART' : S.chequered ? 'DAMIER' : `TOUR ${Math.min(S.laps, S.leader().laps + 1)}/${S.laps}`) + (C.sc.active ? ' · SC' : C.vsc ? ' · VSC' : C.red ? ' · ROUGE' : '')
      : S.kind === 'qualifying' ? 'QUALIFICATIONS' : 'ESSAIS'
    const show = new Set<number>(); if (this.open) for (let i = 0; i < A.length; i++) show.add(i); else { for (let i = 0; i < 3; i++) show.add(i); for (let i = pk - 2; i <= pk + 2; i++) if (i >= 0 && i < A.length) show.add(i) }
    A.forEach((r: Racer, i) => {
      const row = this.rows[i], vis = show.has(i); if (row.hidden === vis) row.hidden = !vis; if (!vis) return
      const [b, ic, sp, em, u] = row.children as unknown as HTMLElement[]
      b.textContent = String(r.pos); (ic as HTMLElement).style.background = teamAccent(r.team); sp.textContent = r.code
      let g = ''
      if (r.out) g = r.out.startsWith('Élim') ? 'ÉLIM.' : 'OUT'
      else if (race) { if (i === 0) g = S.chequered ? 'VAINQ.' : 'TÊTE'; else if (r.mode === 'pit' || r.inPit) g = 'STAND'; else { const lead = A[0]; const lap = lead.dist - r.dist; g = lap > S.L ? `+${Math.floor(lap / S.L)} T` : isFinite(r.gap) ? '+' + r.gap.toFixed(1) : '' } }
      else g = isNaN(r.best) ? (r.mode === 'garage' ? 'GARAGE' : '—') : i === 0 ? f3(r.best) : '+' + r.gap.toFixed(3)
      em.textContent = g
      u.textContent = r.tyre.c; (u as HTMLElement).style.color = COMP_COLOR[r.tyre.c] ?? '#fff'
      row.className = 'tr' + (r === p ? ' me' : '') + (r.pen > 0 ? ' pen' : '')
    })
  }
}
