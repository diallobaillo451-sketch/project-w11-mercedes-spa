# -*- coding: utf-8 -*-
"""Réalisme de Sepang : public des tribunes (crowd.bin) et barrières réelles (barriers.bin).

Formats = ceux lus par le jeu :
- crowd.bin    : uint32 n, puis n × float32 (x, y, z, lacet) — voir source/game/src/render/crowd.ts ;
- barriers.bin : en-tête 28 octets (n, nc, x0, z0, C=8 m, gw, réservé), n segments (x1 z1 x2 z2), n types, hachage spatial
                 (clés, décalages, indices) — voir source/game/src/track/barriers.ts.
Tout est en repère jeu : monde du GLB moins l'origine (ligne de départ).
"""
import os, struct, time
import numpy as np
import cv2
from scipy.spatial import cKDTree
from sepang_tables import SEATS, BARRIER_KIND, WALL_PRIORITY


def build_crowd(tm, C, origin, trackdir, log=print):
    """une personne assise tous les ~0,36 m² de marche de tribune (matériau SEATS), tournée vers la piste"""
    t0 = time.time()
    rng = np.random.default_rng(11)
    tree = cKDTree(C)                                    # C : ligne centrale, repère GLB (X, Z)
    pts = []
    for mat in SEATS:
        if mat not in tm:
            continue
        tris, ny, ar = tm[mat]
        ok = ny > 0.85                                   # marches horizontales (les contremarches verticales ne portent pas de places)
        tris, ar = tris[ok], ar[ok]
        for t, a in zip(tris, ar):
            k = int(a / 0.36)
            k += 1 if rng.random() < (a / 0.36 - k) else 0
            if k <= 0:
                continue
            u = rng.random((k, 2)); f = u.sum(1) > 1; u[f] = 1 - u[f]
            P = t[0] + u[:, :1] * (t[1] - t[0]) + u[:, 1:] * (t[2] - t[0])
            pts.append(P)
    P = np.concatenate(pts)
    # éclaircissement : pas deux personnes à moins de 0,42 m
    cell = np.floor(P[:, [0, 2]] / 0.42).astype(np.int64)
    _, keep = np.unique(cell, axis=0, return_index=True)
    P = P[np.sort(keep)]
    d, i = tree.query(P[:, [0, 2]])
    to = C[i] - P[:, [0, 2]]
    to /= np.linalg.norm(to, axis=1)[:, None] + 1e-9
    yaw = np.arctan2(to[:, 0], -to[:, 1])                # le jeu oriente par (π − lacet) : visage = (sin lacet, −cos lacet)
    out = np.stack([P[:, 0] - origin[0], P[:, 1] - origin[1], P[:, 2] - origin[2], yaw], 1).astype(np.float32)
    with open(os.path.join(trackdir, 'crowd.bin'), 'wb') as f:
        f.write(struct.pack('<I', len(out))); f.write(out.tobytes())
    log('public : %d personnes, %.1f Ko (%.1fs)' % (len(out), os.path.getsize(os.path.join(trackdir, 'crowd.bin')) / 1024, time.time() - t0))
    return len(out)


def _footprints(tm, C, maxd=55.0):
    """segments au sol (x1 z1 x2 z2, repère GLB) des surfaces verticales des matériaux de mur, dédoublonnés, avec leur type"""
    tree = cKDTree(C)
    seg = {}
    for mat in WALL_PRIORITY:                            # du moins au plus prioritaire : un type plus prioritaire écrase l'autre
        if mat not in tm:
            continue
        tris, ny, _ar = tm[mat]
        hh = tris[:, :, 1].max(1) - tris[:, :, 1].min(1)
        ok = (np.abs(ny) < 0.5) & (hh >= 0.3)
        P = tris[ok][:, :, [0, 2]]
        if len(P) == 0:
            continue
        d01 = np.linalg.norm(P[:, 0] - P[:, 1], axis=1); d12 = np.linalg.norm(P[:, 1] - P[:, 2], axis=1); d02 = np.linalg.norm(P[:, 0] - P[:, 2], axis=1)
        m0 = (d01 >= d12) & (d01 >= d02); m1 = (~m0) & (d12 >= d02)
        A = np.where(m0[:, None], P[:, 0], np.where(m1[:, None], P[:, 1], P[:, 0]))
        B = np.where(m0[:, None], P[:, 1], np.where(m1[:, None], P[:, 2], P[:, 2]))
        L = np.linalg.norm(B - A, axis=1)
        dd, _ = tree.query((A + B) / 2)
        good = (L > 0.05) & (dd < maxd)
        kind = BARRIER_KIND[mat]
        for a, b in zip(A[good], B[good]):
            qa = (int(round(a[0] / 0.05)), int(round(a[1] / 0.05))); qb = (int(round(b[0] / 0.05)), int(round(b[1] / 0.05)))
            if qa > qb:
                qa, qb = qb, qa; a, b = b, a
            seg[(qa, qb)] = (a[0], a[1], b[0], b[1], kind)
    return np.array(list(seg.values()), dtype=np.float64)


