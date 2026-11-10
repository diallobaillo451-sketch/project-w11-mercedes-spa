# Bahreïn — `bhr` (Bahrain International Circuit)

## Source
- **Fichier** : `source.glb` (copie locale de `/workspace/f1assets/wetransfer2/circuits/bahrain_international_circuit.glb`)
- **Taille** : 68 Mio
- **SHA-256** : `62e7f82a0bfea26a3b54ecdf5c711fe64a23575b16fd9b15acdbf1fac2450599`
- **Titre** : Bahrain International Circuit
- **Auteur** : Dave Love / Tyler_Dave (Sketchfab)
- **Licence** : CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- **URL** : https://sketchfab.com/3d-models/bahrain-international-circuit-e93b0a1892c44efebbe0a92bf1ff479d
- **Générateur embarqué** : Sketchfab-0.3.0
- **Contenu glTF** : 110 meshes, 100 matériaux, 227 nœuds, 98 images

## Modifications
Aucune modification du GLB source. Une conversion repo existe déjà dans
`shared/assets/bahrain/` (tuiles, marshals, feux de départ et de sortie détachés).
Cette branche **regénère** le dossier `track/` manquant et les textures de scène
incomplètes (push antérieur arrêté à « scene tex (50/70) » : 32 webp absents,
31 ktx2 absents), puis applique la recette **nuit** (ciel HDRI, mâts, lightmaps /
émissifs, ≤ 4 lumières dynamiques).

## Notes de layout
Longueur officielle FIA : 5 412 m, sens horaire. Le modèle / la conversion
mesurent ~5 403,7 m (écart à documenter). Nuit obligatoire (GP 2020 sous
projecteurs). DRS : confirmer 2 ou 3 zones d'après les Event Notes 2020
(sources dans le kit / meta).

## Pièces déjà dans le kit (extraites du repo, pas du GLB brut)
- `shared/assets/kit_pieces/start_lights/bahrain_startlights.glb` (5×4, nœuds `startlight_c*_r*`)
- `shared/assets/kit_pieces/pit_exit_lights/bahrain_pitexit.glb` (source **canonique**)
- `shared/assets/kit_pieces/marshal_panels/bahrain_marshal_1.glb` et `_2.glb`
Ces nœuds restent aussi dans les tuiles bahrain ; le kit sert aux autres circuits.
Cabines de commissaires et panneaux de freinage : absents du modèle (à greffer depuis Spa / Imola).
