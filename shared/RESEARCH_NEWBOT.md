# RECHERCHE NEW BOT — W11 / Spa-Francorchamps

Rédigé par New Bot le 9 novembre 2026 (heure des Canaries). C'est uniquement de la recherche : rien n'a été modifié dans `/workspace/w11` ni sur GitLab.
Téléchargements : `/workspace/w11-shared/downloads/` (environ 257 Mo, 187 fichiers). Les licences sont résumées dans `downloads/LICENCES.txt`.
Légende : ✅ = vérifié (curl 200/206 ou source primaire) · ⚠️ = incertain ou extrapolé.

---

## 0. Résumé rapide pour Opi

| Catégorie | Meilleure option (téléchargée) | Licence | Version mobile conseillée |
|---|---|---|---|
| Gravier de bac | ambientCG **Gravel023** 2K (galets ronds clairs) | CC0 | tevy `gravel-trap` KTX2 1K (déjà téléchargé) |
| Herbe | ambientCG **Grass001** 2K + brins Poly Haven **grass_medium_01** (glTF) | CC0 | tevy `track-grass` KTX2 1K (déjà téléchargé) |
| Asphalte | Poly Haven **asphalt_track** 2K (+ `asphalt_pit_lane` pour la voie des stands) | CC0 | tevy `race-asphalt` KTX2 1K, ou PH 1K |
| Vibreurs | **Texture générée** rouge/blanc 2048×512 + modèle tevy `track-kerb` | CC0 | 1024×256 (générée) |
| Terre | Poly Haven **dirt** 2K | CC0 | PH 1K |
| Béton / murs | ambientCG **Concrete034** 2K + modèles tevy `concrete-wall`, `tyre-barrier`, `catch-fence` | CC0 | tevy `worn-concrete` KTX2 1K |
| HDRI ciel | Poly Haven **stuttgart_hillside** (couvert, collines boisées, Allemagne) 4K/2K/1K .hdr | CC0 | 1K .hdr pour l'éclairage + ciel LDR tevy `overcast` 1K/2K JPG |
| Foule / tribunes | tevy `grandstand` + `grandstand-crowd` (GLB, 3 LOD) | CC0 | LOD1/LOD2 |
| Sons | OpenGameArt CC0 (vent, impacts, gravier/pas) ; Freesound CC0 listé mais **non téléchargeable depuis la machine** (403) | CC0 | m4a AAC (iOS) |

