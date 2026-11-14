import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pitlane } from '../src/track/pitlane.ts'
import { TrackSurface } from '../src/track/surface.ts'
import { marshalBoardFallbackAllowed, pitExitLampFallbackAllowed, shouldCreateFallbackMarshalBoards } from '../src/render/signals.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const trackDir = process.env.MONZA_TRACK_DIR || path.join(repo, 'public/track_monza')
const configPath = process.env.MONZA_PITS_CONFIG || path.join(repo, 'public/track_monza/pits.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const marshalsPath = process.env.MONZA_MARSHALS_JSON || path.join(trackDir, 'marshals.json')
const marshals = JSON.parse(fs.readFileSync(marshalsPath, 'utf8'))
const pitData = JSON.parse(fs.readFileSync(path.join(trackDir, 'pitlane.json'), 'utf8'))
const surfaceMeta = JSON.parse(fs.readFileSync(path.join(trackDir, 'surface.json'), 'utf8'))
const rawGrid = fs.readFileSync(path.join(trackDir, 'surface.bin'))
assert.equal(rawGrid.length, surfaceMeta.N * surfaceMeta.ND * 2, 'surface.bin doit être décodé et complet')
const grid = new Uint16Array(rawGrid.length / 2)
for (let i = 0; i < grid.length; i++) grid[i] = rawGrid.readUInt16LE(i * 2)
const surface = new TrackSurface(surfaceMeta, grid)
const pit = new Pitlane(pitData, { limitFromS: 5405, limitToS: 70 })
const expectedTeams = ['mercedes', 'ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams']
assert.equal(config.circuit, 'monza_2020')
assert.deepEqual(config.garages.map(g => g.team), expectedTeams, 'les dix équipes 2020 doivent avoir une case')
assert.ok(config.player_garage.npc_spots.length > 0, 'les postes PNJ locaux du garage doivent exister')
assert.deepEqual(marshals.posts, [], 'Monza source ne fournit aucun poste mesuré : ne pas inventer de placement')
assert.equal(marshals.signals?.length, 1, 'un feu natif mesuré de Monza est documenté')
const monzaSignal = marshals.signals[0]
assert.deepEqual(monzaSignal.position, [-4.768, 4.999, -36.394], 'position issue du relevé Monza source')
assert.deepEqual(monzaSignal.lamps.map(l => l.node), ['signal_1_red_top', 'signal_1_red_mid', 'signal_1_green'])
const pitExitDistance = Math.hypot(monzaSignal.position[0] - pitData.x.at(-1), monzaSignal.position[2] - pitData.z.at(-1))
assert.ok(pitExitDistance > 220, `le feu natif (${monzaSignal.s} m) est à ${pitExitDistance.toFixed(1)} m de la sortie pitlane mesurée : rôle non attribué`)
assert.equal(marshalBoardFallbackAllowed('monza', marshals.posts), false, 'aucun panneau 3D synthétique sans postes Monza mesurés')
assert.equal(marshalBoardFallbackAllowed('monza', [{}]), true, 'des postes Monza réellement documentés autorisent le rendu')
assert.equal(marshalBoardFallbackAllowed('spa', []), true, 'ne pas changer le comportement des autres circuits')
assert.equal(shouldCreateFallbackMarshalBoards(false, 0, false), false, 'le runtime ne fabrique aucun panneau sans placement autorisé')
assert.equal(shouldCreateFallbackMarshalBoards(true, 0, false), true, 'les panneaux de repli restent possibles là où ils sont autorisés')
assert.equal(pitExitLampFallbackAllowed('monza', false), false, 'pas de mât pit-exit Monza sans ancre mesurée')
assert.equal(pitExitLampFallbackAllowed('monza', true), true, 'une vraie ancre pit-exit Monza peut être utilisée')
assert.equal(pitExitLampFallbackAllowed('spa', false), true, 'le fallback des autres circuits reste inchangé')

const sceneDir = process.env.MONZA_SCENE_DIR || path.join(repo, 'public/assets/monza')
const monzaScenePath = path.join(sceneDir, 't06.gltf')
if (fs.existsSync(monzaScenePath)) {
  const scene = JSON.parse(fs.readFileSync(monzaScenePath, 'utf8'))
  for (const lamp of monzaSignal.lamps) {
    const node = scene.nodes.find(n => n.name === lamp.node)
    assert.ok(node && node.extras?.w11_signal === 1, `nœud natif ${lamp.node} absent ou sans marqueur signal`)
    const materials = scene.meshes[node.mesh].primitives.map(p => scene.materials[p.material])
    assert.ok(materials.some(m => m.name === lamp.node && m.extras?.w11_emissive_off === 1), `${lamp.node}: matériau natif émissif manquant`)
  }
} else if (process.env.CI || process.env.MONZA_REQUIRE_ASSETS === '1') {
  assert.fail(`scène Monza réelle absente : ${monzaScenePath}`)
}
const pitCrewIds = new Set(config.player_garage.npc_spots.filter(s => /^mech_(jack|tyre)_/.test(s.id)).map(s => s.id))
for (const id of ['mech_jack_front', 'mech_jack_rear', ...['FL', 'FR', 'RL', 'RR'].flatMap(w => [`mech_tyre_${w}`, `mech_tyre_${w}_off`])]) {
  assert.ok(pitCrewIds.has(id), `spot exact du pit crew joueur absent : ${id}`)
}
const readGlbNames = file => {
  const bytes = fs.readFileSync(file)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${path.basename(file)} doit être binaire et assemblé`)
  let offset = 12, gltf = null
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4)
    if (type === 0x4e4f534a) gltf = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length).replace(/[\u0000 ]+$/, ''))
    offset += 8 + length
  }
  assert.ok(gltf?.nodes, `${path.basename(file)} contient un chunk JSON GLTF`)
  return new Set(gltf.nodes.map(n => n.name))
}
const lodPath = process.env.MONZA_LOD_GLB || (process.env.CI ? path.join(repo, 'public/assets/spa_pits/garages_lod.glb') : null)
const lodNames = lodPath ? readGlbNames(lodPath) : null
if (lodNames) for (const garage of config.garages) assert.ok(lodNames.has(`${garage.lod_node}_frame`), `${garage.team}: frame LOD manquant`)
const wallPath = process.env.MONZA_PITWALL_GLB || (process.env.CI ? path.join(repo, 'public/assets/spa_pits/pitwall_stands.glb') : null)
const wallNames = wallPath ? readGlbNames(wallPath) : null
if (wallNames) for (const garage of config.garages) {
  assert.ok(wallNames.has(garage.pitwall.node), `${garage.team}: stand du muret manquant`)
  for (let i = 1; i <= 4; i++) assert.ok(wallNames.has(`${garage.pitwall.node}_seat_${i}`), `${garage.team}: siège ${i} manquant`)
}
if (process.env.CI || process.env.MONZA_REQUIRE_ASSETS === '1') {
  const requiredFiles = [
    'public/assets/spa_pits/garages_lod.glb',
    'public/assets/spa_pits/pitwall_stands.glb',
    'public/assets/spa_pits/npc_engineer.glb',
    'public/assets/spa_pits/npc_mechanic.glb',
    'public/assets/monza_pits/garage_player.glb',
  ]
  for (const team of expectedTeams) {
    requiredFiles.push(`public/assets/monza_pits/textures/team_${team}.ktx2`)
    for (const kind of ['engineer', 'mechanic']) for (const size of ['1024', '256']) {
      requiredFiles.push(`public/assets/spa_pits/npc_tex/npc_${kind}_${team}_${size}.ktx2`)
    }
  }
  for (const file of requiredFiles) assert.ok(fs.statSync(path.join(repo, file)).size > 0, `asset runtime absent ou vide : ${file}`)
  const playerGarage = readGlbNames(process.env.MONZA_PLAYER_GARAGE_GLB || path.join(repo, 'public/assets/monza_pits/garage_player.glb'))
  for (const node of ['jack_front_pivot', 'jack_rear_pivot', 'screen_1', 'screen_2', 'screen_3', 'pitbox_red', 'pitbox_green', 'pitbox_stop', 'car1_park']) {
    assert.ok(playerGarage.has(node), `ancre garage joueur absente : ${node}`)
  }
}

let lastStation = -Infinity
for (const garage of config.garages) {
  assert.equal(garage.lod_node, `garage_lod_${garage.team}`, `${garage.team}: nœud LOD configuré`)
  const { pos, heading } = garage.pit_stop
  const probe = pit.probe(pos[0], pos[2])
  assert.equal(probe.lane, 'work', `${garage.team}: arrêt du côté garage, pas dans la voie rapide`)
  assert.ok(probe.dist >= 3.3 && probe.dist <= 3.8, `${garage.team}: distance au chemin ${probe.dist}`)
  assert.ok(pit.inLimitZone(pos[0], pos[2]), `${garage.team}: l'arrêt doit être dans la zone 80 km/h`)
  assert.ok(probe.p > lastStation, `${garage.team}: ordre des box le long de la pitlane`)
  lastStation = probe.p

  const sample = { h: 0, nx: 0, ny: 0, nz: 0, type: 0, s: 0, d: 0, i: 0 }
  surface.sample(pos[0], pos[2], -1, sample)
  assert.ok(Math.abs(sample.h - pos[1]) < 0.002, `${garage.team}: cote du stop doit suivre TrackSurface.sample()`)

  const fr = garage.frame, dx = pos[0] - fr.pos[0], dz = pos[2] - fr.pos[2]
  const lx = dx * Math.cos(fr.yaw) - dz * Math.sin(fr.yaw)
  const lz = dx * Math.sin(fr.yaw) + dz * Math.cos(fr.yaw)
  assert.ok(Math.abs(lx) < 0.02 && Math.abs(lz - 4.5) < 0.02, `${garage.team}: stop à l'ancre locale du garage`)
  assert.ok(Math.abs(fr.pos[1] - pos[1]) < 0.002, `${garage.team}: garage et voie sur le même plancher`)
  assert.ok(Math.abs(Math.hypot(heading[0], heading[2]) - 1) < 0.002, `${garage.team}: cap pitlane normalisé`)
  const wall = garage.pitwall, wallProbe = pit.probe(wall.pos[0], wall.pos[2]), wallSurface = { h: 0, nx: 0, ny: 0, nz: 0, type: 0, s: 0, d: 0, i: 0 }
  assert.ok(wallProbe.lat < -5 && wallProbe.lat > -8, `${garage.team}: stand du côté muret/piste (${wallProbe.lat.toFixed(2)} m)`)
  surface.sample(wall.pos[0], wall.pos[2], -1, wallSurface)
  assert.ok(Math.abs(wall.pos[1] - wallSurface.h - 0.65) < 0.02, `${garage.team}: muret posé sur la cote Monza + hauteur d’ancrage`)
  const wallYaw = Math.atan2(Math.sin(wall.yaw - fr.yaw), Math.cos(wall.yaw - fr.yaw))
  assert.ok(Math.abs(Math.abs(wallYaw) - Math.PI) < 0.002, `${garage.team}: stand orienté vers la piste`)
  pit.setTeamBox(garage.team, pos[0], pos[2])
}
assert.equal(pit.boxAt.size, 10, 'les dix arrêts doivent être enregistrés dans le runtime')
console.log('MONZA PITS OK: 10 box, 10 stands du muret, côté piste, altitudes et ancres validées.')
