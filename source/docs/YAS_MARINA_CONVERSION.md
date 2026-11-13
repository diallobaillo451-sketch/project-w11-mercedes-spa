# Yas Marina (layout 2021) — dossier de conversion

Branche `claude/yas-marina` · v2 du 13 nov. 2026. **Corrige la v1** : la classification des matériaux a été refaite après contrôle sur une vue de dessus et des coupes en travers (la v1 prenait `tentrail_29` pour la piste, c'était faux ; la piste est `tentrail_32`). **Le code du jeu et la CI sont prêts** (§6). Il manque **uniquement les assets convertis**, à livrer sur la branche `newbot-shared` dans `shared/assets/yas_marina_2021/` (même arborescence que `monza_2020`). Dès qu'ils y sont et qu'un pipeline tourne sur `main`, le bouton « Circuit » du menu (ou `?circuit=yas`) propose Yas Marina.

## 1. Fichier source
- `yas_marina_circuit_abu_dhabi_2021_layout.glb` (77 363 819 o), fourni par l'utilisateur dans une conversation : **il n'est pas dans le dépôt, à lui redemander**.
- « Yas Marina Circuit Abu Dhabi 2021 layout », **Dave Love** (https://sketchfab.com/Tyler_Dave), **CC BY 4.0**, même auteur que Spa et Monza. Page : https://sketchfab.com/3d-models/yas-marina-circuit-abu-dhabi-2021-layout-c41b4e19912b4d79886bcd8d7d2536af. Attribution à afficher dans « À propos » ; modifications à signaler (recentrage, mise à l'échelle, tuilage, AO cuite, KTX2, LOD…).
- Mesuré (M) : glTF 2.0 Sketchfab 17.19.0 (KHR_materials_specular, KHR_texture_transform), 131 nœuds, 127 maillages, **932 122 triangles**, **100 matériaux**, 93 textures PNG (17,5 Mo : une de 2048², deux de 1024 de large, le reste ≤ 512). Emprise totale 1 402 × 104 × 1 422 m (dôme d'horizon compris) ; **sol ≈ 1 190 × 910 m ; piste ≈ 790 × 490 m**. Y haut.
- **Échelle : à vérifier en premier, très probablement ≠ 1.** (M) La surface de course ne fait que ≈ 7 m de large (lignes blanches à ±3,5 m), la ligne droite du haut ≈ 550 m, et toute la piste tient dans ≈ 790 × 490 m. Le vrai circuit fait ≈ 5,281 km (officiel 2021, 16 virages, 58 tours — P, à recouper avec le document FIA), 12 à 16 m de large et une ligne droite d'≈ 1,2 km (P). Estimation grossière : échelle ≈ 0,5 (E). À confirmer par la longueur de la ligne centrale (`t8_centerline`), puis **mettre à l'échelle pour obtenir la longueur officielle ±0,5 %** (spec Opi) avant toute mesure de physique (largeurs `wl`/`wr`, DRS…).
- Défauts (M) : la texture n° 92 (bandeau d'horizon) est **tronquée** dans le GLB ; les textures 32, 33, 35, 36 ne sont référencées par aucun matériau.

## 2. Noms de matériaux — le point critique
Le runtime reconnaît le sol, les arbres et les bâtiments **par nom de matériau canonique** (voir `shared/work/SPA_VISUAL_PARITY.md`) : `asph*`, `kerb_new`, `line`, `carpet`, `groove`, `GRASS`, `sand_new`, `construction_dirt`, `grass-side1B`, `trees1_*`, `bushesB_*`, `houses1NN`, `concrete-barrie-raw`, plus `surface.bin` et `grassmask.bin`. **Ces noms ne doivent JAMAIS être modifiés** (sinon la physique et le rendu herbe/gravier ne fonctionnent plus). Les noms d'origine restent consignés dans `meta.json → visualParity.materials` (src → name), comme pour Monza.

Ici les 100 matériaux d'origine s'appellent `Merged_materials`, `tentrail`, `tentrail_0` … `tentrail_97` : **aucun nom parlant**. Le classement automatique par nom du pipeline (`parity.mjs`, `t3_layers`, `t9_surface_v5.py`) ne peut donc rien reconnaître : il faut lui fournir la table ci-dessous.

**Comment elle a été établie** : examen des 93 textures, mesure de surface / hauteur / planéité de chaque matériau, vue de dessus de chaque matériau isolé et 14 coupes en travers de la piste (ordre des matériaux de part et d'autre de la surface de course). (M) = mesuré et net ; (E) = estimé, à valider visuellement dans Blender. Coupe type, de l'extérieur vers l'intérieur : `herbe / sable / asphalte hors piste (29) ou dégagement peint (31)` → `bande 30 (≈ 1 m)` → `vibreur 20/21 (par endroits)` → `ligne blanche 28 (±3,5 m)` → `surface de course 32 (≈ 7 m)`.

| Matériau source | Ce que c'est (texture + mesure) | m² | triangles | Nom canonique proposé | Type de sol |
|---|---|---|---|---|---|
| `tentrail_32` | **surface de course** : asphalte gris foncé 1024², ruban continu ≈ 7 m de large, bordé par les vibreurs puis la bande 30 (M) | 26 479 | 30 077 | `asph.001` | 1 asphalte |
| `tentrail_29` | **asphalte hors piste** : paddock, **voie des stands**, aires et dégagements ; grandes surfaces plates qui touchent le sable (M) ; la voie des stands est à isoler par sa position | 70 739 | 17 080 | `asph.002` ; voie des stands `asph.003` (E) | 1 asphalte |
| `tentrail_19` | grand tablier d'asphalte à l'ouest, au niveau le plus bas (Y −2,9…0,2), jouxte la piste par endroits (E) | 46 475 | 685 | `asph.002` (E) | 1 asphalte |
| `tentrail_31` | **dégagements peints bleu-gris**, bandes de 3 à 5 m de part et d'autre de la piste (forme M, nature E) | 10 567 | 11 209 | `carpet.001` (E) | 3 peint |
| `tentrail_27` | aplat bleu-gris foncé près de la piste dans la zone de l'épingle (en haut à droite) ; relief de 1,8 m, donc pas une eau plate (E) | 1 748 | 1 578 | `carpet.002` (E) ou eau | 3 (E) ou 6 |
| `tentrail_28` | **lignes blanches** fines de bord de piste, à ±3,5 m (E) | 603 | 24 409 | `line` | 3 peint |
| `tentrail_30` | bande de caniveau/grille d'≈ 1 m de chaque côté, entre l'asphalte et l'extérieur (E) | 3 378 | 14 238 | couche 6 `groove` (E) | — |
| `tentrail_20`, `tentrail_21` | **vibreurs** rouge/blanc/jaune, au bord de la surface de course (M) | 582 + 182 | 6 841 + 7 531 | `kerb_new` | 2 vibreur |
| `tentrail_26` | **sable** : grandes zones autour des installations et bacs le long de la piste (M) | 85 156 | 3 340 | `sand_new.NNN` | 5 gravier/sable |
| `tentrail_69` | **herbe** 2048² (M) | 263 637 | 5 288 | `GRASS.NNN` | 4 herbe |
| `tentrail_64`, `tentrail_96` | calques alpha : gomme / ombres | 1 398 + 916 | 245 + 552 | `groove` / `tree_shadow` (E) | — |
| `tentrail_25` | aplat vert au bord de la piste (gazon synthétique ou peinture) | 183 | 4 206 | `GRASS` ? (E) | à vérifier |
| `tentrail_91` | petits objets, **pas du sol** (non plats : planéité 0,43, de −1,2 à 6 m) | 265 | 1 480 | objets | — |

Autres groupes :
- **Pneus** : `tentrail_84` (murs de pneus, 4 756 triangles).
- **Murets béton** : `tentrail_34`, `tentrail`, `tentrail_0` → `concrete-barrie-raw.NNN` si albédo moyen > 0,40 (règle parity) (E).
- **Clôtures alpha** : `tentrail_72`, `tentrail_73`.
- **Palmier** : `tentrail_70` (une seule carte alpha 256×512).
- **Public (cartes de spectateurs)** : `tentrail_56`, `tentrail_76` à `tentrail_81`, `tentrail_97` → à retirer, remplacées par `crowd.bin` complet comme à Monza.
- **Horizon de désert** : `tentrail_82` (32 triangles, 459 000 m², Y −32…71, texture tronquée) → à retirer : le ciel est global.
- **Marques réelles** (Pirelli, Allianz, RBS, DHL, Aldar, Etihad, Yas Marina Circuit, DCGP…) : `tentrail_1`, `_3`, `_4`, `_5`, `_9`, `_13`, `_14`, `_33`, `_35` à `_39`, `_59`, `_63`, `_95` → prudence logos (spec Opi), même traitement que Monza.
- **Sans texture ni couleur** (rendraient blanc) : `Merged_materials` (124 210 triangles), `tentrail_57` (202 192 triangles), `tentrail_40` (1 440 triangles) → à inspecter dans Blender (sièges ? personnes ? mobilier ?).
- **Le reste** (façades, toits, portes de garage, mâts, feux) : bâtiments → `houses1NN` si albédo moyen > 0,40.

## 3. Reprendre de Monza (demande de l'utilisateur : gravier, herbe, arbres, ciel, public)
- **Herbe et gravier** : les textures de détail CC0 partagées par le jeu (`public/assets/detail/`) s'appliquent **par nom** (`GRASS.NNN`, `sand_new.NNN`, `grass-side1B.NNN`, `construction_dirt.NNN`) : rien à copier, il suffit de respecter les noms canoniques et les mêmes calibrages d'albédo/rugosité que Monza (voir `meta.json → visualParity` de `monza_2020`).
- **Ciel** : global (HDRI partagé du jeu) ; `meta.json → sky` comme Monza (jour).
- **Arbres** : le modèle n'a qu'une carte de palmier (`tentrail_70`). Demande de l'utilisateur : arbres de Monza → reprendre leurs matériaux/textures (`trees1_*`, `bushesB_*`, alpha MASK, mêmes calibrages) pour les cartes d'arbres de Yas ; si on garde des palmiers, les nommer `trees1_palm.NNN` (à trancher avec l'utilisateur).
- **Public** : `crowd.bin` complet, sans sous-échantillonnage (comme Monza : 83 112 places).
- **Mêmes sorties que Monza** : `surface.json/bin`, `barriers.bin`, `pitlane.json` (avec `limitFromS`, `limitToS`), `grassmask.bin` (classe 1 = GRASS), `crowd.bin/json`, `marshals.json`, `meta.json` (DRS, secteurs, virages, longueur, records, sources, `visualParity`), `<id>_centerline.json`.

## 4. Pipeline
Suivre `shared/PIPELINE_OPI.md` (branche `newbot-shared`) : `t1_track_import` → `t2_track_inspect` → `t3_layers` → `t4_overlap` → `t5_top` → `t6_export_tris` → `t7_assemble` ; `t8_centerline` + `centerline_v4.py` + `smooth_cl.py` ; `t9_surface_v5.py` ; `r1_bake_ao_track.py` ; `k1_export_coll.py` + `tools/coll/` ; `t10_crowd.py`, `t10_startline.py` ; `opt_track.mjs`, `build_track_tiles.mjs`, `lod_tiles.mjs`, `make_ktx2.py` ; contrôle `audit_glb.py`. Spec : glTF Y haut, mètres, **échelle réelle (longueur officielle ±0,5 %)**, origine = ligne de départ, orientation comme Spa ; 13-20 tuiles meshopt, KTX2 UASTC + mipmaps, LOD lointain ≈ 50 %, ≈ 1,2 M triangles (150-250 k visibles), ≤ ≈ 130 Mo de textures GPU, arbres et public en instancing, AO par sommet. Ici les textures sources sont légères (17,5 Mo en PNG) : le budget GPU n'est pas un sujet.

## 5. Livraison
Sur `newbot-shared` uniquement, racine `shared/assets/yas_marina_2021/` : `scene/` (`tiles.json`, `base`, `tNN` + `tNN_lod`, `tex/`), `track/`, `preview/`, `marshals.json`, `SOURCES.md` (licences), `MANQUANTS.md`, `REASSEMBLE.md`, `reassemble.sh/.ps1`. Règles de `shared/tools/push_to_gitlab_notes.md` : binaires (`.bin`, `.ktx2`, `.webp`) en base64, `.gltf` et `.json` en clair, fichiers > ~3 Mio découpés en `.part001`, `.part002`… (≤ 3 Mio bruts chacune), messages de commit terminés par `[skip ci]`, jamais deux `add_commit` en parallèle. Mettre aussi à jour `shared/assets/CIRCUITS_STATUS.md`.

## 6. Côté jeu (déjà fait dans cette branche)
- `source/game/src/core/circuit.ts` : circuit `yas` ajouté (`?circuit=yas`). Le bouton « Circuit » fait Spa → Monza → Yas Marina **seulement si `track_yas/meta.json` est publié** (sondé en HEAD) : tant que le circuit n'est pas livré, rien ne change pour Spa et Monza. Secteurs et zones DRS sont lus dans `meta.json` (`sectors.S1_end_s` / `S2_end_s`, `drs.zones[].activateS` / `endS`), la zone 80 km/h dans `pitlane.json` (`limitFromS` / `limitToS`) : **aucun nombre à recopier dans le code après la livraison**. Valeurs de repli (E) sinon.
- `source/game/src/main.ts` : `await CIRCUIT.ready(pitData)` dans `loadTrack()`.
- `.gitlab-ci.yml` : fonction `yas()` (même décodage base64 / réassemblage des parts que `monza()`) → `public/assets/yas/` et `public/track_yas/`. Si `shared/assets/yas_marina_2021` n'existe pas encore sur `newbot-shared`, le job le dit et continue ; livraison incomplète : rien n'est publié (`YAS_STRICT=1` pour faire échouer le job).
- Après livraison : lancer un pipeline sur `main` (Build → Run pipeline), puis jouer avec `?circuit=yas`.

## 7. Réception (à vérifier avant de dire « livré »)
- **Longueur de la ligne centrale = longueur officielle ±0,5 %** ; largeur de la surface de course ≈ 12-16 m après mise à l'échelle.
- `tools/audit_glb.py` sur les tuiles ; aucun nom `tentrail_*` sur un sol/arbre/bâtiment dans les tuiles (noms canoniques seulement, noms d'origine dans `visualParity.materials`).
- `surface.json` : types 1, 2, 3, 4, 5 présents ; herbe et gravier ralentissent comme à Monza.
- `meta.json` : `sectors`, `drs.zones`, `pitlane.speedLimitKmh`, `sky`, `visualParity` ; `pitlane.json` : `limitFromS`, `limitToS`.
- Rendu : pas de blanc intégral (matériaux sans texture), pas de bannière de marque réelle laissée par mégarde, horizon retiré, arbres de Monza en place.

## 8. Prompt prêt à coller dans l'outil qui a Blender (celui de Monza)
> Convertis le circuit Yas Marina (GLB joint) avec le pipeline Opi en suivant à la lettre `source/docs/YAS_MARINA_CONVERSION.md` (branche `claude/yas-marina` du projet GitLab `issagabah451/project-w11-mercedes-spa`) et `shared/PIPELINE_OPI.md` (branche `newbot-shared`). Les matériaux d'origine s'appellent `tentrail_NN` : utilise la table du §2 (la surface de course est `tentrail_32`) et ne renomme jamais les noms canoniques. Vérifie l'échelle d'abord (§1 : le modèle est probablement à ≈ 0,5) puis mets-le à la longueur officielle. Reprends herbe, gravier, arbres, ciel et public de Monza. Livre dans `shared/assets/yas_marina_2021/` sur `newbot-shared` (base64, parts ≤ 3 Mio, commits `[skip ci]`) puis préviens-moi.
