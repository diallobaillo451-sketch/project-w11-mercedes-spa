# STATUS — PROJECT W11 (statuts honnêtes : non commencé / en cours / implémenté / testé / validé)
Dernière mise à jour : 2026-11-03 07:35 (heure Canaries, UTC+0) — piste pleine qualité + publication GitLab

« Testé » = vérifié automatiquement dans Chrome headless (rendu logiciel SwiftShader, viewport iPhone paysage). **Rien n'est « validé »** : aucun test sur un vrai iPhone.

| Bloc | Statut | Détail |
|---|---|---|
| Audit assets | testé | `docs/AUDIT.md`, `reports/` |
| Voiture : roues/étriers/disques séparés + pivots, pilote + clip `steer` | testé | rendus Blender + three.js |
| Casque Hamilton 2020 | testé | `out/miniatures/` ; textes sponsors = approximations |
| Piste assemblée anti z-fighting, qualité maximale | testé (headless) | **piste PLEINE QUALITÉ pour tous les niveaux** (source la plus détaillée `spa_assembled_ao` : 1,18 M triangles, décors complets, textures natives jusqu'à 8192×1024 en WebP q92/q95 sans redimensionnement, AO Cycles cuite, meshopt) découpée en 13 tuiles (`assets/spa/`, `tools/build_track_tiles.mjs`) chargées les plus proches d'abord (5 avant le départ, le reste en arrière-plan), textures partagées : 77 textures uniques ≈ 292 Mo GPU (E, risque mémoire iPhone non vérifié) |
| Ligne centrale 3D + surface de collision (types de sol) | testé | `game/public/track/surface.*` |
| Physique (pas fixe 500 Hz + interpolation, pneus Pacejka T°/usure/pression, suspension, aéro+DRS, hybride ERS, freins, diff, DAS) | testé (tests Node) — tous OK | IA : 1:41,750 (3 tours 1:41,75–1:41,86 ; pole réelle 1:41,252) ; 0-100 2,57 s / 0-200 4,58 s (E) ; Vmax 325,3 km/h, DRS 339,4 ; 332,3 km/h fin de Kemmel DRS (réel 328,4) ; 5,9 g ; ERS 4,00 MJ déployés / 1,40 MJ récupérés |
| Recherche W11 | implémenté | `docs/RESEARCH_W11.md` (P/M/E + 13 sources) |
| Boucle de jeu, sessions (contre-la-montre, essais, démo), chrono par portes, secteurs, invalidation limites de piste, reset | testé (Playwright) | tour de démo chronométré en 3 secteurs |
| Contrôles : pédales tactiles analogiques, direction tactile, multi-touch | testé (Playwright, touch CDP) | |
| Gyroscope iOS (permission, vecteur gravité, paysage gauche/droite via screen.orientation) | testé (tests unitaires simulés `tests/gyro.test.ts`) | non testé sur iPhone ; convention d'angle iOS supposée W3C ; option « inverser » |
| Volet DRS mobile + DAS visuel | testé (Blender + Playwright headless) | séparé dans Blender (`blender/scripts/s1_drs_flap.py`, étape c4, coupes `out/blender/drs_coupe_ferme_ouvert.png`) puis même sélection appliquée aux GLB optimisés (`game/tools/split-drs.mjs` : 988 tris high / 404 low, nœud `DRS_pivot` au bord de fuite) ; ouverture 25° (E) animée sur `drsPos` ; DAS = volant tiré de 35 mm (E) ; captures `out/app/drs_*` |
| Caméras (poursuite, proche, T-cam, cockpit, TV, libre) | testé (captures) | |
| HUD (LED, rapport, vitesse, ERS, DRS, pneus, secteurs), menus, réglages, options, à propos, pause | testé (captures) | |
| Audio multi-couches (moteur, turbo, MGU-K, transmission, vent, pneus, bordures, impacts) | testé hors ligne (analyse du signal), non écouté | `tests/audio.mjs` → `out/audio/` : WAV d'un tour 110 s, crête −2 dBFS, RMS −18 dBFS, 0 échantillon saturé, détecteur de clics auto-testé (5/5) : 0–1 candidat par rendu ; **bug corrigé : MGU-K en watts → saturation ×14** ; droits des sons d'origine inconnus |
| Éclairage hybride « style ray tracing » (précalculé + raster : IBL/PMREM, AO Cycles cuite, sonde de réflexion, ombres douces PCF, GTAO, ACES, bloom HDR, clearcoat) | testé (headless) | pas de ray tracing temps réel (impossible sur iPhone/WebGL) ; **AO Cycles** par sommet cuite sur 413 objets / 1,89 M sommets (199 s, `blender/scripts/r1_bake_ao_track.py`, `reports/track_ao_bake.json`), dosage E réglable (`?aok ?aog ?aod ?aof`, `?bao=0`) ; **sonde cube dynamique** pour les reflets voiture (au lieu du SSR, 64 px/1 face par 2 images en medium, 128 high, 256 ultra) ; bug « image blanchie » corrigé (ombres) ; lucioles blanches sur carbone corrigées (anisotropie sans tangentes) ; clearcoat peinture 0,9 / carbone 0,5 ; exposition 0,85, soleil 3,3, env 0,3, contraste 1,06 (E) → image moins délavée ; captures `out/look/cmp_*.png` ; perf iPhone non mesurée |
| PWA (manifest paysage plein écran, service worker, icônes) | implémenté | non testé sur iPhone |
| Tests Playwright app 844×390 + 932×430 | testé | 06:33 : TOUS OK sur les 2 viewports (chargement 2,8–3,6 s en local, menus, gaz 1,00, multi-touch, frein 0,60, caméras, pause, tour démo 1:42,04 / 1:41,81, 0 erreur console, portrait) ; `out/app/` |
| dist/ + zip + publish/ | testé (headless) | **dist 68,5 Mo** (tout est téléchargé, tous niveaux) ; zip 66,6 Mo ; publish/ 130 fichiers (t04.bin et t05.bin découpés), CI simulée : SHA-256 OK, diff = dist ; **fichier unique NON reconstruit** (l'ancien `out/PROJECT_W11_single.html` utilise l'ancienne piste réduite : obsolète) |
| Docs README / ARCHITECTURE / FEATURES_STATUS / SOURCES / RESEARCH_W11 | implémenté | `docs/` |
| Validation iPhone réel | non commencé | |

## Journal
- 07:35 — Piste pleine qualité par défaut (13 tuiles, textures natives WebP q92/95, AO cuite) pour tous les niveaux et voiture high partout ; qualité adaptative par paliers (résolution 1→0,55, puis GTAO, bloom, ombre ÷2 — jamais la piste) ; SW cache v3 ; défaut Haute aussi sur iPhone ; bug « rechargement à la fermeture d'un panneau » corrigé. Tests : tsc, physique, gyro, app 2 viewports (démo 1:41,91 / 1:41,94), DRS, paliers FX : OK. dist 68,5 Mo. KTX2 non fait (pas d'encodeur gratuit disponible sur la machine).
- 06:58 — Correction accélération : muX 0,78→0,67 (E) + inertie moteur 0,045 kg·m² (E) + ligne IA suit muX + rythme IA 1,04→1,06 → 0-100 2,57 s, 0-200 4,58 s, Vmax 325,3 / DRS 339,4 km/h, tour IA 1:41,750 ; tous tests physique OK, gyro OK, app 2 viewports OK (démo 1:41,93 / 1:42,03), single OK, DRS OK ; dist/zip/single/publish reconstruits (44,6 / 43,6 / 52,3 Mo, publish 28 fichiers), CI simulée OK. Non testé sur un vrai iPhone.
- 06:35 — Fin du jalon 3 : piste unique spa_low → dist 44,6 Mo ; dist/zip/single/publish reconstruits, CI simulée OK ; tests finaux (app 2 viewports, single, DRS, gyro 8/8, audio, look, GIF) OK sauf physique 0-200 km/h (3,98 s) ; captures finales et avant/après dans out/app/ ; docs mises à jour.
- 06:16 — Rendu terminé (AO cuite dosée, sonde, carbone, exposition) ; poids : piste `spa_low` 30,6 Mo pour low/medium (défaut iOS), single-file basé dessus, cache SW v2. Suite : reconstruction dist/zip/single/publish + tests finaux.
- 05:59 — Rendu : sonde cube + AO Cycles runtime implémentées ; bug « image blanchie » trouvé (rendu forcé de la sonde avant la 1re ombre) et corrigé ; bake AO terminé, GLB piste AO en optimisation.
- 05:45 — DRS : volet séparé (Blender c4 + GLB high/low), pivot bord de fuite, sens d'ouverture vérifié en coupe, animé en jeu (test `tests/drs.mjs` OK). Suite : rendu (bake AO Cycles, reflets), poids/qualité par défaut.
- 05:37 — Jalon 3 : ERS par tour corrigé ; IA 1:41,76 ; gyroscope par vecteur gravité + tests simulés ; publish/b64 supprimé du générateur ; audio rendu hors ligne (OfflineAudioContext) → WAV + analyse : saturation massive découverte et corrigée (puissance MGU-K passée en W), limiteur de sécurité, +4 dB, 2 coutures de boucle lissées.
- 05:27 — Fichier unique corrigé ($& dans le JS minifié + icône) et testé ; GIF 7,4 Mo + MP4 1,8 Mo (out/app/demo_tour.*) ; pressions Pirelli Spa 2020 P (24,5/21,0 psi), tests physique OK (IA 1:43,38) ; dist/zip/single/publish reconstruits. Point ouvert : compteur ERS par tour affiche 0,00 MJ (à vérifier).
- 05:16 — Jalon 2c : tests app 2 viewports OK ; zip, publish/ (non publié), FEATURES_STATUS ; GIF/MP4 en cours.
- 05:06 — Jalon 2b : boucle de jeu, rendu, caméras, contrôles, UI jouables ; correctifs rendu (NaN/bloom, albédo asphalte, ACES) ; RESEARCH_W11.md ; PWA.
- 04:05 — Jalon 1 : assets, casque, piste optimisée.

