/** Point d'entrée : chargement, menus, boucle de jeu (physique 240 Hz → rendu interpolé → audio). */
import './ui/style.css'
import './ui/apple.css'
import * as THREE from 'three'
import { TrackSurface } from './track/surface.ts'
import { Barriers } from './track/barriers.ts'
import { Pitlane, type PitlaneData } from './track/pitlane.ts'
import { Game } from './core/game.ts'
import { Renderer } from './render/renderer.ts'
import { CAM_LABEL, CAM_ORDER, type CamMode } from './render/cameras.ts'
import { Input } from './controls/input.ts'
import { AudioEngine, type AudioFrame } from './audio/audio.ts'
import { AdaptiveResolution } from './quality/quality.ts'
import { loadSettings, saveSettings } from './ui/settings.ts'
import { aboutPanel, optionsPanel, setupPanel } from './ui/panels.ts'
import { Hud } from './ui/hud.ts'
import { WheelDisplay } from './ui/wheel.ts'
import { FLAG_LABEL } from './core/session.ts'
import { fmt } from './timing/timing.ts'
import { Radio } from './audio/radio.ts'
import { diag, dlog, derr, decideSafe, watchdog, bootDone, fatal, reloadSafe, gpuLost } from './diag.ts'
import { diagPanel } from './ui/diagPanel.ts'
import type { SessionKind } from './core/session.ts'
import { Menu } from './ui/menu.ts'
import { Garage, showResults } from './ui/garage.ts'
import { driverById, carOfTeam } from './data/drivers.ts'
import { applyCarPhysics } from './physics/cars2020.ts'
import { Weekend, WK_LABEL, WK_SHORT, WK_ORDER, newTelemetry, sampleTelemetry, sessionKind, sessionMinutes, type SessionResult, type Telemetry, type WkSessionId, type WeekendPlan } from './core/weekend.ts'
import { fmtClock } from './ui/kit.ts'

const $ = (id: string) => document.getElementById(id)!
const show = (id: string, on: boolean) => { $(id).hidden = !on }
const settings = loadSettings()
let game: Game, ren: Renderer
const input = new Input(settings.input)
const audio = new AudioEngine()
const adapt = new AdaptiveResolution()
let hud: Hud
let wheel: WheelDisplay | null = null
const ws = { pitLim: false, ot: false, otT: 0, prevErs: 'hotlap' as string }
type Screen = 'boot' | 'menu' | 'drive' | 'pause' | 'garage' | 'results'
let screen: Screen = 'boot'
let mode: SessionKind | 'demo' = 'demo'
const params = new URLSearchParams(location.search)
decideSafe(params)

let lastLabel = ''
function bootProgress(label: string, f: number) {
  diag.lastProgress = performance.now(); if (label !== lastLabel) { lastLabel = label; dlog(label) }
  $('bootText').textContent = label + (diag.safe ? ' · mode sans échec' : ''); ($('bootBar') as HTMLElement).style.width = Math.round(f * 100) + '%' }

