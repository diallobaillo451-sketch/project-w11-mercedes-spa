# Yas Marina 2021 — scène Blender de nuit

## Ce qui est préparé

La scène Blender reprend le modèle 3D fourni, le ciel nocturne déjà préparé dans le dépôt (`sky_night_4k.webp` et `sky_night.json`) et le kit de mât d’éclairage du dépôt. Le ciel est décodé selon le format du moteur, puis atténué à une intensité Blender de 0,12 pour garder le champ étoilé sombre. Dix mâts de 36 m sont instanciés autour du circuit; leur hauteur de base est échantillonnée sur le terrain. Le .blend embarque les textures pour rester autonome. Le pipeline génère dix rendus PNG à partir de caméras distinctes.

Le GLB d’export contient le circuit et les mâts. Le dôme de ciel, les caméras et les lumières de prévisualisation restent dans le .blend et sont exclus du GLB.

## Reproduction

Utiliser Blender 5.2.4 ou une version ultérieure compatible, puis lancer depuis la racine du dépôt :

```bash
blender --background --python source/blender/scripts/yas_render_10views.py -- \
  --blend source/blender/stages/yas_marina_2021.blend \
  --sky source/blender/assets/yas_night/sky_night_4k.webp \
  --sky-meta source/blender/assets/yas_night/sky_night.json \
  --mast source/blender/assets/yas_night/stadium_floodlight_mast.glb \
  --out-dir /tmp/yas_marina_night_views \
  --glb /tmp/yas_marina_2021_night.glb \
  --width 960 --height 600 --samples 16 --mast-count 10 \
  --sky-intensity 0.12
```

Pour vérifier rapidement le cadrage, ajouter `--limit-views 2`. Les scènes `.blend` dans `source/blender/stages/` sont des sorties de travail ignorées par Git; le fichier final est donc livré séparément des scripts et assets versionnés.

## Limites à connaître

Le modèle est calibré par une mise à l’échelle estimée à partir de la longueur GP de 5,281 km et d’un alignement cartographique, pas d’un relevé topographique. Les positions horizontales des dix mâts restent approximatives; seule leur hauteur est ajustée au terrain. La scène est une préparation visuelle Blender : la ligne centrale, les surfaces physiques, les barrières, la voie des stands et le DRS ne sont pas générés ou validés ici. Ne pas considérer le GLB comme une piste de jeu physiquement validée.