## Publication GitLab — 3 nov. 2026, 07:38 (heure Canaries)
- Dépôt PUBLIC : https://gitlab.com/issagabah451/project-w11-mercedes-spa (id 88438338), 35 commits (README+SHA256SUMS, 34 lots de 4 fichiers max — limite du connecteur —, dernier lot surface.json + .gitlab-ci.yml).
- Pipeline #3021162883 (commit 8b5fcb76) : **success** ; job `pages` : décodage base64, réassemblage t04/t05, `sha256sum -c` → tous OK, `du -sh public` = 65.7M.
- App : https://issagabah451.gitlab.io/project-w11-mercedes-spa/ → curl : **302 vers projects.gitlab.io/auth** (Pages en accès « private » par défaut ; le connecteur n'a aucun paramètre pages_access_level). Playwright non lancé : URL non joignable sans connexion.
- À faire par Baillo : Paramètres → Général → Visibilité, fonctionnalités du projet, autorisations → Pages → « Tout le monde » → Enregistrer.
- Non testé sur vrai iPhone (pas « validé »).

## Correctif démarrage / fluidité iPhone — 3 nov. 2026, 08:26 (heure Canaries)
- Cause probable n°1 (implémenté, testé Chromium) : le bouton « Toucher pour démarrer » attendait le gyroscope puis `audio.init()` (resume AudioContext hors geste iOS + décodage de 14 WAV) → menu bloqué. Désormais l'audio est non bloquant et le menu s'affiche tout de suite (25–85 ms mesurés).
- Cause probable n°2 (implémenté, testé Chromium) : mémoire GPU (~293 Mo de textures WebP décodées en RGBA + RT MSAA à DPR 2) → risque de perte du contexte WebGL ou d'onglet tué sur iOS. Sur mobile : 13 grosses textures en KTX2 UASTC (ASTC sur iPhone), ~83 Mo estimés, DPR max 1,5, MSAA 2, départ sans GTAO avec qualité adaptative.
- Démarrage progressif (testé Chromium, réseau bridé à 20 Mbit/s) : les grosses textures sont téléchargées une par une APRÈS « Prêt », avec un gris provisoire en attendant. Prêt en 10,3–11,6 s (avant : 26–39 s), 19,9 Mo avant Prêt ; toutes les textures sont là à ~48 s.
- Mode sans échec automatique (testé Chromium, crash simulé) : si la session précédente s'est arrêtée brutalement, relance en low, DPR 1. Forçable avec ?safe=1, annulable avec ?safe=0. Écran d'erreur lisible + chien de garde (30 s sans progression).
- Options → Diagnostic : i/s, préréglage, mémoire estimée, appels de dessin, journal copiable, bascule du mode sans échec.
- Tests : app.mjs tous OK en 844×390 et 932×430 sur le dist (vite preview), 0 erreur console. WebKit Playwright impossible (bibliothèques système manquantes). NON testé sur un vrai iPhone.
- Publication : 9 commits GitLab (c335cea8 → 18151732), pipeline 3021319669 réussi (SHA-256 vérifiés) vers 08:27. URL publique toujours en 302 (Pages privé) : pas de test curl/Playwright possible sur l’URL publique.

