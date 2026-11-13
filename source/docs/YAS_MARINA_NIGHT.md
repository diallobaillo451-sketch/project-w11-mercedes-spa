# Yas Marina 2021 — préparation Blender nocturne

## Préparé

La scène de travail reprend le modèle 3D fourni et le système de coordonnées glTF du projet. L’échelle métrique est estimée en alignant le modèle sur la carte et sur les 5,281 km publiés; ce n’est pas un relevé topographique. Le modèle source reste inchangé.

La présentation utilise le ciel nocturne déjà présent dans le dépôt (`sky_night_4k.webp` et `sky_night.json`) et le kit de mâts de projecteurs du dépôt. Dix mâts de 36 m sont ajoutés; leur pied est échantillonné sur la géométrie du modèle par raycast, mais leur position horizontale reste une estimation visuelle. Les faux aplats lumineux du kit ont été retirés. Le .blend utilise un remplissage lunaire et les lentilles émissives des mâts pour éviter les zones surexposées.

Le .blend embarque ses textures et contient dix caméras. Dix vues PNG de 960 × 600 sont rendues à partir du modèle réel. Le GLB d’export contient le circuit et les mâts; le ciel, les caméras et les lumières de prévisualisation sont exclus du GLB.

## Reproduction

Utiliser Blender 5.2.4 LTS ou une version ultérieure compatible, puis lancer depuis la racine du dépôt :

```bash
blender --background --python source/blender/scripts/yas_render_10views.py -- \
  --blend source/blender/stages/yas_marina_2021.blend \
  --sky source/blender/assets/yas_night/sky_night_4k.webp \
  --sky-meta source/blender/assets/yas_night/sky_night.json \
  --mast source/blender/assets/yas_night/stadium_floodlight_mast.glb \
  --out-dir /tmp/yas_marina_night_views \
  --glb /tmp/yas_marina_2021_night.glb \
  --width 960 --height 600 --samples 8 --mast-count 10 \
  --sky-intensity 0.12
```

Ajouter `--limit-views 2` pour un contrôle rapide du cadrage. Les scènes `.blend` de `source/blender/stages/` sont des sorties de travail ignorées par Git; le fichier final est livré séparément des scripts et assets versionnés.

## Tests et limites

Blender 5.2.4 LTS a rendu les dix vues et exporté les fichiers .blend et GLB. `npm run build` réussit. Le test physique échoue avant validation, car `source/game/public/track/surface.bin` est absent. La configuration `source/game/src/core/circuit.ts` ne déclare actuellement que Spa et Monza.

Aucune ligne centrale Yas, grille de surface `surface.json`/`surface.bin`, données de collision Yas, tuiles runtime, voie des stands, grille de départ, secteurs ou zones DRS n’est produite ou validée. Le GLB n’est donc pas une piste jouable ni un asset runtime optimisé. Ne pas déclarer l’intégration gameplay terminée.

Le modèle est attribué à Dave Love / Tyler_Dave, Sketchfab, sous licence CC BY 4.0 : https://sketchfab.com/3d-models/yas-marina-circuit-abu-dhabi-2021-layout-c41b4e19912b4d79886bcd8d7d2536af .
