/** Niveaux de qualité + adaptation dynamique (vise 60 i/s). Tous les niveaux chargent la MÊME piste pleine qualité et la
 *  voiture haute définition : l'adaptation ne touche que la résolution, le GTAO, le bloom et la carte d'ombre. */
export type QualityName = 'low' | 'medium' | 'high' | 'ultra'
export interface QualityPreset {
  name: QualityName; label: string
  dprMax: number; car: 'high'
  shadowMap: number; shadowRange: number; softShadows: boolean
  bloom: boolean; gtao: boolean; gtaoScale: number; msaa: boolean
  anisotropy: number; envIntensity: number; particles: number; drawDistance: number
  /** sonde de réflexion voiture : taille du cube (0 = ciel seul), 1 face toutes les probeEvery images */
  probe: number; probeEvery: number
  /** budget de pixels rendus (1080p = 2,07 MP, 1440p « 2K » = 3,69 MP) et cadence visée */
  pxBudget: number; fps: number
}
export const QUALITY: Record<QualityName, QualityPreset> = {
  low:    { name: 'low', label: 'Basse', dprMax: 1.0, car: 'high', shadowMap: 1024, shadowRange: 22, softShadows: false, bloom: false, gtao: false, gtaoScale: 0.5, msaa: false, anisotropy: 2, envIntensity: 0.9, particles: 120, drawDistance: 1400, probe: 0, probeEvery: 1, pxBudget: 0.9e6, fps: 60 },
  medium: { name: 'medium', label: 'Moyenne', dprMax: 1.5, car: 'high', shadowMap: 2048, shadowRange: 30, softShadows: true, bloom: false, gtao: false, gtaoScale: 0.5, msaa: true, anisotropy: 4, envIntensity: 1.0, particles: 300, drawDistance: 2200, probe: 64, probeEvery: 2, pxBudget: 1.4e6, fps: 60 },
  high:   { name: 'high', label: '1080p · 60 i/s', dprMax: 3.0, car: 'high', shadowMap: 2048, shadowRange: 34, softShadows: true, bloom: false, gtao: true, gtaoScale: 0.5, msaa: true, anisotropy: 16, envIntensity: 1.0, particles: 600, drawDistance: 3500, probe: 128, probeEvery: 1, pxBudget: 2.08e6, fps: 60 },
  ultra:  { name: 'ultra', label: '2K · 30 i/s', dprMax: 3.0, car: 'high', shadowMap: 4096, shadowRange: 40, softShadows: true, bloom: false, gtao: true, gtaoScale: 1.0, msaa: true, anisotropy: 16, envIntensity: 1.05, particles: 1000, drawDistance: 5000, probe: 256, probeEvery: 1, pxBudget: 3.7e6, fps: 30 },
}
/** Choix initial : Haute partout (piste pleine qualité) ; l'adaptation dynamique réduit les effets si besoin. */
export function defaultQuality(): QualityName {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
  void ios; return 'high'
}
/** échelle de résolution × niveau d'effets (0 tout, 1 sans GTAO, 2 sans bloom, 3 ombre ÷ 2) — du meilleur au plus léger */
// Netteté d'abord : on retire les effets coûteux AVANT de toucher à la résolution, qui ne descend jamais sous 0,85.
// Si 60 i/s restent hors d'atteinte, la cadence passe à 30 i/s régulières en pleine résolution (lock30) plutôt que de flouter.
export const ADAPT_LADDER: [number, number][] = [[1, 0], [1, 1], [1, 2], [1, 3], [0.92, 3], [0.85, 3]]
export class AdaptiveResolution {
  step = 0; private acc = 0; private n = 0; private hold = 0
  /** 60 i/s intenables même sans effets → 30 i/s régulières, résolution pleine */
  lock30 = false
  enabled = true
  get scale() { return ADAPT_LADDER[this.step][0] }
  get fx() { return ADAPT_LADDER[this.step][1] }
  reset() { this.step = 0; this.acc = 0; this.n = 0; this.hold = 0; this.lock30 = false; this.targetMs = this.baseMs }
  baseMs = 1000 / 60
  /** Retourne true si le palier a changé (descend au-delà de 19,5 ms/image, remonte sous 14,5 ms). */
  /** cadence visée (60 ou 30 i/s) : seuils de descente / remontée relatifs au budget d'image */
  targetMs = 1000 / 60
  sample(frameMs: number): boolean {
    if (!this.enabled) return false
    this.acc += Math.min(frameMs, 100); this.n++
    if (this.hold > 0) { this.hold--; if (this.n >= 30) { this.acc = 0; this.n = 0 } return false }
    if (this.n < 60) return false
    const avg = this.acc / this.n; this.acc = 0; this.n = 0
    const old = this.step
    if (avg > this.targetMs * 1.17) {
      if (this.step === 3 && !this.lock30 && this.targetMs < 25) { this.lock30 = true; this.targetMs = 1000 / 30; this.step = 1; this.hold = 120; return true }
      this.step = Math.min(ADAPT_LADDER.length - 1, this.step + 1)
    }
    else if (avg < this.targetMs * 0.87 && this.step > 0) this.step--
    if (old !== this.step) { this.hold = 90; return true }
    return false
  }
}
