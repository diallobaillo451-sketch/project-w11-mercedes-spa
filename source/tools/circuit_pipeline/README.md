# Pipeline de préparation des circuits

Le pipeline réutilise les outils génériques d’import, de tuilage et d’optimisation déjà employés pour Spa/Monza. Il conserve les coordonnées propres à chaque circuit et ne modifie pas le GLB source.

## Préparer les tuiles 3D

```bash
npm ci --prefix source/game
python3 source/tools/circuit_pipeline/cli.py \
  --config source/tools/circuit_pipeline/configs/barcelona-catalunya.json \
  --source /chemin/vers/barcelona-catalunya_grand_prix_2023_layout.glb \
  --output-dir /chemin/vers/work/barcelona-catalunya \
  --build-tiles
```

Blender est choisi depuis `--blender`, puis `BLENDER_BIN`, puis `PATH`. Le dossier de sortie contient le rapport Blender, le manifeste, le GLB de contrôle et, avec `--build-tiles`, les tuiles spatiales et leurs textures WebP. `--inspect-only` inventorie sans exporter; `--force` reconstruit au lieu d’utiliser le cache. Le cache des tuiles dépend du GLB exporté, du constructeur, du nombre de tuiles, de la qualité WebP et des règles alpha.

Quand les tuiles sont activées, le CLI génère aussi les fichiers `_lod.gltf`/`.bin` avec `source/game/tools/make_track_lods.mjs`. Le profil par défaut cible 35 % des triangles, avec une erreur maximale de 1 cm; les matériaux de chaussée, lignes, vibreurs et surfaces de sécurité sont protégés, et les bords de tuile sont verrouillés. Le cache LOD est distinct du cache de tuilage.

## Générer la physique de Barcelone

Le worker projette les positions OpenF1 sur les meshes d’asphalte du GLB, mesure les largeurs, puis fabrique le centreline et la grille consommés par le runtime :

```bash
blender -b --factory-startup \
  --python source/tools/circuit_pipeline/barcelona_gameplay_blender.py -- \
  /chemin/vers/barcelona-catalunya_grand_prix_2023_layout.glb \
  source/tools/circuit_pipeline/data/barcelona_2023_lap61_fit.json \
  /chemin/vers/work/barcelona-catalunya/gameplay
```

Le fichier de référence contient 295 points du tour 61 de Max Verstappen au GP d’Espagne 2023, filtrés sur l’intervalle exact du tour et recalés sur l’asphalte du GLB. Ce sont des positions de course approximatives, pas un relevé topographique ni un centreline homologué. Sources et limites : [références des données de Barcelone](../../docs/BARCELONA_GAMEPLAY_SOURCES.md).

Le bake produit un tour de 4 668,6 m avec une maille longitudinale d’environ 1 m et une maille latérale de 0,25 m. 4 439 des 4 669 stations touchent directement le mesh d’asphalte; les autres sont réparées à l’intérieur du corridor mesuré ou de la largeur de repli. La grille comporte 1 685 509 cellules (3 371 018 octets).

## Générer les textures GPU et empaqueter

La conversion KTX2 est optionnelle : les navigateurs utilisent WebP en repli. Les LOD partagent les mêmes images; aucun doublon de texture GPU n’est créé. Pour produire les textures KTX2 UASTC et le manifeste chargés par le renderer, utiliser Pillow et KTX-Software 4.4.2+ :

```bash
python3 source/tools/circuit_pipeline/make_track_ktx2.py \
  --tiles /chemin/vers/work/barcelona-catalunya/tiles \
  --ktx /chemin/vers/ktx/bin/ktx
python3 source/tools/circuit_pipeline/package_barcelona.py \
  --tiles /chemin/vers/work/barcelona-catalunya/tiles \
  --gameplay /chemin/vers/work/barcelona-catalunya/gameplay
```

Le convertisseur est incrémental : il compare les empreintes SHA-256 WebP et ne refait que les images modifiées. Pour Barcelone, il a produit 115 KTX2 pour 27,2 MB; les variantes WebP restent installées. Le paquetiseur copie les ressources brutes dans `source/game/public/`, encode les fichiers publiés pour la CI, crée les parties Base64 nécessaires aux binaires les plus lourds et actualise `SHA256SUMS`.

## Intégration runtime

Le circuit est déclaré dans `source/game/src/core/circuit.ts`; son rendu charge `./assets/barcelona/` et sa physique `./track_barcelona/`. Le bouton du menu parcourt Spa → Monza → Barcelone; `?circuit=barcelona` sélectionne directement la piste et le nom de la piste s’affiche à l’écran de démarrage. Les indicateurs de présence désactivent les requêtes pour les barrières, la pitlane, l’herbe 3D et les tribunes absentes.

Les scripts et formats de Spa sont réutilisés, mais pas ses coordonnées de circuit. Le GLB ne fournit pas de mesh de terrain physique utilisable près de la piste : les cellules d’herbe sont donc un repli plat à la hauteur du centreline. Il n’y a pas de géométrie de barrières propre à Barcelone; les murs virtuels sont à 25 m du centreline. Aucune voie des stands distincte n’est fournie par le GLB; l’entrée/sortie, les limites de vitesse et les postes de commissaires restent désactivés faute de données vérifiées. Les portes de secteurs sont estimées à partir des temps de secteur OpenF1; les zones DRS sont approximées depuis les portions droites et ne sont pas des coordonnées officielles.

Le GLB source d’environ 107 MB n’est pas ajouté au dépôt. Les parties Base64 des assets sont réassemblées et vérifiées par `.gitlab-ci.yml` selon `SHA256SUMS`.

## Vérifications et statut

```bash
python3 -m unittest discover -s source/tools/circuit_pipeline -p 'test_*.py' -v
node --check source/tools/build_track_tiles.mjs
node --check source/game/tools/make_track_lods.mjs
npx tsc --noEmit
npm run build
npm run test:physics
CIRCUIT=barcelona node tests/app.mjs http://127.0.0.1:5199/
git diff --check
```

Ne pas déclarer la piste publiée avant d’avoir vérifié le build, le test navigateur et le pipeline de publication. Ne remplacer aucun asset Spa/Monza.
