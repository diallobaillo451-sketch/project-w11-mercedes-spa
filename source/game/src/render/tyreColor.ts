/** Couleurs de composés et teinte de la bande Pirelli déjà présente sur les textures des voitures. */
import * as THREE from 'three'
import type { Compound } from '../physics/params.ts'
import { COMP_COLOR, type Comp } from '../race/data.ts'
import { matRole } from './livery.ts'

type TyreCompound = Compound | Comp
interface ShaderState { color: THREE.Color; uniform: THREE.IUniform<THREE.Color> | null }

const PHYSICS_TO_RACE: Record<Compound, Comp> = {
  C1: 'H', C2: 'H', C3: 'M', C4: 'S', C5: 'S', I: 'I', W: 'W',
}
const TYRE_NAME = /tyre|tire|pneu/i
const shaderStates = new WeakMap<THREE.MeshStandardMaterial, ShaderState>()

/** Même palette que les indications de composé du plateau et des écrans des stands. */
export function tyreCompoundColor(compound: TyreCompound): string {
  const code = compound in COMP_COLOR ? compound as Comp : PHYSICS_TO_RACE[compound as Compound]
  return COMP_COLOR[code]
}

function isTyreMaterial(mesh: THREE.Mesh, material: THREE.Material) {
  const role = matRole(material.name || '')
  return role === 'tyre' || (role === 'other' && TYRE_NAME.test(mesh.name))
}

/** Clone uniquement les matériaux de pneus concernés, en les isolant par voiture. */
export function cloneTyreMaterials(roots: readonly THREE.Object3D[]): THREE.MeshStandardMaterial[] {
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const result = new Set<THREE.MeshStandardMaterial>()
  for (const root of roots) root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const source = mesh.material, materials = Array.isArray(source) ? source : [source]
    let changed = false
    const next = materials.map(original => {
      const material = original as THREE.MeshStandardMaterial
      if (!material.isMeshStandardMaterial || !isTyreMaterial(mesh, material)) return original
      let copy = copies.get(original)
      if (!copy) { copy = material.clone(); copies.set(original, copy) }
      changed = true; result.add(copy)
      return copy
    })
    if (changed) mesh.material = Array.isArray(source) ? next : next[0]
  })
  return [...result]
}

function installStripeShader(material: THREE.MeshStandardMaterial): ShaderState {
  const state: ShaderState = { color: new THREE.Color(), uniform: null }
  const previousCompile = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    const common = '#include <common>'
    if (shader.fragmentShader.includes(common)) {
      shader.fragmentShader = shader.fragmentShader.replace(common, `${common}\nuniform vec3 uTyreCompoundColor;`)
    }
    const mapFragment = '#include <map_fragment>'
    const stripe = `
// Recolor only the original saturated-yellow Pirelli sidewall stripe, not the rubber.
float tyreYellowStripe = smoothstep(0.18, 0.58, diffuseColor.r)
  * smoothstep(0.18, 0.58, diffuseColor.g)
  * (1.0 - smoothstep(0.04, 0.20, diffuseColor.b));
diffuseColor.rgb = mix(diffuseColor.rgb, uTyreCompoundColor, tyreYellowStripe);
`
    if (shader.fragmentShader.includes(mapFragment)) {
      shader.fragmentShader = shader.fragmentShader.replace(mapFragment, mapFragment + stripe)
      const uniform = { value: state.color }
      shader.uniforms.uTyreCompoundColor = uniform
      state.uniform = uniform
    }
  }
  material.customProgramCacheKey = () => `${previousKey}|tyre-compound-stripe-v1`
  material.needsUpdate = true
  shaderStates.set(material, state)
  return state
}

/** Met à jour les pneus sans remplacer leur texture ni recolorer la gomme noire. */
export function setTyreCompoundColor(materials: readonly THREE.MeshStandardMaterial[], compound: TyreCompound) {
  const hex = tyreCompoundColor(compound)
  for (const material of materials) {
    if (!material.map) { material.color.set(hex); continue }
    const state = shaderStates.get(material) ?? installStripeShader(material)
    state.color.set(hex)
    if (state.uniform) state.uniform.value = state.color
  }
}
