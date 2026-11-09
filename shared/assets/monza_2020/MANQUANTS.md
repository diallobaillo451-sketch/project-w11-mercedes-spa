# Monza 2020 — petits éléments manquants (à modéliser / récupérer plus tard)

Constaté en convertissant le modèle Sketchfab (aucun n'a été construit pour l'instant, consigne : lister d'abord).

1. **Panneaux lumineux FIA de commissaires** (jaune / bleu / rouge / vert) : **absents** du modèle. Monza en compte une
   vingtaine (positions officielles sur la carte des « track light panels » des Event Notes FIA 2020). À créer ou récupérer
   d'un autre circuit (Spa ?), en nœuds `marshal_<n>_yellow/_blue/_red/_green`, puis remplir `marshals.json` → `posts`.
2. **Postes de commissaires** (cabines numérotées, abris) et **commissaires** (tenue orange, drapeaux) : absents.
3. **Feux de départ** (portique 5 × 2 feux rouges au-dessus de la grille) : non trouvés ; seul un feu vertical 3 lampes
   existe (`signal_1_*`, s ≈ 36 m, 5 m de haut).
4. **Panneaux de distance de freinage** (150/100/50 m) : seul un « 100 » est présent dans l'atlas `misc1` ; vérifier à
   chaque freinage (T1, T4, Ascari, Parabolica).
5. **Bollard d'entrée des stands** et **lignes pointillées de sortie** (Event Notes 19.1–19.4) : à vérifier / ajouter.
6. **Blocs en polystyrène** de l'échappatoire T1-T2 et **bosses jaunes et noires** avant le vibreur T5 (Event Notes 20.1–20.2) : absents.
7. **Marques de grille** : emplacements visibles en texture mais positions exactes non extraites (grille estimée dans meta.json).
8. **Panneaux de numéro de virage** et **panneaux DRS** (détection/activation) : non trouvés.
9. **Podium** au-dessus de la voie des stands (célèbre à Monza) : à vérifier visuellement.