let pitData: PitlaneData | null = null
async function loadTrack(): Promise<TrackSurface> {
  bootProgress('Surface de piste…', 0.02)
  const [meta, bin, bar] = await Promise.all([fetch('./track/surface.json').then(r => r.json()), fetch('./track/surface.bin').then(r => r.arrayBuffer()),
    fetch('./track/barriers.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)])
  const t = new TrackSurface(meta, new Uint16Array(bin)); if (bar) t.barriers = new Barriers(bar)
  pitData = await fetch('./track/pitlane.json').then(r => r.ok ? r.json() : null).catch(() => null)
  return t
}
let appliedTyres = '', lastPunct = '00000000'
function applySettings() {
  const prevC = game.car.setup.compound
  Object.assign(game.car.setup, settings.setup)
  // météo : la piste se mouille / s'assèche ; pneus : un changement de composé ou de couvertures monte un train neuf
  if (game.env.weather !== settings.weather) game.setWeather(settings.weather)
  const tk = settings.setup.compound + settings.blanketF + '/' + settings.blanketR
  if (tk !== appliedTyres || prevC !== settings.setup.compound) { appliedTyres = tk; game.car.fitTyres(settings.setup.compound, settings.blanketF, settings.blanketR) }
  game.car.damageMode = settings.damage
  game.car.ers.mode = settings.ersMode
  input.set = settings.input
  document.body.classList.toggle('gyro', settings.input.steerMode === 'gyro')
  document.body.classList.toggle('autogear', settings.setup.autoGear)
  show('bDas', settings.setup.dasEnabled)
  show('perf', settings.perf)
  adapt.enabled = settings.adaptive
  if (!settings.adaptive && adapt.step !== 0) { adapt.reset(); ren.setScale(1); ren.setFx(0) }
  audio.setVolume(settings.volume)
  radio.enabled = settings.radio; radio.setVolume(settings.radioVol)
  saveSettings(settings)
}
const CAM_SHORT: Record<CamMode, string> = { chase: 'Poursuite', close: 'Proche', tcam: 'T-cam', cockpit: 'Cockpit', tv: 'TV', free: 'Libre' }
function setCam(m: CamMode) { ren.cams.setMode(m); $('bCam').textContent = CAM_SHORT[m]; $('bCam').title = CAM_LABEL[m] }
function startSession(k: SessionKind | 'demo', keepRun = false) {
  if (!keepRun) run = null
  mode = k
  game.autopilot = k === 'demo'
  game.start(k === 'demo' ? 'timetrial' : k)
  appliedTyres = ''
  game.paused = false
  applySettings()
  setScreen('drive')
  setCam(k === 'demo' ? 'tv' : settings.camera)
  $('hSess').hidden = !run
  if (run) { game.car.fuel = run.fuel; run.started = true; run.goT = game.time; run.pen0 = game.penalties; run.tel = newTelemetry() }
  lapsDone = 0; if (k === 'timetrial') { radio.say('radio_check', 0); radio.say('tour_lance_go', 0) } else if (k === 'practice') { radio.say('radio_check', 0); radio.say('sortie_garage', 0) }
  if (k === 'race') { radio.say('radio_check', 0); hud.toast('Course · tour de formation terminé, place aux feux', 2600) }
  else if (k === 'qualifying') { radio.say('radio_check', 0); radio.say('sortie_garage', 0); hud.toast((run?.id ? WK_LABEL[run.id] : 'Qualifications') + ' · départ des stands') }
  else hud.toast(k === 'timetrial' ? 'Contre-la-montre · tour lancé' : k === 'practice' ? (run?.id ? WK_LABEL[run.id] : 'Essais libres') + ' · départ des stands' : 'Démo : pilote automatique')
}
function setScreen(s: Screen) {
  screen = s
  const studio = s === 'menu' || s === 'garage' || s === 'results'
  if (studio && !ren.show.active) ren.enterShowroom(); else if (!studio && s !== 'boot' && ren.show.active) ren.exitShowroom()
  if (s !== 'boot') audio.setMuted(studio || settings.muted)
  show('boot', s === 'boot'); show('menu', s === 'menu'); show('pause', s === 'pause'); show('garage', s === 'garage'); show('results', s === 'results')
  show('lights', s === 'drive' && !!run && run.kind !== 'legacy' && sessionKindOf(run) === 'race' && !run.lightsDone)
  const wkDrive = !!run && run.kind === 'weekend' && run.id !== 'RACE'
  show('pGarage', wkDrive); show('pRestart', !run || run.kind === 'quick'); $('pMenu').textContent = run?.kind === 'weekend' ? 'Quitter' : 'Menu'
  show('hud', s === 'drive' || s === 'pause')
  show('controls', s === 'drive' && !game?.autopilot)
  show('panel', false)
  if (s === 'menu') menu?.refresh()
  if (game) game.paused = s !== 'drive'
}
let panelBack: Screen = 'menu', panelQ = ''
function openPanel(which: 'setup' | 'options' | 'about' | 'diag') {
  panelBack = screen; panelQ = settings.quality
  $('panelTitle').textContent = which === 'setup' ? 'Réglages voiture' : which === 'options' ? 'Options' : which === 'diag' ? 'Diagnostic' : 'À propos'
  const body = $('panelBody')
  const prevQ = settings.quality
  if (which === 'setup') setupPanel(body, settings, applySettings)
  else if (which === 'options') optionsPanel(body, settings, () => {
    applySettings()
    if (settings.quality !== prevQ) hud.toast('Qualité appliquée au prochain chargement', 2600)
  }, {
    calibrate: () => { input.calibrate(); hud.toast('Gyroscope calibré') },
    enableGyro: async () => { const ok = await input.enableGyro(); if (!ok) hud.toast('Gyroscope refusé ou indisponible', 2600); return ok },
    diag: () => openPanel('diag'),
    gyroState: () => input.gyroOK ? 'Gyroscope autorisé' : input.gyroDenied ? 'Gyroscope refusé (Réglages Safari)' : 'Le gyroscope demandera une autorisation',
  })
  else if (which === 'diag') diagPanel(body, () => ren, () => adapt, reloadSafe)
  else aboutPanel(body)
  show('menu', false); show('pause', false); show('panel', true)
  if (game) game.paused = true
}
function closePanel() {
  show('panel', false)
  if (panelBack === 'menu') setScreen('menu'); else setScreen('pause')
  // rechargement seulement si la qualité a été CHANGÉE dans ce panneau (?q= de l'URL peut différer du réglage enregistré)
  if (panelQ && settings.quality !== panelQ) { saveSettings(settings); location.reload() }
}

function syncWheelPad() {
  const S = settings.setup, c = game.car
  $('wBB').textContent = (S.brakeBias * 100).toFixed(1).replace('.', ','); $('wDin').textContent = String(Math.round(S.diffOff * 10)); $('wDout').textContent = String(Math.round(S.diffOn * 10)); $('wTC').textContent = String(S.tc)
  $('wStrat').textContent = S.engineMode === 'quali' ? 'STRAT 1' : S.engineMode === 'race' ? 'STRAT 5' : 'STRAT 9'; $('wErs').textContent = 'ERS ' + ({ hotlap: 'HOT', balanced: 'BAL', charge: 'CHG', overtake: 'OT' } as Record<string, string>)[c.ers.mode]
  for (const [id, on] of [['wPit', ws.pitLim], ['wOt', ws.ot], ['bPit', ws.pitLim], ['bOt', ws.ot]] as [string, boolean][]) $(id).classList.toggle('on', on)
  $('bPit').classList.add('pit'); $('bOt').classList.add('ot')
}
function wireUi() {
  document.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act!
    if (a === 'timetrial' || a === 'practice' || a === 'demo') startSession(a)
    else if (a === 'garage') openGarage()
    else if (a === 'setup' || a === 'options' || a === 'about') openPanel(a)
    else if (a === 'resume') setScreen('drive')
    else if (a === 'restart') { if (run?.kind === 'quick') startQuick(); else startSession(mode) }
    else if (a === 'reset') { game.resetCar(); setScreen('drive') }
    else if (a === 'menu') { if (run?.kind === 'weekend') saveRun(); run = null; game.autopilot = true; setCam('tv'); menu.reset(); setScreen('menu') }
  }))
  $('panelClose').addEventListener('click', closePanel)
  $('bPause').addEventListener('click', () => setScreen(screen === 'pause' ? 'drive' : 'pause'))
  $('bCam').addEventListener('click', () => { const i = CAM_ORDER.indexOf(ren.cams.mode); const m = CAM_ORDER[(i + 1) % CAM_ORDER.length]; setCam(m); if (!game.autopilot) { settings.camera = m; saveSettings(settings) } })
  input.bindPedal($('pThrottle'), 'throttle'); input.bindPedal($('pBrake'), 'brake')
  input.bindSteerZone($('steerZone'), $('steerKnob'))
  input.bindTap($('bUp'), () => { input.st.shiftUp = true }); input.bindTap($('bDown'), () => { input.st.shiftDown = true })
  input.bindTap($('bDrs'), () => { input.st.drs = true })
  input.bindHold($('bDas'), v => { input.st.das = v })
  // ---- volant : boutons et rotatifs (reliés à la physique)
  const RADIO = ['Bono : « Rythme cible 1:41,5, pneus dans la fenêtre »', 'Bono : « Batterie OK pour le tour »', 'Bono : « Attention au vent dans Kemmel »', 'Bono : « Mode Strat 1 autorisé »', 'Bono : « Freins AV un peu chauds, BB +0,5 »', 'Bono : « Le gravier sort à Raidillon, reste propre »']
  const wAct = (a: string) => {
    const c = game.car, S = settings.setup, cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    switch (a) {
      case 'bb-': S.brakeBias = cl(+(S.brakeBias - 0.005).toFixed(3), 0.5, 0.65); wheel?.say('BBAL ' + (S.brakeBias * 100).toFixed(1)); break
      case 'bb+': S.brakeBias = cl(+(S.brakeBias + 0.005).toFixed(3), 0.5, 0.65); wheel?.say('BBAL ' + (S.brakeBias * 100).toFixed(1)); break
      case 'din-': S.diffOff = cl(+(S.diffOff - 0.1).toFixed(2), 0, 1); wheel?.say('DIFF ENTRÉE ' + Math.round(S.diffOff * 10)); break
      case 'din+': S.diffOff = cl(+(S.diffOff + 0.1).toFixed(2), 0, 1); wheel?.say('DIFF ENTRÉE ' + Math.round(S.diffOff * 10)); break
      case 'dout-': S.diffOn = cl(+(S.diffOn - 0.1).toFixed(2), 0, 1); wheel?.say('DIFF SORTIE ' + Math.round(S.diffOn * 10)); break
      case 'dout+': S.diffOn = cl(+(S.diffOn + 0.1).toFixed(2), 0, 1); wheel?.say('DIFF SORTIE ' + Math.round(S.diffOn * 10)); break
      case 'tc-': S.tc = cl(S.tc - 1, 0, 2); wheel?.say('TC ' + S.tc); break
      case 'tc+': S.tc = cl(S.tc + 1, 0, 2); wheel?.say('TC ' + S.tc); break
      case 'strat': { const M = ['quali', 'race', 'save'] as const; S.engineMode = M[(M.indexOf(S.engineMode as typeof M[number]) + 1) % 3]; wheel?.say(S.engineMode === 'quali' ? 'STRAT 1 QUALI' : S.engineMode === 'race' ? 'STRAT 5 COURSE' : 'STRAT 9 ÉCO'); break }
      case 'ers': { const E = ['hotlap', 'balanced', 'charge'] as const; settings.ersMode = E[(E.indexOf(settings.ersMode as typeof E[number]) + 1) % 3]; if (!ws.ot) c.ers.mode = settings.ersMode; wheel?.say('ERS ' + settings.ersMode.toUpperCase()); break }
      case 'page': if (wheel) { wheel.page = (wheel.page + 1) % wheel.pages; wheel.say(['COURSE', 'PNEUS / FREINS', 'RÉGLAGES'][wheel.page], 1) } break
      case 'drs': input.st.drs = true; break
      case 'pit': ws.pitLim = !ws.pitLim; wheel?.say(ws.pitLim ? 'LIMITEUR 80 km/h' : 'LIMITEUR OFF'); audio.beep(ws.pitLim ? 1320 : 880); break
      case 'ot': ws.ot = !ws.ot; if (ws.ot) { ws.prevErs = settings.ersMode; c.ers.mode = 'overtake'; ws.otT = 8 } else c.ers.mode = settings.ersMode; wheel?.say(ws.ot ? 'OVERTAKE' : 'OT OFF'); break
      case 'n': if (c.speed < 2) { c.gear = 0; wheel?.say('NEUTRE') } else wheel?.say('N : à l’arrêt seulement'); break
      case 'radio': { const m = RADIO[Math.floor(Math.random() * RADIO.length)]; hud.toast(m, 3200); wheel?.say('RADIO'); audio.radio(); break }
      case 'ack': game.session.setFlag('none', 0); wheel?.say('OK'); break
    }
    applySettings(); syncWheelPad()
  }
  document.querySelectorAll<HTMLElement>('[data-w]').forEach(b => input.bindTap(b, () => wAct(b.dataset.w!)))
  input.bindTap($('bPit'), () => wAct('pit')); input.bindTap($('bOt'), () => wAct('ot'))
  $('bWheel').addEventListener('click', () => { const p = $('wheelPad'); p.hidden = !p.hidden; $('bWheel').classList.toggle('on', !p.hidden); syncWheelPad() })
  addEventListener('keydown', e => {
    if (screen === 'boot') return
    if (e.code === 'Escape' || e.code === 'KeyP') setScreen(screen === 'pause' ? 'drive' : screen === 'drive' ? 'pause' : screen)
    if (e.code === 'KeyC' && screen === 'drive') $('bCam').click()
    if (e.code === 'KeyR' && screen === 'drive') game.resetCar()
    if (e.code === 'KeyX') input.st.das = true
  })
  addEventListener('keyup', e => { if (e.code === 'KeyX') input.st.das = false })
  // caméra libre : glisser au centre de l'écran
  const cv = ren.canvas; let drag: { x: number; y: number } | null = null
  cv.addEventListener('pointerdown', e => { if (ren.cams.mode === 'free') drag = { x: e.clientX, y: e.clientY } })
  addEventListener('pointermove', e => { if (!drag) return; ren.cams.orbitYaw -= (e.clientX - drag.x) * 0.008; ren.cams.orbitPitch = THREE.MathUtils.clamp(ren.cams.orbitPitch + (e.clientY - drag.y) * 0.006, -0.05, 1.3); drag = { x: e.clientX, y: e.clientY } })
  addEventListener('pointerup', () => { drag = null })
  cv.addEventListener('wheel', e => { ren.cams.orbitDist = THREE.MathUtils.clamp(ren.cams.orbitDist * (1 + e.deltaY * 0.001), 3.5, 30) }, { passive: true })
  addEventListener('resize', () => ren.resize())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.suspend(); if (screen === 'drive') setScreen('pause') } else audio.resume()
  })
  // iOS : empêcher le zoom / défilement par geste
  document.addEventListener('gesturestart', e => e.preventDefault())
  document.addEventListener('touchmove', e => { if (!(e.target as HTMLElement).closest('#panelBody, .ap-page')) e.preventDefault() }, { passive: false })
  // vitrine 3D : glisser pour tourner autour de la voiture
  let sd: { x: number; y: number } | null = null
  document.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest?.('.ap-drag')) sd = { x: e.clientX, y: e.clientY } })
  addEventListener('pointermove', e => { if (!sd) return; ren.show.drag(e.clientX - sd.x, e.clientY - sd.y); sd = { x: e.clientX, y: e.clientY } })
  addEventListener('pointerup', () => { if (sd) ren.show.release(); sd = null }); addEventListener('pointercancel', () => { if (sd) ren.show.release(); sd = null })
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', e => ren.show.setTheme(e.matches))
}

