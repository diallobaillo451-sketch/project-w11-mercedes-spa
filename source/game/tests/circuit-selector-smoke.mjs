// Test ciblé du menu et des caméras sur le build de prépublication combiné aux assets gh-pages.
// Usage: node tests/circuit-selector-smoke.mjs http://127.0.0.1:4177/
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://127.0.0.1:4177/'
const tracks = [
  { dir: 'track', title: 'Spa-Francorchamps' },
  { dir: 'track_monza', title: 'Monza' },
  { dir: 'track_barcelona', title: 'Barcelone-Catalogne' },
  { dir: 'track_sepang', title: 'Sepang' },
  { dir: 'track_silverstone', title: 'Silverstone' },
  { dir: 'track_marina', title: 'Marina Bay' },
  { dir: 'track_redbull', title: 'Red Bull Ring' },
  { dir: 'track_bahrain', title: 'Bahreïn' },
  { dir: 'track_hungaroring', title: 'Hungaroring' },
  { dir: 'track_interlagos_2023_v2', title: 'Interlagos' },
  { dir: 'track_imola_2024', title: 'Imola' },
  { dir: 'track_albert_park_2018', title: 'Albert Park' },
]
const selectableEvents = [
  ['Red Bull Ring', 'Autriche'], ['Red Bull Ring', 'Styrie'], ['Hungaroring', 'Hongrie'],
  ['Silverstone', 'Grande-Bretagne'], ['Silverstone', '70e anniversaire'], ['Barcelone-Catalogne', 'Espagne'],
  ['Spa-Francorchamps', 'Belgique'], ['Monza', 'Italie'], ['Imola', 'Émilie-Romagne'],
  ['Sakhir', 'Bahreïn'], ['Albert Park', 'Australie'], ['Interlagos', 'Brésil'],
  ['Marina Bay', 'Singapour'], ['Sepang', 'Malaisie'],
]
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))

const waitBoot = async () => page.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
const enterMenu = async () => {
  await waitBoot()
  const screen = await page.evaluate(() => window.__w11?.screen)
  if (screen !== 'menu') await page.evaluate(() => document.querySelector('#bootGo')?.click())
  await page.waitForFunction(() => window.__w11?.screen === 'menu', null, { timeout: 15000 })
}
const openCircuitPicker = async () => {
  const row = page.locator('#menu .ap-page').last().locator('.ap-row').filter({ hasText: 'Circuit' }).first()
  await row.click()
  await page.locator('#menu .ap-page').last().locator('.ap-row').first().waitFor({ state: 'visible' })
}
const choose = async (name, event, reload = true) => {
  const row = page.locator('#menu .ap-page').last().locator('.ap-row').filter({ hasText: name }).filter({ hasText: event }).first()
  if (reload) {
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), row.click()])
  } else {
    await row.click()
    await page.waitForTimeout(100)
  }
}
const loadedState = async () => page.evaluate(() => ({
  title: document.title,
  circuit: new URL(location.href).searchParams.get('circuit'),
  profileCircuit: window.__w11?.settings?.profile?.circuit,
}))
const checkSurfaceFiles = async () => page.evaluate(async entries => Promise.all(entries.map(async ({ dir }) => {
  const [metaResponse, binResponse] = await Promise.all([fetch(`./${dir}/surface.json`), fetch(`./${dir}/surface.bin`)])
  if (!metaResponse.ok || !binResponse.ok) return { dir, ok: false, meta: metaResponse.status, bin: binResponse.status }
  const [meta, bytes] = await Promise.all([metaResponse.json(), binResponse.arrayBuffer()])
  return { dir, ok: bytes.byteLength === meta.N * meta.ND * 2, length: meta.length }
})), tracks)

