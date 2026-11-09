/** Point d'entrée : chargement, menus, boucle de jeu (physique 240 Hz → rendu interpolé → audio). */
import './ui/style.css'
import * as THREE from 'three'
import { TrackSurface } from './track/surface.ts'
import { Game } from './core/game.ts'
import { Renderer } from './render/renderer.ts'
import { CAM_LABEL, CAM_ORDER, type CamMode } from './render/cameras.ts'
import { Input } from './controls/input.ts'
import { AudioEngine } from './audio/audio.ts'
import { AdaptiveResolution } from './quality/quality.ts'
import { loadSettings, saveSettings } from './ui/settings.ts'
import { aboutPanel, optionsPanel, setupPanel } from './ui/panels.ts'
import { Hud } from './ui/hud.ts'
import { fmt } from './timing/timing.ts'
import { diag, dlog, derr, decideSafe, watchdog, bootDone, fatal, reloadSafe, gpuLost } from './diag.ts'
import { diagPanel } from './ui/diagPanel.ts'
import type { SessionKind } from './core/session.ts'

const $ = (id: string) => document.getElementById(id)!
const show = (id: string, on: boolean) => { $(id).hidden = !on }
const settings = loadSettings()
let game: Game, ren: Renderer
const input = new Input(settings.input)
const audio = new AudioEngine()
const adapt = new AdaptiveResolution()
let hud: Hud
type Screen = 'boot' | 'menu' | 'drive' | 'pause'
let screen: Screen = 'boot'
let mode: SessionKind | 'demo' = 'demo'
const params = new URLSearchParams(location.search)
decideSafe(params)

let lastLabel = ''
function bootProgress(label: string, f: number) {
  diag.lastProgress = performance.now(); if (label !== lastLabel) { lastLabel = label; dlog(label) }
  $('bootText').textContent = label + (diag.safe ? ' · mode sans échec' : ''); ($('bootBar') as HTMLElement).style.width = Math.round(f * 100) + '%' }

async function loadTrack(): Promise<TrackSurface> {
  bootProgress('Surface de piste…', 0.02)
  const [meta, bin] = await Promise.all([fetch('./track/surface.json').then(r => r.json()), fetch('./track/surface.bin').then(r => r.arrayBuffer())])
  return new TrackSurface(meta, new Uint16Array(bin))
}
function applySettings() {
  Object.assign(game.car.setup, settings.setup)
  game.car.ers.mode = settings.ersMode
  input.set = settings.input
  document.body.classList.toggle('gyro', settings.input.steerMode === 'gyro')
  document.body.classList.toggle('autogear', settings.setup.autoGear)
  show('bDas', settings.setup.dasEnabled)
  show('perf', settings.perf)
  adapt.enabled = settings.adaptive
  if (!settings.adaptive && adapt.step !== 0) { adapt.reset(); ren.setScale(1); ren.setFx(0) }
  audio.setVolume(settings.volume)
  saveSettings(settings)
}
const CAM_SHORT: Record<CamMode, string> = { chase: 'Poursuite', close: 'Proche', tcam: 'T-cam', cockpit: 'Cockpit', tv: 'TV', free: 'Libre' }
function setCam(m: CamMode) { ren.cams.setMode(m); $('bCam').textContent = CAM_SHORT[m]; $('bCam').title = CAM_LABEL[m] }
function startSession(k: SessionKind | 'demo') {
  mode = k
  game.autopilot = k === 'demo'
  game.start(k === 'demo' ? 'timetrial' : k)
  game.paused = false
  applySettings()
  setScreen('drive')
  setCam(k === 'demo' ? 'tv' : settings.camera)
  hud.toast(k === 'timetrial' ? 'Contre-la-montre · tour lancé' : k === 'practice' ? 'Essais libres · départ des stands' : 'Démo : pilote automatique')
}
function setScreen(s: Screen) {
  screen = s
  show('boot', s === 'boot'); show('menu', s === 'menu'); show('pause', s === 'pause')
  show('hud', s === 'drive' || s === 'pause')
  show('controls', s === 'drive' && !game?.autopilot)
  show('panel', false)
  if (s === 'menu') { $('menuBest').textContent = game.storedBest ? 'Meilleur tour : ' + fmt(game.storedBest) : 'Aucun tour enregistré' }
  if (game) game.paused = s === 'pause'
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

function wireUi() {
  document.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act!
    if (a === 'timetrial' || a === 'practice' || a === 'demo') startSession(a)
    else if (a === 'setup' || a === 'options' || a === 'about') openPanel(a)
    else if (a === 'resume') setScreen('drive')
    else if (a === 'restart') startSession(mode)
    else if (a === 'reset') { game.resetCar(); setScreen('drive') }
    else if (a === 'menu') { game.autopilot = true; setCam('tv'); setScreen('menu'); game.paused = false }
  }))
  $('panelClose').addEventListener('click', closePanel)
  $('bPause').addEventListener('click', () => setScreen(screen === 'pause' ? 'drive' : 'pause'))
  $('bCam').addEventListener('click', () => { const i = CAM_ORDER.indexOf(ren.cams.mode); const m = CAM_ORDER[(i + 1) % CAM_ORDER.length]; setCam(m); if (!game.autopilot) { settings.camera = m; saveSettings(settings) } })
  input.bindPedal($('pThrottle'), 'throttle'); input.bindPedal($('pBrake'), 'brake')
  input.bindSteerZone($('steerZone'), $('steerKnob'))
  input.bindTap($('bUp'), () => { input.st.shiftUp = true }); input.bindTap($('bDown'), () => { input.st.shiftDown = true })
  input.bindTap($('bDrs'), () => { input.st.drs = true })
  input.bindHold($('bDas'), v => { input.st.das = v })
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
  document.addEventListener('touchmove', e => { if (!(e.target as HTMLElement).closest('#panelBody')) e.preventDefault() }, { passive: false })
}

