import assert from 'node:assert/strict'
import * as THREE from 'three'
import { cloneTyreMaterials, setTyreCompoundColor, tyreCompoundColor, tyreStripeMaskCoverage } from '../src/render/tyreColor.ts'

const expected = new Map([
  ['C4', '#d33136'], ['C5', '#d33136'], ['S', '#d33136'],
  ['C3', '#d8b43d'], ['M', '#d8b43d'],
  ['C1', '#d7d6cc'], ['C2', '#d7d6cc'], ['H', '#d7d6cc'],
  ['I', '#4b8658'], ['W', '#3e7198'],
])
for (const [compound, color] of expected) {
  assert.equal(tyreCompoundColor(compound as Parameters<typeof tyreCompoundColor>[0]), color, `${compound} garde la couleur prévue`)
}
const stripeCoverage = (hex: string) => tyreStripeMaskCoverage(new THREE.Color(hex))
assert(stripeCoverage('#b8ae00') > 0.99, 'le jaune vif de la texture est entièrement recoloré, sans mélange orange')
assert(stripeCoverage('#594600') > 0.9, 'les pixels jaunes assombris de la bande sont entièrement recolorés')
assert.equal(stripeCoverage('#1c1c1c'), 0, 'la gomme noire ne rentre pas dans le masque jaune')
assert.equal(stripeCoverage('#c85000'), 0, 'un orange rougeâtre ne rentre pas dans le masque jaune')
assert.equal(stripeCoverage('#329650'), 0, 'un vert ne rentre pas dans le masque jaune')

const shared = new THREE.MeshStandardMaterial({ name: 'Team_Tyre', map: new THREE.Texture() })
const firstRoot = new THREE.Group(), secondRoot = new THREE.Group()
const firstMesh = new THREE.Mesh(new THREE.BoxGeometry(), shared); firstMesh.name = 'FL_Tyre'
const secondMesh = new THREE.Mesh(new THREE.BoxGeometry(), shared); secondMesh.name = 'FL_Tyre'
firstRoot.add(firstMesh); secondRoot.add(secondMesh)
const firstMaterials = cloneTyreMaterials([firstRoot]), secondMaterials = cloneTyreMaterials([secondRoot])
assert.equal(firstMaterials.length, 1, 'le matériau du pneu est reconnu')
assert.notEqual(firstMaterials[0], shared, 'le matériau du pneu est cloné')
assert.notEqual(firstMaterials[0], secondMaterials[0], 'deux voitures ne partagent pas leur matériau teinté')
setTyreCompoundColor(firstMaterials, 'S')
setTyreCompoundColor(secondMaterials, 'I')
assert(firstMaterials[0].color.equals(new THREE.Color('#ffffff')), 'la texture de gomme reste intacte : seule la bande est recolorée')
const untexturedTyre = new THREE.MeshStandardMaterial({ name: 'Team_Tyre_NoMap', color: '#ffffff' })
setTyreCompoundColor([untexturedTyre], 'S')
assert(untexturedTyre.color.r < 0.02 && untexturedTyre.color.g < 0.02, 'sans bande texturée, le pneu reste en caoutchouc noir au lieu d’être entièrement rouge')
assert(untexturedTyre.roughness >= 0.82 && untexturedTyre.metalness <= 0.02, 'le caoutchouc sans texture reste mat et non métallique')

function compile(material: THREE.MeshStandardMaterial) {
  const shader = { uniforms: {}, fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n}' }
  material.onBeforeCompile(shader as never, null as never)
  return shader
}
const firstShader = compile(firstMaterials[0]), secondShader = compile(secondMaterials[0])
const uniforms = (shader: ReturnType<typeof compile>) => shader.uniforms as Record<string, { value: THREE.Color }>
assert(uniforms(firstShader).uTyreCompoundColor.value.equals(new THREE.Color('#d33136')), 'la première voiture reçoit la teinte soft rouge')
assert(uniforms(secondShader).uTyreCompoundColor.value.equals(new THREE.Color('#4b8658')), 'la seconde voiture reçoit la teinte inter verte')
assert(firstShader.fragmentShader.includes('tyreYellowChroma') && firstShader.fragmentShader.includes('tyreYellowGreenRed'), 'le masque isole le chroma jaune au lieu de dépendre d’un seuil de luminosité')
for (const [compound, color, label] of [
  ['S', '#d33136', 'soft rouge'], ['M', '#d8b43d', 'medium jaune'], ['H', '#d7d6cc', 'hard blanc'],
  ['I', '#4b8658', 'inter vert'], ['W', '#3e7198', 'full wet bleu'],
] as const) {
  setTyreCompoundColor(firstMaterials, compound)
  assert(uniforms(firstShader).uTyreCompoundColor.value.equals(new THREE.Color(color)), `la bande rend la teinte ${label}`)
}
assert(uniforms(secondShader).uTyreCompoundColor.value.equals(new THREE.Color('#4b8658')), 'changer le composé d’une voiture ne recolore pas l’autre')

shared.map?.dispose(); firstMaterials[0].map?.dispose(); secondMaterials[0].map?.dispose()
console.log('OK : couleurs Pirelli naturelles, bande latérale, caoutchouc sans texture et matériaux isolés par voiture')
