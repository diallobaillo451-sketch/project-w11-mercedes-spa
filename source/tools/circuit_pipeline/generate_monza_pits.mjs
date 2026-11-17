#!/usr/bin/env node
/**
 * Génère une configuration Monza à partir des données du circuit réellement livrées.
 *
 * Usage : node generate_monza_pits.mjs <track-dir> <scene-dir> <spa-pits-template.json> <output.json>
 * Le template Spa est consulté uniquement pour les ancres locales du GLB et les NPC spots locaux;
 * aucune coordonnée monde Spa ne figure dans le résultat.
 */
import fs from 'node:fs'
import path from 'node:path'

const [trackDir, sceneDir, templatePath, outputPath] = process.argv.slice(2)
if (!trackDir || !sceneDir || !templatePath || !outputPath) {
  console.error('Usage: generate_monza_pits.mjs <track-dir> <scene-dir> <spa-pits-template.json> <output.json>')
  process.exit(2)
}
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const surface = json(path.join(trackDir, 'surface.json'))
const pitlane = json(path.join(trackDir, 'pitlane.json'))
const gltf = json(path.join(sceneDir, 't01.gltf'))
const template = json(templatePath)
const cells = fs.readFileSync(path.join(trackDir, 'surface.bin'))
const teams = [
  ['mercedes', 'MERCEDES-AMG F1'], ['ferrari', 'SCUDERIA FERRARI'], ['redbull', 'RED BULL RACING HONDA'],
  ['mclaren', 'MCLAREN'], ['renault', 'RENAULT DP WORLD F1 TEAM'], ['alphatauri', 'SCUDERIA ALPHATAURI'],
  ['racingpoint', 'BWT RACING POINT F1 TEAM'], ['alfaromeo', 'ALFA ROMEO RACING ORLEN'], ['haas', 'HAAS F1 TEAM'], ['williams', 'WILLIAMS RACING'],
]
const n = surface.N, nd = surface.ND
if (cells.length !== n * nd * 2) throw new Error(`surface.bin: ${cells.length} octets, attendu ${n * nd * 2}`)
if (pitlane.x.length !== pitlane.z.length || pitlane.x.length < 100) throw new Error('pitlane.json: chemin Monza incomplet')

// Les bounds des triangles du mesh statique du bâtiment sont exposées par l'accessor glTF.
const boxNode = gltf.nodes.find(o => o.name === 'box__0_-1')
if (!boxNode || boxNode.mesh === undefined || boxNode.translation || boxNode.rotation || boxNode.matrix) {
  throw new Error('t01.gltf: le mesh box__0_-1 doit exister avec une transformation identité')
}
const posAccessor = gltf.accessors[gltf.meshes[boxNode.mesh].primitives[0].attributes.POSITION]
if (!posAccessor?.min || !posAccessor?.max) throw new Error('t01.gltf: bounds POSITION manquants pour box__0_-1')
const zMin = posAccessor.min[2], zMax = posAccessor.max[2]
// Garde 20 m aux extrémités; chaque modèle local fait ~19.2 m de large le long de la façade.
const zStart = zMax - 20, zEnd = zMin + 22

