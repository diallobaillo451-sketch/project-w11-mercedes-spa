"""Livrées des 20 pilotes 2020 (casque, combinaison, gants) peintes sur des COPIES des atlas du modèle driver_bell.
Méthode : rastérisation UV -> position 3D par texel (cache), motifs procéduraux en 3D (bandes, calottes, bandes centrales,
tricolores) avec antialiasing, textes de marques en police libre (approximations, aucun logo officiel copié).
Ombrage de la combinaison/gants : luminance de l'atlas d'origine (plis, coutures, AO cuite) conservée.
Usage : python3 tools/drivers_paint.py [id ...]   -> assets-work/drivers/<id>_{helmet,suit,gloves}.png"""
import numpy as np, json, os, sys
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates, distance_transform_edt, gaussian_filter
R = '/workspace/w11'; OUT = R + '/assets-work/drivers'
D = json.load(open(R + '/game/src/data/drivers2020.json'))
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def raster(npz, keys, W, H, cache):
    if os.path.exists(cache):
        z = np.load(cache); return z['PB'], z['NB'], z['ID']
    d = np.load(npz)
    PB = np.zeros((H, W, 3), np.float32); NB = np.zeros((H, W, 3), np.float32); ID = np.zeros((H, W), np.uint8)
    for key, idv in keys:
        P = d[key + '__P']; U = d[key + '__U']; N = d[key + '__N']
        for t in range(len(P)):
            uv = np.c_[U[t, :, 0] * W, -U[t, :, 1] * H]
            x0 = max(int(np.floor(uv[:, 0].min())) - 1, 0); x1 = min(int(np.ceil(uv[:, 0].max())) + 1, W - 1)
            y0 = max(int(np.floor(uv[:, 1].min())) - 1, 0); y1 = min(int(np.ceil(uv[:, 1].max())) + 1, H - 1)
            if x1 < x0 or y1 < y0: continue
            yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]; px = xx + 0.5; py = yy + 0.5
            (ax, ay), (bx, by), (cx, cy) = uv
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12: continue
            l0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den; l1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den; l2 = 1 - l0 - l1
            m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
            if not m.any(): continue
            p = l0[m, None] * P[t, 0] + l1[m, None] * P[t, 1] + l2[m, None] * P[t, 2]
            PB[yy[m], xx[m]] = p; NB[yy[m], xx[m]] = N[t]; ID[yy[m], xx[m]] = idv
    mask = ID > 0
    dist, (iy, ix) = distance_transform_edt(~mask, return_indices=True)
    grow = (dist <= 6) & ~mask
    PB[grow] = PB[iy[grow], ix[grow]]; NB[grow] = NB[iy[grow], ix[grow]]; ID[grow] = ID[iy[grow], ix[grow]]
    np.savez_compressed(cache, PB=PB, NB=NB, ID=ID); return PB, NB, ID

def hexc(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
AA = 0.0007
def cover(sd): return np.clip(0.5 - sd / AA, 0, 1)[:, None]   # sd < 0 dedans
def blend(col, c, a): col[:] = col * (1 - a) + hexc(c) * a if isinstance(c, str) else col * (1 - a) + c * a

def canvas(lines, wm, hm, ppm=4000):
    w = int(wm * ppm); h = int(hm * ppm); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); g = ImageDraw.Draw(im)
    for txt, cy, size, c in lines:
        sz = size
        while True:
            f = ImageFont.truetype(FB, max(6, int(sz * ppm))); bb = g.textbbox((0, 0), txt, font=f)
            if bb[2] - bb[0] <= w * 0.94 or sz < 0.003: break
            sz *= 0.92
        g.text(((w - (bb[2] - bb[0])) / 2 - bb[0], cy * ppm - (bb[3] - bb[1]) / 2 - bb[1]), txt, font=f, fill=tuple(int(v) for v in hexc(c)) + (255,))
    return np.asarray(im).astype(np.float32) / 255., ppm
def overlay(col, cv, ppm, u, v, wm, hm, ok):
    cx = (u + wm / 2) * ppm; cy = (hm / 2 - v) * ppm
    a = np.stack([map_coordinates(cv[..., c], [cy, cx], order=1, cval=0) for c in range(4)], 1)
    a[~ok, 3] = 0
    col[:] = col * (1 - a[:, 3:4]) + a[:, :3] * 255 * a[:, 3:4]

