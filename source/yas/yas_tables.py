# -*- coding: utf-8 -*-
"""Tables de classification de Yas Marina 2021 (GLB Sketchfab « Yas Marina Circuit Abu Dhabi 2021 layout », Dave Love, CC BY 4.0).

RÈGLE D'OR : AUCUN matériau n'est renommé. Les 100 matériaux d'origine s'appellent `Merged_materials`, `tentrail`, `tentrail_0` … `tentrail_97`
(noms sans signification) ; le type de sol vient de ces tables (nom → type) et la classe visuelle / l'alias herbe-gravier-arbre est ajouté
dans les `extras` du glTF (w11_class, w11_alias), appliqué en mémoire par le moteur (renderer.ts, afterRoot) : même traitement de détail
que Spa et Monza sans toucher aux noms.

Comment la table a été établie (voir README.md) : examen des 93 textures, mesure de surface / hauteur / planéité de chaque matériau,
vue de dessus de chaque matériau isolé et coupes en travers de la piste. (M) = mesuré, (E) = estimé."""

LAP_M = 5281.0          # longueur officielle du layout 2021 (FIA, Doc 1 Abu Dhabi 2021 : 5,281 km, 16 virages, 58 tours)

# types de sol, comme surface.ts / Monza
TYPE_NAMES = {'0': 'vide', '1': 'asphalte', '2': 'vibreur', '3': 'tapis/peint', '4': 'herbe', '5': 'gravier/sable', '6': 'eau', '7': 'objet/mur'}

RIBBON = 'tentrail_32'  # surface de course : ruban continu d'asphalte 1024², ≈ 7 m dans le modèle d'origine (M)

GROUND = {
    'tentrail_32': 1,   # surface de course (M)
    'tentrail_29': 1,   # asphalte hors piste : paddock, voie des stands, aires, dégagements (M)
    'tentrail_19': 1,   # grand tablier d'asphalte à l'ouest (E)
    'tentrail_28': 1,   # lignes de bord de piste, à ±3,5 m du centre d'origine (E)
    'tentrail_20': 2,   # vibreurs rouge/blanc/jaune (M)
    'tentrail_21': 2,   # vibreurs (M)
    'tentrail_31': 3,   # dégagements peints bleu-gris le long de la piste (forme M, nature E)
    'tentrail_27': 3,   # aplat bleu-gris foncé zone de l'épingle (E)
    'tentrail_30': 3,   # bande de caniveau / grille ≈ 1 m de chaque côté (E)
    'tentrail_69': 4,   # herbe (M)
    'tentrail_25': 4,   # aplat vert au bord de la piste (E)
    'tentrail_26': 5,   # sable (M)
}
OVERLAY = ('tentrail_32', 'tentrail_28')    # emprise de la surface de course (largeur de piste wl / wr)
DROP = ('tentrail_82',)                      # horizon de désert (32 triangles, texture tronquée dans le fichier) : le ciel est celui du jeu

# classe visuelle des matériaux de sol et d'arbres (extras.w11_class)
CLASS = {
    'tentrail_32': 'road', 'tentrail_29': 'road', 'tentrail_19': 'road', 'tentrail_28': 'road',
    'tentrail_20': 'kerb', 'tentrail_21': 'kerb',
    'tentrail_31': 'carpet', 'tentrail_27': 'carpet', 'tentrail_30': 'carpet',
    'tentrail_69': 'grass', 'tentrail_25': 'grass',
    'tentrail_26': 'gravel',
    'tentrail_70': 'tree',
}
# alias appliqué en mémoire par le moteur : herbe et gravier reçoivent les détails de près de Monza (GRASS / sand_new), le palmier le traitement des arbres
ALIAS = {'grass': 'GRASS', 'gravel': 'sand_new', 'tree': 'trees1_palm'}

# PBR : le fichier d'origine donne à l'asphalte une rugosité de 0,2 (miroir), aux vibreurs 0, à l'herbe un métal de 0,2 → calibrage sol mat
PBR = {'road': (0.88, 0.0), 'kerb': (0.80, 0.0), 'carpet': (0.85, 0.0), 'grass': (0.95, 0.0), 'gravel': (0.95, 0.0)}
SPECULAR_MAX = 0.3
# la texture « bruit gris » (moyenne sRGB 135) est trop claire pour de l'asphalte : on la fonce (la texture 1024² de la piste, moyenne 99, est gardée)
ALBEDO_MUL = {'tentrail_29': 0.55, 'tentrail_19': 0.55, 'tentrail_28': 0.65}
# matériaux sans texture ni couleur dans le fichier (rendraient blanc) : gris neutre
UNTEXTURED = {'Merged_materials': (0.22, 0.23, 0.26), 'tentrail_57': (0.20, 0.21, 0.24), 'tentrail_40': (0.2, 0.2, 0.2)}

# cartes alpha : palmier, clôtures, cartes de public → alphaMode MASK (pas de tri de transparence)
MASKED = ('tentrail_70', 'tentrail_72', 'tentrail_73', 'tentrail_56', 'tentrail_97',
          'tentrail_76', 'tentrail_77', 'tentrail_78', 'tentrail_79', 'tentrail_80', 'tentrail_81')
# superpositions et petits objets : jamais des murs
NOWALL = set(GROUND) | set(MASKED) | set(DROP) | {'tentrail_64', 'tentrail_96', 'tentrail_91'}
