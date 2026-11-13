# Interlagos 2023 — état d’intégration

**État : chantier incomplet, non publiable comme circuit terminé.** Les changements sont sur la branche de travail `feature/interlagos`; aucune fusion ni publication GitLab Pages n’a été faite. Conformément au brief, aucune MR ne doit être ouverte avant validation des éléments manquants et réussite de la CI complète.

## Source, provenance et copie visuelle

Seul le fichier fourni `failed_import_interlagos_circuit_2023_layout.glb` a servi de source. Les métadonnées embarquées déclarent Dave Love / Tyler_Dave, une licence CC BY 4.0 et la page Sketchfab associée. Le GLB original et son import `.blend` sont conservés sans altération dans l’espace de travail local.

La texture `Image_98`, identifiée comme imagerie satellite et présentant une provenance distincte incertaine, a été retirée de la copie visuelle exportée; le matériau correspondant a reçu une couleur unie. Les maillages, transformations et autres textures sont conservés. Cette mesure ne vaut pas validation juridique des autres contenus du modèle : la provenance complète de l’asset reste à vérifier avant redistribution publique.

## Géométrie et données mesurées

Le modèle comporte 107 objets mesh. La ligne centrale dérivée de sa chaussée mesure **4 238,01 m**. La fiche Formula 1 consultée donne **4 309 m** pour le circuit [1]; l’écart du modèle est de **70,99 m (1,65 %)**. L’échelle du modèle n’a pas été corrigée artificiellement : la valeur physique utilisée est celle mesurée, et le désaccord reste à résoudre avant de prétendre à une reproduction officielle.

Le bake physique contient 4 238 stations longitudinales espacées d’environ 1 m et 181 colonnes latérales de −45 à +45 m au pas de 0,5 m. Les types actuellement validés sont : `Object_109` comme asphalte, `Object_24` comme herbe et `Object_25` comme source de hauteur de secours géométrique seulement. Les textures d’`Object_25` ne sont pas lues pour la physique.

Les rayons centraux frappent directement `Object_109` sur 99,46 % des stations; 22 stations ont nécessité un snap latéral plafonné à 1,5 m. Un seul point supplémentaire, à `s=3849,009 m`, n’a pas de triangle `Object_109`; l’audit indépendant a confirmé un hit exact et continu sur `Object_87`, utilisé uniquement pour la cellule centrale de ce point. `Object_87` n’est pas classé globalement comme chaussée. Les largeurs mesurées gauche/droite ont une médiane de 5 m par côté; les valeurs extrêmes et les 93 055 cellules latérales sans sol sont indiquées dans `surface_stats.json` et laissées sans classe plutôt que devinées.

La ligne centrale est recalée sur un plan de référence et suit le sens vers T1, mais ce n’est pas une mesure FIA. Les portes de secteurs `[1321, 3096] m` et les zones DRS `[669,1266] m` et `[3811,4238] m + [0,188] m` sont des **estimations projetées**, non des points officiels FIA. Elles sont explicitement mises à l’échelle avec la longueur de circuit effectivement chargée.

Le plan utilisé pour le recalage reste dans l’espace d’analyse hors dépôt; son inclusion et ses droits ne sont pas établis. Le script de génération du centreline n’est donc pas reproductible depuis le dépôt seul à ce stade.

## Intégration logicielle réalisée

