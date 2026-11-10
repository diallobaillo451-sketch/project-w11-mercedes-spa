# Monza — `ita` (Autodromo Nazionale Monza)

## Source
- **Fichier** : `source.glb` (copie locale de `/workspace/f1assets/wetransfer2/circuits/autodromo_nazionale_monza_circuit_2020_layout.glb`)
- **Taille** : 141 Mio
- **SHA-256** : `4a760b454b7960230015ee183a7486b52b43012651bcd14fbe4efcff9012eff6`
- **Titre** : Autodromo Nazionale Monza Circuit 2020 layout
- **Auteur** : Dave Love / Tyler_Dave (Sketchfab)
- **Licence** : CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- **URL** : https://sketchfab.com/3d-models/autodromo-nazionale-monza-circuit-2020-layout-25ed955115094de382935aa6d1a1e9c6
- **Générateur embarqué** : Sketchfab-17.19.0
- **Contenu glTF** : 78 meshes, 58 matériaux, 82 nœuds, 60 images

## Modifications
Aucune modification du GLB source. Une conversion repo complète existe déjà
dans `shared/assets/monza_2020/` (tuiles, `track/` complet, textures). Cette
branche **compare** le nouveau GLB à cette conversion, conserve le meilleur,
et complète ce qui manque (feux de départ FIA, postes / panneaux de
commissaires, panneaux de freinage, kit stands, visuels pluie).

## Notes de layout
Longueur officielle FIA : 5 793 m, sens horaire. Lignes de départ et d'arrivée
séparées (offset FIA 0,309 km) — déjà dans `track/meta.json`. Limitation
pit lane 80 km/h (FIA 2020). Jour, visuels pluie prêts.

## Déjà présent / manquant
- Présent : `signal_1` (3 lampes rouge / rouge / vert) à s ≈ 35,7 m — à
  conserver, ce n'est **pas** un portique de départ FIA 5 colonnes.
- Absent du modèle (vérifié, `marshals.json`) : panneaux LED de commissaires,
  cabines, feux de départ FIA, feux de sortie type Bahreïn, panneaux de
  freinage. Greffe depuis le kit (Bahreïn start/pitexit, Spa marshals / boards).
- `lights.005` : probablement lampadaires — ne pas les prendre pour un feu de sortie.
