/** Couleurs de composés et teinte de la bande Pirelli déjà présente sur les textures des voitures. */
import * as THREE from 'three'
import type { Compound } from '../physics/params.ts'
import type { Comp } from '../race/data.ts'
import { matRole } from './livery.ts'

type TyreCompound = Compound | Comp
interface ShaderState { color: THREE.Color; uniform: THREE.IUniform<THREE.Color> | null }

const PHYSICS_TO_RACE: Record<Compound, Comp> = {
  C1: 'H', C2: 'H', C3: 'M', C4: 'S', C5: 'S', I: 'I', W: 'W',
}
const TYRE_NAME = /tyre|tire|pneu/i
const shaderStates = new WeakMap<THREE.MeshStandardMaterial, ShaderState>()
const TYRE_COMPOUND_COLOR: Record<Comp, string> = {
  S: '#d33136', M: '#d8b43d', H: '#d7d6cc', I: '#4b8658', W: '#3e7198',
}
const STRIPE_CHROMA = [0.002, 0.035] as const
const STRIPE_GREEN_RED = [0.35, 0.65] as const
const STRIPE_GREEN_RED_CEILING = [1.01, 1.08] as const

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** CPU equivalent of the shader mask; guards tire-albedo samples against yellow bleed. */
export function tyreStripeMaskCoverage(color: THREE.Color) {
  const greenToRed = color.g / Math.max(color.r, 0.0001)
  const chroma = Math.min(color.r, color.g) - color.b
  return smoothstep(...STRIPE_CHROMA, chroma)
    * smoothstep(...STRIPE_GREEN_RED, greenToRed)
    * (1 - smoothstep(...STRIPE_GREEN_RED_CEILING, greenToRed))
}

/** Palette utilisée uniquement par les pneus, sans modifier les couleurs de l'interface. */
export function tyreCompoundColor(compound: TyreCompound): string {
  const code = compound in TYRE_COMPOUND_COLOR ? compound as Comp : PHYSICS_TO_RACE[compound as Compound]
  return TYRE_COMPOUND_COLOR[code]
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
// Isolate yellow sidewall marks by chroma and hue to remove orange fringes.
float tyreYellowChroma = min(diffuseColor.r, diffuseColor.g) - diffuseColor.b;
float tyreYellowGreenRed = diffuseColor.g / max(diffuseColor.r, 0.0001);
float tyreYellowHue = smoothstep(${STRIPE_GREEN_RED[0].toFixed(3)}, ${STRIPE_GREEN_RED[1].toFixed(3)}, tyreYellowGreenRed)
  * (1.0 - smoothstep(${STRIPE_GREEN_RED_CEILING[0].toFixed(3)}, ${STRIPE_GREEN_RED_CEILING[1].toFixed(3)}, tyreYellowGreenRed));
float tyreYellowStripe = smoothstep(${STRIPE_CHROMA[0].toFixed(3)}, ${STRIPE_CHROMA[1].toFixed(3)}, tyreYellowChroma) * tyreYellowHue;
diffuseColor.rgb = mix(diffuseColor.rgb, uTyreCompoundColor, tyreYellowStripe);
`
    if (shader.fragmentShader.includes(mapFragment)) {
      shader.fragmentShader = shader.fragmentShader.replace(mapFragment, mapFragment + stripe)
      const uniform = { value: state.color }
      shader.uniforms.uTyreCompoundColor = uniform
      state.uniform = uniform
    }
  }
  material.customProgramCacheKey = () => `${previousKey}|tyre-compound-stripe-v2`
  material.needsUpdate = true
  shaderStates.set(material, state)
  return state
}

/** Met à jour les pneus sans remplacer leur texture ni recolorer la gomme noire. */
export function setTyreCompoundColor(materials: readonly THREE.MeshStandardMaterial[], compound: TyreCompound) {
  const hex = tyreCompoundColor(compound)
  for (const material of materials) {
    if (!material.map) {
      // Without its source texture, retain rubber instead of coloring the whole tire.
      const luma = material.color.r * 0.2126 + material.color.g * 0.7152 + material.color.b * 0.0722
      if (luma > 0.08) material.color.set('#1b1b19')
      material.roughness = Math.max(material.roughness, 0.82)
      material.metalness = Math.min(material.metalness, 0.02)
      continue
    }
    const state = shaderStates.get(material) ?? installStripeShader(material)
    state.color.set(hex)
    if (state.uniform) state.uniform.value = state.color
  }
}