- `interlagos` est enregistré comme troisième circuit; le bouton existant parcourt Spa → Monza → Interlagos. Le titre, le sous-titre et le record personnel suivent le circuit sélectionné.
- Les gates des secteurs et les zones DRS utilisent une longueur de référence par circuit. Le simulateur IA n’utilise plus les portes Spa codées en dur.
- Les ressources facultatives `barriers.bin`, `pitlane.json`, `grassmask.bin` et `crowd.bin` sont déclarées explicitement dans la configuration. Interlagos laisse barrières, stands et foule à `null`; son `grassmask.bin` est généré depuis les seuls hits directs d’`Object_24`, puis parsé par le vrai constructeur Three.js `Grass` dans le test. Le constructeur produit 35 756 positions candidates; le rendu vivant reste plafonné à 8 000 touffes en qualité moyenne et 14 000 en haute. Le jeu ne tente donc pas de parser un fallback HTML comme un binaire valide.
- Le modèle visuel nettoyé a été découpé par l’outil existant en **17 tuiles** spatiales, avec Meshopt et textures WebP. Le dossier comprend 134 fichiers pour environ 16,9 Mo; le générateur estime environ 124 Mo de mémoire GPU pour les textures. Cette estimation impose un contrôle particulier sur iPhone.
- Un test `test:interlagos` vérifie les tailles de surface, le tag asphalte sous la ligne, les samples, la présence de chaque tuile/texture et l’absence des ressources optionnelles absentes. Ce test est ajouté à l’assemblage CI.

## Vérifications effectuées

| Vérification | Résultat |
|---|---|
| Blender 4.0.2 : import, rapport géométrique et bake de surface | Réussi |
| Sanitisation visuelle et export de la copie GLB sans `Image_98` | Réussi |
| Construction des tuiles Meshopt/WebP | Réussie : 17 tuiles, 134 fichiers |
| `npm run test:interlagos` | Réussi, y compris format du masque et création d’instances d’herbe |
| `npx tsc --noEmit` | Réussi |
| `npm run build` (Vite) | Réussi |
| `npm run test:physics` | Bloqué par l’absence, dans ce checkout de `main`, de `source/game/public/track/surface.bin` (asset Spa préexistant attendu par ce test); l’échec survient avant tout contrôle Interlagos |
| Prévisualisation navigateur | Le chargement des données, de la voiture et des tuiles a atteint une fois l’écran « Toucher pour démarrer » après assemblage local des assets communs. Le lancement effectif et la conduite n’ont pas été validés : le contexte WebGL du navigateur de test a ensuite été perdu; le test iPhone/Safari n’a pas été réalisé. |
| Pipeline GitLab / MR / Pages | Non exécutés / non ouverts; aucun déploiement |

## Manques bloquants avant une MR ou une publication

1. Extraire et valider les barrières réelles et les collisions. À ce stade, aucun fichier de barrières Interlagos n’est fourni et aucune collision réelle n’est activée.
2. Construire et tester une voie des stands fonctionnelle : entrée, limite à 80 km/h, emplacements, sortie, arrêts joueur/IA et stratégie de course. Les stands Interlagos ne sont pas présents dans les données validées.
3. Valider l’échelle, la ligne de départ, les virages, les trois secteurs et les zones DRS par des plans FIA/officiels plutôt que par projection approximative.
4. Produire et valider des données propres au circuit pour les tribunes/foule et les commissaires; contrôler visuellement la répartition des touffes générées depuis `Object_24`, sans emprunter d’assets à Spa/Monza.
5. Vérifier les 20 positions de départ, l’IA, les limites de piste, l’adhérence des surfaces, les dégâts/collisions, les courses et le comportement sur plusieurs tours.
6. Réussir la CI complète et réaliser une session navigateur stable en paysage sur appareil mobile avant de parler d’un circuit terminé.

En conséquence, ce travail est une base d’intégration testée sur les données disponibles, **pas encore un circuit au niveau de finition de Spa ou Monza**. Il ne doit pas être fusionné ni publié comme terminé à ce stade.

## Références

[1]: https://www.formula1.com/en/information/brazil-autodromo-jose-carlos-pace-sao-paulo.5z2RfrmiTTfEP6Wnxv1yIW "Formula 1, São Paulo circuit information"
[2]: https://docs.gitlab.com/user/project/pages/parallel_deployments/ "GitLab Pages parallel deployments"
[3]: https://docs.gitlab.com/ci/yaml/ "GitLab CI/CD YAML syntax reference"
