/** Menu principal « style Apple » : panneau de verre + navigation en pile (ressorts), vitrine 3D à droite.
 *  Accueil → Mode → Pilote → Circuit → Voiture → Réglages de session → Départ. */
import { CARS, CIRCUITS, DRIVERS, TEAMS, driverById, teamAccent, carOfTeam } from '../data/drivers.ts'
import { BACK, CHEV, alertBox, ctl, ctlCol, footnote, fmtTime, group, h, haptic, header, row, seg, stepper, toggle } from './kit.ts'
import { REAL_MIN, WK_LABEL, WK_SHORT, type Weather } from '../core/weekend.ts'
import { loadCareer, playerPos, table, careerCalendar } from '../core/career.ts'
import type { ShowShot } from '../render/showroom.ts'

export interface Profile {
  driver: string; circuit: string; car: string; mode: 'quick' | 'weekend'; laps: number
  fpMin: [number, number, number]; qMin: [number, number, number]; raceLaps: number; shortWeekend: boolean; difficulty: number
}
export const defaultProfile = (): Profile => ({ driver: 'ham', circuit: 'bel', car: 'w11', mode: 'quick', laps: 5, fpMin: [20, 20, 15], qMin: [12, 10, 8], raceLaps: 10, shortWeekend: false, difficulty: 85 })
export interface MenuHost {
  profile: Profile; weather: Weather; damage: 'off' | 'visual' | 'real'
  save(): void
  setDriver(id: string): void
  /** voiture affichée/pilotée (id de CARS) */
  setCar(id: string): void
  shot(s: ShowShot): void
  startQuick(): void
  startWeekend(fresh: boolean): void
  weekendInProgress(): string | null
  startLegacy(k: 'timetrial' | 'practice' | 'demo'): void
  openPanel(w: 'setup' | 'options' | 'about'): void
  bestLap(): number | null
  /** carrière : libellé court (manche en cours) ou null si pas commencée */
  careerLabel(): string | null
  startCareer(): void
}
const FLAG: Record<string, string> = { GBR: 'GB', FIN: 'FI', NED: 'NL', THA: 'TH', MON: 'MC', GER: 'DE', ESP: 'ES', AUS: 'AU', FRA: 'FR', MEX: 'MX', CAN: 'CA', RUS: 'RU', ITA: 'IT', DEN: 'DK' }
export const flagEmoji = (nat: string) => [...(FLAG[nat] ?? '')].map(c => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0))).join('')
const LAP_STEPS = [1, 2, 3, 5, 8, 10, 12, 15, 22, 30, 44]
const MIN_STEPS = [3, 5, 8, 10, 12, 15, 18, 20, 25, 30, 45, 60, 90]
type PageId = 'home' | 'mode' | 'driver' | 'circuit' | 'car' | 'quick' | 'weekend' | 'career'
interface Page { id: PageId; el: HTMLElement; title: string; shot: ShowShot }

