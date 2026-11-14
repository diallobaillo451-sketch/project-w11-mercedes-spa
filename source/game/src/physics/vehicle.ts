/**
 * Dynamique du véhicule W11 : corps rigide 6 DDL + 4 suspensions à rayon + pneus Pacejka (glissement combiné),
 * groupe propulseur hybride (V6 + MGU-K/MGU-H + batterie), boîte 8 rapports, différentiel autobloquant,
 * freins carbone (répartition, température, brake-by-wire AR), aéro (appui ∝ v², traînée, DRS, vent).
 * Repère glTF monde (Y haut). Repère caisse : x droite, y haut, z arrière (la voiture regarde −Z).
 * Pas fixe (240 Hz par défaut). Aucune dépendance à three.js → testable sous Node.
 */
import { W11, SURFACE, type Compound } from './params.ts'
import { mf, muPeak, newTyre, tyreThermal, kindOf, type TyreState } from './tyre.ts'
import { TrackEnv, type GripSample } from './env.ts'
import { ERS, GEAR_RATIOS, REVERSE_RATIO, icePower, engineBrakeTorque, type EngineMode } from './powertrain.ts'
import { newSample, type Surface, type SurfaceSample } from '../track/surface.ts'
import { BARRIER_KIND, type Barriers } from '../track/barriers.ts'

export interface Controls {
  throttle: number; brake: number; steer: number        // 0..1, 0..1, -1 (gauche) .. 1 (droite)
  shiftUp?: boolean; shiftDown?: boolean
  drs?: boolean; das?: boolean
  /** grille / feux / stand : frein tenu sans enclencher la marche arrière */
  noReverse?: boolean
  /** limiteur de vitesse des stands (80 km/h à Spa 2020) */
  pitLim?: boolean; overtake?: boolean
}
export interface Setup {
  brakeBias: number; diffOn: number; diffOff: number; engineMode: EngineMode; compound: Compound
  autoGear: boolean; tc: number; abs: boolean; steerAssist: number; stability: number
  drsAllowed: boolean; dasEnabled: boolean
  /** garage : ailerons 1–11 (5 = réglage Spa de référence), hauteurs de caisse (mm, par rapport à la référence), pressions à froid (+psi au-dessus du minimum Pirelli) */
  wingF: number; wingR: number; rideF: number; rideR: number; pressF: number; pressR: number
}
export const defaultSetup = (): Setup => ({ brakeBias: W11.brakeBias, diffOn: 0.45, diffOff: 0.25, engineMode: 'quali', compound: 'C4', // P : pole Spa 2020 en tendre C4
  autoGear: true, tc: 1, abs: true, steerAssist: 1, stability: 0.3, drsAllowed: true, dasEnabled: true, wingF: 5, wingR: 5, rideF: 0, rideR: 0, pressF: 0, pressR: 0 })

export interface Wheel {
  front: boolean; left: boolean; hub: [number, number, number]; r: number; I: number
  omega: number; angle: number; c: number; cPrev: number; cdot: number; contact: boolean; fz: number; fx: number; fy: number; sink?: number
  kappa: number; alpha: number; steer: number; type: number; tyre: TyreState; brakeT: number; brakeTq: number; driveTq: number
  absF: number; px: number; py: number; pz: number; slipVel: number; groundH: number; sample: SurfaceSample
}
const G = 9.81
const tmp = newSample()
const gs: GripSample = { mu: 1, aqua: 0, water: 0, rubber: 0, marbles: 0 }
export interface Damage { frontWing: number; rearWing: number; floor: number; suspension: number[]; total: number
  /** dérives d'aileron AV (G/D), déflecteurs latéraux (G/D) */
  endplate: [number, number]; barge: [number, number]
  /** roue arrachée (suspension cassée) */
  wheelOff: [boolean, boolean, boolean, boolean] }
export const newDamage = (): Damage => ({ frontWing: 0, rearWing: 0, floor: 0, suspension: [0, 0, 0, 0], total: 0, endplate: [0, 0], barge: [0, 0], wheelOff: [false, false, false, false] })
export interface Debris { part: string; pos: number[]; vel: number[] }

export class Vehicle {
  surface: Surface
  setup: Setup = defaultSetup()
  mass = W11.massMin + W11.fuelQuali
  pos = [0, 0, 0]; vel = [0, 0, 0]; q = [0, 0, 0, 1]; wb = [0, 0, 0] // vitesse angulaire repère caisse
  R = new Float64Array(9)
  cg = [0, W11.cgHeight, 0] // position CG dans le repère « modèle » (origine au sol, milieu empattement)
  wheels: Wheel[] = []
  ers = new ERS()
  gear = 1; shiftTimer = 0; rpm = 4000; rpmVis = 4000; clutchSlip = false; limiter = false
  throttleApplied = 0; brakeApplied = 0; tcCut = 0
  drsOpen = false; drsPos = 0; drsAvailable = false; dasPulled = false; dasPos = 0
  hint = -1; s = 0; d = 0; trackIdx = 0
  wind = [0, 0, 0]; airT = 18; trackT = 26
  // télémétrie / évènements
  gLat = 0; gLong = 0; speed = 0; downforce = 0; drag = 0
  scrape = 0; scrapePos = [0, 0, 0]; impact = 0; impactPos = [0, 0, 0]; offTrack = false; wheelsOut = 0; flipped = 0
  time = 0; reverseHold = 0; ebCut = 0; shiftEvent = 0; lastShiftDir = 0
  /** carburant (kg) consommé selon le débit réel ; limiteur des stands ; dégâts (0 = intact, 1 = épave) */
  fuel: number = W11.fuelQuali; pitLim = false; pitLimCut = 0
  damage: Damage = newDamage()
  /** pièces arrachées à ce pas (consommées par le rendu → débris physiques sur la piste) */
  debris: Debris[] = []
  private lost = new Set<string>()
  /** état de piste / météo (gomme, eau, marbles, vent, densité de l'air) ; null → piste sèche standard (tests) */
  env: TrackEnv | null = null
  /** usure du patin (mm, FIA : 1 mm max sur 10 mm) ; températures huile / eau (°C) ; derating moteur si surchauffe */
  plankWear = 0; oilT = 105; waterT = 95; heatDerate = 0
  /** voiture devant (aspiration / air sale) : distance (m) et décalage latéral (m) ; null = personne */
  lead: { gap: number; lat: number } | null = null
  aqua = 0; wetGrip = 1
  private wasOff = [false, false, false, false]
  /** off : aucun dégât ; visual : la voiture se casse à l'écran seulement ; real : + effets sur la physique */
  damageMode: 'off' | 'visual' | 'real' = 'real'
  private static readonly NO_DMG: Damage = newDamage()
  /** barrières réelles (contours de la géométrie rendue) ; null → anciens murs virtuels (tests sur plan) */
  barriers: Barriers | null = null; hitKind = 0; damageEvent = 0
  private bPrev = new Float64Array(64); private bInit = false
  private prevVel = [0, 0, 0]

  constructor(surface: Surface) {
    this.surface = surface
    this.barriers = (surface as { barriers?: Barriers | null }).barriers ?? null
    const b = W11.wheelbase, a = b * (1 - W11.frontMassMin) // distance CG → essieu AV
    this.cg[2] = -b / 2 + a
    const mk = (front: boolean, left: boolean): Wheel => {
      const r = front ? W11.wheelRadiusF : W11.wheelRadiusR
      const x = (left ? -1 : 1) * (front ? W11.halfTrackF : W11.halfTrackR)
      const z = front ? -b / 2 : b / 2
      return { front, left, hub: [x - this.cg[0], r - this.cg[1], z - this.cg[2]], r, I: front ? W11.wheelInertiaF : W11.wheelInertiaR,
        omega: 0, angle: 0, c: 0, cPrev: 0, cdot: 0, contact: true, fz: 0, fx: 0, fy: 0, kappa: 0, alpha: 0, steer: 0, type: 1,
        tyre: newTyre(front), brakeT: front ? 420 : 380, brakeTq: 0, driveTq: 0, absF: 1, px: 0, py: 0, pz: 0, slipVel: 0, groundH: 0, sample: newSample() }
    }
    this.wheels = [mk(true, true), mk(true, false), mk(false, true), mk(false, false)]
  }

