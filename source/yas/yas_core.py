# -*- coding: utf-8 -*-
"""Noyau du convertisseur Yas Marina : lecture GLB tolérante, triangles par matériau, transformation affine, ligne centrale."""
import json, math, struct
import numpy as np
import networkx as nx
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.ndimage import gaussian_filter1d
from skimage.morphology import skeletonize
from yas_tables import RIBBON, LAP_M

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


# ───────────────────────── GLB ─────────────────────────
def load_glb(path):
    """Lit un GLB, même tronqué : le fichier d'origine manque de 18 561 octets (fin de la texture d'horizon n° 92) ;
    le chunk BIN est complété par des zéros jusqu'à la longueur déclarée."""
    raw = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<4sII', raw[:12])
    assert magic == b'glTF', 'pas un GLB'
    if len(raw) < length: raw += bytes(length - len(raw))
    off = 12; J = B = None
    while off < length:
        clen, ctype = struct.unpack('<II', raw[off:off + 8]); data = raw[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A: J = json.loads(data)
        elif ctype == 0x004E4942: B = bytearray(data)
        off += 8 + clen
    return J, B

def save_glb(J, B, path):
    b = bytes(B); b += bytes(-len(b) % 4)
    J['buffers'][0]['byteLength'] = len(b)
    js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(b)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(b), 0x004E4942)); f.write(b)

def accessor(J, B, ai):
    a = J['accessors'][ai]; v = J['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]; n = NC[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride'); cnt = a['count']
    if st and st != np.dtype(dt).itemsize * n:
        return np.ndarray((cnt,), dtype=np.dtype([('f', dt, (n,))]), buffer=B, offset=off, strides=(st,))['f']
    return np.frombuffer(B, dtype=dt, count=cnt * n, offset=off).reshape(cnt, n)

def _mat_of(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
    T = np.eye(4)
    if 'scale' in n: T = T @ np.diag(list(n['scale']) + [1])
    if 'rotation' in n:
        x, y, z, w = n['rotation']
        R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0],
                      [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0], [0, 0, 0, 1]]); T = R @ T
    if 'translation' in n:
        t = np.eye(4); t[:3, 3] = n['translation']; T = t @ T
    return T

def world_matrices(J):
    nodes = J['nodes']; parent = {}
    for ni, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = ni
    out = {}
    for ni in range(len(nodes)):
        M = _mat_of(nodes[ni]); k = ni
        while k in parent: k = parent[k]; M = _mat_of(nodes[k]) @ M
        out[ni] = M
    return out

def triangles_by_name(J, B):
    """{nom de matériau: triangles (n,3,3) float32 en coordonnées monde du modèle d'origine}"""
    names = [m.get('name', '') for m in J['materials']]; W = world_matrices(J); acc = {}
    for ni, n in enumerate(J['nodes']):
        if 'mesh' not in n: continue
        for pr in J['meshes'][n['mesh']]['primitives']:
            if 'material' not in pr: continue
            P = accessor(J, B, pr['attributes']['POSITION']).astype(np.float64)
            Pw = (np.c_[P, np.ones(len(P))] @ W[ni].T)[:, :3]
            idx = accessor(J, B, pr['indices']).reshape(-1).astype(np.int64) if 'indices' in pr else np.arange(len(Pw))
            acc.setdefault(names[pr['material']], []).append(Pw[idx.reshape(-1, 3)].astype(np.float32))
    return {k: np.concatenate(v) for k, v in acc.items()}

def tri_stats(tris):
    """normale Y (signée, normalisée) et aire de chaque triangle"""
    a, b, c = (tris[:, i].astype(np.float64) for i in range(3))
    cr = np.cross(b - a, c - a); ln = np.linalg.norm(cr, axis=1)
    return cr[:, 1] / np.maximum(ln, 1e-12), 0.5 * ln


class Affine:
    """p' = f·Rot(δ)·(p − p0) dans le plan (x,z) ; y' = f·y.  Rotation propre (déterminant +1), pas de miroir."""
    def __init__(self, f, delta, x0, z0): self.f, self.d, self.x0, self.z0 = f, delta, x0, z0
    def xz(self, x, z):
        c, s = math.cos(self.d), math.sin(self.d); dx, dz = x - self.x0, z - self.z0
        return self.f * (c * dx - s * dz), self.f * (s * dx + c * dz)
    def tris(self, t):
        o = t.astype(np.float64).copy(); x, z = self.xz(o[..., 0], o[..., 2]); o[..., 0] = x; o[..., 2] = z; o[..., 1] *= self.f
        return o.astype(np.float32)
    def matrix(self, tx=0.0, ty=0.0, tz=0.0):
        """matrice glTF (colonne-majeure) de p → T(tx,ty,tz)·A·p"""
        c, s, f = math.cos(self.d), math.sin(self.d), self.f
        ax = -f * (c * self.x0 - s * self.z0); az = -f * (s * self.x0 + c * self.z0)
        rows = [[f * c, 0, -f * s, ax + tx], [0, f, 0, ty], [f * s, 0, f * c, az + tz], [0, 0, 0, 1]]
        return [rows[r][c_] for c_ in range(4) for r in range(4)]


