# Yas Marina 2021 — scène nocturne et état d’intégration

## Résultat visuel

La scène de travail reprend le modèle 3D Yas Marina fourni et le système de coordonnées glTF du projet. L’échelle métrique a été estimée par alignement cartographique et calibrée sur la longueur FIA publiée de 5,281 km; ce n’est pas un relevé topographique. Le modèle source conserve sa géométrie.

La présentation réutilise le ciel nocturne et le kit de mâts du dépôt. Dix mâts de 36 m ont été ajoutés; leur pied est échantillonné sur le modèle par raycast, mais leur position horizontale reste une estimation visuelle. Le `.blend` embarque ses textures, un remplissage lunaire et dix caméras dédiées. Dix rendus réels de 960 × 600 ont été produits dans Blender 5.2.4. Le GLB exporté contient le circuit et les mâts; le ciel, les caméras et les lumières de prévisualisation en sont exclus.

## Préparation de scène runtime

Le GLB a été découpé avec le pipeline de tuiles existant en 13 tuiles (base et `t00`–`t11`), avec 12 variantes LOD pour les tuiles distantes. Le paquet contient 84 textures partagées, 941 219 triangles haute résolution et 385 291 triangles LOD; son poids vérifié est d’environ 38,8 MB. Les références aux buffers et textures ont toutes été vérifiées. Le nouvel outil `source/tools/lod_track_tiles.mjs` produit ces LOD sans toucher aux scripts Spa existants.

Les tuiles sont maintenant copiées dans `source/game/public/assets/yas_marina/` et branchées au renderer avec le panorama nocturne Yas. Les données physiques sont rangées séparément dans `source/game/public/track_yas/`; la sélection runtime et l’épreuve Abu Dhabi utilisent Yas, sans exposer Monza tant que ses assets ne sont pas livrés.

## Données Yas officielles vérifiées

La [carte FIA Doc 1 Abu Dhabi 2021](https://www.fia.com/sites/default/files/doc_1_-_2021_abu_dhabi_grand_prix_-_circuit_map.pdf) indique une longueur de centreline de 5,281 km, 16 virages, S1 à 205 m avant T5, S2 à 100 m avant T9, speed trap à 150 m avant T6, et les offsets DRS suivants : détection 1 à 40 m avant T5 / activation à 210 m après T5; détection 2 à 50 m après T7 / activation à 165 m après T7. Le [classement final FIA Doc 59](https://www.fia.com/sites/default/files/doc_59_-_2021_abu_dhabi_grand_prix_-_final_race_classification.pdf) donne 58 tours. Les [notes FIA Doc 4, version 2](https://www.fia.com/sites/default/files/doc_4_-_2021_abu_dhabi_grand_prix_-_race_directors_event_notes_version_2.pdf) précisent notamment les lignes et limites de piste. Les offsets ne deviennent pas des abscisses runtime `s` sans centerline validé.

## Centerline et physique Yas (estimés, non officiels)

Le centerline runtime est une digitalisation du plan FIA 2021 recalée sur le modèle Yas fourni; le sens croissant part de la ligne départ/arrivée vers T1. La version finale contient 3 882 points, un pas d’environ 1,373 m et une longueur de 5 329,52 m, soit +0,92 % par rapport aux 5 281 m FIA. La géométrie de course est estimée, pas officielle. Le raccord T9 existant reste contraint à la chaussée Yas `Object_40`; le secteur T5 a maintenant un bypass Yas-only entre les indices sources 960–1020, lissé et raccordé au tracé. Son rayon local minimal calculé est d’environ 7,16 m. Cette correction évite le spur FIA-vers-mesh qui envoyait l’IA hors chaussée.

Le bake physique Blender 5.2.4 utilise la couche `Object_40` seule pour éviter de basculer entre niveaux superposés. Il ray-cast 3 775/3 882 stations (97,24 %); les 107 stations manquantes sont interpolées périodiquement et reçoivent un corridor central pavé estimé de ±4 m. La plus longue lacune est de 22 stations; le plus grand pas de hauteur adjacent après interpolation est 0,378 m. La grille fait 3 882 × 361 cellules (1,373 m longitudinalement, 0,25 m latéralement) et `surface.bin` code 287 810 cellules ray-castées/estimées en type chaussée et 1 113 592 cellules de repli type 4. Le centre de grille est asphalté à 100 %, avec les trous explicitement estimés. Les collisions comprennent 14 953 segments issus des faces verticales Yas portant les matériaux `tentrail`, avec 34 510 références dans 2 273 cellules spatiales. Aucune donnée physique Spa/Monza n’est reprise.

La pitlane est une trajectoire estimée de 678,5 m sur 331 points. Le chemin lissé couvre 81,27 % des cellules chaussées de la couche `Object_40` sélectionnée; le corridor à offset fixe ne couvre que 73,60 %, raison pour laquelle le générateur choisit un chemin variable plutôt qu’un offset constant. La limitation de stand de 80 km/h vient de la référence FIA; ses abscisses estimées sont s≈5 083,83 m à l’entrée et 400,16 m à la sortie, et la géométrie reste non officielle. Les deux zones DRS sont reprojetées depuis les offsets FIA sur le centerline final : environ 1 648–2 527 m et 2 906–3 684 m. Les secteurs sont estimés à 1 248 m et 3 734 m.

Le T1 et le secteur T5 corrigé passent maintenant le test de tour complet. Au dernier passage, le pilote automatique boucle en 2:16,635; 362/33 197 pas (1,09 %) sont signalés hors piste, avec 0 pas ayant un impact supérieur à 0,2. La vitesse maximale enregistrée est de 308,7 km/h. Le test accepte ce résultat; il s’agit d’une simulation interne, pas d’un temps officiel ni d’une validation FIA.

## Vérifications

- Blender 5.2.4 : scène `.blend`, GLB et dix rendus réels présents dans le paquet visuel.
- Tuiles runtime : 13 tuiles, 12 LOD; buffers et textures vérifiés et branchés dans le renderer.
- `node --check source/tools/lod_track_tiles.mjs` : réussi.
- `npm run build` : réussi après la promotion des actifs Yas corrigés et le correctif de démarrage.
- `npm run test:physics` : tous les contrôles passent, dont le tour IA Yas complet, les barrières, pitlane, DRS/secteurs et l’index de départ. 0 pas avec impact supérieur à 0,2; 362 pas hors piste sur 33 197. Spa est sauté car ses fichiers physiques locaux sont absents; aucune donnée Spa/Monza n’est substituée à Yas.
- Smoke test Playwright : menu Yas sélectionnable, démarrage d’une course rapide, HUD actif, 13 tuiles au manifeste (6 chargées au départ) et commande clavier ArrowUp faisant avancer la voiture. Le navigateur a aussi émis 13 erreurs `EncodingError: Unable to decode audio data`; elles n’ont pas bloqué l’entrée en piste ni la conduite, mais restent un avertissement hors circuit.
- Le démarrage Yas ignore maintenant les fichiers facultatifs de foule/herbe absents ou invalides au lieu d’interpréter le fallback HTML comme des données binaires. Le GLB W11 haute qualité déjà présent dans le projet source a été décodé et placé dans le répertoire public du jeu pour satisfaire son chargement initial; ce n’est pas une donnée géométrique de Yas.
- Le centerline, la surface, la pitlane, les zones DRS et les secteurs restent explicitement estimés/non officiels, sauf les paramètres publiés FIA cités plus haut.

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
