# -*- coding: utf-8 -*-
"""Voie des stands de Sepang : chemin praticable (pitlane.json) au format de source/game/src/track/pitlane.ts.

Le modèle d'origine a une entrée des stands « extérieure » (une route qui fait le tour de l'épingle, hors de la grille physique
de ±45 m) : le chemin du jeu entre donc par une COUPURE directe dans la clôture diagonale (zone « porte »), à quelques dizaines
de mètres avant le nez du muret ; la sortie est celle du modèle (le muret finit, la voie rejoint la piste).

Repère : (s, d) = station de la ligne centrale et écart latéral (droite positif, comme surface.ts) ; sortie en repère jeu.
"""
import json, os
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree

# points de contrôle du chemin (s, d) — le mur du stand (faces à d ≈ 9,8 et 11,8 m) va de s ≈ 5377 à s ≈ 395
ENTRY = [(5290.0, 5.0), (5320.0, 9.5), (5342.0, 15.5), (5356.0, 18.5), (5374.0, 17.4), (5392.0, 15.4)]
EXIT = [(362.0, 14.1), (395.0, 13.6), (420.0, 12.2), (445.0, 9.3), (470.0, 6.0), (490.0, 4.5)]
CLEAR = 2.5            # distance chemin → face du muret (demi-largeur voiture 1,0 m + marge)
STEP = 2.0             # pas du chemin (m)


def _st(C, N, s):
    """position (x, z) et vecteur droite à une station fractionnaire s (modulo N)"""
    s = np.asarray(s, float) % N
    i0 = np.floor(s).astype(int) % N; i1 = (i0 + 1) % N; f = (s - np.floor(s))[..., None]
    P = C[i0] * (1 - f) + C[i1] * f
    T = C[i1] - C[(i0 - 1) % N]
    T = T / np.linalg.norm(T, axis=-1, keepdims=True)
    return P, np.stack([-T[..., 1], T[..., 0]], -1)


def faces(S_real, C, R, N, ss):
    """pour chaque station : face du muret côté piste (9–11 m) et côté stands (juste derrière) ; NaN si absent"""
    A = S_real[:, :2]; E = S_real[:, 2:4] - A
    L = np.hypot(E[:, 0], E[:, 1]); keep = (L >= 1.0) & (S_real[:, 4] == 3)
    A, E = A[keep], E[keep]
    f_in = np.full(len(ss), np.nan); f_out = np.full(len(ss), np.nan)
    for k, s in enumerate(ss):
        i = int(s) % N
        Rv = R[i]; den = Rv[0] * E[:, 1] - Rv[1] * E[:, 0]; w = A - C[i]
        with np.errstate(divide='ignore', invalid='ignore'):
            t = (w[:, 0] * E[:, 1] - w[:, 1] * E[:, 0]) / den; u = (w[:, 0] * Rv[1] - w[:, 1] * Rv[0]) / den
        ok = (np.abs(den) > 1e-9) & (u >= 0) & (u <= 1) & (t > 8.0) & (t < 40)
        h = np.sort(t[ok])
        h = h[np.r_[True, np.diff(h) > 0.6]] if len(h) else h
        if len(h) >= 2 and 8.5 <= h[0] <= 11.0 and 11.0 <= h[1] <= 16.5:
            f_in[k] = h[0]; f_out[k] = h[1]
    return f_in, f_out


