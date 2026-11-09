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

## 2026-11-09 ~17:45 (heure Canaries) — Retour iPhone réel « qualité très mauvaise, pas de textures » : cause et correctifs
- **Test WebKit installé** (Playwright WebKit 2370 ; dépendances .deb extraites dans /workspace/wkdeps et copiées dans ~/.cache/ms-playwright/webkit-2370/minibrowser-*/sys/lib ; TLS : `GIO_EXTRA_MODULES=/workspace/wkdeps/gio`). Scripts : `game/tests/wk_iphone.mjs URL tag [s]`, `game/tests/shots_wk.mjs URL prefixe` (captures out/wk/).
- **Causes trouvées dans WebKit (site publié)** : (1) textures piste KTX2 chargées UNE PAR UNE après « Prêt » avec un gris provisoire → 49–55 textures encore grises après 40 s (arbres = cartes grises/noires, bâtiments gris) ; (2) voiture NOIRE : sonde de reflets PMREM sur WebKit ; (3) rendu iPhone en DPR 2 (1688×780), démarrage sans anticrénelage ni effets jusqu'à la « montée en qualité », adaptation qui baissait la résolution jusqu'à 0,7.
- **Corrections** : plus aucune texture provisoire (une tuile n'entre qu'avec ses vraies textures), 3 décodeurs KTX2, préchargement des 77 textures en arrière-plan ; qualité complète dès le départ (composeur MSAA 4×, ombre 2048, ciel 4K, anisotropie 16) ; vraie 1080p (2121×980, DPR 2,51) en Haute, 2K native (2532×1170) en Ultra ; adaptation : effets d'abord, résolution ≥ 0,85, sinon 30 i/s pleine résolution ; sonde coupée sur WebKit (reflets IBL du ciel) ; chien de garde = 1 rechargement à la même qualité (plus de bascule auto en « sans échec ») ; bandeau rouge visible si qualité réduite ; SW v8.
- **Arbres** (src/render/trees.ts) : normales sphériques par arbre, alpha-to-coverage affûté + compensation mipmaps, translucidité, vent, teinte par arbre.
- **Pilote** : tête fixe façon HANS (position imposée, ≤ 9° regard, ≤ 4° roulis vers l'intérieur, ≤ 4° vers l'avant au freinage).
- **Dégâts** : Options → Dégâts (Désactivés / Visuels / Réalistes, mémorisé) ; ailerons AV/AR séparés du maillage (affaissement puis arrachage + débris), carrossage faussé ; réparation seulement 2 s à l'arrêt dans la voie des stands ou nouvelle session.
- **Radio** (src/audio/radio.ts, tools/pack_radio.mjs → public/radio/bank.bin 3,3 Mo) : 41 messages + 95 clips, filtre radio, bips/souffle ffmpeg, 40–80 ms entre clips, bulle Apple + portrait générique (public/radio/engineer.webp, image générée), Options → Radio on/off + volume. Test : tests/radio.mjs (Chromium) OK.
- Mesures WebKit iPhone 844×390@3 (local) : canvas 2121×980, GPU estimé ≈ 281–302 Mo, 0 erreur console, textures en attente 0. Rendu logiciel → i/s non mesurables. NON testé sur vrai iPhone.
- Publication : lots 1 (0ddf84ea/83bbd789), 2 (34598b29/3f98a3d1), 3 (5c654bb2 + 1a1d6c12). Attention : le site a migré vers https://project-w11-mercedes-spa-3715f7.gitlab.io/ (l'ancienne URL redirige). Toujours mettre `[skip ci]` sur les commits intermédiaires et ne jamais lancer deux add_commit en parallèle.

