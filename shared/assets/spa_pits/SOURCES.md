# Spa — stands, PNJ et bord de piste : sources et licences

## Modèles 3D
- **Props Meshy AI** (28 assets `Meshy_AI_f1_*`, voir `incoming/props/INVENTAIRE.md`) : générés avec Meshy AI et soumis à ses **conditions d'utilisation** (https://www.meshy.ai/terms-of-use). Pas d'attribution requise. Vérifier les droits commerciaux Meshy avant toute diffusion publique payante.
- **MacBook Pro M3 16"** par **jackbaeten** (https://sketchfab.com/jackbaeten), source https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4, licence **CC BY 4.0** (http://creativecommons.org/licenses/by/4.0/).
  Modifications : logo du capot supprimé, fond d'écran remplacé par un écran de télémétrie W11, inscription remplacée, décimation, KTX2.
- **PC in Apple iMac Style** par **ISUS** (https://sketchfab.com/ISUS41), source https://sketchfab.com/3d-models/pc-in-apple-imac-style-df8163b56ada446fbfac3a9d43ea5256, licence **CC BY 4.0**.
  Modifications : logos et inscriptions supprimés, décimation, KTX2.
- **Circuit de Spa** (repère, portes `box-door`, poteaux `digitalflag_pole`, cabines `marshal-post`) : modèle du jeu W11 (voir `assets/spa` et ses SOURCES). On n'en redistribue rien : on lit seulement les positions.
- Panneaux de distance : **modélisés ici** (procédural Blender). Les `panels_dist` du Nürburgring (Dave Love, CC BY 4.0) ont été examinés mais pas repris : texture 256 px, seulement 200/100.
- Lampes LED, plateformes de commissaires, garages, stands du muret (auvents), marquages : procéduraux, créés pour W11 (pas de licence tierce).

## Données
- Implantation des stands : **OpenStreetMap** © contributeurs OpenStreetMap, **ODbL 1.0** (https://www.openstreetmap.org/copyright), recoupé avec la géométrie du modèle (42 portes mesurées).
- Garages par équipe 2020 et organisation : voir `RECHERCHE_GARAGE.md` (sources publiques citées ; attribution exacte des numéros ⚠️ estimée).

## Visuels et marques
- Aucun logo officiel. Les noms d'équipes et de sponsors sont recréés en **texte simple** (police Barlow Condensed, **SIL OFL 1.1**, Google Fonts) et en aplats de couleur.
- Portraits pilotes : stylisés (buste dessiné + casque issu des vignettes du projet W11 `game/public/drivers/thumb` + numéro et nom). Aucune photo.
- Tenues PNJ : albedos Meshy recolorés par zone, avec texte poitrine et dos généré.
- Marque rouge type « F1 » de la tour de chronométrage Meshy, logo Apple du MacBook et inscriptions Apple de l'iMac : supprimés.

## Outils
Blender 5.2, gltf-transform 4 + meshoptimizer + sharp, KTX-Software 4.4.2 (UASTC q2 + zstd 18), Python (Pillow, numpy, scipy).
Les scripts sont copiés et adaptés dans `/workspace/w11-shared/work/spa_pits/` ; `/workspace/w11` n'a pas été modifié.
