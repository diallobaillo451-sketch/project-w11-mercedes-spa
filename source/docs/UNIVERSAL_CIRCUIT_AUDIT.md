# Audit universel des circuits — état au 13 novembre 2026

## 1. Périmètre et règle de lecture

Cet audit consolide les résultats disponibles pour Spa-Francorchamps, Monza, Yas Marina, Interlagos, Bahreïn et Sepang. La référence d’intégration est `origin/main` au commit `88eb26c`.

**Important : `main` ne doit pas être confondu avec les branches non fusionnées, les branches de travail, les dumps d’assets partagés, ni les commits dont le contenu a été révoqué.** Une présence sur `origin/ty/lot1-circuits`, `origin/newbot-shared`, `origin/feature/interlagos`, `origin/claude/sepang` ou une ancienne branche Yas/Monza ne constitue donc pas une capacité publiée de `main`. De même, un commit historique peut fournir une preuve de ce qui a existé sans décrire l’état courant.

L’audit est strictement borné aux données fournies. Toute information absente est signalée comme non démontrée plutôt que déduite.

## 2. Synthèse exécutive

`origin/main@88eb26c` publie réellement Spa et intègre le code runtime Monza, dont les assets lourds sont assemblés par CI depuis `origin/newbot-shared`. Spa est le seul circuit disposant dans `main` d’un ensemble intégré et documenté comprenant scène, surface, collisions, ligne de course, météo/physique, DRS, stands, garages, PNJ et tests déclarés. Monza est intégré côté code et prévu pour un assemblage CI, mais n’est pas autonome dans le checkout local et ne possède plus son test de démarrage dédié.

Yas Marina n’est pas intégré : son intégration historique a été explicitement révoquée. Interlagos existe sur une branche de travail WIP non fusionnée, avec scène et surface mais sans collisions, pitlane ni validation complète. Bahreïn existe surtout comme scène externalisée et kit de pièces incomplet ; il n’est pas branché au runtime. Sepang ne dispose que d’un convertisseur Python non intégré, sans GLB source, sorties, CI, runtime ni tests fonctionnels.

Les mécanismes réutilisables sont principalement le registre de circuits, le chargement par ressources optionnelles, le tuilage/LOD, KTX2/WebP/Meshopt, l’assemblage CI, la logique de pitlane, les contrats d’ancres, ainsi que les outils d’extraction et de conversion. Leur présence sur une branche non fusionnée ne prouve toutefois pas leur disponibilité dans `main`.

## 3. État consolidé par circuit

### 3.1 Spa-Francorchamps (`spa`) — intégré et jouable dans `main`

**Statut constaté.** `origin/main@88eb26c` contient Spa comme circuit jouable par défaut et sélectionnable par `?circuit=spa`. Le merge final révoque Yas Marina, mais ne supprime pas Spa ni Monza. Les stands ont été intégrés via `4d9f29e`, `7055219` et `a6ceb38`; `32c09f4` fait de `source/game` la source de vérité de la CI.

**Inventaire runtime et assets.** `main` contient les fragments `parts/assets__spa__t04.bin.*`, `t05.bin.*`, `t05_lod.bin.*`, la texture KTX2 `c5ff7d9bfd57bb78` et `garage_player.glb`. `.gitlab-ci.yml` les réassemble dans `public/assets/spa` et `public/assets/spa_pits`. Le bundle Spa comprend la base et `t00` à `t11`, leurs LOD/glTF, textures KTX2/WebP et `tiles.json`, ainsi que `surface.json`, `surface.bin`, `barriers.bin` et `pitlane.json`.

`public/assets/spa_pits` contient notamment `brakeboards.glb`, `garages_lod.glb`, `marshal_platforms.glb`, les GLB/textures de PNJ, `pits.json`, `pitwall_stands.glb` et `pit_exit_lights.glb`. Les binaires lourds ne sont pas placés dans `source/game` : `source/README.md` indique un déploiement à la racine `public/parts`; le dépôt contient les fragments et les fichiers assemblables, pas les sources Blender `.blend`.

**Fonctionnalités et travail spécifique.** Le tracé documenté compte 1,18 M de triangles, 13 tuiles et 77 textures uniques. `circuit.ts` définit `./track`, `./assets/spa`, les marshals Spa, deux zones DRS et le fallback Spa. La voie des stands comprend entrée/sortie, limite de 80 km/h, lignes `speed_start/end`, voie rapide, working lane, team boxes et feu de sortie. Le décor comprend garages, garage joueur, pit wall, pit exit, panneaux 100/200/300, commissaires, plateformes et PNJ.

