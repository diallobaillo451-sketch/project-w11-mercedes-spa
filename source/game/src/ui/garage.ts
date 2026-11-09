/** Garage (entre les séances du week-end) et écran de résultats, même langage visuel que le menu. */
import type { Setup } from '../physics/vehicle.ts'
import type { Compound } from '../physics/params.ts'
import { WK_ORDER, WK_SHORT, WK_LABEL, WK_DAY, WORK_MIN, applyProposal, engineerProposals, type Proposal, type SessionResult, type Telemetry, type Weekend, type WkSessionId } from '../core/weekend.ts'
import { driverById, teamAccent, TEAMS } from '../data/drivers.ts'
import { ctl, ctlCol, footnote, fmtClock, fmtTime, group, h, haptic, header, row, seg, stepper, toggle } from './kit.ts'
import type { ShowShot } from '../render/showroom.ts'

export interface GarageHost {
  wk: Weekend; setup: Setup; weather: string
  fuel(): number; setFuel(kg: number): void
  telemetry(): Telemetry; laps(): { time: number; sectors: number[]; valid: boolean }[]; best(): number | null
  remaining(): number; spend(sec: number): void; started(): boolean
  goOut(): void; endSession(): void; menu(): void; save(): void
  shot(s: ShowShot): void; lift(on: boolean): void; say(id: string): void
}
const ENG: Record<string, { name: string; photo: boolean }> = { ham: { name: 'Peter « Bono » Bonnington', photo: true }, bot: { name: 'Riccardo Musconi', photo: false } }
type Tab = 'eng' | 'setup' | 'laps'
export class Garage {
  root: HTMLElement; private G: GarageHost; private tab: Tab = 'eng'; private draft: Setup; private draftFuel = 0; private props: Proposal[] = []; private text = ''
  private panel!: HTMLElement; private body!: HTMLElement; private foot!: HTMLElement; private clock!: HTMLElement; busy = false
  constructor(root: HTMLElement, G: GarageHost) { this.root = root; this.G = G; this.draft = { ...G.setup }; this.draftFuel = G.fuel() }
  open() {
    const G = this.G, r = this.root; r.className = 'ap'; r.innerHTML = ''
    this.draft = { ...G.setup }; this.draftFuel = G.fuel()
    const cur = G.wk.cur, nxt = G.started() ? cur : cur
    const pr = engineerProposals(G.telemetry(), G.setup, nxt, G.wk.st.plan.weather, G.fuel(), G.wk.st.plan.raceLaps)
    this.props = pr.list; this.text = pr.text
    const d = driverById(G.wk.st.plan.driver)
    r.style.setProperty('--tc', teamAccent(d.team))
    r.append(h('div', 'ap-drag'))
    this.panel = h('div', 'ap-panel'); const nav = h('div', 'ap-nav'), st = h('div', 'ap-stack'); this.body = h('div', 'ap-page'); this.foot = h('div', 'ap-foot')
    st.append(this.body); this.panel.append(nav, st, this.foot)
    const mb = h('button', 'back', '<svg viewBox="0 0 12 20"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Menu</span>')
    mb.addEventListener('click', () => { haptic(); G.save(); G.menu() }); nav.append(mb)
    const sg = seg<Tab>([['eng', 'Ingénieur'], ['setup', 'Réglages'], ['laps', 'Temps']], this.tab, v => { this.tab = v; this.render() }); sg.style.cssText = 'margin-left:auto;max-width:250px'; nav.append(sg)
    // en-tête de droite : programme du week-end + chrono de séance
    const top = h('div', 'gx-top'), tl = h('div', 'gx-tl')
    for (const id of WK_ORDER) { if (G.wk.st.plan.skip.includes(id)) continue; const s = h('span', id === cur ? 'cur' : G.wk.result(id) ? 'done' : ''); s.textContent = WK_SHORT[id]; tl.append(s) }
    this.clock = h('div', 'ap-chip gx-clock'); top.append(tl, this.clock)
    const cta = h('div', 'gx-cta'), end = h('button', 'ap-btn sec', 'Fin de séance'), go = h('button', 'ap-btn', G.started() ? 'Retour en piste' : 'Sortir en piste')
    end.addEventListener('click', () => { haptic(); if (!this.busy) G.endSession() }); go.addEventListener('click', () => { haptic(); if (this.busy) return; if (this.pending().length) this.prepare(() => G.goOut()); else G.goOut() })
    cta.append(end, go)
    r.append(this.panel, top, cta)
    this.tick(); this.render(); G.shot('rear')
  }
  tick() { if (!this.clock) return; const G = this.G, id = G.wk.cur; this.clock.textContent = `${WK_DAY[id]} · ${WK_SHORT[id]} · ${id === 'RACE' ? G.wk.st.plan.raceLaps + ' tours' : fmtClock(G.remaining()) + ' restantes'}` }
  /** différences brouillon ↔ réglage monté sur la voiture */
  private pending(): (keyof Setup | 'fuel')[] {
    const k: (keyof Setup | 'fuel')[] = ['wingF', 'wingR', 'rideF', 'rideR', 'diffOn', 'diffOff', 'brakeBias', 'pressF', 'pressR', 'compound']
    const out = k.filter(x => (this.draft as unknown as Record<string, unknown>)[x] !== (this.G.setup as unknown as Record<string, unknown>)[x])
    if (Math.round(this.draftFuel) !== Math.round(this.G.fuel())) out.push('fuel')
    return out
  }
  private workMin() { return this.pending().reduce((a, k) => a + (WORK_MIN[k] ?? 2), 0) }
  private render() {
    const B = this.body, G = this.G; B.innerHTML = ''; B.scrollTop = 0
    const id = G.wk.cur, d = driverById(G.wk.st.plan.driver)
    B.append(h('div', 'ap-eyebrow', `${WK_DAY[id]} · Garage ${TEAMS[d.team].name.split(' ')[0]}`)); const t = h('div', 'ap-large'); t.textContent = WK_LABEL[id]; B.append(t)
    if (this.tab === 'eng') {
      const e = ENG[d.id] ?? { name: 'Ingénieur de course', photo: false }
      const eng = h('div', 'gx-eng'), im = h('img'); im.src = './radio/engineer.webp'; im.onerror = () => { im.style.visibility = 'hidden' }
      const bub = h('div', 'gx-bub'); const nm = h('b'); nm.textContent = e.name; bub.append(nm, document.createTextNode(this.text)); eng.append(im, bub); B.append(eng)
      if (this.props.length) {
        B.append(header('Propositions'))
        B.append(group(...this.props.map(p => { const r = row({ title: p.label, sub: p.why }); r.classList.add('gx-prop'); const dl = h('span', 'gx-delta'); dl.innerHTML = `<em>${p.from}</em> → ${p.to}`; r.insertBefore(dl, null); r.append(toggle(p.on, v => { p.on = v })); return r })))
        const b = h('button', 'ap-btn'); b.style.marginTop = '10px'; b.textContent = 'Appliquer et préparer la voiture'
        b.addEventListener('click', () => { haptic(); if (this.busy) return; for (const p of this.props) if (p.on) applyProposal(this.draft, p, kg => { this.draftFuel = kg }); this.props = this.props.filter(p => !p.on); this.prepare(() => this.render()) })
        B.append(b)
      } else B.append(footnote('Pas de changement proposé pour l’instant.'))
      B.append(footnote('Les règles de l’ingénieur sont des approximations : elles lisent l’équilibre en courbe, la vitesse de pointe, les frottements du fond, la température des pneus et les blocages de roue.'))
    } else if (this.tab === 'setup') this.setupForm(B)
    else this.lapsTab(B)
    this.footer()
  }
  private footer() {
    const F = this.foot; F.innerHTML = ''; const n = this.pending().length
    if (!n) return
    const s = h('div', 'sum'), over = this.G.wk.cur !== 'RACE' && this.workMin() * 60 > this.G.remaining(); s.textContent = `${n} modification${n > 1 ? 's' : ''} · ≈ ${this.workMin()} min de travail` + (over ? ' · plus que le temps restant : la séance se terminera au garage' : '')
    const b = h('button', 'ap-btn', 'Préparer la voiture'); b.addEventListener('click', () => { haptic(); this.prepare(() => this.render()) })
    F.append(s, b)
  }
  private setupForm(B: HTMLElement) {
    const D = this.draft, up = () => this.footer(), id = this.G.wk.cur
    const st = (v: number, o: { min: number; max: number; step: number }, f: (v: number) => string, on: (v: number) => void) => stepper(v, o, f, x => { on(x); up() })
    B.append(header('Aérodynamique'), group(
      ctl('Aileron AV', st(D.wingF, { min: 1, max: 11, step: 1 }, v => String(v), v => { D.wingF = v })),
      ctl('Aileron AR', st(D.wingR, { min: 1, max: 11, step: 1 }, v => String(v), v => { D.wingR = v }))))
    B.append(footnote('5 = niveau Spa 2020 de Mercedes. Un cran ≈ 1 % d’appui ; l’aileron AR coûte plus en ligne droite.'))
    B.append(header('Suspension'), group(
      ctl('Hauteur AV', st(D.rideF, { min: -4, max: 10, step: 1 }, v => (v > 0 ? '+' : '') + v + ' mm', v => { D.rideF = v })),
      ctl('Hauteur AR', st(D.rideR, { min: -4, max: 10, step: 1 }, v => (v > 0 ? '+' : '') + v + ' mm', v => { D.rideR = v }))))
    B.append(header('Transmission · freins'), group(
      ctl('Diff. entrée', st(Math.round(D.diffOff * 10), { min: 0, max: 10, step: 1 }, v => String(v), v => { D.diffOff = v / 10 })),
      ctl('Diff. sortie', st(Math.round(D.diffOn * 10), { min: 0, max: 10, step: 1 }, v => String(v), v => { D.diffOn = v / 10 })),
      ctl('Répartition', st(+(D.brakeBias * 100).toFixed(1), { min: 50, max: 65, step: 0.5 }, v => v.toFixed(1).replace('.', ',') + ' %', v => { D.brakeBias = v / 100 }))))
    const wet = this.G.weather === 'rain' || this.G.weather === 'wet'
    B.append(header('Pneus · Pirelli Spa 2020 (C2 · C3 · C4)'), group(
      ctlCol('Composé', seg<Compound>([['C2', 'Dur'], ['C3', 'Medium'], ['C4', 'Tendre'], ['I', 'Inter'], ['W', 'Pluie']], D.compound, v => { D.compound = v; up() }), wet ? 'piste mouillée' : 'piste sèche'),
      ctl('Pression AV', st(D.pressF, { min: 0, max: 3, step: 0.5 }, v => '+' + v.toFixed(1).replace('.', ',') + ' psi', v => { D.pressF = v }), '24,5 min.'),
      ctl('Pression AR', st(D.pressR, { min: 0, max: 3, step: 0.5 }, v => '+' + v.toFixed(1).replace('.', ',') + ' psi', v => { D.pressR = v }), '21,0 min.')))
    if (id !== 'RACE') B.append(header('Carburant'), group(ctl('Essence à bord', st(Math.round(this.draftFuel), { min: 5, max: 110, step: 5 }, v => v + ' kg', v => { this.draftFuel = v }), `≈ ${Math.floor(this.draftFuel / 2.45)} tours`)))
    B.append(footnote('Les changements ne sont montés qu’après « Préparer la voiture ». Hauteur de caisse : ≈ 12 min (planche et cales à refaire), aileron AR ≈ 6 min, AV ≈ 2 min.'))
  }
  private lapsTab(B: HTMLElement) {
    const L = this.G.laps(), best = this.G.best()
    if (!L.length) { B.append(footnote('Aucun tour chronométré dans cette séance.')); return }
    const tb = h('table', 'rs-table'); tb.innerHTML = '<tr><th>Tour</th><th>Temps</th><th>S1</th><th>S2</th><th>S3</th></tr>'
    L.forEach((l, i) => { const tr = h('tr'); tr.innerHTML = `<td class="p">${i + 1}</td><td class="t ${l.valid && l.time === best ? 'pb' : ''}">${l.valid ? fmtTime(l.time) : '<s>' + fmtTime(l.time) + '</s>'}</td>${l.sectors.map(s => `<td>${s.toFixed(3).replace('.', ',')}</td>`).join('')}`; tb.append(tr) })
    const g = h('div', 'ap-group'); g.style.padding = '4px 8px'; g.append(tb); B.append(header('Tours de la séance'), g)
  }
  /** les mécaniciens travaillent : anneau de progression, voiture sur cales, chrono de séance consommé */
  private prepare(done: () => void) {
    const n = this.pending(); if (!n.length) { done(); return }
    const min = this.workMin(), G = this.G, id = G.wk.cur
    this.busy = true; G.lift(true); G.say('garage_travail')
    const w = h('div', 'gx-work'), R = 36, C = 2 * Math.PI * R
    w.innerHTML = `<svg class="gx-ring" viewBox="0 0 86 86"><circle cx="43" cy="43" r="${R}" stroke="rgba(255,255,255,.18)"/><circle class="p" cx="43" cy="43" r="${R}" stroke="var(--a-tint)" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 43 43)"/></svg><div class="lbl"></div>`
    this.root.append(w)
    const lbl = w.querySelector('.lbl')!, pc = w.querySelector('circle.p') as SVGCircleElement
    const steps = n.map(k => ({ wingF: 'Aileron avant', wingR: 'Aileron arrière', rideF: 'Hauteur avant', rideR: 'Hauteur arrière', diffOn: 'Différentiel', diffOff: 'Différentiel', brakeBias: 'Répartition de freinage', pressF: 'Pressions avant', pressR: 'Pressions arrière', compound: 'Train de pneus', fuel: 'Carburant' } as Record<string, string>)[k] ?? k)
    const T = Math.min(4200, 1400 + min * 120), t0 = performance.now()
    const anim = () => {
      const f = Math.min(1, (performance.now() - t0) / T); pc.style.strokeDashoffset = String(C * (1 - f)); lbl.textContent = f < 1 ? `${steps[Math.min(steps.length - 1, Math.floor(f * steps.length))]}… ${Math.round(f * min)} / ${min} min` : 'Voiture prête'
      if (f < 1) requestAnimationFrame(anim)
      else setTimeout(() => {
        w.remove(); G.lift(false)
        const fuel = this.draftFuel; Object.assign(G.setup, this.draft); G.setFuel(fuel)
        if (id !== 'RACE') G.spend(min * 60)
        G.save(); this.busy = false; this.tick(); done()
      }, 450)
    }
    requestAnimationFrame(anim)
  }
}

