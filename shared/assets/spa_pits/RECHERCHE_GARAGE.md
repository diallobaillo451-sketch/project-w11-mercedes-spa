# Recherche : garage et voie des stands F1 (saison 2020) — pour W11 Spa

Rédigé le 9 nov. 2026. ✅ = sourcé ; ⚠️ = estimé ou à confirmer.

## 1. Le garage d'une équipe (vu depuis la voie des stands)
- **3 boxes par équipe** en Europe : un par voiture et un pour les pièces de rechange ou l'ingénierie ✅ (Jalopnik, Williams). À Spa, chaque box mesure environ 6,1 m de large et ils sont espacés de 6,4 m (mesuré sur le modèle 3D du jeu : 42 portes).
- **Point de référence (« datum »)** : c'est l'avant du garage. On pose d'abord les **panneaux muraux** aux couleurs de l'équipe, puis les **autocollants au sol** (marquages des emplacements), puis on branche l'électricité et l'hydraulique ✅ (Motorsport.com).
- **Murs latéraux et mur du fond** : panneaux modulaires couverts du logo et des sponsors de l'équipe, c'est la vitrine de la marque ✅. Dans le jeu, les marques sont **recréées en texte et en formes**, sans logos officiels.
- **Meubles de travail le long des murs** : tiroirs à outils (peu d'outils, tous comptés avant chaque sortie), plans de travail, supports de pistolets de roue, écrans de contrôle muraux ✅.
- **Portique au plafond (« gantry »)** modulaire, à hauteur fixe : éclairage, flexibles d'air comprimé, extraction d'air, **écran pilote** (visible depuis le cockpit), prises, et le **cordon ombilical** (« umbilical ») qui relie la voiture aux serveurs de données ✅ (Motorsport.com, Red Bull). La hauteur de ce portique est devenue critique avec le Halo ✅. **Dans le jeu : 3 écrans `screen_1..3` accrochés au portique, devant le cockpit, sur lesquels Opi affiche le direct.**
- **Poste des ingénieurs au centre** du garage : ingénieurs de course, de performance, d'aéro, de pneus, et responsable moteur, avec des rangées d'écrans de télémétrie, de chronos, de carte du circuit et de TV ✅. Dans le jeu : poste de télémétrie, iMac et MacBook.
- **Pneus** dans des **couvertures chauffantes** aux couleurs de l'équipe, empilés dans des racks ; un code couleur permet de savoir à quelle voiture ils appartiennent ✅ (Jalopnik). Le règlement sportif 2020 (art. 21.4 h) autorise les couvertures chauffantes ✅. La température maximale (environ 100 °C à l'avant et 80 °C à l'arrière en 2020) relève du règlement technique et des consignes Pirelli ⚠️.
- **Pneus Pirelli 2020** : flanc tendre rouge, medium jaune, dur blanc, intermédiaire vert, pluie bleu ✅ (convention Pirelli).
- **Arrière du garage** : couloirs et box modulaires. En Europe, les piles de pneus et une partie des ingénieurs sont dans les camions (« treehouse ») ✅ (Red Bull). Dans le jeu, on ne modélise pas l'arrière : le garage s'arrête à environ 14 m de profondeur, avec un mur du fond décoré.
- **Matériel près de la voiture** : chandelles (« car stands »), support d'aileron avant, ventilateurs de refroidissement (freins et moteur), chariot de bouteilles d'azote (pistolets), établi et armoires, éclairage au plafond ✅.
- **Façade** : nom de l'équipe au-dessus des ouvertures, **visages des pilotes** et numéros sur des panneaux, sponsors ✅ (usage courant). Dans le jeu, ce sont des **portraits stylisés** générés, pas des photos.

## 2. L'arrêt au stand (2020)
- Environ 20 personnes au contact de la voiture ✅ (Red Bull, Mercedes, Motorsport.com) : 4 **gunners** (pistolets de roue), 4 **pneu sortant** (wheel off), 4 **pneu entrant** (wheel on), 1 **cric avant** et 1 **cric arrière** (plus des cricks de rechange), 2 **stabilisateurs** (au niveau de la prise d'air), 2 **réglages d'aileron avant**, et 1 **contrôleur d'arrêt** qui commande le feu du portique (rouge puis vert).
- Le **cric avant pivote** pour que l'opérateur s'écarte ✅. Le cric arrière glisse sous la structure anti-crash ✅. Les cricks sont **manuels** (pas de levage motorisé) ✅. **Dans le jeu : pivots `jack_front_pivot` et `jack_rear_pivot`.**
- Les **pistolets de roue** fonctionnent à environ 26 bar et plus de 10 000 tr/min, avec un bouton de confirmation. Il y en a environ 24 par garage ✅.
- Le **feu du portique** au-dessus du box passe du rouge au vert pour libérer la voiture ✅ (« stop/go gantry light »).
- Les mécaniciens portent un casque et la combinaison ignifugée de l'équipe ; le « wheel off » avant porte un repère d'arrêt sur le bras ✅.

## 3. Le muret des stands (« pit wall »)
- Un **stand couvert par équipe** sur le muret, avec une rangée de sièges et d'écrans. On y trouve le directeur ou team principal, le directeur technique ou de course, le stratège, le sporting manager et le chef des opérations. Les **ingénieurs de course** n'y montent **que pour la course**, en se plaçant aux extrémités ; en essais et en qualifs, ils restent près de la voiture ✅ (F1.com, Ferrari). **Dans le jeu : 4 places par stand (empties `pitwall_<team>_seat_1..4`), 4 PNJ animés assis `pitwall_watch` et `pitwall_talk` (parlent à l’intercom, main sur le casque).**
- Tout passe par l'intercom (casque), même entre voisins ✅.

## 4. La voie des stands et la sortie
- **Deux voies** : la voie rapide côté muret (3,5 m maximum) et la voie de travail côté garages, la seule où l'on peut travailler sur une voiture ✅ (règlement sportif 2020, art. 28.4).
- **Feu de sortie des stands** : un **feu rouge et un feu vert à la sortie** ; on ne sort qu'au vert. Il y a aussi un **drapeau bleu ou un feu bleu clignotant** si des voitures arrivent en piste ✅ (art. 31.2). **Dans le jeu : nœuds `pitexit_red`, `pitexit_green` et `pitexit_blue`, en option.**
- Vitesse limitée à **80 km/h** à Spa ✅ (voir RESEARCH_NEWBOT.md). L'entrée se fait par l'Arrêt de Bus côté droit, la sortie après La Source.
- **Ordre des garages à Spa en 2020** (depuis l'entrée) : FIA et F1 (1-5), Mercedes (6-8), puis Ferrari, Red Bull, McLaren, Renault, AlphaTauri, Racing Point, Alfa Romeo, Haas, et enfin Williams (40-42) côté sortie ✅ (plan FIA du directeur de course, Spa 2020). L'emplacement exact des 3 boxes de chaque équipe est ⚠️ estimé. J'ai gardé chaque équipe dans un même bloc entre deux piliers (voir `pits.json`).
- **Signalétique** : marquages au sol des boxes (rectangle jaune ou blanc avec repères de roues), ligne blanche de séparation des voies, numéro du garage au-dessus de la porte, panneaux « PIT EXIT » et « 80 », et panneau de statut d'entrée des stands ✅/⚠️.

## Sources
- Motorsport.com, « Insider's guide: What happens in an F1 garage? » https://www.motorsport.com/f1/news/how-does-f1-garage-work/8229824/
- Red Bull Racing, « Bulls' Guide To: The Garage » https://www.redbullracing.com/int-en/bulls-guide-to-the-garage et « Bulls' Guide To: Pit Stops » https://www.redbullracing.com/int-en/bulls-guide-to-pit-stops
- Formula1.com, « The insider's guide to… The Pit Wall » https://www.formula1.com/en/latest/article/the-insiders-guide-to-the-pit-wall.CFwHwjTcLNO5Gf4B3Dy4o
- Mercedes-AMG F1, « Box Box: pit stop explained » https://www.mercedesamgf1.com/news/box-box-pitstop-explained
- Motorsport.com, « Why are F1 pit stops so fast? » https://www.motorsport.com/f1/news/insiders-guide-why-are-f1-pit-stops-so-fast/6816459/
- Jalopnik, « How a Formula One Garage Works on Race Day » https://www.jalopnik.com/how-a-formula-one-garage-works-on-race-day-1788108577/
- FIA, règlement sportif F1 2020, éd. 13 (art. 21.4, 28, 31.2) https://www.fia.com/sites/default/files/2020_formula_1_sporting_regulations_-_iss_13_-_2020-11-04.pdf
- FIA, notes du directeur de course, GP de Belgique 2020 (plan de la voie des stands), voir RESEARCH_NEWBOT.md.