## 2026-11-03 ~9:00 (heure Canaries) — correctif iPhone « GPU réinitialisé »
- Cause probable : textures voiture WebP décodées ≈ 223 Mo + composeur + sonde + ombre 2048 dès le boot.
- Voiture en KTX2/UASTC pleine résolution (w11_lh2020_high_ktx2.glb), 77/77 textures piste en KTX2.
- iPhone : streaming des tuiles < 600 m, dispose au-delà de 850 m, 1 opération / 250 ms ; démarrage sans composeur/sonde, ombre 1024, puis montée en qualité après 12 s (effets → ombre 2048 → sonde).
- Mesure Chromium (UA iPhone 844×390) : avant ≈ 240 Mo textures au boot (dont voiture 223) ; après 90 Mo au boot, 171 Mo tuiles proches, ≈ 215 Mo après montée en qualité.
- Non testé sur vrai iPhone. LOD / instancing / ombres en cascade : pas faits.

## 2026-11-09 — Grand chantier réalisme/qualité (en cours, heure Canaries)
- Lot 1 (fait, commit) : qualité max restaurée (faux plantages iOS supprimés : battement de cœur, migration réglages v2, version efface les baisses mémorisées), budget pixels 1080p·60 / 2K·30, cadence 30 i/s en 2K, échelle adaptative plus douce. Dépendances npm réinstallées dans game/node_modules (le lien vers f1sg était cassé).
- Lot 2 (fait) : audio 3D v2 (HRTF, profils caméra, bas régime réparé, gravier/herbe/cailloux/chocs) — tests/audio_low.mjs.
- Lot 3 (fait) : volant vivant (src/ui/wheel.ts), panneau réglages, drapeaux, delta, limiteur stands, carburant, caméra cockpit aux yeux, HUD cockpit en haut à gauche — tests/cockpit.mjs.
- Suite : collisions/barrières/anti-envol/dégâts/surfaces → stands → ciel/bâtiments/herbe/gravier/tribunes → pilote Blender → LOD → 20 améliorations → tests/publication.

