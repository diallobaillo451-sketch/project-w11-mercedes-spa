# -*- coding: utf-8 -*-
"""Ciel de nuit de Marina Bay : sky.json + sky_4k.webp + sky_2k.webp au format de source/game/src/render/skydome.ts.

Base : un vrai ciel nocturne HDRI libre de droits (Poly Haven « Moonless Golf », CC0, exemple de three.js : Voie lactée et dégradé de pollution
lumineuse), dont on garde l'hémisphère supérieur ; la ligne d'horizon (arbres, lampes du golf) est remplacée par le halo de la ville.
Étoiles nettes ajoutées en 4096 px (le HDRI ne fait que 1024 px). Sans fichier HDRI (hors ligne) : ciel entièrement procédural.
Encodage (comme tools/make_sky.py) : e = x/(1+x), x = L/scale ; le jeu décode L = e/(1-e)·scale·intensité. La lune est le disque analytique du
dôme (même direction que la lumière directionnelle du jeu).
"""
import json, math, os
import numpy as np
import cv2
from PIL import Image

W_OUT = 4096                       # largeur de l'équirectangulaire ; hauteur complète = W/2 ; on garde l'hémisphère haut + 6° sous l'horizon
H_FULL = W_OUT // 2
ROWS = int(H_FULL / 2 + H_FULL * 6 / 180)      # 1092
SCALE = 0.02                       # radiance maximale décodable ≈ 0,996/0,004 × SCALE ≈ 5
K_HDR = 0.08                       # HDRI (unités brutes) → radiance de nuit
MOON_ELEV = 55.0                   # élévation de la lune (= de la lumière directionnelle), degrés
MOON_U = 0.30


def read_hdr(path):
    im = cv2.imread(path, cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR)
    if im is None:
        raise ValueError('HDRI illisible : ' + path)
    return im[..., ::-1].astype(np.float32)


def elev_of_rows(n):
    return 90.0 - (np.arange(n) + 0.5) / H_FULL * 180.0


def procedural_base(rng):
    """ciel de nuit sans photo : dégradé bleu nuit, bande de Voie lactée floue (hémisphère haut), unités du HDRI brut"""
    H, W = 273, 1024
    el = 90 - (np.arange(H) + 0.5) / 512 * 180
    u = (np.arange(W) + 0.5) / W
    E, U = np.meshgrid(el, u, indexing='ij')
    L = 0.05 + 0.12 * np.exp(-np.maximum(E, 0) / 25.0)
    band = np.exp(-((E - 35 * np.sin(2 * np.pi * U * 1.0 + 0.8)) / 14.0) ** 2)
    L = L + 0.05 * band * (0.6 + 0.4 * rng.random((H, W)))
    rgb = np.stack([L * 0.78, L * 0.9, L * 1.25], -1).astype(np.float32)
    return rgb


def wrap_blur(a, sigma):
    """flou gaussien le long de l'azimut (axe 0), bouclé"""
    n = len(a)
    w = np.concatenate([a, a, a])
    w = cv2.GaussianBlur(w.reshape(len(w), 1, -1).astype(np.float32), (1, 0), sigmaX=0.01, sigmaY=sigma).reshape(len(w), -1)
    return w[n:2 * n]


def horizon_glow(base, el_rows, rng):
    """remplace les rangées basses (arbres jusqu'à ~14°, lampes du golf) par le halo de la ville : on prolonge le ciel propre
    (16-20°) vers l'horizon en gardant la variation d'azimut du HDRI, teinte chaude près de l'horizon"""
    H, W, _ = base.shape
    sel = (el_rows >= 16.5) & (el_rows <= 20.0)
    anchor = wrap_blur(base[sel].mean(0), W * 0.02)                      # (W, 3)
    g = np.maximum(el_rows, 0.0)
    f = np.exp((18.0 - g) / 10.0)                                        # ×6 à l'horizon
    syn = anchor[None, :, :] * f[:, None, None]
    lumv = np.array([0.2126, 0.7152, 0.0722], np.float32)
    warm = np.array([1.0, 0.74, 0.46], np.float32)
    w = np.exp(-g / 9.0)[:, None, None]
    lum = (syn @ lumv)[..., None]
    syn = syn * (1 - 0.6 * w) + lum * warm[None, None, :] / float(warm @ lumv) * 0.6 * w
    syn = syn * np.where(el_rows < 0, np.clip(1 + el_rows / 10.0, 0.3, 1.0), 1.0)[:, None, None]
    t = np.clip((el_rows - 17.0) / 6.0, 0, 1)[:, None, None]
    t = t * t * (3 - 2 * t)
    return syn * (1 - t) + base * t


