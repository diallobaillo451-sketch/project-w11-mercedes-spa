// Test visuel Monza : vraie scène Vite, modèles/runtime, caméra intérieure ancrée et séquence animée de pit stop.
// Usage : MONZA_VISUAL_OUT=/chemin node tests/monza-garage-visual.mjs [baseURL]
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const base = process.argv[2] || process.env.MONZA_BASE_URL || 'http://127.0.0.1:5218/'
const out = path.resolve(process.env.MONZA_VISUAL_OUT || path.join(process.cwd(), 'out/monza-visual'))
fs.mkdirSync(out, { recursive: true })
const errors = []
const report = { base, date: new Date().toISOString(), checks: [], blockers: [], consoleErrors: [], views: {} }
const check = (name, ok, info = '') => { report.checks.push({ name, ok, info }); if (!ok) throw new Error(`${name}: ${info}`) }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')
  const capture = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const file = path.join(out, name)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`) })
  await page.goto(base + '?q=low&circuit=monza', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#bootGo:not([hidden])', { timeout: 300000 })
  check('boot Monza prêt', await page.isVisible('#bootGo'), await page.locator('#bootText').innerText())
  await page.evaluate(() => document.querySelector('#bootGo')?.click())
  await page.waitForTimeout(1200)

  const assetState = await page.evaluate(async () => {
    const w = window.__w11, scene = w?.ren?.scene
    const pits = scene?.getObjectByName('monza_pits')
    const names = []
    scene?.traverse(o => { if (o.name) names.push(o.name) })
    const pivot = pits?.getObjectByName('jack_front_pivot')
    let playerRoot = pivot
    while (playerRoot?.parent && playerRoot.parent !== pits) playerRoot = playerRoot.parent
    const garageNodes = new Set()
    playerRoot?.traverse(o => { if (o.name) garageNodes.add(o.name) })
    const screens = [1, 2, 3].map(i => scene?.getObjectByName('screen_' + i))
    const screenState = screens.map(o => {
      const raw = o?.material
      const mat = Array.isArray(raw) ? raw.find(x => x?.map) : raw
      const image = mat?.map?.image
      const pixel = image?.getContext?.('2d')?.getImageData(0, 0, 1, 1).data
      return { canvas: !!mat?.map?.isCanvasTexture, size: image ? [image.width, image.height] : [], alpha: pixel?.[3] ?? 0 }
    })
    const lod = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams'].map(t => {
      const o = scene?.getObjectByName('garage_lod_' + t + '_frame')
      return { team: t, exists: !!o, visible: !!o?.visible }
    })
    let npcRoots = 0, uniformTextures = 0
    playerRoot?.children.forEach(ch => { let skinned = false; ch.traverse(o => { if (o.isSkinnedMesh) skinned = true }); if (skinned) npcRoots++ })
    playerRoot?.traverse(o => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) if (m?.name === 'Material_0' && m.map?.isCompressedTexture) uniformTextures++
    })
    const camera = w?.ren?.cams?.gPos?.toArray?.() ?? []
    let cameraError = Infinity
    const car1 = playerRoot?.getObjectByName('car1_park'), car2 = playerRoot?.getObjectByName('car2_park')
    if (car1 && car2 && camera.length === 3) {
      const pos = node => { const e = node.matrixWorld.elements; return [e[12], e[13], e[14]] }
      const a = pos(car1), b = pos(car2)
      const expected = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.7, (a[2] + b[2]) / 2]
      cameraError = Math.hypot(camera[0] - expected[0], camera[1] - expected[1], camera[2] - expected[2])
    }
    const config = await (await fetch('./track_monza/pits.json')).json()
    const doorRecords = [...(config.doors ?? []), ...(config.player_garage?.doors ?? []), ...(config.garages ?? []).flatMap(g => g.doors ?? [])]
    const trackDoorNodes = names.filter(n => /box-door/i.test(n))
    const hasNpcPaths = !!(config.player_garage?.npc_paths?.length || config.player_garage?.waypoints?.length)
    return { screen: w?.screen, gameGarage: w?.game?.garage, pit: !!w?.game?.pit, pits: !!pits, screenState, lod, garageNodeCount: garageNodes.size, garageNodes: [...garageNodes], npcRoots, uniformTextures, camera, cameraError, doorRecords: doorRecords.length, trackDoorNodes, hasNpcPaths }
  })
  check('garage Monza joueur chargé', !!assetState.pits && !!assetState.gameGarage && assetState.pit, JSON.stringify({ pits: assetState.pits, garage: assetState.gameGarage, pit: assetState.pit }))
  const requiredNodes = [
    'pitbox_gantry', 'screen_1', 'screen_2', 'screen_3', 'garage_ceiling_lights', 'telemetry_station', 'timing_tower',
    'jack_front', 'jack_rear', 'jack_front_pivot', 'jack_rear_pivot', 'pitbox_red', 'pitbox_green', 'pitbox_stop', 'pitbox_markings',
    'car1_park', 'car2_park', 'car_stands_car1', 'car_stands_car2', 'front_wing_stand_car1', 'front_wing_stand_car2',
    'cooling_fan_car1', 'cooling_fan_car2', 'nitrogen_cart_car1', 'nitrogen_cart_car2', 'tire_rack_car1_a', 'tire_rack_car2_a', 'engineers_desk',
    ...['car1', 'car2'].flatMap(car => ['FL', 'FR', 'RL', 'RR'].flatMap(w => [`tyre_${car}_${w}`, `tyre_blanket_${car}_${w}`])),
    ...['car1', 'car2'].flatMap(car => [1, 2, 3, 4].map(i => `wheelgun_${car}_${i}`)),
  ]
  const missing = requiredNodes.filter(n => !assetState.garageNodes.includes(n))
  check('équipements réels du garage chargés (jacks, écrans, pneus, couvertures et wheelguns)', missing.length === 0, missing.join(', ') || `${requiredNodes.length} nœuds d’asset exacts présents`)
  check('3 écrans 3D liés à leurs CanvasTexture et alimentés', assetState.screenState.every(x => x.canvas && x.size[0] === 480 && x.size[1] === 270 && x.alpha > 0), JSON.stringify(assetState.screenState))
  check('dix garages LOD: équipe joueur masquée et neuf voisines visibles', assetState.lod.every(x => x.exists) && assetState.lod.filter(x => x.visible).length === 9 && assetState.lod.find(x => x.team === 'mercedes')?.visible === false, JSON.stringify(assetState.lod))
  check('PNJ animés réellement instanciés dans le garage joueur', assetState.npcRoots >= 12, `${assetState.npcRoots} groupes squelettiques instanciés`)
  check('tenues KTX2 réellement appliquées aux PNJ', assetState.uniformTextures > 0, `${assetState.uniformTextures} matériaux Material_0 avec texture compressée`)
  check('caméra calculée depuis le milieu des deux ancres voiture', assetState.cameraError < 0.002, `écart ${assetState.cameraError.toFixed(4)} m; position ${JSON.stringify(assetState.camera)}`)

  const before = await page.evaluate(() => {
    const w = window.__w11
    window.__monzaVisualModule = { monzaGarageAnimationState: w.monzaGarageAnimationState, updateGarageAnims: w.updateGarageAnims }
    return w.monzaGarageAnimationState()
  })
  await page.evaluate(() => { const w = window.__w11; w.setScreen('garage'); w.setCam('garage') })
  await page.waitForTimeout(1800)
  const interiorShot = await capture('monza-garage-interieur.png')
  const after = await page.evaluate(() => {
    const w = window.__w11
    for (let i = 0; i < 160; i++) w.updateGarageAnims(0.05, '', 0)
    return w.monzaGarageAnimationState()
  })
  await page.waitForTimeout(500)
  const changedAmbient = before.ambient.filter(a => after.ambient.find(b => b.id === a.id)?.active !== a.active).length
  const pitwallActors = after.ambient.filter(a => a.id.startsWith('pitwall_'))
  const deskActors = after.ambient.filter(a => a.id.startsWith('eng_desk_'))
  check('ingénieurs alternent les clips fournis au bureau', deskActors.length >= 4 && deskActors.every(a => a.sequence.includes('type_laptop') && a.sequence.includes('look_screen')), JSON.stringify(deskActors))
  check('ingénieurs du muret alternent watch/talk sur les sièges mesurés', pitwallActors.length === 40 && pitwallActors.every(a => a.sequence.includes('pitwall_watch') && a.sequence.includes('pitwall_talk')), `${pitwallActors.length}/40 acteurs du muret animés`)
  check('les routines ambiantes ne restent pas synchronisées sur un seul clip', changedAmbient >= 8, `${changedAmbient} acteurs ont changé de clip sur ${before.ambient.length}`)
  report.views.garage = { screenshot: interiorShot, camera: assetState.camera, ambientActors: after.ambient.length, changedAmbient }
  if (assetState.doorRecords === 0 && assetState.trackDoorNodes.length === 0) report.blockers.push('Portes du box Monza: pits.json ne fournit aucune entrée doors[] et la scène ne contient aucun nœud box-door; les triangles de façade restent intacts faute d’ancre mesurée sûre.')
  if (!assetState.hasNpcPaths) report.blockers.push('Déplacements des PNJ: les spots Monza sont mesurés, mais aucun itinéraire/waypoint n’est fourni; les personnages travaillent sur place avec les clips d’origine, sans trajet inventé.')
  check('aucune découpe arbitraire de façade ou route PNJ inventée', assetState.doorRecords === 0 && assetState.trackDoorNodes.length === 0 && !assetState.hasNpcPaths, JSON.stringify({ doors: assetState.doorRecords, boxDoorNodes: assetState.trackDoorNodes, npcPaths: assetState.hasNpcPaths }))

  const stop = await page.evaluate(async () => {
    const data = await (await fetch('./track_monza/pits.json')).json()
    return data.garages.find(g => g.team === 'mercedes').pit_stop.pos
  })
  await page.evaluate(pos => {
    const w = window.__w11, g = w.game
    w.setScreen('drive')
    g.paused = true; g.autopilot = false
    g.car.pos = [...pos]; g.car.vel = [0, 0, 0]; g.car.speed = 0
    g.snapshot()
    g.ctl.throttle = 0; g.ctl.brake = 1; g.ctl.steer = 0
    w.setCam('tv')
    g.pitStopT = 0; g.pitServed = false; g.holdT = 0; g.pitCrewPhase = ''; g.inPit = false; g.pitNear = false; g.pitCommit = false
    window.__monzaPhaseHistory = []; window.__monzaPitSamples = []; window.__monzaPitStopEvent = false
    window.__monzaPhaseReady = ''; window.__monzaReleasePhase = null; window.__monzaSequenceDone = false; window.__monzaSequenceError = ''
    window.__monzaSequencePromise = (async () => {
      let prev = ''
      try {
        for (let i = 0; i < 180; i++) {
          g.updatePit(0.025)
          window.__monzaVisualModule.updateGarageAnims(0.025, g.pitCrewPhase, g.pitShow.lift)
          if (g.events?.pitStop) window.__monzaPitStopEvent = true
          if (g.pitCrewPhase !== prev) {
            prev = g.pitCrewPhase; window.__monzaPhaseHistory.push({ phase: prev, t: g.pitStopT })
            window.__monzaPhaseReady = prev
            await new Promise(resolve => { window.__monzaReleasePhase = resolve })
          }
          const state = window.__monzaVisualModule.monzaGarageAnimationState()
          window.__monzaPitSamples.push({ phase: g.pitCrewPhase, visibleCrew: state.crew.filter(a => a.visible).length, maxJackAngle: Math.max(0, ...state.jacks.map(j => Math.abs(j.rotationX - j.restX))), lift: g.pitShow.lift })
          if (g.pitServed) break
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        window.__monzaSequenceDone = true
      } catch (e) { window.__monzaSequenceError = String(e); window.__monzaSequenceDone = true }
    })()
  }, stop)
  const phaseShots = {}
  for (const phase of ['stop', 'jack', 'guns', 'off', 'on', 'drop', 'go']) {
    await page.waitForFunction(target => window.__monzaPhaseReady === target || !!window.__monzaSequenceError, phase, { timeout: 60000 })
    const seqError = await page.evaluate(() => window.__monzaSequenceError)
    if (seqError) throw new Error(seqError)
    phaseShots[phase] = await capture(`monza-pitstop-${phase}.png`)
    await page.evaluate(() => {
      const resume = window.__monzaReleasePhase
      window.__monzaReleasePhase = null; window.__monzaPhaseReady = ''
      resume?.()
    })
  }
  const pitstopShot = phaseShots.off
  await page.waitForFunction(() => window.__monzaSequenceDone, null, { timeout: 60000 })
  const anim = await page.evaluate(() => {
    const g = window.__w11.game, samples = window.__monzaPitSamples
    return {
      phases: window.__monzaPhaseHistory,
      final: g.pitCrewPhase,
      served: g.pitServed,
      pitStopEvent: window.__monzaPitStopEvent,
      stopTime: g.pitStopT,
      maxVisibleCrew: Math.max(0, ...samples.map(s => s.visibleCrew)),
      maxJackAngle: Math.max(0, ...samples.map(s => s.maxJackAngle)),
      liftedSamples: samples.filter(s => s.lift > 0).length,
    }
  })
  const requiredPhases = ['jack', 'guns', 'off', 'on', 'drop', 'go']
  check('captures en jeu enregistrées pour chacune des sept phases', Object.keys(phaseShots).length === 7 && Object.values(phaseShots).every(fs.existsSync), JSON.stringify(phaseShots))
  check('pit stop traverse toutes les phases d’origine synchronisées', requiredPhases.every(p => anim.phases.some(x => x.phase === p)), JSON.stringify(anim))
  check('arrêt Mercedes conforme à PIT_CREW=2,4 s, réparation et changement de pneus déclenchés', anim.served && anim.stopTime > 2.4 && anim.stopTime <= 2.5 && anim.pitStopEvent, `cible 2,4 s; arrêt ${anim.stopTime.toFixed(2)} s; servi=${anim.served}; event=${anim.pitStopEvent}`)
  check('équipe du pit stop visible pendant la séquence', anim.maxVisibleCrew >= 10, `${anim.maxVisibleCrew} acteurs de service visibles simultanément`)
  check('crics animés en phase avec le levage réel de la voiture', anim.liftedSamples > 0 && anim.maxJackAngle > 0.1, `${anim.liftedSamples} échantillons levés; angle ${anim.maxJackAngle.toFixed(3)} rad`)
  report.views.pitstop = { ...anim, screenshot: pitstopShot, phaseScreenshots: phaseShots }
  report.consoleErrors = errors
  check('aucune erreur console/réseau pendant le rendu', errors.length === 0, errors.slice(0, 10).join(' | '))
  fs.writeFileSync(path.join(out, 'monza-garage-visual-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  await context.close()
} finally {
  await browser.close()
}
