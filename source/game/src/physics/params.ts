/**
 * Paramètres Mercedes-AMG F1 W11 EQ Performance (2020).
 * P = publié (règlement FIA 2020 / Mercedes / Pirelli / F1), M = mesuré sur notre modèle 3D, E = estimation (non publié).
 * Voir docs/RESEARCH_W11.md pour les sources de chaque valeur.
 */
export type Compound = 'C2' | 'C3' | 'C4'

export const W11 = {
  massMin: 746,            // P : masse minimale avec pilote, sans carburant (FIA TR 2020 art. 4.1)
  fuelQuali: 12,           // E : carburant en qualif
  frontMassMin: 0.455,     // P : minimum par essieu 45,5 % AV / 53,5 % AR (art. 4.2) ; répartition réelle E
  cgHeight: 0.29,          // E
  wheelbase: 3.641,        // M (empattement W11 non publié ; ~3,7 m souvent cité, non vérifié)
  halfTrackF: 0.796,       // M
  halfTrackR: 0.776,       // M
  wheelRadiusF: 0.3352,    // M / P : Pirelli 13" Ø 670 mm
  wheelRadiusR: 0.3356,
  tyreWidthF: 0.305,       // P : 305/670-13
  tyreWidthR: 0.405,       // P : 405/670-13
  inertia: { roll: 260, yaw: 1150, pitch: 1080 }, // E (kg·m²)
  wheelInertiaF: 1.1, wheelInertiaR: 1.5,        // E (roue+disque+demi-arbre ramené)
  // Suspension (poussoirs AV « push-rod », tirants AR « pull-rod » : P) – raideurs E
  springF: 250_000, springR: 240_000, dampF: 5200, dampR: 5000,
  arbF: 28_000, arbR: 34_000, bumpTravel: 0.030, bumpK: 2_200_000, droop: 0.035,
  rideF: 0.030, rideR: 0.075, // E : hauteurs statiques (rake typique Mercedes plus faible que Red Bull)
  // Aéro (E : aucune valeur de traînée/appui publiée par Mercedes)
  rho: 1.16,              // E : ~400 m d'altitude, ~18 °C (qualif Spa 2020)
  ClA: 6.0, CdA: 1.45, aeroBalF: 0.405, drsCdA: -0.17, drsClA: -0.75,
  // Unité de puissance M11 EQ Performance
  rpmMax: 15000,          // P : régime max réglementaire
  rpmIdle: 4000,          // E
  fuelFlowMax: 100,       // P : kg/h au-delà de 10 500 tr/min ; Q = 0,009·N + 5,5 en dessous
  fuelLHV: 43.5e6,        // E : PCI essence F1 J/kg
  iceEff: 0.49,           // E : rendement thermique moteur thermique seul (Mercedes revendique >50 % avec récupération)
  mgukPower: 120_000,     // P : 120 kW
  mgukTorque: 200,        // P : 200 N·m (arbre MGU-K, max 50 000 tr/min)
  esDeployLap: 4e6,       // P : 4 MJ/tour batterie → MGU-K
  esHarvestLap: 2e6,      // P : 2 MJ/tour MGU-K → batterie
  esCapacity: 4e6,        // P : fenêtre SOC max 4 MJ
  mguhPower: 45_000,      // E : récupération MGU-H moyenne à pleine charge (non publié)
  driveEff: 0.93,         // E
  engineInertia: 0.045,   // E : inertie tournante vilebrequin + embrayage + MGU-K + arbre primaire (kg·m², côté moteur), ramenée aux roues ×rapport²
  // Boîte 8 rapports séquentielle « seamless » (P) — rapports E calibrés sur les vitesses de Spa
  gearTopKmh: [102, 132, 160, 190, 222, 256, 292, 336], // vitesse à 12 500 tr/min par rapport (E)
  shiftCut: 0.025, downShiftTime: 0.05, // E
  upshiftRpm: 12150, downshiftRpm: 9300,
  // Freins carbone/carbone (Carbone Industries + Brembo : P) — couples E
  brakeTorqueF: 4400, brakeTorqueR: 3100, brakeBias: 0.575,
  brakeHeatCap: 4000, brakeCool: 40, brakeOptLo: 350, brakeOptHi: 1000,
  // Pneus Pirelli P Zero 2020
  tyre: {
    mu0: 2.8, muX: 0.67, // muX (E) : adhérence longitudinale relative ; 0,78 → 0,67 calé sur 0-100 ≈ 2,6 s / 0-200 ≈ 4,6 s (réf. publiques E)
    fz0: 3000, loadSens: 0.09, kPeak: 0.11, aPeak: 0.105, C: 1.45,
    relax: 0.28, heatGain: 0.0105, coolBase: 2.6, coolSpeed: 0.11, heatCap: 1.0,
    frontHeat: 1.35, // E : pneu AV plus étroit (305 mm) → plus de chaleur par unité de surface ; calé pour AV ≈ 90–100 °C en tour de qualif
    window: { C2: [110, 135], C3: [105, 135], C4: [90, 120] } as Record<Compound, [number, number]>, // P (Pirelli, motorsport.com)
    gripC: { C2: 0.975, C3: 0.99, C4: 1.0 } as Record<Compound, number>, // E
    wearC: { C2: 0.6, C3: 0.8, C4: 1.1 } as Record<Compound, number>,   // E
    blanketF: 95, blanketR: 80, // E
    pColdF: 24.5, pColdR: 21.0, // P psi : minimums Pirelli Spa 2020 (RESEARCH_W11 S9)
  },
  steerLock: 0.32,        // E : braquage roue max (rad) — limité selon la vitesse par l'aide
  steeringWheelRatio: 5.2,// E : angle volant / angle roue
  toeF: -0.0045, toeR: 0.002, // E : pincement AV ouvert (DAS tiré → 0), AR fermé (rad, par roue)
  dasTravel: 0.035,       // E : course du volant DAS (m)
} as const

export type Surf = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export const SURFACE = {
  //            grip  roll-res  bump(m)  name
  0: { mu: 0.5, rr: 0.10, bump: 0.0, name: 'vide' },
  1: { mu: 1.0, rr: 0.012, bump: 0.0, name: 'asphalte' },
  2: { mu: 0.93, rr: 0.016, bump: 0.008, name: 'vibreur' },
  3: { mu: 0.86, rr: 0.015, bump: 0.002, name: 'zone peinte' },
  4: { mu: 0.48, rr: 0.06, bump: 0.012, name: 'herbe' },
  5: { mu: 0.42, rr: 0.22, bump: 0.018, name: 'gravier' },
  6: { mu: 0.35, rr: 0.20, bump: 0.0, name: 'eau' },
  7: { mu: 0.6, rr: 0.05, bump: 0.0, name: 'objet' },
} as Record<number, { mu: number; rr: number; bump: number; name: string }>
