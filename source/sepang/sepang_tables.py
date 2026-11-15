# -*- coding: utf-8 -*-
"""Tables de classification du modèle Sepang (indices glTF des matériaux « Sepang691Mtl[_N] »).

AUCUN matériau n'est renommé : les noms d'origine restent dans le glTF, la classe est ajoutée en `extras`.
Types de surface physiques du jeu (3 bits dans surface.bin) :
  0 vide · 1 asphalte · 2 vibreur · 3 tapis (zone de dégagement peinte) · 4 herbe · 5 gravier/sable · 6 eau · 7 mur
"""

# indice de matériau → type physique (surfaces horizontales sur lesquelles on peut rouler)
GROUND = {
    23: 1, 72: 1, 73: 1, 84: 1, 99: 1, 1: 1, 75: 1,      # asphalte / béton (piste, voie des stands, routes)
    87: 1, 88: 1,                                         # surcouches de gomme (≈ 2 cm au-dessus de l'asphalte) : surface réellement visible
    7: 3, 81: 3, 79: 3, 93: 3,                            # zones de dégagement peintes (rouge/blanc/bleu…)
    92: 2, 90: 2,                                         # vibreurs
    5: 4, 86: 4, 96: 4, 97: 4, 77: 4, 80: 4,              # herbe
    4: 5,                                                 # gravier / sable
}
TYPE_NAMES = ['void', 'asphalt', 'kerb', 'carpet', 'grass', 'gravel', 'water', 'wall']

# surcouches transparentes (gomme, ligne de course…) : leur emprise donne la largeur de la piste
OVERLAY = (87, 88)
# damier de la ligne d'arrivée
START = 51
# murs, glissières, grillages (surfaces verticales) ; 3 = géométrie de collision invisible du modèle d'origine
WALL = (3, 40, 41, 42, 49, 54, 55, 56, 59, 18)

# tribunes : matériau des marches de tribune (le public s'assoit dessus, tourné vers la piste)
SEATS = (8,)
# barrières réelles (barriers.bin), du moins au plus prioritaire ; type du jeu : 1 pneus, 2 rail, 3 béton, 4 objet
WALL_PRIORITY = (3, 18, 42, 59, 55, 40)
BARRIER_KIND = {3: 3, 18: 4, 42: 3, 59: 3, 55: 3, 40: 2}

# ── scène ──
DROP = (3,)                                    # matériau invisible (alpha 0) : on ne l'affiche pas
FOLIAGE = (11, 13, 14, 15, 16, 22)             # feuillages / arbres en cartes alpha → alphaMode MASK
# classe visuelle (extras.w11_class) et alias d'exécution (extras.w11_alias) : le jeu les traite comme l'herbe / le gravier de Monza
CLASS = {}
for _m, _t in GROUND.items():
    CLASS[_m] = {1: 'road', 2: 'kerb', 3: 'carpet', 4: 'grass', 5: 'gravel'}[_t]
for _m in FOLIAGE:
    CLASS[_m] = 'trees'
for _m in WALL:
    CLASS.setdefault(_m, 'barrier')
ALIAS = {'grass': 'GRASS', 'gravel': 'sand_new'}
# plafond de taille des textures (px) selon la classe ; le reste est plafonné à 512
TEX_CAP = {'road': 1024, 'kerb': 1024, 'carpet': 1024, 'grass': 1024, 'gravel': 1024}
TEX_CAP_DEFAULT = 512
