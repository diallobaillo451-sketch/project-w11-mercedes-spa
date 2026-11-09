/** Panneaux « Réglages voiture », « Options », « À propos » : construits à partir de descripteurs. */
import type { Settings } from './settings.ts'
import { QUALITY, type QualityName } from '../quality/quality.ts'
import { CAM_LABEL, CAM_ORDER } from '../render/cameras.ts'

type Field =
  | { kind: 'seg'; label: string; hint?: string; opts: [string, string][]; get: () => string; set: (v: string) => void; full?: boolean }
  | { kind: 'range'; label: string; hint?: string; min: number; max: number; step: number; fmt: (v: number) => string; get: () => number; set: (v: number) => void }
  | { kind: 'button'; label: string; hint?: string; text: string; act: () => void }
  | { kind: 'html'; html: string }

function render(body: HTMLElement, fields: Field[], onChange: () => void) {
  body.innerHTML = ''
  for (const f of fields) {
    const el = document.createElement('div')
    if (f.kind === 'html') { el.className = 'about'; el.innerHTML = f.html; body.appendChild(el); continue }
    el.className = 'f' + ((f.kind === 'seg' && f.full) ? ' full' : '')
    const lab = document.createElement('label'); lab.textContent = f.label; el.appendChild(lab)
    if (f.kind === 'seg') {
      const seg = document.createElement('div'); seg.className = 'seg'
      for (const [v, t] of f.opts) {
        const b = document.createElement('button'); b.textContent = t; b.dataset.v = v
        if (f.get() === v) b.classList.add('on')
        b.addEventListener('click', () => { f.set(v); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onChange() })
        seg.appendChild(b)
      }
      el.appendChild(seg)
    } else if (f.kind === 'range') {
      const val = document.createElement('b'); val.textContent = f.fmt(f.get()); lab.appendChild(val)
      const r = document.createElement('input'); r.type = 'range'; r.min = String(f.min); r.max = String(f.max); r.step = String(f.step); r.value = String(f.get())
      r.addEventListener('input', () => { f.set(Number(r.value)); val.textContent = f.fmt(Number(r.value)); onChange() })
      el.appendChild(r)
    } else if (f.kind === 'button') {
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = f.text
      b.addEventListener('click', () => f.act()); el.appendChild(b)
    }
    if ('hint' in f && f.hint) { const s = document.createElement('small'); s.textContent = f.hint; el.appendChild(s) }
    body.appendChild(el)
  }
}
const pct = (v: number) => (v * 100).toFixed(1).replace('.', ',') + ' %'
const yesNo: [string, string][] = [['1', 'Oui'], ['0', 'Non']]

