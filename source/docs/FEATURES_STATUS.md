# État des fonctionnalités — PROJECT W11

Légende (honnête) : **Non commencé** / **En cours** / **Implémenté** (codé, pas de test auto) / **Testé** (test automatique Node ou Playwright en rendu logiciel SwiftShader, viewports iPhone paysage 844×390 et 932×430 simulés).
**Aucune ligne n'est « Validé »** : rien n'a pu être essayé sur un vrai iPhone / Safari.

| Domaine | Fonction | État | Preuve / remarque |
|---|---|---|---|
| Architecture | Modules (core, physics, render, audio, controls, ui) | Implémenté | `docs/ARCHITECTURE.md` |
| Boucle | Pas fixe 500 Hz + interpolation rendu | Testé | tests/physics.test.ts, tour démo Playwright |
| Physique | Pneus Pacejka + température, usure, pression | Testé | tests/physics.test.ts (valeurs E/P, `RESEARCH_W11.md`) |
| Physique | Suspension, transfert de charge, aéro + sol, DRS | Testé | test physique ; vitesse fin S1 327,5 km/h sim vs 328,4 réel |
| Physique | Hybride ERS (MGU-K 120 kW P), freins (température, répartition) | Testé | compteur par tour corrigé : 4,00 MJ déployés / 1,29 MJ récupérés (tests/physics.test.ts) |
| Physique | DAS (touche X / bouton) | Implémenté | effet pincement simplifié (E) ; visuel : volant tiré de 35 mm (E) |
| Physique | Calibrage : tour IA 1:41,75 vs pole réelle 1:41,252 | Testé (tests Node, pas sur iPhone) | 3 tours 1:41,75–1:41,86 ; 0-100 2,57 s, 0-200 4,58 s (réf. E 4,5–5 s), Vmax 325,3 / DRS 339,4 km/h, freinage 300→80 73,6 m ; tous les tests physique OK |
| Contrôles | Pédales tactiles analogiques multi-doigts | Testé | Playwright (CDP touch) : gaz 1,00, frein voir rapport |
| Contrôles | Direction tactile (glisser), multi-touch gaz+direction | Testé | dir 0,65 / 0,50 |
| Contrôles | Gyroscope iOS (permission DeviceOrientation, paysage gauche/droite via screen.orientation) | Testé (simulé) | tests/gyro.test.ts : 8/8 avec événements deviceorientation fictifs ; **non testé sur un vrai capteur** |
| Contrôles | Boîte auto / manuelle (+/−), clavier | Implémenté | |
| Audio | Moteur multi-couches, transmission, vent, pneus, sons UI | Testé hors ligne | tests/audio.mjs : WAV d'un tour 110 s (`out/audio/demo_tour_audio.wav`), crête −2,6 dBFS, RMS −18 dBFS, 0 clic, 0 silence ; **non écouté** ; droits du son moteur **inconnus** |
| Caméras | Poursuite, proche, T-cam, cockpit, TV, libre | Testé | captures 08_cam_* |
| Animations | Roues, braquage, suspension, volant/pilote, disques incandescents, volet DRS (25°, E) | Testé (DRS) / Implémenté (reste) | volet séparé dans Blender + GLB, tests/drs.mjs OK |
| Rendu | IBL + PMREM, clearcoat/carbone, ombres douces, GTAO (high/ultra), exposition/contraste réglés | Testé (headless) | hybride raster + lumière précalculée, **pas de ray tracing temps réel** ; avant/après `out/app/final_avant_apres_*.png` |
| Rendu | AO Cycles cuite par sommet (piste) ; reflets par sonde cube dynamique (au lieu du SSR) | Testé (headless) | bake 199 s, 413 objets ; sonde 64/128/256 px selon qualité ; pas de SSR (trop coûteux sur iPhone) ; perf iPhone non mesurée |
| Piste | **piste PLEINE QUALITÉ pour tous les niveaux** (source la plus détaillée `spa_assembled_ao` : 1,18 M triangles, décors complets, textures natives jusqu'à 8192×1024 en WebP q92/q95 sans redimensionnement, AO Cycles cuite, meshopt) découpée en 13 tuiles (`assets/spa/`, `tools/build_track_tiles.mjs`) chargées les plus proches d'abord (5 avant le départ, le reste en arrière-plan), textures partagées : 77 textures uniques ≈ 292 Mo GPU (E, risque mémoire iPhone non vérifié) | Testé (headless) | `tests/app.mjs` vérifie 13/13 tuiles et 77 textures uniques ; non testé sur iPhone |
| Sessions | Contre-la-montre, chrono par portes, 3 secteurs, tours invalides (limites de piste) | Testé | tour démo 103,313 s · S 28,04/45,35/29,93 |
| Sessions | Reset, pause, collisions murs | Testé (pause) / Implémenté (reset, collisions) | |
| UI | Menu style Apple, Réglages, Options, À propos, HUD paysage, message portrait | Testé | captures 01–05, portrait_rotate |
| Qualité | Niveaux low/medium/high/ultra ; défaut iPhone = medium + résolution adaptative (min 0,55) | Testé (headless) | `?q=` ; perf iPhone non mesurée |
| PWA | Manifest plein écran paysage, icônes, service worker | Implémenté | iOS : pas de verrouillage d'orientation garanti, cache limité (~50 Mo par origine selon versions) |
| Livraison | dist/ 68,5 Mo (HTTPS / GitLab Pages), zip 66,6 Mo, publish/ (CI SHA-256 simulée OK) ; fichier unique non reconstruit (obsolète) | Testé (headless) | |
