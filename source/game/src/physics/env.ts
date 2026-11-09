/**
 * État de la piste et météo (sans three.js → testable sous Node).
 *  - Gomme (« rubbering-in ») : chaque passage de pneu qui glisse dépose de la gomme sur la trajectoire ; trafic virtuel
 *    du plateau (19 autres voitures) en plus de la nôtre → la trajectoire gagne jusqu'à +3 % d'adhérence (E, ordre de
 *    grandeur cité par Pirelli / ingénieurs : 1 à 3 %, ~1–2 s/tour sur un week-end).
 *  - « Marbles » : petites boulettes de gomme rejetées hors trajectoire, proportionnelles à la gomme de la session :
 *    jusqu'à −22 % d'adhérence (E) et ramassage (« pick-up ») par les pneus qui roulent dessus.
 *  - Eau : film d'eau (mm) par case (s, d) : pluie − drainage − évaporation − passages (gerbes) → une trajectoire sèche
 *    se forme ; flaques aux points bas (bruit déterministe). Aquaplaning selon épaisseur, vitesse, largeur et capacité
 *    d'évacuation des rainures (Pirelli : pluie 85 L/s, intermédiaire 30 L/s par pneu à 300 km/h — P).
 *  - Températures air / piste (soleil, nuages, pluie) ; densité de l'air (pression à 400 m, humidité) ; vent + rafales.
 * P = publié, E = estimation.
 */
export type Weather = 'dry' | 'damp' | 'wet' | 'rain'
export type TyreKind = 'slick' | 'inter' | 'wet'
export const WEATHER: Record<Weather, { rain: number; water: number; air: number; track: number; cloud: number; label: string }> = {
  //        pluie mm/h   film initial mm   air °C   piste °C   couverture
  dry:  { rain: 0, water: 0, air: 18, track: 27, cloud: 0.25, label: 'Sec' },      // E : qualif Spa 2020 ≈ 18 °C air / 25–30 °C piste
  damp: { rain: 0, water: 0.25, air: 15, track: 17, cloud: 0.8, label: 'Humide' },
  wet:  { rain: 3, water: 0.5, air: 13, track: 15, cloud: 0.95, label: 'Pluie légère' },
  rain: { rain: 9, water: 1.5, air: 12, track: 14, cloud: 1, label: 'Forte pluie' },
}
/** capacité d'évacuation d'eau par pneu à 300 km/h (L/s) : P pour pluie/inter (Pirelli 2017→2020), E pour le slick (pas de rainures) */
export const EVAC: Record<TyreKind, number> = { slick: 4, inter: 30, wet: 85 }
const NB = 26, D0 = -9.75, DD = 0.75 // cases latérales de 0,75 m de −9,75 à +9,75 m
const SS = 8                           // cases longitudinales de 8 m
const DRAIN = 0.0017                    // s⁻¹ : drainage du film par le dévers (E : équilibre ≈ 0,5 mm sous 3 mm/h, ≈ 1,5 mm sous 9 mm/h)
const TRAFFIC = 19                      // autres voitures (trafic virtuel du plateau)

