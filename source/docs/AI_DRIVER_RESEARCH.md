# Repères FIA et techniques pour l’IA de conduite

Le jeu simule des voitures et un plateau de la saison 2020. Les règles sportives de 2020 restent donc la référence pour les pneus, les qualifications et les procédures de course. Les directives de conduite FIA publiées plus récemment servent à guider le comportement prudent des pilotes simulés, mais ne remplacent pas le règlement de la saison représentée.

## Conduite, dépassements et sécurité

Les *Driving Standards Guidelines* FIA 2026 sont explicitement des lignes directrices destinées aux commissaires, et non un règlement autonome. Elles donnent néanmoins de bons repères de conduite : une défense ne doit pas zigzaguer, le défenseur ne doit pas changer de direction sous freinage, et une réintégration après une sortie doit rester sûre. Pour juger un dépassement, la position aux points de corde, la maîtrise de la voiture et la possibilité de terminer le virage dans les limites comptent; le statut intérieur/extérieur ne donne pas à lui seul une priorité automatique. Les lignes blanches délimitent la piste, contrairement aux vibreurs.[2]

La FIA demande de ralentir sous simple jaune et d’être prêt à changer de direction. Sous double jaune, le pilote doit réduire significativement sa vitesse et être prêt à changer de direction ou à s’arrêter. Le dépassement est interdit jusqu’au signal vert suivant l’incident. Sous VSC, le temps minimal imposé par le système FIA doit être respecté secteur par secteur; la fin annoncée du VSC n’autorise pas une reprise avant les panneaux verts. La Safety Car et le drapeau rouge ont leurs procédures distinctes; ce ne sont pas de simples multiplicateurs de vitesse.[3]

Aucun chiffre unique FIA n’impose la vitesse exacte à tenir sous chaque jaune, ni la distance de sécurité à adopter dans une simulation. Les coefficients d’adhérence, marges de freinage et distances de séparation doivent donc être documentés comme paramètres du jeu, pas présentés comme des exigences FIA.[2][3]

## Essais, qualifications et stratégie 2020

En 2020, une voiture qualifiée en Q3 devait partir avec le jeu de pneus utilisé pour son meilleur temps en Q2 si Q2 et le départ étaient sur piste sèche. En course sèche, deux spécifications de pneus secs distinctes étaient requises, dont une spécification obligatoire; l’obligation cessait si le pilote avait utilisé des intermédiaires ou des pneus pluie. La limite habituelle de la voie des stands était de 80 km/h. Les règles 2026 et leurs gammes de pneus ne doivent pas être appliquées rétroactivement au modèle 2020.[1]

Le règlement interdit la conduite inutilement lente, erratique ou dangereuse, et l’impeding peut être sanctionné. Les sources FIA ne fixent pas une distance universelle entre les voitures pour les sorties en piste : une IA peut espacer ses relais pour éviter le trafic, mais doit suivre les consignes propres à chaque épreuve.[2][3] Les estimations de fenêtres d’arrêt et de dégradation sont propres au circuit et à la météo; les prévisions Pirelli pour un Grand Prix constituent des exemples de stratégie, pas des règles générales.[5]

## Conséquences pour le contrôleur

Les travaux sur les voitures de course autonomes séparent la planification de vitesse/trajectoire du suivi de trajectoire. La courbure de la piste et l’adhérence disponible bornent la vitesse; une passe de freinage en remontant la piste évite de ne ralentir qu’une fois dans le virage. Un suivi avec point de visée plus éloigné à haute vitesse est une solution légère pour un jeu navigateur. Les contrôleurs plus élaborés comme le MPC apportent des contraintes prédictives, mais leur coût n’est pas nécessaire pour toutes les voitures d’un jeu mobile.[6][7]

Pour la sécurité, le contrôleur doit d’abord éviter une collision ou une sortie de piste, puis chercher la performance. Il doit examiner les couloirs des voitures voisines sur une courte fenêtre future; si aucun passage sûr n’existe, il reste derrière ou lève le pied. Les tests doivent mesurer les contacts, sorties de piste, écarts latéraux et respect des drapeaux sur plusieurs scénarios reproductibles. Ces choix sont une traduction prudente des sources, pas une certification de conformité FIA.

## Sources

[1]: https://www.fia.com/sites/default/files/2020_formula_1_sporting_regulations_-_iss_8_-_2020-05-27_0.pdf "FIA 2020 Formula One Sporting Regulations, Issue 8"
[2]: https://www.fia.com/sites/default/files/2026_f1_driving_standards_guidelines.pdf "FIA 2026 Formula 1 Driving Standards Guidelines"
[3]: https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf "FIA 2026 Formula One Sporting Regulations, Section B, Issue 09"
[4]: https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf "FIA 2026 Formula 1 Penalty Guidelines"
[5]: https://press.pirelli.com/2020-italian-grand-prix--preview/ "Pirelli 2020 Italian Grand Prix Preview"
[6]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11174940/ "Time-Optimal Trajectory Planning and Tracking for Autonomous Racing Vehicles, Sensors (2024)"
[7]: https://stacks.stanford.edu/file/druid:gp933pt4922/dissertation-augmented.pdf "Design and Control of an Autonomous Racecar, Stanford University"