Les scripts Blender et outils dédiés au tracé incluent `t1_track_import.py` à `t10_*`, `k1_export_coll.py`, `r1_bake_ao_track.py` et `s1_drs_flap.py`. Ils ne doivent pas être confondus avec les outils génériques non fusionnés de `origin/ty/lot1-circuits`.

**Paramètres et dépendances.** Le moteur est limité à `spa|monza`; Spa est le défaut hors navigateur et dans le stockage local. Les paramètres documentés sont deux DRS, pression Spa 2020 de 24,5 psi à l’avant et 21,0 psi à l’arrière, pneus C2/C3/C4, densité/altitude et calibration de tour. Le chargement dépend de Vite/TypeScript/three.js, `KTX2Loader` avec basis transcoder et `MeshoptDecoder`. Un build peut être compilable sans les lourds assets, mais cela ne prouve pas que le runtime local soit jouable.

**Preuves et limites.** Les tests déclarés couvrent physique/ERS, écarts de tours des voitures 2020, barrières, surface, pitlane, règles de voie des stands, environnement, application, DRS, WebKit et course. Les documents de statut déclarent Node/Chromium/Playwright headless OK, un tour IA d’environ 1:41,75, des collisions sans traversée, une pitlane sans choc avec environ 73 km/h maximum, 13/13 tuiles et 77 textures. Ce sont des déclarations de statut, pas des rapports bruts versionnés. `physics_tests.json`, `cars2020_spa.json`, `track_ao_bake.json` et `source/game/out` sont absents de l’arbre Git. Aucun test sur iPhone/Safari réel ni mesure FPS/mémoire réelle n’est fourni.

### 3.2 Monza (`monza`) — code intégré, assets dépendants de la CI

**Statut constaté.** Le runtime Monza est intégré par `183dafc`, fusionné via `eed713b` et conservé dans `origin/main@88eb26c`. La branche `origin/feature/monza-playable` est ancienne et ne constitue pas une alternative. Le correctif `origin/fix/monza-texture-scope-main` a été intégré puis révoqué; son test dédié a été supprimé.

**Inventaire.** `circuit.ts`, `session.ts`, `main.ts` et `renderer.ts` ajoutent la sélection `?circuit=monza`/localStorage, les chemins `./track_monza/` et `./assets/monza/`, la configuration pit/secteurs/DRS et le bouton de menu. Les assets externalisés de `shared/assets/monza_2020` comprennent base et `t00` à `t13` glTF/bin/LOD, textures KTX2/WebP, `surface.json/bin`, `barriers.bin`, `pitlane.json`, données de foule/herbe, `meta.json` et `marshals.json`. `REASSEMBLE.md` fournit l’inventaire et les SHA-256.

Le checkout local de `main` ne contient ni `public/assets/monza`, ni `public/track_monza`, ni `shared/assets/monza_2020`. La CI récupère les données depuis `origin/newbot-shared`, décode les fragments et assemble les chemins publiés. L’absence locale ne prouve donc pas l’absence dans un artefact CI, mais `main` seul n’est pas autonome pour lancer Monza.

**Données spécifiques et manques.** La ligne centrale est documentée à 5 786,2 m contre 5 793 m officiel; secteurs, grille, fins DRS et départ/arrivée sont explicitement estimés dans `meta.json`/`SOURCES.md`. `circuit.ts` configure pit 5405→70, secteurs 1600/3950 et DRS 2738→3560 puis 5589→ligne/0→480. `marshals.json` existe mais `posts=[]`; seul `signal_1` à trois lampes est documenté. Sont absents ou à vérifier : panneaux FIA, postes/commissaires, portique de départ, panneaux de distance/DRS, bollards/lignes de pit, blocs T1-T2, bosses T5, grille exacte et podium.

**Preuves et limites.** `a73df23` rend `assemble_check` strict avec `MONZA_STRICT=1` et le typecheck bloquant, mais aucun log de succès n’est conservé. Le test Playwright `monza_startup.mjs` de `bded05a` vérifiait longueur, 20 voitures, vues, tuiles, KTX, input et absence d’erreurs; il a été supprimé par `d239b86`. Aucun rapport Playwright, artefact CI ou capture Monza n’est disponible. Aucun lien explicite entre l’id carrière `ita` et `CIRCUIT.id='monza'` n’a été établi dans les données fournies.

### 3.3 Yas Marina (`yas`) — intégration historique révoquée, absente de `main`