export class Menu {
  root: HTMLElement; private panel: HTMLElement; private nav: HTMLElement; private stack: HTMLElement; private foot: HTMLElement; private hero: HTMLElement; private top: HTMLElement
  private pages: Page[] = []; private flow: PageId[] | null = null
  dragEl: HTMLElement
  private H: MenuHost
  constructor(root: HTMLElement, H: MenuHost) {
    this.H = H; this.root = root; root.className = 'ap'; root.innerHTML = ''
    this.dragEl = h('div', 'ap-drag'); root.append(this.dragEl)
    this.panel = h('div', 'ap-panel'); this.nav = h('div', 'ap-nav'); this.stack = h('div', 'ap-stack'); this.foot = h('div', 'ap-foot')
    this.panel.append(this.nav, this.stack, this.foot)
    this.hero = h('div', 'ap-hero'); this.top = h('div', 'ap-top')
    root.append(this.panel, this.hero, this.top, h('div', 'ap-hint', 'Glisser pour tourner autour de la voiture'))
    this.reset()
  }
  /** retour à l'accueil (sans animation) */
  reset() { this.stack.innerHTML = ''; this.pages = []; this.flow = null; this.push('home', false); this.updHero() }
  refresh() { const p = this.pages[this.pages.length - 1]; if (!p) return; const n = this.build(p.id); p.el.replaceWith(n.el); p.el = n.el; this.chrome(); this.updHero() }
  private updHero() {
    const d = driverById(this.H.profile.driver), t = TEAMS[d.team], tc = teamAccent(d.team)
    this.root.style.setProperty('--tc', tc)
    this.hero.innerHTML = `<div class="num">${d.num}</div><div class="first">${flagEmoji(d.nat)} ${d.first}</div><div class="last">${d.last}</div><div class="team"><i></i>${t.name}</div>`
    this.hero.style.animation = 'none'; void this.hero.offsetWidth; this.hero.style.animation = ''
    const b = this.H.bestLap()
    this.top.innerHTML = ''
    const c = h('div', 'ap-chip'); c.textContent = b ? 'Record Spa · ' + fmtTime(b) : 'Saison 2020'; this.top.append(c)
  }
  private chrome() {
    const n = this.pages.length, cur = this.pages[n - 1]
    this.nav.innerHTML = ''
    if (n > 1) { const b = h('button', 'back', BACK + '<span></span>'); b.querySelector('span')!.textContent = this.pages[n - 2].title; b.addEventListener('click', () => { haptic(); this.pop() }); this.nav.append(b) }
    const t = h('div', 't'); t.textContent = cur.title; this.nav.append(t)
    this.nav.classList.toggle('sc', cur.el.scrollTop > 40)
    cur.el.onscroll = () => this.nav.classList.toggle('sc', cur.el.scrollTop > 40)
    this.footer(cur.id)
    this.H.shot(cur.shot)
  }
  private footer(id: PageId) {
    const F = this.foot; F.innerHTML = ''
    const P = this.H.profile
    if (!this.flow || id === 'home' || id === 'mode') return
    const i = this.flow.indexOf(id), last = i === this.flow.length - 1
    if (i < 0) { const b = h('button', 'ap-btn', 'OK'); b.addEventListener('click', () => { haptic(); this.pop() }); F.append(b); return }
    if (last) {
      const s = h('div', 'sum'), d = driverById(P.driver)
      s.textContent = P.mode === 'quick' ? `${d.first[0]}. ${d.last} · Spa · ${P.laps} tour${P.laps > 1 ? 's' : ''}` : `${d.first[0]}. ${d.last} · EL ${P.shortWeekend ? '3' : '1-2-3'} · Q1-Q3 · ${P.raceLaps} tours`
      const b = h('button', 'ap-btn', P.mode === 'quick' ? 'Démarrer la course' : 'Commencer le week-end')
      b.addEventListener('click', () => { haptic(); if (P.mode === 'quick') this.H.startQuick(); else this.startWk() })
      F.append(s, b)
    } else { const b = h('button', 'ap-btn', 'Continuer'); b.addEventListener('click', () => { haptic(); this.push(this.flow![i + 1]) }); F.append(b) }
  }
  private startWk() {
    const cur = this.H.weekendInProgress()
    if (cur) alertBox('Remplacer le week-end ?', `Un week-end est en cours (${cur}). Le nouveau effacera sa progression.`, [{ label: 'Annuler' }, { label: 'Remplacer', red: true, on: () => this.H.startWeekend(true) }])
    else this.H.startWeekend(true)
  }
  push(id: PageId, anim = true) {
    const p = this.build(id), prev = this.pages[this.pages.length - 1]
    this.pages.push(p); this.stack.append(p.el)
    if (anim && prev) { p.el.classList.add('out-r'); void p.el.offsetWidth; requestAnimationFrame(() => { p.el.classList.remove('out-r'); prev.el.classList.add('out-l') }) }
    else if (prev) prev.el.classList.add('out-l')
    this.chrome()
  }
  pop() {
    if (this.pages.length < 2) return
    const p = this.pages.pop()!, prev = this.pages[this.pages.length - 1]
    if (prev.id === 'home') this.flow = null
    p.el.classList.add('out-r'); prev.el.classList.remove('out-l')
    setTimeout(() => p.el.remove(), 550)
    // la page précédente reflète les choix faits (pilote, circuit…)
    const n = this.build(prev.id); n.el.className = prev.el.className; prev.el.replaceWith(n.el); prev.el = n.el
    this.chrome(); this.updHero()
  }
  private build(id: PageId): Page {
    const el = h('div', 'ap-page'), P = this.H.profile, H = this.H
    const title = (eye: string, t: string, sub?: string) => { el.append(h('div', 'ap-eyebrow', eye)); const l = h('div', 'ap-large'); l.textContent = t; el.append(l); if (sub) { const s = h('div', 'ap-subtitle'); s.textContent = sub; el.append(s) } }
    const save = () => H.save()
    switch (id) {
      case 'home': {
        title('Saison 2020 · Manche 7', 'Grand Prix de Belgique', 'Spa-Francorchamps · 7,004 km · 19 virages')
        const tiles = h('div', 'ap-tiles')
        const t1 = h('button', 'ap-tile', `<div class="k">Course rapide</div><div class="n">Départ arrêté</div><div class="d">${P.laps} tour${P.laps > 1 ? 's' : ''} · feux rouges · drapeau à damier</div>${ICON_BG.flag}`)
        t1.style.setProperty('--c1', '#0f5a52'); t1.style.setProperty('--c2', '#062320')
        const wk = H.weekendInProgress()
        const t2 = h('button', 'ap-tile', `<div class="k">${wk ? 'Reprendre' : 'Week-end complet'}</div><div class="n">${wk ? wk : 'Week-end de GP'}</div><div class="d">${wk ? 'Ton programme t’attend au garage' : 'Essais · réglages avec l’ingénieur · qualifs · course'}</div>${ICON_BG.cal}`)
        t2.style.setProperty('--c1', '#3a2a6e'); t2.style.setProperty('--c2', '#120c26')
        t1.addEventListener('click', () => { haptic(); P.mode = 'quick'; save(); this.flow = ['driver', 'circuit', 'car', 'quick']; this.push('driver') })
        t2.addEventListener('click', () => { haptic(); if (wk) H.startWeekend(false); else { P.mode = 'weekend'; save(); this.flow = ['driver', 'circuit', 'car', 'weekend']; this.push('driver') } })
        tiles.append(t1, t2); el.append(tiles)
        el.append(header('Championnat'), group(row({
          icon: 'flag', color: '#00d2be', title: 'Carrière 2020',
          sub: H.careerLabel() ?? 'Pilotes et constructeurs · la météo n’est pas choisie',
          chev: true, onTap: () => { this.flow = null; this.push('career') },
        })))
        if (wk) el.append(group(row({ icon: 'cal', color: '#5e5ce6', title: 'Nouveau week-end', sub: 'Repartir de l’EL1', chev: true, onTap: () => { P.mode = 'weekend'; save(); this.flow = ['driver', 'circuit', 'car', 'weekend']; this.push('driver') } })))
        const d = driverById(P.driver), c = CIRCUITS.find(x => x.id === P.circuit)!, car = CARS.find(x => x.id === P.car)!
        el.append(header('Ta sélection'), group(
          row({ icon: 'helmet', color: teamAccent(d.team), title: 'Pilote', value: `${d.first[0]}. ${d.last} #${d.num}`, chev: true, onTap: () => this.push('driver') }),
          row({ icon: 'pin', color: '#ff9f0a', title: 'Circuit', value: c.name, chev: true, onTap: () => this.push('circuit') }),
          row({ icon: 'car', color: '#30b0c7', title: 'Voiture', value: car.name.split(' ').slice(-3).join(' ').replace('EQ Performance', 'W11'), chev: true, onTap: () => this.push('car') })))
        el.append(header('Autres modes'), group(
          row({ icon: 'timer', color: '#ff375f', act: 'timetrial', title: 'Contre-la-montre', sub: 'Tour lancé, piste gommée', chev: true, onTap: () => H.startLegacy('timetrial') }),
          row({ icon: 'road', color: '#34c759', act: 'practice', title: 'Essais libres', sub: 'Départ des stands, sans chrono de séance', chev: true, onTap: () => H.startLegacy('practice') }),
          row({ icon: 'eye', color: '#8e8e93', act: 'demo', title: 'Tour de démonstration', sub: 'Pilote automatique, caméras TV', chev: true, onTap: () => H.startLegacy('demo') })))
        el.append(header('Réglages'), group(
          row({ icon: 'wrench', color: '#636366', act: 'setup', title: 'Réglages voiture', chev: true, onTap: () => H.openPanel('setup') }),
          row({ icon: 'gear', color: '#636366', act: 'options', title: 'Options', sub: 'Commandes, qualité, son, aides', chev: true, onTap: () => H.openPanel('options') }),
          row({ icon: 'info', color: '#636366', act: 'about', title: 'À propos', chev: true, onTap: () => H.openPanel('about') })))
        return { id, el, title: 'Accueil', shot: 'hero' }
      }
      case 'driver': {
        title(this.flow ? 'Étape 1 sur 4' : 'Grille 2020', 'Choisis ton pilote', '20 pilotes · casques et combinaisons 2020')
        const teams = Object.keys(TEAMS)
        for (const tk of teams) {
          const T = TEAMS[tk], tc = teamAccent(tk)
          el.append(header(T.name, tc))
          const g = h('div', 'ap-drivers')
          for (const d of DRIVERS.filter(x => x.team === tk)) {
            const b = h('button', 'ap-drv' + (d.id === P.driver ? ' sel' : ''))
            b.style.setProperty('--tc', tc)
            b.innerHTML = `<img alt="" loading="lazy" src="./drivers/thumb/${d.id}.webp"><span class="nm"><small>${flagEmoji(d.nat)} ${d.first}</small><b></b></span><span class="no">${d.num}</span>`
            b.querySelector('b')!.textContent = d.last
            b.addEventListener('click', () => {
              haptic(); P.driver = d.id; P.car = carOfTeam(d.team); save(); H.setDriver(d.id); H.setCar(P.car)
              el.querySelectorAll('.ap-drv').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); this.updHero(); H.shot('helmet')
              clearTimeout(this.shotT); this.shotT = window.setTimeout(() => { if (this.pages[this.pages.length - 1]?.id === 'driver') H.shot('driver') }, 2600)
            })
            g.append(b)
          }
          el.append(g)
        }
        el.append(footnote('Casques, combinaisons et gants recréés d’après les photos publiques de la saison 2020 (couleurs et motifs approximatifs, sponsors en simples marques texte). Le modèle 3D du pilote est commun.'))
        return { id, el, title: 'Pilote', shot: 'driver' }
      }
      case 'circuit': {
        title(this.flow ? 'Étape 2 sur 4' : 'Calendrier', 'Circuit', 'Calendrier 2020 · 17 manches')
        const g = group(...CIRCUITS.map(c => row({ title: c.gp === c.name ? c.name : `${c.name}`, sub: `M${c.round} · GP ${c.gp === '70e anniversaire' ? 'du 70e anniversaire' : 'de ' + c.gp} · ${c.km.toFixed(3).replace('.', ',')} km · ${c.laps} tours`,
          check: c.id === P.circuit, disabled: !c.available, badge: c.available ? undefined : 'Piste à venir', onTap: () => { P.circuit = c.id; save(); this.refresh() } })))
        el.append(g, footnote('Spa est jouable. Les autres tracés du calendrier sont dans Carrière : on les court dès que la piste est livrée, sinon la manche est simulée au barème 2020.'))
        return { id, el, title: 'Circuit', shot: 'side' }
      }
      case 'car': {
        title(this.flow ? 'Étape 3 sur 4' : 'Garage', 'Voiture', 'Monoplaces 2020')
        el.append(group(...CARS.map(c => row({ title: c.name, sub: TEAMS[c.team].name, check: c.id === P.car, disabled: !c.available, badge: c.available ? undefined : 'Bientôt', onTap: () => { P.car = c.id; if (driverById(P.driver).team !== c.team) { P.driver = DRIVERS.find(d => d.team === c.team)!.id; H.setDriver(P.driver) } save(); H.setCar(c.id); this.refresh() } }))))
        el.append(footnote('Choisir un pilote installe la voiture de son équipe, et inversement. Williams : modèle FW42 (2019) utilisé pour la FW43 de 2020. Modèles 3D : crédits dans « À propos ».'))
        return { id, el, title: 'Voiture', shot: 'rear' }
      }
      case 'quick': {
        title('Étape 4 sur 4', 'Course rapide', 'Départ arrêté depuis la pole, feux rouges')
        const presets = h('div'); presets.style.cssText = 'display:flex;gap:6px'
        let st: HTMLElement & { set?: (x: number) => void }
        const setLaps = (v: number) => { P.laps = v; save(); st.set?.(v); this.footer('quick') }
        st = stepper(P.laps, LAP_STEPS, v => `${v} tour${v > 1 ? 's' : ''}`, v => { P.laps = v; save(); this.footer('quick') })
        el.append(header('Course'), group(ctl('Tours', st), ctlCol('Distance', seg<number>([[3, 'Sprint'], [11, '25 %'], [22, '50 %'], [44, '100 %']], P.laps, setLaps), `${(P.laps * 7.004).toFixed(1).replace('.', ',')} km`)))
        this.conditions(el)
        el.append(header('Adversaires'), group(
          row({ title: 'Plateau', sub: '19 monoplaces 2020 · course, essais et qualifications', value: '20 voitures' }),
          ctl('Difficulté IA', stepper(P.difficulty, { min: 40, max: 100, step: 5 }, v => `${v} %`, v => { P.difficulty = v; save() }), '40 novice · 100 réaliste'),
        ))
        el.append(footnote('Aides au pilotage et commandes : Accueil → Options.'))
        return { id, el, title: 'Course rapide', shot: 'rear' }
      }
      case 'weekend': {
        title('Étape 4 sur 4', 'Week-end de GP', 'Programme du vendredi au dimanche')
        const fp = (i: 0 | 1 | 2) => ctl(WK_LABEL[(['FP1', 'FP2', 'FP3'] as const)[i]], stepper(P.fpMin[i], MIN_STEPS, v => v + ' min', v => { P.fpMin[i] = v; save() }), `réel ${REAL_MIN[(['FP1', 'FP2', 'FP3'] as const)[i]]}`)
        const fpg = group(...(P.shortWeekend ? [fp(2)] : [fp(0), fp(1), fp(2)]))
        el.append(header('Vendredi · Samedi — Essais libres'), fpg)
        el.append(group(ctl('Week-end court (EL3 seulement)', toggle(P.shortWeekend, v => { P.shortWeekend = v; save(); this.refresh() }))))
        const qs = [0, 1, 2].map(i => stepper(P.qMin[i], MIN_STEPS, v => v + ' min', v => { P.qMin[i] = v; save() }) as HTMLElement & { set?: (x: number) => void })
        const qFmt = P.qMin.join('/') === '18/15/12' ? 'real' : P.qMin.join('/') === '6/5/4' ? 'short' : P.qMin.join('/') === '12/10/8' ? 'mid' : 'custom'
        el.append(header('Samedi — Qualifications'), group(
          ctlCol('Format', seg<string>([['short', 'Court'], ['mid', 'Moyen'], ['real', 'Réel'], ['custom', 'Perso']], qFmt, v => { const m: Record<string, number[]> = { short: [6, 5, 4], mid: [12, 10, 8], real: [18, 15, 12] }; if (m[v]) { P.qMin = m[v] as [number, number, number]; qs.forEach((s, i) => s.set?.(P.qMin[i])); save() } })),
          ...(['Q1', 'Q2', 'Q3'] as const).map((q, i) => ctl(q, qs[i], `réel ${REAL_MIN[q]}`))))
        let rs: HTMLElement & { set?: (x: number) => void }
        rs = stepper(P.raceLaps, LAP_STEPS, v => `${v} tour${v > 1 ? 's' : ''}`, v => { P.raceLaps = v; save(); this.footer('weekend') })
        el.append(header('Dimanche — Course'), group(ctl('Tours', rs), ctlCol('Distance', seg<number>([[5, 'Courte'], [11, '25 %'], [22, '50 %'], [44, '100 %']], P.raceLaps, v => { P.raceLaps = v; save(); rs.set?.(v); this.footer('weekend') }), 'réel 44 tours')))
        this.conditions(el)
        el.append(footnote('Entre chaque séance tu rentres au garage : l’ingénieur analyse la télémétrie et propose des réglages (ailerons, hauteur de caisse, différentiel, freins, pressions, pneus) que les mécaniciens préparent. Le chrono de séance continue pendant le travail des mécaniciens.'))
        void WK_SHORT
        return { id, el, title: 'Week-end', shot: 'rear' }
      }
      case 'career': {
        title('Championnat', 'Carrière', 'Tu ne choisis pas la météo. Les aléas (pluie, safety car, panne) sont tirés.')
        el.append(group(
          row({ title: 'Baquet', value: `${driverById(P.driver).last} · ${TEAMS[driverById(P.driver).team].name}` }),
          row({ title: 'Difficulté', value: `${P.difficulty} %` }),
          row({ title: 'État', value: H.careerLabel() ?? 'Pas commencée' }),
        ))
        el.append(footnote('Points 2020 : 25-18-15-12-10-8-6-4-2-1 et 1 point du meilleur tour s’il est dans les 10. Spa se court vraiment. Les autres manches du calendrier disponible sont simulées tant que leur piste n’est pas livrée. Mugello, Sotchi, Portimão, Istanbul et Sakhir Outer ne sont pas au calendrier.'))
        const saved = loadCareer()
        if (saved) {
          const pilots = table(saved.points).slice(0, 8)
          const teams = table(saved.constructors).slice(0, 5)
          el.append(header('Pilotes'))
          el.append(group(...pilots.map(([id, pts], i) => row({ title: `${i + 1}. ${driverById(id).last}`, value: `${pts} pt${pts > 1 ? 's' : ''}`, check: id === saved.driver }))))
          el.append(header('Constructeurs'))
          el.append(group(...teams.map(([id, pts], i) => row({ title: `${i + 1}. ${TEAMS[id]?.name ?? id}`, value: String(pts) }))))
          const cal = careerCalendar()
          const nxt = cal[saved.round]
          if (nxt) el.append(footnote(`Prochaine manche : ${nxt.gp}${nxt.available ? '' : ' (simulée)'} · toi P${playerPos(saved)}.`))
        }
        const b = h('button', 'ap-btn', H.careerLabel() ? 'Manche suivante' : 'Commencer la carrière')
        b.addEventListener('click', () => { haptic(); H.startCareer() })
        el.append(b)
        return { id, el, title: 'Carrière', shot: 'side' }
      }
      default: return this.build('home')
    }
  }
  private shotT = 0
  private conditions(el: HTMLElement) {
    const H = this.H
    el.append(header('Conditions'), group(
      ctlCol('Météo', seg<Weather>([['dry', 'Sec'], ['damp', 'Humide'], ['wet', 'Mouillé'], ['rain', 'Pluie']], H.weather, v => { H.weather = v; H.save() })),
      ctlCol('Dégâts', seg<'off' | 'visual' | 'real'>([['off', 'Aucun'], ['visual', 'Visuels'], ['real', 'Réalistes']], H.damage, v => { H.damage = v; H.save() }))))
  }
}
const ICON_BG = {
  flag: '<svg class="bg" viewBox="0 0 24 24"><path d="M5 21V4h13l-2.5 4.5L18 13H5" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
  cal: '<svg class="bg" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
}
void CHEV
