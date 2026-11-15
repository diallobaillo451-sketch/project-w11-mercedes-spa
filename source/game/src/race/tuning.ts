/** Réglages de performance des IA, à un seul endroit.
 *  Surcharge de test dans l'URL : ?aigrip=1.05&aispread=0.5&aiboost=1.02&aik=1.09 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const num = (k: string, d: number) => { const v = q ? Number(q.get(k)) : NaN; return Number.isFinite(v) && v > 0 ? v : d }
/** bonus d'adhérence des pneus des IA physiques (comme l'aide à l'IA de tous les jeux de course) : à utilisation d'adhérence égale à celle
 *  de l'autopilote de calibrage, la vitesse en courbe monte de √AI_GRIP (1,08 → +3,9 %, soit environ −2,3 s au tour à Spa) */
export const AI_GRIP = num('aigrip', 1.08)
/** part des écarts réels 2020 entre équipes / pilotes conservée (1 = écarts réels, 0 = plateau identique) */
export const AI_SPREAD = num('aispread', 0.5)
/** plateau plus rapide que les temps réels 2020 : temps de tour cible ÷ AI_BOOST_T */
export const AI_BOOST_T = num('aiboost', 1.025)
/** marge pilote des IA : multiple du profil de vitesse μ = 1 (base : celle de l'autopilote de calibrage du circuit, × √AI_GRIP) */
export const physKFor = (base: number) => num('aik', base * Math.sqrt(AI_GRIP))