**Statut constaté.** L’intégration issue notamment de `aecf584`, avec correctifs et CI historiques, a été révoquée par `d239b86`, `3d2ec0b` et `397abdb`, puis le revert a été intégré dans `main` via `88eb26c`. `main` ne contient plus le type `yas`, les assets, scripts, physique, rapport ni CI Yas. `origin/claude/yas-marina@4927a7e` est documentaire/préparatoire et indique elle-même que les assets convertis sont manquants.

**Inventaire historique, non disponible dans `main`.** L’état historique comprenait 138 chemins sous `source/game/public/assets/yas_marina` : base, `t00`–`t11`, LOD, ciel et textures WebP, ainsi que quatre fichiers sous `track_yas`. Il comprenait aussi des scripts Blender/outils de physique, des outils LOD, un rapport de physique et une scène nocturne. Ces éléments ont été supprimés par le revert et ne doivent pas être présentés comme livrables actuels.

**Paramètres historiques.** Le code historique définissait pit 5083,83/400,16 m, secteurs 1248,11/3734,23 m et deux zones DRS. La centerline annoncée mesurait 5329,5186 m contre 5281 m de référence; les stations pit/DRS/secteurs et la physique étaient estimées ou interpolées. Le bake dépendait de Blender 5.2.4, d’un modèle Yas et d’objets nommés; la génération physique dépendait aussi de numpy, cv2, scipy et Pillow.

**Preuves et limites.** `source/reports/physics_tests.json` historique déclarait surface, barrières, pitlane, DRS/secteurs, départ, tour automatique et stabilité, mais il appartenait à l’état révoqué. Sur `main`, le test physique s’arrête sur l’absence de `source/game/public/track/surface.bin`; le build/typecheck ne démarre pas localement car Vite est absent. Il n’existe aucun test de démarrage Yas actuel, aucun asset Yas dans `main` et aucune validation mobile actuelle.

### 3.4 Interlagos (`interlagos_2023`) — branche WIP non fusionnée

**Statut constaté.** `origin/feature/interlagos@c18aca6` est divergente de `main`, avec ancêtre commun `eed713b`, et aucun de ses commits n’est intégré à `origin/main@88eb26c`. La branche se décrit comme chantier incomplet/non publiable; aucune MR, pipeline exécutée ou publication Pages n’est prouvée.

**Inventaire.** La branche contient code moteur, test dédié, scripts Blender, outil de centreline, 17 tuiles GLTF/BIN, 104 textures WebP, `tiles.json`, `surface.bin`, `surface.json`, `surface_stats.json` et `grassmask.bin`. Les fichiers sources nécessaires — GLB d’entrée, `.blend`, centreline de travail et source complète — sont absents ou exclus par `.gitignore`. Les assets sont stockés sous forme de lignes base64 et décodés par CI.

**Paramètres et manques.** Le circuit déclare longueur 4238,01 m, gates `[1321,3096]` et DRS `[669,1266]`, `[3811,4238]+[0,188]`; ces valeurs sont explicitement projetées/non officielles. La surface utilise `N=4238`, `ND=181`, largeur -45..45 m et pas 0,5 m. Aucun `barriers.bin` ou collision réelle n’est fourni, `barriersFile=null`, les murs sont de secours, `pitlaneFile=null`, la limite 80 km/h n’est pas fonctionnelle, et aucun crowd/marshals/grille/IA/validation mobile n’est démontré.

**Preuves et limites.** Le document d’état rapporte import, bake, export, tests Interlagos, typecheck et build réussis, mais aucun log de CI n’est versionné. Le test vérifie formats de surface, herbe, tuiles, textures et absence de `Image_98`; il n’a pas été relancé dans cet audit. Une prévisualisation navigateur n’a atteint que l’écran « toucher pour démarrer » avant perte du contexte WebGL. La mémoire texture estimée à environ 124 Mo et la performance iPhone ne sont pas mesurées.

### 3.5 Bahreïn / Sakhir (`bahrain`/`bhr`) — assets partiels, non intégré

**Statut constaté.** Bahreïn n’est pas intégré à `main`. `origin/newbot-shared@3d7c509` contient une scène externalisée substantielle mais incomplète; `origin/ty/lot1-circuits@051e3a0` contient un kit de pièces et des outils génériques, tandis que `LOT1_CHECKLIST.md` marque Bahrain comme non fait et demande encore textures, track, nuit, pit lane et captures.

