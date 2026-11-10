# Kit de pièces réutilisables — sources

Licence des GLB circuits : **Dave Love** (Sketchfab `Tyler_Dave`), **CC BY 4.0**.
Pack Spa stands / PNJ / props : voir `shared/assets/spa_pits/SOURCES.md` et `USAGE_ASSETS.md`.
Date d’extraction : 10 novembre 2026 (heure des Canaries, UTC+0).

Ce kit rassemble des **pièces fonctionnelles** déjà présentes sur Spa, Bahreïn (conversion repo),
Imola, Monza, Silverstone et le Nürburgring. On copie, on n’invente que si la pièce
n’existe nulle part (liste fermée § 2.3 des consignes).

Les GLB du kit sont des binaires décodés (les blobs GitLab de `newbot-shared` étaient
stockés en base64 littéral via MCP `add_commit` — SHA vérifiés d’après `REASSEMBLE.md`).

---

## Inventaire

### Feux d’entrée / sortie des stands — `pit_exit_lights/`

| Fichier | Source | Nœuds / matériaux d’origine | Notes |
|---|---|---|---|
| `spa_pit_exit_lights.glb` (58 876 o, sha256 `b02a68497963b807…`) | Spa `shared/assets/spa_pits/pit_exit_lights.glb` | `pitexit_red`, `pitexit_green`, `pitexit_blue`, housings, `pitexit_pole`, `pitexit_sign` | Déjà placé à Spa (`pits.json → pit_exit_lights`, s=949). Matériaux `pitexit_*_lamp`, émissif 0, extras `w11_on_color` / `w11_on_intensity`. |
| `bahrain_pitexit.glb` (25 320 o) | Bahreïn conversion repo, tuile `scene/t12.gltf` | `pitexit_red`, `pitexit_green`, `pitexit_housing`, unité B `pitexit_b_c{1,2}_r{1..3}_{red,blue,green}` | **Source canonique** (GP 2020, feux déjà détachés par le pipeline `b9_lights.py`). Géométrie + matériaux émissifs, pas de texture. Ancre : `anchor_pit_exit_light`. |

**Greffe Spa :** non nécessaire. Spa a déjà un feu de sortie complet (rouge / vert / bleu) ancré dans `pits.json`. On conserve le feu local (règle « équivalent aussi bon »). Le modèle Bahreïn (unité B rouge/bleu/vert, 2 colonnes) reste la source canonique du kit pour les circuits qui n’en ont pas (Monza, Imola, etc.).

### Feux de case (lâcher) — `pit_box_lights/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `spa_pitbox_lights.glb` | Spa `garage_player.glb` | `pitbox_light` (parent), `pitbox_red`, `pitbox_green` ; mats `lamp_red`, `lamp_green` | **Pièce trouvée** : pas de création Blender. À instancier sur chaque case (`pitbox_red` / `pitbox_green`, ancre `anchor_pit_box_light`). |

### Muret des stands — `pit_wall/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `spa_pitwall_stands.glb` | Spa `pitwall_stands.glb` | `pitwall_<team>` + `pitwall_<team>_seat_1..4` (10 équipes 2020) | Source principale. Le muret déjà présent dans la scène Bahreïn se conserve s’il est bon (à détacher lors de l’application du kit). |

### Garages / devantures 2020 — `garages/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `spa_garage_player.glb` (11 140 772 o, sha256 `426dca21e567b2de…`) | Spa `garage_player.glb` | Voir `USAGE_ASSETS.md` : `screen_1..3` (`screen_live`), `jack_*`, `pitbox_*`, `pitbox_stop`, `car1_park`, `car2_park` | Garage joueur, repère local, frame `pits.json → garages[i].frame`. |
| `spa_garages_lod.glb` | Spa `garages_lod.glb` | `garage_lod_<team>` | 10 garages simplifiés, atlas unique. |
| `team_textures/team_<id>.ktx2` | Spa `textures/` | matériau `team` | 10 livrées 2020. |
| `spa_pits.json` | Spa `pits.json` | — | Référence d’ancrage. |

Géométrie locale d’Imola (`garages.001`, `garage_spons.001`, `box_wall.001`, `pit_conc.001`), Nürburgring, Silverstone, Monza : extraction Blender par matériau, en attente (un job Blender tiers — Safety Car Eko — occupe la machine ; un seul Blender à la fois).

