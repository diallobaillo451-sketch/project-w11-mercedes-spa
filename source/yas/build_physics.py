# -*- coding: utf-8 -*-
"""Physique de Yas Marina : surface.json / surface.bin / grassmask.bin au format du jeu (voir source/game/src/track/surface.ts).
Adapté de source/sepang/build_physics.py (mêmes algorithmes et mêmes formats) ; différences : modèle mis à l'échelle réelle et tourné
(la ligne centrale décide du facteur f et de l'orientation), ligne centrale par graphe de squelette, tables indexées par NOM de matériau."""
import json, os, struct, time
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter1d, median_filter
from yas_core import load_glb, triangles_by_name, tri_stats, Affine, build_centerline, tangents, resample_closed
from yas_tables import GROUND, OVERLAY, NOWALL, TYPE_NAMES, LAP_M

ND = 361; D0 = -45.0; DSTEP = 0.25; JC = 180
GM_C0 = 116; GM_W = 130          # herbe 3D : colonnes -16 m … +16 m


def zbuffer(TRI, TM, x0, z0, W, H, S):
    """hauteur max et matériau du dessus pour chaque pixel (triangles tournés vers le haut)"""
    ZB = np.full((H, W), -1e9, np.float32)
    MB = np.zeros((H, W), np.uint8)
    X = (TRI[:, :, 0] - x0) / S; Z = (TRI[:, :, 2] - z0) / S; Y = TRI[:, :, 1]
    ax = np.floor(X.min(1) - 0.5).astype(int); bx = np.ceil(X.max(1) - 0.5).astype(int)
    az = np.floor(Z.min(1) - 0.5).astype(int); bz = np.ceil(Z.max(1) - 0.5).astype(int)
    for k in range(len(TRI)):
        a, b = max(ax[k], 0), min(bx[k], W - 1); c, d = max(az[k], 0), min(bz[k], H - 1)
        if a > b or c > d:
            continue
        gx = (np.arange(a, b + 1) + 0.5)[None, :]; gz = (np.arange(c, d + 1) + 0.5)[:, None]
        px, pz = X[k, 0], Z[k, 0]
        v0x, v0z = X[k, 1] - px, Z[k, 1] - pz; v1x, v1z = X[k, 2] - px, Z[k, 2] - pz
        den = v0x * v1z - v1x * v0z
        if abs(den) < 1e-9:
            continue
        u = ((gx - px) * v1z - v1x * (gz - pz)) / den
        v = (v0x * (gz - pz) - (gx - px) * v0z) / den
        ins = (u >= -1e-4) & (v >= -1e-4) & (u + v <= 1 + 1e-4)
        if not ins.any():
            continue
        y = Y[k, 0] + u * (Y[k, 1] - Y[k, 0]) + v * (Y[k, 2] - Y[k, 0])
        sub = ZB[c:d + 1, a:b + 1]
        better = ins & (y > sub)
        sub[better] = y[better]
        MB[c:d + 1, a:b + 1][better] = TM[k]
    return ZB, MB