// ---------- boucle
const camF = new THREE.Vector3(), camU = new THREE.Vector3(), carF = new THREE.Vector3()
const aFrame: AudioFrame = { rpm: 0, throttle: 0, speed: 0, slip: 0, kerb: 0, gravel: 0, scrape: 0, impact: 0, shift: 0, gear: 0, limiter: false, ers: 0, inside: false, pan: 0, dist: 1, radialV: 0,
  grass: 0, cam: 'chase', src: [0, 0, 0], fwd: [0, 0, -1], lis: [0, 0, 0], lisF: [0, 0, -1], lisU: [0, 1, 0] }
const rightV = new THREE.Vector3(), camPrev = new THREE.Vector3(), carW = new THREE.Vector3(), tmp = new THREE.Vector3()
let last = performance.now(), fpsAcc = 0, fpsN = 0, prevDist = 0
let skipAcc = 0
function frame(now: number) {
  requestAnimationFrame(frame)
  // 2K · 30 i/s : une image sur deux sur un écran 60 Hz (cadence régulière, sans à-coups)
  const fps30 = ren.q.fps <= 30 || adapt.lock30
  if (fps30 && !(window as unknown as { __w11?: { fixedDt?: number } }).__w11?.fixedDt) { skipAcc += now - last; if (skipAcc < 30) { last = now; return } }
  const dtMs = fps30 ? skipAcc + 0 : now - last; skipAcc = 0; last = now
  // tests : pas d'image imposé (rendu logiciel lent → simulation en temps « image par image »)
  const fixed = (window as unknown as { __w11?: { fixedDt?: number } }).__w11?.fixedDt
  const dt = fixed ?? Math.min(0.1, dtMs / 1000)
  if (ren.show.active && (screen === 'menu' || screen === 'garage' || screen === 'results')) { ren.showroomFrame(Math.min(dt, 0.05)); garageTick(); return }
  const st = input.poll(dt, settings.setup.autoGear)
  const c = game.car
  game.ctl.throttle = st.throttle; game.ctl.brake = st.brake; game.ctl.steer = st.steer
  if (st.shiftUp) game.ctl.shiftUp = true
  if (st.shiftDown) game.ctl.shiftDown = true
  input.consumeShifts()
  if (st.drs || (settings.autoDrs && c.drsAvailable && st.brake < 0.05)) game.ctl.drs = true
  else game.ctl.drs = c.drsOpen // reste ouvert jusqu'au freinage (logique dans la physique)
  st.drs = false
  game.ctl.das = settings.setup.dasEnabled && st.das
  game.ctl.pitLim = ws.pitLim
  if (ws.ot) { ws.otT -= dt; if (ws.otT <= 0 || c.ers.soc < 0.3e6) { ws.ot = false; c.ers.mode = settings.ersMode; syncWheelPad() } }
  if (run && screen === 'drive') runPre(dt)
  game.advance(screen === 'drive' ? dt : 0)
  const ev = game.events
  if (run && screen === 'drive') runPost(dt)
  if (ev.lap) hud.toast((ev.lap.best ? 'Meilleur tour ! ' : 'Tour ') + fmt(ev.lap.time) + (ev.lap.valid ? '' : ' (invalide)'), 3200)
  else if (ev.invalid && !game.autopilot) hud.toast('Tour invalidé · limites de piste', 2000)
  else if (ev.reset) hud.toast('Remise en piste')
  if (ev.pitEntry && !game.autopilot) { hud.toast('Voie des stands · limiteur 80 km/h', 2400); wheel?.say('PIT LIMITER'); audio.beep(1320) }
  if (ev.pitExit && !game.autopilot) { hud.toast('Sortie des stands', 1800); wheel?.say('PIT EXIT'); audio.beep(880) }
  if (ev.repair) { hud.toast('Réparations effectuées au stand', 2400); wheel?.say('REPARE') }
  if (ev.pitSpeeding) { hud.toast(`Excès de vitesse dans les stands (${ev.pitSpeeding} km/h) · pénalité +5 s`, 3600); wheel?.say('PENALITE +5 s') }
  // tremblement caméra : vibreurs, herbe, gravier, chocs
  let kerb = 0, gravel = 0, slip = 0
  for (const w of c.wheels) { if (!w.contact) continue; if (w.type === 2) kerb += 0.25; if (w.type >= 4) gravel += 0.25; slip = Math.max(slip, Math.abs(w.slipVel ?? 0)) }
  const spd = c.speed
  const shake = Math.min(1, kerb * Math.min(1, spd / 30) * 0.8 + gravel * Math.min(1, spd / 20) + game.maxImpact * 0.3)
  ren.frame(game, dt, shake)
  // audio : position de la voiture relative à la caméra
  const cam = ren.cams.cam
  carW.copy(ren.car.position)
  const dist = cam.position.distanceTo(carW)
  const radialV = dt > 0 ? -(dist - prevDist) / dt : 0; prevDist = dist
  tmp.copy(carW).sub(cam.position).normalize()
  const right = rightV.set(1, 0, 0).applyQuaternion(cam.quaternion)
  const inside = ren.cams.mode === 'cockpit' || ren.cams.mode === 'tcam'
  let grassA = 0, gravelA = 0
  for (const w of c.wheels) { if (!w.contact) continue; if (w.type === 4) grassA += 0.25; else if (w.type === 5) gravelA += 0.25 }
  camF.set(0, 0, -1).applyQuaternion(cam.quaternion); camU.set(0, 1, 0).applyQuaternion(cam.quaternion); carF.set(0, 0, -1).applyQuaternion(ren.car.quaternion)
  aFrame.rpm = c.rpmVis; aFrame.throttle = c.throttleApplied ?? st.throttle; aFrame.speed = spd; aFrame.slip = slip; aFrame.kerb = kerb; aFrame.gravel = gravelA; aFrame.grass = grassA
  aFrame.scrape = game.maxScrape; aFrame.impact = game.maxImpact; if (c.hitKind) aFrame.hitKind = c.hitKind; aFrame.shift = game.shifts; aFrame.gear = c.gear; aFrame.limiter = c.limiter; aFrame.ers = (c.ers.kPower ?? 0) / 120_000
  aFrame.inside = inside; aFrame.pan = inside ? 0 : THREE.MathUtils.clamp(tmp.dot(right), -1, 1); aFrame.dist = inside ? 1 : dist; aFrame.radialV = inside ? 0 : radialV; aFrame.cam = ren.cams.mode
  aFrame.src![0] = carW.x; aFrame.src![1] = carW.y + 0.5; aFrame.src![2] = carW.z; aFrame.fwd![0] = carF.x; aFrame.fwd![1] = carF.y; aFrame.fwd![2] = carF.z
  aFrame.lis![0] = cam.position.x; aFrame.lis![1] = cam.position.y; aFrame.lis![2] = cam.position.z
  aFrame.lisF![0] = camF.x; aFrame.lisF![1] = camF.y; aFrame.lisF![2] = camF.z; aFrame.lisU![0] = camU.x; aFrame.lisU![1] = camU.y; aFrame.lisU![2] = camU.z
  { const e = game.env, cw = game.car.wheels; aFrame.rain = e.rainRate; aFrame.wet = e.water[e.idx(game.car.s, game.car.d)]
    aFrame.lock = game.car.brakeApplied > 0.1 && game.car.speed > 6 ? Math.max(0, ...cw.map(w => w.contact && Math.abs(w.omega * w.r) < game.car.speed * 0.5 ? 1 : 0)) : 0 }
  audio.update(aFrame, dt)
  radioTelemetry(dt)
  camPrev.copy(cam.position)
  hud.update(game)
  const ckMode = ren.cams.mode === 'cockpit'
  if (ckMode !== document.body.classList.contains('ck')) document.body.classList.toggle('ck', ckMode)
  wheel?.update(game, dt, ckMode || ren.cams.mode === 'free')
  const fl = game.session.flag, fe = $('hFlag')
  if (fe.dataset.f !== fl) { fe.dataset.f = fl; fe.hidden = fl === 'none' || fl === 'green' && game.autopilot; fe.className = 'flagban ' + fl; fe.textContent = FLAG_LABEL[fl] }
  const dl = game.session.timing.delta, de = $('hDelta'), dtxt = isNaN(dl) || game.autopilot ? '' : (dl >= 0 ? '+' : '−') + Math.abs(dl).toFixed(2)
  if (de.textContent !== dtxt) { de.textContent = dtxt; de.hidden = !dtxt || !fe.hidden; de.className = 'deltachip ' + (dl <= 0 ? 'neg' : 'pos') }
  if (settings.adaptive && adapt.sample(dtMs)) { if (ren.scale !== adapt.scale) ren.setScale(adapt.scale); ren.setFx(adapt.fx) }
  fpsAcc += dtMs; fpsN++
  if (fpsN >= 30) { diag.fps = 1000 * fpsN / fpsAcc; if (settings.perf) $('perf').textContent = `${(1000 * fpsN / fpsAcc).toFixed(0)} i/s · ${ren.r.info.render.calls} appels · éch. ${adapt.scale.toFixed(2)} · fx ${adapt.fx} · piste ${ren.tiles?.loaded.size ?? 0}/${ren.tiles?.total ?? 0}`; fpsAcc = 0; fpsN = 0 }
  const ka = $('steerKnob'); ka.style.setProperty('--s', String(st.steer))
}


