# -*- coding: utf-8 -*-
"""Tables de classification du modèle Marina Bay (indices glTF des matériaux « 11001Mtl[_N] » et « Merged_materials »).

AUCUN matériau n'est renommé : les noms d'origine restent dans le glTF, la classe et l'alias d'exécution sont ajoutés en `extras`
(extras.w11_class / extras.w11_alias) ; la physique (surface.bin) vient de ces tables, pas des noms.
Types de surface physiques du jeu (3 bits dans surface.bin) :
  0 vide · 1 asphalte · 2 vibreur · 3 tapis (zone peinte) · 4 herbe · 5 gravier/sable · 6 eau · 7 mur
Les indices ci-dessous sont les INDICES glTF (ordre du tableau « materials »), pas les numéros des noms (11001Mtl_N = indice - 2 en général).
"""

# ── physique ─────────────────────────────────────────────────────────────────────────────────────────────────────
# indice de matériau → type physique (surfaces horizontales sur lesquelles on peut rouler)
GROUND = {
    15: 1,            # 11001Mtl_14 : asphalte de la piste
    94: 1, 93: 1,     # 11001Mtl_92 / _91 : surcouches de gomme (alpha) posées sur l'asphalte : surface réellement visible
    16: 1,            # 11001Mtl_15 : béton / asphalte clair (dégagements, trottoirs de la piste)
    98: 1,            # 11001Mtl_96 : béton gris (bordures de piste)
    99: 1,            # 11001Mtl_97 : dalles bleu-gris (aire des stands)
    17: 3,            # 11001Mtl_16 : peinture orange (lignes de piste, voie des stands)
    95: 2,            # 11001Mtl_93 : bandes noir/blanc (vibreurs, lignes)
    97: 4,            # 11001Mtl_95 : herbe
    96: 5,            # 11001Mtl_94 : terre / gravillon sombre
    92: 7,            # 11001Mtl   : la baie (eau) : jamais roulable
}
TYPE_NAMES = ['void', 'asphalt', 'kerb', 'carpet', 'grass', 'gravel', 'water', 'wall']

# surcouche qui donne la ligne centrale (bande de gomme au milieu de la piste, une seule boucle fermée)
OVERLAY = (94,)
# emprise de la piste (largeur de roulage de part et d'autre de la ligne centrale)
ROAD_MASK = (15, 94, 93, 17)
# ligne de départ/arrivée : point (x, z) du modèle, ramené à la ligne centrale la plus proche (droite des stands, côté nord de la voie des stands)
START_XZ = (-606.0, 262.0)
# sens de course : antihoraire en vue de dessus (nord en haut), comme le vrai circuit
CCW = True

# murs et obstacles verticaux (barrières béton, grillages, panneaux, tribunes) : surfaces verticales d'au moins 0,3 m
WALL = (0, 5, 88, 72, 73, 74, 75, 77, 81, 86, 84, 85, 18, 76, 79, 69, 65, 50)

# ── scène ────────────────────────────────────────────────────────────────────────────────────────────────────────
# fond de ville photographié de jour (cylindre de 4,3 km, m1) : remplacé par les vrais bâtiments + ciel de nuit ;
# m78 : géométrie de collision invisible (texture 4×4 entièrement transparente)
DROP = (1, 78)
# feuillages en cartes alpha → alphaMode MASK (coupure 0,4) + alias de Monza (arbres : normales sphériques, vent, translucidité)
FOLIAGE = {14: 'tree', 7: 'bush'}
# autres matériaux à découpe franche (grillages, tribunes, public, panneaux) : BLEND → MASK (pas de tri de transparence, profondeur correcte)
CUTOUT = (2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13)
# surcouches à alpha progressif (gomme, lignes, vibreurs) et eau : restent BLEND
KEEP_BLEND = (92, 93, 94, 95)

# classe visuelle (extras.w11_class)
CLASS = {}
for _m, _t in GROUND.items():
    CLASS[_m] = {1: 'road', 2: 'kerb', 3: 'paint', 4: 'grass', 5: 'gravel', 7: 'water'}[_t]
CLASS[93] = CLASS[94] = 'overlay'
CLASS.update({m: c for m, c in FOLIAGE.items()})
CLASS.update({0: 'barrier', 48: 'other', 77: 'lamp', 85: 'banner', 9: 'stand', 11: 'stand', 12: 'stand', 13: 'crowd'})
for _m in CUTOUT:
    CLASS.setdefault(_m, 'cutout')
CLASS_DEFAULT = 'building'

# alias d'exécution : le jeu traite ces matériaux comme ceux de Monza (détail de proche, usure, arbres) sans toucher au nom du fichier
ALIAS = {'grass': 'GRASS', 'gravel': 'sand_new', 'tree': 'trees1', 'bush': 'bushesB'}

# matériaux sans texture (blanc par défaut) : gris béton
FLAT_COLOR = {0: [0.55, 0.55, 0.56, 1.0], 48: [0.62, 0.62, 0.62, 1.0]}

# éclairage de nuit : émission = couleur de base × facteur (même texture, aucune image en plus). Les bâtiments gardent leurs fenêtres,
# la piste est « éclairée par les projecteurs », les lampadaires (m77) brillent. Valeurs calées dans un banc d'essai three.js 0.187
# (exposition 0,8, lune 0,5 lux, 6 lumières de lampadaire de 350 cd) : voir source/marina/README.md.
NIGHT_EMISSIVE = {'road': 0.16, 'kerb': 0.18, 'paint': 0.21, 'overlay': 0.0, 'grass': 0.06, 'gravel': 0.05, 'water': 0.0,
                  'tree': 0.06, 'bush': 0.06, 'barrier': 0.09, 'building': 0.12, 'cutout': 0.12, 'stand': 0.18, 'crowd': 0.24,
                  'lamp': 1.0, 'banner': 0.54, 'other': 0.12}

# paramètres PBR corrigés par classe : la surcouche de gomme du modèle (m94) est exportée « métal 1, rugosité 0 » = un miroir sur toute la trajectoire
# (reflets des lampadaires, chaussée noire) ; une gomme réelle est un revêtement mat (le nom du matériau ne change pas)
PBR_FIX = {'overlay': {'metallicFactor': 0.0, 'roughnessFactor': 0.85}}

# plafond de taille des textures (px) : les sources font 256 px au plus (sauf le public 2048×128) → rien n'est réduit
TEX_CAP = 2048

# lampadaires : composantes connexes hautes du matériau m77
LAMP_MAT = 77