def paint_mask(tris_list, x0, z0, W, H, S):
    img = np.zeros((H, W), np.uint8); SH = 4
    for tris in tris_list:
        for k in range(len(tris)):
            pts = np.stack([(tris[k, :, 0] - x0) / S, (tris[k, :, 2] - z0) / S], 1)
            cv2.fillPoly(img, [(pts * (1 << SH)).astype(np.int32)], 255, cv2.LINE_8, shift=SH)
    return cv2.morphologyEx(img, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0


def wall_raster(tris_list, x0, z0, W, H, S):
    img = np.zeros((H, W), np.uint8); SH = 4
    for tris in tris_list:
        for k in range(len(tris)):
            pts = np.stack([(tris[k, :, 0] - x0) / S, (tris[k, :, 2] - z0) / S], 1)
            cv2.polylines(img, [(pts * (1 << SH)).astype(np.int32)], True, 255, 1, cv2.LINE_8, shift=SH)
    return cv2.dilate(img, np.ones((3, 3), np.uint8))


def fill_rows(vals, valid, interp):
    """remplit les trous de chaque ligne (axe latéral) : interpolation linéaire (hauteurs) ou plus proche valide (types)"""
    n, nd = vals.shape
    out = vals.copy()
    ar = np.arange(nd)
    for i in np.where(~valid.all(1))[0]:
        v = valid[i]
        if not v.any():
            out[i] = np.nan if interp else 0
            continue
        idx = ar[v]
        if interp:
            out[i] = np.interp(ar, idx, vals[i, v])
        else:
            pos = np.searchsorted(idx, ar)
            lo = idx[np.clip(pos - 1, 0, len(idx) - 1)]; hi = idx[np.clip(pos, 0, len(idx) - 1)]
            near = np.where(np.abs(ar - lo) <= np.abs(hi - ar), lo, hi)
            out[i] = vals[i, near]
    return out


def first_run(flags, run=3):
    """premier indice (par ligne) où `run` valeurs vraies consécutives commencent ; -1 si aucun"""
    n = flags.shape[1]
    f = flags[:, :n - run + 1].copy()
    for k in range(1, run):
        f &= flags[:, k:n - run + 1 + k]
    has = f.any(1)
    idx = np.argmax(f, axis=1)
    return np.where(has, idx, -1)


def build_physics(glb_path, trackdir, log=print, debug_png=None):
    t0 = time.time()
    J, B = load_glb(glb_path)
    tm = triangles_by_name(J, B)
    log('GLB : %d matériaux utilisés, %d triangles (%.1fs)' % (len(tm), sum(len(v) for v in tm.values()), time.time() - t0))

    # 1. ligne centrale (coordonnées du modèle d'origine) → échelle réelle (longueur officielle) et orientation (départ vers −Z)
    P, info = build_centerline(tm, debug_png)
    A = Affine(info['f'], info['delta'], info['x0'], info['z0'])
    C, L = resample_closed(np.stack(A.xz(P[:, 0], P[:, 1]), 1), 1.0)
    N = len(C); ds = L / N
    log('ligne centrale : N=%d, longueur %.1f m (officiel %.0f), échelle du modèle %.4f (×%.4f)' % (N, L, LAP_M, 1 / info['f'], info['f']))
    tmf = {k: A.tris(v) for k, v in tm.items()}
    ny = {k: tri_stats(v)[0] for k, v in tm.items()}          # la normale Y normalisée est inchangée par une échelle uniforme et une rotation autour de Y

    T = tangents(C)
    Rv = np.stack([-T[:, 1], T[:, 0]], 1)                       # vecteur « droite » (X, Z), comme surface.ts
    dj = D0 + DSTEP * np.arange(ND)

    # 2. largeur de piste : emprise de la surface de course (ruban + lignes), raster à 0,5 m
    Sm = 0.5
    mx0 = np.floor(C[:, 0].min() / 10) * 10 - 60; mz0 = np.floor(C[:, 1].min() / 10) * 10 - 60
    mx1 = np.ceil(C[:, 0].max() / 10) * 10 + 60; mz1 = np.ceil(C[:, 1].max() / 10) * 10 + 60
    mW = int((mx1 - mx0) / Sm); mH = int((mz1 - mz0) / Sm)
    mk = paint_mask([tmf[m][ny[m] > 0.5] for m in OVERLAY if m in tmf], mx0, mz0, mW, mH, Sm)
    mi = dict(mask=mk, x0=mx0, z0=mz0, S=Sm)

    # 3. rasters à 0,25 m : hauteur + matériau du sol (z-buffer), murs
    S = 0.25
    x0, z0, x1, z1, W, H = mx0, mz0, mx1, mz1, int((mx1 - mx0) / S), int((mz1 - mz0) / S)
    code = {m: i + 1 for i, m in enumerate(GROUND)}
    TRI = []; TMAT = []
    for m in GROUND:
        if m not in tmf:
            continue
        tris = tmf[m]
        ok = (ny[m] > 0.2) & (tris[:, :, 0].max(1) > x0) & (tris[:, :, 0].min(1) < x1) & (tris[:, :, 2].max(1) > z0) & (tris[:, :, 2].min(1) < z1)
        TRI.append(tris[ok]); TMAT.append(np.full(ok.sum(), code[m], np.uint8))
    TRI = np.concatenate(TRI); TMAT = np.concatenate(TMAT)
    log('z-buffer %dx%d px, %d triangles de sol…' % (W, H, len(TRI)))
    ZB, MB = zbuffer(TRI, TMAT, x0, z0, W, H, S)
    log('z-buffer fait (%.1fs)' % (time.time() - t0))
    # murs : faces verticales de tout ce qui n'est pas du sol, qui touche le sol (≤ 1,5 m) et dépasse de 0,4 m
    wl_tris = []
    for m, tris in tmf.items():
        if m in NOWALL:
            continue
        hh = tris[:, :, 1].max(1) - tris[:, :, 1].min(1)
        ok = (np.abs(ny[m]) < 0.5) & (hh >= 0.3) & (tris[:, :, 0].max(1) > x0) & (tris[:, :, 0].min(1) < x1) & (tris[:, :, 2].max(1) > z0) & (tris[:, :, 2].min(1) < z1)
        if not ok.any():
            continue
        t = tris[ok]; cen = t.mean(1)
        g = ZB[np.clip(((cen[:, 2] - z0) / S).astype(int), 0, H - 1), np.clip(((cen[:, 0] - x0) / S).astype(int), 0, W - 1)]
        keep = (g > -1e8) & (t[:, :, 1].min(1) < g + 1.5) & (t[:, :, 1].max(1) > g + 0.4)
        if keep.any():
            wl_tris.append(t[keep])
    WR = wall_raster(wl_tris, x0, z0, W, H, S)
    log('murs : %d triangles verticaux (%.1fs)' % (sum(len(t) for t in wl_tris), time.time() - t0))

    # 4. sections transversales
    P2 = C[:, None, :] + dj[None, :, None] * Rv[:, None, :]
    px = np.clip(np.floor((P2[..., 0] - x0) / S).astype(int), 0, W - 1)
    pz = np.clip(np.floor((P2[..., 1] - z0) / S).astype(int), 0, H - 1)
    h = ZB[pz, px].astype(np.float64)
    mats = MB[pz, px]
    valid = h > -1e8
    lut = np.zeros(256, np.uint8)
    for m, t in GROUND.items():
        lut[code[m]] = t
    typ = lut[mats].astype(np.int16)
    h[~valid] = np.nan
    h = fill_rows(h, valid, True)
    typ = fill_rows(typ.astype(float), valid, False).astype(np.int16)
    bad = np.isnan(h).any(1)
    for i in np.where(bad)[0]:
        h[i] = h[i - 1]; typ[i] = typ[i - 1]

    # 5. largeur de la piste (emprise de la surface de course), de part et d'autre de la ligne centrale
    mpx = np.clip(np.floor((P2[..., 0] - mi['x0']) / mi['S']).astype(int), 0, mk.shape[1] - 1)
    mpz = np.clip(np.floor((P2[..., 1] - mi['z0']) / mi['S']).astype(int), 0, mk.shape[0] - 1)
    outside = ~mk[mpz, mpx]
    fr = first_run(outside[:, JC:], 4); fl = first_run(outside[:, :JC + 1][:, ::-1], 4)
    wr = np.where(fr >= 0, fr * DSTEP, 7.5); wl = np.where(fl >= 0, fl * DSTEP, 7.5)
    wr = np.clip(wr, 2.0, 14.0); wl = np.clip(wl, 2.0, 14.0)
    wr = gaussian_filter1d(median_filter(wr, 7, mode='wrap'), 2.0, mode='wrap')
    wl = gaussian_filter1d(median_filter(wl, 7, mode='wrap'), 2.0, mode='wrap')

    # 6. murs : première surface verticale (raster de murs) ou saut de hauteur brutal, au-delà du bord de piste
    wallhit = WR[pz, px] > 0
    jump = np.zeros_like(wallhit)
    dh = np.abs(np.diff(h, axis=1))
    jump[:, 1:] = dh > 0.9
    hit = wallhit | jump
    def first_wall(side):
        out = np.full(N, 44.0)
        for i in range(N):
            edge = (wr[i] if side > 0 else wl[i]) + 0.6
            k0 = int(round(edge / DSTEP))
            seg = hit[i, JC + k0:] if side > 0 else hit[i, :JC - k0 + 1][::-1]
            idx = np.nonzero(seg)[0]
            if len(idx):
                out[i] = min(44.0, (k0 + idx[0]) * DSTEP)
        return out
    wallR = first_wall(+1); wallL = first_wall(-1)
    wallR = gaussian_filter1d(median_filter(wallR, 5, mode='wrap'), 1.0, mode='wrap')
    wallL = gaussian_filter1d(median_filter(wallL, 5, mode='wrap'), 1.0, mode='wrap')
    wallR = np.maximum(wallR, wr + 0.6); wallL = np.maximum(wallL, wl + 0.6)
    for i in range(N):
        kr = JC + int(round(wallR[i] / DSTEP)); kl = JC - int(round(wallL[i] / DSTEP))
        typ[i, kr:] = 7; typ[i, :kl + 1] = 7
    typ[:, 0] = 7; typ[:, -1] = 7

    # 7. hauteurs relatives au centre (cm), lissage le long de la piste
    cy = gaussian_filter1d(h[:, JC], 2.0, mode='wrap')
    rel = gaussian_filter1d(h - cy[:, None], 1.2, axis=0, mode='wrap')
    rel_cm = np.clip(np.rint(rel * 100), -4096, 4095).astype(np.int32)
    grid = (((rel_cm + 4096) << 3) | typ.astype(np.int32)).astype(np.uint16)

    # 8. origine du monde = ligne de départ (X, Z) et hauteur de la ligne de départ
    ox, oz = C[0, 0], C[0, 1]; oy = cy[0]
    cx = C[:, 0] - ox; cz = C[:, 1] - oz; cyo = cy - oy
    os.makedirs(trackdir, exist_ok=True)
    meta = dict(N=int(N), ND=ND, D0=D0, DSTEP=DSTEP, ds=float(ds), length=float(L),
                cx=[round(float(v), 3) for v in cx], cy=[round(float(v), 3) for v in cyo], cz=[round(float(v), 3) for v in cz],
                wl=[round(float(v), 2) for v in wl], wr=[round(float(v), 2) for v in wr],
                wallL=[round(float(v), 2) for v in wallL], wallR=[round(float(v), 2) for v in wallR],
                types=TYPE_NAMES, origin=dict(x=float(ox), y=float(oy), z=float(oz)))
    with open(os.path.join(trackdir, 'surface.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    grid.astype('<u2').tofile(os.path.join(trackdir, 'surface.bin'))

    # 9. herbe 3D : 4 bits par cellule, colonnes GM_C0…GM_C0+GM_W
    sub = typ[:, GM_C0:GM_C0 + GM_W]
    slope = np.abs(np.gradient(rel, DSTEP, axis=1))[:, GM_C0:GM_C0 + GM_W]
    v = ((sub == 4) & (slope < 0.6)).astype(np.uint8)
    packed = (v[:, 0::2] | (v[:, 1::2] << 4)).astype(np.uint8)
    with open(os.path.join(trackdir, 'grassmask.bin'), 'wb') as f:
        f.write(struct.pack('<HH', GM_C0, GM_W)); f.write(packed.tobytes())

    # ── rapport ──
    names = ['vide', 'asphalte', 'vibreur', 'tapis', 'herbe', 'gravier', 'eau', 'mur']
    log('surface.bin %d octets · surface.json %d octets' % (os.path.getsize(os.path.join(trackdir, 'surface.bin')), os.path.getsize(os.path.join(trackdir, 'surface.json'))))
    tcount = np.bincount(typ.ravel(), minlength=8)
    log('types (%%) : ' + ' '.join('%s=%.1f' % (names[k], 100 * tcount[k] / typ.size) for k in range(8)))
    log('largeur piste : gauche %.1f–%.1f (moy %.2f), droite %.1f–%.1f (moy %.2f)' % (wl.min(), wl.max(), wl.mean(), wr.min(), wr.max(), wr.mean()))
    log('murs : gauche %.1f–%.1f (méd %.1f), droite %.1f–%.1f (méd %.1f)' % (wallL.min(), wallL.max(), np.median(wallL), wallR.min(), wallR.max(), np.median(wallR)))
    log('altitude relative au départ : %.1f … %.1f m ; dénivelé local max %.1f %%' % (cyo.min(), cyo.max(), 100 * np.abs(np.diff(cy) / ds).max()))
    log('physique terminée en %.1fs' % (time.time() - t0))
    return dict(N=N, ds=ds, L=L, C=np.stack([cx, cz], 1), cy=cyo, wl=wl, wr=wr, wallL=wallL, wallR=wallR, origin=(ox, oy, oz), grid=grid, typ=typ, T=T, affine=A, info=info)


if __name__ == '__main__':
    import sys
    build_physics(sys.argv[1], sys.argv[2], debug_png=(sys.argv[3] if len(sys.argv) > 3 else None))