// ---------- lot 7 : menu Apple, course rapide, week-end de GP (séances chronométrées, garage, résultats)
/** séance en cours : course rapide, séance d'un week-end, ou mode historique (contre-la-montre / essais / démo) */
interface Run { kind: 'quick' | 'weekend' | 'legacy'; id?: WkSessionId; laps: number; remaining: number; chequered: boolean; tel: Telemetry; lockPrev: boolean
  raceT: number; lightsT: number; lightsN: number; lightsHold: number; lightsDone: boolean; started: boolean; ended: boolean; ending?: boolean; lapsSeen?: number; lineSeen?: number; goT?: number; pen0: number; fuel: number }
let run: Run | null = null, menu!: Menu, garage: Garage | null = null, wk: Weekend | null = null
const sessionKindOf = (r: Run): SessionKind => r.kind === 'quick' ? 'race' : r.id ? sessionKind(r.id) : mode === 'demo' ? 'timetrial' : mode
const newRun = (kind: Run['kind'], laps: number, minutes: number, fuel: number): Run => ({ kind, laps, remaining: minutes * 60, chequered: false, tel: newTelemetry(), lockPrev: false,
  raceT: 0, lightsT: 0, lightsN: 0, lightsHold: 0.4 + Math.random() * 2.4, lightsDone: false, started: false, ended: false, pen0: 0, fuel })
