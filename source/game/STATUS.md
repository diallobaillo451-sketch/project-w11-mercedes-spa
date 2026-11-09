
## 2026-11-03 09:39 (WET) — qualité maximale par défaut + streaming large LOD
- Mobile : préréglage haute (DPR jusqu'à 2, MSAA 4, bloom, GTAO, sonde 128, ombre 2048) atteint après démarrage sûr (montée à +12 s), puis adaptation dynamique (baisse seulement si images > 19,5 ms).
- Streaming directionnel : pleine qualité < 600 m, LOD (meshopt ~50 %, sans ombres) jusqu'à 1500 m devant / 800 m derrière ; tNN_lod.gltf/.bin.
- Contexte WebGL perdu / session tuée → rechargement auto avec −1 cran (w11.drop : haute→moyenne→basse→sans échec), journalisé.
- Chromium profil iPhone (E) : GPU ≈ 259 Mo estimés au max (tex 126, géo 52, cibles 65, ombre 17), 0 erreur. Non testé sur vrai iPhone.
- Publié GitLab : commit b2a9c9b2, pipeline 3021600839 succès.
