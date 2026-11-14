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

## Retour arrière / comparaison
- ?hybrid=0 : toutes les IA en 1D (aucune physique, aucun accident), pour comparer.
- Annuler la fusion de la demande de fusion de claude/ia-pilotes dans main.

## Non vérifié (ni iPhone, ni simulation complète)
- Seul le contrôle de types (CI) a été passé. Constantes à régler au jeu si besoin : PHYS_K (sim.ts), gouverneur (seuils 1,3 / 1,2 / 1,8 dans driver.ts), seuils d'incident (1,9 rad, 4 s), distances de céder le passage.