// Hauteurs Y : mêmes décodage, lissage et interpolation que TrackSurface.sample() dans le jeu.
const raw = new Float32Array(n * nd), H = new Float32Array(n * nd)
for (let k = 0; k < raw.length; k++) raw[k] = ((cells.readUInt16LE(k * 2) >> 3) - 4096) * 0.01
const along = new Float32Array(raw.length), weights = [1, 2, 3, 4, 3, 2, 1]
for (let i = 0; i < n; i++) for (let j = 0; j < nd; j++) {
  const h0 = raw[i * nd + j]; let sum = 0, ws = 0
  for (let k = -3; k <= 3; k++) {
    const h = raw[((i + k + n) % n) * nd + j]
    if (Math.abs(h - h0) < 0.06) { sum += h * weights[k + 3]; ws += weights[k + 3] }
  }
  along[i * nd + j] = sum / ws
}
for (let i = 0; i < n; i++) for (let j = 0; j < nd; j++) {
  const h0 = along[i * nd + j]; let sum = h0 * 2, ws = 2
  for (const k of [-1, 1]) {
    const jj = j + k
    if (jj < 0 || jj >= nd) continue
    const h = along[i * nd + jj]
    if (Math.abs(h - h0) < 0.04) { sum += h; ws++ }
  }
  H[i * nd + j] = sum / ws
}
const trackTx = new Float64Array(n), trackTz = new Float64Array(n)
for (let i = 0; i < n; i++) {
  const dx = surface.cx[(i + 2) % n] - surface.cx[(i - 2 + n) % n]
  const dz = surface.cz[(i + 2) % n] - surface.cz[(i - 2 + n) % n]
  const len = Math.hypot(dx, dz) || 1
  trackTx[i] = dx / len; trackTz[i] = dz / len
}
const heightAtWorld = (x, z) => {
  let best = 0, bestD2 = Infinity
  for (let i = 0; i < n; i += 4) {
    const dx = x - surface.cx[i], dz = z - surface.cz[i], d2 = dx * dx + dz * dz
    if (d2 < bestD2) { bestD2 = d2; best = i }
  }
  let i0 = best, nearD2 = Infinity
  for (let k = best - 12; k <= best + 12; k++) {
    const i = (k + n) % n, dx = x - surface.cx[i], dz = z - surface.cz[i], d2 = dx * dx + dz * dz
    if (d2 < nearD2) { nearD2 = d2; i0 = i }
  }
  const project = (a, b) => {
    const ex = surface.cx[b] - surface.cx[a], ez = surface.cz[b] - surface.cz[a]
    const l2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((x - surface.cx[a]) * ex + (z - surface.cz[a]) * ez) / l2))
    const px = surface.cx[a] + ex * t - x, pz = surface.cz[a] + ez * t - z
    return { t, d2: px * px + pz * pz }
  }
  const ip = (i0 + 1) % n, im = (i0 - 1 + n) % n
  const a = project(i0, ip), b = project(im, i0), i = a.d2 <= b.d2 ? i0 : im, f = a.d2 <= b.d2 ? a.t : b.t
  const i1 = (i + 1) % n
  const cx = surface.cx[i] + (surface.cx[i1] - surface.cx[i]) * f
  const cz = surface.cz[i] + (surface.cz[i1] - surface.cz[i]) * f
  const cy = surface.cy[i] + (surface.cy[i1] - surface.cy[i]) * f
  let tx = trackTx[i] + (trackTx[i1] - trackTx[i]) * f
  let tz = trackTz[i] + (trackTz[i1] - trackTz[i]) * f
  const tn = Math.hypot(tx, tz) || 1; tx /= tn; tz /= tn
  const d = (x - cx) * -tz + (z - cz) * tx
  let q = (d - surface.D0) / surface.DSTEP, j = Math.floor(q), g = q - j
  if (j < 0) { j = 0; g = 0 } else if (j >= nd - 1) { j = nd - 2; g = 1 }
  const h00 = H[i * nd + j], h01 = H[i * nd + j + 1]
  const h10 = H[i1 * nd + j], h11 = H[i1 * nd + j + 1]
  const h0 = h00 + (h01 - h00) * g, h1 = h10 + (h11 - h10) * g
  return cy + h0 + (h1 - h0) * f
}

