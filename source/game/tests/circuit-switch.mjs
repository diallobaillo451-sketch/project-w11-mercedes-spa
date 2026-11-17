// Vérifie les six options Circuit du menu puis les charge dans le même document et le même contexte WebGL.
// Usage : servir le build assemblé sur localhost:5199, puis npm run test:circuit-switch.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const base = process.argv[2] || 'http://127.0.0.1:5199/'
const gps = { spa: 'bel', monza: 'ita', barcelona: 'esp', sepang: 'mys', silverstone: 'gbr', marina: 'sgp' }
const tracks = { spa: './track/', monza: './track_monza/', barcelona: './track_barcelona/', sepang: './track_sepang/', silverstone: './track_silverstone/', marina: './track_marina/' }
const out = '/tmp/w11-circuit-switch'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const pageErrors = [], consoleErrors = [], failedResources = [], results = []
page.on('pageerror', e => pageErrors.push(String(e)))
page.on('requestfailed', r => failedResources.push(`${r.failure()?.errorText ?? 'request failed'} ${r.url()}`))
page.on('response', r => { if (r.status() >= 400) failedResources.push(`HTTP ${r.status()} ${r.url()}`) })
page.on('console', async m => { if (m.type() === 'error') { const args = await Promise.all(m.args().map(a => a.jsonValue().catch(() => '[unserializable]'))); consoleErrors.push(`${JSON.stringify(args)} @ ${JSON.stringify(m.location())}`) } })
await page.goto(base + '?q=low&circuit=spa')
await page.waitForSelector('#bootGo:not([hidden])', { timeout: 240000 })
await page.click('#bootGo')
await page.waitForSelector('#menu:not([hidden])', { timeout: 30000 })
const initial = await page.evaluate(() => { window.__initialTimeOrigin = performance.timeOrigin; window.__initialGL = window.__w11.ren.r.getContext(); return { id: window.__w11.circuitId, gl: !!window.__initialGL } })
if (!initial.gl || initial.id !== 'spa') throw new Error(`initialisation Spa échouée: ${JSON.stringify(initial)}`)
async function waitTrack(id) {
  await page.waitForFunction(expected => { const w = window.__w11; return w?.circuitId === expected && w.screen === 'menu' && w.ren.tiles?.total > 0 && w.ren.tiles.loaded.size > 0 && w.ren.track?.children.length > 0 }, id, { timeout: 180000, polling: 250 })
}
async function capture(id) {
  const state = await page.evaluate(async ({ trackDir, expectedGP }) => {
    const w = window.__w11, r = await fetch(trackDir + 'surface.json'), b = await fetch(trackDir + 'surface.bin')
    const meta = r.ok ? await r.json() : null, bytes = b.ok ? await b.arrayBuffer() : new ArrayBuffer(0)
    let mats = 0, tuned = 0, blue = 0; const classes = {}
    w.ren.track.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) { mats++; if (m.userData?.w11_pbr) tuned++; if (m.userData?.w11_blueAccent) blue++; const cls = m.userData?.w11_class ?? 'unclassified'; classes[cls] = (classes[cls] ?? 0) + 1 } })
    return { id: w.circuitId, screen: w.screen, loadedTiles: w.ren.tiles.loaded.size, totalTiles: w.ren.tiles.total, meshes: w.ren.track.children.length,
      surfaceOk: !!meta && b.ok && bytes.byteLength === meta.N * meta.ND * 2, surfaceBytes: bytes.byteLength, N: meta?.N, materials: mats, pbrTuned: tuned, blueFacadeMaterials: blue, classes,
      sameWebGL: w.ren.r.getContext() === window.__initialGL, sameDocument: performance.timeOrigin === window.__initialTimeOrigin,
      selectedGP: w.settings.profile.circuit, expectedGP, queryCircuit: new URL(location.href).searchParams.get('circuit') }
  }, { trackDir: tracks[id], expectedGP: gps[id] })
  if (state.id !== id || !state.surfaceOk || state.loadedTiles < 1 || state.totalTiles < 1 || !state.meshes || state.pbrTuned !== state.materials || (id === 'marina' && state.blueFacadeMaterials < 1) || !state.sameWebGL || !state.sameDocument || state.selectedGP !== gps[id]) throw new Error(`échec bascule ${id}: ${JSON.stringify(state)}`)
  results.push(state)
  await page.screenshot({ path: `${out}/${id}.png` })
  await page.evaluate(() => { const w = window.__w11; w.setCam('tv'); w.ren.exitShowroom() })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${id}-track.png` })
  await page.evaluate(() => window.__w11.ren.enterShowroom())
  await page.waitForTimeout(250)
  console.log(`OK ${id}: ${state.loadedTiles}/${state.totalTiles} tuiles, ${state.materials} matériaux (${state.pbrTuned} PBR), bleu=${state.blueFacadeMaterials}, GP=${state.selectedGP}, sans reload ni nouveau WebGL`)
  return state
}
await waitTrack('spa'); await capture('spa')
// Passer par le vrai choix de circuit, pas par le code de test : la liste visible doit contenir six pistes activées.
await page.locator('#menu .ap-page').last().locator('.ap-row').filter({ hasText: 'Circuit' }).click()
await page.waitForTimeout(650)
const choices = await page.evaluate(() => { const page = document.querySelectorAll('#menu .ap-page'); const current = page[page.length - 1]; return [...current.querySelectorAll('.ap-row')].map(r => ({ text: r.innerText, disabled: r.classList.contains('dis') })) })
const required = ['Spa-Francorchamps', 'Monza', 'Barcelone-Catalogne', 'Sepang', 'Silverstone', 'Marina Bay']
for (const name of required) { const item = choices.find(c => c.text.includes(name)); if (!item || item.disabled) throw new Error(`circuit absent ou désactivé du menu: ${name} (${JSON.stringify(item)})`) }
await page.locator('#menu .ap-page').last().locator('.ap-row').filter({ hasText: 'Monza' }).click()
await waitTrack('monza'); await capture('monza')
for (const id of ['barcelona', 'sepang', 'silverstone', 'marina']) {
  await page.click('#bCircuit'); await waitTrack(id); await capture(id)
}
const gltfTextureWarnings = consoleErrors.filter(e => e.includes("THREE.GLTFLoader: Couldn't load texture"))
const workerWarnings = consoleErrors.filter(e => !e.includes("THREE.GLTFLoader: Couldn't load texture") && e.includes('"name":"Error"') && e.includes('blob:'))
const otherConsoleErrors = consoleErrors.filter(e => !gltfTextureWarnings.includes(e) && !workerWarnings.includes(e))
if (gltfTextureWarnings.length) console.log(`Avertissements GLTFLoader de texture: ${gltfTextureWarnings.length} (aucune ressource HTTP en échec)`)
if (workerWarnings.length) console.log(`Avertissements worker blob: ${workerWarnings.length} (capturés dans le rapport)`)
if (failedResources.length) console.log(`Ressources HTTP/réseau en échec: ${failedResources.slice(0, 12).join(' | ')}`)
if (otherConsoleErrors.length) console.log(`Autres erreurs console: ${otherConsoleErrors.slice(0, 12).join(' | ')}`)
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ base, initial, choices, results, pageErrors, consoleErrors, gltfTextureWarnings, workerWarnings, failedResources }, null, 2))
if (pageErrors.length || otherConsoleErrors.length || failedResources.length) throw new Error(`navigateur: ${pageErrors.length} erreur(s) JS, ${otherConsoleErrors.length} erreur(s) console, ${failedResources.length} ressource(s) en échec`)
await browser.close()
console.log(`TOUS LES CIRCUITS PASSENT — rapport ${out}/report.json`)