def add_stars(L, rng, el_rows):
    """étoiles nettes (PSF gaussienne ~0,8 px), couleur selon la température, éteintes vers l'horizon et par le halo de la ville"""
    H, W, _ = L.shape
    n = 9000
    el = np.degrees(np.arcsin(rng.random(n)))                            # uniforme en angle solide sur l'hémisphère haut
    az = rng.random(n)
    mag = np.clip(5.6 + np.log10(rng.random(n) + 1e-9) / 0.45, -1.0, 5.6)
    flux = 10 ** (-0.4 * mag)                                           # 1 pour la magnitude 0
    vis = np.clip((el - 2.0) / 28.0, 0, 1) ** 1.2
    # limite de visibilité : la pollution lumineuse masque les étoiles faibles (magnitude limite 3,6 au zénith → 1,5 près de l'horizon)
    mag_lim = 1.5 + 2.1 * vis
    keep = (mag < mag_lim) & (el > 1.0)
    el, az, flux, mag = el[keep], az[keep], flux[keep], mag[keep]
    temp = rng.random(len(el))
    col = np.stack([0.75 + 0.25 * temp, 0.85 + 0.0 * temp, 1.0 - 0.35 * temp], 1).astype(np.float32)
    rows = (90 - el) / 180 * H_FULL; cols = az * W
    amp = flux * 2.0                                                     # radiance de crête (unités finales, avant échelle)
    out = L.copy()
    sig = 0.8
    for r0, c0, a, cl, m, e0 in zip(rows, cols, amp, col, mag, el):
        if r0 >= H - 2:
            continue
        stretch = 1.0 / max(math.cos(math.radians(e0)), 0.18)           # étirement équirectangulaire près du zénith
        sx = sig * stretch
        rad = int(min(10, math.ceil(3 * sx)))
        r_i, c_i = int(r0), int(c0)
        rr = np.arange(max(0, r_i - 3), min(H, r_i + 4)); cc = np.arange(c_i - rad, c_i + rad + 1)
        g = np.exp(-(((rr[:, None] + 0.5 - r0) / sig) ** 2 + ((cc[None, :] + 0.5 - c0) / sx) ** 2) / 2)
        cwrap = cc % W
        out[rr[:, None], cwrap[None, :], :] += (a * g)[:, :, None] * cl[None, None, :]
        if m < 1.6:                                                      # halo des plus brillantes
            rr2 = np.arange(max(0, r_i - 6), min(H, r_i + 7)); rad2 = int(min(16, math.ceil(6 * stretch)))
            cc2 = np.arange(c_i - rad2, c_i + rad2 + 1)
            g2 = np.exp(-(((rr2[:, None] + 0.5 - r0) / 2.2) ** 2 + ((cc2[None, :] + 0.5 - c0) / (2.2 * stretch)) ** 2) / 2)
            out[rr2[:, None], (cc2 % W)[None, :], :] += (a * 0.10 * g2)[:, :, None] * cl[None, None, :]
    return out


def build_sky(outdir, hdr_path=None, log=print, seed=11, preview=None):
    rng = np.random.default_rng(seed)
    os.makedirs(outdir, exist_ok=True)
    src = 'procédural'
    base = None
    if hdr_path and os.path.isfile(hdr_path):
        try:
            hdr = read_hdr(hdr_path)
            Hh, Wh, _ = hdr.shape
            rows = int(Hh / 2 + Hh * 6 / 180)
            crop = hdr[:rows]
            base = crop; src = 'Poly Haven moonless_golf (CC0) + étoiles procédurales'
            log('HDRI de nuit lu : %dx%d' % (Wh, Hh))
        except Exception as e:                                           # noqa: BLE001
            log('HDRI illisible (%s) : ciel procédural' % e)
    if base is None:
        base = procedural_base(rng)
    # ramener la base à la grille de sortie (4096 × ROWS) : agrandissement bicubique, lampes écrêtées
    base = np.minimum(base, 1.5)
    L = cv2.resize(base, (W_OUT, ROWS), interpolation=cv2.INTER_CUBIC)
    L = np.maximum(L, 0)
    L = cv2.GaussianBlur(L, (0, 0), sigmaX=1.2)
    el_rows = elev_of_rows(ROWS)
    L = horizon_glow(L, el_rows, rng)
    L = L * K_HDR
    L = add_stars(L, rng, el_rows)
    # encodage
    x = np.clip(L / SCALE, 0, None)
    e = x / (1 + x)
    dither = (rng.random(e.shape) - 0.5) / 255.0                         # évite les bandes dans le dégradé sombre
    e8 = np.clip(np.rint((e + dither) * 255), 0, 255).astype(np.uint8)
    Image.fromarray(e8, 'RGB').save(os.path.join(outdir, 'sky_4k.webp'), 'WEBP', quality=96, method=6)
    e2 = cv2.resize(e8, (W_OUT // 2, ROWS // 2), interpolation=cv2.INTER_AREA)
    Image.fromarray(e2, 'RGB').save(os.path.join(outdir, 'sky_2k.webp'), 'WEBP', quality=95, method=6)
    # méta : horizon = radiance moyenne juste au-dessus de l'horizon (couleur du brouillard) ; lune = direction de la lumière directionnelle
    h0 = np.argmin(np.abs(el_rows - 0.0))
    hz = (np.clip(L[h0 - 22:h0], 0, None)).reshape(-1, 3).mean(0)
    meta = dict(scale=SCALE, encode='x/(1+x), L=S*x', vMax=ROWS / H_FULL,
                sun=dict(u=MOON_U, v=(90 - MOON_ELEV) / 180, elev=MOON_ELEV),
                horizon=[round(float(v), 5) for v in hz], src=src)
    with open(os.path.join(outdir, 'sky.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    log('ciel : %s, horizon %s, %s' % (src, meta['horizon'], ', '.join('%s %.0f Ko' % (n, os.path.getsize(os.path.join(outdir, n)) / 1024) for n in ('sky_4k.webp', 'sky_2k.webp'))))
    if preview:
        d = e / (1 - np.minimum(e, 0.996)) * SCALE
        v = np.clip(d * 0.85 * 6.0, 0, 1) ** (1 / 2.2)
        cv2.imwrite(preview, (v[..., ::-1] * 255).astype(np.uint8))
    return meta


if __name__ == '__main__':
    import sys
    build_sky(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None, preview=sys.argv[3] if len(sys.argv) > 3 else None)