### Intérieur garage joueur — `garage_interior/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `spa_props/props/*` | Spa `spa_pits/props/` | crics, pistolets, écrans, PCs, nitrogen, établis, etc. | Pack Meshy déjà optimisé (KTX2 512 + meshopt). |
| `spa_pitscreens.glb` | Spa `garage_player.glb` | `screen_1`, `screen_2`, `screen_3`, mat `screen_live` (UV 0..1, flipY=false) | Surfaces d’ancrage `anchor_pitscreen_1..3` (alias `anchor_screen_*`). Eko y envoie le live. |
| `spa_jacks.glb` | Spa `garage_player.glb` | `jack_front` / `jack_front_pivot`, `jack_rear` / `jack_rear_pivot` | Ancres `anchor_jack_front` / `anchor_jack_rear`. Rotation X locale ~8–10°. |

### PNJ — `npc/`

| Fichier | Source | Notes |
|---|---|---|
| `npc_engineer.glb`, `npc_mechanic.glb`, `npc_marshal.glb` | Spa | Squelette Mixamo 30 os, clips idle/talk/type/pitwall/flag_*. |
| `npc_tex/npc_{engineer,mechanic}_<team>_{1024,256}.ktx2` | Spa `npc_tex/` | Une tenue par équipe 2020. |

### Panneaux LED commissaires — `marshal_panels/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `spa_marshal_lamps.glb` + `spa_marshals.json` | Spa (16 postes, déjà compris par `fieldView.ts`) | `marshal_n_{yellow,blue,red,green}` | Source principale, noms d’ancres stables. Ne pas refaire les 16 postes Spa. |
| `bahrain_marshal_1.glb`, `bahrain_marshal_2.glb` | Bahreïn repo, tuiles `t13` / `t11` | `marshal_1_*`, `marshal_2_*` | Les 2 seuls panneaux natifs du modèle (portiques). Les autres postes du tracé recevront le module Spa / Imola `digiflag`. |

### Cabines / postes — `marshal_posts/`

| Fichier | Source | Notes |
|---|---|---|
| `spa_marshal_platforms.glb` | Spa (8 plateformes) | Là où le mur cache le commissaire. |
| Cabines Nürburgring `marshal_boxes.001`, `marshall_box_old.001` et Silverstone `marshall.001` / `.003` | extraction Blender à venir (lot 1, extraction seulement, pas de conversion). | Source prévue pour les circuits sans cabine. |

### Portique et feux de départ — `start_lights/`

| Fichier | Source | Nœuds | Notes |
|---|---|---|---|
| `bahrain_startlights.glb` (66 920 o) | Bahreïn repo, tuile `t13.gltf` (détaché par `b9_lights.py`) | `startlight_housing`, `startlight_c{1..5}_r{1..4}` (r1–r2 rouge, r3 vert, r4 ambre) | Déjà présent sur Bahreïn : **conserver**. 5 colonnes × 4 rangées. Pour le contrat : `startlight_1..5` = les 5 colonnes (rangs rouges de séquence FIA) + `anchor_start_lights`. |
| Portique Imola `StartBridgeStructure` / `FrontPanel` / `BackDisplay` / `starts` | extraction Blender à venir | Source prévue pour Monza (feux de départ manquants, `MANQUANTS.md`). |

`props/start_lights_gantry.glb` (Spa) est une base de feu de **sortie**, pas un portique FIA 5 feux — non utilisé comme feux de départ.

### Panneaux de distance — `distance_boards/`

| Fichier | Source | Notes |
|---|---|---|
| `spa_brakeboards.glb` (18 panneaux 300/200/100 : La Source, Les Combes, Bruxelles, Pouhon, Stavelot, Bus Stop) | Spa | Déjà calé sur Spa. Pour les autres tracés : poser aux vrais points de freinage 2020, pas un rythme décoratif. |
| Nürburgring `panels_dist.001`, Silverstone `distanz.001` | extraction Blender à venir | Sources de secours / variantes réelles 50–200 m. |

### Signalétique pit lane — `pit_signage/`