# ───────────────────────── ligne centrale ─────────────────────────
S = 2.0                         # px par mètre (modèle) du raster de travail
NARROW_HW = 2.8                 # demi-largeur médiane (m modèle) sous laquelle une chaîne est une route de service / la voie des stands
SMOOTH_M = 3.0                  # lissage gaussien de la ligne centrale (m modèle)
START_FRAC = 0.35               # départ à 35 % de la ligne droite des stands (le départ réel est à ≈ 36 % de la voie des stands)

def _arclen(P): return np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.vstack([P, P[:1]]), axis=0).T))])

def _ribbon_raster(tris):
    allp = tris[:, :, [0, 2]].reshape(-1, 2)
    x0, z0 = allp.min(0) - 20; x1, z1 = allp.max(0) + 20
    W, H = int((x1 - x0) * S) + 1, int((z1 - z0) * S) + 1
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
    for tr in tris: d.polygon([((float(a) - x0) * S, (float(c) - z0) * S) for a, c in tr[:, [0, 2]]], fill=1)
    return np.asarray(im).astype(bool), (float(x0), float(z0))

def _skeleton_graph(mask):
    m = ndi.binary_closing(mask, iterations=2); sk = skeletonize(m)
    ys, xs = np.nonzero(sk); n = len(xs); idx = -np.ones(sk.shape, int); idx[ys, xs] = np.arange(n)
    G = nx.Graph()
    for i, (y, x) in enumerate(zip(ys, xs)): G.add_node(i, pos=(float(x), float(y)))
    for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        for i, (y, x) in enumerate(zip(ys, xs)):
            y2, x2 = y + dy, x + dx
            if 0 <= y2 < sk.shape[0] and 0 <= x2 < sk.shape[1] and idx[y2, x2] >= 0: G.add_edge(i, idx[y2, x2], w=math.hypot(dy, dx) / S)
    G = G.subgraph(max(nx.connected_components(G), key=len)).copy()
    ch = True
    while ch:                                    # élagage des épines < 12 m
        ch = False
        for e in [v for v in G if G.degree(v) == 1]:
            if e not in G: continue
            path = [e]; L = 0; cur = e; prev = None
            while True:
                nb = [u for u in G[cur] if u != prev]
                if len(nb) != 1: break
                nxt = nb[0]; L += G[cur][nxt]['w']; prev = cur; cur = nxt; path.append(cur)
                if G.degree(cur) != 2: break
            if L < 12 and G.degree(cur) >= 3: G.remove_nodes_from(path[:-1]); ch = True
    return G, m

def _chains(G, dt):
    J = [v for v in G if G.degree(v) != 2]; jset = set(J); sup = {}
    for k, c in enumerate(nx.connected_components(G.subgraph(J))):
        for v in c: sup[v] = k
    seen = set(); chains = []
    for v in J:
        for u in G[v]:
            if (v, u) in seen: continue
            path = [v, u]; prev = v; cur = u; L = G[v][u]['w']; seen.add((v, u))
            while cur not in jset:
                nb = [z for z in G[cur] if z != prev]
                if not nb: break
                nxt = nb[0]; L += G[cur][nxt]['w']; prev, cur = cur, nxt; path.append(cur)
            if cur in jset:
                seen.add((cur, path[-2])); a, b = sup[v], sup[cur]
                if a == b and L < 4: continue
                pts = np.array([G.nodes[p]['pos'] for p in path]).astype(int)
                chains.append(dict(a=a, b=b, L=L, path=path, hw=float(np.median(dt[pts[:, 1], pts[:, 0]]))))
    return chains

def _pick_loop(chains):
    """boucle la plus courte qui contient les 5 plus longues chaînes « larges » (les routes de service et la voie des stands sont étroites)"""
    wide = [i for i, c in enumerate(chains) if c['hw'] >= NARROW_HW]
    must = set(sorted(wide, key=lambda i: -chains[i]['L'])[:5])
    adj = {}
    for i in wide:
        c = chains[i]; adj.setdefault(c['a'], []).append((c['b'], i)); adj.setdefault(c['b'], []).append((c['a'], i))
    cycles = {}
    for s in sorted(adj):
        def dfs(cur, visited, pc, L):
            for nb, ci in adj[cur]:
                if ci in pc: continue
                if nb == s and len(pc) >= 2: cycles.setdefault(frozenset(pc + [ci]), (L + chains[ci]['L'], pc + [ci])); continue
                if nb in visited or nb < s: continue
                dfs(nb, visited | {nb}, pc + [ci], L + chains[ci]['L'])
        dfs(s, {s}, [], 0.0)
    ok = sorted([(L, pc) for L, pc in cycles.values() if must <= set(pc)])
    assert ok, 'aucune boucle ne contient les chaînes principales'
    return ok[0][1]

