# RESEARCH_W11 — Mercedes-AMG F1 W11 EQ Performance (2020) · données et calibrage

Légende : **P** = publié (source citée) · **M** = mesuré sur notre modèle 3D · **E** = estimé (aucune valeur publique ; choisi pour reproduire les performances publiées).
Mercedes ne publie ni l'appui, ni la traînée, ni les raideurs, ni les couples de freinage, ni les rapports de boîte : **toutes ces valeurs sont E**.

## 1. Châssis, dimensions, masse
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| Masse minimale (pilote compris, sans carburant) | 746 kg | P | Mercedes-Benz Media, fiche technique W11 [S1] ; règlement technique FIA 2020 |
| Longueur / largeur / hauteur | > 5 000 / 2 000 / 950 mm | P | [S1] |
| Empattement | 3,641 m | M (≈ 3,7 m souvent cité, non confirmé) | modèle 3D |
| Voies AV / AR (demi-voie) | 0,796 / 0,776 m | M | modèle 3D |
| Monocoque | carbone + nid d'abeille, halo titane | P | [S1][S2] |
| Hauteur CG | 0,29 m | E | |
| Inerties roulis / lacet / tangage | 260 / 1 150 / 1 080 kg·m² | E | |

## 2. Suspensions
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| AV : triangles carbone, poussoirs (push-rod), barres de torsion + culbuteurs | — | P | [S1][S2] |
| AR : triangles carbone, tirants (pull-rod), ressorts/amortisseurs internes | — | P | [S1] |
| Raideurs roue AV/AR | 250 / 240 kN/m | E | |
| Amortissement AV/AR | 5,2 / 5,0 kN·s/m | E | |
| Anti-roulis AV/AR | 28 / 34 kN/m | E | |
| Hauteurs statiques AV/AR (rake modéré, concept Mercedes) | 30 / 75 mm | E | |
| Butées (bump stops) | course 30 mm, 2,2 MN/m | E | |

## 3. Aérodynamique
| Donnée | Valeur | Statut | Note |
|---|---|---|---|
| ClA (appui) | 6,0 m² | E | calé pour ≈ 5–6 g latéraux en courbe rapide (Pouhon, Blanchimont) |
| CdA (traînée) | 1,45 m² | E | calé sur 328 km/h en fin de Kemmel avec DRS (qualif) |
| Répartition d'appui AV | 40,5 % | E | |
| DRS ouvert | ΔCdA −0,17 ; ΔClA −0,75 | E | |
| Masse volumique air | 1,16 kg/m³ | E | ~400 m d'altitude, ~18 °C |
| Zones DRS Spa 2020 | 2 : Kemmel (activation 230 m après T4) ; ligne droite des stands (activation 30 m après T19) | P | Carte FIA du GP de Belgique 2020 [S9][S10] |

## 4. Groupe propulseur M11 EQ Performance
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| V6 90°, 1,6 L, 24 soupapes, turbo mono-étage | — | P | [S3] |
| Régime max | 15 000 tr/min | P | [S3] |
| Débit carburant max | 100 kg/h au-delà de 10 500 tr/min | P | [S3] |
| Injection directe | 500 bar max | P | [S3] |
| Alésage / course | 80 / 53 mm | P (règlement) | [S4] |
| Puissance totale | « > 950 ch » à ~1 025 ch | P (ordre de grandeur, sources secondaires) | [S4][S5] |
| MGU-K | 120 kW, 50 000 tr/min, 200 N·m | P | [S3] (couple : règlement) |
| Énergie MGU-K → roues | 4 MJ/tour (33,3 s à pleine puissance) | P | [S3] |
| Récupération MGU-K | 2 MJ/tour | P | [S3] |
| MGU-H | illimité (récup. moyenne 45 kW modélisée) | P / E | [S3] |
| Rendement thermique moteur seul | 0,49 | E (Mercedes revendique > 50 % avec récupération) | |
| Modes moteur (qualif / course / éco) | ± puissance, ± refroidissement | E (les « party modes » existaient, sans chiffres publiés ; interdits à partir de Monza 2020) | |
| Modes ERS (hotlap / dépassement / équilibré / recharge) | stratégies de déploiement | E | |

