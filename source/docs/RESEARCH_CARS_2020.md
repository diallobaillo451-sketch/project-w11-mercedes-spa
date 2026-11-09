# Physique des 10 voitures 2020 — recherche, chiffres, calibration (lot 8 B)

Code : `game/src/physics/cars2020.ts` (appliqué à la voiture du joueur par `applyCarPhysics(id)` ; les adversaires IA
reprennent les mêmes paramètres). Validation : `game/tests/cars2020.test.ts` → `reports/cars2020_spa.json`.
Légende : **P** publié · **E** estimation argumentée · **C** calibré par simulation.

## 1. Données réelles utilisées (Spa-Francorchamps, qualifications du 29 août 2020) — P
Sources : classement officiel F1 (formula1.com/en/results/2020/races/1051/belgium/qualifying), Wikipédia « 2020 Belgian
Grand Prix », vitesses par point de mesure (en.mclarenf-1.com/2020/gp/s7981/sector_speeds ; formula1-data.com
« belgium-qualifying-maximum-speeds-2020 » ; f1i.com « Spa Speed Trap: Who is the slowest of them all? »).

| Équipe | Moteur | Meilleur temps qualif (pilote, séance) | Écart W11 | I1 fin de Kemmel (moy. 2 voitures) | Speed trap (moy.) |
|---|---|---|---|---|---|
| Mercedes W11 | Mercedes M11 | 1:41.252 (HAM, Q3) | 0 | 329,8 | 307,9 |
| Red Bull RB16 | Honda RA620H | 1:41.778 (VER, Q3) | +0,526 | 327,8 | 308,5 |
| Renault R.S.20 | Renault E-Tech 20 | 1:42.061 (RIC, Q3) | +0,809 | 333,6 | 313,0 |
| McLaren MCL35 | Renault E-Tech 20 | 1:42.438 (SAI, Q3) | +1,186 | 326,6 | 311,8 |
| Racing Point RP20 | Mercedes (BWT) | 1:42.491 (STR, Q2) | +1,239 | 335,2 | 312,0 |
| AlphaTauri AT01 | Honda RA620H | 1:42.730 (KVY, Q2) | +1,478 | 335,3 | 312,0 |
| Ferrari SF1000 | Ferrari 065 | 1:42.996 (LEC, Q2) | +1,744 | 331,0 | 307,7 |
| Williams FW43 | Mercedes | 1:43.468 (RUS, Q2) | +2,216 | 332,6 | 308,2 |
| Alfa Romeo C39 | Ferrari 065 | 1:43.743 (RAI, Q1) | +2,491 | 331,6 | 306,9 |
| Haas VF-20 | Ferrari 065 | 1:43.838 (GRO, Q1) | +2,586 | 329,0 | 305,5 |

Faits marquants vérifiés : les 5 voitures les plus lentes au speed trap avaient un moteur Ferrari ; Vettel était passé
de 317,7 km/h (2019) à 308 km/h (2020) ; Ferrari 1,048 s plus lente qu'en 2019 (formula1.com, rapport de qualif) ;
aucune Ferrari en Q3 (première fois depuis Silverstone 2014). Course : Ricciardo meilleur tour 1:47.483 ; Hamilton
vainqueur en 1:24:08.761.

## 2. Unités de puissance 2020 — E
Aucun constructeur ne publie sa puissance. Hypothèses (consensus presse 2020, ordres de grandeur) :
- **Mercedes M11** : référence (≈ 1 000 ch système en qualif).
- **Honda RA620H** et **Renault E-Tech 20** : ≈ 10 ch de moins que Mercedes → `ice = 0,986` (facteur sur le rendement thermique).
- **Ferrari 065** : après l'accord confidentiel FIA–Ferrari (fév. 2020) et les directives techniques de fin 2019 sur le
  débit carburant, perte estimée ≈ 30–40 ch par rapport à 2019 et à Mercedes → `ice = 0,952` (≈ −35 ch). Cohérent avec les
  speed traps : les clients Ferrari sont tous en bas du classement de vitesse malgré des ailerons peu chargés.