def _order_loop(chains, sel):
    order = []; rem = set(sel); cur = sel[0]; order.append((cur, False)); end = chains[cur]['b']; rem.discard(cur)
    while rem:
        for ci in rem:
            c = chains[ci]
            if c['a'] == end: order.append((ci, False)); end = c['b']; rem.discard(ci); break
            if c['b'] == end: order.append((ci, True)); end = c['a']; rem.discard(ci); break
        else: raise RuntimeError('boucle non fermée')
    return order

def build_centerline(tm, debug_png=None):
    """Ligne centrale de la surface de course (matériau RIBBON), en coordonnées du modèle d'origine, sens anti-horaire (vu de dessus),
    point de départ en tête (indice 0). Renvoie (P (n,2) pas de 0,5 m, info avec f = échelle, delta = rotation, x0/z0 = départ)."""
    mask, (x0, z0) = _ribbon_raster(tm[RIBBON])
    G, m = _skeleton_graph(mask); dt = ndi.distance_transform_edt(m) / S
    chains = _chains(G, dt); sel = _pick_loop(chains); order = _order_loop(chains, sel)
    pos = lambda p: np.array([G.nodes[p]['pos'][0] / S + x0, G.nodes[p]['pos'][1] / S + z0])
    pts = []
    for ci, rev in order:
        pp = [pos(p) for p in chains[ci]['path']]; pts.extend(pp[::-1] if rev else pp)
    pts = np.array(pts); keep = [0]
    for i in range(1, len(pts)):
        if np.hypot(*(pts[i] - pts[keep[-1]])) > 1e-6: keep.append(i)
    pts = pts[keep]; s = _arclen(pts); L = s[-1]; n = int(L / 0.5); u = np.linspace(0, L, n, endpoint=False)
    X = np.interp(u, s, np.append(pts[:, 0], pts[0, 0])); Z = np.interp(u, s, np.append(pts[:, 1], pts[0, 1]))
    sg = SMOOTH_M / 0.5; P = np.c_[gaussian_filter1d(X, sg, mode='wrap'), gaussian_filter1d(Z, sg, mode='wrap')]
    area = 0.5 * np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1])
    if area > 0: P = P[::-1].copy()              # anti-horaire vu de dessus (z vers le bas) : le sens réel de la course d'Abu Dhabi
    # ligne droite des stands : chaîne large de 200 à 450 m qui partage une extrémité avec la plus longue chaîne étroite (la voie des stands)
    narrow = [i for i, c in enumerate(chains) if c['hw'] < NARROW_HW]; pit = max(narrow, key=lambda i: chains[i]['L'])
    pe = {chains[pit]['a'], chains[pit]['b']}
    cand = [i for i in sel if 200 < chains[i]['L'] < 450 and ({chains[i]['a'], chains[i]['b']} & pe)]
    assert len(cand) == 1, 'ligne droite des stands ambiguë : %s' % cand
    st = chains[cand[0]]; shared = ({st['a'], st['b']} & pe).pop(); pp = [pos(p) for p in st['path']]
    if st['b'] != shared: pp = pp[::-1]
    pp = np.array(pp); sl = _arclen(pp)[:-1]; k = int(np.searchsorted(sl, START_FRAC * sl[-1])); start_xz = pp[min(k, len(pp) - 1)]
    i0 = int(np.hypot(P[:, 0] - start_xz[0], P[:, 1] - start_xz[1]).argmin())
    P = np.roll(P, -i0, axis=0); Ls = _arclen(P)[-1]
    h = P[5] - P[0]; hdg = math.atan2(h[1], h[0])
    info = dict(f=LAP_M / Ls, delta=-math.pi / 2 - hdg, x0=float(P[0, 0]), z0=float(P[0, 1]), lap_model=float(Ls),
                chains=len(chains), loop=[int(c) for c in sel], narrow=[int(i) for i in narrow], start_off=float(np.hypot(*(start_xz - P[0]))))
    if debug_png:
        im = Image.fromarray((mask * 80).astype(np.uint8)).convert('RGB'); d = ImageDraw.Draw(im)
        tp = lambda q: ((float(q[0]) - x0) * S, (float(q[1]) - z0) * S)
        d.line([tp(q) for q in P] + [tp(P[0])], fill=(255, 255, 0), width=3)
        a, b = tp(P[0]), tp(P[40]); d.ellipse([a[0] - 9, a[1] - 9, a[0] + 9, a[1] + 9], outline=(255, 0, 0), width=4); d.line([a, b], fill=(255, 0, 0), width=4)
        im.save(debug_png)
    return P, info

def tangents(C):
    d = np.roll(C, -1, axis=0) - np.roll(C, 1, axis=0)
    return d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-12)

def resample_closed(P, step=1.0):
    """rééchantillonne une boucle fermée au pas le plus proche de `step` ; renvoie (points (N,2), longueur)"""
    seg = _arclen(P); L = seg[-1]; N = int(round(L / step)); u = np.linspace(0, L, N, endpoint=False)
    return np.c_[np.interp(u, seg, np.append(P[:, 0], P[0, 0])), np.interp(u, seg, np.append(P[:, 1], P[0, 1]))], L
