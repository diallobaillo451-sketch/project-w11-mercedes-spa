
## 2026-11-15 — IA : direction de course (drapeaux, SC, rouge, arrêts)
- Corrigé : les voitures qui rentrent aux stands ignoraient le plafond SC ; la file se resserre sous SC, dédoublement plus tôt / plus vite, reprise groupée jusqu'à la ligne ; DRS interdit sous jaune ; prudence près d'une voiture arrêtée ; qualif : tour abandonné sous double jaune ; arrêts SC / VSC selon le gain et la place en piste ; gomme choisie par le calcul de relais. Détails : source/docs/IA_PILOTES.md. Non testé sur iPhone.

## 2026-11-15 — IA très rapides (même rythme en qualif et en course)
- Bonus d'adhérence des IA physiques (× 1,08, race/tuning.ts) et plafond de vitesse commun 1D / physique (1,06 × √1,08), plateau 2,5 % plus rapide et écarts réels gardés à 50 %, plus de pénalité de course (+2 s), pleine puissance et essence de profil en course.
- Réglage dans l'URL : ?aigrip= ?aik= ?aispread= ?aiboost= ; menu : Difficulté IA (85 rapide, 100 très rapide). Détails : source/docs/IA_PILOTES.md. Non testé sur iPhone.

## 2026-11-14 — IA : vrai pilotage (voitures physiques), qualif / essais courtois, règles, stratégie
- Voitures physiques : nouveau pilote race/driver.ts (base autopilote validé, écart latéral lissé, freinage anticipé, gouverneur d'adhérence, détection tête-à-queue / immobilisée / épave renvoyée à la sim : jaunes, SC, abandon), ERS rechargé à chaque tour, gomme / cap / dégâts à la promotion.
- Circuit (Monza, Barcelone) et portes de secteurs transmis à la sim IA (les profils étaient calés sur Spa) ; joueur en tour lancé détecté (les IA lui cèdent le passage) ; attente à la sortie des stands ; écart propre en tour de sortie ; stratégie d'arrêt optimale (SC / VSC compris) ; jaunes plus marqués.
- Détails : source/docs/IA_PILOTES.md. Non testé sur iPhone (CI : contrôle de types seulement). ?hybrid=0 pour comparer.

## 2026-11-03 09:39 (WET) — qualité maximale par défaut + streaming large LOD
- Mobile : préréglage haute (DPR jusqu'à 2, MSAA 4, bloom, GTAO, sonde 128, ombre 2048) atteint après démarrage sûr (montée à +12 s), puis adaptation dynamique (baisse seulement si images > 19,5 ms).
- Streaming directionnel : pleine qualité < 600 m, LOD (meshopt ~50 %, sans ombres) jusqu'à 1500 m devant / 800 m derrière ; tNN_lod.gltf/.bin.
- Contexte WebGL perdu / session tuée → rechargement auto avec −1 cran (w11.drop : haute→moyenne→basse→sans échec), journalisé.
- Chromium profil iPhone (E) : GPU ≈ 259 Mo estimés au max (tex 126, géo 52, cibles 65, ombre 17), 0 erreur. Non testé sur vrai iPhone.
- Publié GitLab : commit b2a9c9b2, pipeline 3021600839 succès.
