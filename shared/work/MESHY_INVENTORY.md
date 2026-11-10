# Inventaire Meshy (et props associés) — lot 1

Tous les props de `shared/assets/spa_pits/props/` (29 fichiers, branche `newbot-shared`) doivent être **optimisés puis placés** sur la voie des stands de chaque circuit du lot 1 (Bahreïn, Monza, Imola), tenues 2020 par équipe. Rien ne reste « dans un dossier en attendant ».

Le pack source `incoming/props/INVENTAIRE.md` / `Meshy_AI_f1_*` **n’est pas** dans `newbot-shared` aujourd’hui : on part des GLB déjà passés par gltf-transform (meshopt + KTX2 512) décrits dans `spa_pits/SOURCES.md` et `USAGE_ASSETS.md`.

Tailles « avant lot 1 » = fichiers décodés de `spa_pits/props/` (10 nov 2026, Atlantic/Canary). La colonne « après » sera remplie à l’optimisation Blender (retopo/décimation, LOD, KTX2/WebP, instancing). Les clips PNJ animés restent ceux du pack Spa (keyframes / glTF) : pas de nouvelle animation IA.

Licences : Meshy AI — [conditions d’utilisation](https://www.meshy.ai/terms-of-use) (pas d’attribution). MacBook et iMac = Sketchfab **CC BY 4.0** (attribution ci-dessous).

## Props `spa_pits/props/` (29)

| Fichier | Origine | Tris | Taille avant | Après (tris / octets) | Placement prévu (chaque circuit lot 1) | État |
|---|---|---:|---:|---|---|---|
| `car_stands.glb` | Meshy | 11 992 | 850 684 | à optimiser | Chandelles aux places de parc, 1 jeu par voiture / case | à placer |
| `cooling_fan.glb` | Meshy | 9 998 | 721 872 | à optimiser | Ventilateur de refroidissement, 1 par voiture en case | à placer |
| `driver_cockpit_screen.glb` | Meshy | 8 142 | 764 976 | à optimiser | Bras moniteur pilote, garage joueur (`driver_monitor_arm`) | à placer |
| `empty_garage_shell_textured.glb` | Meshy | 30 000 | 1 074 784 | à optimiser (lourd) | Garages FIA fermés / LOD lointain (portes `keep_closed`). Pas laissé inutilisé : complément de la coque procédurale, pas un doublon du garage joueur | à placer |
| `front_jack_mechanic.glb` | Meshy (pose statique) | 20 000 | 823 196 | à optimiser | Cases lointaines (LOD) ; au premier plan : PNJ animé `npc_mechanic` clip `jack_push` | à placer |
| `front_wing_stand.glb` | Meshy | 9 999 | 804 448 | à optimiser | Support d’aileron avant, 1 par voiture | à placer |
| `grandstand_crowd.glb` | Meshy | 39 996 | 1 236 220 | à optimiser (lourd) | Tribunes / hospitality **côté voie des stands** lorsqu’elles existent (Imola, Monza, Bahreïn). Ce n’est pas le système foule piste d’Opi ; c’est un remplissage local de la pit lane | à placer |
| `imac_style_pc.glb` | Sketchfab CC BY 4.0, [ISUS](https://sketchfab.com/3d-models/pc-in-apple-imac-style-df8163b56ada446fbfac3a9d43ea5256) | 23 244 | 520 864 | déjà allégé (logos retirés) | 4 écrans sur le bureau ingénieurs (garage joueur) | à placer |
| `macbook_pro_m3_16.glb` | Sketchfab CC BY 4.0, [jackbaeten](https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4) | 21 283 | 1 273 704 | déjà allégé (logo / fond remplacés) | 2 portables du bureau ingénieurs | à placer |
| `nitrogen_bottle_cart.glb` | Meshy | 34 830 | 1 332 944 | à optimiser (lourd) | Chariot d’azote, 1 par voiture | à placer |
| `overhead_lighting.glb` | Meshy | 40 520 | 1 528 832 | à optimiser (lourd) | Éclairage sous portiques et dans le garage joueur (praticables). Complète le plafond procédural, ne le remplace pas partout | à placer |
| `pit_board.glb` | Meshy | **113 394** | 2 490 384 | **priorité décimation** | Panneaux d’équipe au-dessus des cases / au muret. Instancié ×10 : budget tris obligatoire avant pose | à optimiser puis placer |
| `pit_crew_gunner.glb` | Meshy (pose statique) | 20 000 | 793 948 | à optimiser | Cases lointaines ; premier plan : `npc_mechanic` | à placer |
| `pit_crew_mechanic.glb` | Meshy (pose statique) | 20 000 | 796 052 | à optimiser | Cases lointaines ; premier plan : `npc_mechanic` (`tyre_change`, `idle`) | à placer |
| `pit_crew_tyre_off.glb` | Meshy (pose statique) | 19 996 | 765 412 | à optimiser | Cases lointaines, côté pneu sortant | à placer |
| `pit_crew_tyre_on.glb` | Meshy (pose statique) | 19 988 | 816 096 | à optimiser | Cases lointaines, côté pneu entrant | à placer |
| `pit_gantry_overhead.glb` | Meshy | 16 792 | 1 025 264 | à optimiser | Portique au-dessus de chaque case (`gantry_car*` / `anchor_pitbox_{team}`) | à placer |
| `pit_stop_box_ground.glb` | Meshy | 4 000 | 719 092 | textures logos équipe à brancher | **Marquage au sol des cases** (voie de travail), logos 2020. Alias visuel des spots `anchor_pitbox_{team}` | à placer |
| `pit_wall_perch.glb` | Meshy | 19 992 | 973 672 | à optimiser | 10 stands du muret (`anchor_pitwall_{team}`), auvents aux couleurs d’équipe, ingénieurs (`pitwall_watch` / `pitwall_talk`) | à placer |
| `quick_lift_jack.glb` | Meshy | 10 000 | 804 964 | à optimiser | Cric avant (`anchor_jack_front`) dans chaque case joueur / visible | à placer |
| `race_engineer.glb` | Meshy (pose statique) | 19 994 | 827 272 | à optimiser | LOD lointain ; premier plan : `npc_engineer` (tenues 2020) | à placer |
| `rear_quick_lift_jack.glb` | Meshy | 10 000 | 789 892 | à optimiser | Cric arrière (`anchor_jack_rear`) | à placer |
| `start_lights_gantry.glb` | Meshy | 25 092 | 991 196 | à optimiser | Structure de feux : sortie des stands (lentilles Bahreïn / Spa) et, si besoin, portique de départ | à placer |
| `telemetry_station.glb` | Meshy | **69 442** | 1 899 024 | **priorité décimation** | Fond du garage joueur ; éventuellement un exemplaire au muret | à optimiser puis placer |
| `timing_leaderboard.glb` | Meshy | 6 000 | 680 020 | OK | Tour / écran de chronométrage en pit lane (marque type F1 déjà retirée) | à placer |
| `tire_rack.glb` | Meshy | 15 000 | 782 404 | à optimiser | Rack de pneus, 1 par voiture, avec couvertures / trains | à placer |
| `track_marshal.glb` | Meshy (pose statique) | 19 998 | 876 272 | à optimiser | Postes lointains ; premier plan : `npc_marshal` (drapeaux) | à placer |
| `wheel_gun.glb` | Meshy | 5 194 | 675 652 | OK | 4 pistolets par voiture (`wheelgun_car*_*`) | à placer |
| `workbench_cabinet.glb` | Meshy | 31 162 | 1 245 908 | à optimiser (lourd) | 2 établis par voiture au garage joueur ; 1 en fond des autres boxes si le budget le permet | à placer |

Total actuel : **29 fichiers, 28,9 Mio, ~700 k tris hors instancing**. Après pose ×10 cases, `pit_board` et `telemetry_station` dépasseraient le budget iPhone s’ils ne sont pas décimés.

## Déjà intégrés dans `garage_player.glb` (à répliquer sur chaque case)

Nœuds à instancier / recopier avec le garage joueur, issus du même pack (couvertures, trains, outils) :

- `tyre_blanket_car{1,2}_{FL,FR,RL,RR}` — couvertures chauffantes
- `tyre_car{1,2}_{FL,FR,RL,RR}` — trains prêts
- `wheelgun_car{1,2}_{1..4}`, `jack_front` / `jack_rear`, `nitrogen_cart_car*`, `tire_rack_car*`, `cooling_fan_car*`, `car_stands_car*`, `front_wing_stand_car*`, `gantry_car*`

## PNJ (tenues 2020, clips existants)

| Fichier | Origine | Usage |
|---|---|---|
| `npc_engineer.glb`, `npc_mechanic.glb`, `npc_marshal.glb` | Albedos Meshy recolorés par zone (texte poitrine / dos) + clips glTF Spa | Toutes les cases et le muret, tenues des 10 équipes 2020 (`npc_tex/npc_*_{team}_1024.ktx2`). Clips : `idle`, `jack_push`, `tyre_change`, `pitwall_watch`, `pitwall_talk`, `flag_*`, etc. Pas de nouvelle animation IA. |
| Poses statiques `front_jack_mechanic`, `pit_crew_*`, `race_engineer`, `track_marshal` | Meshy | LOD lointain uniquement (voir tableau). |

## Autres emplacements du dépôt

Recherche `Meshy_AI_*` / `incoming/props/` sur `main` et `newbot-shared` : **aucun fichier source brut** en plus des 29 props ci-dessus. Les voitures `shared/incoming/cars/` sont des GLB Sketchfab (hash), pas Meshy. Si un asset Meshy réapparaît ailleurs, il sera ajouté à ce tableau.

## Règle de placement

1. Optimiser (Blender headless, script unique `source/tools/circuits/optimize_prop.py`) avant d’instancier ×10.
2. Placer sur **toute** la voie des stands (entrée, voie rapide / voie de travail, 10 cases, muret, sortie), pas seulement le garage joueur.
3. Mettre à jour ce fichier (colonne « après », état) et la checklist de la Draft MR `!2` à chaque prop terminée.