Imola `pitsign.001` : extraction Blender à venir. **Panneau 80 km/h** : **absent**. Imola `pitsign.001` est un panneau **50 km/h** (texture « IMBLA / 50 », utile comme signalétique 50). Silverstone `distanz.001` = flèches de virage + panneau rouge. Nürburgring `panels_dist.001` = 200 / 100. Spa = 300/200/100. **Une** création Blender unique (liste fermée) reste à faire, puis kit.

### Mâts / projecteurs de nuit — `night_floodlights/`

**Absents** de Spa, Bahreïn, Imola, Nürburgring, Silverstone, Monza (confirmé par inventaire GLB + `bahrain/MANQUANTS.md`). Candidat de la liste fermée § 2.3 : **création Blender unique**, scriptée, ultra réaliste (mât type stade, projecteurs, blob au sol émissif / lightmap — 0 à 4 lights dynamiques au runtime). Créé le 10 nov 2026 (Atlantic/Canary) : `night_floodlights/stadium_floodlight_mast.glb` (mât 36 m, 3 rangées × 6 projecteurs, inclinaison 18°, 5500 K, 3862 tris, 207 Kio). Origin = centre de la base. À instancier aux vrais emplacements ; emission Cycles → lightmap, pas une lumière runtime par projecteur.

### Parité visuelle — `visual_parity/`

Pointeurs vers `shared/work/SPA_VISUAL_PARITY.md`, `public/assets/detail/`, `public/assets/sky/`. Pas de copie de tribunes / piste / arbres.

---

## Classement des feux rouges / verts (Imola, Nürburgring)

En attente de l’extraction / des centroïdes (chargement Blender). Hypothèse de travail, à confirmer par position s/d le long de la ligne centrale :

- Imola `red_light.001` / `green_light.001` + `starts.001` + `StartBridge*` : probablement feux de **départ** (pont) et/ou de case ; les feux de **voie** viendront de Bahreïn si ce ne sont pas des feux de pit exit.
- Nürburgring `red_lights.001` / `green_lights.001` / `lights_emissive.001` + `gantry.001` : à classer (voie vs case vs départ) avant copie.
- Monza `lights.005` : souvent des lampadaires (à confirmer) — ne pas les prendre pour un feu de sortie. Le modèle a un `signal_1` 3 lampes (s ≈ 36 m) déjà noté dans `marshals.json`.

---

## Créations Blender (liste fermée, preuves)

| Pièce | Absente de Spa, Bahreïn, Imola, Nürburgring, Silverstone, Monza ? | Décision |
|---|---|---|
| Mâts / projecteurs de nuit | Oui (aucun matériau / nœud floodlight / stadium light dans les 6 GLB audités) | **Créer** (une fois) |
| Feu de case unifié | Non — présent dans Spa `garage_player.glb` (`pitbox_red` / `pitbox_green`) | **Copier** |
| Panneau 80 km/h | Oui (Imola pitsign = 50 km/h, pas 80 ; autres sources = boards / flèches) | **Créer** (une fois) |

---

## Ancres contractuelles à poser à l’application du kit

Noms stables (`CAHIER` § 5.2 + consignes § 6) : `anchor_garage_stop`, `anchor_garage_park`, `anchor_jack_front` / `_rear`, `anchor_pitscreen_1..3`, `anchor_engineer`, plus `anchor_marshal_post_{n}`, `anchor_light_panel_{n}`, `anchor_pit_exit_light`, `anchor_pit_box_light`, `anchor_pit_entry` / `_exit`, `anchor_pitbox_{team}`, `pitbox_red` / `pitbox_green`, `anchor_pitwall_{team}`, `startlight_1..5`, `anchor_start_lights`, `anchor_grid_{1..20}`, `anchor_sc_line_1` / `_2`, `anchor_crane`. Un `anchors.json` par circuit.


---

## Ciel de nuit — `public/assets/sky/sky_night_*` (préparé, 10 nov 2026, Atlantic/Canary)

Nouveau HDRI, même pipeline que `source/tools/make_sky.py` (hémisphère haut + 6° sous l’horizon, disque lumineux écrêté, encodage `x/(1+x)`, KTX2 UASTC linéaire + ZSTD).