export function setupPanel(body: HTMLElement, s: Settings, onChange: () => void) {
  const S = s.setup
  render(body, [
    { kind: 'range', label: 'Répartition de freinage (AV)', hint: 'Plus en avant = stable mais sous-vire au freinage (E)', min: 0.52, max: 0.62, step: 0.0025, fmt: pct, get: () => S.brakeBias, set: v => { S.brakeBias = v } },
    { kind: 'range', label: 'Différentiel — en charge', hint: 'Verrouillage à l’accélération (traction ↔ rotation)', min: 0.1, max: 0.9, step: 0.05, fmt: v => Math.round(v * 100) + ' %', get: () => S.diffOn, set: v => { S.diffOn = v } },
    { kind: 'range', label: 'Différentiel — hors charge', hint: 'Verrouillage au lever de pied / freinage', min: 0.05, max: 0.8, step: 0.05, fmt: v => Math.round(v * 100) + ' %', get: () => S.diffOff, set: v => { S.diffOff = v } },
    { kind: 'seg', label: 'Mode moteur', opts: [['quali', 'Qualif'], ['race', 'Course'], ['save', 'Économie']], get: () => S.engineMode, set: v => { S.engineMode = v as typeof S.engineMode } },
    { kind: 'seg', label: 'Mode ERS', opts: [['hotlap', 'Hotlap'], ['overtake', 'Dépass.'], ['balanced', 'Équilibré'], ['charge', 'Recharge']], get: () => s.ersMode, set: v => { s.ersMode = v as typeof s.ersMode } },
    { kind: 'seg', label: 'Pneus (Pirelli 2020, Spa)', hint: 'C2 dur · C3 medium · C4 tendre (gamme Spa 2020, P)', opts: [['C2', 'C2 dur'], ['C3', 'C3 medium'], ['C4', 'C4 tendre']], get: () => S.compound, set: v => { S.compound = v as typeof S.compound } },
    { kind: 'seg', label: 'DAS (Dual Axis Steering)', hint: 'Bouton DAS : volant tiré → pincement AV ≈ 0 en ligne droite', opts: yesNo, get: () => S.dasEnabled ? '1' : '0', set: v => { S.dasEnabled = v === '1' } },
    { kind: 'seg', label: 'DRS', hint: 'Zones FIA 2020 : Kemmel + ligne droite des stands (P)', opts: [['manual', 'Manuel'], ['auto', 'Auto'], ['off', 'Désactivé']], get: () => !S.drsAllowed ? 'off' : s.autoDrs ? 'auto' : 'manual', set: v => { S.drsAllowed = v !== 'off'; s.autoDrs = v === 'auto' } },
  ], onChange)
}
export function optionsPanel(body: HTMLElement, s: Settings, onChange: () => void, h: { calibrate: () => void; enableGyro: () => Promise<boolean>; gyroState: () => string; diag: () => void }) {
  const S = s.setup, I = s.input
  render(body, [
    { kind: 'seg', label: 'Direction', hint: h.gyroState(), opts: [['touch', 'Tactile (glisser)'], ['gyro', 'Gyroscope']], get: () => I.steerMode, set: v => { I.steerMode = v as typeof I.steerMode; if (v === 'gyro') void h.enableGyro().then(ok => { if (!ok) { I.steerMode = 'touch'; onChange() } }) } },
    { kind: 'button', label: 'Gyroscope — neutre', hint: 'Tiens l’iPhone droit puis touche', text: 'Calibrer', act: h.calibrate },
    { kind: 'range', label: 'Gyroscope — angle de butée', min: 15, max: 60, step: 1, fmt: v => v + '°', get: () => I.gyroRange, set: v => { I.gyroRange = v } },
    { kind: 'range', label: 'Zone morte', min: 0, max: 0.15, step: 0.01, fmt: v => Math.round(v * 100) + ' %', get: () => I.deadzone, set: v => { I.deadzone = v } },
    { kind: 'range', label: 'Lissage direction', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + ' %', get: () => I.smoothing, set: v => { I.smoothing = v } },
    { kind: 'range', label: 'Progressivité (courbe)', min: 1, max: 2.2, step: 0.05, fmt: v => v.toFixed(2), get: () => I.linearity, set: v => { I.linearity = v } },
    { kind: 'seg', label: 'Boîte', opts: [['1', 'Automatique'], ['0', 'Manuelle']], get: () => S.autoGear ? '1' : '0', set: v => { S.autoGear = v === '1' } },
    { kind: 'seg', label: 'Antipatinage', opts: [['0', 'Off'], ['1', 'Moyen'], ['2', 'Fort']], get: () => String(S.tc), set: v => { S.tc = Number(v) } },
    { kind: 'seg', label: 'ABS', opts: [['1', 'Oui'], ['0', 'Non']], get: () => S.abs ? '1' : '0', set: v => { S.abs = v === '1' } },
    { kind: 'seg', label: 'Aide direction', opts: [['0', 'Off'], ['1', 'Moyenne'], ['2', 'Forte']], get: () => String(S.steerAssist), set: v => { S.steerAssist = Number(v) } },
    { kind: 'range', label: 'Aide stabilité', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + ' %', get: () => S.stability, set: v => { S.stability = v } },
    { kind: 'seg', label: 'Caméra par défaut', opts: CAM_ORDER.map(c => [c, CAM_LABEL[c]] as [string, string]), get: () => s.camera, set: v => { s.camera = v as typeof s.camera }, full: true },
    { kind: 'seg', label: 'Qualité graphique (rechargement)', opts: (Object.keys(QUALITY) as QualityName[]).map(k => [k, QUALITY[k].label] as [string, string]), get: () => s.quality, set: v => { s.quality = v as QualityName } },
    { kind: 'seg', label: 'Résolution adaptative', opts: yesNo, get: () => s.adaptive ? '1' : '0', set: v => { s.adaptive = v === '1' } },
    { kind: 'range', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + ' %', get: () => s.volume, set: v => { s.volume = v } },
    { kind: 'seg', label: 'Compteur de performances', opts: yesNo, get: () => s.perf ? '1' : '0', set: v => { s.perf = v === '1' } },
    { kind: 'button', label: 'Diagnostic', hint: 'i/s, mémoire estimée, préréglage, dernière erreur', text: 'Ouvrir', act: () => h.diag() },
  ], onChange)
}
export function aboutPanel(body: HTMLElement) {
  render(body, [{ kind: 'html', html: `
<b>PROJECT W11</b> — jeu de fan non officiel, sans affiliation avec Mercedes-AMG Petronas F1, la FIA, la F1 ou le circuit de Spa-Francorchamps.<br>
<b>Commandes</b> : pédale droite = gaz, pédale gauche = frein (plus le doigt est haut, plus l’appui est fort). Direction : glisser à gauche de l’écran, ou gyroscope (Options). DRS dans les zones (voyant vert), DAS = maintenir. Ordinateur : flèches/WASD, Espace frein, E/Q rapports, F DRS, C caméra, R remise en piste, Échap pause.<br>
<b>Physique</b> : modèle maison (pas fixe 240 Hz, pneus type Pacejka avec température/usure/pression, suspension, aéro + DRS, hybride ERS 4 MJ/tour). Valeurs W11 marquées P (publiées) ou E (estimées) dans RESEARCH_W11.md — les spécifications exactes de la W11 ne sont pas publiques.<br>
<b>Éclairage</b> : hybride raster temps réel + éclairage précalculé (ciel physique préfiltré, ombres douces, occlusion ambiante écran). <u>Ce n’est pas du ray tracing temps réel.</u><br>
<b>Son</b> : boucles moteur dérivées d’enregistrements fournis par l’utilisateur — <u>droits d’auteur inconnus</u>. Les autres sons sont synthétisés.<br>
<b>iPhone</b> : Safari ne permet pas de verrouiller l’orientation ; pour le plein écran, « Partager → Sur l’écran d’accueil ». Le bouton silencieux de l’iPhone coupe le son Web Audio. Le gyroscope demande une autorisation.` }], () => {})
}
