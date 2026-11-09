# Parité visuelle Spa → tous les circuits (9 nov. 2026, heure des Canaries)

Audit en lecture seule de `/workspace/w11` (game/src/render/*.ts, docs/IMPROVEMENTS_20.md, IMPROVEMENTS_10_NEW.md, FEATURES_STATUS.md,
public/assets/{spa,detail,sky}) et de `/workspace/w11-shared/downloads/`. Principe retenu : **tout ce que les shaders de Spa reconnaissent
par nom de matériau est reproduit côté assets** (noms canoniques + calibrage cuit), pour que le code d'Opi s'applique **sans modification**.
Implémentation : `work/circuits/lib/parity.mjs` (appelé par `lib/build_track_tiles.mjs`), table par circuit dans `track/meta.json → visualParity`.

| # | Effet Spa (runtime) | Fichier Spa | Déclencheur | Reproduit côté assets (circuits) | Reste côté Opi (runtime) |
|---|---|---|---|---|---|
| 1 | Correction d'albédo PBR + plafond spéculaire (asphalte trop clair) | renderer.ts `ALBEDO_FIX` | nom exact (asph_new 0,95, asph-grv 0,55, road-ext-tile 0,36, sand 0,7, walls 0,85…) | **cuit dans baseColorFactor** : albédo linéaire moyen mesuré sur chaque texture, ramené à l'albédo effectif du matériau Spa de même rôle (route 0,09 ; stands 0,13 ; vibreur 0,22 ; ligne 0,52 ; tapis peint 0,30 ; herbe 0,08 ; herbe sèche 0,16 ; terre 0,34 ; gravier 0,315 ; arbres 0,025 [facteur ≥ 0,5 comme Spa] ; buissons 0,049 ; rideau d'arbres 0,161) — on ne fait que foncer ; spéculaire plafonné (KHR_materials_specular) | rien. Les noms d'origine qui tombaient sur une clé ALBEDO_FIX (walls, misc, sand…) sont suffixés `_src` (pas de double correction) |
| 2 | Rugosité/métal des sols cohérents | (implicite : sols Spa rugosité 0,84–0,92) | — | **normalisé** : route 0,88, stands 0,9, vibreur 0,86, ligne 0,84, herbe/gravier 0,9, métal 0 (la conversion Sketchfab donnait rugosité 0 / métal 0,5 sur l'asphalte de Monza → miroir) | rien |
| 3 | AO Cycles cuite par sommet, dosage réduit sur les sols | bakedAO.ts `GROUND` | COLOR_0 + noms asph, kerb_new, line, carpet, groove, GRASS, sand_new… | COLOR_0 cuit (Cycles, 32 éch., 4 m) **+ noms canoniques** des sols → même dosage 0,55 | rien |
| 4 | Détail PBR CC0 de près (Gravel023 / Grass001, 2 échelles, fondu) | detail.ts `KIND` + public/assets/detail/ | sand_new / construction_dirt → gravier ; GRASS / grass-side1B → herbe | gravier → `sand_new.NNN`, terre → `construction_dirt.NNN`, herbe verte → `GRASS.NNN`, herbe sèche → `grass-side1B.NNN` | textures detail/ partagées (déjà dans public/assets/detail) |
| 5 | Herbe 3D instanciée au bord de piste | grass.ts + `track/grassmask.bin` | grille physique + masque (classe 1 = herbe verte, pente < 0,25) | `grassmask.bin` produit par circuit (même format), classe 1 = matériaux « grass » | rien |
| 6 | Arbres « studio » (normales sphériques, alpha-to-coverage, vent, translucidité) | trees.ts `TREE_RE` = ^(trees1\|trees2\|bushesB) | nom de matériau | arbres → `trees1_<orig>.NNN`, buissons/haies → `bushesB_<orig>.NNN`, alpha MASK ; rideau lointain → `treesline` (hors TREE_RE comme Spa). Spa **n'instancie pas** ses arbres (cartes dans les tuiles) : idem ici | rien |
| 7 | Bâtiments moins blancs + salissure procédurale | weathering.ts `BUILD` | houses\d+ / main-gstand / box1_* (0,78), concrete-barrie-raw (0,82) | bâtiments listés `building` ET albédo moyen > 0,40 → `houses1NN` ; murets béton clairs → `concrete-barrie-raw.NNN` | rien |
| 8 | Chaussée mouillée (assombrie, reflets, flaques) | weatherfx.ts `ROAD` (préfixe road\|asph\|groove\|kerb\|curb\|line…) | nom | couvert par les noms canoniques asph/kerb_new/line/groove | rien |
| 9 | Traces de pneus, poussière/cailloux gravier, terre herbe, débris | weatherfx.ts, effects.ts | types de `surface.bin` (1 asphalte, 2 vibreur, 4 herbe, 5 gravier) | `surface.bin/json` même format | rien |
| 10 | Public instancié (2 LOD) | crowd.ts + `track/crowd.bin` | places extraites des gradins | `crowd.bin` complet (aucun sous-échantillonnage, décision utilisateur) | optimisation iPhone (Opi) |
| 11 | Ciel HDRI CC0 + brume/brouillard + IBL | skydome.ts, public/assets/sky (kloofendal partly cloudy) | global | `meta.json → sky` : recommandation par circuit (ciel/heure), pas de nouveau HDRI livré | choisir le ciel par circuit (Bahreïn/Singapour : crépuscule/nuit) |
| 12 | Tuiles + LOD + KTX2 UASTC + textures partagées (extras.mid) | renderer.ts loadTile, tiles.json | — | identique (build_track_tiles/lod_tiles/make_ktx2 de Spa) | `TRACK_DIR` par circuit |
| 13 | Feux pilotables | Spa `spa-start-lights-emissive` | — | nœuds `signal_*`, `marshal_<n>_<couleur>`, `pitlight_*` séparés, matériau émissif éteint (extras w11_lamp_rgb) + `marshals.json` | les piloter |

Non utilisés à Spa (donc pas de parité requise) : textures CC0 asphalte/béton/vibreurs/terre de `downloads/` (aucune référence dans game/src).
Contrôle visuel : aperçus Cycles (soleil + ciel physique) avec le calibrage appliqué → `assets/<id>/preview/`.
