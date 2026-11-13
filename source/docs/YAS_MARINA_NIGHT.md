# Yas Marina 2021 — scène nocturne et état d’intégration

## Résultat visuel

La scène de travail reprend le modèle 3D Yas Marina fourni et le système de coordonnées glTF du projet. L’échelle métrique a été estimée par alignement cartographique et calibrée sur la longueur FIA publiée de 5,281 km; ce n’est pas un relevé topographique. Le modèle source conserve sa géométrie.

La présentation réutilise le ciel nocturne et le kit de mâts du dépôt. Dix mâts de 36 m ont été ajoutés; leur pied est échantillonné sur le modèle par raycast, mais leur position horizontale reste une estimation visuelle. Le `.blend` embarque ses textures, un remplissage lunaire et dix caméras dédiées. Dix rendus réels de 960 × 600 ont été produits dans Blender 5.2.4. Le GLB exporté contient le circuit et les mâts; le ciel, les caméras et les lumières de prévisualisation en sont exclus.

## Préparation de scène runtime

Le GLB a été découpé avec le pipeline de tuiles existant en 13 tuiles (base et `t00`–`t11`), avec 12 variantes LOD pour les tuiles distantes. Le paquet contient 84 textures partagées, 941 219 triangles haute résolution et 385 291 triangles LOD; son poids vérifié est d’environ 38,8 MB. Les références aux buffers et textures ont toutes été vérifiées. Le nouvel outil `source/tools/lod_track_tiles.mjs` produit ces LOD sans toucher aux scripts Spa existants.

Ces tuiles sont livrées séparément dans `runtime_tiles/`; elles ne sont pas encore branchées dans le jeu. La configuration runtime ne déclare que Spa et Monza et aucun asset de surface physique Yas n’est disponible.

## Données Yas officielles vérifiées

La [carte FIA Doc 1 Abu Dhabi 2021](https://www.fia.com/sites/default/files/doc_1_-_2021_abu_dhabi_grand_prix_-_circuit_map.pdf) indique une longueur de centreline de 5,281 km, 16 virages, S1 à 205 m avant T5, S2 à 100 m avant T9, speed trap à 150 m avant T6, et les offsets DRS suivants : détection 1 à 40 m avant T5 / activation à 210 m après T5; détection 2 à 50 m après T7 / activation à 165 m après T7. Le [classement final FIA Doc 59](https://www.fia.com/sites/default/files/doc_59_-_2021_abu_dhabi_grand_prix_-_final_race_classification.pdf) donne 58 tours. Les [notes FIA Doc 4, version 2](https://www.fia.com/sites/default/files/doc_4_-_2021_abu_dhabi_grand_prix_-_race_directors_event_notes_version_2.pdf) précisent notamment les lignes et limites de piste. Les offsets ne deviennent pas des abscisses runtime `s` sans centerline validé.

## Blocage de la ligne centrale et de la physique

L’extraction conservatrice du mesh asphalté `Object_40` l’a rasterisé à environ 2 m et obtenu un graphe de 83 nœuds contractés, 103 arêtes et 21 cycles de base. Les deux plus grands cycles propres mesurés font 2 487,63 m et 2 410,95 m, pas les 5 281 m FIA; ils présentent aussi de nombreuses intersections non adjacentes et jonctions. Un candidat présente en plus un saut d’altitude de 4,825 m. La recherche exhaustive haute résolution n’a pas terminé dans le temps imparti; ce résultat n’est pas une preuve que tout chemin possible est impossible, mais aucun centerline GP 2021 ne peut être validé à partir des données actuelles.

Le maillage contient la famille de routes GP ainsi que des accès et variantes, et les choix de branches T1–T16 ne sont pas résolus. Il faut une annotation ordonnée des branches/jonctions de `Object_40`, ou un centerline/masque de route topographique aligné au modèle. Sans cela, aucune grille `surface.json`/`surface.bin`, collision Yas, voie des stands, secteurs, zones DRS ni configuration de course n’est générée ou activée. Les données de piste ou de collision Spa/Monza n’ont pas été copiées.

## Vérifications

- Blender 5.2.4 : export `.blend`/GLB et dix rendus réels.
- Tuiles runtime : 13 tuiles, 12 LOD; buffers et textures présents, aucune référence manquante.
- `node --check source/tools/lod_track_tiles.mjs` : réussi.
- `npm run build` : réussi.
- `npm run test:physics` : les huit contrôles de dynamique indépendants passent; le test s’arrête ensuite avant le tour de Spa faute de `source/game/public/track/surface.bin`.
- Yas n’est pas sélectionnable dans `source/game/src/core/circuit.ts`; aucun test de course, collision ou chrono Yas n’a été validé.

## Reproduction Blender

Depuis la racine du dépôt, utiliser Blender 5.2.4 LTS ou une version compatible :

```bash
blender --background --python source/blender/scripts/yas_render_10views.py -- \
  --blend source/blender/stages/yas_marina_2021.blend \
  --sky source/blender/assets/yas_night/sky_night_4k.webp \
  --sky-meta source/blender/assets/yas_night/sky_night.json \
  --mast source/blender/assets/yas_night/stadium_floodlight_mast.glb \
  --out-dir /tmp/yas_marina_night_views \
  --glb /tmp/yas_marina_2021_night.glb \
  --width 960 --height 600 --samples 8 --mast-count 10 \
  --sky-intensity 0.12
```

Le modèle est attribué à Dave Love / Tyler_Dave, Sketchfab, sous licence CC BY 4.0 : https://sketchfab.com/3d-models/yas-marina-circuit-abu-dhabi-2021-layout-c41b4e19912b4d79886bcd8d7d2536af .