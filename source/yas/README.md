# Yas Marina 2021 — conversion du GLB en circuit du jeu

Convertit `yas_marina_circuit_abu_dhabi_2021_layout.glb` (à placer dans CE dossier) en circuit jouable, **dans la CI, sans Blender** (job `yas_build`, même principe que `source/sepang/`). Sans GLB dans ce dossier, la CI ignore Yas Marina : rien ne change pour les autres circuits et le bouton « Circuit » ne le propose pas.

## Source et licence
« Yas Marina Circuit Abu Dhabi 2021 layout » — Dave Love (Sketchfab Tyler_Dave) — CC BY 4.0 — https://sketchfab.com/3d-models/yas-marina-circuit-abu-dhabi-2021-layout-c41b4e19912b4d79886bcd8d7d2536af
Modifications : mise à l'échelle réelle et recentrage sur la ligne de départ, découpe en tuiles, compression (meshopt, WebP), textures plafonnées, calibrage des matériaux de sol, grille de surface calculée à partir du modèle. L'herbe et le gravier réutilisent les textures de Monza (même auteur).

## Règle d'or : aucun nom de matériau n'est modifié
Les 100 matériaux d'origine s'appellent `Merged_materials`, `tentrail`, `tentrail_0` … `tentrail_97`. Le type de sol (asphalte, vibreur, peint, herbe, gravier) vient de la table `yas_tables.py` (nom → type) ; la classe visuelle et l'alias (herbe → `GRASS`, gravier → `sand_new`, palmier → `trees1_palm`) sont ajoutés dans les `extras` du glTF (`w11_class`, `w11_alias`) et appliqués en mémoire par le moteur (`renderer.ts`, `afterRoot`) : même détail de près que Monza sans toucher aux noms. En CI, `reuse_circuit_textures.mjs` remplace en plus les textures d'herbe et de gravier par celles de Monza.

## Étapes (`python3 build_yas.py <glb> <sortie>`)
1. **Physique** (`build_physics.py`, adapté de `source/sepang/`) : ligne centrale du ruban de course (`tentrail_32`) par squelette et graphe (la voie des stands et les routes de service, plus étroites, sont écartées ; le départ est à 35 % de la ligne droite des stands), mise à l'échelle pour obtenir 5 281 m, sens anti-horaire, départ vers −Z ; grille `surface.json` / `surface.bin` (5 281 stations × 361 colonnes de 0,25 m, mêmes conventions que Monza) et `grassmask.bin`.
2. **Scène** (`prep_glb.py` puis `tiles.mjs`) : calibrage PBR du sol, alias, nœud racine `w11_origin` (même transformation que la physique), puis 12 tuiles + `base` (meshopt, WebP : asphalte 1024, sols 512, reste 256 → ≈ 25 Mo de textures en mémoire GPU).
3. **Contrôles** : longueur 5 281 ± 0,5 m, aucun triangle perdu (932 090), part de chaque type de sol plausible, taille de `surface.bin`, paquet < 60 Mo.

## Particularités du fichier d'origine
- **Fichier tronqué** : il manque 18 561 octets à la fin (la texture d'horizon n° 92). `yas_core.load_glb` complète le chunk binaire ; l'horizon (`tentrail_82`) est supprimé (le ciel est celui du jeu).
- **Échelle** : le modèle est à ≈ 0,526 de l'échelle réelle (piste de ≈ 7 m de large, tour de ≈ 2 776 m) ; le facteur est calculé pour obtenir la longueur officielle de 5 281 m.
- Deux matériaux sans texture ni couleur (`Merged_materials`, `tentrail_57`, 326 000 triangles) rendraient blanc : gris neutre.

## Estimé (E) ou absent
- Estimés : classification de certains matériaux (voir `yas_tables.py`), position de la ligne de départ (voie des stands), fins de secteurs (tiers du tour) et zones DRS (ligne droite arrière, longue ligne droite côté marina) dans `circuit.ts`.
- Absents : voie des stands (`pitlane.json`), barrières précises (`barriers.bin` ; les murs viennent de la grille), public (`crowd`), commissaires, occlusion ambiante pré-calculée, LOD.
- Palmier : alias `trees1_palm` (rendu d'arbres du jeu), non validé visuellement.

## Lancer en local
```
pip install numpy scipy opencv-python-headless pillow scikit-image networkx
cd source/yas && npm install && cd ../..
python3 source/yas/build_yas.py source/yas/yas_marina_circuit_abu_dhabi_2021_layout.glb /tmp/yas_out
```
Résultat dans `/tmp/yas_out/assets/yas` et `/tmp/yas_out/track_yas`.
