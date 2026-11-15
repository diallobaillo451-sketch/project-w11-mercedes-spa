# -*- coding: utf-8 -*-
"""Marina Bay : lecture du GLB et reconstruction de la ligne centrale (partagé par la physique et la scène).

Modèle : « Marina Bay Street Circuit » (GLB de 59,5 Mo, 100 matériaux anonymes « 11001Mtl[_N] »), 1 unité = 1 m, Y vers le haut.
Les matériaux du modèle ne sont JAMAIS renommés dans le fichier : toute la classification passe par la table explicite de
marina_tables.py (indice de matériau glTF → classe). Même méthode que source/sepang/ (lecteur GLB, squelette de la piste).
"""
import json, struct
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree


# ───────────────────────────── GLB ─────────────────────────────
class Glb:
    def __init__(self, path):
        self.path = path
        with open(path, 'rb') as f:
            magic, _ver, _len = struct.unpack('<III', f.read(12))
            if magic != 0x46546C67:
                raise SystemExit('pas un GLB : ' + path)
            clen, _ = struct.unpack('<II', f.read(8))
            self.js = json.loads(f.read(clen))
            blen, _ = struct.unpack('<II', f.read(8))
            off = f.tell()
        self.bin = np.memmap(path, dtype=np.uint8, mode='r', offset=off, shape=(blen,))

    def accessor(self, ai):
        a = self.js['accessors'][ai]
        v = self.js['bufferViews'][a['bufferView']]
        ct = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5122: np.int16, 5120: np.int8}[a['componentType']]
        nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        isz = np.dtype(ct).itemsize
        base = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride') or isz * nc
        raw = np.asarray(self.bin[base:base + (a['count'] - 1) * stride + isz * nc]).tobytes()
        if stride == isz * nc:
            return np.frombuffer(raw, dtype=ct).reshape(a['count'], nc).copy()
        return np.ndarray((a['count'], nc), dtype=ct, buffer=raw, strides=(stride, isz)).copy()

    def node_matrix(self, n):
        if 'matrix' in n:
            return np.array(n['matrix'], float).reshape(4, 4).T
        t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
        x, y, z, w = q
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
        return M

    def world_primitives(self):
        """liste de (indice_matériau, sommets monde Nx3 float64, triangles Mx3, uv|None, (mesh, prim, noeud))"""
        out = []
        js = self.js
        sc = js['scenes'][js.get('scene', 0)]
        stack = [(i, np.eye(4)) for i in sc['nodes']]
        while stack:
            ni, P = stack.pop()
            n = js['nodes'][ni]
            M = P @ self.node_matrix(n)
            for c in n.get('children', []):
                stack.append((c, M))
            if 'mesh' in n:
                for pi, p in enumerate(js['meshes'][n['mesh']]['primitives']):
                    if p.get('mode', 4) != 4:
                        continue
                    V = self.accessor(p['attributes']['POSITION']).astype(np.float64)
                    W = V @ M[:3, :3].T + M[:3, 3]
                    F = self.accessor(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(V)).reshape(-1, 3)
                    UV = self.accessor(p['attributes']['TEXCOORD_0']).astype(np.float32) if 'TEXCOORD_0' in p['attributes'] else None
                    out.append((p.get('material'), W, F, UV, (n['mesh'], pi, ni)))
        return out


def triangles_by_material(prims):
    """dict matériau → (tris Nx3x3 monde, normale_y_normalisée N, aire N)"""
    acc = {}
    for mat, W, F, _uv, _id in prims:
        A, B, C = W[F[:, 0]], W[F[:, 1]], W[F[:, 2]]
        n = np.cross(B - A, C - A)
        nl = np.linalg.norm(n, axis=1) + 1e-12
        acc.setdefault(mat, []).append((np.stack([A, B, C], 1), n[:, 1] / nl, nl / 2))
    out = {}
    for m, lst in acc.items():
        out[m] = (np.concatenate([x[0] for x in lst]), np.concatenate([x[1] for x in lst]), np.concatenate([x[2] for x in lst]))
    return out


# ───────────────────────────── squelette ─────────────────────────────
def zhang_suen(img):
    im = img.astype(np.uint8)
    im[0, :] = 0; im[-1, :] = 0; im[:, 0] = 0; im[:, -1] = 0
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            P = np.pad(im, 1)
            p2 = P[:-2, 1:-1]; p3 = P[:-2, 2:]; p4 = P[1:-1, 2:]; p5 = P[2:, 2:]
            p6 = P[2:, 1:-1]; p7 = P[2:, :-2]; p8 = P[1:-1, :-2]; p9 = P[:-2, :-2]
            nbs = [p2, p3, p4, p5, p6, p7, p8, p9]
            B = sum(x.astype(np.int16) for x in nbs)
            seq = nbs + [p2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.int16) for i in range(8))
            c = ((p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)) if step == 0 else ((p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0))
            rem = (im == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rem.any():
                im[rem] = 0; changed = True
    return im.astype(bool)


def paint_mask(tris, x0, z0, W, H, S, value=255):
    img = np.zeros((H, W), np.uint8)
    SH = 4
    for k in range(len(tris)):
        pts = np.stack([(tris[k, :, 0] - x0) / S, (tris[k, :, 2] - z0) / S], 1)
        cv2.fillConvexPoly(img, (pts * (1 << SH)).astype(np.int32), value, lineType=cv2.LINE_8, shift=SH)
    return img


def resample_closed(P, step):
    Q = np.vstack([P, P[:1]])
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
    L = d[-1]
    n = int(round(L / step))
    u = np.linspace(0, L, n, endpoint=False)
    return np.stack([np.interp(u, d, Q[:, 0]), np.interp(u, d, Q[:, 1])], 1), L


def tangents(C):
    T = np.roll(C, -1, axis=0) - np.roll(C, 1, axis=0)
    return T / np.linalg.norm(T, axis=1)[:, None]