**Inventaire.** Le dump partagé contient base et tuiles de scène, binaires, textures, `tiles.json`, `marshals.json`, `MANQUANTS.md`, `SOURCES.md` et `reports_gpu.json`. Le kit de travail contient feux de départ, feux de pit exit, deux panneaux marshal, mât de projecteurs et ciel de nuit. Aucun `shared/assets/bahrain/track/{surface,barriers,pitlane,meta}`, dossier pits/night, centerline, anchors, assemblage pitlane ou test runtime n’est livré dans la branche auditée.

**Données et limites.** La longueur mesurée est 5403,8 m; pitlane 706 m; 15 virages, 57 tours et limite stands 80 km/h sont documentés, tandis que secteurs, fins DRS et couleurs des lampes sont estimés. Les assets signalent environ deux postes LED seulement, des panneaux et éléments FIA manquants, et aucune configuration runtime de nuit. `renderer.ts` et `main.ts` de `main` restent câblés sur Spa; les assets Bahrain ne peuvent donc pas être utilisés sans sélection de circuit et manifestes.

**Preuves.** Aucun test Bahrain, capture de nuit, chiffre de performance ou résultat de chargement n’est fourni. `reports_gpu.json` ne mesure que taille/format des assets et ne prouve ni rendu, ni collisions, ni IA, ni DRS, ni pitlane. Le push LFS est signalé bloqué par le type de token GitLab; la présence locale ne prouve pas une publication distante.

### 3.6 Sepang (`sepang`) — convertisseur non intégré, sans entrée ni sortie

**Statut constaté.** `origin/claude/sepang@810446c` ajoute six fichiers Python/documentation sous `source/sepang`, mais aucun changement du jeu, de la CI, des tests ou des assets déployés. La branche n’est pas ancêtre de `main`; le registre runtime de `main` reste `spa|monza`. La ligne Sepang dans les données de calendrier ne constitue pas une intégration jouable.

**Inventaire.** Sont présents `README.md`, `sepang_core.py`, `sepang_tables.py`, `build_physics.py`, `build_scene.py` et `build_sepang.py`. Le GLB source annoncé, les sorties `track_sepang`, `assets/sepang`, `surface.*`, `grassmask.bin`, `tiles.json`, pitlane, barrières, crowd, marshals et `.blend` sont absents.

**Composants et risques spécifiques.** Le convertisseur propose parsing GLB, extraction par matériau, squelette/rasterisation de ligne centrale, z-buffer physique, génération glTF et assertions. Mais il suppose des indices de matériaux et noms de meshes spécifiques, une entrée GLB absente et des dépendances Python non déclarées. Une indexation booléenne NumPy chaînée dans `build_physics.py` peut modifier une copie plutôt que la vue; ce risque n’est pas couvert par un test. Aucun DRS, secteur, gate, pitlane, collision, runtime ou LOD multi-tuile n’est branché.

**Preuves.** Les scripts ont fait l’objet d’une analyse syntaxique AST sans écriture, ce qui n’est pas une conversion fonctionnelle. Aucun test Sepang, log CI, `SEPANG OK`, fixture GLB, hash ou capture n’est présent. Le pipeline Python décrit dans le README n’existe pas dans `.gitlab-ci.yml`.

## 4. Composants réutilisables et portée réelle

Les mécanismes réutilisables constatés sont :

- registre/configuration de circuit et sélection runtime ; pour Monza, `session.ts`, `main.ts` et `renderer.ts` consomment des chemins, gates, DRS et ressources séparées ;
- chargement tuilé, `tiles.json`, LOD, Meshopt, KTX2/WebP, streaming proche/lointain, herbe et partage de textures ;
- assemblage CI de fragments/base64/LFS, contrôles de tailles et SHA-256 ; dans l’état actuel, l’assemblage reste explicitement câblé à Spa et Monza ;
- contrat d’ancres et alias dans `anchors.ts`, fallback vers `pitlane.json`, logique pitlane générique, stands avec fallback ;
- physique pneus/météo/dégâts/IA/course et tests Node/Playwright, séparés des données de tracé ;
- outils de lot 1 `build_anchors.py`, `extract_kit_by_material.py`, `hdr_to_sky.py`, `create_night_floodlight.py` et `extract_named_nodes.mjs` sur `origin/ty/lot1-circuits`; ils sont réutilisables mais absents de `main` ;
- outils de conversion/inspection/raycast/surface/AO, dont `build_track_tiles.mjs`, `lod_tiles.mjs`, `opt_track.mjs`, `make_ktx2.py` et `r1_bake_ao_track.py` ; leurs chemins, matériaux et sorties peuvent rester spécifiques à Spa ;
- dans Sepang, parsing GLB, extraction de primitives, rasterisation de centreline, z-buffer et génération glTF, encore non validés et non intégrés.