/** écran de résultats (séance du week-end ou course rapide) */
export interface ResultsOpt { table?: { pos: number | string; code: string; name: string; team: string; time: string; laps: number | string; me: boolean; pen?: number }[]; title: string; eyebrow: string; r: SessionResult; driver: string; race: boolean; note?: string; actions: { label: string; sec?: boolean; on: () => void }[]; summary?: SessionResult[] }
export function showResults(root: HTMLElement, o: ResultsOpt) {
  root.className = 'ap'; root.innerHTML = ''
  const d = driverById(o.driver), tc = teamAccent(d.team); root.style.setProperty('--tc', tc)
  root.append(h('div', 'ap-drag'))
  const panel = h('div', 'ap-panel'), nav = h('div', 'ap-nav'), st = h('div', 'ap-stack'), B = h('div', 'ap-page'), F = h('div', 'ap-foot')
  st.append(B); panel.append(st, F); F.classList.add('row'); B.style.paddingTop = '14px'; void nav
  B.append(h('div', 'ap-eyebrow', o.eyebrow)); const t = h('div', 'ap-large'); t.textContent = o.title; B.append(t)
  const r = o.r, big = h('div', 'rs-big')
  const cell = (k: string, v: string) => { const c = h('div'); c.innerHTML = `<small>${k}</small><b>${v}</b>`; return c }
  if (o.race) big.append(cell('Temps', r.total != null ? fmtTime(r.total) : '—'), cell('Meilleur', fmtTime(r.best)), cell('Vmax', Math.round(r.vmax * 3.6) + ' km/h'))
  else big.append(cell('Meilleur', fmtTime(r.best)), cell('Tours', `${r.valid}/${r.laps}`), cell('Vmax', Math.round(r.vmax * 3.6) + ' km/h'))
  B.append(big)
  const tb = h('table', 'rs-table')
  tb.innerHTML = `<tr><th>Pos</th><th>Pilote</th><th>${o.race ? 'Temps' : 'Meilleur'}</th><th>Tours</th></tr>`
  if (o.table?.length) for (const x of o.table) { const tr = h('tr'); tr.innerHTML = `<td class="p">${x.pos}</td><td><span class="bar" style="background:${teamAccent(x.team)}"></span><b></b> <small style="opacity:.6">${TEAMS[x.team]?.short ?? ''}</small></td><td class="t">${x.time}${x.pen ? ` <small style="color:#ff6b60">(+${x.pen} s)</small>` : ''}</td><td>${x.laps}</td>`
    tr.querySelector('b')!.textContent = x.name; if (x.me) tr.style.background = 'rgba(127,127,127,.18)'; tb.append(tr) }
  else { const tr = h('tr'); tr.innerHTML = `<td class="p">${r.dnf ? 'AB' : r.pos}</td><td><span class="bar"></span><b></b> <small style="opacity:.6">${TEAMS[d.team].short ?? ''}</small></td><td class="t">${o.race ? (r.total != null ? fmtTime(r.total) : '—') : fmtTime(r.best)}</td><td>${r.laps}</td>`
  tr.querySelector('b')!.textContent = d.last.toUpperCase(); tb.append(tr) }
  const g = h('div', 'ap-group'); g.style.padding = '4px 8px'; g.append(tb)
  B.append(header('Classement'), g, footnote(o.note ?? ''))
  if (r.penalties) B.append(footnote(`Pénalités : +${r.penalties} s (incluses).`))
  if (r.bestSectors.some(isFinite)) B.append(header('Meilleurs secteurs'), group(...r.bestSectors.map((s, i) => row({ title: 'Secteur ' + (i + 1), value: isFinite(s) ? s.toFixed(3).replace('.', ',') + ' s' : '—' }))))
  if (r.lapTimes.length) B.append(header('Tours'), group(...r.lapTimes.map((x, i) => row({ title: 'Tour ' + (i + 1), value: fmtTime(Math.abs(x)) + (x < 0 ? ' (invalide)' : '') }))))
  if (o.summary?.length) B.append(header('Week-end'), group(...o.summary.map(s => row({ title: WK_LABEL[s.id as WkSessionId], value: s.id === 'RACE' ? (s.total != null ? fmtTime(s.total) : '—') : fmtTime(s.best) }))))
  for (const a of o.actions) { const b = h('button', 'ap-btn' + (a.sec ? ' sec' : '')); b.textContent = a.label; b.addEventListener('click', () => { haptic(); a.on() }); F.append(b) }
  root.append(panel)
}
