# -*- coding: utf-8 -*-
"""Lampadaires de Marina Bay : têtes des poteaux (composantes connexes hautes du matériau m77) → lamps.json (coordonnées du jeu).
Le rendu de nuit y pose un halo lumineux (src/render/night.ts)."""
import json, os
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
import marina_tables as T


def find_lamps(tm, C_model, origin, min_h=4.0, max_dist=150.0, merge=3.0):
    tris = tm[T.LAMP_MAT][0]
    V = tris.reshape(-1, 3)
    key = np.round(V * 100).astype(np.int64)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1, 3)
    n = len(uniq)
    rows = np.concatenate([inv[:, 0], inv[:, 1]]); cols = np.concatenate([inv[:, 1], inv[:, 2]])
    nc, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)), directed=False)
    P = uniq / 100.0
    ymax = np.full(nc, -1e9); np.maximum.at(ymax, lab, P[:, 1])
    ymin = np.full(nc, 1e9); np.minimum.at(ymin, lab, P[:, 1])
    cen = np.zeros((nc, 3)); cnt = np.bincount(lab, minlength=nc)
    for k in range(3):
        cen[:, k] = np.bincount(lab, weights=P[:, k], minlength=nc) / np.maximum(cnt, 1)
    d, _ = cKDTree(C_model).query(cen[:, [0, 2]])
    ok = (ymax - ymin >= min_h) & (d <= max_dist)
    top = P[:, 1] >= ymax[lab] - 0.6
    sel = top & ok[lab]
    tp = np.zeros((nc, 3)); tn = np.bincount(lab[sel], minlength=nc)
    for k in range(3):
        tp[:, k] = np.bincount(lab[sel], weights=P[sel, k], minlength=nc) / np.maximum(tn, 1)
    pts = tp[ok & (tn > 0)]
    # fusion des doublons (poteaux doubles) : un seul halo par 3 m
    order = np.argsort(-pts[:, 1]); pts = pts[order]
    tree = cKDTree(pts[:, [0, 2]]); keep = np.ones(len(pts), bool)
    for i in range(len(pts)):
        if not keep[i]:
            continue
        for j in tree.query_ball_point(pts[i, [0, 2]], merge):
            if j > i:
                keep[j] = False
    pts = pts[keep] - np.asarray(origin)
    return pts


def write_lamps(pts, trackdir):
    flat = [round(float(v), 2) for v in pts.reshape(-1)]
    with open(os.path.join(trackdir, 'lamps.json'), 'w') as f:
        json.dump({'n': int(len(pts)), 'p': flat}, f, separators=(',', ':'))
