/** Gestion des niveaux de détail du plateau, indépendante de la physique. */
export type CarLOD = 0 | 1 | 2 | 3
export type LODQuality = 'low' | 'medium' | 'high' | 'ultra'

export interface CarLODInput {
  id: string
  /** Distance caméra-voiture au carré, pour éviter une racine pour chaque adversaire. */
  distanceSq: number
  /** La sphère englobante de la voiture intersecte le frustum caméra. */
  visible: boolean
  hasHD: boolean
  /** Distance à laquelle LOD1 passe en LOD2 (60 m pour les équipes sans HD, sinon 120 m). */
  lod1Distance: number
  /** Distance à laquelle LOD2 passe au niveau 3 (culling). */
  lod2Distance: number
}

/** Nombre maximal de voitures avec le modèle complet visibles en même temps. */
export const HD_BUDGET: Readonly<Record<LODQuality, number>> = {
  low: 2,
  medium: 4,
  high: 6,
  ultra: 8,
}

export const HD_MAX_DISTANCE = 36
export const LOD_HYSTERESIS = 0.12
const HD_EXIT_DISTANCE = HD_MAX_DISTANCE * (1 + LOD_HYSTERESIS)
/** Une voiture HD conserve une légère priorité pour éviter les permutations à distance égale. */
const RETAINED_HD_SCORE = 0.85

/**
 * LOD0 = modèle complet (si autorisé par le budget), LOD1/2 = maillages fournis,
 * LOD3 = niveau cullé au-delà de sa portée. Les transitions ont une bande de
 * 12 % afin d’éviter le clignotement lorsque la caméra oscille autour d’un seuil.
 */
export class CarLODManager {
  private previous = new Map<string, CarLOD>()

  update(cars: readonly CarLODInput[], quality: string): Map<string, CarLOD> {
    const budget = HD_BUDGET[quality as LODQuality] ?? HD_BUDGET.low
    const eligible = cars.filter(car => {
      if (!car.hasHD || !car.visible || !Number.isFinite(car.distanceSq) || car.distanceSq < 0) return false
      const distance = Math.sqrt(car.distanceSq)
      const wasHD = this.previous.get(car.id) === 0
      return distance <= (wasHD ? HD_EXIT_DISTANCE : HD_MAX_DISTANCE)
    })

    // Pour une même taille de voiture à l’écran, la distance caméra est un bon
    // proxy de sa taille projetée. Le frustum élimine les voitures hors écran.
    // La petite préférence aux détenteurs HD évite les échanges répétés en peloton.
    eligible.sort((a, b) => {
      const score = (car: CarLODInput) => car.distanceSq * (this.previous.get(car.id) === 0 ? RETAINED_HD_SCORE ** 2 : 1)
      return score(a) - score(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })
    const selectedHD = new Set(eligible.slice(0, budget).map(car => car.id))

    const next = new Map<string, CarLOD>()
    for (const car of cars) {
      const distance = Number.isFinite(car.distanceSq) && car.distanceSq >= 0 ? Math.sqrt(car.distanceSq) : Infinity
      const prior = this.previous.get(car.id)
      let tier: CarLOD
      if (prior === 1 && distance < car.lod1Distance * (1 + LOD_HYSTERESIS)) tier = 1
      else if (prior === 2 && distance > car.lod1Distance * (1 - LOD_HYSTERESIS) && distance < car.lod2Distance * (1 + LOD_HYSTERESIS)) tier = 2
      else if (prior === 3 && distance > car.lod2Distance * (1 - LOD_HYSTERESIS)) tier = 3
      else if (distance < car.lod1Distance) tier = 1
      else if (distance < car.lod2Distance) tier = 2
      else tier = 3

      if (selectedHD.has(car.id)) tier = 0
      next.set(car.id, tier)
    }
    this.previous = next
    return next
  }

  reset() { this.previous.clear() }
}
