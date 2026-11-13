# Rapport de mise en place du pipeline universel de circuits

## Résultat

Un pipeline réutilisable d’import Blender, de manifeste SHA-256, de cache par étape et de tuilage a été implémenté et exécuté sur le GLB fourni pour Barcelone-Catalogne. Les modifications sont préparées sur la branche dédiée `cue/universal-track-pipeline`.

**Ce travail ne rend pas Barcelone jouable et ne complète pas la mission « tous les circuits jouables ».** Le GLB fourni est une scène visuelle sans les données de course nécessaires. Les assets construits restent hors du dépôt et la configuration Barcelone indique explicitement `asset_import_and_roundtrip_only`. Aucun nouveau circuit n’est publié dans le jeu.

## Audit des circuits

L’audit des branches et historiques est détaillé dans [l’audit universel des circuits](UNIVERSAL_CIRCUIT_AUDIT.md). À l’état de `origin/main@88eb26c` :

- **Spa-Francorchamps** est le circuit le plus complet et intégré ; ses tests physiques existants ont réussi localement lors de cette tâche après décodage temporaire des assets encodés.
- **Monza** a une intégration runtime, mais ses assets dépendent de l’assemblage CI et le checkout local n’est pas autonome.
- **Yas Marina** a été révoqué et est absent de `main`.
- **Interlagos** est un WIP non fusionné, sans données complètes de collisions ni de pitlane.
- **Bahreïn** dispose d’assets partiels non reliés au runtime.
- **Sepang** n’a qu’un convertisseur non validé, sans source GLB ni sorties intégrées.
- **Barcelone-Catalogne** a été importé depuis le GLB fourni, mais ses données de centerline, surface physique, barrières/collisions, pitlane, secteurs, DRS et grille ne sont pas présentes ou vérifiées.

## Pipeline livré

Le package [circuit_pipeline](../tools/circuit_pipeline/README.md) fournit : un CLI incrémental, un worker Blender headless non destructif, des configurations par circuit, un manifeste avec empreintes, la validation de conteneur GLB et la réutilisation des outils d’optimisation existants. Les tuiles ne sont reconstruites que si la source, le constructeur ou la configuration pertinente change. Un job CI exécute les tests unitaires.

Le constructeur `build_track_tiles.mjs` a été étendu pour accepter des règles alpha propres aux circuits tout en gardant les règles Spa actuelles par défaut. Les paramètres alpha doivent être renseignés à partir des données de chaque circuit lorsqu’ils diffèrent.

## Exécution sur le GLB Barcelone fourni

Source : `barcelona-catalunya_grand_prix_2023_layout.glb`, SHA-256 `c7415c2c0364c9bc24c083724973021c253a4e6ecffd89a848a5a645a3a49527`.

Blender 5.3.0 a importé 115 objets mesh, 1 424 492 sommets et 1 148 343 triangles. Les 117 images étaient embarquées ; aucune image externe manquante ni coordonnée de sommet non finie n’a été signalée. L’export GLB de contrôle est valide, de 106 930 460 octets. Le tuilage a produit 13 fichiers glTF (base + 12 tuiles), 115 textures WebP et 142 fichiers totalisant 34 765 932 octets. La compression utilise les réglages existants WebP couleur 92 / normale 95 ; elle n’est pas sans perte et reste à contrôler visuellement avant toute publication.

Le pipeline a ensuite confirmé un cache hit pour l’export Blender et les tuiles. Les fichiers et le manifeste de cette exécution sont dans `/workspace/circuit-pipeline-results/barcelona-catalunya/` ; ils ne sont pas commités ni intégrés au jeu. Les champs `visual_validation` et `gameplay_validation` restent `not_performed`.

## Vérifications exécutées

- 6/6 tests unitaires du pipeline : réussis.
- `node --check source/tools/build_track_tiles.mjs` et `git diff --check` : réussis.
- `npx tsc --noEmit` et `npm run build` : réussis.
- `npm run test:physics` : réussi après préparation temporaire des binaires Spa décodés et du dossier de rapports attendu ; les trois tours IA Spa ont été valides (1:41.511, 1:41.568, 1:41.514). Les fichiers de test temporaires ont été nettoyés. Ce test ne valide pas Barcelone.
- Aucune capture de validation visuelle, aucun essai de course sur Barcelone et aucun pipeline GitLab distant ne sont déclarés réussis ici.

## Blocages avant intégration d’autres circuits

Il faut obtenir les scènes sources/GLB et références autorisées des circuits concernés, puis leurs données de course vérifiées : centerline, surface et types de sol, collisions/barrières, pitlane, grille, secteurs, DRS et coordonnées des infrastructures. Il faut ensuite configurer les matériaux alpha, produire des rendus d’inspection, tester le chargement/tour/collisions/stands de chaque circuit, et seulement après intégrer les chemins et l’entrée du sélecteur.

Aucun asset de circuit non testé n’est publié, aucun asset fonctionnel existant n’a été remplacé, et `main` n’a pas été fusionnée.