def build_barriers(tm, phys, mask_info, origin, trackdir, log=print):
    t0 = time.time()
    C = phys['Cglb']
    S = _footprints(tm, C)
    log('barrières : %d segments bruts' % len(S))
    # 1. jamais de mur sur la chaussée : on retire tout segment qui touche l'emprise de la piste (dilatée de 0,5 m)
    mk = cv2.dilate(mask_info['mask'], np.ones((3, 3), np.uint8)); ms = mask_info['S']
    def hit(X, Z):
        px = np.clip(np.floor((X - mask_info['x0']) / ms).astype(int), 0, mk.shape[1] - 1)
        pz = np.clip(np.floor((Z - mask_info['z0']) / ms).astype(int), 0, mk.shape[0] - 1)
        return mk[pz, px] > 0
    bad = np.zeros(len(S), bool)
    for t in np.linspace(0, 1, 6):
        bad |= hit(S[:, 0] + (S[:, 2] - S[:, 0]) * t, S[:, 1] + (S[:, 3] - S[:, 1]) * t)
    removed = int(bad.sum())
    S = S[~bad]
    # 2. garde-fou : le contour « premier mur » (wallL / wallR) sert de barrière continue, comme avant les barrières réelles
    N = phys['N']; T = phys['T']; R = np.stack([-T[:, 1], T[:, 0]], 1)
    virt = []
    ctree = cKDTree(C)
    for wall, sg in ((phys['wallR'], 1.0), (phys['wallL'], -1.0)):
        wall = np.minimum(wall, 36.0)                    # au-delà, la courbe décalée se replie dans les épingles (rayon ~ 40 m)
        P = C + sg * wall[:, None] * R
        dn, _ = ctree.query(P)
        # à l'intérieur d'une épingle, la courbe décalée se replie et traverserait la piste : on ne garde un point que si sa distance
        # réelle à la ligne centrale est cohérente avec le décalage voulu
        okp = dn >= wall - 1.5
        for i in range(0, N, 2):
            j = (i + 2) % N
            if okp[i] and okp[j] and not hit(np.array([P[i, 0], P[j, 0], (P[i, 0] + P[j, 0]) / 2]), np.array([P[i, 1], P[j, 1], (P[i, 1] + P[j, 1]) / 2])).any():
                virt.append((P[i, 0], P[i, 1], P[j, 0], P[j, 1], 3))
    S = np.concatenate([S, np.array(virt, dtype=np.float64)])
    n = len(S)
    log('barrières : %d retirés (sur la piste), %d virtuels, %d au total' % (removed, len(virt), n))
    # 3. repère jeu
    S[:, 0] -= origin[0]; S[:, 2] -= origin[0]; S[:, 1] -= origin[2]; S[:, 3] -= origin[2]
    seg = S[:, :4].astype(np.float32); kind = S[:, 4].astype(np.uint8)
    # 4. hachage spatial 8 m, marge 1,6 m
    CS = 8.0; mg = 1.6
    x0 = float(np.floor(min(seg[:, 0].min(), seg[:, 2].min()) / CS) * CS - CS); z0 = float(np.floor(min(seg[:, 1].min(), seg[:, 3].min()) / CS) * CS - CS)
    gw = int(np.ceil((max(seg[:, 0].max(), seg[:, 2].max()) - x0) / CS)) + 3
    cells = {}
    for k in range(n):
        x1, z1, x2, z2 = (float(v) for v in seg[k])
        L = max(abs(x2 - x1), abs(z2 - z1))
        m = max(2, int(L / 2.0) + 2)
        keys = set()
        for t in np.linspace(0, 1, m):
            px = x1 + (x2 - x1) * t; pz = z1 + (z2 - z1) * t
            for ox in (-mg, mg):
                for oz in (-mg, mg):
                    gx = int(np.floor((px + ox - x0) / CS)); gy = int(np.floor((pz + oz - z0) / CS))
                    if gx >= 0 and gy >= 0:
                        keys.add(gy * gw + gx)
        for key in keys:
            cells.setdefault(key, []).append(k)
    ks = np.array(sorted(cells), dtype=np.uint32)
    off = np.zeros(len(ks) + 1, dtype=np.uint32)
    idx = []
    for a, key in enumerate(ks):
        lst = cells[int(key)]
        idx.extend(lst); off[a + 1] = off[a] + len(lst)
    idx = np.array(idx, dtype=np.uint32)
    with open(os.path.join(trackdir, 'barriers.bin'), 'wb') as f:
        f.write(struct.pack('<IIfffII', n, len(ks), x0, z0, CS, gw, 0))
        f.write(seg.tobytes()); f.write(kind.tobytes()); f.write(b'\0' * ((4 - n % 4) % 4))
        f.write(ks.tobytes()); f.write(off.tobytes()); f.write(idx.tobytes())
    size = os.path.getsize(os.path.join(trackdir, 'barriers.bin'))
    cnt = np.diff(off)
    log('barrières : %d cellules, %.1f segments/cellule (max %d), %.0f Ko (%.1fs)' % (len(ks), cnt.mean(), cnt.max(), size / 1024, time.time() - t0))
    return n
