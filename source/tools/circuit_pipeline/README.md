# Pipeline de préparation des circuits

Ce pipeline ajoute une couche générique autour de Blender headless sans remplacer les scripts Spa déjà en place. Il conserve le GLB source en lecture seule, inventorie les objets et matériaux, peut exporter un GLB de contrôle non destructif et peut appeler l’outil existant `source/tools/build_track_tiles.mjs` pour générer des tuiles spatiales optimisées.

## Exécution

```bash
python3 source/tools/circuit_pipeline/cli.py \
  --config source/tools/circuit_pipeline/configs/barcelona-catalunya.json \
  --source /chemin/vers/barcelona-catalunya_grand_prix_2023_layout.glb \
  --output-dir /chemin/vers/work/barcelona-catalunya
```

Le chemin Blender est choisi depuis `--blender`, puis `BLENDER_BIN`, puis `PATH`. L’export par défaut est nommé `<circuit-id>.roundtrip.glb`. Le dossier de sortie contient aussi `blender-report.json`, `manifest.json` et les journaux utiles. `--inspect-only` importe et inventorie sans exporter. `--force` reconstruit les étapes au lieu de réutiliser les résultats mis en cache. `--build-tiles` appelle le constructeur de tuiles existant; il faut alors installer une seule fois les dépendances Node du jeu avec `npm ci --prefix source/game`.

Les fichiers de cache sont validés par leurs empreintes SHA-256. Le cache Blender dépend du GLB source, du worker, de la version Blender et des options Blender. Le cache des tuiles dépend du GLB exporté, du constructeur, du nombre de tuiles, des qualités WebP et des règles alpha. Une modification des paramètres de tuilage ne relance donc pas l’import Blender si son résultat est toujours valide.

## Configurations par circuit

Copier `config.example.json`, choisir un identifiant unique et renseigner seulement les données vérifiées. Les règles `tiles.material_alpha_modes` sont des associations exactes `nom-de-matériau: OPAQUE|MASK|BLEND`; ne pas classer des matériaux par intuition. Le profil Barcelone-Catalogne montre volontairement `game_integration.enabled: false` : le GLB seul ne contient pas les données de course nécessaires pour en faire un circuit jouable.

## Tests et limites

Tests rapides, sans Blender ni GPU :

```bash
python3 -m unittest discover -s source/tools/circuit_pipeline -p 'test_*.py' -v
```

Le worker ne déplace, ne supprime et ne simplifie aucune géométrie; la sortie round-trip est une conversion d’échange Blender et doit être comparée visuellement avant publication. Le tuilage existant optimise les GLB et ne fabrique pas la ligne centrale, la surface physique, les collisions, les stands, les secteurs ou les zones DRS. Il ne valide pas à lui seul les performances iPhone ni la jouabilité. Le manifeste conserve séparément `visual_validation`, `gameplay_validation` et `publication_status`; ceux-ci restent en attente tant que les tests correspondants n’ont pas réellement eu lieu.

Les anciens scripts Blender de Spa gardent leurs chemins et leur comportement historiques. Ne pas pointer ce nouveau pipeline sur les assets publiés existants pour les remplacer; effectuer d’abord les tests et la revue visuelle dans un dossier de sortie distinct.