def make_path(phys, S_real, log=print):
    C = phys['Cglb']; N = phys['N']; T = phys['T']; R = np.stack([-T[:, 1], T[:, 0]], 1)
    # 1. voie rapide le long du muret : face côté stands + CLEAR
    ss = np.arange(5395, 5395 + 560)                      # 5395 … 5541 puis 0 … 413
    fin, fout = faces(S_real, C, R, N, ss % N)
    good = np.isfinite(fout)
    lane_s = ss[good].astype(float); face = fout[good]
    lane_d = np.maximum(gaussian_filter1d(face + CLEAR, 2.0, mode='nearest'), face + 1.9)
    # on garde la partie où le muret existe réellement (jusqu'à la fin du muret)
    # 2. entrée et sortie : courbes lissées par les points de contrôle (en s déroulé)
    e_s = np.array([p[0] for p in ENTRY]); e_d = np.array([p[1] for p in ENTRY])
    x_s = np.array([p[0] for p in EXIT]) + N; x_d = np.array([p[1] for p in EXIT])
    lane_s_u = np.where(lane_s < 5000, lane_s + N, lane_s)          # déroulé : 5395 … 5542+413
    s_end_lane = lane_s_u.max()
    # raccord : la voie rapide commence là où l'entrée finit (5392) et finit là où la sortie commence (385 + N)
    sel = (lane_s_u >= ENTRY[-1][0]) & (lane_s_u <= EXIT[0][0] + N)
    ls, ld = lane_s_u[sel], lane_d[sel]
    # entrée
    es = np.arange(e_s[0], e_s[-1], 1.0)
    ed = _pchip(e_s, e_d, es)
    # sortie
    xs = np.arange(x_s[0] + 1.0, x_s[-1] + 1e-6, 1.0)
    xd = _pchip(x_s, x_d, xs)
    S_all = np.concatenate([es, ls, xs]); D_all = np.concatenate([ed, ld, xd])
    order = np.argsort(S_all); S_all, D_all = S_all[order], D_all[order]
    # lissage léger de d (garde les extrémités)
    D_all = gaussian_filter1d(D_all, 2.5, mode='nearest')
    P, Rv = _st(C, N, S_all)
    XY = P + D_all[:, None] * Rv
    # 3. rééchantillonnage régulier tous les STEP m
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(XY, axis=0), axis=1))]
    n = int(seg[-1] / STEP) + 1
    u = np.linspace(0, seg[-1], n)
    XYr = np.stack([np.interp(u, seg, XY[:, 0]), np.interp(u, seg, XY[:, 1])], 1)
    ctree = cKDTree(C)
    _, si = ctree.query(XYr)
    lat = ((XYr - C[si]) * R[si]).sum(1)
    log('voie des stands : %d points, %.0f m, s de %d à %d' % (n, seg[-1], si[0], si[-1]))
    return dict(xy=XYr, s=si, d=lat, length=float(seg[-1]), entry_end=ENTRY[-1][0], exit_start=EXIT[0][0])


def _pchip(xs, ys, xq):
    from scipy.interpolate import PchipInterpolator
    return PchipInterpolator(xs, ys)(xq)


def check_path(path, S_real, C, N, log=print):
    """jeu de contrôles : distance aux barrières, courbure, écarts"""
    XY = path['xy']
    # distance aux segments (échantillonnés tous les 0,3 m)
    pts = []
    for a, b in zip(S_real[:, :2], S_real[:, 2:4]):
        m = max(2, int(np.hypot(*(b - a)) / 0.3) + 1)
        t = np.linspace(0, 1, m)[:, None]; pts.append(a + (b - a) * t)
    tree = cKDTree(np.concatenate(pts))
    dist, _ = tree.query(XY)
    ang = np.arctan2(np.diff(XY[:, 1]), np.diff(XY[:, 0])); dang = np.abs(np.diff(np.unwrap(ang)))
    curv = dang / STEP
    log('contrôle chemin : barrière la plus proche %.2f m ; points à < 1,4 m : %d ; rayon mini %.0f m' % (dist.min(), (dist < 1.4).sum(), 1.0 / max(curv.max(), 1e-6)))
    return dist


# ───────────────────────────── porte d'entrée, surface, fichier ─────────────────────────────
GATE_S = (5336.0, 5368.0)     # tronçon du chemin qui traverse la clôture diagonale
GATE_R = 2.3                  # rayon de la coupure autour du chemin (m)
PIT_ZONE = (5280, 520)        # stations où le garde-fou virtuel de droite est retiré (les vrais murs suffisent)


