# Marina Bay (Singapour, de nuit) — du modèle 3D au circuit jouable

Le circuit est fabriqué par la CI (job `marina_build`) à partir du modèle 3D déposé dans ce dossier. Tout est en Python
(numpy, scipy, OpenCV, Pillow) : Blender n'est pas utilisé.

## Déposer le modèle (une fois)

Le modèle fait 59,5 Mo : il ne passe pas par l'API, il faut le déposer à la main.

1. GitLab → *Code* → *Repository* → branche `claude/marina-bay` → dossier `source/marina/` → bouton **+** → *Upload file*.
2. Envoyer `marina_bay_street_circuit_6.glb.001`, `.002` et `.003` (ou le `.glb` entier).
3. La CI recolle les morceaux dans l'ordre, convertit, puis assemble le jeu avec Marina Bay. Sans modèle dans le dossier, le job
   ne vérifie que la syntaxe des scripts et le circuit n'est pas proposé.

Dans le jeu : `?circuit=marina` (le bouton de bascule de circuit le propose dès que la CI l'a assemblé, variable `VITE_MARINA=1`).

## Ce que la CI génère (`python3 build_marina.py <modele.glb> <sortie> [--hdr ciel.hdr]`)

| Sortie | Contenu |
|---|---|
| `track_marina/surface.json`, `surface.bin` | physique : 5 023 stations d'1 m × 361 cellules de 0,25 m (asphalte, vibreur, peinture, herbe, gravier, mur), mêmes conventions que les autres circuits |
| `track_marina/grassmask.bin` | herbe 3D en bord de piste |
| `track_marina/lamps.json` | 588 têtes de lampadaires extraites du modèle (halos et lumières de nuit) |
| `assets/marina/tiles.json`, `base.gltf`, `t00…t12` | scène 3D découpée en tuiles (≈ 810 000 triangles) + `tex/*.webp` partagées |
| `assets/marina/sky/` | ciel de nuit (`sky.json`, `sky_4k.webp`, `sky_2k.webp`) au format de `skydome.ts` |
| `assets/marina/CREDITS.txt` | attributions |

## Règle d'or : les noms de matériaux ne changent jamais

La physique herbe / gravier du jeu ne dépend **pas** des noms (elle vient de `surface.bin`, calculé par les tables de
`marina_tables.py`), et les noms d'origine (`11001Mtl_14`…) restent dans le glTF : `build_marina.py` échoue si un nom diffère du modèle.
Pour que l'herbe, le gravier et les arbres aient le rendu de Monza (détail de proche, usure, vent des feuillages), chaque matériau porte
`extras.w11_alias` (`GRASS`, `sand_new`, `trees1`, `bushesB`) que `renderer.ts` applique à l'exécution, après le chargement.

## Nuit

- Ciel : HDRI réel « Moonless Golf » (Poly Haven, CC0), horizon remplacé par un halo de ville, étoiles ajoutées ; la lune est le disque
  analytique du dôme et donne la direction de la lumière directionnelle. Sans HDRI (hors ligne) : ciel entièrement procédural.
- Circuit lumineux : émission ajoutée aux matériaux (`NIGHT_EMISSIVE` dans `marina_tables.py`, sans texture en plus), halos additifs sur
  les 588 lampadaires et 6 vraies lumières (3 sur mobile, 0 en qualité basse) posées sur les lampadaires les plus proches de la voiture
  (`src/render/night.ts`). `?lamps=0` coupe halos et lumières pour comparer.
- Réglages : objet `night` de Marina dans `src/core/circuit.ts` ; chacun reste surchargeable par l'URL (`?exp= ?sun= ?env= ?hemi= ?skyI= ?fog= ?moonDisk=`).
- Les paramètres PBR de la surcouche de gomme du modèle (métal 1, rugosité 0 = miroir) sont corrigés (`PBR_FIX`), le nom ne change pas.

## Source et licences

- Modèle : « Marina Bay Street Circuit » — Dave Bored SketchFab (https://sketchfab.com/Tyler_Dave), CC BY 4.0
  (http://creativecommons.org/licenses/by/4.0/) — https://sketchfab.com/3d-models/marina-bay-street-circuit-e665d831c57546609d4c15287a6107b7
  Modifications : recentrage sur la ligne de départ, découpe en tuiles, regroupement par matériau, textures converties en WebP,
  cartes à découpe en `alphaMode MASK`, émission de nuit, suppression du fond de ville photographié de jour et de la géométrie de collision invisible.
- Ciel : « Moonless Golf » — Greg Zaal, Poly Haven, CC0 (https://polyhaven.com/a/moonless_golf), téléchargé par la CI (empreinte SHA-256 vérifiée).

## Limites connues

- Pas de voie des stands (`pitlane.json`), pas de barrières précises (`barriers.bin` : les murs viennent de la grille de surface), pas de public 3D
  (`crowd.bin`), pas de commissaires, pas d'occlusion ambiante précalculée, pas de LOD.
- Ligne de départ, fins de secteurs (1 600 m et 3 350 m) et zones DRS (3 plus longues lignes droites) **estimées** sur la ligne centrale de 5 022,6 m
  (sens antihoraire) : à ajuster dans `circuit.ts`. Aucune donnée officielle FIA.
- L'éclairage de nuit a été réglé dans un banc d'essai three.js 0.187 (mêmes lumières, même dôme, même chaîne HDR que le jeu) et pas dans le jeu complet :
  à ajuster en conditions réelles (voiture, GTAO, météo) avec les paramètres d'URL ci-dessus.

## Test dans la CI

`marina_app_test` (branches « marina » seulement, non bloquant) lance le vrai jeu dans Chrome (rendu logiciel) sur `?circuit=marina` : grille physique,
tuiles, commandes tactiles, tour de démo chronométré, captures dans les artefacts. `shotstats.py` imprime dans le journal la luminance de ces captures
(moyenne, percentiles, pixels écrasés / brûlés, vignette ASCII) pour juger l'exposition de nuit sans voir les images.

## En local

```
pip install numpy scipy opencv-python-headless pillow
cat marina_bay_street_circuit_6.glb.00? > marina.glb
python3 source/marina/build_marina.py marina.glb sortie --hdr moonless_golf_1k.hdr
```
Durée ≈ 10 s, ≈ 1 Go de mémoire. Résultat déterministe.