try {
  await page.goto(`${base}?q=low&ktx=0&circuit=spa`)
  await waitBoot()
  const cam = await page.evaluate(() => {
    const w = window.__w11
    if (!w?.ren?.rig) return null
    const update = (mode) => {
      w.setCam(mode)
      w.ren.car.updateMatrixWorld(true)
      w.ren.cams.update(w.ren.car, w.ren.rig.eye, w.ren.rig.tcam, 90, 0.016, 0, 0)
      return w.ren.cams.cam.fov
    }
    return { tcamFovAt90ms: update('tcam'), cockpitFovAt90ms: update('cockpit') }
  })
  assert.ok(cam, 'La caméra et le rig doivent être disponibles après le chargement')
  assert.equal(cam.tcamFovAt90ms, 62, 'La T-cam conserve son ancien champ fixe de 62°')
  assert.equal(cam.cockpitFovAt90ms, 59, 'Le réglage dynamique du cockpit est conservé')

  await enterMenu()
  await openCircuitPicker()
  const rows = await page.locator('#menu .ap-page').last().locator('.ap-row').evaluateAll(nodes => nodes.map(node => ({ text: node.innerText, disabled: node.classList.contains('dis') })))
  const enabled = rows.filter(row => !row.disabled)
  assert.equal(enabled.length, selectableEvents.length, 'Les 14 manches reliées aux 12 circuits doivent être sélectionnables')
  for (const [name, event] of selectableEvents) {
    assert.ok(enabled.some(row => row.text.includes(name) && row.text.includes(event)), `Option active manquante: ${name} / ${event}`)
  }
  assert.ok(rows.some(row => row.disabled && row.text.includes('Yas Marina')), 'Les manches sans piste livrée restent désactivées')

  let surfaces = await checkSurfaceFiles()
  assert.ok(surfaces.every(result => result.ok), `Les fichiers physiques des 12 circuits doivent être présents: ${JSON.stringify(surfaces)}`)

  await choose('Red Bull Ring', 'Autriche')
  await waitBoot()
  let state = await loadedState()
  assert.equal(state.circuit, 'redbull')
  assert.equal(state.profileCircuit, 'aut')
  assert.ok(state.title.includes('Red Bull Ring'))

  await enterMenu()
  await openCircuitPicker()
  await choose('Red Bull Ring', 'Styrie', false)
  state = await loadedState()
  assert.equal(state.circuit, 'redbull', 'L’alias Styrian GP conserve la piste Red Bull Ring sans rechargement')
  assert.equal(state.profileCircuit, 'sty', 'Le choix de la manche Styrie est mémorisé')

  await choose('Silverstone', '70e anniversaire')
  await waitBoot()
  state = await loadedState()
  assert.equal(state.circuit, 'silverstone')
  assert.equal(state.profileCircuit, '70a')
  assert.ok(state.title.includes('Silverstone'))

  await enterMenu()
  await openCircuitPicker()
  await choose('Monza', 'Italie')
  await waitBoot()
  state = await loadedState()
  assert.equal(state.circuit, 'monza')
  assert.equal(state.profileCircuit, 'ita')
  assert.ok(state.title.includes('Monza'))

  await enterMenu()
  await openCircuitPicker()
  await choose('Spa-Francorchamps', 'Belgique')
  await waitBoot()
  state = await loadedState()
  assert.equal(state.circuit, 'spa')
  assert.equal(state.profileCircuit, 'bel')
  assert.ok(state.title.includes('Spa-Francorchamps'))
  surfaces = await checkSurfaceFiles()
  assert.ok(surfaces.every(result => result.ok), 'Les 12 fichiers de surface restent accessibles après les changements')
  assert.equal(errors.length, 0, `Aucune erreur JavaScript ou console: ${errors.join(' | ')}`)
  console.log(JSON.stringify({ base, camera: cam, activeMenuRows: enabled.length, assetSurfaces: surfaces.length, switches: ['Spa → Red Bull Ring', 'Red Bull Ring/Styrie → Silverstone/70e', 'Silverstone → Monza', 'Monza → Spa'], errors }, null, 2))
} finally {
  await browser.close()
}
