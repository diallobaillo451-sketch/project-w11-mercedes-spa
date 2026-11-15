# Sources et licences — PROJECT W11

## Modèles 3D (copiés tels quels dans `assets-raw/`, jamais modifiés)
| Asset | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| Mercedes F1 2020 (W11) | `car_w11.glb` | Kevin Love (Sketchfab Tyler_Kevin) | CC BY 4.0 | https://sketchfab.com/3d-models/mercedec-f1-2020-0d97207d829441ba95952598f84e8d63 |
| Pilote « rhp_bell_hp77_driver_f1 » | `driver_bell.glb` | MattDoesBlender | **CC BY-NC-SA 4.0** (non commercial, partage à l'identique) | https://sketchfab.com/3d-models/rhp-bell-hp77-driver-f1-2916ac047ea84abe9394c38e4fa2d4bd |
| Circuit de Spa-Francorchamps (tracé 2022) | `spa_part1..8.glb` | Dave Love (Sketchfab Tyler_Dave) | CC BY 4.0 | https://sketchfab.com/3d-models/circuit-de-spa-francorchamps-2022-layout-ac681fbf548144498c130c3aa0adeb54 |
| Circuit de Silverstone (tracé 2024) | `silverstone_circuit_2024_layout.glb` | Dave Love (Sketchfab Tyler_Dave) | CC BY 4.0 | https://sketchfab.com/3d-models/silverstone-circuit-2024-layout-bbaf4b12d5244c76998fd44f771fc0b3 |

Conséquence : à cause du pilote (NC-SA), le jeu doit rester **gratuit et non commercial**, et les dérivés du pilote (casque/combinaison retexturés) sont distribués sous **CC BY-NC-SA 4.0**.

## Casque Lewis Hamilton 2020 (texture `assets-work/helmet_lh2020.png`)
- Référence visuelle principale (projetée sur le casque) : Wikimedia Commons, « Lewis Hamilton Integralhelm 2020 », auteur **Auge=mit**, licence **CC BY-SA 4.0** — https://commons.wikimedia.org/wiki/File:Lewis_Hamilton_Integralhelm_2020.jpg (métadonnées : `reports/helmet_ref/`) . La texture du casque est une œuvre dérivée → attribution + partage à l'identique (compatible avec la NC-SA du modèle pilote : diffusion sous BY-NC-SA).
- Recoupements couleurs/design (lecture uniquement) : formula1.com (présentation casque 2020, février 2020 ; version violette « End Racism »/arc-en-ciel, 3 juillet 2020), RaceFans (2 juillet 2020), motorsport.com, helmetarchive.
- **Approximations assumées** : les textes de sponsors (MONSTER ENERGY, PETRONAS, EPSON, « 44 ») sont redessinés dans une police libre (pas de logos officiels) ; positions et tailles approximatives. Couleurs de base (violet/blanc/jaune-vert) issues de la photo de référence, non calibrées.
- Combinaison et gants : teinte « Mercedes 2020 » (noir + touches pétrole) dérivée des textures d'origine du pilote — **approximation**, pas une reproduction de la vraie combinaison.

## Textures de détail du sol (CC0)
| Usage | Fichiers jeu | Source | Licence |
|---|---|---|---|
| Gravier des bacs (couleur × AO, normale), détail de près | `game/public/assets/detail/gravel_*` | ambientCG « Gravel023 » — https://ambientcg.com/view?id=Gravel023 | CC0 1.0 |
| Herbe (couleur × AO, normale), détail de près | `game/public/assets/detail/grass_*` | ambientCG « Grass001 » — https://ambientcg.com/view?id=Grass001 | CC0 1.0 |

Conversion : `game/tools/make_detail.mjs` (1024², KTX2 UASTC + WebP de secours). Aucune attribution exigée (CC0) ; crédit donné par courtoisie.

## Ciel (CC0)
| Usage | Fichiers jeu | Source | Licence |
|---|---|---|---|
| Ciel photographique HDRI (nuages, IBL des reflets) | `game/public/assets/sky/sky_4k.webp`, `sky_2k.webp` (mobile), `sky.json` | Poly Haven « Kloofendal 48d Partly Cloudy (Pure Sky) », Greg Zaal & Jarod Guest — https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 |

Conversion : `tools/make_sky.py` (hémisphère haut, disque solaire retiré, encodage HDR x/(1+x)). Choix : ciel partiellement nuageux avec soleil (cohérent avec les ombres nettes du jeu) plutôt que « Stuttgart Hillside » (couvert, horizon avec arbres nus et tour qui apparaîtraient derrière la forêt de Spa).

- `engine_new.mp3` (320 kb/s, 44,1 kHz stéréo, 2 min 17 s) fourni par le propriétaire. **Droits d'auteur inconnus** — à mentionner dans le README ; à remplacer par un son libre avant toute diffusion large si l'origine ne peut pas être établie.

## Spécifications W11
Aucune spec « exacte » inventée. Chaque valeur est marquée **P** (publiée, source citée) ou **E** (estimée) dans `docs/RESEARCH_W11.md` (sources S1–S13 : dossier média Mercedes-AMG 2020, f1technical, Wikipédia, Pirelli preview Spa 2020, F1.com (DAS, résultats), Road & Track, carte circuit et classement qualif FIA 2020, données de vitesse) et dans `game/src/physics/params.ts`.

## Outils (tous gratuits / open source)
Blender 5.2 (GPL), glTF-Transform 4.5 (MIT), meshoptimizer/gltfpack (MIT), sharp/libvips (Apache-2.0/LGPL), three.js (MIT), Playwright (Apache-2.0), Python numpy/scipy/OpenCV/Pillow.

## Lot 7 — casques, combinaisons et couleurs des 20 pilotes 2020 (approximations)
Les textures (`game/public/drivers/<id>/`) ont été peintes de façon procédurale par `tools/drivers_paint.py`, à partir de `game/src/data/drivers2020.json`. Les motifs ont été relevés à l'œil sur des photos publiques ; aucune image n'a été copiée.
- RaceFans, « Pictures: Every F1 driver's helmet for the 2020 season » : https://www.racefans.net/2020/03/16/pictures-every-f1-drivers-helmet-for-the-2020-season/
- Motor Sport Magazine, galerie des casques F1 2020 : https://www.motorsportmagazine.com/articles/single-seaters/f1/gallery-2020-formula-1-driver-crash-helmets/
- f1i.autojournal.fr : galeries photos des présentations 2020.
- Couleurs d'équipe 2020 : livrées officielles telles que photographiées (valeurs RGB estimées).

Sponsors : uniquement des marques texte ou des formes simples, sans aucun logo officiel copié.
Hamilton : son casque d'origine est conservé (référence de qualité).
Écarts connus : motifs fins simplifiés (dégradés, éléments de casque événementiels, numéros stylisés) et couleurs exactes approchées.
Modèle 3D du pilote : `driver_bell.glb` (CC BY-NC-SA), maillage commun aux 20 pilotes.
Durées réelles des séances 2020 : EL 90/90/60 min, Q 18/15/12 min. Pneus Pirelli à Spa 2020 : C2/C3/C4, pressions minimales 24,5 / 21,0 psi.

## Lot 8 — voitures 2020 des 9 autres équipes + safety car (Sketchfab, fournis par New Bot dans `/workspace/w11-shared/incoming/cars/`)
Modifiés pour le jeu (rig roues/DRS, matériaux, décimation, LOD, KTX2) par `blender/scripts/t1_team_car.py`. Licences
**CC BY-NC-SA 4.0** (usage non commercial, partage dans les mêmes conditions) sauf le safety car (**CC BY 4.0**).
⚠ Redistribution sur un dépôt public sous NC-SA : à confirmer par Baillo (même situation que la W11 et le pilote déjà publiés).
| Voiture dans le jeu | Modèle source | Auteur | Lien | Licence |
|---|---|---|---|---|
| Red Bull RB16 | 2020 F1 Red Bull RB16 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-red-bull-rb16-9f6e6e5830df430d9d940dacc7e12d15 | CC BY-NC-SA 4.0 |
| Ferrari SF1000 | 2020 F1 Ferrari SF1000 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-ferrari-sf1000-b41d5f1096664601ad1f511ca4cd138f | CC BY-NC-SA 4.0 |
| McLaren MCL35 | 2020 F1 McLaren MCL35 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-mclaren-mcl35-9b962b233892491285cb6f467d43ab46 | CC BY-NC-SA 4.0 |
| Renault R.S.20 | 2020 F1 Renault RS20 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-renault-rs20-9a908497f1674f8797264edd3c10077c | CC BY-NC-SA 4.0 |
| Racing Point RP20 | 2020 F1 Racing Point RP20 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-racing-point-rp20-1e395a1dbeb645febeeffe5e14adf071 | CC BY-NC-SA 4.0 |
| Alfa Romeo C39 | 2020 F1 Alfa Romeo C39 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-alfa-romeo-c39-3854ade7db224b3ebfd1455f5c1abcab | CC BY-NC-SA 4.0 |
| Haas VF-20 | 2020 F1 Haas VF20 | OUTPISTON | https://sketchfab.com/3d-models/2020-f1-haas-vf20-6d5a786a32414edd9a7753181684e78f | CC BY-NC-SA 4.0 |
| Williams FW43 (**doublure : modèle FW42 de 2019**) | 2019 F1 Williams FW42 | OUTPISTON | https://sketchfab.com/3d-models/2019-f1-williams-fw42-7e91db14c20e410caae45cf943f2e41b | CC BY-NC-SA 4.0 |
| AlphaTauri AT01 | AlphaTauri 2020 (corps gris, échelle 0,01 corrigée ×100) | MattDoesBlender | https://sketchfab.com/3d-models/alphatauri-2020-2-8d67d88756f0405d802a61190a5f9c3c | CC BY-NC-SA 4.0 |
| Safety car Mercedes-AMG GT Black Series | Mercedes-AMG GT BS Safety Car | DR1KING100K | https://sketchfab.com/3d-models/mercedes-amg-gt-bs-safety-car-8fda6fc1fc4741b78890d3b548b2d990 | CC BY 4.0 |

Livrée AlphaTauri AT01 **recréée** (blanc / bleu nuit, `blender/scripts/t2_livery.py`) : zones de couleur d'après les photos
de présentation 2020 (racefans.net, autosport.com, global.honda) ; marques **en texte seulement** (« AlphaTauri », « HONDA »,
police Open Sauce Sans, OFL) — aucun logo officiel copié. Couleurs du safety car (argent, noir, rampe orange) attribuées
par nom de pièce, le modèle source n'ayant aucune texture. Physique 2020 : sources dans `docs/RESEARCH_CARS_2020.md`.
