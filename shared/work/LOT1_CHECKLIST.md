# Lot 1 circuits — checklist (branche `ty/lot1-circuits`)

MR **Draft** vers `main` : https://gitlab.com/issagabah451/project-w11-mercedes-spa/-/merge_requests/2
Ne pas merger, ne pas pousser `main`. Revue Eko à la fin du lot.

## Kit de pièces (`shared/assets/kit_pieces/`)

- [x] Inventaire et `SOURCES.md` (licences Sketchfab CC BY 4.0 / pack Spa / Poly Haven CC0)
- [x] Copies Spa : feux de sortie, muret, garages, textures équipes, panneaux commissaires, plateformes, brake boards, PNJ + tenues, crics, écrans, feux de case
- [x] Unités Bahreïn détachées : feux de départ 5×4, feux de sortie (canonique), panneaux `marshal_1` / `_2`
- [x] Ciel de nuit `public/assets/sky/sky_night_*` (Poly Haven `qwantani_night`, CC0) — json poussé ; webp/ktx2 commités en LFS en local (`70dcdab`), push Git bloqué (voir ci-dessous)
- [x] Mât / projecteurs de nuit (création Blender unique) — `stadium_floodlight_mast.glb` (36 m, 3×6, 3862 tris), dans le même commit LFS local
- [x] Extractions Imola / Silverstone / Nürburgring / Monza (premier passage, par matériau)
- [ ] Découpage par instance / objet (le premier passage fusionne toutes les occurrences d’un matériau)
- [ ] Classement feux rouges / verts Imola et Nürburgring (voie / case / départ) une fois projetés sur la ligne centrale
- [ ] Panneau **80 km/h** : confirmé absent des sources (Imola `pitsign` = 50 km/h). Une création Blender unique reste à faire, puis pose à l’entrée de voie (`pit_speed_start`)
- [x] Clips NPC : réutilisation du pack Spa (pas de nouvelle animation IA)

## Voie des stands complète (chaque circuit du lot 1)

Qualité maximale, calée sur Spa et Bahreïn, réalisée en Blender (scripts réutilisables). Pas seulement les garages.

- [ ] Entrée de voie : ligne de début de limitation + panneaux 80 km/h (`pit_entry`, `pit_speed_start`, alias `anchor_pit_entry`)
- [ ] Voie rapide et voie de travail marquées au sol
- [ ] 10 garages, devantures aux couleurs 2020, sponsors et noms des pilotes
- [ ] Cases peintes au sol avec logos d’équipe (`pit_stop_box_ground` Meshy + textures)
- [ ] Portiques et panneaux d’équipe au-dessus des cases
- [ ] Muret des stands avec ingénieurs (tenues 2020, clips `pitwall_*`)
- [ ] Ligne de fin de limitation (`pit_speed_end`)
- [ ] Sortie : feu rouge / vert + ligne blanche (`pit_exit_light`, `pit_exit`, alias `anchor_pit_exit_light`, `anchor_pit_exit`)
- [ ] Équipement de case (pneus, couvertures, outils), caméras, éclairage
- [ ] `anchors.json` : noms existants conservés, nouveaux noms en **alias** (`pit_entry`, `pit_speed_start`, `pit_speed_end`, `pit_exit_light`, `pit_exit`)
- [ ] Spline `pitlane_path` : points ordonnés, largeur de voie, offsets voie rapide / voie de travail, points d’arrêt par équipe

## Inventaire Meshy (`shared/work/MESHY_INVENTORY.md`)

- [x] Inventaire initial des 29 props `spa_pits/props/` + nœuds du garage joueur + PNJ
- [ ] Optimisation Blender (retopo/décimation, LOD, KTX2/WebP, instancing) — priorité `pit_board` (113 k tris) et `telemetry_station` (69 k tris)
- [ ] Placement réaliste dans **chaque case** et le long de la voie, tenues 2020, sur Bahreïn / Monza / Imola
- [ ] Aucun asset laissé inutilisé (les quatre autrefois « non utilisés » — coque, foule tribunes, éclairage plafond, marquage au sol — ont un emplacement prévu dans l’inventaire)
- [ ] Colonnes « après optimisation » et chemins de pose remplis au fil de l’eau

## Circuits

- [ ] **Imola `emi`** — conversion complète (`a1` : `t1_raw.blend` existe), `track/`, kit, pit lane, ancres, visuels pluie, captures
- [ ] **Bahreïn `bhr`** — régénérer les textures de scène incomplètes, générer `track/`, nuit, kit, pit lane, captures nuit
- [ ] **Monza `ita`** — comparer repo vs nouveau GLB, feux de départ FIA, commissaires, boards, kit, pit lane, visuels pluie, captures
- [x] **Spa** — pas de greffe des feux de sortie : déjà présents dans `spa_pits` / `pits.json`. Conservé tel quel

## Publication / revue

- [x] Branche `ty/lot1-circuits` sur GitLab (depuis `main`)
- [x] Draft MR ouverte (cette checklist est mise à jour à chaque étape)
- [ ] Push LFS des binaires (`70dcdab`) — **bloqué** : le `GITLAB_TOKEN` fourni est un jeton classique `glpat` ; GitLab exige un *fine-grained* PAT avec `Code: Push` pour `git push` (l’API projet répond pourtant en Maintainer, niveau 50). Le connecteur MCP reste utilisable pour le texte, pas pour les GLB/KTX2 (il écrirait du base64 en clair).
- [ ] Captures `/workspace/f1qa/lot1/` et chiffres de perf
- [ ] Rapport § 9 (français)
- [ ] STOP pour revue Eko — pas de lot 2
