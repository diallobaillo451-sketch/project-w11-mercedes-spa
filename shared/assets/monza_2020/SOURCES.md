# Monza 2020 — sources et licences

## Modèle 3D du circuit
- **« Autodromo Nazionale Monza Circuit 2020 layout »**, auteur **Dave Love** (Sketchfab : https://sketchfab.com/Tyler_Dave)
- Page : https://sketchfab.com/3d-models/autodromo-nazionale-monza-circuit-2020-layout-25ed955115094de382935aa6d1a1e9c6
- Licence : **CC BY 4.0** (http://creativecommons.org/licenses/by/4.0/) — attribution obligatoire (à afficher dans « À propos » du jeu).
- Fichier reçu : `incoming/extracted/monza_2020.glb` (147,7 Mo, 1 193 373 triangles, 58 matériaux, 60 textures PNG).
- Modifications (CC BY exige de les signaler) : recentrage (origine sur la ligne de départ), suppression du maillage invisible
  `physics` (466 tris) et d'un cube parasite de 1 m posé sur la chaussée (ligne droite centrale, s ≈ 4 640 m), décalages
  anti z-fighting (vibreurs +4 mm, rainures +3 mm, grilles +6 mm), tuilage, AO Cycles cuite par sommet, textures
  WebP q92/95 + KTX2 UASTC (résolution native), LOD simplifiés, feu 3 lampes séparé en nœuds pilotables.

## Données publiées (P)
- FIA, *2020 Italian Grand Prix — preview* (https://www.fia.com/sites/default/files/20_08_italy_v3.pdf) : longueur 5,793 km,
  record 1:21.046 (Barrichello, 2004), décalage ligne de départ/arrivée 0,309 km, 53 tours, limite stands 80 km/h,
  zones DRS (détection 95 m avant T7 / activation 170 m après T7 ; détection 20 m avant T11 / activation 115 m après l'arrivée).
- FIA, *Race Director's Event Notes v2* (Monza 2020) : lignes/bollards entrée et sortie des stands, limites de piste T1-2, T5, T11.
- Résultats 2020 : pole Hamilton 1:18.887, meilleur tour course Hamilton 1:22.746, vainqueur Gasly (AlphaTauri).

## Mesuré sur le modèle (M) / estimé (E)
- Ligne centrale 5 786,2 m (−0,12 % vs officiel) → échelle du modèle confirmée (mètres, facteur 1).
- Écart mesuré ligne de départ → ligne d'arrivée : 311,7 m (FIA : 309 m).
- Virages (s), largeurs, murs, voie des stands, herbe : mesurés (raycast/raster sur la géométrie).
- Secteurs, grille, fin des zones DRS, zone 80 km/h exacte : estimés (E), voir `track/meta.json`.

## Outils
Pipeline d'Opi (copié, non modifié sur place) : Blender 5.2 (scripts `t*`, `k1`, `r1`), gltf-transform + meshoptimizer + sharp,
KTX-Software 4.4.2 (UASTC + zstd). Copies adaptées : `/workspace/w11-shared/work/monza_2020/`.