## 5. Transmission
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| 8 rapports + MA, carter carbone, séquentielle « seamless », hydraulique | — | P | [S1][S2][S5] |
| Embrayage | plaques carbone | P | [S1] |
| Vitesses à 12 500 tr/min par rapport | 102 / 132 / 160 / 190 / 222 / 256 / 292 / 336 km/h | E (calé sur Spa) | |
| Coupure au passage montant / descendant | 25 / 50 ms | E | |
| Différentiel | piloté, verrouillage « en charge » / « hors charge » réglables | E (valeurs) | |

## 6. Freins
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| Disques et plaquettes carbone/carbone Carbone Industries, étriers Brembo, brake-by-wire AR | — | P | [S1][S2] |
| Couple max AV / AR | 4 400 / 3 100 N·m | E | |
| Répartition par défaut | 57,5 % AV | E | |
| Fenêtre de température disques | 350–1 000 °C | E (ordre de grandeur Brembo) | |

## 7. Pneus Pirelli P Zero 2020
| Donnée | Valeur | Statut | Source |
|---|---|---|---|
| Dimensions AV / AR | 305/670-R13 / 405/670-R13 | P | Pirelli / règlement 2020 |
| Composés Spa 2020 | C2 dur (blanc), C3 medium (jaune), C4 tendre (rouge) | P | Pirelli preview Belgique 2020 [S6] |
| Pressions minimales de départ Spa 2020 | 24,5 psi AV / 21,0 psi AR | P | [S6] |
| Carrossage max (EOS) Spa 2020 | −2,75° AV / −1,50° AR | P | [S6] |
| Fenêtres de température (C2 / C3 / C4) | 110–135 / 105–135 / 90–120 °C | P (ordre de grandeur publié par Pirelli/presse) | |
| Modèle | Pacejka simplifié (combiné) + température surface/cœur, usure, pression | E | |
| μ de pic (combiné, sur charge nominale 3 kN), sensibilité à la charge | 2,8 ; 0,09 | E (gonflé pour compenser l'absence d'effet de sol modélisé finement) | |

## 8. DAS (Dual Axis Steering) — 2020 uniquement
- **P** : le pilote tire / pousse le volant le long de la colonne ; cela modifie le **pincement (toe)** des roues avant : volant tiré → roues parallèles en ligne droite (moins de frottement, chauffe plus homogène), volant poussé → pincement ouvert habituel (toe-out) avant le virage. Débloqué par un bouton, actionnement hydraulique sur la crémaillère ; interdit en 2021. Sources : F1.com [S7], Road & Track [S8], Motorsport.com.
- **E** : toe-out par roue −0,0045 rad (~0,26°), course du volant 35 mm. Effet modélisé : moins de dérive parasite et de traînée de roulement en ligne droite, montée en température AV ; à relâcher avant le freinage.

## 9. Calibrage sur Spa 2020 (qualifications, Lewis Hamilton)
| Référence publiée | Valeur réelle (P) | Notre simulation (pilote automatique, mesuré) |
|---|---|---|
| Pole position | **1:41.252** (moy. 249,026 km/h) [S11][S12] | **1:41,75** (IA, pneus C4, marge pilote 1,06 — E) ; S 27,58 / 44,21 / 29,96 |
| Vitesse fin du secteur 1 (145 m avant Les Combes) | **328,4 km/h** [S13] | 327,5 km/h |
| Speed trap (30 m après T4 / Raidillon) | 307,7 km/h [S13] | non mesuré au même point (à faire) |
| Vitesse fin secteur 2 (48 m avant T15) | 220,6 km/h [S13] | non mesuré au même point (à faire) |
| Accélération latérale max | ~5–6 g (presse, ordre de grandeur) | 5,9 g |