def gate_points(path):
    """points du chemin (repère GLB, un tous les 0,5 m) qui traversent la clôture : on y retire barrières et clôture visible"""
    XY = path['xy']; s = path['s']
    sel = np.where((s >= GATE_S[0]) & (s <= GATE_S[1]))[0]
    sel = sel[sel < len(XY) // 2]                        # entrée seulement
    pts = []
    for a, b in zip(sel[:-1], sel[1:]):
        for t in np.linspace(0, 1, 5, endpoint=False):
            pts.append(XY[a] * (1 - t) + XY[b] * t)
    pts.append(XY[sel[-1]])
    return np.array(pts)


def clip_segments(S, pts, r):
    """retire de chaque segment (x1 z1 x2 z2 type) les parties à moins de r m des points `pts` ; garde les morceaux ≥ 0,3 m"""
    out = []; tree = cKDTree(pts)
    for seg in S:
        a = seg[:2]; b = seg[2:4]; e = b - a; L = float(np.hypot(*e))
        if L < 1e-6:
            continue
        idx = tree.query_ball_point((a + b) / 2, r + L / 2)
        if not idx:
            out.append(seg); continue
        iv = []
        for k in idx:
            p = pts[k]; f = a - p
            A_ = e @ e; B_ = 2 * (f @ e); C_ = f @ f - r * r
            disc = B_ * B_ - 4 * A_ * C_
            if disc <= 0:
                continue
            q = np.sqrt(disc); t0 = (-B_ - q) / (2 * A_); t1 = (-B_ + q) / (2 * A_)
            if t1 > 0 and t0 < 1:
                iv.append((max(t0, 0.0), min(t1, 1.0)))
        if not iv:
            out.append(seg); continue
        iv.sort(); merged = [list(iv[0])]
        for t0, t1 in iv[1:]:
            if t0 <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], t1)
            else: merged.append([t0, t1])
        cur = 0.0
        for t0, t1 in merged + [[1.0, 1.0]]:
            if (t0 - cur) * L >= 0.3:
                p0 = a + e * cur; p1 = a + e * t0
                out.append(np.array([p0[0], p0[1], p1[0], p1[1], seg[4]]))
            cur = max(cur, t1)
    return np.array(out)


def in_zone(i, zone=PIT_ZONE):
    return (i >= zone[0]) | (i <= zone[1])


def apply_pit_to_surface(phys, path, S_final, trackdir, log=print):
    """derrière le muret des stands, le sol redevient du vrai sol (asphalte…) au lieu de « mur » ; la coupure d'entrée est de l'asphalte"""
    import cv2
    from scipy.ndimage import label
    N = phys['N']; typ = phys['typ'].copy(); gtyp = phys['gtyp']; rel_cm = phys['rel_cm']; C = phys['Cglb']; T = phys['T']
    R = np.stack([-T[:, 1], T[:, 0]], 1)
    ND = typ.shape[1]; JC = (ND - 1) // 2; D0 = -45.0; DS = 0.25
    XY = path['xy']
    # raster des barrières finales (0,25 m) sur l'emprise du chemin
    x0 = XY[:, 0].min() - 60; z0 = XY[:, 1].min() - 60; x1 = XY[:, 0].max() + 60; z1 = XY[:, 1].max() + 60
    sc = 0.25; W = int((x1 - x0) / sc); H = int((z1 - z0) / sc)
    wall = np.zeros((H, W), np.uint8)
    for a in S_final:
        if max(a[0], a[2]) < x0 or min(a[0], a[2]) > x1 or max(a[1], a[3]) < z0 or min(a[1], a[3]) > z1:
            continue
        cv2.line(wall, (int((a[0] - x0) / sc), int((a[1] - z0) / sc)), (int((a[2] - x0) / sc), int((a[3] - z0) / sc)), 255, 1)
    wall = cv2.dilate(wall, np.ones((3, 3), np.uint8))
    lab, nl = label(wall == 0)
    seeds = set(int(lab[int((p[1] - z0) / sc), int((p[0] - x0) / sc)]) for p in XY if 0 <= (p[0] - x0) / sc < W and 0 <= (p[1] - z0) / sc < H)
    seeds.discard(0)
    region = np.isin(lab, list(seeds))
    log('surface : région libre reliée au chemin = %.0f m²' % (region.sum() * sc * sc))
    # stations de la zone des stands, côté droit, cellules « mur » dont la position est dans la région libre
    st = np.array([i for i in range(N) if in_zone(i)])
    j = np.arange(ND); d = D0 + DS * j
    changed = 0
    for i in st:
        P = C[i][None, :] + d[:, None] * R[i][None, :]
        px = ((P[:, 0] - x0) / sc).astype(int); pz = ((P[:, 1] - z0) / sc).astype(int)
        ok = (px >= 0) & (px < W) & (pz >= 0) & (pz < H)
        reg = np.zeros(ND, bool); reg[ok] = region[pz[ok], px[ok]]
        cells = (typ[i] == 7) & reg & (d > 9.5)
        if cells.any():
            typ[i, cells] = np.where(np.isin(gtyp[i, cells], (1, 2, 3, 4, 5)), gtyp[i, cells], 1)
            changed += int(cells.sum())
    # le chemin lui-même : asphalte sur 2 m de part et d'autre (coupure à travers l'herbe, raccord de sortie)
    dens = np.array([XY[a] * (1 - t) + XY[a + 1] * t for a in range(len(XY) - 1) for t in np.linspace(0, 1, 5, endpoint=False)])
    ptree = cKDTree(dens)
    near = 0
    for i in st:
        P = C[i][None, :] + d[:, None] * R[i][None, :]
        dist, _ = ptree.query(P)
        cells = (dist < 2.0) & np.isin(typ[i], (0, 4, 5, 7))
        if cells.any():
            typ[i, cells] = 1; near += int(cells.sum())
    log('surface : %d cellules « mur » rendues au sol réel derrière le muret, %d cellules d\'asphalte le long du chemin' % (changed, near))
    grid = (((rel_cm + 4096) << 3) | typ.astype(np.int32)).astype(np.uint16)
    grid.astype('<u2').tofile(os.path.join(trackdir, 'surface.bin'))
    return grid, typ


