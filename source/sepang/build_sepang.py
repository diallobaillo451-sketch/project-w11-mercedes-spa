#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conversion du GLB « Sepang International Circuit 2025 layout » en circuit du jeu.

Usage : python3 build_sepang.py <circuit.glb> <dossier_sortie>
Sortie : <sortie>/track_sepang/{surface.json,surface.bin,grassmask.bin,crowd.bin,barriers.bin}  et  <sortie>/assets/sepang/{tiles.json,base.gltf,base.bin,CREDITS.txt}
Les noms de matériaux du modèle ne sont jamais modifiés (voir sepang_tables.py).
"""
import os, sys, json, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_physics import build_physics, ND
from build_scene import build_scene
from build_extras import build_crowd, build_barriers

CREDITS = """Sepang International Circuit — modèle 3D « Sepang International Circuit 2025 layout »
Auteur : Dave Love (Sketchfab) — licence Creative Commons Attribution 4.0 (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Modifications : recentrage sur la ligne de départ, retrait du matériau de collision invisible, réduction des textures,
calcul de la surface physique (surface.bin) et du masque d'herbe. Les noms de matériaux d'origine sont conservés.
Les logos de sponsors présents dans les textures appartiennent à leurs propriétaires respectifs.
"""


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    glb, out = sys.argv[1], sys.argv[2]
    t0 = time.time()
    track = os.path.join(out, 'track_sepang'); scene = os.path.join(out, 'assets', 'sepang')
    r = build_physics(glb, track)
    m = build_scene(glb, scene, r['origin'])
    ncrowd = build_crowd(r['tm'], r['Cglb'], r['origin'], track)
    nbar = build_barriers(r['tm'], r, r['mi'], r['origin'], track)
    with open(os.path.join(scene, 'CREDITS.txt'), 'w', encoding='utf-8') as f:
        f.write(CREDITS)
    # contrôles : un circuit incohérent ne doit jamais être publié
    sj = json.load(open(os.path.join(track, 'surface.json')))
    n = sj['N']
    assert 5300 < n < 5800, 'longueur de piste incohérente : N=%d' % n
    assert 5400 < sj['length'] < 5700, 'longueur %.1f m (officielle : 5 543 m)' % sj['length']
    assert os.path.getsize(os.path.join(track, 'surface.bin')) == n * ND * 2, 'surface.bin : taille inattendue'
    assert all(len(sj[k]) == n for k in ('cx', 'cy', 'cz', 'wl', 'wr', 'wallL', 'wallR')), 'tableaux de longueurs différentes'
    assert m['tiles'][0]['tris'] > 300000, 'scène trop légère : %d triangles' % m['tiles'][0]['tris']
    assert ncrowd > 1000, 'public vide : %d personnes' % ncrowd
    assert nbar > 2000, 'barrières trop rares : %d segments' % nbar
    print('SEPANG OK en %.0f s : N=%d, %.1f m, %d triangles' % (time.time() - t0, n, sj['length'], m['tiles'][0]['tris']))


if __name__ == '__main__':
    main()