const raceFuel = (laps: number) => Math.min(110, 2.45 * laps + 2) // E : ≈ 2,45 kg/tour à Spa (110 kg pour 44 tours)
function applyDriver(id: string) { const d = driverById(id); void ren.setDriver(id, d.team !== 'mercedes'); radio.driver = id }
function startQuick() {
  const P = settings.profile; run = newRun('quick', P.laps, 0, raceFuel(P.laps))
  settings.damage = settings.damage ?? 'real'; startSession('race', true); setScreen('drive')
}
function startWeekend(fresh: boolean) {
  const P = settings.profile
  if (fresh || !wk) {
    const plan: WeekendPlan = { circuit: P.circuit, car: P.car, driver: P.driver, fpMin: [...P.fpMin] as [number, number, number], qMin: [...P.qMin] as [number, number, number], raceLaps: P.raceLaps,
      weather: settings.weather, damage: settings.damage, skip: P.shortWeekend ? ['FP1', 'FP2'] : [] }
    wk = Weekend.create(plan); wk.st.fuel = 30
  }
  if (wk.st.plan.driver !== P.driver) { P.driver = wk.st.plan.driver; applyDriver(P.driver); saveSettings(settings) }
  settings.weather = wk.st.plan.weather as typeof settings.weather; settings.damage = wk.st.plan.damage
  newSessionRun(); if (wk.st.rem != null) run!.remaining = wk.st.rem
  openGarage()
}
function newSessionRun() {
  const id = wk!.cur, laps = id === 'RACE' ? wk!.st.plan.raceLaps : 0
  const prevTel = run?.tel
  run = newRun('weekend', laps, sessionMinutes(wk!.st.plan, id), id === 'RACE' ? raceFuel(laps) : id.startsWith('Q') ? 8 : wk!.st.fuel)
  run.id = id; if (prevTel) run.tel = prevTel // l'ingénieur s'appuie sur la séance précédente tant qu'on n'est pas ressorti
}
function saveRun() { if (wk && run?.kind === 'weekend') { wk.st.rem = run.remaining; wk.st.fuel = run.id && run.id.startsWith('FP') ? run.fuel : wk.st.fuel; wk.save() } }
function openGarage() {
  if (!wk || !run) return
  if (run.id === 'RACE') { // pas de garage pendant la course : préparation sur la grille puis départ
    if (!run.started) { garage = makeGarage(); setScreen('garage'); garage.open(); return }
  }
  game.paused = true; garage = makeGarage(); setScreen('garage'); garage.open(); saveRun()
}
function makeGarage() {
  return new Garage($('garage'), {
    wk: wk!, setup: settings.setup, weather: settings.weather,
    fuel: () => run!.fuel, setFuel: kg => { run!.fuel = kg; if (run!.id?.startsWith('FP')) wk!.st.fuel = kg; if (run!.started) game.car.fuel = kg },
    telemetry: () => run!.tel, laps: () => run!.started ? game.session.timing.laps : [], best: () => run!.started ? game.session.timing.best?.time ?? null : null,
    remaining: () => run!.remaining, spend: sec => { run!.remaining = Math.max(0, run!.remaining - sec) }, started: () => run!.started,
    goOut: () => {
      if (run!.id !== 'RACE' && run!.remaining <= 0) { endSession(); return }
      if (!run!.started) { startSession(sessionKind(run!.id!), true) } else { applySettings(); game.car.fitTyres(settings.setup.compound, settings.blanketF, settings.blanketR); setScreen('drive') }
      run!.tel = newTelemetry(); saveRun()
    },
    endSession: () => endSession(), menu: () => { saveRun(); run = null; menu.reset(); setScreen('menu') }, save: () => { applySettings(); saveRun() },
    shot: s => ren.show.setShot(s), lift: on => { ren.show.lift = on ? 1 : 0 }, say: () => {},
  })
}
function garageTick() { if (screen === 'garage' && garage && Math.random() < 0.1) garage.tick() }
/** fin de séance : résultat enregistré, écran de résultats */
function endSession() {
  if (!run || run.ended) return
  run.ended = true
  const T = game.session.timing, laps = run.started ? T.laps : [], best = laps.filter(l => l.valid).reduce<number | null>((a, l) => a == null || l.time < a ? l.time : a, null)
  const pen = game.penalties - run.pen0
  const r: SessionResult = { id: run.id ?? 'RACE', best, sectors: T.best?.sectors ?? null, bestSectors: run.started ? [...T.bestSectors] : [Infinity, Infinity, Infinity], laps: laps.length, valid: laps.filter(l => l.valid).length,
    vmax: run.tel.vmax, lapTimes: laps.map(l => l.valid ? l.time : -l.time), penalties: pen, pos: 1 }
  if (sessionKindOf(run) === 'race') { r.total = laps.length >= run.laps ? T.lapStart - (run.goT ?? 0) + pen : undefined; r.dnf = laps.length < run.laps }
  game.paused = true; audio.setMuted(true)
  if (run.kind === 'quick') {
    showResults($('results'), { title: 'Course rapide', eyebrow: `Spa-Francorchamps · ${run.laps} tour${run.laps > 1 ? 's' : ''}`, r, driver: settings.profile.driver, race: true,
      actions: [{ label: 'Rejouer', on: () => startQuick() }, { label: 'Menu', sec: true, on: () => { run = null; menu.reset(); setScreen('menu') } }] })
  } else if (run.kind === 'weekend' && wk) {
    const id = run.id!; wk.finish(r); wk.st.rem = undefined; wk.save()
    const nx = wk.done ? null : wk.cur
    const note = id.startsWith('Q') ? (id === 'Q3' ? 'Pole position (seul en piste) — le plateau IA viendra compléter la grille.' : 'Qualifié pour la phase suivante (seul en piste : pas d’élimination sans plateau IA).') : undefined
    showResults($('results'), { title: WK_LABEL[id], eyebrow: `Résultats · Grand Prix de Belgique`, r, driver: wk.st.plan.driver, race: id === 'RACE', note,
      summary: nx ? undefined : wk.st.results,
      actions: nx ? [{ label: `Continuer · ${WK_LABEL[nx]}`, on: () => { newSessionRun(); openGarage() } }, { label: 'Menu', sec: true, on: () => { run = null; menu.reset(); setScreen('menu') } }]
        : [{ label: 'Terminer le week-end', on: () => { Weekend.clear(); wk = null; run = null; menu.reset(); setScreen('menu') } }] })
  }
  setScreen('results'); ren.show.setShot('hero')
}
/** avant la physique : feux de départ (frein tenu jusqu'à l'extinction) */
function runPre(dt: number) {
  const r = run!
  if (sessionKindOf(r) === 'race' && !r.lightsDone) {
    r.lightsT += dt; const n = Math.min(5, Math.floor(r.lightsT))
    if (n !== r.lightsN) { r.lightsN = n; document.querySelectorAll('#lights i').forEach((e, i) => e.classList.toggle('on', i < n)); if (n > 0) audio.beep(660) }
    game.ctl.brake = 1
    if (r.lightsT >= 5 + r.lightsHold) { r.lightsDone = true; document.querySelectorAll('#lights i').forEach(e => e.classList.remove('on')); setTimeout(() => show('lights', false), 900); hud.toast('Extinction des feux !', 1600); r.raceT = 0; r.goT = game.time }
  }
}
/** après la physique : chrono de séance, drapeau à damier, télémétrie, arrêt au stand → garage */
function runPost(dt: number) {
  const r = run!, ev = game.events, c = game.car, k = sessionKindOf(r)
  if (r.ended) return
  const w = c.wheels
  const locking = c.brakeApplied > 0.1 && c.speed > 12 && w.some(x => x.contact && Math.abs(x.omega * x.r) < c.speed * 0.5)
  sampleTelemetry(r.tel, { speed: c.speed, tyreT: [w[0].tyre.temp, w[1].tyre.temp, w[2].tyre.temp, w[3].tyre.temp], brakeT: Math.max(...w.map(x => x.brakeT)), locking, scrape: game.maxScrape,
    alphaF: (w[0].alpha + w[1].alpha) / 2, alphaR: (w[2].alpha + w[3].alpha) / 2, steer: game.ctl.steer, dt }, r.lockPrev)
  r.lockPrev = locking
  const sc = $('hSess')
  if (k === 'race') {
    if (r.lightsDone) r.raceT += dt
    const done = game.session.timing.laps.length
    const txt = `Tour ${Math.min(done + 1, r.laps)}/${r.laps}`; if (sc.textContent !== txt) sc.textContent = txt; sc.hidden = false
    if (done !== r.lapsSeen) { r.lapsSeen = done; if (done === r.laps - 1 && r.laps > 1) hud.toast('Dernier tour !', 2000) }
    if (done >= r.laps && !r.chequered) { game.session.setFlag('chequered', 999); r.chequered = true; hud.toast('Drapeau à damier · P1', 3000); setTimeout(endSession, 2600) }
  } else if (r.kind === 'weekend') {
    r.remaining = Math.max(0, r.remaining - dt)
    const txt = `${WK_SHORT[r.id!]} · ${fmtClock(r.remaining)}`; if (sc.textContent !== txt) sc.textContent = txt; sc.hidden = false
    if (r.remaining <= 0 && !r.chequered) { r.chequered = true; game.session.setFlag('chequered', 999); radio.say('fin_session_rentre', 0); hud.toast('Drapeau à damier · termine ton tour', 3200) }
    // franchissement de la ligne (tour bouclé ou tour de sortie) après le damier, ou entrée aux stands → fin de séance
    const line = game.session.timing.laps.length + (game.session.timing.lapStart >= 0 ? 1 : 0)
    if (r.lineSeen == null || !r.chequered) r.lineSeen = line
    if (r.chequered && !r.ending && (line !== r.lineSeen || ev.pitEntry || game.inPit)) { r.ending = true; setTimeout(endSession, 1500) }
    if (ev.pitEntry && !r.chequered) hud.toast('Arrête-toi devant ton garage (2 s) pour voir l’ingénieur', 3000)
    if (ev.pitStop && !r.chequered && !r.ending) setTimeout(() => { if (screen === 'drive' && run === r) openGarage() }, 400)
  }
}
// ---------- radio de l'ingénieur : branchée sur le bus d'événements (src/core/events.ts) + télémétrie
const radio = new Radio()
let radioPoll = 0, lapsDone = 0
function wireRadio() {
  const b = game.bus, live = () => screen === 'drive' && !game.autopilot
  b.on('lap', e => { if (e.t !== 'lap' || !live()) return; lapsDone++
    if (!e.valid) { radio.say('tour_annule_limites', 5); return }
    if (e.best) { radio.say('meilleur_perso', 5); radio.sayClips(['seg_temps_au_tour', ...radio.timeClips(e.time)], 1, 'laptime') }
    else { radio.sayClips(['seg_temps_au_tour', ...radio.timeClips(e.time)], 1, 'laptime'); const dl = e.time - (game.storedBest ?? e.time); if (dl > 1.5) radio.say('pousser', 60); else if (dl < 0.6) radio.say('rythme_bon', 60) } })
  b.on('sector', e => { if (e.t !== 'sector' || !live() || e.n === 3) return; const dl = game.session.timing.delta
    if (!isNaN(dl) && dl < -0.15) radio.sayClips(['seg_secteur', 'num_' + e.n, 'seg_violet'], 1, 'sector')
    else if (!isNaN(dl) && dl > 0.6) radio.say('perte_temps_secteur', 90) })
  b.on('invalid', e => { if (e.t === 'invalid' && live()) radio.say('limites_piste', 15) })
  b.on('flag', e => { if (e.t !== 'flag' || !live()) return; const f = e.flag
    radio.say(f === 'yellow' ? 'drapeau_jaune' : f === 'double' ? 'double_jaune' : f === 'blackwhite' ? 'avertissement' : f === 'red' ? 'drapeau_rouge' : f === 'green' ? 'drapeau_vert' : '', 8) })
  b.on('impact', e => { if (e.t === 'impact' && live() && e.k > 0.6) radio.say('contact', 30) })
  b.on('damage', e => { if (e.t !== 'damage' || !live() || settings.damage === 'off') return; const d = game.car.damage
    radio.say(d.frontWing > 0.4 ? 'degats_aileron' : d.floor > 0.4 ? 'degats_fond' : 'degats_mineurs', 25) })
  b.on('pitEntry', () => { if (live()) radio.say('limiteur', 30) })
  b.on('pitExit', () => { if (live()) radio.say('sortie_stands', 30) })
  b.on('pitSpeeding', () => { if (live()) radio.say('exces_vitesse_stands', 30) })
  b.on('repair', () => { if (live()) radio.say('arret_ok', 30) })
  b.on('reset', () => { if (live()) radio.say('calme', 120) })
}
/** télémétrie lue toutes les 2 s : pneus hors fenêtre, freins, ERS vide, blocage de roue */
function radioTelemetry(dt: number) {
  { const c = game.car, k = c.wheels.map(w => w.tyre.puncture > 0 ? 1 : 0).join('') + c.damage.wheelOff.map(o => o ? 1 : 0).join('')
    if (k !== lastPunct) { const n = ['avant gauche', 'avant droite', 'arrière gauche', 'arrière droite']
      const i = c.wheels.findIndex((w, j) => w.tyre.puncture > 0 && lastPunct[j] !== '1'), j = c.damage.wheelOff.findIndex((o, q) => o && lastPunct[4 + q] !== '1')
      if (j >= 0) hud.toast('Roue arrachée · ' + n[j] + ' — rentre au stand'); else if (i >= 0) hud.toast('Crevaison · ' + n[i] + ' — rentre au stand')
      lastPunct = k } }
  radioPoll += dt; if (radioPoll < 2 || screen !== 'drive' || game.autopilot) return; radioPoll = 0
  const c = game.car, w = c.wheels, T = w.reduce((a, x) => a + x.tyre.temp, 0) / 4
  if (T > 118) radio.say('pneus_temp_haute', 120); else if (T < 62 && c.speed > 40 && lapsDone >= 1) radio.say('pneus_temp_basse', 120)
  if (w.some(x => x.brakeT > 1050)) radio.say('freins_temp', 120)
  if (c.ers.soc < 0.4e6 && c.speed > 50) radio.say('recharge_ers', 150)
  if (w.some(x => x.contact && x.omega * x.r < c.speed * 0.4 && c.speed > 25 && game.ctl.brake > 0.5)) radio.say('blocage', 45)
}