### 2026-11-09 ~18:40 (Canaries) — Lot 4 publié + source/ à jour
- Garde-fous NaN : normales dégénérées corrigées dans les ShaderChunks (clearcoat sous #ifdef USE_CLEARCOAT) + passe NaN qui remplit par les voisins au lieu du noir. Commits 85b0ed8e [skip ci] + 472d7bd3 ; JS en ligne index-Cow_MYZB.js.
- Points noirs encore visibles dans WebKit logiciel (llvmpipe) en ?q=low ; Chromium propre ; profondeur 24 bits OK → probablement propre à la pile logicielle, à confirmer sur vrai iPhone.
- URL publique WebKit iPhone 844×390@3 : high · DPR max 3 · KTX2, PR 2.51, canvas 2121×980, 0 erreur. Captures out/wk/pub_v4_*.png.
- source/ mis à jour (commits 01e39505…f970f754, [skip ci]).

## 2026-11-09 ~19:30 (heure Canaries) — Lot 5 rendu publié · Lot 6 physique piste / pluie / pneus / dégâts / audio

### Lot 5 (rendu) — publié : 7603f2f2 + 1cafd84a

**Points noirs dans WebKit**
- Cause : l'anisotropie de la texture de couleur de base de la voiture. Les points apparaissent dès aniso ≥ 2 et disparaissent à aniso 1.
- Correctif : anisotropie de la voiture fixée à 1 sous WebKit. La piste reste à 16. Le réglage peut être forcé avec `?caran=N`.

**Mémoire GPU : 359 → 254–271 Mo**
- Bloom désactivé.
- Une seule cible MSAA.
- Pas de profondeur sur le canevas quand le composeur est actif.
- Ciel converti en KTX2.

**Netteté**
- CAS 0,16 sur ordinateur.
- Pas de flou de mouvement.
- Pas de composeur sur iPhone (MSAA du canevas).

### Lot 6 — implémenté et testé

**Piste** (`physics/env.ts`)
- Grilles de 8 m × 0,75 m : gomme (+3 %), marbles (−22 %), eau, flaques, saleté.
- Météo : Sec / Humide / Pluie légère / Forte pluie.
- Drainage et évaporation, trajectoire qui sèche avec le trafic virtuel.
- Aquaplaning selon le débit d'eau à évacuer par le pneu, comparé à sa capacité : slick 4, inter 30, pluie 85 L/s (Pirelli).
- Rafales de vent (processus Ornstein-Uhlenbeck).

**Pneus** (`physics/tyre.ts`)
- Composés C1–C5, intermédiaire et pluie, avec leurs fenêtres de température.
- Températures surface et carcasse, sur 3 zones.
- Dégradation thermique et mécanique, graining, blistering, plats (flat spots), crevaison, pression.
- Page Pneus du volant.

**Dégâts**
- Aileron AV et AR, dérives, déflecteurs (bargeboards), suspension.
- Roue arrachée : le fond racle la piste.
- Crevaison sur un choc ou en roulant sur un débris.
- Effets aéro : appui asymétrique.
- Débris persistants, avec étincelles et fumée.
- Messages : « Crevaison » / « Roue arrachée ».
- Les dégâts restent jusqu'au stand ou à une nouvelle session.

**Rendu**
- Chaussée mouillée : plus sombre et plus réfléchissante, avec flaques.
- Ciel couvert, brouillard.
- Traces de pneus persistantes (6000 segments).
- Gerbes d'eau, pluie, gouttes sur la caméra cockpit.

**Audio**
- Inertie du turbo, sifflement MGU-H, crépitements en décélération.
- Blocage de roue distinct du glissement.
- Chuintement des pneus sur l'eau.
- Pluie plus forte dans le cockpit.

**Physique générale**
- Effet de sol / décrochage sous 8 mm.
- Aspiration et air sale (actifs seulement avec plusieurs voitures).
- Freins refroidis par la pluie.
- Consommation limitée à 100 kg/h.

**10 nouveautés** : voir `docs/IMPROVEMENTS_10_NEW.md`.

### Tests

**Node — tous OK**
- Tour sec 1:41,23.
- Forte pluie en pneus pluie : 2:05,1 (+24 %), 0 choc.
- Gomme ×1,030, marbles ×0,861.
- Graining 7,7 %.
- crash, pitlane, physics : OK.

**Chromium** (`app.mjs`) : tous OK, 0 erreur console.

**WebKit iPhone 13** (`tests/lot6_wk.mjs`)
- Forte pluie à 165 km/h : eau 1,5 mm, wetGrip 0,67, aquaplaning 0 en pneus pluie.
- Vrai choc à La Source (85 m/s, 24°) : aileron AV arraché, dérive gauche, suspension ARG 60 %, crevaison ARG, 2 débris.
- GPU ≈ 268–281 Mo, 0 erreur.
- Rendu logiciel : les images/s ne sont pas mesurables. **Non testé sur un vrai iPhone.**

### Publications du lot 6 (heure Canaries)

**Lot 6** — commits a190f17f [skip ci] + d8256ccf ; JS `index-BhIAwQSZ.js`.
- source/ : commits 9fadb57d → 02e9bb26.

**Lot 6b** — commits 50b89794 [skip ci] + f9f516c6 ; JS `index-DCF6gZIW.js`.
- Arrachage visible de l'ensemble nez + aileron AV. Tous les maillages sont découpés, plus seulement `Car_wing`. Même traitement pour l'aileron AR au-dessus des roues.
- Traces de pneus continues : maintien de 0,15 s. **Lot 6c** (574836fd + 2e6f95d9, JS `index-Cb8UmyDF.js`) : le fondu des traces passe sur les bords en largeur au lieu de la longueur, ce qui supprime les pointillés.
- Ciel couvert plus clair.
- Décrochage de l'effet de sol limité au sol dur. Avant ce correctif, le test gravier était hors plage : 1,36 g, contre une référence de 0,8 à 1,3 g. Il est maintenant à 1,30 g.

**Tests**
- surface, physics, crash, pitlane, env, gyro : tous OK.
- `app.mjs` (Chromium) : tous OK.

**WebKit**
- Traces visibles après un freinage roues bloquées (ABS coupé).
- Ensemble nez + aileron AV absent après le choc.
- Piste mouillée sombre, ciel couvert.
- Note de test : faire avancer la simulation sans rendu téléporte la voiture plus loin que les tuiles chargées. On voit alors un sol blanc sans texture. C'est un artefact du test : une fois les tuiles chargées, le rendu est correct.

## 2026-11-09 ~20:30 (heure Canaries) — Lot 7 en cours : 20 pilotes 2020 + menu style Apple + week-end complet
**Fait (commit local 48c6077)**
- 20 pilotes 2020 : casque, combinaison et gants par pilote (KTX2 : `game/public/drivers/<id>/`, 9 Mo au total), vignettes de casque en WebP (200 Ko). Un seul maillage partagé. En course, seul le pilote choisi est chargé : les textures d'origine sont libérées du GPU. Livrées approximatives, sponsors en simples marques texte.
- Vitrine 3D du menu (`render/showroom.ts`) : la voiture du jeu dans un studio (environnement RoomEnvironment libéré avant la course, sol laqué, ombre de contact), plateau tournant, caméra à ressort (voiture / pilote / casque), glisser pour tourner, thème clair ou sombre.
- Menu Apple (`ui/menu.ts`, `ui/kit.ts`, `ui/apple.css`) :
  - Accueil → Pilote → Circuit (Spa ; les autres « Bientôt ») → Voiture (W11 ; les autres « Bientôt ») → Session → Départ ;
  - modes historiques conservés ;
  - choix enregistrés dans `settings.profile`.
- Week-end (`core/weekend.ts`) : EL1, EL2 et EL3 chronométrés (durée réglable, option « week-end court »), Q1, Q2 et Q3, puis course au nombre de tours réglable. Le programme est sauvegardé et peut être repris.
- Garage (`ui/garage.ts`) :
  - l'ingénieur analyse la télémétrie (équilibre, Vmax, frottements, températures des pneus, blocages) et propose des réglages ;
  - réglages modifiables : ailerons, hauteurs, différentiel, répartition, pressions, pneus, carburant ;
  - « Préparer la voiture » consomme le temps de séance ;
  - un arrêt de 2 s au stand pendant les essais ou les qualifs ramène au garage.
- Course rapide : départ arrêté depuis la pole avec 5 feux rouges, drapeau à damier, écran de résultats.
- Physique : nouveaux réglages ailerons 1–11, hauteur de caisse en mm et pressions à froid en psi (tests `tests/weekend.test.ts`).

**Tests (9 nov. ~20:50, heure Canaries)**
- tsc OK ; tests physics, crash, pitlane, env, surface, gyro et weekend OK ; app.mjs (Chromium) : tous les tests OK.
- WebKit, émulation iPhone 13, sur le site public (`tests/lot7_wk.mjs`, captures `out/wk/pub7_*.png`) : 0 erreur ; course rapide 1 tour → résultats ; week-end EL3 → garage → propositions → préparation → résultats.
- Mémoire GPU en course : ≈ 281 Mo (lot 6 : 260–281 Mo). Le pilote choisi remplace les textures d'origine, qui sont libérées.

**Publié (GitLab, pipeline Pages 3046897353 au vert)** : JS `index-ziZQnud4.js`, 75 fichiers pilotes, `source/` mis à jour.

**Reste**
- ⚠ Plateau IA absent : courses et classements en solo. Points d'accroche : `gridHooks` (`classify`, `startingGrid`) dans `core/weekend.ts`.
- Autres circuits et voitures : en attente des assets de Baillo (structures `CIRCUITS` et `CARS` prêtes).
- Livrées des 19 autres pilotes : approximatives (voir `docs/SOURCES.md`).

## 2026-11-09 ~21:50 (heure Canaries) — Lot 8 en cours : 9 voitures + safety car, physique 2020, course complète, stands
Consignes : /workspace/w11-shared/CONSIGNES_BAILLO_2026-11-09.txt (+ compléments : panneaux lumineux/commissaires, SC complet,
drapeau rouge, tour de formation, erreurs IA rares et plausibles). New Bot livre circuits/garages/PNJ dans /workspace/w11-shared/assets/
(lecture seule pour moi).
**Fait**
- A : `blender/scripts/t1_team_car.py` (+ `t1_cars.json`) : pipeline générique — import, orientation W11 (avant +Y, sol z=0, origine
  mi-essieux), roues W_xx / W_xx_spin (couverture angulaire), volet DRS (îlots ou nœud source), volant d'origine retiré (le pilote W11
  + volant sont greffés au chargement à l'offset `seat`), matériaux renommés + vernis, export hi / LOD1 / LOD2 + méta JSON
  (assets-work/cars/). Contrôles visuels out/cars/*_side|rear34|wing|cockpit.png. Fait pour les 8 voitures OUTPISTON.
- `blender/scripts/t2_livery.py` : livrée AlphaTauri recréée (blanc/bleu nuit, marques texte AlphaTauri / HONDA) par cuisson
  position+normale → couleurs numpy sur UV uniques.
- A terminé : 9 voitures 2020 + safety car AMG GT Black Series (KTX2 UASTC + meshopt, LOD1/LOD2, + LOD Mercedes via
  tools/w11_lods.mjs), menu Voiture (pilote ⇄ voiture d'équipe), greffe pilote 2020 + volant W11. Captures out/wk/pub8_a_*.
- B terminé : src/physics/cars2020.ts (PU, ClA/CdA calibrés), docs/RESEARCH_CARS_2020.md ; tests/cars2020.test.ts : tours Spa
  à ±0,13 s des écarts réels 2020 (W11 1:41.51 vs pole 1:41.252).
- Publié GitLab (commit 6df828e3, JS index-BwQbJ_-m.js).
**Suite** : C course IA (19 IA, règles FIA 2020, commissaires/pénalités, SC/VSC/drapeau rouge, tour de formation, panneaux
marshals placeholders) · D stands (assets New Bot `spa_pits` apparus dans w11-shared/assets) · Monza (public conservé).
- 22:55 (Canaries) — C en cours d'intégration : src/race/{data,sim,control}.ts (19 IA, règles 2020, SC/VSC/rouge, formation,
  commissaires/pénalités), tests/race_sim.test.ts (6 courses 44 tours : 0–2 tête-à-queue, 0–1 SC/VSC, 1 arrêt/voiture, ~1:47 en course),
  render/fieldView.ts (LOD1 < 28 m, LOD2 < 450 m, textures hi d'équipe −1 mip : plateau ≈ 9,6 Mo tex + 12,6 Mo géo),
  ui/tower.ts (tour de chrono + bandeau direction de course), core/quali.ts (Q1/Q2/Q3, grille, pneus Q2), panneaux marshal_lamps
  de New Bot (16 postes) branchés ; fix physique : la voiture ne recule plus à l'arrêt (frein moteur sous ralenti) ni ne passe la
  marche arrière sur la grille. Source WIP poussé (98954fe4, 12dac1d6).
**File d'attente** : finir C (captures pub8_c, publication) → D stands (spa_pits New Bot : garage_player, garages_lod, muret,
  feux sortie, PNJ, commissaires animés) → Monza → **Carrière / Championnat 2020** (en tête du menu : 17 manches dans l'ordre réel,
  circuits non livrés « bientôt », week-end complet ou court, barème 25-18-15-12-10-8-6-4-2-1 + meilleur tour dans le top 10,
  classements pilotes/constructeurs, résultats IA simulés, sauvegarde/reprise, écran de fin de saison).