  /** Monte un train de pneus neufs du composé choisi (couvertures chauffantes réglables, E/P). */
  fitTyres(c = this.setup.compound, blanketF?: number, blanketR?: number) {
    this.setup.compound = c
    for (const w of this.wheels) w.tyre = newTyre(w.front, c, kindOf(c) === 'slick' ? (w.front ? blanketF : blanketR) : undefined)
    for (const w of this.wheels) { const po = (w.front ? this.setup.pressF : this.setup.pressR) ?? 0; w.tyre.pOff = po; w.tyre.pressure += po }
  }
  /** Place la voiture sur la ligne centrale à l'abscisse s (m), décalage latéral d, cap = tangente. */
  placeAt(s: number, d = 0, speed = 0, yaw = 0) {
    const c = this.surface.centre(s)
    const rx = -c.tz, rz = c.tx
    const x = c.x + rx * d, z = c.z + rz * d
    const smp = this.surface.sample(x, z, c.i, tmp)
    this.hint = smp.i; this.s = smp.s; this.d = smp.d; this.trackIdx = smp.i
    // repère aligné sur la normale locale de la piste (pente + dévers)
    const n = [smp.nx, smp.ny, smp.nz]
    let f = [c.tx * Math.cos(yaw) + rx * Math.sin(yaw), 0, c.tz * Math.cos(yaw) + rz * Math.sin(yaw)]; const fd = f[0] * n[0] + f[2] * n[2]
    f = [f[0] - fd * n[0], -fd * n[1], f[2] - fd * n[2]]; const fl = Math.hypot(f[0], f[1], f[2]); f = f.map(v => v / fl)
    const back = [-f[0], -f[1], -f[2]]
    const right = [n[1] * back[2] - n[2] * back[1], n[2] * back[0] - n[0] * back[2], n[0] * back[1] - n[1] * back[0]]
    this.q = quatFromBasis(right, n, back)
    this.updateR()
    const R = this.R
    this.pos = [x + R[3] * this.cg[1] + R[6] * this.cg[2], smp.h + R[4] * this.cg[1] + R[7] * this.cg[2], z + R[5] * this.cg[1] + R[8] * this.cg[2]]
    // ajustement de hauteur : compression nulle en moyenne (pose sans choc)
    const hw = [0, 0, 0], sm = newSample()
    for (let it = 0; it < 4; it++) {
      let sum = 0
      for (const w of this.wheels) {
        this.toWorld(w.hub[0], w.hub[1], w.hub[2], hw)
        const g = this.surface.sample(this.pos[0] + hw[0], this.pos[2] + hw[2], this.hint, sm)
        sum += (g.h + w.r / Math.max(0.5, g.ny) - (this.pos[1] + hw[1])) / Math.max(0.2, R[4])
      }
      const m = sum / 4
      this.pos[0] += R[3] * m; this.pos[1] += R[4] * m; this.pos[2] += R[5] * m
    }
    this.vel = [f[0] * speed, f[1] * speed, f[2] * speed]; this.wb = [0, 0, 0]
    this.resetPlacementDynamics()
    this.gear = speed > 1 ? Math.max(1, GEAR_RATIOS.findIndex(gr => speed / W11.wheelRadiusR * gr * 60 / (2 * Math.PI) < 11500) + 1) : 1
  }
  /** Place la voiture en (x, z) avec le cap (hx, hz) : garage, voie des stands. Même pose que placeAt (repère aligné sur le sol). */
  placeAtXZ(x: number, z: number, hx: number, hz: number, speed = 0) {
    const smp = this.surface.sample(x, z, -1, tmp)
    this.hint = smp.i; this.s = smp.s; this.d = smp.d; this.trackIdx = smp.i
    const n = [smp.nx, smp.ny, smp.nz]
    let f = [hx, 0, hz]; const fd = f[0] * n[0] + f[2] * n[2]
    f = [f[0] - fd * n[0], -fd * n[1], f[2] - fd * n[2]]; const fl = Math.hypot(f[0], f[1], f[2]) || 1; f = f.map(v => v / fl)
    const back = [-f[0], -f[1], -f[2]]
    const right = [n[1] * back[2] - n[2] * back[1], n[2] * back[0] - n[0] * back[2], n[0] * back[1] - n[1] * back[0]]
    this.q = quatFromBasis(right, n, back)
    this.updateR()
    const R = this.R
    this.pos = [x + R[3] * this.cg[1] + R[6] * this.cg[2], smp.h + R[4] * this.cg[1] + R[7] * this.cg[2], z + R[5] * this.cg[1] + R[8] * this.cg[2]]
    const hw = [0, 0, 0], sm = newSample()
    for (let it = 0; it < 4; it++) {
      let sum = 0
      for (const w of this.wheels) {
        this.toWorld(w.hub[0], w.hub[1], w.hub[2], hw)
        const g = this.surface.sample(this.pos[0] + hw[0], this.pos[2] + hw[2], this.hint, sm)
        sum += (g.h + w.r / Math.max(0.5, g.ny) - (this.pos[1] + hw[1])) / Math.max(0.2, R[4])
      }
      const m = sum / 4
      this.pos[0] += R[3] * m; this.pos[1] += R[4] * m; this.pos[2] += R[5] * m
    }
    this.vel = [f[0] * speed, f[1] * speed, f[2] * speed]; this.wb = [0, 0, 0]
    this.resetPlacementDynamics()
  }
  /** Retourne les variables dynamiques aux valeurs d'une pose neuve sans remplacer les pneus ni les dégâts. */
  private resetPlacementDynamics() {
    const forward = this.forwardSpeed()
    this.speed = Math.hypot(this.vel[0], this.vel[1], this.vel[2])
    this.gLat = 0; this.gLong = 0; this.downforce = 0; this.drag = 0
    this.scrape = 0; this.scrapePos = [...this.pos]; this.impact = 0; this.impactPos = [...this.pos]
    this.offTrack = false; this.wheelsOut = 0; this.flipped = 0
    this.aqua = 0; this.wetGrip = 1; this.lead = null
    this.hitKind = 0; this.damageEvent = 0; this.wasOff.fill(false); this.prevVel = [...this.vel]; this.bInit = false
    for (const w of this.wheels) {
      w.I = w.front ? W11.wheelInertiaF : W11.wheelInertiaR; w.omega = forward / w.r; w.angle = 0
      w.c = 0; w.cPrev = 0; w.cdot = 0; w.contact = true; w.fz = 0; w.fx = 0; w.fy = 0
      w.kappa = 0; w.alpha = 0; w.steer = 0; w.type = 1
      w.brakeTq = 0; w.driveTq = 0; w.absF = 1; w.px = 0; w.py = 0; w.pz = 0
      w.slipVel = 0; w.groundH = 0; w.sample = newSample(); delete w.sink
    }
  }
  updateR() {
    const [x, y, z, w] = this.q, R = this.R
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y + z * w); R[2] = 2 * (x * z - y * w)
    R[3] = 2 * (x * y - z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z + x * w)
    R[6] = 2 * (x * z + y * w); R[7] = 2 * (y * z - x * w); R[8] = 1 - 2 * (x * x + y * y)
  }
  /** local (caisse) → monde (direction) */
  toWorld(lx: number, ly: number, lz: number, out: number[]) {
    const R = this.R
    out[0] = R[0] * lx + R[3] * ly + R[6] * lz; out[1] = R[1] * lx + R[4] * ly + R[7] * lz; out[2] = R[2] * lx + R[5] * ly + R[8] * lz
    return out
  }
  forwardSpeed(): number { return -(this.vel[0] * this.R[6] + this.vel[1] * this.R[7] + this.vel[2] * this.R[8]) }
  ratio(): number { return this.gear === -1 ? -REVERSE_RATIO : this.gear >= 1 ? GEAR_RATIOS[this.gear - 1] : 0 }

  step(dt: number, ctl: Controls) {
    this.time += dt
    const S = this.setup, R = this.R
    this.updateR()
    this.mass = W11.massMin + this.fuel
    const m = this.mass
    const F = [0, 0, 0], Tq = [0, 0, 0] // force et couple (monde)
    const wW = this.toWorld(this.wb[0], this.wb[1], this.wb[2], [0, 0, 0]) // ω monde
    const up = [R[3], R[4], R[5]]
    const vF = this.forwardSpeed()
    const speed = Math.hypot(this.vel[0], this.vel[1], this.vel[2])
    this.speed = speed

    // ---- position sur la piste
    const cs = this.surface.sample(this.pos[0], this.pos[2], this.hint, tmp)
    this.hint = cs.i; this.s = cs.s; this.d = cs.d; this.trackIdx = cs.i

    // ---- commandes, aides
    const Dq = this.damageMode === 'real' ? this.damage : Vehicle.NO_DMG
    let steerCmd = Math.max(-1, Math.min(1, ctl.steer + (Dq.suspension[0] - Dq.suspension[1]) * 0.12))
    const vRef = S.steerAssist >= 2 ? 26 : S.steerAssist >= 1 ? 34 : 1e9
    const lock = W11.steerLock * Math.max(0.11, 1 / (1 + (vF * vF) / (vRef * vRef)))
    // DAS : tiré → pincement AV ≈ 0
    this.dasPulled = !!ctl.das
    this.dasPos += ((this.dasPulled ? 1 : 0) - this.dasPos) * Math.min(1, dt * 14)
    const toeF = W11.toeF * (1 - this.dasPos)

    // DRS : zones + fermeture au freinage
    if (!this.drsAvailable || ctl.brake > 0.08) this.drsOpen = false
    else if (ctl.drs) this.drsOpen = true
    this.drsPos += ((this.drsOpen ? 1 : 0) - this.drsPos) * Math.min(1, dt * 9)

    // ---- boîte
    this.shiftEvent = 0
    if (this.shiftTimer > 0) this.shiftTimer -= dt
    const rearOmega = (this.wheels[2].omega + this.wheels[3].omega) / 2
    const rpmAt = (g: number) => Math.max(Math.abs(rearOmega), Math.abs(vF) / W11.wheelRadiusR) * ( (g === -1 ? REVERSE_RATIO : GEAR_RATIOS[g - 1])) * 60 / (2 * Math.PI)
    let throttle = Math.max(0, Math.min(1, ctl.throttle)), brake = Math.max(0, Math.min(1, ctl.brake))
    // marche arrière automatique : frein maintenu à l'arrêt
    if (S.autoGear) {
      if (!ctl.noReverse && this.gear >= 1 && Math.abs(vF) < 0.4 && brake > 0.5 && throttle < 0.05) { this.reverseHold += dt; if (this.reverseHold > 0.7) { this.gear = -1; this.reverseHold = 0 } }
      else if (this.gear !== -1) this.reverseHold = 0
      if (this.gear === -1) {
        if (throttle > 0.1 && vF > -0.5) { this.gear = 1 }
        else { const b = brake; brake = vF < -0.3 && throttle > 0.05 ? throttle : 0; throttle = b }
      }
    }
    if (this.gear >= 1 && this.shiftTimer <= 0) {
      let want = 0
      if (S.autoGear) {
        if (this.gear < 8 && this.rpm > W11.upshiftRpm && !this.clutchSlip) want = 1
        else if (this.gear > 1) {
          const lower = rpmAt(this.gear - 1)
          const thr = brake > 0.2 ? 11800 : W11.downshiftRpm
          if (this.rpm < thr && lower < 12600) want = -1
        }
      }
      if (ctl.shiftUp) want = 1
      if (ctl.shiftDown) want = -1
      if (want === 1 && this.gear < 8) { this.gear++; this.shiftTimer = W11.shiftCut; this.shiftEvent = 1; this.lastShiftDir = 1 }
      else if (want === -1 && this.gear > 1 && rpmAt(this.gear - 1) < 14800) { this.gear--; this.shiftTimer = W11.downShiftTime; this.shiftEvent = -1; this.lastShiftDir = -1 }
    }

    // TC : coupe si patinage AR
    if (S.tc > 0) {
      // patinage combiné (long. + lat.) des roues AR motrices
      let rho = 0
      for (const w of [this.wheels[2], this.wheels[3]]) if (w.kappa > 0) rho = Math.max(rho, Math.hypot(w.kappa / W11.tyre.kPeak, w.alpha / W11.tyre.aPeak * 0.7))
      const lim = S.tc >= 2 ? 0.95 : 1.12
      if (rho > lim && vF > 1) this.tcCut = Math.min(0.9, this.tcCut + dt * 40 * (rho / lim - 1))
      else this.tcCut = Math.max(0, this.tcCut - dt * 4)
      throttle *= 1 - this.tcCut
    } else this.tcCut = 0
    // limiteur des stands : régulation douce de l'accélérateur à 80 km/h (bouton PIT du volant)
    this.pitLim = !!ctl.pitLim
    if (this.pitLim) {
      const over = vF - (80 / 3.6 - 0.4)
      this.pitLimCut = Math.max(0, Math.min(1, this.pitLimCut + (over > 0 ? dt * 8 * over : -dt * 3)))
      throttle = Math.min(throttle, Math.max(0, 1 - this.pitLimCut - Math.max(0, over) * 0.6))
    } else this.pitLimCut = 0
    this.throttleApplied = throttle; this.brakeApplied = brake

    // ---- moteur / ERS
    const ratio = this.ratio()
    const wheelRpm = Math.abs(rearOmega * ratio * 60 / (2 * Math.PI))
    const clutchRpm = 4500 + 6500 * throttle
    this.clutchSlip = this.gear !== 0 && wheelRpm < clutchRpm && Math.abs(this.gear) <= 2 && throttle > 0.02
    let rpm = this.clutchSlip ? clutchRpm : Math.max(wheelRpm, W11.rpmIdle)
    this.limiter = rpm > W11.rpmMax
    const shifting = this.shiftTimer > 0
    const omegaE = Math.max(100, rpm * 2 * Math.PI / 60)
    let tCrank: number
    if (throttle > 0.01) {
      let p = icePower(rpm, throttle, S.engineMode)
      // densité de l'air : le turbo compense en partie (E : P ∝ (ρ/ρ0)^0,3) ; surchauffe huile/eau → cartographie de protection
      if (this.env) p *= Math.pow(this.env.rho / W11.rho, 0.3)
      p *= 1 - 0.12 * this.heatDerate
      // carburant : débit ∝ puissance (rendement ≈ 50 %), plafonné à 100 kg/h (P : règlement 2020)
      this.fuel = Math.max(0, this.fuel - Math.min(p / (W11.fuelLHV * 0.5), 100 / 3600) * dt)
      p += this.ers.deploy(throttle, rpm, vF, dt)
      tCrank = p / omegaE
    } else { this.ers.deploy(0, rpm, vF, dt); tCrank = engineBrakeTorque(rpm) }
    if (this.limiter) tCrank = Math.min(tCrank, 0)
    if (shifting) tCrank *= this.lastShiftDir > 0 ? 0.35 : 0.2
    if (this.clutchSlip && rpm < 5000 && throttle < 0.05) tCrank = 0
    // embrayage ouvert sous le régime de ralenti sans gaz (anti-calage) : pas de frein moteur à l'arrêt (sinon la voiture recule)
    if (throttle <= 0.02 && wheelRpm < W11.rpmIdle * 1.15) tCrank = 0
    // contrôle de glissement AR du brake-by-wire : frein moteur + récupération limités si l'AR bloque
    const krMin = Math.min(this.wheels[2].kappa, this.wheels[3].kappa)
    if (krMin < -W11.tyre.kPeak * 1.15 && vF > 3) this.ebCut = Math.min(1, this.ebCut + dt * 12)
    else this.ebCut = Math.max(0, this.ebCut - dt * 2.5)
    if (tCrank < 0) tCrank *= 1 - this.ebCut
    const tAxle = this.gear === 0 ? 0 : tCrank * ratio * W11.driveEff
    this.rpm = rpm
    this.rpmVis += (rpm - this.rpmVis) * Math.min(1, dt * 30)

    // ---- freins (+ brake-by-wire AR avec récupération MGU-K)
    const bFade = (T: number) => T < W11.brakeOptLo ? 0.72 + 0.28 * Math.max(0, T - 100) / (W11.brakeOptLo - 100) : T > 1100 ? Math.max(0.55, 1 - (T - 1100) / 600) : 1
    const fl = this.wheels[0], fr = this.wheels[1], rl = this.wheels[2], rr = this.wheels[3]
    const tTot = brake * (W11.brakeTorqueF * 2 + W11.brakeTorqueR * 2)
    let tFront = tTot * S.brakeBias / 2, tRear = tTot * (1 - S.brakeBias) / 2
    tFront = Math.min(tFront, W11.brakeTorqueF * 1.25); tRear = Math.min(tRear, W11.brakeTorqueR * 1.4)
    let regen = 0
    if (brake > 0.02 && vF > 5) {
      const want = tRear * 2 * Math.abs(rearOmega)
      const p = this.ers.harvest(Math.min(want, W11.mgukPower), dt)
      regen = p / Math.max(5, Math.abs(rearOmega)) / 2
    } else if (throttle < 0.01 && vF > 20) {
      const p = this.ers.harvest(this.ers.mode === 'charge' ? 60_000 : 25_000, dt)
      regen = p / Math.max(5, Math.abs(rearOmega)) / 2
    }
    regen *= 1 - this.ebCut * 0.8
    // le BBW retranche le frein moteur du couple AR demandé (répartition conservée)
    const ebWheel = tAxle < 0 ? -tAxle / 2 : 0
    tRear = Math.max(0, tRear - ebWheel)
    fl.brakeTq = tFront * bFade(fl.brakeT) * fl.absF; fr.brakeTq = tFront * bFade(fr.brakeT) * fr.absF
    const rearFric = Math.max(0, tRear - regen)
    rl.brakeTq = rearFric * bFade(rl.brakeT) * rl.absF + regen; rr.brakeTq = rearFric * bFade(rr.brakeT) * rr.absF + regen

    // ---- aéro
    if (this.env) { this.wind = this.env.wind; this.airT = this.env.airT; this.trackT = this.env.trackT }
    const vair = [this.vel[0] - this.wind[0], this.vel[1] - this.wind[1], this.vel[2] - this.wind[2]]
    const va = Math.hypot(vair[0], vair[1], vair[2])
    const rho = this.env ? this.env.rho : W11.rho
    const qd = 0.5 * rho * va * va
    const cFront = (fl.c + fr.c) / 2, cRear = (rl.c + rr.c) / 2
    // sensibilité hauteur de caisse (E) : plus bas → plus d'appui jusqu'au contact du plancher
    const S0 = this.setup, hF = W11.rideF + (S0.rideF ?? 0) / 1000 - cFront, hR = W11.rideR + (S0.rideR ?? 0) / 1000 - cRear
    let rh = Math.max(0.75, Math.min(1.12, 1 + 1.6 * (0.03 - hF) * 0.5 + 0.8 * (0.075 - hR) * 0.5)) * (this.scrape > 0 ? 0.92 : 1)
    // effet de sol : sous ~8 mm à l'AV le flux sous le fond décroche (E) → perte brutale jusqu'à 15 %
    // (seulement sur sol dur : dans le gravier la voiture s'enfonce, la hauteur mesurée n'a plus de sens aéro)
    if (this.wheels[0].type <= 3 && this.wheels[1].type <= 3) rh *= 1 - 0.15 * Math.max(0, Math.min(1, (0.008 - hF) / 0.008))
    // garage : hauteur de caisse réglée (E : ≈ 0,5 % d'appui par mm, la plate-forme basse travaille mieux ; le butoir 1,12 ci-dessus sature à haute vitesse)
    rh *= 1 - 0.005 * Math.max(-4, Math.min(10, 0.5 * (S0.rideF ?? 0) + 0.5 * (S0.rideR ?? 0)))
    // aileron AR aéroélastique : il fléchit avec la pression dynamique → moins de traînée (et un peu moins d'appui) à haute vitesse (E)
    const flex = Math.max(0, Math.min(1, (va - 55) / 30)); const flexS = flex * flex * (3 - 2 * flex)
    // aspiration / air sale derrière une voiture (E : −30 % de traînée à 1 longueur, appui −20 % à 10 m, sur ±1,5 m latéraux)
    let tow = 0, dirty = 0
    if (this.lead && this.lead.gap > 0) { const lat = Math.exp(-((this.lead.lat / 1.5) ** 2)); tow = 0.3 * Math.exp(-this.lead.gap / 30) * lat; dirty = 0.2 * Math.exp(-this.lead.gap / 18) * lat }
    // dégâts : aileron AV → appui AV perdu (sous-virage), aileron AR → appui AR perdu, fond → appui global ; traînée en hausse
    const Dm = this.damageMode === 'real' ? this.damage : Vehicle.NO_DMG
    const epL = Dm.endplate[0], epR = Dm.endplate[1], bgL = Dm.barge[0], bgR = Dm.barge[1]
    // ailerons (E) : ±1 cran ≈ ±1,1 % d'appui ; l'AR coûte plus de traînée (Spa : réglage bas pour Kemmel)
    const wF = (S0.wingF ?? 5) - 5, wR = (S0.wingR ?? 5) - 5, wingCl = 1 + 0.009 * wF + 0.013 * wR, wingCd = 1 + 0.004 * wF + 0.014 * wR
    const ClA = (W11.ClA + W11.drsClA * this.drsPos) * wingCl * rh * (1 - 0.22 * Dm.frontWing - 0.3 * Dm.rearWing - 0.3 * Dm.floor - 0.05 * (epL + epR) - 0.04 * (bgL + bgR)) * (1 - 0.015 * flexS) * (1 - dirty)
    const CdA = (W11.CdA + W11.drsCdA * this.drsPos) * wingCd * (1 + 0.06 * Dm.frontWing + 0.08 * Dm.rearWing + 0.015 * (epL + epR + bgL + bgR)) * (1 - 0.025 * flexS) * (1 - tow)
    const bal = W11.aeroBalF + 0.006 * (wF - wR) + 0.5 * (cFront - cRear) - 0.06 * this.drsPos - 0.1 * Dm.frontWing + 0.08 * Dm.rearWing - 0.03 * (epL + epR) - 0.08 * dirty
    const down = qd * ClA, drag = qd * CdA
    this.downforce = down; this.drag = drag
    if (va > 0.1) { for (let k = 0; k < 3; k++) F[k] -= vair[k] / va * drag }
    const dF = down * bal, dR = down * (1 - bal)
    const addForceAt = (fx: number, fy: number, fz: number, px: number, py: number, pz: number) => {
      F[0] += fx; F[1] += fy; F[2] += fz
      const rx = px - this.pos[0], ry = py - this.pos[1], rz = pz - this.pos[2]
      Tq[0] += ry * fz - rz * fy; Tq[1] += rz * fx - rx * fz; Tq[2] += rx * fy - ry * fx
    }
    const pa = [0, 0, 0]
    // appui AV réparti G/D : une dérive cassée déséquilibre l'avant (la voiture tire du côté intact)
    const aF = Math.max(-0.2, Math.min(0.2, 0.12 * (epR - epL)))
    this.toWorld(fl.hub[0] * 0.6, 0, fl.hub[2], pa); addForceAt(-up[0] * dF * (0.5 + aF), -up[1] * dF * (0.5 + aF), -up[2] * dF * (0.5 + aF), this.pos[0] + pa[0], this.pos[1] + pa[1], this.pos[2] + pa[2])
    this.toWorld(fr.hub[0] * 0.6, 0, fr.hub[2], pa); addForceAt(-up[0] * dF * (0.5 - aF), -up[1] * dF * (0.5 - aF), -up[2] * dF * (0.5 - aF), this.pos[0] + pa[0], this.pos[1] + pa[1], this.pos[2] + pa[2])
    // vent de travers : force latérale au centre de poussée (0,35 m derrière le CG, E : CyA ≈ 1,6 m²)
    { const right = [R[0], R[1], R[2]], vl = vair[0] * right[0] + vair[1] * right[1] + vair[2] * right[2], fy = -0.5 * rho * 1.6 * vl * Math.abs(vl)
      this.toWorld(0, 0, 0.35, pa); addForceAt(right[0] * fy, right[1] * fy, right[2] * fy, this.pos[0] + pa[0], this.pos[1] + pa[1], this.pos[2] + pa[2]) }
    this.toWorld(0, 0, rl.hub[2], pa); addForceAt(-up[0] * dR, -up[1] * dR, -up[2] * dR, this.pos[0] + pa[0], this.pos[1] + pa[1], this.pos[2] + pa[2])

    // ---- suspensions
    const hw = [0, 0, 0]
    for (const w of this.wheels) {
      this.toWorld(w.hub[0], w.hub[1], w.hub[2], hw)
      const hx = this.pos[0] + hw[0], hy = this.pos[1] + hw[1], hz = this.pos[2] + hw[2]
      const smp = this.surface.sample(hx, hz, this.hint, w.sample)
      w.type = smp.type
      const sf = SURFACE[smp.type] ?? SURFACE[1]
      let gh = smp.h
      // gravier : la roue s'enfonce progressivement (jusqu’à 4 cm) → garde au sol réduite, le fond racle, freinage fort
      w.sink = smp.type === 5 ? Math.min(0.04, (w.sink ?? 0) + dt * 0.1) : Math.max(0, (w.sink ?? 0) - dt * 0.4)
      gh -= w.sink
      if (sf.bump > 0) {
        const s = smp.s, d = smp.d
        gh += smp.type === 2 ? sf.bump * Math.max(0, Math.sin(s * 10.5 + d * 0.5)) : sf.bump * (Math.sin(s * 3.1 + d * 2.3) * Math.sin(s * 1.7 - d * 4.1))
      }
      // marche verticale (mur, trottoir haut) : ce n'est pas un appui pour le pneu → traité par les collisions
      if (gh - (hy - w.r) > 0.11 && w.contact) gh = w.groundH
      w.groundH = gh
      const uy = Math.max(0.2, up[1])
      const wi = this.wheels.indexOf(w)
      if (Dq.wheelOff[wi]) { w.contact = false; w.c = -W11.droop; w.fz = 0; w.cdot = 0; w.px = hx; w.py = hy - w.r; w.pz = hz; continue }
      const rEff = w.r - 0.045 * w.tyre.puncture // pneu crevé : la jante descend vers le sol
      let c = (gh + rEff / Math.max(0.5, smp.ny) - hy) / uy
      // anti-catapulte : une marche brutale (talus, bordure haute, retombée) est absorbée par le flanc du pneu et
      // la structure au lieu d'être vue instantanément par la butée (2,2 MN/m) → plus de voiture « lancée en l'air »
      if (w.contact && c - w.c > 0.02) c = w.c + 0.02
      w.cPrev = w.c
      const k = w.front ? W11.springF : W11.springR, dmp = w.front ? W11.dampF : W11.dampR
      const Wst = this.mass * G * (w.front ? W11.frontMassMin : 1 - W11.frontMassMin) / 2
      if (c < -W11.droop) { w.contact = false; w.c = -W11.droop; w.fz = 0; w.cdot = 0 }
      else {
        w.contact = true; w.c = c
        w.cdot = (c - w.cPrev) / dt
        let f = Wst + k * c + dmp * (w.cdot > 0 ? w.cdot : w.cdot * 0.75)
        if (c > W11.bumpTravel) f += W11.bumpK * (c - W11.bumpTravel) + dmp * 2 * Math.max(0, w.cdot)
        w.fz = Math.max(0, Math.min(f, 26_000)) // plafond ≈ 3,5 g de charge par roue (charge réelle max ≈ 12–15 kN)
      }
      w.px = hx + up[0] * w.c - smp.nx * rEff; w.py = hy + up[1] * w.c - smp.ny * rEff; w.pz = hz + up[2] * w.c - smp.nz * rEff
    }
    // barres antiroulis
    for (const [a, b, karb] of [[fl, fr, W11.arbF], [rl, rr, W11.arbR]] as [Wheel, Wheel, number][]) {
      if (a.contact && b.contact) { const df = karb * (a.c - b.c); a.fz = Math.max(0, a.fz + df); b.fz = Math.max(0, b.fz - df) }
    }

    // ---- direction (volant → roues), pincement, Ackermann léger
    const steerAng = steerCmd * lock
    // toe-out : roue G tournée vers la gauche (négatif), D vers la droite (positif) → toeF<0 donc signes ci-dessus
    fl.steer = steerAng * (steerAng < 0 ? 1.04 : 0.96) + toeF
    fr.steer = steerAng * (steerAng > 0 ? 1.04 : 0.96) - toeF
    rl.steer = W11.toeR; rr.steer = -W11.toeR // pincement AR fermé

    // ---- pneus + rotation des roues
    const driveEach = tAxle / 2
    // inertie moteur/transmission ramenée aux roues AR (×rapport²) quand l'embrayage est fermé : freine les reprises en bas rapports, sans effet en vitesse stabilisée
    const Ieng = this.gear !== 0 && !this.clutchSlip ? 0.5 * W11.engineInertia * ratio * ratio : 0
    rl.I = W11.wheelInertiaR + Ieng; rr.I = W11.wheelInertiaR + Ieng
    rl.driveTq = driveEach; rr.driveTq = driveEach; fl.driveTq = 0; fr.driveTq = 0
    const fw = [0, 0, 0], rw = [0, 0, 0]
    const TY = W11.tyre
    let latHold = Math.max(0, 1 - speed / 3)
    for (const w of this.wheels) {
      if (!w.contact || w.fz <= 0) {
        // roue en l'air : rotation libre
        w.omega += (w.driveTq - Math.sign(w.omega) * Math.min(Math.abs(w.omega) * w.I / dt, w.brakeTq * 0.5)) / w.I * dt
        w.fx = 0; w.fy = 0; w.slipVel = 0; continue
      }
      const n = [w.sample.nx, w.sample.ny, w.sample.nz]
      const sn = Math.sin(w.steer), csn = Math.cos(w.steer)
      this.toWorld(sn, 0, -csn, fw)
      const fdn = fw[0] * n[0] + fw[1] * n[1] + fw[2] * n[2]
      fw[0] -= n[0] * fdn; fw[1] -= n[1] * fdn; fw[2] -= n[2] * fdn
      const fl2 = Math.hypot(fw[0], fw[1], fw[2]) || 1; fw[0] /= fl2; fw[1] /= fl2; fw[2] /= fl2
      rw[0] = fw[1] * n[2] - fw[2] * n[1]; rw[1] = fw[2] * n[0] - fw[0] * n[2]; rw[2] = fw[0] * n[1] - fw[1] * n[0]
      const rx = w.px - this.pos[0], ry = w.py - this.pos[1], rz = w.pz - this.pos[2]
      const vcx = this.vel[0] + wW[1] * rz - wW[2] * ry, vcy = this.vel[1] + wW[2] * rx - wW[0] * rz, vcz = this.vel[2] + wW[0] * ry - wW[1] * rx
      const vx = vcx * fw[0] + vcy * fw[1] + vcz * fw[2]
      const vy = vcx * rw[0] + vcy * rw[1] + vcz * rw[2]
      const sf = SURFACE[w.type] ?? SURFACE[1]
      let mu = muPeak(w.fz, w.tyre, S.compound, w.front) * sf.mu
      let wet = 0
      if (this.env) {
        const g = this.env.grip(w.sample.s, w.sample.d, Math.abs(vx), w.tyre.kind, w.front ? W11.tyreWidthF : W11.tyreWidthR, gs)
        // herbe / gravier : l'eau aggrave l'adhérence déjà faible ; la gomme et les marbles ne concernent que la piste
        mu *= w.type <= 3 ? g.mu : Math.max(0.55, 1 - 0.6 * Math.min(1, g.water))
        wet = g.water
        if (w.front) { this.aqua = Math.max(this.aqua * 0.98, g.aqua); this.wetGrip = g.mu }
        if (g.marbles > 0.2 && Math.abs(vx) > 5) w.tyre.pickup = Math.min(1, w.tyre.pickup + g.marbles * 0.12 * dt)
      }
      if (w.type === 4 || w.type === 5) { w.tyre.dirt = Math.min(1, w.tyre.dirt + dt * 0.35 * Math.min(1, Math.abs(vx) / 15)); this.wasOff[this.wheels.indexOf(w)] = true }
      else if (this.wasOff[this.wheels.indexOf(w)]) { this.wasOff[this.wheels.indexOf(w)] = false; if (this.env && Math.abs(vx) > 8) this.env.dropDirt(w.sample.s, w.sample.d, 0.5) }
      const fzE = Math.min(w.fz, 14000)
      const Dmax = mu * fzE
      // dérive avec longueur de relaxation
      const aRaw = Math.atan2(vy, Math.max(Math.abs(vx), 2.5))
      w.alpha += (aRaw - w.alpha) * Math.min(1, dt * Math.max(Math.abs(vx), 3) / TY.relax)
      const v0 = Math.max(Math.abs(vx), 3)
      const force = (om: number) => {
        const kap = (om * w.r - vx) / v0
        const sx = kap / TY.kPeak, sy = Math.tan(w.alpha) / TY.aPeak
        const s = Math.hypot(sx, sy)
        if (s < 1e-9) return [0, 0, kap]
        const mag = Dmax * mf(s)
        return [mag * sx / s * TY.muX, -mag * sy / s, kap]
      }
      // rotation implicite (2 sous-pas)
      const sub = 2, h = dt / sub
      let fxy = force(w.omega)
      for (let k = 0; k < sub; k++) {
        const eps = 0.05
        const f1 = force(w.omega + eps)
        const dFdw = Math.max(0, (f1[0] - fxy[0]) / eps)
        let om = w.omega + h / w.I * (w.driveTq - w.r * fxy[0]) / (1 + h / w.I * w.r * dFdw)
        // frein : frottement sec (peut bloquer la roue)
        const dB = w.brakeTq * h / w.I
        if (Math.abs(om) <= dB) om = 0; else om -= Math.sign(om) * dB
        // ABS
        w.omega = om
        fxy = force(w.omega)
      }
      // différentiel traité après la boucle
      w.kappa = fxy[2]
      let Fx = fxy[0], Fy = fxy[1]
      // résistance au roulement
      // résistance au roulement : gravier et herbe croissent avec la vitesse (labourage du lit de gravier ≈ 0,6–1 g à 200 km/h)
      const rrv = w.type === 5 ? sf.rr * (1 + Math.abs(vx) / 35) + (w.sink ?? 0) * 4 : w.type === 4 ? sf.rr * (1 + Math.abs(vx) / 60) : sf.rr
      Fx -= Math.sign(vx) * Math.min(Math.abs(vx) * 50, rrv * w.fz)
      // maintien basse vitesse (évite la dérive à l'arrêt, stable car < 1/2 de l'annulation par pas)
      if (latHold > 0) {
        const mq = this.mass / 4
        Fy += -vy * mq / dt * 0.45 * latHold
        if (brake > 0.1 || Math.abs(w.omega) < 0.05) Fx += -vx * mq / dt * 0.45 * latHold
        const lim = Dmax * 1.05, mg = Math.hypot(Fx, Fy)
        if (mg > lim) { Fx *= lim / mg; Fy *= lim / mg }
      }
      w.fx = Fx; w.fy = Fy
      w.slipVel = Math.hypot(w.omega * w.r - vx, vy)
      // ABS : relâche si blocage
      if (S.abs && brake > 0.05 && w.kappa < -TY.kPeak * 1.15 && vx > 4) w.absF = Math.max(0.35, w.absF - dt * 18)
      else w.absF = Math.min(1, w.absF + dt * 8)
      // forces au contact
      const fxw = fw[0] * Fx + rw[0] * Fy + n[0] * w.fz
      const fyw = fw[1] * Fx + rw[1] * Fy + n[1] * w.fz
      const fzw = fw[2] * Fx + rw[2] * Fy + n[2] * w.fz
      addForceAt(fxw, fyw, fzw, w.px, w.py, w.pz)
      // thermique pneus & freins
      const slipP = Math.abs(Fx * (w.omega * w.r - vx)) + Math.abs(Fy * vy)
      const locked = brake > 0.2 && Math.abs(w.omega) < 0.5 && Math.abs(vx) > 8
      tyreThermal(w.tyre, slipP, speed, this.airT, this.trackT, dt, S.compound, w.front, w.fz * Math.abs(vx) * 0.002, (w.left ? -1 : 1) * Fy, w.front ? -0.06 : -0.035, locked, wet)
      if (this.env) this.env.pass(w.sample.s, w.sample.d, slipP, Math.abs(vx), dt, w.tyre.wear)
      // crevaison en cours : la pression chute en ~4 s
      if (w.tyre.puncture > 0 && w.tyre.puncture < 1) w.tyre.puncture = Math.min(1, w.tyre.puncture + dt * 0.25)
    }
    // différentiel autobloquant (embrayages + précharge) — couplage implicite des roues AR
    {
      const lockF = throttle > 0.05 ? S.diffOn : S.diffOff
      const tMax = 120 + lockF * Math.abs(tAxle) * 0.9 + (throttle <= 0.05 ? lockF * 900 : 0)
      const dw = rl.omega - rr.omega
      const Ieq = rl.I * rr.I / (rl.I + rr.I)
      let J = dw * Ieq
      const Jm = tMax * dt
      J = Math.max(-Jm, Math.min(Jm, J))
      rl.omega -= J / rl.I; rr.omega += J / rr.I
    }
    for (const w of this.wheels) {
      w.angle += w.omega * dt
      const pB = w.brakeTq * Math.abs(w.omega) * (w.front ? 1 : 0.6)
      // disques carbone : refroidis par l'air (×1,6 sous la pluie, E), oxydation au-delà de 1000 °C (usure)
      w.brakeT += (pB - W11.brakeCool * (0.3 + speed / 15) * (1 + 0.6 * Math.min(1, this.env?.wetness ?? 0)) * (w.brakeT - this.airT)) * dt / W11.brakeHeatCap
    }

    // ---- contact plancher / patin (étincelles)
    this.scrape = 0
    const plank: [number, number, number][] = [[0, 0.012 - this.cg[1] + 0.022, -1.25 - this.cg[2]], [0, 0.012 - this.cg[1] + 0.045, 0.2 - this.cg[2]], [0, 0.012 - this.cg[1] + 0.07, 1.5 - this.cg[2]], [-0.6, 0.06 - this.cg[1], -0.2 - this.cg[2]], [0.6, 0.06 - this.cg[1], -0.2 - this.cg[2]]]
    for (let i = 0; i < 4; i++) if (Dq.wheelOff[i]) { const w = this.wheels[i]; plank.push([w.hub[0] * 0.85, 0.03 - this.cg[1], w.hub[2]]) }
    for (const p of plank) {
      this.toWorld(p[0], p[1], p[2], pa)
      const px = this.pos[0] + pa[0], py = this.pos[1] + pa[1], pz = this.pos[2] + pa[2]
      const smp = this.surface.sample(px, pz, this.hint, tmp)
      const pen = smp.h - py
      if (pen > 0) {
        const rx = px - this.pos[0], ry = py - this.pos[1], rz = pz - this.pos[2]
        const vpx = this.vel[0] + wW[1] * rz - wW[2] * ry, vpy = this.vel[1] + wW[2] * rx - wW[0] * rz, vpz = this.vel[2] + wW[0] * ry - wW[1] * rx
        const vn = vpx * smp.nx + vpy * smp.ny + vpz * smp.nz
        // plancher : appui raide mais borné (≤ 4 g), sans rebond ; la pénétration est corrigée en position
        const fn = Math.max(0, Math.min(3_000_000 * pen - 40_000 * vn, this.mass * G * 4))
        if (pen > 0.02) this.pos[1] += (pen - 0.02) * 0.5
        const tx = vpx - smp.nx * vn, ty = vpy - smp.ny * vn, tz = vpz - smp.nz * vn, tl = Math.hypot(tx, ty, tz) || 1
        const ff = Math.min(0.45 * fn, this.mass * tl / dt * 0.2)
        addForceAt(smp.nx * fn - tx / tl * ff, smp.ny * fn - ty / tl * ff, smp.nz * fn - tz / tl * ff, px, py, pz)
        if (tl > 3) { this.scrape = Math.max(this.scrape, Math.min(1, fn / 8000)); this.scrapePos = [px, py, pz] }
        // usure du patin (bois/composite + patins titane) : ∝ effort normal × glissement (E : ~0,3 mm/tour sur un fond très bas)
        this.plankWear += fn * tl * dt * 4e-9
      }
    }

    // ---- intégration
    const ax = F[0] / m, ay = F[1] / m - G, az = F[2] / m
    this.vel[0] += ax * dt; this.vel[1] += ay * dt; this.vel[2] += az * dt
    // aide stabilité (amortissement lacet virtuel, aide de jeu, réglable/désactivable)
    const tb = [R[0] * Tq[0] + R[1] * Tq[1] + R[2] * Tq[2], R[3] * Tq[0] + R[4] * Tq[1] + R[5] * Tq[2], R[6] * Tq[0] + R[7] * Tq[1] + R[8] * Tq[2]]
    const I = [W11.inertia.pitch, W11.inertia.yaw, W11.inertia.roll]
    if (S.stability > 0 && vF > 8) {
      const yawRef = -vF * Math.tan(steerAng) / W11.wheelbase
      // n'agit qu'en survirage (lacet supérieur au lacet cinématique ou opposé au braquage)
      const over = Math.abs(this.wb[1]) > Math.abs(yawRef) * 1.08 || this.wb[1] * yawRef < 0
      if (over) tb[1] += -(this.wb[1] - yawRef) * I[1] * 2.2 * S.stability
    }
    const w0 = this.wb
    const Lx = I[0] * w0[0], Ly = I[1] * w0[1], Lz = I[2] * w0[2]
    const gx = w0[1] * Lz - w0[2] * Ly, gy = w0[2] * Lx - w0[0] * Lz, gz = w0[0] * Ly - w0[1] * Lx
    w0[0] += (tb[0] - gx) / I[0] * dt; w0[1] += (tb[1] - gy) / I[1] * dt; w0[2] += (tb[2] - gz) / I[2] * dt
    this.pos[0] += this.vel[0] * dt; this.pos[1] += this.vel[1] * dt; this.pos[2] += this.vel[2] * dt
    // q ← q ⊗ (ω_b dt)
    {
      const [qx, qy, qz, qw] = this.q, hx = w0[0] * dt / 2, hy = w0[1] * dt / 2, hz = w0[2] * dt / 2
      const nx = qx + (qw * hx + qy * hz - qz * hy), ny = qy + (qw * hy + qz * hx - qx * hz), nz = qz + (qw * hz + qx * hy - qy * hx), nw = qw - (qx * hx + qy * hy + qz * hz)
      const nl = Math.hypot(nx, ny, nz, nw); this.q = [nx / nl, ny / nl, nz / nl, nw / nl]
    }
    this.updateR()
    if (this.barriers) this.collideBarriers(dt); else this.collideWalls(dt)
    // garde-fou anti-envol : vitesse verticale montante bornée par rapport à celle qu'impose la pente du sol (aucune voiture de F1 ne « décolle » de plus de quelques
    // dizaines de cm sur un vibreur ou un talus ; les grosses projections réelles viennent de contacts roue-roue)
    { const g = this.surface.sample(this.pos[0], this.pos[2], this.hint, tmp)
      const vyS = -(g.nx * this.vel[0] + g.nz * this.vel[2]) / Math.max(0.5, g.ny), ex = this.vel[1] - vyS
      if (ex > 3) this.vel[1] = vyS + 3 + (ex - 3) * 0.2 }

    // ---- télémétrie
    const dvx = (this.vel[0] - this.prevVel[0]) / dt, dvz = (this.vel[2] - this.prevVel[2]) / dt, dvy = (this.vel[1] - this.prevVel[1]) / dt
    const gl = -(dvx * this.R[6] + dvy * this.R[7] + dvz * this.R[8]) / G, gt = (dvx * this.R[0] + dvy * this.R[1] + dvz * this.R[2]) / G
    this.gLong += (gl - this.gLong) * Math.min(1, dt * 12); this.gLat += (gt - this.gLat) * Math.min(1, dt * 12)
    this.prevVel = [this.vel[0], this.vel[1], this.vel[2]]
    let out = 0
    for (const w of this.wheels) {
      const [eL, eR] = this.surface.edges(w.sample.i, w.sample.s)
      if (w.sample.d > eR + 0.05 || w.sample.d < -eL - 0.05) out++
    }
    this.wheelsOut = out; this.offTrack = out === 4
    this.flipped = this.R[4] < 0.25 ? this.flipped + dt : 0
    // températures huile / eau : chaleur ∝ puissance, refroidissement ∝ débit d'air dans les pontons (vitesse, aspiration = air chaud)
    { const pw = this.throttleApplied * (this.rpm / 12000), cool = (0.25 + speed / 40) * (1 - 0.35 * (this.lead ? Math.exp(-this.lead.gap / 20) : 0))
      this.waterT += (pw * 1.6 - cool * (this.waterT - this.airT - 55) * 0.03) * dt
      this.oilT += ((this.waterT + 12 - this.oilT) * 0.08) * dt
      this.heatDerate = Math.max(0, Math.min(1, (this.waterT - 125) / 10)) }
  }

  /** collisions contre les barrières réelles : 16 points du contour de la voiture (ailerons, roues, pontons), test
   *  balayé (pas de traversée à 340 km/h), normale = celle du segment touché, restitution / frottement / absorption selon
   *  le type (pneus, rail, béton, objet), impulsion avec inertie (lacet), sans couple de roulis parasite. Dégâts. */
  private collideBarriers(dt: number) {
    const B = this.barriers!
    this.impact = Math.max(0, this.impact - dt * 4); this.hitKind = 0; this.damageEvent = 0
    const I = [W11.inertia.pitch, W11.inertia.yaw, W11.inertia.roll], R = this.R
    const cg = this.cg, pa = [0, 0, 0], rc = 0.05
    const P = CAR_PTS
    for (let k = 0; k < P.length; k++) {
      const p = P[k]
      this.toWorld(p[0] - cg[0], 0.3 - cg[1], p[1] - cg[2], pa)
      let px = this.pos[0] + pa[0], pz = this.pos[2] + pa[2]
      const ox = this.bInit ? this.bPrev[k * 2] : px, oz = this.bInit ? this.bPrev[k * 2 + 1] : pz
      const [a, b] = B.cell(px, pz)
      let pen = 0, nx = 0, nz = 0, kind = 0
      for (let j = a; j < b; j++) {
        const si = B.idx[j] * 4, x1 = B.S[si], z1 = B.S[si + 1], x2 = B.S[si + 2], z2 = B.S[si + 3]
        const ex = x2 - x1, ez = z2 - z1, L2 = ex * ex + ez * ez || 1e-9
        let t = ((px - x1) * ex + (pz - z1) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t
        const qx = x1 + ex * t, qz = z1 + ez * t, dx = px - qx, dz = pz - qz, dist = Math.hypot(dx, dz)
        // balayé : la trajectoire du point depuis le pas précédent coupe-t-elle le segment ?
        const mx = px - ox, mz = pz - oz, den = mx * ez - mz * ex
        let crossed = false
        if (Math.abs(den) > 1e-9) { const u = ((x1 - ox) * ez - (z1 - oz) * ex) / den, v = ((x1 - ox) * mz - (z1 - oz) * mx) / den; crossed = u > 0 && u <= 1 && v >= 0 && v <= 1 }
        let pn = 0, cx = 0, cz = 0
        if (crossed) { const L = Math.sqrt(L2); cx = -ez / L; cz = ex / L; if ((ox - x1) * cx + (oz - z1) * cz < 0) { cx = -cx; cz = -cz } pn = dist + rc }
        else if (dist < rc) { if (dist > 1e-6) { cx = dx / dist; cz = dz / dist } else { const L = Math.sqrt(L2); cx = -ez / L; cz = ex / L } pn = rc - dist }
        if (pn > pen) { pen = pn; nx = cx; nz = cz; kind = B.K[B.idx[j]] }
      }
      if (pen > 0) {
        const kd = BARRIER_KIND[kind] ?? BARRIER_KIND[4]
        this.pos[0] += nx * pen; this.pos[2] += nz * pen; px += nx * pen; pz += nz * pen
        const wW = this.toWorld(this.wb[0], this.wb[1], this.wb[2], [0, 0, 0])
        const rx = pa[0], ry = 0, rz = pa[2]
        const vpx = this.vel[0] + wW[1] * rz - wW[2] * ry, vpz = this.vel[2] + wW[0] * ry - wW[1] * rx
        const vn = vpx * nx + vpz * nz
        if (vn < 0) {
          const rxn = [ry * nz, rz * nx - rx * nz, -ry * nx]
          const rb = [R[0] * rxn[0] + R[1] * rxn[1] + R[2] * rxn[2], R[3] * rxn[0] + R[4] * rxn[1] + R[5] * rxn[2], R[6] * rxn[0] + R[7] * rxn[1] + R[8] * rxn[2]]
          const ang = rb[0] * rb[0] / I[0] + rb[1] * rb[1] / I[1] + rb[2] * rb[2] / I[2]
          const j = -(1 + kd.e) * vn / (1 / this.mass + ang)
          const tvx = vpx - nx * vn, tvz = vpz - nz * vn, tl = Math.hypot(tvx, tvz) || 1
          const jt = Math.min(kd.mu * j, this.mass * tl * 0.5)
          const Jx = nx * j - tvx / tl * jt, Jz = nz * j - tvz / tl * jt
          this.vel[0] += Jx / this.mass; this.vel[2] += Jz / this.mass
          // absorption (pneus) : une partie de la vitesse tangentielle est dissipée en plus
          if (kd.absorb > 0) { const vnn = this.vel[0] * nx + this.vel[2] * nz, f = 0.5 + 0.5 * (1 - kd.absorb * Math.min(1, -vn / 20))
            this.vel[0] = nx * vnn + (this.vel[0] - nx * vnn) * f; this.vel[2] = nz * vnn + (this.vel[2] - nz * vnn) * f }
          const tqx = ry * Jz, tqy = rz * Jx - rx * Jz, tqz = -ry * Jx
          const tbx = R[0] * tqx + R[1] * tqy + R[2] * tqz, tby = R[3] * tqx + R[4] * tqy + R[5] * tqz, tbz = R[6] * tqx + R[7] * tqy + R[8] * tqz
          this.wb[0] += tbx / I[0] * 0.3; this.wb[1] += tby / I[1]; this.wb[2] += tbz / I[2] * 0.3
          // la vitesse verticale « de pente » (montée du Raidillon…) disparaît avec la vitesse horizontale arrêtée par le mur :
          // on la ramène à la valeur cohérente avec le sol, sinon la voiture continuerait de monter → envol irréaliste
          { const g = this.surface.sample(this.pos[0], this.pos[2], this.hint, tmp)
            if (this.pos[1] - g.h - this.cg[1] < 0.2) { const vyS = -(g.nx * this.vel[0] + g.nz * this.vel[2]) / Math.max(0.5, g.ny); if (this.vel[1] > vyS) this.vel[1] = vyS } }
          this.impact = Math.max(this.impact, Math.min(1, -vn / 15)); this.impactPos = [px, this.pos[1], pz]; this.hitKind = kind
          // dégâts : au-delà de ~3 m/s de vitesse normale, selon la zone touchée
          this.applyHit(-vn, p[2], pa)
        }
      }
      this.bPrev[k * 2] = px; this.bPrev[k * 2 + 1] = pz
    }
    this.bInit = true
    // bord de la grille physique (±44 m) : limite de sécurité là où aucune barrière n'existe
    const smp = this.surface.sample(this.pos[0], this.pos[2], this.hint, tmp)
    const lim = 44
    if (Math.abs(smp.d) > lim) { const c = this.surface.centre(smp.s), sg = smp.d > 0 ? -1 : 1, nx = -c.tz * sg, nz = c.tx * sg, pen = Math.abs(smp.d) - lim
      this.pos[0] += nx * pen; this.pos[2] += nz * pen; const vn = this.vel[0] * nx + this.vel[2] * nz; if (vn < 0) { this.vel[0] -= nx * vn * 1.2; this.vel[2] -= nz * vn * 1.2 } }
  }
  /** dégâts d'un choc (vitesse normale dv, m/s) sur une zone : 1 aileron AV, 2 aileron AR, 5/6 dérives, 7/8 déflecteurs,
   *  10..13 roues, autre = fond. Partagé par les barrières et les contacts entre voitures (lot 8 C). */
  applyHit(dv: number, part: number, pa: number[]) {
          if (dv > 3 && this.damageMode !== 'off') {
            const dmg = Math.min(1, (dv - 3) / 22), D = this.damage
            if (part === 1) D.frontWing = Math.min(1, D.frontWing + dmg)
            else if (part === 5 || part === 6) { const k = part - 5; D.endplate[k] = Math.min(1, D.endplate[k] + dmg * 1.4); D.frontWing = Math.min(1, D.frontWing + dmg * 0.5) }
            else if (part === 7 || part === 8) { const k = part - 7; D.barge[k] = Math.min(1, D.barge[k] + dmg * 1.2); D.floor = Math.min(1, D.floor + dmg * 0.3) }
            else if (part === 2) D.rearWing = Math.min(1, D.rearWing + dmg)
            else if (part >= 10) { const wi = part - 10, w = this.wheels[wi]; D.suspension[wi] = Math.min(1, D.suspension[wi] + dmg * 0.8)
              // crevaison : la jante/le flanc touche à plus de 5 m/s (E) ; roue arrachée si la suspension casse (choc > ~12 m/s)
              if (dv > 5 && this.damageMode === 'real' && w.tyre.puncture === 0 && Math.random() < 0.15 + dmg) w.tyre.puncture = 0.02
              if (D.suspension[wi] > 0.85 && dv > 11) D.wheelOff[wi] = true }
            else D.floor = Math.min(1, D.floor + dmg * 0.5)
            D.total = Math.min(1, Math.max(D.frontWing * 0.5, D.rearWing * 0.6, D.floor * 0.7, ...D.suspension, ...D.wheelOff.map(o => o ? 1 : 0)) + 0.15 * (D.frontWing + D.rearWing + D.floor) + 0.05 * (D.endplate[0] + D.endplate[1] + D.barge[0] + D.barge[1]))
            this.emitDebris(pa)
            this.damageEvent = Math.max(this.damageEvent, dmg)
          }
  }
  /** contact avec une autre voiture (lot 8 C) : impulsion dans le plan (n = normale monde vers cette voiture),
   *  dvn = vitesse relative de rapprochement (m/s), partage des masses 50/50 (voitures de même masse) */
  carHit(nx: number, nz: number, dvn: number, part: number, tang = 0) {
    if (dvn <= 0) return
    const j = dvn * 0.55
    this.vel[0] += nx * j - nz * tang; this.vel[2] += nz * j + nx * tang
    this.wb[1] += (Math.random() - 0.5) * dvn * 0.12
    this.impact = Math.max(this.impact, Math.min(1, dvn / 15)); this.impactPos = [this.pos[0] - nx, this.pos[1], this.pos[2] - nz]; this.hitKind = 5
    this.applyHit(dvn, part, [-nx, 0, -nz])
  }
  /** pièces qui se détachent (une seule fois chacune) → débris (pos/vitesse monde) pour le rendu et la piste */
  private emitDebris(pa: number[]) {
    const D = this.damage, v = this.vel
    const add = (part: string, cond: boolean, lx: number, lz: number) => {
      if (!cond || this.lost.has(part)) return; this.lost.add(part)
      const p = this.toWorld(lx - this.cg[0], 0.15 - this.cg[1], lz - this.cg[2], [0, 0, 0])
      this.debris.push({ part, pos: [this.pos[0] + p[0], this.pos[1] + p[1], this.pos[2] + p[2]], vel: [v[0] * 0.8 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, v[2] * 0.8 + (Math.random() - 0.5) * 6] })
    }
    void pa
    add('frontWing', D.frontWing > 0.7, 0, -2.6); add('endplateL', D.endplate[0] > 0.7, -0.95, -2.5); add('endplateR', D.endplate[1] > 0.7, 0.95, -2.5)
    add('rearWing', D.rearWing > 0.65, 0, 2.55); add('bargeL', D.barge[0] > 0.6, -0.82, -0.3); add('bargeR', D.barge[1] > 0.6, 0.82, -0.3)
    for (let i = 0; i < 4; i++) { const w = this.wheels[i]; add('wheel' + i, D.wheelOff[i], w.hub[0] + this.cg[0], w.hub[2] + this.cg[2]) }
  }
  /** réparation complète (stand / redémarrage) : pièces neuves */
  repair() { this.damage = newDamage(); this.lost.clear(); this.plankWear = 0 }
  /** état thermique, ERS et aides propre au début d'une démo/course redémarrée. */
  resetSessionState() {
    this.ers.soc = 4e6; this.ers.deployedLap = 0; this.ers.harvestedLap = 0; this.ers.hToK = 0
    this.ers.kPower = 0; this.ers.hPower = 0; this.ers.mode = 'hotlap'; this.ers.last = { deployed: 0, harvested: 0, hToK: 0 }
    this.shiftTimer = 0; this.clutchSlip = false; this.limiter = false; this.throttleApplied = 0; this.brakeApplied = 0; this.tcCut = 0
    this.drsOpen = false; this.drsPos = 0; this.dasPulled = false; this.dasPos = 0; this.drsAvailable = false
    this.reverseHold = 0; this.ebCut = 0; this.shiftEvent = 0; this.lastShiftDir = 0; this.time = 0
    this.mass = W11.massMin + this.fuel; this.oilT = 105; this.waterT = 95; this.heatDerate = 0
    for (const w of this.wheels) { w.brakeT = w.front ? 420 : 380; w.brakeTq = 0; w.driveTq = 0; w.absF = 1; w.angle = 0 }
    const ratio = this.gear === -1 ? REVERSE_RATIO : this.gear > 0 ? GEAR_RATIOS[this.gear - 1] : 0
    const wheelRate = Math.max(Math.abs((this.wheels[2].omega + this.wheels[3].omega) / 2), Math.abs(this.forwardSpeed()) / W11.wheelRadiusR)
    this.rpm = Math.max(4000, wheelRate * ratio * 60 / (2 * Math.PI)); this.rpmVis = this.rpm
  }
  private collideWalls(dt: number) {
    this.impact = Math.max(0, this.impact - dt * 4)
    const pts: [number, number, number][] = [[-0.98, 0.25, -2.55], [0.98, 0.25, -2.55], [-1.0, 0.3, 0.1], [1.0, 0.3, 0.1], [-0.55, 0.4, 2.55], [0.55, 0.4, 2.55], [-0.95, 0.3, 1.6], [0.95, 0.3, 1.6]]
    const pa = [0, 0, 0]
    const I = [W11.inertia.pitch, W11.inertia.yaw, W11.inertia.roll]
    for (const p of pts) {
      this.toWorld(p[0] - this.cg[0], p[1] - this.cg[1], p[2] - this.cg[2], pa)
      const px = this.pos[0] + pa[0], pz = this.pos[2] + pa[2]
      const smp = this.surface.sample(px, pz, this.hint, tmp)
      const [WL, WR] = this.surface.walls(smp.i, smp.s)
      let pen = 0, sgn = 0
      if (smp.d > WR - 0.05) { pen = smp.d - (WR - 0.05); sgn = -1 } else if (smp.d < -WL + 0.05) { pen = (-WL + 0.05) - smp.d; sgn = 1 }
      if (pen <= 0) continue
      const c = this.surface.centre(smp.s)
      const nx = -c.tz * sgn, nz = c.tx * sgn // normale horizontale vers le centre de la piste
      this.pos[0] += nx * pen * 0.9; this.pos[2] += nz * pen * 0.9
      const wW = this.toWorld(this.wb[0], this.wb[1], this.wb[2], [0, 0, 0])
      const rx = pa[0], ry = 0, rz = pa[2] // contact ramené à la hauteur du CdG : pas de couple de roulis/tangage parasite (évite les retournements)
      const vpx = this.vel[0] + wW[1] * rz - wW[2] * ry, vpz = this.vel[2] + wW[0] * ry - wW[1] * rx
      const vn = vpx * nx + vpz * nz
      if (vn >= 0) continue
      // impulsion (restitution 0,25, frottement 0,4) avec inertie
      const rxn = [ry * nz, rz * nx - rx * nz, -ry * nx] // r × n
      const R = this.R
      const rb = [R[0] * rxn[0] + R[1] * rxn[1] + R[2] * rxn[2], R[3] * rxn[0] + R[4] * rxn[1] + R[5] * rxn[2], R[6] * rxn[0] + R[7] * rxn[1] + R[8] * rxn[2]]
      const ang = rb[0] * rb[0] / I[0] + rb[1] * rb[1] / I[1] + rb[2] * rb[2] / I[2]
      const j = -(1.25) * vn / (1 / this.mass + ang)
      const tvx = vpx - nx * vn, tvz = vpz - nz * vn, tl = Math.hypot(tvx, tvz) || 1
      const jt = Math.min(0.4 * j, this.mass * tl * 0.5)
      const Jx = nx * j - tvx / tl * jt, Jz = nz * j - tvz / tl * jt
      this.vel[0] += Jx / this.mass; this.vel[2] += Jz / this.mass
      // ΔL = r × J
      const tqx = ry * Jz, tqy = rz * Jx - rx * Jz, tqz = -ry * Jx
      const tbx = R[0] * tqx + R[1] * tqy + R[2] * tqz, tby = R[3] * tqx + R[4] * tqy + R[5] * tqz, tbz = R[6] * tqx + R[7] * tqy + R[8] * tqz
      this.wb[0] += tbx / I[0]; this.wb[1] += tby / I[1]; this.wb[2] += tbz / I[2]
      this.impact = Math.max(this.impact, Math.min(1, -vn / 15)); this.impactPos = [px, this.pos[1], pz]
    }
  }
}