- Source retenue : [Poly Haven qwantani_night](https://polyhaven.com/a/qwantani_night) (CC0), 4K. Voie lactée + étoiles, faible lueur d’horizon — adapté à Bahreïn (et plus tard Yas / Marina Bay).
- Alternative plus sombre conservée en archive de travail : `dikhololo_night` (CC0), non déployée.
- Fichiers (staging `/workspace/f1work/sky_night/`, à copier vers `public/assets/sky/`) :
  - `sky_night.json` (scale=2.0, vMax=0.533, elev soleil/lune ≈ −5°)
  - `sky_night_4k.webp` (4096×1092), `sky_night_2k.webp`
  - `sky_night_4k.ktx2` (2,3 Mio, 13 mip, UASTC + ZSTD, `R8G8B8A8_UNORM` linéaire)
- Le jeu ne charge aujourd’hui que `assets/sky/sky.json` + `sky_4k` (`skydome.ts`). Un branchement nuit (meta circuit `lighting: "night"` ou `?night=1`) est prévu dans le lot 1, avec `uSunI` bas (pas de disque solaire de jour).


---

## Clips d’animation NPC — réutiliser le pack Spa, rien générer

Les GLB `npc_engineer`, `npc_mechanic` et `npc_marshal` (pack `spa_pits`, déjà copiés dans `kit_pieces/npc/`) embarquent des clips glTF nommés, rigs propres, boucles courtes. **On les pose tels quels** sur tous les circuits du lot 1. Pas de génération d’animation (pas de vidéo, pas d’image-séquence, pas de clip « IA »). Toute retouche éventuelle se ferait en keyframes Blender sur le rig existant, puis réexport glTF.

| Fichier | Clips (durée) |
|---|---|
| `npc_engineer.glb` / `npc_mechanic.glb` | `idle` (4,03 s), `idle_var` (6,03 s), `type_laptop` (3,03 s), `look_screen` (4,03 s), `pitwall_watch` (5,03 s), `pitwall_talk` (4,03 s), `jack_push` (2,03 s), `tyre_change` (2,43 s), `walk` (1,03 s), `clap` (1,23 s) |
| `npc_marshal.glb` | `idle`, `idle_var`, `look_screen`, `walk`, `clap`, plus `flag_idle` (4,03 s), `flag_wave_yellow` (1,23 s), `flag_double_yellow` (1,23 s), `flag_blue` (1,03 s), `flag_red` (2,03 s) |

Les JSON Spa (`pits.json` sièges muret, `marshals.json` `marshal_usage`) référencent déjà ces noms de clips. Les `pits.json` / `anchors.json` des nouveaux circuits doivent les reprendre à l’identique.


---

## Extractions Blender (10 nov 2026, Atlantic/Canary)

Premier passage `extract_kit_by_material.py` (Blender 4.5.9 LTS headless), après l’import Imola `a1` (`t1_raw.blend`, 238 Mio).

**Limite de ce passage :** toutes les faces d’un même matériau sont fusionnées en un seul GLB. Les boîtes englobantes couvrent parfois tout le circuit (ex. Imola `pitsign.001` 545 m de large, Silverstone `marshall.001` 1,1 km). Ces fichiers servent à l’inventaire, aux textures et au classement. Un second passage du **même** script, étendu pour séparer par objet / instance, produira les unités instanciables — pas une nouvelle expérimentation.

| Source | Pièces | Notes |
|---|---|---|
| Imola `t1_raw` | 16/16 demandées | `StartBridgeStructure/FrontPanel/BackDisplay`, `starts`, `red_light` / `green_light`, `pitsign` (texture 50 km/h), `digiflag` + poteau, `Main_board`, `display01`, garages / props. Classement feux après projection s/d. |
| Silverstone (extrait seul) | 6/7 | `marshall.003` introuvable (seul `marshall.001` existe). `distanz.001` = flèches, 20 tris. |
| Nürburgring (extrait seul) | 17/17 | `red_lights` / `green_lights` / `lights_emissive` / `gantry` / `gantry_b` / `timetower` / `panels_dist` (200/100) / `marshal_boxes`. Classement feux après s/d. |
| Monza source (extrait seul) | 3/3 | `lights.005` : bbox 2,2 × 0,25 × 1,1 m, 30 tris — compatible lampadaire, **pas** un feu de sortie. `box.005` / `box_M.005` = bâtiments stands (déjà dans la conversion repo). |

Rapports bruts : `/workspace/f1work/kit_extract/<circuit>/report.json`.