**Écarts connus (honnêteté)** : les températures de surface restent sous la fenêtre Pirelli en tour lancé (≈ 77 °C AV / 84 °C AR après réglage de l'échauffement AV, E) ; le facteur « marge pilote » 1,04 multiplie un profil de vitesse calculé avec μ = 1,0 (calage, E) ; les distances de freinage idéales sont plus courtes que la réalité ; le grip est calé à la hausse (E) pour compenser un modèle aéro sans effet de sol / sensibilité à la hauteur de caisse.

## 10. Livrée
La W11 de course 2020 est **noire** (livrée anti-racisme annoncée le 29 juin 2020) ; elle avait été présentée argent en février 2020. Le modèle 3D utilisé est celui fourni (voir SOURCES.md) ; la couleur de la livrée suit ce modèle — à vérifier/arbitrer avec l'utilisateur.

## Sources
- [S1] Mercedes-Benz Media — W11 EQ Performance, Technische Daten : https://media.mercedes-benz.com/article/95002cb8-fdee-4190-82fb-c2b00feaf8db
- [S2] mercedesamgf1.com (archive) — W11 : https://web.archive.org/web/20220425035027/https:/www.mercedesamgf1.com/en/car/f1-w11-eq-performance/
- [S3] mercedesamgf1.com (archive) — M11 EQ Performance : https://web.archive.org/web/20200217150716/https:/www.mercedesamgf1.com/en/car/f1-m11-eq-performance/
- [S4] F1technical.net — W11 : https://www.f1technical.net/f1db/cars/1077/mercedes-amg-f1-w11
- [S5] Wikipédia — Mercedes-AMG F1 W11 EQ Performance : https://en.wikipedia.org/wiki/Mercedes-AMG_F1_W11_EQ_Performance
- [S6] Pirelli — 2020 Belgian Grand Prix Preview : https://press.pirelli.com/2020-belgian-grand-prix---preview/
- [S7] Formula1.com — DAS explained : https://www.formula1.com/en/latest/article/das-explained-what-we-know-so-far-about-mercedes-trick-new-steering-system.4vgDQ6cc20xUfhdZGT0ejB
- [S8] Road & Track — How DAS worked : https://www.roadandtrack.com/news/a34962680/mercedes-amg-f1-dual-axis-steering-explained/
- [S9] FIA — 2020 Belgian GP Circuit Map (zones DRS) : https://www.fia.com/sites/default/files/decision-document/2020%20Belgian%20Grand%20Prix%20-%20Circuit%20Map_0.pdf
- [S10] F1technical.net — Things to know ahead of the Belgian GP : https://www.f1technical.net/news/22773
- [S11] FIA — Provisional Qualifying Classification Belgique 2020 : https://www.fia.com/sites/default/files/decision-document/2020%20Belgian%20Grand%20Prix%20-%20Provisional%20Qualifying%20Classification.pdf
- [S12] Formula1.com — résultats qualifs Belgique 2020 : https://www.formula1.com/en/results/2020/races/1051/belgium/qualifying
- [S13] Vitesses par secteur qualif Belgique 2020 (reprise des données FIA « Maximum Speeds ») : https://en.mclarenf-1.com/2020/gp/s7981/sector_speeds ; https://formula1-data.com/article/belgium-qualifying-maximum-speeds-2020


## Calibrage accélération (03/11)

| Grandeur | Valeur | Statut |
|---|---|---|
| Adhérence longitudinale relative pneu `muX` | 0,78 → **0,67** | E (calée sur 0-100 ≈ 2,6 s et 0-200 ≈ 4,5–5 s, réf. publiques estimées) |
| Inertie tournante moteur+embrayage+MGU-K `engineInertia` | **0,045 kg·m²** côté moteur, ramenée aux roues ×rapport² embrayage fermé | E |
| Ligne IA (racingLine) | freinage et traction ×(muX/0,78) | — |
| Résultat | 0-100 2,57 s ; 0-200 4,58 s ; Vmax 325,3 / DRS 339,4 km/h (inchangée) ; tour IA 1:41,75 | testé Node, pas iPhone |