/** contour de la voiture (repère modèle : x, z ; 3e valeur = zone pour les dégâts : 1 aileron AV, 5/6 dérive AV G/D,
 *  7/8 déflecteur latéral G/D, 2 aileron AR, 10–13 roue AVG/AVD/ARG/ARD, 0 coque) — voiture orientée −Z */
const CAR_PTS: [number, number, number][] = [
  [0, -2.78, 1], [-0.95, -2.5, 5], [0.95, -2.5, 6], [-0.5, -2.6, 1], [0.5, -2.6, 1],
  [-1.0, -1.95, 10], [1.0, -1.95, 11], [-1.0, -1.25, 10], [1.0, -1.25, 11],
  [-0.82, -0.3, 7], [0.82, -0.3, 8], [-0.75, 0.6, 0], [0.75, 0.6, 0],
  [-1.0, 1.35, 12], [1.0, 1.35, 13], [-1.0, 2.0, 12], [1.0, 2.0, 13],
  [-0.5, 2.62, 2], [0.5, 2.62, 2], [0, 2.7, 2],
]
function quatFromBasis(r: number[], u: number[], b: number[]): number[] {
  // colonnes r, u, b → quaternion [x, y, z, w]
  const m00 = r[0], m10 = r[1], m20 = r[2], m01 = u[0], m11 = u[1], m21 = u[2], m02 = b[0], m12 = b[1], m22 = b[2]
  const tr = m00 + m11 + m22
  let x, y, z, w
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = 0.25 * S; x = (m21 - m12) / S; y = (m02 - m20) / S; z = (m10 - m01) / S }
  else if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / S; x = 0.25 * S; y = (m01 + m10) / S; z = (m02 + m20) / S }
  else if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / S; x = (m01 + m10) / S; y = 0.25 * S; z = (m12 + m21) / S }
  else { const S = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / S; x = (m02 + m20) / S; y = (m12 + m21) / S; z = 0.25 * S }
  return [x, y, z, w]
}
