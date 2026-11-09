# Bahrain (Sakhir, tracé Grand Prix) — sources et licences

## Modèle 3D du circuit
- **« Bahrain International Circuit »**, auteur **Dave Love** (Sketchfab : https://sketchfab.com/Tyler_Dave)
- Page : https://sketchfab.com/3d-models/bahrain-international-circuit-e93b0a1892c44efebbe0a92bf1ff479d
- Licence : **CC BY 4.0** (http://creativecommons.org/licenses/by/4.0/) — attribution obligatoire (à afficher dans « À propos » du jeu).
- Fichier reçu : `incoming/extracted/bahrain.glb` (70,5 Mo, 536 197 triangles, 100 matériaux, 98 textures).
- Modifications (CC BY exige de les signaler) : recentrage (origine = ligne de départ, milieu de piste), suppression du
  matériau `Material_41.001_3` (doublon exact opaque de `_62` → z-fighting, 100 tris), découpe par matériau, décalages
  anti z-fighting par classe, feux de départ et de sortie des stands détachés du décal de gomme `Merged_materials` / de
  l'asphalte des stands en boîtiers opaques + lentilles pilotables, 2 panneaux LED convertis en postes `marshal_<n>_*`,
  matériaux renommés/réétalonnés sur la palette de Spa (parité visuelle, voir `track/meta.json` → `visualParity`),
  AO Cycles cuite par sommet, tuilage 500 m, LOD simplifiés, textures KTX2 UASTC.

## Données publiées (P)
- FIA, *2020 Bahrain Grand Prix — Circuit map / preview* : longueur 5,412 km, 15 virages, sens horaire, 57 tours,
  ligne de contrôle 246 m avant la ligne de départ.
- FIA, *2020 Bahrain GP — Race Director's Event Notes* : limite stands 80 km/h ; zones DRS (détection 50 m avant T1 /
  activation 23 m après T3 ; détection 10 m avant T9 / activation 50 m après T10 ; détection 110 m avant T14 / activation
  170 m après T15).
- Records : tour en course 1:31.447 (Pedro de la Rosa, McLaren, 2005 — FIA) ; 2020 : pole Hamilton 1:27.264 (FIA),
  meilleur tour course Verstappen 1:32.014 tour 48 (formula1.com), vainqueur Hamilton (Mercedes).

## Mesuré sur le modèle (M) / estimé (E)
- Ligne centrale 5 403,8 m (−0,15 % vs officiel) → échelle mètres confirmée ; dénivelé ligne centrale −0,04 … 16,75 m.
- Ligne de contrôle mesurée 247,8 m avant le départ (FIA : 246 m) ; 33 cases de grille peintes (20 retenues), pôle à gauche, quinconce 8 m.
- Virages (s), largeurs, murs/rails/pneus, voie des stands (706 m), herbe, gradins (53 564 places) : mesurés sur la géométrie.
- Secteurs, fins de zones DRS, couleurs des lampes : estimés (E).

## Outils
Pipeline d'Opi (copié, non modifié sur place) : Blender 5.2, gltf-transform + meshoptimizer + sharp, KTX-Software (UASTC + zstd).
Scripts génériques : `/workspace/w11-shared/work/circuits/lib/` (config `cfg/bahrain.json`).
