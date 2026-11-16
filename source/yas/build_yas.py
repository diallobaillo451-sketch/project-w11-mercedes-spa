#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conversion du GLB « Yas Marina Circuit Abu Dhabi 2021 layout » en circuit du jeu (CI : job yas_build, sans Blender).
Usage : python3 build_yas.py <circuit.glb> <dossier_sortie>
Sortie : <dossier>/track_yas/ (surface.json, surface.bin, grassmask.bin) et <dossier>/assets/yas/ (tiles.json, base + t00…t11, tex/*.webp),
         <dossier>/report/ (centerline.png, report.json : contrôle, jamais publié)."""
import json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_physics import build_physics
from prep_glb import prepare_scene
from yas_tables import LAP_M

TILES_K = 12          # 12 tuiles + la tuile « base » = 13, comme Spa / Monza / Silverstone


def log(*a):
    print(*a, flush=True)


def main(glb, out):
    t0 = time.time()
    track = os.path.join(out, 'track_yas'); scene = os.path.join(out, 'assets', 'yas'); work = os.path.join(out, '_work'); rep = os.path.join(out, 'report')
    shutil.rmtree(out, ignore_errors=True); os.makedirs(work); os.makedirs(rep)

    # 1. physique : ligne centrale à l'échelle réelle, grille de surface, herbe 3D
    r = build_physics(glb, track, log=log, debug_png=os.path.join(rep, 'centerline.png'))
    assert r['N'] == int(LAP_M) and abs(r['L'] - LAP_M) < 0.5, 'longueur de la ligne centrale hors tolérance : %.2f m' % r['L']
    typ = r['typ']; frac = [float((typ == k).mean()) for k in range(8)]
    assert 0.15 < frac[1] < 0.40, 'part asphalte invraisemblable : %.2f' % frac[1]
    assert frac[7] < 0.85 and frac[4] + frac[5] > 0.02, 'murs / herbe-gravier invraisemblables : %s' % frac
    assert os.path.getsize(os.path.join(track, 'surface.bin')) == r['N'] * 361 * 2, 'taille de surface.bin incohérente'

    # 2. scène : préparation du glTF (extras, calibrage, racine) puis tuiles (meshopt + WebP)
    ox, oy, oz = r['origin']
    prep = os.path.join(work, 'prep.glb')
    prepare_scene(glb, prep, r['affine'].matrix(-ox, -oy, -oz), log)
    subprocess.run(['node', os.path.join(HERE, 'tiles.mjs'), prep, scene, str(TILES_K), '88', '95', '1024', '512', '256'], check=True, cwd=HERE)

    # 3. contrôles
    tj = json.load(open(os.path.join(scene, 'tiles.json')))
    tiles = tj['tiles']; tris = sum(t['tris'] for t in tiles)
    total = sum(os.path.getsize(os.path.join(d, f)) for base in (scene, track) for d, _, fs in os.walk(base) for f in fs)
    assert len(tiles) == TILES_K + 1 and tiles[0]['id'] == 'base', 'nombre de tuiles inattendu : %d' % len(tiles)
    assert 900000 < tris < 940000, 'triangles perdus ou en trop : %d' % tris
    assert total < 60e6, 'paquet trop lourd : %.1f Mo' % (total / 1e6)
    summary = dict(lap_m=r['L'], N=r['N'], scale_model=1 / r['info']['f'], tiles=len(tiles), triangles=tris, textures=len(tj['texSizes']),
                   tex_mb=sum(tj['texSizes'].values()) / 1e6, package_mb=total / 1e6, type_fractions=frac, seconds=time.time() - t0)
    json.dump(summary, open(os.path.join(rep, 'report.json'), 'w'), indent=1)
    shutil.rmtree(work)
    log('YAS MARINA : %d tuiles, %d triangles, %.1f Mo, tour de %.1f m, échelle du modèle %.4f (%.0fs)' % (len(tiles), tris, total / 1e6, r['L'], summary['scale_model'], time.time() - t0))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage : build_yas.py <circuit.glb> <dossier_sortie>')
    main(sys.argv[1], sys.argv[2])