def write_pitlane(path, origin, trackdir, log=print):
    XY = path['xy']
    out = dict(x=[round(float(v - origin[0]), 2) for v in XY[:, 0]], z=[round(float(v - origin[2]), 2) for v in XY[:, 1]],
               s=[int(v) for v in path['s']], d=[round(float(v), 2) for v in path['d']], length=round(path['length'], 1))
    with open(os.path.join(trackdir, 'pitlane.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    log('voie des stands : pitlane.json, %d points, %.0f m' % (len(XY), path['length']))


def strip_mesh(path, phys, origin, width=4.6):
    """bande d'asphalte visible sur la partie de l'entrée qui traverse de l'herbe (repère jeu) : positions, normales, uv, indices"""
    XY = path['xy']; s = path['s']; N = phys['N']
    gt = phys['gtyp']; rel = phys['rel_cm']; cy = phys['cy']
    ND = gt.shape[1]
    sel = []
    for k in range(len(XY)):
        if not (5280 <= s[k] <= 5395):
            continue
        j = int(round((path['d'][k] + 45.0) / 0.25)); j = min(max(j, 0), ND - 1)
        sel.append((k, int(gt[s[k], j] in (4, 5))))
    ks = [k for k, g in sel if g]
    if not ks:
        return None
    a = max(min(ks) - 4, 0); b = min(max(ks) + 4, len(XY) - 1)
    pts = XY[a:b + 1]
    tg = np.gradient(pts, axis=0); tg /= np.linalg.norm(tg, axis=1)[:, None]
    nr = np.stack([-tg[:, 1], tg[:, 0]], 1)
    left = pts - nr * width / 2; right = pts + nr * width / 2
    V = []; UV = []
    dist = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    for q in range(len(pts)):
        for side, P in ((0, left[q]), (1, right[q])):
            i = int(path['s'][a + q]); jj = int(round(((path['d'][a + q] + (-1 if side == 0 else 1) * width / 2) + 45.0) / 0.25)); jj = min(max(jj, 0), ND - 1)
            y = cy[i] + rel[i, jj] * 0.01 + 0.03
            V.append([P[0] - origin[0], y, P[1] - origin[2]]); UV.append([side * 0.4, dist[q] / 8.0])
    V = np.array(V, np.float32); UV = np.array(UV, np.float32)
    idx = []
    for q in range(len(pts) - 1):
        a0, a1, b0, b1 = 2 * q, 2 * q + 1, 2 * q + 2, 2 * q + 3
        idx += [a0, b0, a1, a1, b0, b1]
    idx = np.array(idx, np.uint32)
    nrm = np.cross(V[idx[1]] - V[idx[0]], V[idx[2]] - V[idx[0]])
    if nrm[1] < 0:                                       # face visible par le dessus
        idx = idx.reshape(-1, 3)[:, ::-1].reshape(-1).copy()
    Nn = np.tile(np.array([0, 1, 0], np.float32), (len(V), 1))
    return V, Nn, UV, idx
