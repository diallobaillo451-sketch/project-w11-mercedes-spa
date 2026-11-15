# Silverstone — source, fabrication, limites

## Source et licence
« Silverstone Circuit 2024 layout » — Dave Love (Sketchfab Tyler_Dave) — CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/)
https://sketchfab.com/3d-models/silverstone-circuit-2024-layout-bbaf4b12d5244c76998fd44f771fc0b3

Modifications : recentrage sur la ligne de départ (origine = milieu de la voie des stands, avant = -Z), découpe en tuiles, renommage des matériaux aux noms attendus par le jeu, compression des textures (WebP et KTX2), grille de surface calculée à partir du modèle. L'herbe et le gravier réutilisent les textures de Monza (même auteur) quand Monza est assemblé.

## Ce qui est dans le jeu
- Circuit : `?circuit=silverstone`. Le bouton de bascule ne le propose que si la CI a assemblé le paquet (variable VITE_SILVERSTONE=1), comme Sepang.
- Scène : 13 tuiles (1 197 030 triangles, aucun perdu), matériaux aux noms du jeu (asph, kerb_new, groove, GRASS, sand_new, trees1_2022, fences, concrete-barrie-raw), textures WebP + KTX2.
- Physique : `surface.json` + `surface.bin` (5 906 stations de 1 m × 361 colonnes de 0,25 m, mêmes conventions que Monza), sens horaire. Longueur 5 905,6 m (officiel : 5 891 m).
- Ligne centrale : tracée sur les marques de gomme du modèle (matériaux groove*), puis recentrée sur la chaussée.

## Estimé ou absent
- Estimés : position de la ligne de départ, fins de secteurs (1 750 m et 4 500 m), zones DRS (Wellington Straight, ligne droite des stands).
- Absents : voie des stands (pitlane.json), barrières précises (barriers.bin ; les murs viennent de la grille), herbe 3D (grassmask.bin), public (crowd), commissaires, occlusion ambiante pré-calculée, variantes LOD.
- Arbres : ils gardent l'atlas de textures de Silverstone (la mise en page UV diffère de Monza) avec le rendu d'arbres du jeu.

## Publication
Le paquet `silverstone_pack.tar` (scene/, track/, tools/) est stocké sur la branche `silverstone-assets` (dossier `shared/silverstone/`), comme Monza sur `newbot-shared`. La CI le récupère, vérifie son empreinte SHA-256 (`shared/silverstone/silverstone_pack.sha256`), l'assemble dans public/ et active VITE_SILVERSTONE. Les scripts de fabrication sont dans le paquet (dossier tools/).

## À vérifier avant de dire « publié »
Test navigateur (`CIRCUIT=silverstone node tests/app.mjs`, job `silverstone_app_test`), tour de démo chronométré, essai sur iPhone.