const cum = [0]
for (let i = 1; i < pitlane.x.length; i++) cum.push(cum[i - 1] + Math.hypot(pitlane.x[i] - pitlane.x[i - 1], pitlane.z[i] - pitlane.z[i - 1]))
const at = p => {
  p = Math.max(0, Math.min(cum[cum.length - 1], p))
  let lo = 0, hi = cum.length - 1
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] < p) lo = m; else hi = m }
  const span = Math.max(1e-6, cum[hi] - cum[lo]), t = (p - cum[lo]) / span
  const lerp = key => pitlane[key][lo] + (pitlane[key][hi] - pitlane[key][lo]) * t
  return { x: lerp('x'), z: lerp('z'), s: lerp('s'), d: lerp('d') }
}
const stationAtZ = target => {
  for (let i = 0; i < pitlane.z.length - 1; i++) {
    const a = pitlane.z[i], b = pitlane.z[i + 1]
    if ((target - a) * (target - b) <= 0 && Math.abs(b - a) > 1e-9) {
      const t = (target - a) / (b - a)
      return cum[i] + (cum[i + 1] - cum[i]) * t
    }
  }
  throw new Error(`pitlane.json: aucun croisement de z=${target.toFixed(2)} m`)
}
const s0 = stationAtZ(zStart), s1 = stationAtZ(zEnd)
if (!(s1 > s0)) throw new Error('Le segment garages Monza doit suivre le sens entrée→sortie')
const garage = template.garages?.[0]
if (!garage?.frame?.pos || garage.frame.yaw === undefined || !garage?.pit_stop?.local || !garage.car_park?.[0] || !garage.pitwall?.pos) throw new Error('pits.json template: ancres locales du garage/muret manquantes')
const yawSpa = garage.frame.yaw, dx = garage.car_park[0][0] - garage.frame.pos[0], dz = garage.car_park[0][2] - garage.frame.pos[2]
const parkLocal = [dx * Math.cos(yawSpa) - dz * Math.sin(yawSpa), garage.car_park[0][1] - garage.frame.pos[1], dx * Math.sin(yawSpa) + dz * Math.cos(yawSpa)]
const wdx = garage.pitwall.pos[0] - garage.frame.pos[0], wdz = garage.pitwall.pos[2] - garage.frame.pos[2]
const wallLocal = [wdx * Math.cos(yawSpa) - wdz * Math.sin(yawSpa), garage.pitwall.pos[1] - garage.frame.pos[1], wdx * Math.sin(yawSpa) + wdz * Math.cos(yawSpa)]
const frontOffset = garage.pit_stop.local[2]
const workOffset = 3.5
const measuredDoorTemplates = (template.doors ?? []).filter(d => d.action === 'remove' && d.width > 0 && d.floor_y !== undefined && d.aabb_max?.length === 3)
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] }
if (!measuredDoorTemplates.length) throw new Error('pits.json template: dimensions de portes mesurées manquantes')
const doorWidth = median(measuredDoorTemplates.map(d => d.width))
const kitDoorHeight = median(measuredDoorTemplates.map(d => d.aabb_max[1] - d.floor_y))
// La géométrie de façade Monza conserve des triangles de volet jusqu'à ~3.3 m au-dessus du seuil;
// garder la largeur mesurée du kit mais laisser 4 m libres sur ce modèle de circuit.
const doorHeight = Math.max(4, kitDoorHeight)

