# -*- coding: utf-8 -*-
"""Voie des stands Marina Bay extraite de l'aire de garages du modèle GLB.

Le matériau 11001Mtl_97 (indice glTF 99) est le revêtement réel de l'aire des stands.
On en détecte la bande parallèle à la ligne de départ, on suit son axe, puis on ajoute
un raccord court vers la piste aux deux extrémités. Le corridor physique est ouvert
ensuite par source/tools/circuit_pipeline/open_pit_corridor.mjs.
"""
import json
import math
import os

import cv2
import numpy as np

from marina_core import Glb
import marina_tables as T


def _draw(mask, tris, x0, z0, cell, W, H):
    """Rasterise les triangles XZ dans un masque avec les mêmes conventions que le bake."""
    SH = 4
    for tri in tris:
        if tri[:, 0].max() < x0 or tri[:, 0].min() > x0 + W * cell or tri[:, 2].max() < z0 or tri[:, 2].min() > z0 + H * cell:
            continue
        p = np.stack([(tri[:, 0] - x0) / cell, (tri[:, 2] - z0) / cell], 1)
        cv2.fillConvexPoly(mask, (p * (1 << SH)).astype(np.int32), 255, lineType=cv2.LINE_8, shift=SH)


def _run_through_zero(present):
    """Bornes non roulantes de l'intervalle contigu de dalles qui traverse s=0."""
    n = len(present)
    if not present[0]:
        return None
    start = 0
    for _ in range(n - 1):
        j = (start - 1) % n
        if not present[j]:
            break
        start = j
    end = 0
    for _ in range(n - 1):
        j = (end + 1) % n
        if not present[j]:
            break
        end = j
    end_u = end if end >= start else end + n
    return start, end, end_u


