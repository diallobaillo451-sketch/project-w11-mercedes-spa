# 10 nouvelles améliorations de réalisme (lot 6, 2026-11-09)

Ces améliorations n'étaient pas demandées explicitement. Elles sont implémentées et testées dans `game/tests/env.test.ts` (Node) et dans WebKit en émulation iPhone 13.

Légende des sources : **P** = publié (source citée), **E** = estimation d'ingénierie.

| # | Amélioration | Fichiers | Modèle | Source |
|---|---|---|---|---|
| 1 | **Pick-up** : gomme ramassée hors trajectoire (marbles) | `physics/tyre.ts`, `physics/env.ts` | Le pneu ramasse la gomme quand il roule sur une zone de marbles. Grip −8 % au maximum. Le pick-up se nettoie en 2–4 virages de roulage propre. | E (phénomène décrit par Pirelli) |
| 2 | **Pneus sales** après l'herbe ou le gravier | `tyre.ts`, `vehicle.ts` | `dirt` par roue, grip jusqu'à −25 %. Se nettoie en ≈ 1–2 km. | E |
| 3 | **Saleté ramenée sur la piste** au point où la voiture revient | `env.ts dropDirt` | Cellules de la grille `dirt` : grip −30 %. Le trafic virtuel les efface. | E |
| 4 | **Températures de pneu sur 3 zones** (intérieur / milieu / extérieur) avec le carrossage | `tyre.ts`, `ui/wheel.ts` | Le carrossage négatif chauffe l'intérieur. La force latérale chauffe l'épaule extérieure. Les 3 zones sont affichées sur la page Pneus du volant. | P (pratique des sondes infrarouges 3 points) / E pour les coefficients |
| 5 | **Usure du patin (plank)** | `vehicle.ts` | Le patin s'use dès que le fond touche la piste (garde au sol < 0). La valeur est affichée (mm). La limite FIA est de 1 mm d'usure sur 10 mm (règlement technique F1). | P (règle) / E (vitesse d'usure) |
| 6 | **Densité de l'air** (température, pression, humidité) | `env.ts rho`, `vehicle.ts` | ρ = gaz parfait plus vapeur d'eau, p = 966 hPa (Spa, ≈ 400 m d'altitude). Elle agit sur la puissance thermique (× (ρ/ρ0)^0,3, le turbo compense en partie) et sur l'appui et la traînée (∝ ρ). | P (physique) / E (exposant) |
| 7 | **Aileron arrière aéroélastique** | `vehicle.ts` | Au-dessus de ≈ 200 km/h, l'aileron fléchit : CdA −2,5 %, ClA −1,5 %. | E (pratique 2019–2020 relevée par la presse technique) |
| 8 | **Températures huile et eau, avec perte de puissance** | `vehicle.ts` | Le refroidissement dépend de la vitesse. Au-dessus de 125 °C, la puissance baisse de 12 % au maximum. En sillage, la voiture chauffe plus. | E |
| 9 | **Feu arrière FIA** | `render/carRig.ts` | Allumé en continu par temps de pluie. Clignote à 4 Hz pendant la récupération d'énergie (ERS harvesting), comme en 2020. | P (règlement technique F1 2020) |
| 10 | **Couvertures chauffantes réglables** | `ui/panels.ts`, `tyre.ts` | Avant / arrière, 100 / 80 °C au maximum (limites FIA 2020). Pneus intermédiaires et pluie : 60 °C. Pneus froids → grip réduit et risque de graining. | P (Pirelli/FIA 2020 : 100 °C AV, 80 °C AR) |

**Bonus (non compté) : DRS désactivé sur piste mouillée.** Le DRS est coupé quand la piste est humide à plus de 30 %. En réalité, c'est la direction de course qui le désactive (règlement sportif).
