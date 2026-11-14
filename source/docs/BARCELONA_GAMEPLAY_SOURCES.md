# Sources et précision des données — Barcelone-Catalogne

## Configuration 2023

- [FIA — homologation du tracé mis à jour pour le GP d’Espagne 2023](https://www.fia.com/news/fia-homologates-updated-layout-2023-fia-formula-1-spanish-grand-prix) : la chicane finale n’est plus utilisée à partir de 2023.
- [Formula 1 — nouvelle configuration de Barcelona-Catalunya en 2023](https://www.formula1.com/en/latest/article/circuit-de-barcelona-catalunya-to-feature-new-configuration-for-2023-spanish.6ZQgemg7eOlAJbBtu56PHE) : longueur publiée du tracé GP, 4,657 km.

## Trajectoire de course

- [Documentation OpenF1](https://openf1.org/docs/) : l’endpoint `location` fournit des positions approximatives, avec une origine arbitraire, sans échelle d’unité garantie ni position latérale précise.
- Session utilisée : [course d’Espagne 2023, session 9102](https://api.openf1.org/v1/sessions?year=2023&country_name=Spain), le 4 juin 2023.
- Tour de référence : [données des tours du pilote 1](https://api.openf1.org/v1/laps?session_key=9102&driver_number=1), tour 61 de Max Verstappen, 76,330 s. Positions de course : [endpoint OpenF1 location](https://api.openf1.org/v1/location?session_key=9102&driver_number=1).
- Le seed versionné [`barcelona_2023_lap61_fit.json`](../tools/circuit_pipeline/data/barcelona_2023_lap61_fit.json) contient 295 positions conservées entre `date_start` et `date_start + lap_duration`, ajustées par similitude sur le mesh d’asphalte du GLB fourni. Il s’agit d’une trajectoire approximative pour générer un centreline jouable, pas d’un relevé homologué.
- La réponse brute autour du tour comportait aussi des points antérieurs au départ et postérieurs à l’arrivée. Leur inclusion créait un écart artificiel de 132 m; ces points ne sont pas dans le seed final. Les extrémités filtrées restent distantes de 15,4 m, sur la ligne droite de départ-arrivée, puis le worker ferme et lisse la ligne lors du rééchantillonnage.

## Assets et textures GPU

- [Khronos KTX-Software v4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2) et sa [documentation officielle `ktx create`](https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html) : 115 textures Barcelona sont converties en KTX2 UASTC avec supercompression Zstandard; les WebP restent disponibles comme solution de repli.
- Les formats et scripts d’assets de Spa sont réutilisés, mais leurs coordonnées ne sont pas copiées sur Barcelone.

## English summary

- The 2023 layout removes the final chicane. The baked centerline measures 4,668.6 m versus the published 4,657 m (a 0.25% difference).
- The racing-line seed contains 295 filtered OpenF1 location points from Max Verstappen’s 2023 Spanish GP lap 61, fitted to the supplied circuit mesh. It is a gameplay approximation, not an official survey.
- 115 textures are converted to KTX2 UASTC with Zstandard supercompression; WebP fallbacks are retained.
- Sector gates and DRS areas are estimates. The supplied GLB has no verified terrain, pit-lane, or safety-barrier geometry, so the runtime uses flat grass and virtual walls; detailed pit stops and barrier collisions are not yet implemented.

## Comparaison de longueur et limites

Le centreline du bake mesure 4 668,6 m, soit 11,6 m (0,25 %) de plus que la longueur FIA/F1 publiée. Cette proximité est un contrôle de plausibilité, pas une preuve d’arpentage. Les portes de secteurs sont déduites des temps de secteur du même tour; les zones DRS sont des estimations fondées sur les segments droits et ne prétendent pas reproduire des coordonnées FIA.

Le GLB ne fournit pas de mesh de collision exploitable pour le terrain autour de la piste, de voie des stands distincte ni de barrières de sécurité vérifiées. Le runtime utilise donc une herbe physique plate au niveau du centreline et des murs virtuels; il n’offre pas encore les arrêts aux stands ni les collisions détaillées de Spa/Monza. Aucune voie des stands ni coordonnée Spa n’a été reportée sur Barcelone faute de géométrie source permettant de la valider.
