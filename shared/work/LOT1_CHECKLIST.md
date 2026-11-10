# Lot 1 circuits — checklist (branche `ty/lot1-circuits`)

MR **Draft** vers `main`. Ne pas merger, ne pas pousser `main`. Revue Eko à la fin du lot.

## Kit de pièces (`shared/assets/kit_pieces/`)

- [x] Inventaire et `SOURCES.md` (licences Sketchfab CC BY 4.0 / pack Spa / Poly Haven CC0)
- [x] Copies Spa : feux de sortie, muret, garages, textures équipes, panneaux commissaires, plateformes, brake boards, PNJ + tenues, crics, écrans, feux de case
- [x] Unités Bahreïn déjà détachées : feux de départ 5×4, feux de sortie (canonique), panneaux `marshal_1` / `_2`
- [x] Ciel de nuit `public/assets/sky/sky_night_*` (Poly Haven `qwantani_night`, CC0) — json prêt ; textures webp/ktx2 en attente de push binaire
- [x] Mât / projecteurs de nuit (création Blender unique, liste fermée) — `stadium_floodlight_mast.glb` (36 m, 3×6, 3862 tris)
- [x] Extractions Imola / Silverstone / Nürburgring / Monza (premier passage, par matériau)
- [ ] Découpage par instance / objet (le premier passage fusionne toutes les occurrences d’un matériau — trop large pour l’instanciation)
- [ ] Classement feux rouges / verts Imola et Nürburgring (voie / case / départ) une fois projetés sur la ligne centrale
- [ ] Panneau **80 km/h** : confirmé absent (Imola `pitsign` = 50 km/h ; Silverstone `distanz` = flèches ; Nürburgring = 200/100). Une création Blender unique reste à faire
- [x] Clips NPC : réutilisation du pack Spa (pas de nouvelle animation, pas de génération IA)

## Circuits

- [ ] **Imola `emi`** — conversion complète (a1 déjà lancé : `t1_raw.blend`), `track/`, kit, ancres, visuels pluie, captures
- [ ] **Bahreïn `bhr`** — régénérer textures scène incomplètes, générer `track/`, nuit (ciel, mâts, lightmaps, ≤ 4 lights), kit, captures nuit
- [ ] **Monza `ita`** — comparer repo vs nouveau GLB, conserver le meilleur, feux de départ FIA, commissaires, boards, kit, visuels pluie, captures
- [x] **Spa** — pas de greffe des feux de sortie : le pack `spa_pits` les a déjà, placés dans `pits.json` (s = 195 / 949 selon doc). Conservé tel quel

## Publication / revue

- [ ] Branche `ty/lot1-circuits` sur GitLab (créée depuis `main`)
- [ ] Draft MR ouverte, cette checklist à jour
- [ ] Captures `/workspace/f1qa/lot1/` et chiffres de perf
- [ ] Rapport § 9 (français)
- [ ] STOP pour revue Eko — pas de lot 2