# ---------------- casque
HW, HH = 2048, 1024
SHELL = ['Helmet_Base_Helmet_Base_0', 'Helmet_Wing_Helmet_Base_0', 'Helmet_Wing_001_001_Helmet_Base_0']
STRIP = ['VISOR_Sticker01_Helmet_Visor_Strip_0', 'VISOR_Sticker02_Helmet_Visor_Strip_0']
def helmet(dr):
    PB, NB, ID = raster(R + '/assets-work/helmet_tris.npz', [(k, 1) for k in SHELL] + [(k, 2) for k in STRIP], HW, HH, R + '/assets-work/helmet_raster.npz')
    atlas = np.asarray(Image.open(R + '/assets-work/helmet_atlas_orig.png').convert('RGBA')).copy()
    sel = ID > 0; p = PB[sel]; n = NB[sel]; shell = ID[sel] == 1; strip = ID[sel] == 2
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    H = dr['helmet']; col = np.tile(hexc(H['base']), (len(p), 1))
    for L in H['layers']:
        k = L[0]
        if k == 'top': sd = (L[2] + L[3] * np.sin(y * 38) + 0.06 * np.clip(0.02 - y, 0, None)) - z
        elif k == 'bot': sd = z - (L[2] + L[3] * np.sin(y * 31 + 1.2))
        elif k == 'band':
            c = L[2] + L[3] * (y - 0.06); sd = np.abs(z - c) - L[4]
            if len(L) > 5: blend(col, L[5], cover(sd - L[6]) * shell[:, None])
        elif k == 'cstripe': sd = np.maximum(np.abs(x) - L[2], L[3] - z)
        elif k == 'tri':
            w = L[2]
            for i, cc in enumerate(L[1]):
                sdi = np.maximum(np.abs(x - (i - 1) * 2 * w) - w, L[3] - z); blend(col, cc, cover(sdi) * shell[:, None])
            continue
        blend(col, L[1], cover(sd) * shell[:, None])
    # filet fin sous la calotte (finition vernie, liseré clair)
    col[strip] = hexc(H['strip'][0])
    cvp, ppm = canvas([(H['strip'][1], 0.0175, 0.019, H['strip'][2])], 0.16, 0.035)
    overlay(col, cvp, ppm, -x, z - 1.376, 0.16, 0.035, strip & (np.abs(x) < 0.064))
    cvn, ppm = canvas([(dr['last'].upper(), 0.0175, 0.0135, H['strip'][2])], 0.075, 0.035)
    u = np.where(x > 0, y - 0.172, -(y - 0.172))
    overlay(col, cvn, ppm, u, z - 1.376, 0.075, 0.035, strip & (np.abs(x) > 0.065))
    # numéro à l'arrière + nom sur les côtés (bas de coque)
    base = hexc(H['base']); nc = H.get('numc', '#ffffff')
    cv4, ppm = canvas([(str(dr['num']), 0.02, 0.03, nc)], 0.08, 0.04)
    overlay(col, cv4, ppm, x, z - 1.36, 0.08, 0.04, shell & (n[:, 1] < -0.6) & (z > 1.30) & (z < 1.42))
    # drapeau (3 bandes) sur la nuque
    fl = dr['flag']; fx = 0.022
    ok = shell & (n[:, 1] < -0.25) & (y < 0.0) & (np.abs(x) < fx * 1.5) & (z > 1.425) & (z < 1.447)
    for i, cc in enumerate(fl):
        m = ok & (np.abs(x - (i - 1) * fx) <= fx / 2); col[m] = hexc(cc)
    out = atlas.copy(); out[sel, :3] = np.clip(col, 0, 255).astype(np.uint8); out[sel, 3] = 255
    return Image.fromarray(out)