const garages = teams.map(([team, name], k) => {
  const station = s0 + (k + 0.5) * (s1 - s0) / teams.length
  const lodNode = template.garages.find(g => g.team === team)?.lod_node ?? `garage_lod_${team}`
  const q = at(station), qa = at(Math.max(0, station - 1)), qb = at(Math.min(cum[cum.length - 1], station + 1))
  let tx = qb.x - qa.x, tz = qb.z - qa.z, tn = Math.hypot(tx, tz)
  tx /= tn; tz /= tn
  // pitlane.probe() définit lat positive par (-tz, tx); d Monza est positif vers la rangée des garages.
  const nx = -tz, nz = tx
  const stop = [q.x + workOffset * nx, 0, q.z + workOffset * nz]
  stop[1] = heightAtWorld(stop[0], stop[2])
  // La grille hors piste peut contenir une autre surface (talus/toiture); le garage prolonge le sol de l'arrêt.
  const frame = [stop[0] + frontOffset * nx, stop[1], stop[2] + frontOffset * nz]
  // Le +Z local du garage pointe vers la voie; le +X local pointe vers l'entrée (sens inverse du trafic).
  const yaw = Math.atan2(tz, -tx), c = Math.cos(yaw), s = Math.sin(yaw)
  const carPark = [frame[0] + parkLocal[0] * c + parkLocal[2] * s, frame[1] + parkLocal[1], frame[2] - parkLocal[0] * s + parkLocal[2] * c]
  const wallX = frame[0] + wallLocal[0] * c + wallLocal[2] * s
  const wallZ = frame[2] - wallLocal[0] * s + wallLocal[2] * c
  const pitwall = { node: template.garages.find(g => g.team === team)?.pitwall?.node ?? `pitwall_${team}`, pos: [wallX, heightAtWorld(wallX, wallZ) + wallLocal[1], wallZ].map(v => +v.toFixed(3)), yaw: +Math.atan2(Math.sin(yaw + Math.PI), Math.cos(yaw + Math.PI)).toFixed(6) }
  return {
    team, name, lod_node: lodNode, frame: { pos: frame.map(v => +v.toFixed(3)), yaw: +yaw.toFixed(6) }, pitwall,
    pit_stop: { pos: stop.map(v => +v.toFixed(3)), heading: [+tx.toFixed(6), 0, +tz.toFixed(6)], local: [0, 0, +frontOffset.toFixed(3)] },
    car_park: [carPark.map(v => +v.toFixed(3))], box_station_m: +station.toFixed(3),
  }
})
const doors = garages.map(g => ({
  team: g.team, action: 'remove', center: g.frame.pos, yaw: g.frame.yaw,
  width: +doorWidth.toFixed(3), floor_y: g.frame.pos[1], height: +doorHeight.toFixed(3), depth: 0.8,
}))

const output = {
  circuit: 'monza_2020', season: 2020,
  source: {
    garages_mesh: 'scene/t01.gltf → box__0_-1 POSITION bounds',
    pitlane: 'track/pitlane.json, interpolated along route entry→exit',
    elevation: 'track/surface.json + surface.bin, same smoothing and height convention as TrackSurface.sample()',
    garage_anchor_template: 'shared/assets/spa_pits/pits.json; only local model-space pit_stop/car_park/pitwall offsets and npc_spots are reused',
    note: 'Aucune coordonnée monde ni aucun triangle Spa. Frames, arrêts, muret et ouvertures de portes sont calculés depuis la pitlane/surface Monza; seules les dimensions standard d’ouverture sont reprises des portes mesurées du kit.',
  },
  conventions: {
    frame: 'Repère circuit glTF Y-haut, mètres; origine au centre de façade, calculée depuis le bâtiment et la pitlane Monza.',
    yaw: 'Rotation autour de +Y; node +Z orienté vers la voie; node +X orienté vers l’entrée de la voie.',
    work_lane: 'Pit stop à 3.5 m sur lat positive de Pitlane.probe(); garage façade 4.5 m plus loin vers le bâtiment; stands du muret à l’emplacement opposé calculé depuis le même axe de pitlane.',
    s: 'Abscisse curviligne de track/pitlane.json; les cases sont réparties dans l’emprise GLTF box__0_-1.',
  },
  geometry: {
    box_mesh: 'box__0_-1',
    box_bounds_glTF: { min: posAccessor.min, max: posAccessor.max },
    row_z_m: [+(zStart).toFixed(3), +(zEnd).toFixed(3)],
    pitlane_station_range_m: [+s0.toFixed(3), +s1.toFixed(3)],
    work_offset_m: workOffset, garage_front_offset_m: +frontOffset.toFixed(3),
  },
  doors,
  player_garage: { npc_spots: template.player_garage?.npc_spots ?? [] },
  garages,
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n')
console.log(`Écrit ${outputPath}: ${garages.length} boxes Monza; stations ${s0.toFixed(1)}–${s1.toFixed(1)} m; z ${zStart.toFixed(1)}–${zEnd.toFixed(1)} m.`)
console.log(garages.map(g => `${g.team}: stop (${g.pit_stop.pos.map(v => v.toFixed(2)).join(', ')})`).join('\n'))
