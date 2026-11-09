# ARCHITECTURE — PROJECT W11

TypeScript (syntaxe « effaçable », exécutable aussi par Node 24 pour les tests), three.js 0.187, Vite 8. Aucune dépendance payante.

```
game/src/
  main.ts              démarrage, écrans (boot/menu/jeu/pause), boucle RAF, liaisons UI ↔ jeu, crochet de test window.__w11
  core/game.ts         boucle à pas fixe (DT = 1/500 s, max 12 pas/image, accumulateur → alpha d'interpolation), reset, sessions
  core/session.ts      contre-la-montre / essais / démo, zones DRS, limites de piste
  physics/params.ts    paramètres W11 (P/M/E commentés)
  physics/vehicle.ts   corps rigide 6 DDL, 4 roues, suspension (ressort/amortisseur/anti-roulis/butées), aéro (hauteur, DRS), freins (T°), diff, DAS
  physics/tyre.ts      Pacejka simplifié combiné, sensibilité à la charge, T° surface/cœur, usure, pression, relaxation
  physics/powertrain.ts ICE (débit carburant FIA), turbo, MGU-K/MGU-H, batterie 4 MJ, modes moteur/ERS, boîte 8 rapports seamless
  physics/autopilot.ts pilote automatique (démo, calibrage) sur ligne de course
  track/surface.ts     grille de surface (hauteur, normale, type de sol) + ligne centrale (s, d) ; racingLine.ts
  timing/timing.ts     chronométrage par portes (ligne + 2 portes de secteur), validité, records (localStorage)
  controls/input.ts    pointer events multi-touch : pédales analogiques, direction tactile, gyroscope (DeviceOrientation + permission iOS), clavier
  render/renderer.ts   scène three.js, IBL (Sky → PMREM), soleil + ombres PCF douces, composer (Render → GTAO → garde-fou NaN → bloom HDR → sortie ACES/AgX), correction d'albédo
  render/cameras.ts    poursuite, proche, T-cam, cockpit, TV (postes fixes), libre ; interpolation, tremblement
  render/carRig.ts     animation : roues (rotation/braquage/débattement), volant + pilote (clip steer), disques incandescents (le volet DRS n'est pas un objet séparé dans le modèle : non animé)
  render/effects.ts    étincelles, poussière/graviers, fumée de pneus
  audio/audio.ts       Web Audio : boucles moteur multi-régimes en fondu, ralenti, turbo, MGU-K, transmission, vent, pneus, bordures, graviers, impacts ; doppler/pan selon la caméra
  quality/quality.ts   niveaux basse/moyenne/haute/ultra (même piste pleine qualité) + adaptation par paliers : résolution, GTAO, bloom, ombre (jamais la géométrie/les textures de piste)
  ui/                  hud.ts, panels.ts (réglages, options, à propos), settings.ts (localStorage), style.css (style Apple, verre dépoli)
public/                assets/spa/ (piste pleine qualité : tiles.json + 13 tuiles glTF meshopt + tex/*.webp partagées), voiture w11_lh2020_high.glb, track/surface.*, audio/, manifest, sw.js, icônes
tests/                 physics.test.ts, gyro.test.ts (Node), app.mjs (Playwright paysage), single.mjs, drs.mjs, audio.mjs, look.mjs, gif.mjs
tools/                 (../tools/build_track_tiles.mjs : découpe en tuiles) make-icons.mjs, inline-single.mjs, zip-dist.mjs, make-publish.mjs, split-drs.mjs
```

## Flux d'une image
`input.poll()` → `game.ctl` → `game.advance(dt)` (N pas physiques à 500 Hz) → `renderer.frame(alpha)` (états interpolés) → `audio.update()` → `hud.update()` → qualité adaptative.

## Coordonnées
glTF Y-haut, voiture orientée −Z ; `vehicle.q` = quaternion de base ; origine modèle = pos − R·cg. Piste repérée par (s abscisse curviligne, d écart latéral).

## Éclairage
Hybride raster + précalculé (pas de ray tracing temps réel) : IBL PMREM depuis un ciel analytique, ombres douces, GTAO (haute/ultra), bloom à seuil HDR, ACES par défaut (AgX via `?tm=agx`), clearcoat carrosserie, AO de la piste cuite dans Cycles (`blender/scripts/r1_bake_ao_track.py`, appliquée par `render/bakedAO.ts`), reflets voiture par sonde cube dynamique (`render/probe.ts`, au lieu du SSR), étalonnage saturation/contraste dans la passe HDR.