// ---------- boucle
const rightV = new THREE.Vector3(), camPrev = new THREE.Vector3(), carW = new THREE.Vector3(), tmp = new THREE.Vector3()
let last = performance.now(), fpsAcc = 0, fpsN = 0, prevDist = 0
function frame(now: number) {
  requestAnimationFrame(frame)
  const dtMs = now - last; last = now
  // tests : pas d'image imposé (rendu logiciel lent → simulation en temps « image par image »)
  const fixed = (window as unknown as { __w11?: { fixedDt?: number } }).__w11?.fixedDt
  const dt = fixed ?? Math.min(0.1, dtMs / 1000)
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
  game.advance(screen === 'drive' || screen === 'menu' ? dt : 0)
  const ev = game.events
  if (ev.lap) hud.toast((ev.lap.best ? 'Meilleur tour ! ' : 'Tour ') + fmt(ev.lap.time) + (ev.lap.valid ? '' : ' (invalide)'), 3200)
  else if (ev.invalid && !game.autopilot) hud.toast('Tour invalidé · limites de piste', 2000)
  else if (ev.reset) hud.toast('Remise en piste')
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
  audio.update({
    rpm: c.rpmVis, throttle: c.throttleApplied ?? st.throttle, speed: spd, slip, kerb, gravel, scrape: game.maxScrape, impact: game.maxImpact,
    shift: game.shifts, gear: c.gear, limiter: c.limiter, ers: (c.ers.kPower ?? 0) / 120_000, inside, pan: inside ? 0 : THREE.MathUtils.clamp(tmp.dot(right), -1, 1),
    dist: inside ? 1 : dist, radialV: inside ? 0 : radialV,
  }, dt)
  camPrev.copy(cam.position)
  hud.update(game)
  if (settings.adaptive && adapt.sample(dtMs)) { if (ren.scale !== adapt.scale) ren.setScale(adapt.scale); ren.setFx(adapt.fx) }
  fpsAcc += dtMs; fpsN++
  if (fpsN >= 30) { diag.fps = 1000 * fpsN / fpsAcc; if (settings.perf) $('perf').textContent = `${(1000 * fpsN / fpsAcc).toFixed(0)} i/s · ${ren.r.info.render.calls} appels · éch. ${adapt.scale.toFixed(2)} · fx ${adapt.fx} · piste ${ren.tiles?.loaded.size ?? 0}/${ren.tiles?.total ?? 0}`; fpsAcc = 0; fpsN = 0 }
  const ka = $('steerKnob'); ka.style.setProperty('--s', String(st.steer))
}

async function main() {
  watchdog(30, 150)
  dlog(`démarrage · ${navigator.userAgent} · écran ${innerWidth}×${innerHeight} @${devicePixelRatio}`)
  try {
    const track = await loadTrack()
    bootProgress('Trajectoire…', 0.05)
    await new Promise(r => setTimeout(r, 0))
    game = new Game(track, 'timetrial')
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
    applySettings()
    wireUi()
    setCam('tv')
    // mobile : départ sans GTAO et à 90 % de résolution ; l'adaptation remonte si l'iPhone tient 60 i/s
    if (diag.mobile && !diag.safe && settings.adaptive) { adapt.step = 2; ren.setScale(adapt.scale); ren.setFx(adapt.fx) }
    bootProgress('Prêt', 1)
    bootDone()
    $('bootGo').hidden = false
    $('bootText').textContent = 'Prêt · mode paysage recommandé'
    const go = async () => {
      $('bootGo').removeEventListener('click', go)
      // dans le geste, SANS attendre : déverrouillage audio iOS puis autorisation gyroscope (les deux appels partent
      // synchrones dans le toucher). Le menu s'affiche tout de suite ; le son arrive quand il est décodé.
      dlog('toucher pour démarrer')
      void audio.init().then(() => { audio.setVolume(settings.volume); dlog('audio prêt') }).catch(e => derr(e, 'audio'))
      const gp = settings.input.steerMode === 'gyro' ? input.enableGyro() : null
      setScreen('menu')
      // iPhone : démarrage léger, puis montée en qualité si aucune perte de contexte après 12 s
      if (diag.mobile && !diag.safe) setTimeout(() => { void ren.upgrade().then(() => { if (settings.adaptive) { adapt.reset(); ren.setScale(adapt.scale); ren.setFx(adapt.fx) } dlog('qualité maximale atteinte (l’adaptation ne baisse que si les images chutent)') }) }, 12000)
      if (gp && !(await gp)) { settings.input.steerMode = 'touch'; applySettings() }
    }
    $('bootGo').addEventListener('click', go)
    last = performance.now(); requestAnimationFrame(frame)
    if (params.has('auto')) { await go(); const k = params.get('auto') as SessionKind | 'demo'; if (k) startSession(k) }
    ;(window as unknown as { __w11: unknown }).__w11 = { game, ren, input, audio, settings, setCam, startSession, setScreen, openPanel, AudioEngine }
    ;(window as unknown as { __w11diag: unknown }).__w11diag = diag
  } catch (e) {
    console.error(e)
    $('bootText').textContent = 'Erreur de chargement : ' + (e as Error).message
    fatal('Le jeu n’a pas pu démarrer', (e as Error).message)
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {})
}
void main()
