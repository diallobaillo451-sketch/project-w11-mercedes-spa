# Carte ASCII (s, d) de la voie des stands : types de la grille physique + barrières réelles ('#')
import json, struct, numpy as np, sys
from scipy.spatial import cKDTree
m = json.load(open('game/public/track/surface.json'))
N, ND, D0, DS = m['N'], m['ND'], m['D0'], m['DSTEP']
g = np.fromfile('game/public/track/surface.bin', dtype=np.uint16).reshape(N, ND)
T = g & 7
cx, cz = np.array(m['cx']), np.array(m['cz'])
tx = np.roll(cx, -1) - np.roll(cx, 1); tz = np.roll(cz, -1) - np.roll(cz, 1); n = np.hypot(tx, tz); tx /= n; tz /= n
b = open('game/public/track/barriers.bin', 'rb').read()
nSeg, nCell, x0, z0, C, gw, gh = struct.unpack('<IIfffII', b[:28])
S = np.frombuffer(b, np.float32, nSeg * 4, 28).reshape(-1, 4)
K = np.frombuffer(b, np.uint8, nSeg, 28 + nSeg * 16)
tree = cKDTree(np.c_[cx, cz])
pts = []; kinds = []
for (x1, z1, x2, z2), k in zip(S, K):
    L = np.hypot(x2 - x1, z2 - z1); nn = max(2, int(L / 0.25) + 1)
    t = np.linspace(0, 1, nn); pts.append(np.c_[x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]); kinds.append(np.full(nn, k))
P = np.vstack(pts); KK = np.concatenate(kinds)
_, I = tree.query(P)
d = (P[:, 0] - cx[I]) * (-tz[I]) + (P[:, 1] - cz[I]) * tx[I]
bar = {}
for i, dd, k in zip(I, d, KK):
    j = int(round((dd - D0) / 1.0))
    bar[(int(i), int(round(dd)))] = k
ch = {0: ' ', 1: '.', 2: 'k', 3: 'p', 4: ',', 5: ':', 6: '~', 7: 'O'}
step = int(sys.argv[3]) if len(sys.argv) > 3 else 10
a0, a1 = int(sys.argv[1]), int(sys.argv[2])
rng = list(range(a0, a1, step)) if a0 < a1 else list(range(a0, N, step)) + list(range(0, a1, step))
print('d:   ' + ''.join(('|' if dd % 10 == 0 else ' ') for dd in range(-15, 46)))
for i in rng:
    row = ''
    for dd in range(-15, 46):
        hit = any((i2, dd) in bar for i2 in range(i - step // 2, i + step // 2 + 1))
        row += '#' if hit else ch[int(T[i, int((dd - D0) / DS)])]
    print(f'{i:5d} {row}')
