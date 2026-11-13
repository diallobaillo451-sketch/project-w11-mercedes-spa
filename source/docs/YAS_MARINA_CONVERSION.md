# Yas Marina (layout 2021) — dossier de conversion

Branche `claude/yas-marina` · 13 nov. 2026. **Le code du jeu et la CI sont prêts** (§6). Il manque **uniquement les assets convertis**, à livrer sur la branche `newbot-shared` dans `shared/assets/yas_marina_2021/` (même arborescence que `monza_2020`). Dès qu'ils y sont et qu'un pipeline tourne sur `main`, le bouton « Circuit » du menu (ou `?circuit=yas`) propose Yas Marina.

## 1. Fichier source
- `yas_marina_circuit_abu_dhabi_2021_layout.glb` (77 363 819 o), fourni par l'utilisateur dans une conversation : **il n'est pas dans le dépôt, à lui redemander**.
- « Yas Marina Circuit Abu Dhabi 2021 layout », **Dave Love** (https://sketchfab.com/Tyler_Dave), **CC BY 4.0** — même auteur que Spa et Monza. Page : https://sketchfab.com/3d-models/yas-marina-circuit-abu-dhabi-2021-layout-c41b4e19912b4d79886bcd8d7d2536af. Attribution à afficher dans « À propos » ; modifications à signaler (recentrage, tuilage, AO cuite, KTX2, LOD…).
- Mesuré (M) : glTF 2.0 Sketchfab 17.19.0 (KHR_materials_specular, KHR_texture_transform), 131 nœuds, 127 maillages, **932 122 triangles**, **100 matériaux**, 93 textures PNG (17,5 Mo : une de 2048², deux de 1024 de large, le reste ≤ 512), emprise 1 402 × 104 × 1 422 m (Y haut, mètres, X −703…700, Z −712…710).
- Échelle : l'asphalte principal fait ≈ 70 700 m², soit ≈ 13,4 m de large sur 5,28 km → échelle réelle probable (à confirmer sur la ligne centrale ; officiel 2021 : ≈ 5,281 km, 16 virages, 58 tours — P, à recouper avec le document FIA).
- Défauts : la texture n° 92 (bandeau d'horizon) est **tronquée** dans le GLB ; les textures 32, 33, 35, 36 ne sont référencées par aucun matériau.

## 2. Noms de matériaux — le point critique
Le runtime reconnaît le sol, les arbres et les bâtiments **par nom de matériau canonique** (voir `shared/work/SPA_VISUAL_PARITY.md`) : `asph*`, `kerb_new`, `line`, `carpet`, `groove`, `GRASS`, `sand_new`, `construction_dirt`, `grass-side1B`, `trees1_*`, `bushesB_*`, `houses1NN`, `concrete-barrie-raw`, plus `surface.bin` et `grassmask.bin`. **Ces noms ne doivent JAMAIS être modifiés** (sinon la physique et le rendu herbe/gravier ne fonctionnent plus). Les noms d'origine restent consignés dans `meta.json → visualParity.materials` (src → name), comme pour Monza.

Ici les 100 matériaux d'origine s'appellent `Merged_materials`, `tentrail`, `tentrail_0` … `tentrail_97` : **aucun nom parlant**. Le classement automatique par nom du pipeline (`lib/parity.mjs`, `t3_layers`) ne peut donc rien reconnaître : il faut lui fournir la table ci-dessous, établie en regardant les 93 textures et en mesurant surface, hauteur et planéité de chaque matériau. **E = proposition à valider visuellement dans Blender.**

| Matériau source | Ce que c'est (texture + mesure) | m² | triangles | Nom canonique | Type de sol |
|---|---|---|---|---|---|
| `tentrail_29` | asphalte (bruit gris 512²), ruban de la piste | 70 739 | 17 080 | `asph.001` | 1 asphalte |
| `tentrail_28` | même texture, plaques et raccords | 603 | 24 409 | `asph.002` (E) | 1 |
| `tentrail_91` | asphalte sombre 256² | 265 | 1 480 | `asph.002` (E) | 1 |
| `tentrail_32` | asphalte gris 1024², grande zone (stands / paddock ?) | 26 479 | 30 077 | `asph.003` (E) | 1 |
| `tentrail_19` | même texture que la piste ×5 : dégagements en asphalte | 46 475 | 685 | `carpet.001` (E) | 3 peint |
| `tentrail_20`, `tentrail_21` | vibreurs rouge / blanc / jaune | 582 + 182 | 6 841 + 7 531 | `kerb_new` | 2 vibreur |
| `tentrail_26` | sable (traces de pneus) | 85 156 | 3 340 | `sand_new.NNN` | 5 gravier/sable |
| `tentrail_69` | herbe 2048² | 263 637 | 5 288 | `GRASS.NNN` | 4 herbe |
| `tentrail_30` | caniveau à grille bordé d'herbe | 3 378 | 14 238 | couche 6 `groove` (E) | — |
| `tentrail_64`, `tentrail_96` | calques alpha : gomme / ombres | 1 398 + 916 | 245 + 552 | `groove` / `tree_shadow` (E) | — |
| `tentrail_25` | aplat vert (peinture ou gazon synthétique) | 183 | 4 206 | `GRASS` ? (E) | à vérifier |
| `tentrail_27`, `tentrail_31` | aplats bleu foncé sans texture, très plats | 1 748 + 10 567 | 1 578 + 11 209 | eau (type 6) ou peinture bleue ? (E) | 6 ou 3 |

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
- **Herbe et gravier** : les textures de détail CC0 (Grass001 / Gravel023, `public/assets/detail/`) sont partagées et s'appliquent **par nom** (`GRASS.NNN`, `sand_new.NNN`, `grass-side1B.NNN`, `construction_dirt.NNN`) : rien à copier, il suffit de respecter les noms canoniques. Même calibrage d'albédo/rugosité que Monza (herbe 0,08 ; gravier 0,315 ; rugosité 0,9).
- **Ciel** : global (HDRI Kloofendal partly cloudy + IBL + brume) → `meta.json → sky` identique à Monza (jour).
- **Arbres** : le modèle n'a qu'une carte de palmier (`tentrail_70`). Demande de l'utilisateur : arbres de Monza → reprendre leurs matériaux/textures (`trees1_*`, `bushesB_*`, alpha MASK, mêmes calibrages) pour les cartes d'arbres de Yas ; si on garde des palmiers, les nommer `trees1_palm.NNN` (à trancher avec l'utilisateur).
- **Public** : `crowd.bin` complet, sans sous-échantillonnage (comme Monza : 83 112 places).
- **Mêmes sorties que Monza** : `surface.json/bin`, `barriers.bin`, `pitlane.json` (avec `limitFromS`, `limitToS`), `grassmask.bin` (classe 1 = GRASS), `crowd.bin/json`, `marshals.json`, `meta.json` (DRS, secteurs, virages, longueur, records, sources, `visualParity`), `<id>_centerline.json`.

## 4. Pipeline
Suivre `shared/PIPELINE_OPI.md` (branche `newbot-shared`) : `t1_track_import` → `t2_track_inspect` → `t3_layers` → `t4_overlap` → `t5_top` → `t6_export_tris` → `t7_assemble` ; `t8_centerline` + `centerline_v4.py` + `smooth_cl.py` ; `t9_surface_v5.py` ; `r1_bake_ao_track.py` ; `k1_export_coll.py` + `tools/coll/` ; `t10_crowd.py`, `t10_startline.py` ; `opt_track.mjs`, `build_track_tiles.mjs`, `lod_tiles.mjs`, `make_ktx2.py` ; contrôle `audit_glb.py`. Budgets : 13-20 tuiles meshopt, KTX2 UASTC + mipmaps, LOD lointain ≈ 50 %, ≤ 130 Mo de textures GPU (ici très largement tenu : textures sources ≤ 17,5 Mo en PNG), origine = ligne de départ, orientation comme Spa/Monza.

## 5. Livraison
Sur `newbot-shared` uniquement, racine `shared/assets/yas_marina_2021/` : `scene/` (`tiles.json`, `base`, `tNN` + `tNN_lod`, `tex/`), `track/`, `preview/`, `marshals.json`, `SOURCES.md` (licences), `MANQUANTS.md`, `REASSEMBLE.md`, `reassemble.sh/.ps1`. Règles de `shared/tools/push_to_gitlab_notes.md` : binaires (`.bin`, `.ktx2`, `.webp`) en base64, `.gltf` et `.json` en clair, fichiers > ~3 Mio découpés en `.part001`, `.part002`…, messages de commit terminés par `[skip ci]`, jamais deux `add_commit` en parallèle. Mettre aussi à jour `shared/assets/CIRCUITS_STATUS.md`.

## 6. Côté jeu (déjà fait dans cette branche)
- `source/game/src/core/circuit.ts` : circuit `yas` ajouté (`?circuit=yas`). Le bouton « Circuit » fait Spa → Monza → Yas Marina **seulement si `track_yas/meta.json` est publié** (sondé en HEAD) : tant que le circuit n'est pas livré, rien ne change pour Spa et Monza. Secteurs et zones DRS sont lus dans `meta.json` (`sectors.S1_end_s` / `S2_end_s`, `drs.zones[].activateS` / `endS`), la zone 80 km/h dans `pitlane.json` (`limitFromS` / `limitToS`) : **aucun nombre à recopier dans le code après la livraison**. Valeurs de repli (E) sinon.
- `source/game/src/main.ts` : `await CIRCUIT.ready(pitData)` dans `loadTrack()`.
- `.gitlab-ci.yml` : fonction `yas()` (même décodage base64 / réassemblage des parts que `monza()`) → `public/assets/yas/` et `public/track_yas/`. Si `shared/assets/yas_marina_2021` n'existe pas encore sur `newbot-shared`, le job le dit et continue ; livraison incomplète : rien n'est publié (`YAS_STRICT=1` pour faire échouer le job).
- Après livraison : lancer un pipeline sur `main` (Build → Run pipeline), puis jouer avec `?circuit=yas`.

## 7. Réception (à vérifier avant de dire « livré »)
- `tools/audit_glb.py` sur les tuiles ; aucun nom `tentrail_*` sur un sol/arbre/bâtiment dans les tuiles (noms canoniques seulement, noms d'origine dans `visualParity.materials`).
- `surface.json` : types 1, 2, 4, 5 présents ; herbe et gravier ralentissent comme à Monza ; longueur de la ligne centrale = longueur officielle ±0,5 %.
- `meta.json` : `sectors`, `drs.zones`, `pitlane.speedLimitKmh`, `sky`, `visualParity` ; `pitlane.json` : `limitFromS`, `limitToS`.
- Rendu : pas de blanc intégral (matériaux sans texture), pas de bannière de marque réelle laissée par mégarde, horizon retiré, arbres de Monza en place.

## 8. Prompt prêt à coller dans l'outil qui a Blender (celui de Monza)
> Convertis le circuit Yas Marina (GLB joint) avec le pipeline Opi en suivant à la lettre `source/docs/YAS_MARINA_CONVERSION.md` (branche `claude/yas-marina` du projet GitLab `issagabah451/project-w11-mercedes-spa`) et `shared/PIPELINE_OPI.md` (branche `newbot-shared`). Les matériaux d'origine s'appellent `tentrail_NN` : utilise la table du §2 et ne renomme jamais les noms canoniques. Reprends herbe, gravier, arbres, ciel et public de Monza. Livre dans `shared/assets/yas_marina_2021/` sur `newbot-shared` (base64, parts ≤ 3 Mio, commits `[skip ci]`) puis préviens-moi.
