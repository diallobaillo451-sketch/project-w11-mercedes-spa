# IA des pilotes : pilotage physique, qualif / essais, règles, stratégie

Mise à jour du 2026-11-14 (branche claude/ia-pilotes). Code : race/driver.ts (nouveau), race/hybrid.ts, race/sim.ts, race/control.ts, core/game.ts, race/data.ts, physics/vehicle.ts (placeAt : paramètre yaw).

## Ce qui n'allait pas (lecture du code)
- Les 4 IA autour du joueur (celles qu'on voit) tournent en physique complète (hybrid.ts) avec un pilote trop simple : pas d'amortissement du lacet, pas de contre-braquage, freinage proportionnel en retard, regard fixe. La consigne latérale sautait de plusieurs mètres (attaque, défense, céder le passage) sans lissage : coup de volant violent à 80 m/s, tête-à-queue.
- Elles perdaient le déploiement ERS après le 1er tour (compteur par tour jamais remis à zéro, environ 10 % de puissance en moins) ; gomme, température et dégâts étaient ceux du dernier occupant du slot ; aucune détection d'accident : une voiture plantée restait en course, sans drapeau ni incident.
- startField ne transmettait pas le circuit à la simulation IA : à Monza et à Barcelone les profils d'adhérence étaient calés sur la pole de Spa (1:41,252) et les secteurs étaient ceux de Spa.
- playerOnHot n'était jamais mis à vrai : en essais / qualif les IA ne cédaient jamais le passage au joueur.

## Ce qui change
### Voitures physiques (driver.ts, hybrid.ts)
- Pilote basé sur l'autopilote de calibrage (tour de référence validé) : poursuite de trajectoire à regard adaptatif, amortissement du lacet, contre-braquage, pas de braquage au-delà du pic de dérive, modulation du freinage et de l'accélérateur.
- Écart latéral voulu par la direction de course lissé en vitesse latérale (1 + 0,03 v m/s).
- Vitesse visée 0,25 s plus loin (freinage anticipé) et plafonnée par un profil physique par équipe (sim.ts, PHYS_K = 1,05 : l'autopilote W11 tient 1,06 × le profil mu = 1).
- Gouverneur d'adhérence : sous-virage, survirage ou sortie de piste font lâcher le pied (jusqu'à -20 %), retour lent.
- À la promotion : gomme et température du modèle 1D, cap de la ligne de course (placeAt avec yaw), pièces neuves puis dégâts, batterie pleine ; ERS remis à zéro à chaque tour ; aspiration ; aide au lacet 0,5.
- Tête-à-queue (cap > 109 degrés à moins de 45 m/s), voiture immobilisée (4 s alors qu'elle doit rouler), épave (roue arrachée, suspension, fond, retournement) : retour au 1D via RaceSim.physIncident. Tête-à-queue ou immobilisée = voiture 'spun' (jaune, repart quand la voie est libre) ; épave = abandon + incident 'crash' (double jaune, SC / VSC / rouge selon les tirages de control.ts).
- Plus de crash / tête-à-queue / sortie large tirés au sort pour une voiture physique (ses accidents viennent de la physique).
- Distance de suivi plus grande pour les voitures physiques (3,5 m + 0,14 v) ; lâcher le pied lors d'une cession de passage.

### Qualif / essais (sim.ts)
- Le joueur est en tour lancé quand il roule à plus de 74 % du rythme de la trajectoire (hors voie des stands) : les IA hors tour lancé lui cèdent le passage, comme aux IA en tour lancé.
- La voiture en tour lancé est repérée jusqu'à 420 m derrière (avant : 120 m, et seulement la plus proche) ; distance de céder le passage = 6 s de vitesse de rapprochement.
- À la sortie des stands, on attend qu'une voiture en tour lancé (ou le joueur) soit passée (7 s d'avance, 20 s d'attente maximum).
- Tour de sortie / de refroidissement : écart propre d'environ 3 s à la voiture qui précède (tour de sortie, tour lancé, refroidissement), pas de train.
- Enquête pour gêne : probabilité divisée par 4 (0,03 → 0,008).

### Règles (control.ts)
- Drapeau jaune : -12 % de vitesse, double jaune : -30 % (avant -4 % et -14 %). SC / VSC : arrêt bon marché quand le calcul de stratégie le préfère.

### Stratégie (sim.ts, stratDecide)
- Chaque tour, chaque IA compare : arrêt à la fin de ce tour, arrêt plus tard, ou pas d'arrêt (si la règle des 2 gommes est remplie), avec la même loi d'usure que paceK et le temps perdu à un arrêt calculé sur la voie des stands (pitLoss). Choisit aussi la gomme.
- Prime de risque : 0,5 s par tour au-delà de 85 % de la falaise de la gomme (on ne planifie pas un relais au bord de la falaise). Vérifié hors jeu sur 44 / 30 / 20 / 10 tours : départ M → arrêt vers T19-22 en H ; départ S → T14-15 en H ; départ H → arrêt tardif en S / M ; sous SC, M de 10 tours et plus rentre en H.
- Sous SC : 45 % du temps perdu ; sous VSC : 62 %. Une équipe n'empile pas ses deux voitures. Un biais par voiture (plus ou moins 1 à 3 tours) étale les arrêts.
- Les déclencheurs existants restent (pluie, piste sèche, dégâts, pénalités, undercut, gomme obligatoire, usure extrême).

### Circuits
- startField transmet circuit (spa : bel, monza : ita, barcelona : esp) et portes de secteurs ; pole 2020 de Barcelone ajoutée (1:15,584).
- Une voiture hors de la bande utilisable revient à vitesse latérale limitée au lieu d'être téléportée.

## Rythme : IA très rapides (2e lot, 2026-11-14)
Retour du joueur : les IA conduisent bien mais restent trop lentes (il les double à fond d'accélérateur) ; il veut le même rythme en qualif et en course.
- Cause : les cibles de vitesse étaient les temps réels 2020 (Spa : 1:41,252 à 1:43,8), moins une pénalité de course (+2 s mode moteur / gestion de pneus, + 0,035 s/kg d'essence) ; les voitures physiques étaient en plus plafonnées à ce que l'autopilote W11 tient (1,06 × profil μ = 1, tour 1:41,75), en mode moteur course et avec l'essence de course.
- Bonus d'adhérence des IA physiques (AI_GRIP = 1,08, tuning.ts) : μ0 des pneus × 1,08 pendant leur pas physique (rendu juste après). À utilisation d'adhérence égale à celle de l'autopilote validé, la vitesse en courbe monte de √1,08 = +3,9 % (environ −2,3 s au tour à Spa). Le plafond physique de tout le plateau (1D comme physique) devient 1,06 × √1,08 = 1,10 (Barcelone : 1,10 × √0,9 × √1,08).
- Temps cibles : écarts réels entre équipes / pilotes gardés à 50 % (AI_SPREAD) et plateau 2,5 % plus vite (AI_BOOST_T) ; même transformation pour les cibles d'équipe et de pilote (kq reste cohérent).
- Course = qualif : plus de pénalité de +2 s ; essence 0,008 s/kg (au lieu de 0,035) ; voitures physiques en pleine puissance (mode moteur qualif) et avec l'essence du profil de vitesse en course aussi.
- Freinage : le regard sur la vitesse visée s'allonge avec le plafond (0,22 s + 6 × (K − 1,06)).
- Réglage en direct dans l'URL : ?aigrip=1.05 (adhérence IA), ?aik=1.09 (plafond), ?aispread=0.3, ?aiboost=1.03.

## Direction de course : drapeaux, SC, rouge, arrêts (3e lot, 2026-11-15)
Retour du joueur : les IA doivent respecter les drapeaux jaunes et rouges, les retardataires doivent se dédoubler sous SC puis la course est relancée, et tout le monde doit rentrer aux stands de façon plus intelligente.
- Bug corrigé (control.ts, speedCap) : une voiture qui avait décidé de rentrer (wantPit) n'était plus limitée du tout sous SC et roulait à plein rythme jusqu'à l'entrée des stands. Toutes les voitures respectent maintenant le plafond SC.
- Sous SC la file se resserre : plafond 0,8 du rythme tant que la voiture de devant est à plus de 60 m (0,66 près d'elle ou de la SC), loi d'approche vers 28 m ; le leader rattrape la SC plus vite.
- Dédoublement : démarre plus tôt (110 s avant la fin prévue au lieu de 70 s) et les retardataires roulent à 0,85 du rythme (avant 0,8) ; la SC ne rentre qu'une fois la file reformée. Reprise : tant que le leader n'a pas franchi la ligne, tout le monde reste groupé derrière lui (0,8 du rythme sur les 2,5 km avant la ligne).
- Jaune : DRS interdit dans la zone jaune ; double jaune avec voiture arrêtée / accidentée sur la piste : 108 km/h maximum entre 150 m avant et 25 m après elle ; en qualif / essais, double jaune dans le secteur = tour lancé abandonné (refroidissement, relance au tour suivant).
- Arrêts sous SC / VSC : l'arrêt doit rapporter plus qu'un seuil (4 s sous SC, 6 s sous VSC) plus la valeur de la place en piste (8 s pour le leader, décroissante : les voitures de tête restent dehors sauf pneus très usés), plus un biais propre à chaque voiture ; au plus 6 voitures à la fois dans la voie des stands. L'ancienne règle VSC (toute voiture à plus de 72 % de la falaise rentre) est supprimée.
- Drapeau rouge : tout le monde rentre et change de pneus (service normal au box) ; la gomme est maintenant choisie par le calcul de relais (la moins chère sur la distance restante, règle des 2 gommes comprise) au lieu de H / M selon le nombre de tours.

## Retour arrière / comparaison
- ?hybrid=0 : toutes les IA en 1D (aucune physique, aucun accident), pour comparer.
- Annuler la fusion de la demande de fusion de claude/ia-pilotes dans main.

## Non vérifié (ni iPhone, ni simulation complète)
- Seul le contrôle de types (CI) a été passé. Constantes à régler au jeu si besoin : PHYS_K (sim.ts), gouverneur (seuils 1,3 / 1,2 / 1,8 dans driver.ts), seuils d'incident (1,9 rad, 4 s), distances de céder le passage.
