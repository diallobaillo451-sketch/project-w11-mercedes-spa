# Chemin praticable de la voie des stands (entrée Arrêt de Bus → stands → sortie après La Source) sur le raster réel :
# libre = asphalte route|stands hors barrières, érodé de la demi-largeur de la voiture. Sortie : game/public/track/pitlane.json
import numpy as np, json, heapq, cv2
R = '/workspace/w11'; z = np.load(R + '/assets-work/coll/raster.npz'); m = json.load(open(R + '/game/public/track/surface.json'))
x0, z0, PX = float(z['x0']), float(z['z0']), float(z['PX'])
cx, cz, cy = np.array(m['cx']), np.array(m['cz']), np.array(m['cy']); N = len(cx)
tx = np.roll(cx, -2) - np.roll(cx, 2); tz = np.roll(cz, -2) - np.roll(cz, 2); n = np.hypot(tx, tz); tx /= n; tz /= n
def W(s, d): i = int(s) % N; return cx[i] - tz[i] * d, cz[i] + tx[i] * d
F = 2  # 0,4 m
road = (z['road'] > 0) | (z['pit'] > 0); bar = z['bar'] > 0; soft = (z['soft'] > 0) & ~road
# zone utile : boîte autour des points de passage
pts = [W(6560, 3), W(6900, 20), W(100, 20), W(400, 25), W(700, 0), W(950, 0)]
xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
c0 = int((min(xs) - 80 - x0) / PX); c1 = int((max(xs) + 80 - x0) / PX); r0 = int((min(zs) - 80 - z0) / PX); r1 = int((max(zs) + 80 - z0) / PX)
c0, r0 = max(0, c0), max(0, r0)
free = (road[r0:r1, c0:c1] | soft[r0:r1, c0:c1]) & ~bar[r0:r1, c0:c1]
softc = cv2.resize(soft[r0:r1, c0:c1].astype(np.uint8), (free.shape[1] // F, free.shape[0] // F), interpolation=cv2.INTER_NEAREST) > 0
free = cv2.resize(free.astype(np.uint8), (free.shape[1] // F, free.shape[0] // F), interpolation=cv2.INTER_NEAREST)
dist = cv2.distanceTransform(free, cv2.DIST_L2, 5) * PX * F
import os
CLR = float(os.environ.get("CLR", "1.05")); ok = dist > CLR
cost = np.where(ok, (1 + 3.0 / np.maximum(dist, 0.5)) * np.where(softc, 4.0, 1.0), np.inf)  # herbe/gravier possible mais pénalisé
H, Wd = ok.shape
def cell(p): return int((p[1] - z0) / PX - r0) // F, int((p[0] - x0) / PX - c0) // F
def snap(rc):
    r, c = rc; best = None
    for rr in range(r - 15, r + 16):
        for cc in range(c - 15, c + 16):
            if 0 <= rr < H and 0 <= cc < Wd and ok[rr, cc]:
                d = (rr - r) ** 2 + (cc - c) ** 2
                if best is None or d < best[0]: best = (d, rr, cc)
    return best[1], best[2]
def astar(a, b):
    g = {a: 0}; came = {}; q = [(0, a)]; nb = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 1.414), (1, 1, 1.414), (-1, 1, 1.414), (1, -1, 1.414)]
    while q:
        _, u = heapq.heappop(q)
        if u == b: break
        for dr, dc, w in nb:
            v = (u[0] + dr, u[1] + dc)
            if not (0 <= v[0] < H and 0 <= v[1] < Wd) or not ok[v]: continue
            ng = g[u] + w * cost[v]
            if ng < g.get(v, 1e18): g[v] = ng; came[v] = u; heapq.heappush(q, (ng + np.hypot(v[0] - b[0], v[1] - b[1]), v))
    if b not in came: return None
    p = [b]
    while p[-1] != a: p.append(came[p[-1]])
    return p[::-1]
def WP(p):
    a = p.split(":")
    if a[0] == "g": r, c = int(a[1]), int(a[2]); return ((c * F + F / 2 + c0) * PX + x0, (r * F + F / 2 + r0) * PX + z0)
    return (float(a[1]), float(a[2])) if a[0] == "w" else W(float(a[0]), float(a[1]))
way = [WP(p) for p in os.environ.get("WAY", "6560:3 100:20 g:200:72 g:110:110 450:9 650:12 950:0").split()]
cells = [snap(cell(p)) for p in way]
if os.environ.get('DUMP'):
    img = np.zeros(ok.shape + (3,), np.uint8); img[ok] = (0, 160, 0); img[free.astype(bool) & ~ok] = (0, 90, 160); img[~free.astype(bool)] = (60, 0, 0)
    for cc_ in cells: cv2.circle(img, (cc_[1], cc_[0]), 5, (255, 0, 255), -1)
    cv2.imwrite('/tmp/free.png', img)
path = []
for a, b in zip(cells, cells[1:]):
    seg = astar(a, b); print("segment", a, b, "OK" if seg else "BLOQUÉ", len(seg or []))
    if not seg:
        reach = np.zeros_like(ok); import collections
        q = collections.deque([a]); reach[a] = 1
        while q:
            u = q.popleft()
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                v = (u[0]+dr, u[1]+dc)
                if 0 <= v[0] < H and 0 <= v[1] < Wd and ok[v] and not reach[v]: reach[v] = 1; q.append(v)
        img = np.zeros(ok.shape + (3,), np.uint8); img[ok] = (80, 80, 80); img[reach > 0] = (0, 160, 0); img[~free.astype(bool)] = (0, 0, 120)
        cv2.circle(img, (a[1], a[0]), 6, (255, 0, 255), -1); cv2.circle(img, (b[1], b[0]), 6, (255, 255, 0), -1); cv2.imwrite("/tmp/pit_block.png", img)
    if not seg: raise SystemExit(1)
    path += seg if not path else seg[1:]
P = np.array([((c * F + F / 2 + c0) * PX + x0, (r * F + F / 2 + r0) * PX + z0) for r, c in path])
# lissage + rééchantillonnage tous les 2 m, (s, d) de chaque point
k = np.ones(15) / 15; Ps = np.c_[np.convolve(np.pad(P[:, 0], 7, 'edge'), k, 'valid'), np.convolve(np.pad(P[:, 1], 7, 'edge'), k, 'valid')]
L = np.r_[0, np.cumsum(np.hypot(*np.diff(Ps, axis=0).T))]; t = np.arange(0, L[-1], 2.0)
Q = np.c_[np.interp(t, L, Ps[:, 0]), np.interp(t, L, Ps[:, 1])]
from scipy.spatial import cKDTree
_, I = cKDTree(np.c_[cx, cz]).query(Q)
D = (Q[:, 0] - cx[I]) * (-tz[I]) + (Q[:, 1] - cz[I]) * tx[I]
# limite de vitesse : entre les deux lignes blanches (approx. : quand le chemin s'écarte de > 9,5 m de la ligne centrale)
json.dump({'note': 'chemin praticable voie des stands (A* sur la géométrie réelle, barrières incluses)', 'x': Q[:, 0].round(2).tolist(), 'z': Q[:, 1].round(2).tolist(), 's': I.tolist(), 'd': D.round(2).tolist(), 'length': float(L[-1])}, open(R + '/game/public/track/pitlane.json', 'w'))
print('longueur', round(L[-1]), 'm ; d max', D.max().round(1))
for j in range(0, len(Q), 20): print(int(I[j]), round(D[j], 1), end=' | ')
