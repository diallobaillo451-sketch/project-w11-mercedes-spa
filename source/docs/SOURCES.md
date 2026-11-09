# Sources et licences — PROJECT W11

## Modèles 3D (copiés tels quels dans `assets-raw/`, jamais modifiés)
| Asset | Fichier | Auteur | Licence | Source |
|---|---|---|---|---|
| Mercedes F1 2020 (W11) | `car_w11.glb` | Kevin Love (Sketchfab Tyler_Kevin) | CC BY 4.0 | https://sketchfab.com/3d-models/mercedec-f1-2020-0d97207d829441ba95952598f84e8d63 |
| Pilote « rhp_bell_hp77_driver_f1 » | `driver_bell.glb` | MattDoesBlender | **CC BY-NC-SA 4.0** (non commercial, partage à l'identique) | https://sketchfab.com/3d-models/rhp-bell-hp77-driver-f1-2916ac047ea84abe9394c38e4fa2d4bd |
| Circuit de Spa-Francorchamps (tracé 2022) | `spa_part1..8.glb` | Dave Love (Sketchfab Tyler_Dave) | CC BY 4.0 | https://sketchfab.com/3d-models/circuit-de-spa-francorchamps-2022-layout-ac681fbf548144498c130c3aa0adeb54 |

Conséquence : à cause du pilote (NC-SA), le jeu doit rester **gratuit et non commercial**, et les dérivés du pilote (casque/combinaison retexturés) sont distribués sous **CC BY-NC-SA 4.0**.

## Casque Lewis Hamilton 2020 (texture `assets-work/helmet_lh2020.png`)
- Référence visuelle principale (projetée sur le casque) : Wikimedia Commons, « Lewis Hamilton Integralhelm 2020 », auteur **Auge=mit**, licence **CC BY-SA 4.0** — https://commons.wikimedia.org/wiki/File:Lewis_Hamilton_Integralhelm_2020.jpg (métadonnées : `reports/helmet_ref/`) . La texture du casque est une œuvre dérivée → attribution + partage à l'identique (compatible avec la NC-SA du modèle pilote : diffusion sous BY-NC-SA).
- Recoupements couleurs/design (lecture uniquement) : formula1.com (présentation casque 2020, février 2020 ; version violette « End Racism »/arc-en-ciel, 3 juillet 2020), RaceFans (2 juillet 2020), motorsport.com, helmetarchive.
- **Approximations assumées** : les textes de sponsors (MONSTER ENERGY, PETRONAS, EPSON, « 44 ») sont redessinés dans une police libre (pas de logos officiels) ; positions et tailles approximatives. Couleurs de base (violet/blanc/jaune-vert) issues de la photo de référence, non calibrées.
- Combinaison et gants : teinte « Mercedes 2020 » (noir + touches pétrole) dérivée des textures d'origine du pilote — **approximation**, pas une reproduction de la vraie combinaison.

## Audio
- `engine_new.mp3` (320 kb/s, 44,1 kHz stéréo, 2 min 17 s) fourni par le propriétaire. **Droits d'auteur inconnus** — à mentionner dans le README ; à remplacer par un son libre avant toute diffusion large si l'origine ne peut pas être établie.

## Spécifications W11
Aucune spec « exacte » inventée. Chaque valeur est marquée **P** (publiée, source citée) ou **E** (estimée) dans `docs/RESEARCH_W11.md` (sources S1–S13 : dossier média Mercedes-AMG 2020, f1technical, Wikipédia, Pirelli preview Spa 2020, F1.com (DAS, résultats), Road & Track, carte circuit et classement qualif FIA 2020, données de vitesse) et dans `game/src/physics/params.ts`.

## Outils (tous gratuits / open source)
Blender 5.2 (GPL), glTF-Transform 4.5 (MIT), meshoptimizer/gltfpack (MIT), sharp/libvips (Apache-2.0/LGPL), three.js (MIT), Playwright (Apache-2.0), Python numpy/scipy/OpenCV/Pillow.
