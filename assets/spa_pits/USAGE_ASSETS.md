# Spa — stands : à quoi sert chaque asset

Repère : glTF Y-haut, mètres, repère circuit Spa (identique à `game/public/assets/spa` et `track/*.json`).
Toutes les textures sont en KTX2 UASTC + zstd avec mipmaps, et la géométrie en meshopt (`EXT_meshopt_compression`, quantifiée).
Côté three.js, il faut `KTX2Loader` (dossier `basis/` déjà présent dans le jeu) et `MeshoptDecoder`.

## Fichiers principaux
| Fichier | Placement | Contenu / nœuds utiles |
|---|---|---|
| `garage_player.glb` | **repère local** : appliquer `pits.json → garages[i].frame` (pos + yaw) à la racine `garage_player` | Garage complet de l'équipe du joueur (94 k tris). Coque, plafond lumineux, `gantry_car1` avec `screen_1..3` (UV 0..1 plein écran, matériau `screen_live` à remplacer par une CanvasTexture ou une RenderTarget), `gantry_car2` (moniteurs statiques), `jack_front` → `jack_front_pivot` et `jack_rear` → `jack_rear_pivot`, `wheelgun_car{1,2}_{1..4}`, `tyre_blanket_car{1,2}_{FL,FR,RL,RR}` + `tyre_car*_*`, `pitbox_light` (`pitbox_red`, `pitbox_green`, émissifs éteints), empties `pitbox_stop`, `car1_park`, `car2_park` |
| `garages_lod.glb` | monde | 10 garages simplifiés `garage_lod_<team>` (atlas 1024×1280 unique, 778 tris en tout). Masquer celui de l'équipe du joueur. |
| `pitwall_stands.glb` | monde | 10 stands du muret `pitwall_<team>` (perchoir Meshy, auvent aux couleurs de l'équipe) + empties `pitwall_<team>_seat_1..4` |
| `pit_exit_lights.glb` | monde | Feu de sortie des stands : `pitexit_red`, `pitexit_green`, `pitexit_blue` (matériaux séparés, émissif 0, extras `w11_on_color` / `w11_on_intensity`) + panneau PIT EXIT |
| `npc_engineer.glb` / `npc_mechanic.glb` | à instancier (SkeletonUtils.clone) | Squelette commun de 30 os (noms Mixamo). Clips : idle, idle_var, type_laptop, look_screen, pitwall_watch, pitwall_talk, jack_push, tyre_change, walk, clap. Texture Mercedes intégrée ; les autres équipes sont dans `npc_tex/` |
| `npc_marshal.glb` | à instancier | Commissaire en tenue orange, même squelette. Clips : flag_idle, flag_wave_yellow, flag_double_yellow, flag_blue, flag_red, idle, idle_var, look_screen, walk, clap. Drapeaux skinnés : `flag_R_{yellow,blue,red,green,white}`, `flag_L_yellow`, `flagstick_L/R` |
| `marshal_lamps.glb` | monde | 16 panneaux lumineux existants rendus fonctionnels : `marshal_<n>` → `marshal_<n>_{yellow,blue,red,green}` (1 matériau par lampe, texture LED en emissiveMap, émissif 0) |
| `marshal_platforms.glb` | monde | 8 plateformes de commissaire `marshal_platform_<booth>` (là où le mur cache le commissaire) |
| `brakeboards.glb` | monde | 18 panneaux de distance 300/200/100 (`brakeboard_<virage>_<dist>`) : La Source, Les Combes, Bruxelles, Pouhon, Stavelot, Bus Stop |
| `pits.json` | — | garages ordonnés, portes, voie des stands, muret, feux, écrans, spots PNJ (voir ci-dessous) |
| `marshals.json` | — | postes lumineux (s, d, nœuds), cabines + emplacements commissaires, panneaux de distance |

## Textures à échanger
- `textures/team_<id>.ktx2` (1024², sRGB) remplace l'image du matériau `team` du garage joueur (Mercedes intégré).
- `npc_tex/npc_{engineer,mechanic}_<id>_1024.ktx2` sert de près ; `_256` de loin ou en foule (sRGB).
  À mettre en `map` du matériau `Material_0` des PNJ. Normal map et ORM sont communes et restent dans le GLB.
- Équipes (`id`) : mercedes, ferrari, redbull, mclaren, renault, alphatauri, racingpoint, alfaromeo, haas, williams.

## Mise en route (Opi)
1. **Portes** : `pits.json → doors[]`. Pour les 30 garages d'équipe (`action: "remove"`), supprimer les triangles de `box-door__far` dans `aabb_min/aabb_max`. FIA (1–5) et réserve (21, 34–39) : `keep_closed`.
2. **Garage joueur** : `garage_player` reçoit la pose `garages[team].frame` ; masquer `garage_lod_<team>`.
3. **Arrêt au stand** : la voiture s'arrête en `garages[i].pit_stop.pos`, cap `heading` (= sens de la voie, vers −X local). Les crics pivotent autour de l'axe X local de `jack_*_pivot` (environ 8–10° pour lever).
4. **PNJ du garage** : `pits.json → player_garage.npc_spots` (repère local du garage : pos, yaw, clip). Les PNJ regardent vers +Z local quand yaw = 0.
5. **Muret** : `garages[i].pitwall.seats[]` ; PNJ assis avec `npc_yaw` (face à la piste), clips pitwall_watch / pitwall_talk.
6. **Feux** : `pitexit_red/green` (sortie), `pitbox_red/green` (garage) ; allumer = `material.emissive = extras.w11_on_color`, `emissiveIntensity = w11_on_intensity`.
7. **Postes commissaires** : au chargement, `visible = false` sur les 4 lampes de chaque poste. Pour allumer : `visible = true` + `emissive` = `w11_on_color` × `w11_on_intensity` (6). Une seule couleur visible à la fois par poste (les quads sont superposés à 1,5 mm).
8. **Commissaires** : `marshals.json → booths[].marshal_spots` (2 par cabine, pos + yaw). Visibilité des drapeaux selon le clip :
   - flag_idle / flag_wave_yellow → `flag_R_yellow`
   - flag_double_yellow → `flag_R_yellow` + `flag_L_yellow` + `flagstick_L`
   - flag_blue → `flag_R_blue`
   - flag_red → `flag_R_red`
   - `flagstick_L` masqué hors double jaune.

## Props Meshy optimisés (`props/`, KTX2 512 + meshopt)
| Prop | Usage dans la scène |
|---|---|
| car_stands | chandelles près des places de parc (garage) |
| cooling_fan | ventilateur de refroidissement, 1 par voiture |
| driver_cockpit_screen | bras moniteur pilote (`driver_monitor_arm`) |
| empty_garage_shell_textured | non utilisé (coque procédurale plus propre) — fourni pour référence |
| front_jack_mechanic, pit_crew_gunner, pit_crew_tyre_off, pit_crew_tyre_on, pit_crew_mechanic, race_engineer, track_marshal | poses statiques (foule lointaine) ; les PNJ animés en sont dérivés (race_engineer, pit_crew_mechanic, track_marshal) |
| front_wing_stand | support d'aileron avant, 1 par voiture |
| grandstand_crowd | non utilisé ici (la foule reste à Opi, consigne 9) |
| imac_style_pc (CC BY, ISUS) | 4 écrans sur le bureau des ingénieurs (logos retirés) |
| macbook_pro_m3_16 (CC BY, jackbaeten) | 2 portables du bureau des ingénieurs (logo et fond d'écran remplacés) |
| nitrogen_bottle_cart | chariot d'azote, 1 par voiture |
| overhead_lighting | non utilisé (plafond procédural) |
| pit_board | panneautage, réutilisable au muret |
| pit_gantry_overhead | portique de ravitaillement/air du garage (`gantry_car*`) |
| pit_stop_box_ground | non utilisé (marquages procéduraux `pitbox_markings`) |
| pit_wall_perch | stands du muret (×10, échelle 2,1) |
| quick_lift_jack, rear_quick_lift_jack | `jack_front`, `jack_rear` |
| start_lights_gantry | feu de sortie (base) |
| telemetry_station | poste télémétrie au fond du garage |
| timing_leaderboard | `timing_tower` (marque rouge type F1 retirée) |
| tire_rack | racks de pneus, 1 par voiture |
| wheel_gun | `wheelgun_car*_*` |
| workbench_cabinet | 2 établis par voiture |
