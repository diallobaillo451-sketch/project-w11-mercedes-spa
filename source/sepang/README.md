# Sepang International Circuit

Conversion du modèle 3D « Sepang International Circuit 2025 layout » (Dave Love, Sketchfab, CC BY 4.0) en circuit du jeu.

## Ce qu'il faut déposer ici

Le fichier `sepang_international_circuit_2025_layout.glb` (42 Mo) dans CE dossier (`source/sepang/`). Sans lui, l'étape CI `sepang_build` ne vérifie que la syntaxe des scripts, Sepang n'est pas assemblé et Spa, Monza et Barcelone ne sont pas touchés.

## Ce que fait la CI (`sepang_build`, image python:3.12)

`python3 source/sepang/build_sepang.py <glb> public_sepang` produit :

- `track_sepang/surface.json` + `surface.bin` : grille physique (s, d) au format de `source/game/src/track/surface.ts` (N × 361 cellules, pas de 0,25 m, hauteur relative au centre en cm sur 13 bits + type sur 3 bits) ;
- `track_sepang/grassmask.bin` : herbe 3D ;
- `assets/sepang/tiles.json` + `base.gltf` + `base.bin` : scène (une seule tuile « base » chargée avant le départ, `hasLods: false`) ;
- `assets/sepang/tex/ktx2.json` : manifeste vide, car les 97 images WebP sont intégrées en `bufferView` dans `base.bin`. Il permet de garder KTX2 actif pour la W11 compressée sur mobile, sans chercher de variantes KTX2 pour les textures de piste ;
- `assets/sepang/CREDITS.txt` : attribution CC BY 4.0.

Puis `.assemble` copie le tout dans `public/` (ligne « SEPANG OK » dans le journal) et construit le jeu avec `VITE_SEPANG=1`, ce qui ajoute Sepang au bouton de bascule des circuits (`?circuit=sepang` marche toujours).

Le manifeste KTX2 vide est intentionnel : un index de textures de piste absent ne doit pas faire désactiver KTX2 pour les autres assets, notamment la voiture (sinon son chargement WebP peut provoquer un pic de mémoire GPU sur téléphone).

## Règle d'or : aucun nom de matériau n'est modifié

Les matériaux du modèle s'appellent `Sepang691Mtl`, `Sepang691Mtl_0`… et restent tels quels dans `base.gltf`.
La physique herbe / gravier vient d'une table explicite indice de matériau → type (`sepang_tables.py`), jamais d'un renommage.
La classe visuelle (`extras.w11_class`) et un alias d'exécution (`extras.w11_alias` : herbe → `GRASS`, gravier → `sand_new`) sont AJOUTÉS en `extras` ;
`tileLoader()` (renderer.ts) applique l'alias en mémoire pour que l'herbe et le gravier de Sepang reçoivent le même traitement (détails de proche) que ceux de Monza.

## Types de surface (3 bits)

0 vide · 1 asphalte · 2 vibreur · 3 tapis (dégagement peint) · 4 herbe · 5 gravier · 6 eau · 7 mur.

## Vérifications faites sur le modèle d'origine (script exécuté sur le vrai GLB)

- longueur de la ligne centrale 5 542,3 m (officiel 5 543 m) ; ligne droite des stands ≈ 873 m ;
- largeur de piste moyenne 16,2 m ; dénivelé de 22 m ;
- sens de course (horaire en vue de dessus) et ligne de départ déduits de la grille, des panneaux 150/100/50 et du damier ;
- `s = 0` sur la ligne de départ, origine du monde sur la ligne de départ ;
- scène : 444 303 triangles, 97 textures (~29 Mo de mémoire GPU), glTF validé par le validateur Khronos (0 erreur).

Secteurs, fins de zones DRS et limitation des stands de `circuit.ts` sont des estimations déduites de la ligne centrale (marquées « E »), pas des relevés officiels.

## Relation avec `source/tools/circuit_pipeline`

Ce convertisseur est indépendant du pipeline Blender (il n'utilise que numpy/scipy/opencv/Pillow). Son extraction de la physique (ligne centrale, largeurs, types de sol, murs) part du GLB brut avec une table de matériaux explicite : elle peut servir de base pour d'autres circuits dont on ne possède que le modèle visuel.

## Pas encore fait

Voie des stands (`pitlane.json`), barrières réelles (`barriers.bin`), public (`crowd.bin`), commissaires, tuiles + LOD (la scène est une seule tuile de 35 Mo), validation visuelle et essai de course en jeu.
