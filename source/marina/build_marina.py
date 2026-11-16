# -*- coding: utf-8 -*-
"""Marina Bay (nuit) : GLB → physique + scène 3D en tuiles + ciel de nuit + lampadaires, dans le dossier de sortie.

    python3 source/marina/build_marina.py <modele.glb> <sortie> [--hdr ciel_nuit.hdr] [--debug dossier]

sortie/track_marina/  surface.json, surface.bin, grassmask.bin, lamps.json
sortie/assets/marina/ tiles.json, base.gltf, t00…tNN (.gltf/.bin), tex/*.webp + ktx2.json, sky/ (sky.json, sky_4k.webp, sky_2k.webp), CREDITS.txt

Les matériaux du modèle ne sont jamais renommés (la physique herbe/gravier passe par les tables de marina_tables.py, pas par les noms).
"""
import argparse, json, os, struct, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from marina_core import Glb
from marina_physics import build_physics
from marina_lamps import find_lamps, write_lamps
from marina_scene import build_scene
from marina_sky import build_sky

CREDITS = """{title} — {author}, licence {license}
  {source}
  La géométrie du modèle est recentrée sur la ligne de départ, découpée en tuiles et regroupée par matériau ; les noms de matériaux sont conservés ;
  les textures sont converties en WebP ; les cartes à découpe passent en alphaMode MASK ; l'éclairage de nuit est une émission ajoutée aux matériaux.
Ciel de nuit — Poly Haven « Moonless Golf » (Greg Zaal), CC0, https://polyhaven.com/a/moonless_golf (copie dans three.js/examples/textures/equirectangular) ;
  l'horizon d'origine est remplacé par un halo de ville et des étoiles procédurales sont ajoutées. Sans ce fichier, le ciel est entièrement procédural.
Physique, tuiles, lampadaires : générés par source/marina/build_marina.py à partir du modèle (aucune donnée officielle FIA ; secteurs et DRS estimés).
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb'); ap.add_argument('out')
    ap.add_argument('--hdr', default=None, help='ciel de nuit HDRI (Radiance .hdr) ; sinon ciel procédural')
    ap.add_argument('--debug', default=None, help='dossier de sortie des tableaux de contrôle (facultatif, absent par défaut)')
    a = ap.parse_args()
    t0 = time.time()
    def log(*s):
        print(*s, flush=True)
    with open(a.glb, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
    if magic != 0x46546C67 or total != os.path.getsize(a.glb):
        raise SystemExit('GLB invalide ou tronqué : en-tête %d octets, fichier %d octets' % (total, os.path.getsize(a.glb)))
    track = os.path.join(a.out, 'track_marina'); scene = os.path.join(a.out, 'assets', 'marina')
    os.makedirs(track, exist_ok=True); os.makedirs(scene, exist_ok=True)
    dbg = a.debug                                   # tableaux de contrôle (grille, murs…) seulement sur demande : pas dans les artefacts de la CI
    if dbg:
        os.makedirs(dbg, exist_ok=True)

    log('== physique ==')
    cache = {}
    phys = build_physics(a.glb, track, dbg, log, analyze=False, tm_cache=cache)
    sj = json.load(open(os.path.join(track, 'surface.json')))
    log('== lampadaires ==')
    O = np.array([sj['origin']['x'], sj['origin']['y'], sj['origin']['z']])
    C_model = np.stack([np.array(sj['cx']) + O[0], np.array(sj['cz']) + O[2]], 1)
    lamps = find_lamps(cache['tm'] if 'tm' in cache else cache, C_model, O)
    write_lamps(lamps, track)
    log('lampadaires : %d têtes de poteaux' % len(lamps))
    log('== scène 3D ==')
    man = build_scene(a.glb, os.path.join(track, 'surface.json'), scene, night=True, log=log)
    log('== ciel de nuit ==')
    build_sky(os.path.join(scene, 'sky'), a.hdr, log)
    ex = Glb(a.glb).js.get('asset', {}).get('extras', {})
    with open(os.path.join(scene, 'CREDITS.txt'), 'w') as f:
        f.write(CREDITS.format(title=ex.get('title', 'Marina Bay Street Circuit'), author=ex.get('author', 'auteur inconnu'),
                               license=ex.get('license', 'CC-BY-4.0'),
                               source=ex.get('source', 'https://sketchfab.com/3d-models/marina-bay-street-circuit-e665d831c57546609d4c15287a6107b7')))

    # ── contrôles : un manque ici doit faire échouer la CI, pas publier un circuit cassé ──
    names = [m.get('name') for m in Glb(a.glb).js['materials']]
    for t in man['tiles']:
        doc = json.load(open(os.path.join(scene, t['file'])))
        assert os.path.getsize(os.path.join(scene, doc['buffers'][0]['uri'])) == doc['buffers'][0]['byteLength'], t['file']
        for m in doc['materials']:
            assert m['name'] == names[m['extras']['mid']], 'matériau renommé : %s' % m['name']      # jamais de renommage
        for im in doc.get('images', []):
            assert os.path.isfile(os.path.join(scene, im['uri'])), 'texture absente : ' + im['uri']
    assert sum(t['tris'] for t in man['tiles']) > 700000, 'trop peu de triangles'
    assert 4500 < sj['length'] < 5600 and sj['N'] > 4500, 'longueur de piste inattendue : %s' % sj['length']
    for fn in ('surface.bin', 'grassmask.bin', 'lamps.json'):
        assert os.path.getsize(os.path.join(track, fn)) > 1000, fn
    for fn in ('sky.json', 'sky_4k.webp', 'sky_2k.webp'):
        assert os.path.getsize(os.path.join(scene, 'sky', fn)) > 100, fn
    assert os.path.getsize(os.path.join(scene, 'tex', 'ktx2.json')) == 2
    log('Marina Bay : terminé en %.1f s — piste %.1f m, %d tuiles, %d lampadaires' % (time.time() - t0, sj['length'], len(man['tiles']), len(lamps)))


if __name__ == '__main__':
    main()
