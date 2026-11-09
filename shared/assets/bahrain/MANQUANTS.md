# Bahrain — éléments manquants / à vérifier (pour Opi)

1. **Panneaux lumineux FIA de commissaires** : le modèle n'a que **2 panneaux LED** (portique de départ s≈19, portique de la
   ligne droite opposée s≈2 885), convertis en `marshal_1` / `marshal_2` (`_yellow/_blue/_red/_green`). Bahreïn en compte
   une trentaine en réalité (carte « track light panels » des Event Notes FIA) : à ajouter si besoin (positions dans `marshals.json` → `posts`).
2. **Postes / cabines de commissaires, panneaux de freinage 100-200-300** : non modélisés (`booths`, `brake_boards` vides).
3. **Course de nuit** : aucun mât d'éclairage allumé / aucune source lumineuse dans le modèle. La piste est livrée en
   éclairage de jour (`meta.sky`) ; pour la nuit il faudra des projecteurs (ou lightmap) côté runtime.
4. **Couleurs des lampes** : feux de départ 5×4 (`startlight_c{1-5}_r{1-4}`, rangées rouge, rouge, vert, orange) et
   unité B de sortie des stands (`pitexit_b_*`, rouge/bleu/vert) = **suggestions** (E), modifiables via `extras.w11_on_color`.
5. **Doublon supprimé** : `Material_41.001_3` (copie opaque fond noir de `_62`).
6. **Position T15** : pic de courbure peu marqué (virage rapide avant la ligne droite) → s du T15 incertain (±20 m), ce qui décale l'activation DRS 3 d'autant.
7. **Secteurs** : limites FIA non trouvées → estimées (s 1 150 / 3 400).
8. **Bifurcation tracé extérieur / endurance** (s≈4 940) : largeurs bornées aux murs ; la portion non-GP est visuelle seulement.
9. **Public** : tribunes pleines livrées (38 459 spectateurs sur 53 564 places, occupation 72 % comme Spa) ; optimisation iPhone côté Opi.