### Lot 4 (fait) — collisions réelles + voie des stands
- Collisions contre la géométrie réelle des barrières (tools/coll : k1_export_coll.py → raster.py → segments.py → game/public/track/barriers.bin ; test balayé, type pneus/rail/béton/objet, dégâts par zone, anti-envol relatif à la pente). Test : `node tests/crash.test.ts` (28 sorties à 216/306 km/h : 0 envol > 1 m, 0 retournement, 0 traversée ; l'ancien modèle traversait 13–19 fois à Pouhon).
- Raster : niveau de roulage = grille physique (passerelles/grillages de pont ignorés), sol à deux niveaux (mur de l'entrée des stands), auvents des stands exclus de la grille physique (t9_surface_v5.py re-tiré).
- Voie des stands : tools/coll/pitpath.py (A* sur la géométrie réelle, entrée par l'Arrêt de Bus côté droit, sortie après La Source par la route de dégagement, rejoint la piste vers s≈940) → public/track/pitlane.json ; src/track/pitlane.ts ; limiteur automatique 80 km/h (s 6790 → 200), pénalité +5 s si > 80,5 km/h > 0,5 s. Test : `node tests/pitlane.test.ts` (arrivée, 0 choc, v max 73 km/h dans la zone).
- Recherche globale du point de piste le plus proche si > 25 m (épingle de La Source).
- Bus d'événements de course (src/core/events.ts) prêt pour la radio / le futur mode course multi-voitures.
- Suite : point 7 (gravier/herbe), 2 (ciel), 3 (bâtiments), 8 (tribunes), 9 (pilote), 1/14 (perf), 13 (doc).

## 2026-11-09 16:10 (heure Canaries) — Lot 5 : sol, ciel, bâtiments, tribunes, pilote
- Gravier/herbe : enfoncement + traînée (test surface OK), poussière/cailloux/mottes, détail PBR CC0 de près, herbe 3D instanciée (masque matériau, teinte du sol). Ciel HDRI CC0 Poly Haven (Kloofendal partly cloudy), soleil analytique 47,9°, IBL du même ciel, brume + brouillard. Bâtiments : albédo ×0,78 + salissure procédurale. Public instancié (Raidillon 3 676, principale 5 109). Tribune Raidillon : position vérifiée contre OSM (écart 16 m, dans l'erreur de recalage 9 m RMS) → non déplacée. Mains : prise du volant corrigée à l'exécution (carRig.fixGrip).
- Tests : physics (tour IA 1:41.763, 0 choc), crash, pitlane, surface, gyro, app.mjs 844×390 : tous OK ; mémoire GPU estimée profil iPhone 844×390@3 : ≈ 246 Mo après montée en qualité (budget < 300 Mo). i/s non mesurables (rendu logiciel). Non testé sur un vrai iPhone.
- Non fait : décimation Blender (refusée : baisserait la qualité visible), piste mouillée.
- Publication GitLab (16:20, heure Canaries) : 6 commits jeu (b021c8be → 541ce02b : 18 nouveaux fichiers, 4 mis à jour, 2 supprimés ; .gitlab-ci.yml inchangé car aucun nouveau fichier découpé), puis source/ mis à jour (59 fichiers texte).