async function main() {
  watchdog(60, 300)
  dlog(`démarrage · ${navigator.userAgent} · écran ${innerWidth}×${innerHeight} @${devicePixelRatio}`)
  try {
    const track = await loadTrack()
    bootProgress('Trajectoire…', 0.05)
    await new Promise(r => setTimeout(r, 0))
    game = new Game(track, 'timetrial')
    if (pitData) game.pit = new Pitlane(pitData, { limitFromS: 6790, limitToS: 200 })
    game.autopilot = true
    const QL = ['low', 'medium', 'high', 'ultra'] as const, q0 = (params.get('q') as typeof settings.quality) || settings.quality
    const qn = (params.has('q') ? q0 : QL[Math.max(0, QL.indexOf(q0 as typeof QL[number]) - diag.drop)]) as typeof settings.quality
    // KTX2 (textures compressées GPU) sur mobile, ou forcé par ?ktx=1 ; ?ktx=0 pour le désactiver
    const ktx = params.has('ktx') ? params.get('ktx') !== '0' : diag.mobile
    ren = new Renderer($('gl') as HTMLCanvasElement, qn, { safe: diag.safe, mobile: diag.mobile, ktx, onLost: () => gpuLost() })
    diag.preset = (diag.safe ? 'sans échec (' + ren.q.name + ')' : ren.q.name) + ' · DPR max ' + ren.q.dprMax + (ktx ? ' · KTX2' : ' · WebP')
    dlog('préréglage ' + diag.preset)
    await ren.load(game, track, bootProgress)
    void ren.streamTiles(game) // reste de la piste en arrière-plan (tuiles proches d'abord)
    hud = new Hud()
    void radio.load().then(() => dlog('radio : banque chargée')).catch(e => dlog('radio indisponible : ' + (e as Error).message))
    wireRadio()
    if (ren.rig) wheel = new WheelDisplay(ren.rig.root)
    applySettings()
    wireUi(); syncWheelPad()
    // menu Apple (vitrine 3D) : pilote choisi appliqué dès le démarrage
    if (settings.profile.driver !== 'ham') applyDriver(settings.profile.driver); else radio.driver = 'ham'
    // lot 8 : la voiture suit l'équipe du pilote ; le volant affiché (écran) est recréé à chaque changement de voiture
    ren.onCarChanged = () => { wheel = ren.rig ? new WheelDisplay(ren.rig.root) : null }
    settings.profile.car = carOfTeam(driverById(settings.profile.driver).team); saveSettings(settings)
    applyCarPhysics(settings.profile.car)
    if (settings.profile.car !== 'w11') void ren.setCar(settings.profile.car).catch(e => dlog('voiture ' + settings.profile.car + ' : ' + (e as Error).message))
    wk = Weekend.load()
    const S = settings
    menu = new Menu($('menu'), {
      profile: S.profile, get weather() { return S.weather }, set weather(v) { S.weather = v }, get damage() { return S.damage }, set damage(v) { S.damage = v },
      save: () => saveSettings(S), setDriver: id => applyDriver(id), setCar: id => { applyCarPhysics(id); void ren.setCar(id).catch(e => dlog('voiture ' + id + ' : ' + (e as Error).message)) }, shot: sh => ren.show.setShot(sh),
      startQuick: () => startQuick(), startWeekend: fresh => startWeekend(fresh),
      weekendInProgress: () => wk && !wk.done ? `${WK_SHORT[wk.cur]} · ${WK_LABEL[wk.cur]}` : null,
      startLegacy: k => startSession(k), openPanel: w => openPanel(w), bestLap: () => game.storedBest,
    })
    setCam('tv')
    // mobile : départ sans GTAO et à 90 % de résolution ; l'adaptation remonte si l'iPhone tient 60 i/s
    adapt.baseMs = adapt.targetMs = 1000 / ren.q.fps
    // qualité réduite (mode sans échec / plantage antérieur) : TOUJOURS visible à l'écran, avec la raison
    if (diag.safe || diag.drop > 0) { const b = document.createElement('div'); b.className = 'qwarn'; b.textContent = 'Qualité réduite : ' + (diag.safeReason || 'plantage GPU précédent') + ' · Options → Diagnostic'; document.body.appendChild(b) }
    bootProgress('Prêt', 1)
    bootDone()
    $('bootGo').hidden = false
    $('bootText').textContent = 'Prêt · mode paysage recommandé'
    const go = async () => {
      $('bootGo').removeEventListener('click', go)
      // dans le geste, SANS attendre : déverrouillage audio iOS puis autorisation gyroscope (les deux appels partent
      // synchrones dans le toucher). Le menu s'affiche tout de suite ; le son arrive quand il est décodé.
      dlog('toucher pour démarrer')
      void audio.init().then(() => { audio.setVolume(settings.volume); dlog('audio prêt'); if (audio.ctx && audio.radioIn) { radio.attach(audio.ctx, audio.radioIn); radio.setVolume(settings.radioVol) } }).catch(e => derr(e, 'audio'))
      const gp = settings.input.steerMode === 'gyro' ? input.enableGyro() : null
      setScreen('menu')
      // iPhone : démarrage léger, puis montée en qualité si aucune perte de contexte après 12 s
      if (gp && !(await gp)) { settings.input.steerMode = 'touch'; applySettings() }
    }
    $('bootGo').addEventListener('click', go)
    last = performance.now(); requestAnimationFrame(frame)
    if (params.has('auto')) { await go(); const k = params.get('auto') as SessionKind | 'demo'; if (k) startSession(k) }
    ;(window as unknown as { __w11: unknown }).__w11 = { game, ren, input, audio, settings, setCam, startSession, setScreen, openPanel, AudioEngine, wheel, menu, startQuick, startWeekend, endSession, openGarage, get run() { return run }, get wk() { return wk }, get screen() { return screen }, wAct: (a: string) => document.querySelector<HTMLElement>(`[data-w="${a}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) }
    ;(window as unknown as { __w11diag: unknown }).__w11diag = diag
  } catch (e) {
    console.error(e)
    $('bootText').textContent = 'Erreur de chargement : ' + (e as Error).message
    fatal('Le jeu n’a pas pu démarrer', (e as Error).message)
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {})
}
void main()