export interface GripSample { mu: number; aqua: number; water: number; rubber: number; marbles: number }
export class TrackEnv {
  L: number; NS: number
  rubber: Float32Array; marbles: Float32Array; water: Float32Array; puddle: Float32Array
  /** dépôts d'herbe/terre ramenés en piste après une sortie (s'efface avec les passages) */
  dirt: Float32Array
  weather: Weather = 'dry'; rainRate = 0; cloud = 0.25; airT = 18; trackT = 27; trackTTarget = 27
  pressure = 96_600 // Pa : Spa ≈ 400 m d'altitude (P : altitude ; E : météo)
  humidity = 0.6
  wind = [0, 0, 0]; private gust = [0, 0]; windBase = [-2.2, 1.6] // E : vent dominant de sud-ouest ≈ 2,7 m/s
  lapsTraffic = 0
  private lineD: (s: number) => number
  private seed = 1
  constructor(length: number, lineD: (s: number) => number) {
    this.L = length; this.NS = Math.ceil(length / SS); this.lineD = lineD
    const n = this.NS * NB
    this.rubber = new Float32Array(n); this.marbles = new Float32Array(n); this.water = new Float32Array(n); this.puddle = new Float32Array(n); this.dirt = new Float32Array(n)
    // flaques : points bas pseudo-aléatoires mais stables (même piste à chaque session), plus fréquents près des bords
    for (let i = 0; i < this.NS; i++) for (let j = 0; j < NB; j++) {
      const h = hash(i * 0.37, j * 1.31), h2 = hash(Math.floor(i / 6) * 2.1, 7.7), edge = Math.abs(D0 + (j + 0.5) * DD) / 9
      this.puddle[i * NB + j] = 1 + 1.0 * Math.max(0, h2 - 0.72) / 0.28 * (0.5 + 0.5 * h) + 0.4 * edge * edge
    }
    this.setWeather('dry'); this.setEvolution(0.55)
  }
  idx(s: number, d: number) {
    let i = Math.floor((((s % this.L) + this.L) % this.L) / SS); if (i >= this.NS) i = this.NS - 1
    let j = Math.floor((d - D0) / DD); j = j < 0 ? 0 : j >= NB ? NB - 1 : j
    return i * NB + j
  }
  /** niveau de gomme de départ de la session (0 piste verte, 1 piste très gommée) ; marbles hors trajectoire en proportion */
  setEvolution(level: number) {
    for (let i = 0; i < this.NS; i++) {
      const ld = this.lineD(i * SS + SS / 2)
      for (let j = 0; j < NB; j++) {
        const d = D0 + (j + 0.5) * DD, off = Math.abs(d - ld)
        this.rubber[i * NB + j] = level * Math.exp(-(off * off) / (2 * 1.1 * 1.1))
        this.marbles[i * NB + j] = off > 2.4 && off < 7.5 ? level * 0.7 * Math.min(1, (off - 2.4) / 1.2) : 0
        this.dirt[i * NB + j] = 0
      }
    }
  }
  setWeather(w: Weather) {
    const W = WEATHER[w]; this.weather = w; this.rainRate = W.rain; this.cloud = W.cloud; this.airT = W.air; this.trackT = this.trackTTarget = W.track
    for (let k = 0; k < this.water.length; k++) this.water[k] = W.water * (W.water > 0 ? this.puddle[k] : 0)
    // la pluie lave la gomme et disperse les marbles
    if (w === 'wet' || w === 'rain') for (let k = 0; k < this.rubber.length; k++) { this.rubber[k] *= 0.6; this.marbles[k] *= 0.3 }
  }
  /** film d'eau moyen à la trajectoire (pour l'affichage, l'audio, les gerbes) */
  wetness = 0
  /** densité de l'air (kg/m³) : gaz parfait avec vapeur d'eau (formule de Tetens), P/(R·T) */
  get rho() {
    const T = this.airT + 273.15, ps = 610.78 * Math.exp(17.27 * this.airT / (this.airT + 237.3)), pv = this.humidity * ps
    return (this.pressure - pv) / (287.05 * T) + pv / (461.5 * T)
  }
  /** Adhérence de la surface pour un pneu (multiplicateur du μ sec), aquaplaning compris. */
  grip(s: number, d: number, speed: number, kind: TyreKind, width: number, out: GripSample): GripSample {
    const k = this.idx(s, d), w = this.water[k], r = this.rubber[k], m = this.marbles[k], dirt = this.dirt[k]
    // sec : gomme +3 % max ; marbles −22 % max ; terre −30 % max (E)
    let mu = (1 + 0.03 * r) * (1 - 0.22 * m) * (1 - 0.3 * Math.min(1, dirt))
    // mouillé : adhérence du composé selon le film d'eau (E, calé sur les écarts de temps au tour pluie/sec ≈ 12–20 %)
    const wf = Math.min(1, w / 0.6)
    if (kind === 'slick') mu *= 1 - 0.5 * smooth(wf)
    else if (kind === 'inter') mu *= 0.88 - 0.14 * wf     // inter : −12 % sur le sec (gomme tendre, rainures), −26 % mouillé
    else mu *= 0.8 - 0.12 * wf                            // pluie : −20 % sur le sec, −32 % dans l'eau (E : tours sous pluie ≈ +15–20 %)
    // trajectoire gommée mouillée : plus glissante (la gomme lisse ne draine pas)
    mu *= 1 - 0.07 * r * wf
    // aquaplaning : débit à chasser D = largeur × vitesse × épaisseur ; capacité des rainures C(v) = C300·√(v/83,3)
    let aqua = 0
    if (w > 0.05 && speed > 5) {
      const D = width * speed * w // L/s (m × m/s × mm = L/s)
      const C = EVAC[kind] * Math.sqrt(speed / 83.3) + 1.5
      aqua = Math.max(0, Math.min(1, (D / C - 1) / 1.5))
      mu *= 1 - 0.85 * aqua
    }
    out.mu = mu; out.aqua = aqua; out.water = w; out.rubber = r; out.marbles = m
    return out
  }
  /** passage d'un pneu : dépôt de gomme selon la puissance de glissement, l'eau chassée, la terre balayée */
  pass(s: number, d: number, slipPower: number, speed: number, dt: number, worn: number) {
    const k = this.idx(s, d)
    const hot = 0.6 + 0.4 * Math.min(1.5, this.trackT / 30)
    this.rubber[k] = Math.min(1, this.rubber[k] + slipPower * 2.2e-9 * hot * dt * (this.water[k] > 0.3 ? 0.2 : 1))
    if (worn > 0.3 && Math.random() < dt * 0.4) { const j = this.idx(s, d + (Math.random() < 0.5 ? -3 : 3)); this.marbles[j] = Math.min(1, this.marbles[j] + 0.01) }
    if (speed > 10) { this.water[k] *= 1 - Math.min(0.5, dt * 0.25); this.dirt[k] *= 1 - Math.min(0.5, dt * 0.6) }
  }
  /** sortie dans l'herbe / le gravier : terre ramenée sur la piste à l'endroit du retour */
  dropDirt(s: number, d: number, amount: number) {
    for (let a = -2; a <= 2; a++) { const k = this.idx(s + a * SS, d); this.dirt[k] = Math.min(1, this.dirt[k] + amount * (1 - Math.abs(a) * 0.3)) }
  }
  /** Évolution : pluie, drainage, évaporation, trafic virtuel (gomme + trajectoire qui sèche), température, rafales. */
  update(dt: number, lapTime = 106) {
    // température de piste : soleil (1 − nuages) chauffe, pluie refroidit (E)
    this.trackT += (this.trackTTarget - this.trackT) * Math.min(1, dt / 300)
    const evap = (0.00012 + 0.00025 * (1 - this.cloud)) * Math.max(0.3, this.trackT / 25)
    const rain = this.rainRate / 3600
    const pass = TRAFFIC * dt / lapTime // passages virtuels par case de trajectoire
    let wsum = 0, wn = 0
    for (let i = 0; i < this.NS; i++) {
      const ld = this.lineD(i * SS + SS / 2), jl = Math.max(0, Math.min(NB - 1, Math.floor((ld - D0) / DD))), rl = this.rubber[i * NB + jl]
      for (let j = 0; j < NB; j++) {
        const k = i * NB + j, off = Math.abs(D0 + (j + 0.5) * DD - ld), onLine = Math.exp(-(off * off) / 2)
        let w = this.water[k]
        w += (rain * this.puddle[k] - DRAIN * w - (w > 0 ? evap : 0)) * dt
        w -= w * 0.012 * pass * onLine // gerbes du plateau : la trajectoire sèche en premier
        this.water[k] = w > 0 ? w : 0
        if (w < 0.2) this.rubber[k] = Math.min(1, this.rubber[k] + 0.0035 * pass * onLine)
        else this.rubber[k] *= 1 - 0.00002 * dt * w // la pluie lave lentement la gomme
        if (off > 2.4 && off < 7.5 && w < 0.2) this.marbles[k] = Math.min(1, this.marbles[k] + 0.0012 * pass * rl)
        this.dirt[k] *= 1 - 0.002 * pass * onLine
        if (onLine > 0.6) { wsum += this.water[k]; wn++ }
      }
    }
    this.wetness = wn ? wsum / wn : 0
    this.lapsTraffic += pass
    // rafales : processus d'Ornstein-Uhlenbeck (σ ≈ 1,6 m/s, τ ≈ 5 s, E)
    const tau = 5, sig = 1.6
    for (let a = 0; a < 2; a++) this.gust[a] += (-this.gust[a] / tau) * dt + sig * Math.sqrt(2 * dt / tau) * gauss(this)
    this.wind[0] = this.windBase[0] + this.gust[0]; this.wind[2] = this.windBase[1] + this.gust[1]
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 }
}
function smooth(x: number) { return x * x * (3 - 2 * x) }
function hash(x: number, y: number) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }
function gauss(e: TrackEnv) { const u = Math.max(1e-9, e.rnd()), v = e.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