# ---------------- combinaison / gants
SUIT = {
  'ferrari':     [('collar', 'c2'), ('cuff', 'c2'), ('pipe', 'c3')],
  'redbull':     [('side', 'c2'), ('legside', 'c2'), ('pipe', 'c3')],
  'mclaren':     [('legs', 'c3'), ('side', 'c2'), ('pipe', 'c2')],
  'renault':     [('side', 'c2'), ('legside', 'c2'), ('shoulder', 'c2')],
  'alphatauri':  [('upper', 'c2'), ('pipe', 'c3')],
  'racingpoint': [('legs', 'c2'), ('side', 'c2'), ('pipe', 'c3')],
  'alfaromeo':   [('legs', 'c2'), ('side', 'c2'), ('collar', 'c2')],
  'haas':        [('side', 'c2'), ('legside', 'c2'), ('collar', 'c2')],
  'williams':    [('side', 'c2'), ('legside', 'c2'), ('pipe', 'c3')],
}
SW, SH_ = 2048, 2048
def suit(dr, T):
    PB, NB, ID = raster(R + '/assets-work/suit_tris.npz', [('Image_20__DRIVER_SUIT_Driver_Suit_0', 1)], SW, SH_, R + '/assets-work/suit_raster.npz')
    org = np.asarray(Image.open(R + '/assets-work/drv_Image_20.png').convert('RGB')).astype(np.float32) / 255
    Lm = org @ [0.299, 0.587, 0.114]
    sel = (ID > 0) & (Lm > 0.22); p = PB[sel]; n = NB[sel]; x, y, z = p[:, 0], p[:, 1], p[:, 2]
    shade = np.clip(Lm[sel] / 0.80, 0.12, 1.06)[:, None] ** 1.1
    c = {k: T[k] for k in ('c1', 'c2', 'c3')}
    col = np.tile(hexc(c['c1']), (len(p), 1))
    legs = (y > 0.30) & (z < 0.86); torso = (y <= 0.32) & (z > 0.70)
    for kind, ck in SUIT[dr['team']]:
        if kind == 'legs': sd = np.where(legs, -1.0, 1.0) * 0.01
        elif kind == 'upper': sd = 1.02 - z + np.where(legs, 1, 0)
        elif kind == 'side': sd = np.where(torso & (z < 1.18) & (y < 0.16) & (np.abs(x) < 0.215), 0.13 - np.abs(x), 1)
        elif kind == 'legside': sd = np.where(legs, 0.155 - np.abs(x), 1)
        elif kind == 'collar': sd = 1.215 - z
        elif kind == 'cuff': sd = np.where((y > 0.38) & (z > 0.9), 0, 1) - 0.5
        elif kind == 'shoulder': sd = np.where(torso, 1.17 - z + 0.15 * (0.2 - np.abs(x)).clip(0), 1)
        elif kind == 'pipe': sd = np.where(torso & (z < 1.18) & (y < 0.16) & (np.abs(x) < 0.215), np.abs(np.abs(x) - 0.13) - 0.004, 1)
        blend(col, c[ck], cover(sd))
    col *= shade
    # textes : poitrine (projection de face), ceinture, dos
    front = (n[:, 1] > 0.35) & torso & (np.abs(x) < 0.16)
    tc = '#ffffff' if hexc(c['c1']).mean() < 150 else '#111111'
    cv, ppm = canvas([(T['chest'], 0.016, 0.022, tc), (T['chest2'], 0.046, 0.013, tc)], 0.24, 0.06)
    overlay(col, cv, ppm, -x, z - 1.08, 0.24, 0.06, front)
    cv, ppm = canvas([(dr['last'].upper() + '  ' + str(dr['num']), 0.009, 0.011, tc)], 0.22, 0.018)
    overlay(col, cv, ppm, -x, z - 0.905, 0.22, 0.018, front | ((n[:, 1] > 0.2) & (np.abs(x) < 0.16) & (z > 0.86) & (z < 0.95)))
    back = (n[:, 1] < -0.4) & (z > 0.9) & (np.abs(x) < 0.18)
    cv, ppm = canvas([(T['chest'], 0.02, 0.028, tc)], 0.28, 0.04)
    overlay(col, cv, ppm, x, z - 1.10, 0.28, 0.04, back)
    out = (org * 255).copy(); out[sel] = np.clip(col, 0, 255)
    return Image.fromarray(out.astype(np.uint8))
def gloves(dr, T):
    org = np.asarray(Image.open(R + '/assets-work/drv_Image_18.png').convert('RGB')).astype(np.float32) / 255
    L = org @ [0.299, 0.587, 0.114]; m = L > 0.22
    sh = np.clip(L / 0.8, 0.12, 1.06)[..., None] ** 1.1
    hh, ww = L.shape; yy, xx = np.mgrid[0:hh, 0:ww]
    a = np.where(((xx // 64 + yy // 64) % 7 == 0), 1.0, 0.0)  # pas de motif : couleur 2 sur le dos de main seulement si demandé
    c1, c2 = hexc(T['c1']), hexc(T['c2'])
    col = np.where(m[..., None], c1 * sh, org * 255)
    return Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))

ids = sys.argv[1:] or [d['id'] for d in D['drivers']]
os.makedirs(OUT, exist_ok=True)
for dr in D['drivers']:
    if dr['id'] not in ids or dr.get('original'): continue
    T = D['teams'][dr['team']]
    helmet(dr).save(f"{OUT}/{dr['id']}_helmet.png")
    if dr['team'] != 'mercedes':
        suit(dr, T).save(f"{OUT}/{dr['id']}_suit.png"); gloves(dr, T).save(f"{OUT}/{dr['id']}_gloves.png")
    print('ok', dr['id'])
