import assert from 'node:assert/strict'
import * as THREE from 'three'
import { cloneTyreMaterials, setTyreCompoundColor, tyreCompoundColor } from '../src/render/tyreColor.ts'

const expected = new Map([
  ['C4', '#ff3b30'], ['C5', '#ff3b30'], ['S', '#ff3b30'],
  ['C3', '#ffd60a'], ['M', '#ffd60a'],
  ['C1', '#f2f2f7'], ['C2', '#f2f2f7'], ['H', '#f2f2f7'],
  ['I', '#30d158'], ['W', '#0a84ff'],
])
for (const [compound, color] of expected) {
  assert.equal(tyreCompoundColor(compound as Parameters<typeof tyreCompoundColor>[0]), color, `${compound} garde la couleur prévue`)
}

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

function compile(material: THREE.MeshStandardMaterial) {
  const shader = { uniforms: {}, fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n}' }
  material.onBeforeCompile(shader as never, null as never)
  return shader
}
const firstShader = compile(firstMaterials[0]), secondShader = compile(secondMaterials[0])
const uniforms = (shader: ReturnType<typeof compile>) => shader.uniforms as Record<string, { value: THREE.Color }>
assert(uniforms(firstShader).uTyreCompoundColor.value.equals(new THREE.Color('#ff3b30')), 'la première voiture reçoit la teinte soft rouge')
assert(uniforms(secondShader).uTyreCompoundColor.value.equals(new THREE.Color('#30d158')), 'la seconde voiture reçoit la teinte inter verte')
assert(secondShader.fragmentShader.includes('tyreYellowStripe'), 'seule la bande jaune de la texture est remplacée par la couleur du composé')
setTyreCompoundColor(firstMaterials, 'W')
assert(uniforms(firstShader).uTyreCompoundColor.value.equals(new THREE.Color('#0a84ff')), 'un arrêt au stand peut passer au bleu pluie')
assert(uniforms(secondShader).uTyreCompoundColor.value.equals(new THREE.Color('#30d158')), 'changer le composé d’une voiture ne recolore pas l’autre')

shared.map?.dispose(); firstMaterials[0].map?.dispose(); secondMaterials[0].map?.dispose()
console.log('OK : couleurs des composés, bande Pirelli recolorée et matériaux isolés par voiture')
