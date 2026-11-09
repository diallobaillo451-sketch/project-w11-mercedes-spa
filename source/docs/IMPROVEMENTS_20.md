# 20 améliorations de réalisme (point 13) — état au 9 nov. 2026 (heure Canaries)

Légende : ✅ fait et testé (Chromium sans GPU, pas sur un vrai iPhone) · 🔜 prévu (lot « mode course ») · ❌ pas fait

| # | Amélioration | État | Où / preuve |
|---|---|---|---|
| 1 | Collisions contre la géométrie réelle des barrières (54 638 segments : pneus, rails, béton, objets) | ✅ | `src/physics/vehicle.ts` collideBarriers, `tests/crash.test.ts` (0 traversée, l'ancien modèle traversait 13–19 fois à Pouhon) |
| 2 | Plus d'envol après un choc (vitesse verticale recalée sur la pente), dégâts par zone | ✅ | crash.test : hauteur max 0,07 m (avant 1,1 m au Raidillon) |
| 3 | Voie des stands praticable : entrée Arrêt de bus, sortie après La Source, limiteur 80 km/h, pénalité +5 s | ✅ | `tests/pitlane.test.ts` (0 choc, 73,6 km/h max) |
| 4 | Gravier qui freine vraiment : enfoncement des roues (≤ 4 cm) et traînée qui croît avec la vitesse | ✅ | `tests/surface.test.ts` : 1,29 g gravier, 0,71 g herbe, 0,61 g asphalte |
| 5 | Poussière beige + cailloux dans le gravier, terre et mottes dans l'herbe | ✅ | `src/render/effects.ts` offroad |
| 6 | Détail PBR CC0 de près (ambientCG Gravel023 / Grass001), anti-répétition 2 échelles | ✅ | `src/render/detail.ts`, captures `out/shots/avant_det_*` / `apres_det_*` |
| 7 | Herbe 3D instanciée au bord de la piste (teinte du sol, vent, fondu, seulement sur l'herbe verte) | ✅ | `src/render/grass.ts`, `tools/coll/grassmask.py`, captures `avant_g_*` / `apres_g_*` |
| 8 | Ciel photographique HDRI CC0 avec vrais nuages, reflets des nuages sur la carrosserie (IBL) | ✅ | `src/render/skydome.ts`, `tools/make_sky.py`, captures `sky0_*` / `sky1_*` |
| 9 | Perspective aérienne : brume d'horizon + brouillard léger accordés au ciel | ✅ | FogExp2 0,00032 |
| 10 | Bâtiments moins blancs : albédo réaliste + salissure procédurale (taches, coulures, dépôts) | ✅ | `src/render/weathering.ts`, ?weather=0 pour comparer |
| 11 | Public dans les tribunes (Raidillon Gold 3 + tribune principale, ≈ 8 800 personnes, 2 LOD) | ✅ | `blender/scripts/t10_crowd.py`, `src/render/crowd.ts` |
| 12 | Mains du pilote bien posées sur les poignées (doigts autour des poignées, suivent le volant) | ✅ | `src/render/carRig.ts` fixGrip, `out/blender/mains_*` |
| 13 | Son 3D HRTF, son différent selon la caméra, bas régime réparé | ✅ | lot audio (commit 3ada80e) |
| 14 | Son de choc selon le type de barrière (pneus sourds, rail métallique) | ✅ | `src/audio/audio.ts` |
| 15 | Volant W11 vivant (écran 3 pages, LEDs, drapeaux, réglages cliquables) | ✅ | commit 55b68f1 |
| 16 | Caméra cockpit aux yeux du pilote, HUD cockpit déplacé | ✅ | commit 55b68f1 |
| 17 | Bus d'événements de course (tour, secteur, drapeaux, chocs, stands) prêt pour la radio | ✅ | `src/core/events.ts` |
| 18 | Arrêts aux stands avec changement de pneus et temps d'arrêt | 🔜 | lot mode course |
| 19 | Adversaires IA (plateau 2020 complet) et radio en français | 🔜 | lot mode course (radio prête dans `/workspace/w11-shared/radio/`) |
| 20 | Piste mouillée / pluie, gommes (« marbles ») hors trajectoire | ❌ | idée pour plus tard |