**Formats conseillés pour iPhone Safari**
- Textures : KTX2 (Basis : ETC1S pour la couleur, UASTC pour les normales) en 1K, ou JPG 1K. Cela réduit la mémoire GPU d'environ 4 à 6 fois par rapport au JPG décompressé. Garder le 2K pour l'asphalte au premier plan seulement.
- Pack ORM/ARM (AO+Rough+Metal dans une seule texture) : les fichiers Poly Haven `arm` et tevy `orm` sont déjà packés, à brancher sur `aoMap` + `roughnessMap` + `metalnessMap` de three.js.
- HDRI : 1K .hdr pour `scene.environment` via PMREM. Pour l'arrière-plan, un JPG LDR 2K (ou tevy `overcast/2k.jpg`, qui est un UltraHDR de 84 Ko).
- Sons : **AAC .m4a** (Safari lit toujours l'AAC, et l'Ogg Vorbis n'est pas fiable sur iOS). Garder .ogg/.wav comme sources. Les m4a sont déjà générés pour le vent.

---

## 1. Ressources libres (2 à 3 options par catégorie, la meilleure en premier)

Toutes les URL ci-dessous ont été testées avec curl (200 ou 206). Les tailles sont en octets ou en Mo.

### 1.1 Gravier de bac (gravel trap)
1. **ambientCG Gravel023** — galets ronds blanc-gris, très proches d'un bac F1. Page : https://ambientcg.com/a/Gravel023 · Licence **CC0 1.0** · max 8K.
   - 2K-JPG : https://ambientcg.com/get?file=Gravel023_2K-JPG.zip (31,4 Mo) ✅ **téléchargé** (cartes extraites, zip supprimé)
   - 1K-JPG (mobile) : https://ambientcg.com/get?file=Gravel023_1K-JPG.zip (9,9 Mo) ✅
2. **tevy.dev gravel-trap**, faite pour ça : « pea gravel 10-20 mm, ornières de pneus ratissées », 2 m par répétition. Page : https://tevy.dev/materials/gravel-trap · **CC0 1.0 (déclarée)** · KTX2 1K/2K (couleur 0,9 Mo, normale 2,9 Mo, ORM 1,9 Mo en 2K). ✅ **téléchargé (1K+2K)**. ⚠️ Le site est récent (assets publiés en octobre 2026, probablement générés de façon procédurale) : la licence est déclarée CC0, mais la provenance est moins établie que Poly Haven ou ambientCG.
3. **Poly Haven clean_pebbles** — https://polyhaven.com/a/clean_pebbles · CC0 · max 8K. Diff 2K : https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/clean_pebbles/clean_pebbles_diff_2k.jpg (3,0 Mo), nor_gl 2K (4,9 Mo), arm 2K (3,6 Mo). Variante plus fine : `gravel_floor_02` (diff 2K 4,7 Mo).

### 1.2 Herbe (texture + brins / alpha cards)
1. **ambientCG Grass001** — gazon dense et vert, idéal pour les bas-côtés tondus. https://ambientcg.com/a/Grass001 · CC0 · 2K-JPG : https://ambientcg.com/get?file=Grass001_2K-JPG.zip (38,9 Mo) ✅ **téléchargé** · 1K : `Grass001_1K-JPG.zip` (10,7 Mo) ✅.
2. **ambientCG Grass004** (plus sec et jaunâtre, plus « Ardennes fin d'été ») — `Grass004_2K-JPG.zip` (39,9 Mo) / `Grass004_1K-JPG.zip` (11,0 Mo) ✅.
3. **tevy track-grass** (« Trackside Mown Grass ») KTX2 1K/2K ✅ **téléchargé** — option mobile. Alternative : tevy `meadow-ground`.
- **Brins / touffes 3D :** **Poly Haven grass_medium_01** (glTF, CC0) https://polyhaven.com/a/grass_medium_01 — glTF 2K : https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/grass_medium_01/grass_medium_01_2k.gltf + .bin (1,0 Mo) + textures diff/nor_gl/arm 2K, plus `alpha_2k.jpg` (1,3 Mo) pour faire des alpha cards ✅ **téléchargé**. Alternatives : `grass_bermuda_01` (glTF 1K ≈ 1,45 Mo), `grass_medium_02` (≈ 0,8 Mo) ; touffes tevy `lawn-tufts`, `grass-clump`, `meadow-grass-patch` (GLB CC0, non téléchargées).
- Conseil mobile : sur iPhone, instancier (InstancedMesh) des cartes croisées avec `alphaTest` (pas de transparence triée), seulement dans les 30 à 50 m autour de la voiture. Au-delà, la texture de sol suffit.

### 1.3 Asphalte de piste
1. **Poly Haven asphalt_track** — « dark, fine-grained tarmac… race track », par Dimitrios Savva. https://polyhaven.com/a/asphalt_track · CC0 · max 8K. ✅ **téléchargé en 2K** (diff 3,8 Mo · nor_gl 3,7 Mo · arm 2,5 Mo · disp 0,9 Mo). 1K : diff 0,86 Mo, nor_gl 0,83 Mo, arm 0,53 Mo (`.../jpg/1k/asphalt_track/asphalt_track_diff_1k.jpg`, etc.).
2. **Poly Haven asphalt_pit_lane** (asphalte plus clair, pour la voie des stands) — https://polyhaven.com/a/asphalt_pit_lane · CC0 · ✅ **téléchargé en 2K** (diff 4,2 Mo, nor_gl 4,3 Mo, arm 2,7 Mo).
3. **tevy race-asphalt** KTX2 ✅ **téléchargé** (mobile), ou **ambientCG Asphalt025C** `https://ambientcg.com/get?file=Asphalt025C_2K-JPG.zip` (32,2 Mo) ✅.

### 1.4 Vibreurs (kerbs rouge/blanc)
Il n'existe pas de bonne texture photo CC0 de vibreur F1 sur Poly Haven ou ambientCG.
1. **Texture générée (New Bot, procédurale, sans droits tiers)** : `downloads/vibreurs/genere_cc0/` — albédo 2048×512 (1 tuile = 4 m × 1 m, segments rouges et blancs de 1 m, usure, traces de gomme, joints), rugosité, normale OpenGL (profil bombé). Versions mobiles en 1024×256. ⚠️ Le bruit d'usure n'est pas parfaitement raccordé en X à la jointure de tuile. Le motif rouge/blanc, lui, se raccorde bien. Une version shader procédurale (stripes calculées sur la coordonnée de piste) serait encore plus légère.
2. **tevy track-kerb** (modèle GLB 5 m × 1 m, rampe arrondie + bande rugueuse, peinture usée) — https://tevy.dev/models/track-kerb · CC0 · LOD0 428 Ko / LOD1 147 Ko / LOD2 43 Ko ✅ **téléchargé**.
3. Base « peinture sur béton » pour un shader maison : Poly Haven `concrete_floor_painted` ou ambientCG `Concrete034` (rugosité + normale) avec une couleur rouge/blanc procédurale.
- À Spa 2020 : les vibreurs sont rouge/blanc classiques. Au virage 14, ils sont **jaune et rouge** (limite de piste définie par les vibreurs jaune/rouge peints, notes FIA 2020 §20.6). Toute l'herbe artificielle a été retirée en 2020 (§14.3).

### 1.5 Terre
1. **Poly Haven dirt** — https://polyhaven.com/a/dirt · CC0 · ✅ **téléchargé 2K** (diff 3,1 Mo, nor_gl 4,9 Mo, arm 2,6 Mo, disp 1,3 Mo).
2. **Poly Haven park_dirt** (terre + herbe clairsemée, bonne transition herbe/bac) — diff 2K 4,8 Mo / 1K 1,1 Mo ✅.
3. **Poly Haven brown_mud_leaves_01** (terre forestière avec feuilles, pour les sous-bois des Ardennes) — diff 2K 4,5 Mo ✅.

### 1.6 Béton / murs
1. **ambientCG Concrete034** (béton lisse et propre, pour les murs et barrières) — https://ambientcg.com/a/Concrete034 · CC0 · ✅ **téléchargé 2K** (`Concrete034_2K-JPG.zip`, 10,6 Mo ; 1K 3,7 Mo).
2. **Modèles tevy** ✅ **téléchargés** (GLB, 3 LOD) : `concrete-wall` (mur béton + grillage, 6 m), `tyre-barrier` (mur de pneus 4 m, bandes rouge/blanc), `catch-fence` (grillage de sécurité 5 m). Matériau `worn-concrete` en KTX2.
3. **Poly Haven concrete_slab_wall** (diff 2K 2,4 Mo) ou **ambientCG Concrete031** (panneaux avec joints, `Concrete031_2K-JPG.zip` 29,3 Mo) ✅. Poly Haven propose aussi des modèles `concrete_road_barrier` / `_02` (blocs type Jersey).

### 1.7 HDRI — ciel nuageux d'Europe de l'Ouest
Les trois sont photographiés en Europe centrale et de l'Ouest (coordonnées Poly Haven), avec un relief et une forêt proches des Ardennes.
1. **stuttgart_hillside** (Stuttgart, 48.79 N 9.16 E) — couvert, collines, arbres, faible contraste. https://polyhaven.com/a/stuttgart_hillside · **CC0** · max 16K. ✅ **téléchargé** : 4K .hdr (27,4 Mo), 2K .hdr (6,8 Mo), 1K .hdr (1,7 Mo).
2. **hausdorf_meadow** (Pologne/Basse-Silésie, 50.64 N 16.51 E) — couvert, prairie, lisière de forêt, beaux nuages structurés. ✅ **téléchargé 2K .hdr** (6,6 Mo). 4K : 25,9 Mo.
3. **drackenstein_quarry_puresky** (Jura souabe) — ciel seul partiellement nuageux, sans sol, pratique si le décor 3D couvre l'horizon. 2K .hdr 5,1 Mo / 4K 18,9 Mo ✅. Alternative LDR très légère : tevy `overcast` (2K JPG 84 Ko ✅ **téléchargé**), et `scattered-cumulus`.
- URL type : `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/{1k|2k|4k}/<id>_{res}.hdr` (également en `.exr`, environ 5 fois plus lourd ; inutile sur le web).

### 1.8 Foule et tribunes
1. **tevy grandstand** (« Covered Grandstand ») — tribune couverte acier/béton de 20 m, 12 rangées de sièges bleus jusqu'à environ 8 m, toit en porte-à-faux, sections répétables tous les 20 m. https://tevy.dev/models/grandstand · CC0 · LOD0 505 Ko / LOD1 215 Ko / LOD2 40 Ko ✅ **téléchargé**.
2. **tevy grandstand-crowd** — public assis pour 10 m de cette tribune (21 sièges × 12 rangées, casquettes, quelques drapeaux), 76k triangles en LOD0 et 17,5k en LOD2. https://tevy.dev/models/grandstand-crowd · CC0 · 158/133/81 Ko ✅ **téléchargé**. ⚠️ Les GLB tevy utilisent `EXT_meshopt_compression` + `KHR_texture_basisu` : il faut `MeshoptDecoder` + `KTX2Loader` dans three.js (voir https://tevy.dev/llms.txt).
3. Option la plus légère pour mobile : des **imposteurs** (quads instanciés avec un atlas de silhouettes colorées) à générer soi-même. Il n'y a pas de bon atlas de spectateurs CC0 photo-réaliste sur OpenGameArt (seulement du pixel-art, par exemple « Spritesheet People », CC0). Matériaux de tribune : tevy `corrugated-metal` (toit), Poly Haven `rusty_painted_metal`.

### 1.9 Sons
**Important :** freesound.org et son CDN renvoient **403** depuis la machine partagée, donc rien n'a été téléchargé depuis Freesound. Ses fichiers originaux demandent de toute façon un compte gratuit. BigSoundBank (tout en CC0) interdit aux robots et agents IA de récupérer `/UPLOAD/` (robots.txt + ai.txt) : je l'ai respecté et n'y ai rien téléchargé. Un humain peut le faire à la main.

Téléchargé (OpenGameArt, licence CC0 vérifiée sur chaque page) ✅ :
| Catégorie | Fichier(s) | Page | Taille | Note |
|---|---|---|---|---|
| Vent (meilleur) | `sons/vent/oga_park_ambience_wind.wav` (4 min 17, 48 kHz stéréo) + `_60s_mobile.m4a` / `.ogg` | https://opengameart.org/content/park-ambiences | 74,0 Mo (wav) / 0,97 Mo (m4a) | ambiance extérieure avec vent ; 60 s avec fondu, à boucler |
| Vent (alt.) | `sons/vent/oga_wind_background_noise_2.wav` + `_mobile.m4a` | https://opengameart.org/content/mild-wind-background-noise | 15,7 Mo / 0,7 Mo | vent qui forcit ; quelques bruits de sac en fond |
| Impacts / crash | `sons/impacts/oga_sfx_breaking_and_falling/` (75 .ogg : hit, metal_hit, rock, glass…) | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | 1,8 Mo | bon pour les contacts et débris ; mélanger metal_hit et rock_hit |
| Impacts (alt.) | `sons/impacts/oga_qubodupImpact.7z` | https://opengameart.org/content/impact | 0,13 Mo | archive 7z (à extraire avec `7z x`) |
| Gravier / herbe | `sons/gravier_herbe/oga_kdd_DifferentSteps/` (gravel.ogg, leaves, mud, stone…) + `oga_Fantozzi-footsteps.7z` | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud · https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | 0,09 Mo / 0,48 Mo | ⚠️ ce sont des **pas**. Ils servent de grains pour un granulateur, pas de vrai son de pneus |
| Foule (placeholder) | `sons/foule/oga_crowd_shouting.ogg` | https://opengameart.org/content/crowd-shoutingspeaking-ambience | 0,34 Mo | ⚠️ qualité moyenne (foule « manif ») |

Meilleures options **Freesound CC0** à télécharger à la main avec un compte gratuit. La licence CC0 a été vérifiée parce qu'elles apparaissent dans les recherches Freesound filtrées « Creative Commons 0 » ; revérifier sur la page avant usage :
- **Moteur F1** : ⚠️ aucun enregistrement CC0 de **V6 turbo-hybride (2014+)** trouvé. Meilleurs substituts, des **V8 2012** enregistrés par Ears68 : « F-1raceCar-IdleAndRaceStartDemo.wav » (ralenti vers 6 700 tr/min puis départ, 25 s, wav 44,1 kHz) https://freesound.org/people/Ears68/sounds/181187/ ; « F1practice3MelbGP2012DR066.wav » https://freesound.org/people/Ears68/sounds/150337/. Le timbre d'un V8 atmo est plus aigu et plus « hurlant » que celui du V6 hybride de la W11 (15 000 tr/min max, son plus grave et plus « turbo »). **Recommandation : synthèse procédurale Web Audio** (harmoniques d'un 6 cylindres = 3 explosions par tour, fondamentale = tr/min/60×3, + sifflement turbo/MGU-H filtré + bruit de whine de boîte). C'est plus fidèle, gratuit, et ne coûte aucun Mo. Utiliser éventuellement le V8 au ralenti, pitché vers le bas, pour le « bas régime ».
- **Gravier (pneus)** : « Car_Drive_Gravel_01.wav » de BenDrain https://freesound.org/people/BenDrain/sounds/487827/ (série 01/02).
- **Vibreurs** : « rumble.wav » de cognito perceptu (berline sur bandes rugueuses, 31 s) https://freesound.org/people/cognito%20perceptu/sounds/104634/ ; « TRANSPORTATION CAR PASS BY 01.wav » de sengjinn (13 s, 48 kHz/24 bits) https://freesound.org/people/sengjinn/sounds/176215/. Sinon en procédural : impulsions de bruit filtré dont la fréquence = vitesse / longueur d'un segment de vibreur.
- **Ambiance de foule** : « noise#01.aif » de huubjeroen (stade de Feyenoord, 5 min 25) https://freesound.org/people/huubjeroen/sounds/39733/. ⚠️ Pour le contexte : le GP de Belgique 2020 s'est couru **à huis clos** (Covid, « Closed Event » dans les notes FIA 2020 §13.1). Une foule n'est donc « fidèle » que pour une ambiance hors 2020.
- Ambiance F1 réelle (CC0 selon le filtre, URL non relevée) : « finish2011.wav » (F1 Japon 2011, virage 200R).

---

## 2. Fiche technique — volant Mercedes-AMG F1 W11 (2020)

Mercedes ne publie pas de schéma officiel détaillé du volant 2020. La fiche combine les sources officielles Mercedes sur le volant **2019** (W10, dont celui de 2020 est une évolution), l'analyse du volant de Rosberg **2016** par Piola/Motorsport, et des articles de 2020. ⚠️ = extrapolé.

### 2.1 Généralités
- **25 boutons et commandes**, plus l'embrayage et les palettes de vitesses (volant Mercedes 2019, source officielle). Boutons de qualité aéronautique, avec des collerettes plastiques anti-appui accidentel, ajustées selon le circuit.
- Fabriqué à Brackley en carbone, fibre de verre, silicone, titane et cuivre, environ 80 h par volant, 3 ou 4 volants par pilote et par saison. **L'écran central et sa carte sont des pièces communes à toutes les équipes.**
- Ergonomie, positions et couleurs **différentes entre Hamilton et Bottas**.
- Spécificité W11 : le **DAS (Dual Axis Steering)**. En tirant ou poussant toute la colonne de direction (et non un bouton), le pilote modifie le pincement des roues avant. Le DAS a été interdit à partir de 2021.

### 2.2 Écran
- Écran couleur central (standard FIA commun, identifié comme **PCU-8D** de McLaren Applied sur le volant 2016). ⚠️ Le modèle exact en 2020 n'est pas confirmé, mais il s'agit toujours d'une pièce commune selon Mercedes.
- « **Plus de 100 pages** d'informations » (NewsF1 2020). Navigation par les boutons **+1** (page suivante) et **+10** (saut de 10 pages), vus sur le volant Mercedes 2016.
- Infos typiques ⚠️ (extrapolées des affichages F1 2016-2020, pas de capture W11 publique détaillée) : rapport engagé (gros chiffre), vitesse, delta au tour de référence, temps au tour, position et écarts, valeur de **brake balance** (en %, typiquement 55-60 % à l'avant), positions **STRAT / HPP / diff**, état de charge et déploiement ERS, cible carburant (lift & coast), températures et pressions des pneus et des freins, messages et alertes de la direction de course et de l'équipe.
- Pour le jeu, proposer 3 ou 4 pages : (1) Course : rapport, vitesse, delta, position, tour ; (2) Énergie : batterie %, mode STRAT, OT dispo, carburant ; (3) Réglages : BB %, diff ENTRY/MID/HISPD, EB ; (4) Pneus : temps des 4 pneus et des 4 freins.

### 2.3 LEDs
- **15 LEDs de shift** au-dessus de l'écran central (Mercedes, volant 2019 ✅).
- ⚠️ Couleurs et séquence (non documentées pour la W11, convention courante en F1 2014-2020) : allumage de gauche à droite ou des bords vers le centre, **5 vertes → 5 rouges → 5 bleues/violettes**, puis clignotement de toutes au point de passage. Sous le limiteur, clignotement spécifique.
- **Feux de signalisation (marshalling) intégrés** : « deux paires de lumières » qui s'allument pour les **drapeaux jaunes** (danger immédiat) et **blancs** (véhicule lent, voiture de sécurité…) selon NewsF1 2020. Le système FIA (F1 Marshalling System) affiche aussi des **lumières bleues dans le cockpit** pour les drapeaux bleus (notes FIA Spa 2020 §12 : « blue light panels, blue cockpit lights »). Les sources génériques citent le jeu jaune / rouge / bleu. ⚠️ La disposition exacte (groupes à gauche et à droite de l'écran) est extrapolée.
- Suggestion pour le jeu : LEDs flag de part et d'autre de l'écran (jaune, bleu, rouge, vert, blanc, et VSC/SC en jaune clignotant).

### 2.4 Boutons (noms, fonctions, positions approximatives)
Les positions ci-dessous viennent du volant Mercedes 2019 décrit par Mercedes (vidéo et explications de Short, essentiallysports) et de celui de 2016 (Piola). ⚠️ Elles sont approximatives et ont pu bouger en 2020.

| Repère | Couleur probable | Position approx. | Fonction |
|---|---|---|---|
| **DRS** | jaune | haut gauche | ouvre le volet d'aileron arrière (zone DRS, < 1 s à la détection) |
| **N** (neutral) | vert | haut gauche | point mort ; appui long = marche arrière (NewsF1) |
| **DEFAULT** / « driver default » | — | haut gauche | rétablit les réglages par défaut en cas de problème |
| **OT** (Overtake) | orange | haut gauche | déploiement ERS max momentané (attaque/défense) |
| **BB−** / **BB+** | rouge / — | bas de part et d'autre (« de chaque côté de la base du volant », 2019) | réglage fin de la répartition de freinage (±0,5 % par cran ⚠️) |
| **PL** (Pit Limiter) | jaune | côté droit | limiteur de vitesse de la voie des stands (80 km/h à Spa) |
| **PC** (Pit Confirm), « PC/R » en 2016 | orange | haut droit | confirme un arrêt ou un ordre du stand sans parler |
| **TALK / RADIO** | gris | côté droit (2016) | push-to-talk radio |
| **+1 / +10** | — | gauche/droite | pages de l'écran |
| **MARK** | jaune | gauche | pose un repère dans la télémétrie |
| **RS** (Race Start) | — | ⚠️ | carte de départ (embrayage + ERS) |
| **OK / ACCEPT** | rouge (croix) | ⚠️ | valide un changement de paramètre |
| **Skip 1/10 Preset** | — | ⚠️ | gestion des capteurs ou presets critiques |
| Bouton « magic » (au dos) | — | dos du volant | « brake magic » / chauffe des pneus avant (BMIG) ; c'est lui qu'Hamilton a accroché à Bakou 2021, ce qui a passé le BB vers environ 90 % avant |

### 2.5 Rotatifs (3 en bas, cœur des modes moteur)
| Rotatif | Position | Fonction |
|---|---|---|
| **STRAT** | bas gauche | **mode stratégique** du groupe propulseur : moteur thermique + déploiement MGU-K + récupération MGU-K/MGU-H. Bouton « le plus important » selon Mercedes. Environ 16 positions ⚠️ (motorsinside). Exemple 2016 : STRAT 6 = économie (voie des stands, SC) ; 3 et 4 = course/qualif. |
| **MULTI** (multifonction, centre, violet sur certaines photos) | bas centre | menus : composé de pneu monté (calibrage des capteurs), point de morsure de l'embrayage, reset de capteurs, luminosité de l'écran, volume radio, mode pluie… S'utilise souvent avec OK. |
| **HPP** (turquoise) | bas droit | réglages du groupe propulseur et de l'énergie (mélange, avance, MGU-K) ; en 2016, servait aussi à choisir l'angle d'aileron voulu au pit stop. |

### 2.6 Molettes (thumbwheels)
- **Différentiel (3 molettes, 2 à gauche et 1 à droite en 2019)** : **ENTRY** (entrée de virage), **MID** (milieu/apex), **HI SPD / EXIT** (sortie ou virages rapides). Elles règlent le transfert de couple entre les roues arrière.
- **EB** (Engine Braking), à gauche de l'écran : frein moteur.
- **BBAL** (Brake Balance, réglage de base), à droite de l'écran : la répartition de base, que les boutons BB± affinent. En 2019, Mercedes compte **5 commandes liées au freinage** : répartition, réglage par virage, frein moteur, **BMIG / brake migration** (répartition dynamique selon la pression de pédale), etc.

### 2.7 Palettes
- **Vitesses** : palette droite = montée, palette gauche = descente (environ 40 à 50 passages par tour). 8 rapports + marche arrière, sélectionnée par N en appui long.
- **Embrayage** : double palette d'embrayage, utilisée surtout au départ (le pilote en lâche une, puis module l'autre) ⚠️ (convention F1, pas détaillée pour la W11).

### 2.8 Sources
- Mercedes-AMG F1, « How Does an F1 Steering Wheel Work? » (volant 2019) : https://www.mercedesamgf1.com/news/how-does-an-f1-steering-wheel-work
- Motorsport.com, « Revealed: How Mercedes' F1 steering wheel works » (2019) : https://www.motorsport.com/f1/news/mercedes-f1-steering-wheel-works/4351666/
- Motorsport.com / Piola, « Tech analysis: The secrets of the Mercedes steering wheel » (2016) : https://www.motorsport.com/f1/news/tech-analysis-the-secrets-of-the-mercedes-steering-wheel-733203/733203/
- NewsF1.it, « Il funzionamento del volante della Mercedes Formula 1 » (sept. 2020, W11) : https://www.newsf1.it/il-funzionamento-del-volante-della-mercedes-formula-1/
- Motorsport.com, « F1 steering wheels: how they work » (2024, table des boutons, DAS 2020) : https://www.motorsport.com/f1/news/f1-steering-wheels-how-they-work-what-the-buttons-do-and-more/10561142/
- motorsinside.com (STRAT 1-16, MULTI, HPP) : https://www.motorsinside.com/en/f1/news/29469-everything-you-need-know-about-steering-wheel-of-an-f1-car.html
- Formula1-dictionary (LEDs marshalling) : https://www.formula1-dictionary.net/f1-steering-wheel/
- Notes du directeur de course FIA, Spa 2020 (lumières bleues cockpit) : voir §3.
- Vidéo Mercedes « Steering wheel explained » (à visionner pour les positions exactes) : https://www.youtube.com/watch?v=giWg44Uprb4. Photo du volant W11 : https://www.reddit.com/r/formula1/comments/ixgul1/mercedesamg_w11_steering_wheel/

---

## 3. Spa-Francorchamps (configuration F1 2020)

### 3.1 Chiffres officiels
- **Longueur : 7,004 km** (« Circuit Centreline Length », plan FIA 2020 ✅). 44 tours, 308,052 km. **Décalage ligne de départ / ligne d'arrivée : 0,124 km** : la ligne de départ (grille) est 124 m **après** la ligne de contrôle (préview FIA 2019).
- **Limitation de vitesse dans la voie des stands : 80 km/h** en essais, qualifications **et course** (préview FIA 2019 ✅ ; 80 km/h en 2020 confirmé par des sources secondaires). Donc **oui, 80 km/h en 2020**.
- **Longueur de la voie des stands** : **653 m** de la séparation d'entrée au virage 19 jusqu'à la fin de la ligne de sortie après le virage 1 (oversteer48). Le tracé OpenStreetMap « Pit Lane » mesure **≈ 720 m** de nœud à nœud (sortie de la Chicane → après La Source). ⚠️ La partie réellement limitée à 80 km/h (de « Pit lane starts » à « Pit lane ends ») est plus courte. Une source de 2018 (f1technical) donne 385 m et une perte d'environ 17 s, une autre (oversteer48) environ 23 s de traversée arrêt compris. **Pour le jeu : environ 650 m au total, dont environ 400 à 450 m à 80 km/h.**
- 2020 : épreuve **à huis clos**. Changements 2020 : mur rallongé à droite à la sortie du V1 (entrée de la voie Endurance), barrière de pneus rallongée à la sortie du V4, **toute l'herbe artificielle retirée**.

### 3.2 Entrée des stands, sortie et lignes blanches (notes FIA 2020 + plan de la voie des stands)
- **Entrée** : dans la **Chicane (Arrêt de Bus, V18-V19), côté droit**. La voie se sépare de la piste dans la chicane : la voiture garde la droite au lieu de prendre le dernier gauche. **Plot (bollard) d'entrée** : obligation de passer **à droite du plot**, et interdiction de franchir la zone peinte entre l'entrée et la piste (§19.2-19.3). La **ligne Safety Car 1** est à cet endroit, et le panneau lumineux « Pit Entry Status » (croix rouge = stands fermés, flèche jaune clignotante = passage obligé sous SC) est en amont.
- **Garages** : à droite de la ligne droite. Ordre depuis l'entrée : F1/FIA (1-5), puis **Mercedes (garages 6-8)**, Ferrari, Red Bull, McLaren, Renault, AlphaTauri, Racing Point, Alfa Romeo, Haas, Williams (40-42, côté sortie). **La ligne de contrôle est au niveau des garages FIA et Mercedes**, et la **pole position** à peu près au milieu de la voie.
- **Sortie** : après **La Source (V1)**. La voie des stands contourne l'épingle par l'intérieur et rejoint la piste dans la descente vers l'Eau Rouge. **Ligne blanche continue de sortie : interdiction de la franchir, il faut rester à droite** (§19.1). Les départs d'essai se font **à droite après la sortie**, entre la ligne blanche du bord droit et le mur, avant la **ligne SC2** (§18). La ligne SC2 est sur le côté droit, juste avant la descente vers l'Eau Rouge (plan FIA).
- Plus loin à droite : la **voie des stands Endurance** (≈ 1,2 km selon OSM, 1,02 km selon oversteer48), qui rejoint après le Raidillon. Elle n'est **pas utilisée en F1**, mais elle est visible : murs et garages entre La Source et l'Eau Rouge.

### 3.3 Positions sur le tour (calculées sur le tracé OpenStreetMap, 6 995 m au lieu de 7 004 m, écart de 0,13 %)
Origine OSM = sortie de la Chicane. Ligne de contrôle estimée à **≈ 210 m après la sortie de la Chicane** ⚠️, calculée à partir de la pole à 270,8 m de l'apex du V1 (f1technical 2018) et du décalage de 124 m.

| Point | Dist. depuis sortie Chicane | Dist. depuis ligne de contrôle (≈) | GPS (WGS84) | Alt. (EU-DEM, ±5 m) |
|---|---|---|---|---|
| Sortie Chicane / début voie OSM | 0 m | −210 m (6,79 km) | 50.441551, 5.966795 | 410 m |
| **Ligne de contrôle (estimée)** ⚠️ | ≈ 210 m | 0 | ≈ 50.44299, 5.96612 | ≈ 415 m |
| Ligne de départ / pole (estimée) ⚠️ | ≈ 335 m | ≈ +125 m | ≈ 50.44396, 5.96525 | ≈ 420 m |
| Apex La Source (V1) | ≈ 610 m | ≈ +400 m | 50.446112, 5.963341 | ≈ 430 m |
| **Fin de la ligne de sortie des stands (jonction OSM)** | 782 m | ≈ +570 m | 50.445683, 5.965407 | 421 m |
| Eau Rouge (bas, V2) | 1 241 m | ≈ +1 030 m | 50.442834, 5.970022 | 393 m |
| Raidillon (début montée, V3) | 1 334 m | ≈ +1 125 m | 50.442294, 5.971009 | 393 m |
| Haut du Raidillon / début Kemmel (V4) | 1 557 m | ≈ +1 345 m | 50.440556, 5.972347 | 415 m |
| Les Combes (V5) | 2 609 m | ≈ +2 400 m | 50.431758, 5.977466 | 462 m |
| Blanchimont | 5 927 m | ≈ +5 715 m | 50.433424, 5.963961 | 386 m |
| Entrée Arrêt de Bus (1er droite) | 6 832 m | ≈ −375 m (6,62 km) | 50.440291, 5.966547 | — |
| **Entrée des stands (séparation dans la Chicane)** ⚠️ | ≈ 6 930-6 995 m | ≈ −280 à −210 m | ≈ 50.4414, 5.9664 → 50.44155, 5.96680 | ≈ 410 m |

- DRS 2020 (plan FIA) : détection 1 à 240 m avant le V2, **activation 1 à 230 m après le V4** (Kemmel) ; détection 2 à 160 m avant le V18, **activation 2 à 30 m après le V19** (ligne droite des stands). Speed trap à 30 m après le V4. S1 à 145 m avant le V5, S2 à 48 m avant le V15.
- Dénivelé : Eau Rouge est le point bas local (≈ 393 m), le haut du Raidillon est environ 25 à 35 m plus haut, et le dénivelé total du circuit est d'environ 100 m.
- **Géométrie exportée** : `/workspace/w11-shared/spa_osm_geometry.json` contient la polyligne lat/lon du tour, la voie des stands F1, la voie Endurance et les polygones des tribunes. Licence ODbL, attribution OSM requise si utilisée en jeu.

### 3.4 Tribune du Raidillon / Eau Rouge
- ⚠️ **En 2020, la grande tribune permanente « Gold 3 » n'existait pas** : elle a été **inaugurée en 2022**. En 2020 (course à huis clos), il y avait seulement des tribunes temporaires (type « Gold 4 ») sur la pente. Pour un rendu « 2020 » strict : tribunes temporaires vides ou absentes. Pour un rendu « Spa moderne » : Gold 3.
- **Gold 3 « Eau Rouge / Raidillon »** (polygone OSM « Tribune Raidillon », way 1134053908) :
  - **Côté : gauche de la piste (extérieur du Raidillon)**, en haut de la montée, juste derrière le grillage et les pneus.
  - Centre GPS **50.441247, 5.972764**. Coins OSM : (50.441677, 5.972460) (50.441725, 5.972740) (50.440603, 5.973221) (50.440554, 5.972939).
  - Emprise au sol **≈ 129 m × 21 m**. Grand axe orienté **≈ 165° / 345° (NNO–SSE)**, parallèle à la montée (la piste y suit un cap d'environ 170°). La tribune **regarde vers l'ouest / sud-ouest**, vers la piste, l'Eau Rouge et La Source. Elle est à **≈ 55 m** de l'axe de la piste, au niveau de la sortie du Raidillon et du début du Kemmel (≈ 1,49 km de la sortie de la Chicane).
  - **22 rangées**, très pentues. **6 blocs** A à F : A et F font 20 sièges de large, B à E 45 sièges, soit ≈ 220 sièges par rangée et ≈ 4 800 places ⚠️ (calcul). Bancs **sans dossier**. **Toit** porté par l'arrière, très haut (les 10 premières rangées sont exposées à la pluie), pas de parois latérales. Loges VIP sous les gradins.
  - Hauteur ⚠️ estimée : 22 rangées × ≈ 0,55-0,6 m ≈ **12-13 m de gradins**, plus le toit, soit **≈ 16-20 m au total** au-dessus du terrain naturel (le terrain est déjà ≈ 25-30 m au-dessus de l'Eau Rouge).
- **Gold 4** (temporaire, **non couverte**, sièges individuels avec dossier) : côté gauche, **à mi-pente ou aux deux tiers du Raidillon**, en contrebas de Gold 3. Deux groupes : A-C plus haut (A = 30 rangées, B-C = 27), D-F plus bas vers La Source (27 rangées). Pas de polygone OSM.

### 3.5 Autres tribunes (polygones OSM `building=grandstand`, toutes à **gauche** de la piste dans le sens de course)
| Nom OSM | Centre GPS | Dimensions au sol (≈) | Grand axe | Distance à la piste | Position |
|---|---|---|---|---|---|
| **Tribune F1** (≈ « Gold 1 », face aux stands) | 50.443350, 5.965306 | 89 × 22 m | ≈ 150°/330° | ≈ 58 m | ligne droite des stands, **en face des garages** (≈ 225 m après la Chicane, donc au niveau de la ligne et de la grille) |
| Grandstand Silver 1 | 50.445469, 5.967070 | 122 × 18 m | ≈ 130°/310° | ≈ 43 m | sortie de La Source, descente vers l'Eau Rouge |
| Tribune Endurance | 50.444768, 5.968235 | 101 × 31 m | ≈ 130°/310° | ≈ 43 m | idem, plus bas, après la voie Endurance |
| Tribune RX | 50.444654, 5.970904 | 211 × 96 m (emprise) | — | ≈ 180 m | colline face à l'Eau Rouge (zone rallycross) |
| 3 petites tribunes sans nom | ≈ 50.44681, 5.96297-5.96371 | 17-33 × 11-20 m | — | ≈ 60-70 m | extérieur de La Source |
| Tribune Raidillon (Gold 3) | 50.441247, 5.972764 | 129 × 21 m | ≈ 165°/345° | ≈ 56 m | voir 3.4 |

Les autres tribunes connues (Combes, Pouhon/Gold 6-9, Silver 2-6, Speed Corner…) n'ont pas de polygone dans OSM. Voir le guide des tribunes oversteer48.

### 3.6 Sources Spa
- Notes du directeur de course FIA, GP de Belgique 2020, version 3 (doc 18) : https://www.fia.com/sites/default/files/doc_18_-_2020_belgian_grand_prix_-_race_directors_event_notes_version_3.pdf (plan de la voie des stands p. 9, entrée et sortie, lignes SC1/SC2, plot, ligne blanche, départs d'essai, garages)
- Plan du circuit FIA 2020 (DRS, secteurs, 7,004 km) : https://www.fia.com/sites/default/files/decision-document/2020%20Belgian%20Grand%20Prix%20-%20Circuit%20Map_0.pdf
- Préview FIA 2019 (80 km/h, 7,004 km, décalage de 0,124 km) : https://api.fia.com/sites/default/files/2019_belgian_gp_preview_0.pdf
- oversteer48, tracé et voies des stands (653 m, voie Endurance 1,02 km) : https://oversteer48.com/spa-francorchamps-track-layout/ ; tribune Gold 3 : https://oversteer48.com/gold-3-spa-grand-prix-grandstand/ ; Gold 4 : https://oversteer48.com/gold-4-spa-francorchamps/
- f1technical, GP technical newsletter 2018 (pole → apex du V1 = 270,8 m) : https://f1tcdn.net/files/2018/gptechnical_newsletter02.pdf
- OpenStreetMap (© contributeurs OSM, ODbL) via l'API Overpass : ways `highway=raceway` (Pit Lane 323851541, Support Pit Lane 126807525, La Source 175178443, Eau Rouge 126835639, Raidillon 126835637, Kemmel 126835638, Chicane 637268672…) et `building=grandstand`. ⚠️ Si la géométrie OSM est utilisée **dans le jeu**, il faut attribuer « © OpenStreetMap contributors » (licence ODbL, pas CC0).
- Altitudes : OpenTopoData, jeu EU-DEM 25 m (précision ±5 à 10 m).

---

## 4. Points incertains (récapitulatif)
1. **Pas de son CC0 de V6 hybride** : les substituts sont des V8 2012 ; la synthèse procédurale est recommandée.
2. **Freesound et BigSoundBank n'ont pas été téléchargés** (403 et politique anti-agents). Les liens sont fournis pour un téléchargement manuel ; les sons OGA téléchargés sont de qualité moyenne (surtout gravier et foule).
3. **tevy.dev** : licence CC0 déclarée, très adapté à three.js et au mobile, mais le site est récent (assets d'octobre 2026). À valider visuellement.
4. **Volant W11** : pas de schéma officiel 2020. Positions et couleurs extrapolées des volants Mercedes 2016 et 2019 ; couleurs et séquence des LEDs non confirmées.
5. **Spa** : la ligne de contrôle et la séparation exacte de l'entrée des stands sont estimées à ±50 m. La longueur de la voie des stands varie selon la définition (653 m au total, environ 400 m à 80 km/h).
6. **Tribune Gold 3** : n'existait pas en 2020. Sa hauteur est estimée.
7. La texture de vibreur générée n'est pas parfaitement raccordée pour le bruit d'usure.

---

## 5. Inventaire des téléchargements (`/workspace/w11-shared/downloads/`)
| Fichier | Taille | Licence |
|---|---|---|
| `asphalte/polyhaven_asphalt_pit_lane/asphalt_pit_lane_arm_2k.jpg` | 2.70 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_pit_lane/asphalt_pit_lane_diff_2k.jpg` | 4.19 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_pit_lane/asphalt_pit_lane_nor_gl_2k.jpg` | 4.35 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_track/asphalt_track_arm_2k.jpg` | 2.47 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_track/asphalt_track_diff_2k.jpg` | 3.78 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_track/asphalt_track_disp_2k.jpg` | 0.93 Mo | CC0 (Poly Haven) |
| `asphalte/polyhaven_asphalt_track/asphalt_track_nor_gl_2k.jpg` | 3.69 Mo | CC0 (Poly Haven) |
| `beton_murs/ambientcg_Concrete034_2K-JPG/Concrete034_2K-JPG_Color.jpg` | 1.16 Mo | CC0 (ambientCG) |
| `beton_murs/ambientcg_Concrete034_2K-JPG/Concrete034_2K-JPG_Displacement.jpg` | 0.57 Mo | CC0 (ambientCG) |
| `beton_murs/ambientcg_Concrete034_2K-JPG/Concrete034_2K-JPG_NormalGL.jpg` | 3.33 Mo | CC0 (ambientCG) |
| `beton_murs/ambientcg_Concrete034_2K-JPG/Concrete034_2K-JPG_Roughness.jpg` | 0.88 Mo | CC0 (ambientCG) |
| `gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_AmbientOcclusion.jpg` | 3.11 Mo | CC0 (ambientCG) |
| `gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_Color.jpg` | 4.28 Mo | CC0 (ambientCG) |
| `gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_Displacement.jpg` | 2.14 Mo | CC0 (ambientCG) |
| `gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_NormalGL.jpg` | 9.21 Mo | CC0 (ambientCG) |
| `gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_Roughness.jpg` | 1.85 Mo | CC0 (ambientCG) |
| `hdri/polyhaven_hausdorf_meadow/hausdorf_meadow_2k.hdr` | 6.59 Mo | CC0 (Poly Haven) |
| `hdri/polyhaven_stuttgart_hillside/stuttgart_hillside_1k.hdr` | 1.70 Mo | CC0 (Poly Haven) |
| `hdri/polyhaven_stuttgart_hillside/stuttgart_hillside_2k.hdr` | 6.82 Mo | CC0 (Poly Haven) |
| `hdri/polyhaven_stuttgart_hillside/stuttgart_hillside_4k.hdr` | 27.39 Mo | CC0 (Poly Haven) |
| `herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_AmbientOcclusion.jpg` | 3.64 Mo | CC0 (ambientCG) |
| `herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_Color.jpg` | 6.95 Mo | CC0 (ambientCG) |
| `herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_Displacement.jpg` | 3.46 Mo | CC0 (ambientCG) |
| `herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_NormalGL.jpg` | 9.98 Mo | CC0 (ambientCG) |
| `herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_Roughness.jpg` | 3.29 Mo | CC0 (ambientCG) |
| `herbe/polyhaven_grass_medium_01/grass_medium_01.bin` | 1.01 Mo | CC0 (Poly Haven) |
| `herbe/polyhaven_grass_medium_01/grass_medium_01_2k.gltf` | 27 Ko | CC0 (Poly Haven) |
| `herbe/polyhaven_grass_medium_01/textures/grass_medium_01_alpha_2k.jpg` | 1.28 Mo | CC0 (Poly Haven) |
| `herbe/polyhaven_grass_medium_01/textures/grass_medium_01_arm_2k.jpg` | 2.26 Mo | CC0 (Poly Haven) |
| `herbe/polyhaven_grass_medium_01/textures/grass_medium_01_diff_2k.jpg` | 1.17 Mo | CC0 (Poly Haven) |
| `herbe/polyhaven_grass_medium_01/textures/grass_medium_01_nor_gl_2k.jpg` | 3.53 Mo | CC0 (Poly Haven) |
| `mobile_tevy/materials/gravel-trap/color-1k.ktx2` | 0.26 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/color-2k.ktx2` | 0.89 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/meta.json` | 5 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/normal-1k.ktx2` | 0.83 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/normal-2k.ktx2` | 2.93 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/orm-1k.ktx2` | 0.49 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/gravel-trap/orm-2k.ktx2` | 1.95 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/color-1k.ktx2` | 0.23 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/color-2k.ktx2` | 0.82 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/meta.json` | 5 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/normal-1k.ktx2` | 0.64 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/normal-2k.ktx2` | 3.15 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/orm-1k.ktx2` | 0.43 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/race-asphalt/orm-2k.ktx2` | 1.52 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/color-1k.ktx2` | 0.24 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/color-2k.ktx2` | 0.89 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/meta.json` | 5 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/normal-1k.ktx2` | 0.78 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/normal-2k.ktx2` | 2.88 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/orm-1k.ktx2` | 0.48 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/track-grass/orm-2k.ktx2` | 1.75 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/color-1k.ktx2` | 0.21 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/color-2k.ktx2` | 0.77 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/meta.json` | 5 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/normal-1k.ktx2` | 0.75 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/normal-2k.ktx2` | 3.18 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/orm-1k.ktx2` | 0.47 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/materials/worn-concrete/orm-2k.ktx2` | 1.59 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/catch-fence/lod0.glb` | 0.39 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/catch-fence/lod1.glb` | 0.16 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/catch-fence/lod2.glb` | 73 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/catch-fence/meta.json` | 2 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/concrete-wall/lod0.glb` | 0.49 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/concrete-wall/lod1.glb` | 0.17 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/concrete-wall/lod2.glb` | 74 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/concrete-wall/meta.json` | 3 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand-crowd/lod0.glb` | 0.16 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand-crowd/lod1.glb` | 0.13 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand-crowd/lod2.glb` | 81 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand-crowd/meta.json` | 3 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand/lod0.glb` | 0.51 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand/lod1.glb` | 0.22 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand/lod2.glb` | 40 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/grandstand/meta.json` | 2 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/track-kerb/lod0.glb` | 0.43 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/track-kerb/lod1.glb` | 0.15 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/track-kerb/lod2.glb` | 43 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/track-kerb/meta.json` | 2 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/tyre-barrier/lod0.glb` | 0.50 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/tyre-barrier/lod1.glb` | 0.16 Mo | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/tyre-barrier/lod2.glb` | 62 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/models/tyre-barrier/meta.json` | 2 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/skies/overcast/1k.jpg` | 30 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/skies/overcast/2k.jpg` | 84 Ko | CC0 (tevy.dev, déclarée) |
| `mobile_tevy/skies/overcast/meta.json` | 2 Ko | CC0 (tevy.dev, déclarée) |
| `sons/foule/oga_crowd_shouting.ogg` | 0.34 Mo | CC0 (OpenGameArt) |
| `sons/gravier_herbe/oga_Fantozzi-footsteps.7z` | 0.48 Mo | CC0 (OpenGameArt) |
| `sons/gravier_herbe/oga_kdd_DifferentSteps/ (8 fichiers .ogg)` | 91 Ko | CC0 (OpenGameArt) |
| `sons/impacts/oga_qubodupImpact.7z` | 0.13 Mo | CC0 (OpenGameArt) |
| `sons/impacts/oga_sfx_breaking_and_falling/ (75 fichiers .ogg)` | 1.79 Mo | CC0 (OpenGameArt) |
| `sons/vent/oga_park_ambience_wind.wav` | 73.96 Mo | CC0 (OpenGameArt) |
| `sons/vent/oga_park_ambience_wind_60s_mobile.m4a` | 0.97 Mo | CC0 (OpenGameArt) |
| `sons/vent/oga_park_ambience_wind_60s_mobile.ogg` | 0.84 Mo | CC0 (OpenGameArt) |
| `sons/vent/oga_wind_background_noise_2.wav` | 15.71 Mo | CC0 (OpenGameArt) |
| `sons/vent/oga_wind_background_noise_2_mobile.m4a` | 0.72 Mo | CC0 (OpenGameArt) |
| `terre/polyhaven_dirt/dirt_arm_2k.jpg` | 2.56 Mo | CC0 (Poly Haven) |
| `terre/polyhaven_dirt/dirt_diff_2k.jpg` | 3.05 Mo | CC0 (Poly Haven) |
| `terre/polyhaven_dirt/dirt_disp_2k.jpg` | 1.27 Mo | CC0 (Poly Haven) |
| `terre/polyhaven_dirt/dirt_nor_gl_2k.jpg` | 4.91 Mo | CC0 (Poly Haven) |
| `vibreurs/genere_cc0/kerb_normal_gl_1024x256_mobile.png` | 0.32 Mo | généré (CC0) |
| `vibreurs/genere_cc0/kerb_normal_gl_2048x512.png` | 1.03 Mo | généré (CC0) |
| `vibreurs/genere_cc0/kerb_redwhite_albedo_1024x256_mobile.jpg` | 29 Ko | généré (CC0) |
| `vibreurs/genere_cc0/kerb_redwhite_albedo_2048x512.jpg` | 86 Ko | généré (CC0) |
| `vibreurs/genere_cc0/kerb_roughness_1024x256_mobile.jpg` | 30 Ko | généré (CC0) |
| `vibreurs/genere_cc0/kerb_roughness_2048x512.jpg` | 86 Ko | généré (CC0) |

**Total : 268 Mo** (bien en dessous du budget de 1,5 Go). Les deux `.wav` de vent (≈ 90 Mo) sont les sources ; utiliser les `.m4a` sur mobile.