La réutilisabilité du moteur ne rend pas réutilisables les valeurs de calibration, les indices de matériaux, les chemins, les positions DRS/gates, les assets, les droits ou les hypothèses de géométrie d’un circuit donné.

## 5. Tests, preuves et limites transversales

Les preuves sont de trois types et doivent rester séparées : (1) fichiers et commits présents, (2) déclarations documentaires de statut, (3) résultats bruts d’exécution. Les rapports et captures bruts sont fréquemment absents. Une documentation indiquant « OK » n’est donc pas assimilée à un log CI reproductible.

Limites communes constatées :

1. Les binaires lourds, fragments LFS et assets externalisés peuvent être absents d’un checkout tout en étant prévus par CI; inversement, une branche d’assets ne prouve pas une publication.
2. Les mesures mémoire annoncées varient approximativement de 246 à 302 Mo selon les statuts, et aucune mesure FPS ou WebGL sur iPhone réel n’est fournie. Le risque GPU/mobile reste ouvert.
3. Les dépendances locales manquent parfois : Vite absent pour le build Yas audité; `surface.bin` Spa absent dans une exécution générique actuelle; les dépendances Python Sepang ne sont pas déclarées.
4. Les rapports `physics_tests.json`, `cars2020_spa.json`, `track_ao_bake.json`, sorties `out`, logs Playwright et artefacts CI ne sont pas livrés de façon suffisante pour reproduire toutes les affirmations.
5. Les paramètres estimés, les assets partiels et les scripts non exécutés ne doivent pas être convertis en état validé.
6. Les autres circuits ou chemins apparaissant dans des branches ne constituent pas une capacité Spa supplémentaire et ne doivent pas être extrapolés à Spa, Monza ou au moteur entier.
7. Les droits des sons moteur sont déclarés inconnus dans `README.md`; cela ne bloque pas la logique Spa mais limite une diffusion plus large.

## 6. Priorités de correction

1. **Préserver la frontière d’intégration :** documenter systématiquement si une preuve vient de `main`, d’une branche non fusionnée, d’un dump partagé ou d’un état révoqué; ne jamais présenter une branche de kit comme une publication.
2. **Rendre les assets reproductibles :** versionner ou référencer clairement les sources, manifests, SHA-256, règles LFS et artefacts CI; produire un résultat d’assemblage vérifiable pour Monza et chaque futur circuit.
3. **Valider les données de piste :** fournir centreline, surface, barrières, pitlane, grille, DRS, secteurs et marshals avec provenance et tests spécifiques; remplacer les estimations explicitement marquées comme telles avant publication.
4. **Ajouter des tests runtime par circuit :** démarrage, chargement de toutes les tuiles/textures, tour, collisions, pitlane, IA, DRS, absence d’erreurs réseau et scénario mobile; conserver les logs et rapports bruts.
5. **Découpler complètement la CI :** remplacer les chemins Spa/Monza câblés par un contrat de manifestes, sans considérer les outils de `origin/ty` comme intégrés tant qu’ils ne sont pas fusionnés et exécutés.
6. **Fermer les risques mobile et licences :** mesurer mémoire/FPS sur appareils réels, vérifier Safari/iPhone, et clarifier les droits des sons et des modèles avant diffusion.

## 7. Références principales

- `origin/main@88eb26c`, `32c09f4`, `a6ceb38`, `7055219`, `4d9f29e` : intégration Spa, stands, publication et CI.
- `183dafc`, `eed713b`, `a73df23` : runtime Monza, fusion et durcissement CI.
- `397abdb`, `d239b86`, `3d2ec0b` : réversion Yas et suppression des correctifs/tests associés.
- `origin/feature/interlagos@c18aca6` : branche WIP non fusionnée.
- `origin/newbot-shared@3d7c509`, `origin/ty/lot1-circuits@051e3a0`, `472d56c` : assets partagés, kit et outils non intégrés.
- `origin/claude/sepang@810446c` : convertisseur non intégré et sans entrée/sortie.
- `source/game/src/core/circuit.ts`, `main.ts`, `session.ts`, `renderer.ts`, `source/game/src/track/pitlane.ts`, `source/game/src/render/anchors.ts` : contrats runtime et logique réutilisable.