def build_pitlane(glb_path, track_dir, log=print):
    """Écrit track_marina/pitlane.json; échoue si la dalle source n'entoure pas la ligne de départ."""
    meta_path = os.path.join(track_dir, 'surface.json')
    meta = json.load(open(meta_path))
    N, ds = int(meta['N']), float(meta['ds'])
    cx, cz = np.asarray(meta['cx'], float), np.asarray(meta['cz'], float)
    ox, oz = float(meta['origin']['x']), float(meta['origin']['z'])
    if len(cx) != N or len(cz) != N:
        raise SystemExit('Marina pitlane : centreline de surface.json invalide')

    prims = Glb(glb_path).world_primitives()
    pit_parts = [V[F] for mat, V, F, _uv, _id in prims if mat == 99]
    if not pit_parts:
        raise SystemExit('Marina pitlane : matériau 11001Mtl_97 absent du modèle')
    pit_tris = np.concatenate(pit_parts)
    bounds = pit_tris[:, :, [0, 2]].reshape(-1, 2)
    cell, pad = 0.5, 60.0
    x0 = math.floor((bounds[:, 0].min() - pad) / 10) * 10
    z0 = math.floor((bounds[:, 1].min() - pad) / 10) * 10
    x1 = math.ceil((bounds[:, 0].max() + pad) / 10) * 10
    z1 = math.ceil((bounds[:, 1].max() + pad) / 10) * 10
    W, H = int(math.ceil((x1 - x0) / cell)), int(math.ceil((z1 - z0) / cell))
    pit_mask = np.zeros((H, W), np.uint8)
    _draw(pit_mask, pit_tris, x0, z0, cell, W, H)

    road_mask = np.zeros((H, W), np.uint8)
    road_parts = [V[F] for mat, V, F, _uv, _id in prims
                  if mat in T.GROUND and T.GROUND[mat] in (1, 2, 3)]
    if not road_parts:
        raise SystemExit('Marina pitlane : aucun revêtement roulable dans le modèle')
    _draw(road_mask, np.concatenate(road_parts), x0, z0, cell, W, H)

    def inside(mask, x, z):
        ix, iz = int(round((x - x0) / cell)), int(round((z - z0) / cell))
        return 0 <= ix < W and 0 <= iz < H and mask[iz, ix] != 0

    # L'aire des stands est loin de la ligne centrale. On cherche de quel côté se
    # trouve sa bande continue autour du départ, puis son axe médian réel.
    sides = {}
    magnitudes = np.arange(8.0, 44.01, 0.5)
    for sign in (-1, 1):
        present = np.zeros(N, bool)
        offsets = np.full(N, np.nan)
        for i in range(N):
            a, b = (i + 2) % N, (i - 2) % N
            tx, tz = cx[a] - cx[b], cz[a] - cz[b]
            tn = math.hypot(tx, tz)
            if tn < 1e-6:
                continue
            rx, rz = -tz / tn, tx / tn
            vals = []
            for mag in magnitudes:
                d = sign * mag
                if inside(pit_mask, cx[i] + ox + d * rx, cz[i] + oz + d * rz):
                    vals.append(d)
            if vals:
                present[i] = True
                offsets[i] = float(np.median(vals))
        run = _run_through_zero(present)
        if run:
            start, end, end_u = run
            length = end_u - start + 1
            if 100 <= length <= 1000:
                sides[sign] = (length, start, end, end_u, offsets, present)
    if not sides:
        raise SystemExit('Marina pitlane : aucune bande continue de dalle de stands autour de s=0')
    sign = max(sides, key=lambda k: sides[k][0])
    _run_len, start, end, end_u, offsets, present = sides[sign]
    core = [offsets[i % N] for i in range(start + 5, end_u - 4) if present[i % N] and np.isfinite(offsets[i % N])]
    lane_d = float(np.median(core)) if core else float(np.nanmedian(offsets[present]))
    if not math.isfinite(lane_d) or abs(lane_d) < 10.5:
        raise SystemExit('Marina pitlane : axe de la dalle trop proche de la piste')

    # Les 30 premiers/derniers mètres raccordent l'axe de la dalle au centre de course.
    route_start, route_end = start - 30.0, end_u + 30.0
    points = []
    for u in np.arange(route_start, route_end + 0.25, 1.0):
        s = u % N
        if u < start:
            d = lane_d * (u - route_start) / max(1.0, start - route_start)
        elif u <= end_u:
            d = lane_d
        else:
            d = lane_d * (route_end - u) / max(1.0, route_end - end_u)
        f = s / ds
        i0 = int(math.floor(f)) % N
        fr = f - math.floor(f)
        i1 = (i0 + 1) % N
        x = cx[i0] + (cx[i1] - cx[i0]) * fr
        z = cz[i0] + (cz[i1] - cz[i0]) * fr
        a, b = (i0 + 2) % N, (i0 - 2) % N
        tx, tz = cx[a] - cx[b], cz[a] - cz[b]
        tn = math.hypot(tx, tz) or 1.0
        x += d * (-tz / tn)
        z += d * (tx / tn)
        points.append((float(x), float(z), float(s), float(d), float(u)))

    road_hits, pad_hits, pad_total = 0, 0, 0
    for x, z, _s, _d, u in points:
        mx, mz = x + ox, z + oz
        road_hits += int(inside(road_mask, mx, mz))
        if start + 5 <= u <= end_u - 5:
            pad_total += 1
            pad_hits += int(inside(pit_mask, mx, mz))
    road_coverage = road_hits / max(1, len(points))
    pad_coverage = pad_hits / max(1, pad_total)
    if road_coverage < 0.90 or pad_coverage < 0.95:
        raise SystemExit('Marina pitlane : couverture GLB insuffisante (route %.1f%%, dalle %.1f%%)' %
                         (road_coverage * 100, pad_coverage * 100))

    length = [0.0]
    for p, q in zip(points, points[1:]):
        length.append(length[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    data = {
        'x': [round(p[0], 3) for p in points],
        'z': [round(p[1], 3) for p in points],
        's': [int(round(p[2])) for p in points],
        'd': [round(p[3], 2) for p in points],
        'length': round(length[-1], 2),
    }
    with open(os.path.join(track_dir, 'pitlane.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    log('pitlane Marina : dalle m99 s=%d→%d, côté %s, offset %.1f m, route %.1f m, couverture GLB %.1f%%/%.1f%%' %
        (start, end, 'droite' if sign > 0 else 'gauche', lane_d, data['length'], road_coverage * 100, pad_coverage * 100))
    return data