- MGU-K 120 kW, 4 MJ/tour, débit 100 kg/h : identiques (règlement technique 2020, P).

## 3. Aéro et masse — E puis C
- Masse minimale 746 kg pour toutes (FIA TR 2020 art. 4.1, P) ; les surpoids réels (Williams, Haas, quelques kg) ne sont pas publiés → non modélisés.
- **CdA** (traînée) : choisie par équipe pour reproduire l'ordre des vitesses de pointe à Spa (I1, mesuré 145 m avant Les
  Combes) avec la puissance du §2. Renault la plus « fine » (1,37), Red Bull / Mercedes les plus chargées (1,45).
- **ClA** (appui) : **calibré** par dichotomie pour que l'écart de tour simulé à la W11 égale l'écart réel (tableau §1).
- Répartition AV : 40,5 % (Red Bull 41 %, voiture plus « pointue » à l'avant, E).
- Géométrie (empattement, voies, pneus) : celle de la W11 pour toutes — approximation (les écarts réels sont de quelques cm).

| Voiture | ice | CdA | ClA (C) | Tour simulé | Écart simulé | Écart réel | I1 simulé (DRS) |
|---|---|---|---|---|---|---|---|
| W11 | 1,000 | 1,45 | 6,000 | 1:41.511 | 0 | 0 | 334,8 |
| RB16 | 0,986 | 1,45 | 5,894 | 1:42.024 | +0,513 | +0,526 | 333,6 |
| R.S.20 | 0,986 | 1,37 | 5,291 | 1:42.326 | +0,816 | +0,809 | 340,3 |
| MCL35 | 0,986 | 1,44 | 5,462 | 1:42.691 | +1,181 | +1,186 | 334,7 |
| RP20 | 1,000 | 1,39 | 5,038 | 1:42.650 | +1,139 | +1,239 | 340,2 |
| AT01 | 0,986 | 1,38 | 4,960 | 1:43.022 | +1,512 | +1,478 | 339,7 |
| SF1000 | 0,952 | 1,40 | 5,277 | 1:43.252 | +1,742 | +1,744 | 334,7 |
| FW43 | 1,000 | 1,41 | 4,658 | 1:43.603 | +2,092 | +2,216 | 338,8 |
| C39 | 0,952 | 1,40 | 4,901 | 1:44.056 | +2,545 | +2,491 | 334,9 |
| VF-20 | 0,952 | 1,41 | 4,881 | 1:44.159 | +2,648 | +2,586 | 334,1 |

**Validation** : toutes les voitures sont à ±0,13 s de leur écart réel à la W11 (critère du test : ±0,35 s) ; la W11 fait
1:41.511 contre 1:41.252 pour la pole réelle (+0,26 s, pilote automatique à 1,06 × la vitesse de ligne). Les vitesses I1
simulées sont ~5 km/h au-dessus du réel pour tout le monde (DRS ouvert tout le Kemmel, aspiration absente) ; l'ordre
relatif est respecté sauf McLaren (réel le plus lent en I1 : réglage à fort appui de Sainz/Norris non reproduit).

## 4. Pneus — P/E
Pirelli 2020 : C2/C3/C4 à Spa (P, formula1.com). Mêmes lois de pneu pour tous (fenêtres Pirelli P). Différences
d'usure par voiture (Racing Point douce avec ses pneus, Ferrari dure) : facteur `wear` IA, E, lot 8 C.

## 5. Safety car — Mercedes-AMG GT Black Series
P (Mercedes-AMG, fiche technique) : V8 4,0 l biturbo **730 ch (537 kW) à 6 700–6 900 tr/min, 800 N·m**, boîte DCT 7
rapports, propulsion, **masse à vide DIN 1 520 kg**, 0–100 km/h 3,2 s, **325 km/h** maxi. Pneus Michelin Pilot Sport Cup 2 R
de série (la version F1 roule en Pirelli P Zero) ; modèle : véhicule de route simplifié (µ ≈ 1,35, appui faible), voir
`game/src/race/safetyCar.ts`. (Le safety car réel de 2020 était l'AMG GT R ; la GT Black Series l'a remplacé en 2021 — choix de Baillo.)
