# -*- coding: utf-8 -*-
"""Luminosité de captures d'écran, en texte : la CI ne montre pas les images, ceci permet de juger l'exposition d'une scène de nuit
(ni noire, ni brûlée) à la lecture du journal.

    python3 source/marina/shotstats.py <dossier> <préfixe>…

Pour chaque PNG du dossier dont le nom commence par un des préfixes : luminance moyenne (sRGB codé, 0-255), percentiles 1 / 50 / 99,
part de pixels écrasés (< 6) et brûlés (> 250), moyenne du tiers haut (ciel) et du tiers bas (piste), puis une vignette ASCII
(échelle réhaussée : v^0,6, pour voir les formes dans le sombre).
"""
import os, sys
import numpy as np
from PIL import Image

RAMP = ' .:-=+*#%@'
LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def thumb(y, rows=12, cols=52):
    H, W = y.shape
    r = np.linspace(0, H, rows + 1).astype(int); c = np.linspace(0, W, cols + 1).astype(int)
    out = []
    for i in range(rows):
        line = ''
        for j in range(cols):
            v = float(y[r[i]:r[i + 1], c[j]:c[j + 1]].mean()) / 255.0
            line += RAMP[min(len(RAMP) - 1, int((max(v, 0.0) ** 0.6) * len(RAMP)))]
        out.append(line)
    return out


def stats(path):
    im = np.asarray(Image.open(path).convert('RGB'), np.float32)
    y = im @ LUM
    H = y.shape[0]
    p = np.percentile(y, [1, 50, 99])
    return dict(mean=float(y.mean()), p1=float(p[0]), p50=float(p[1]), p99=float(p[2]), black=float((y < 6).mean() * 100),
                white=float((y > 250).mean() * 100), top=float(y[:H // 3].mean()), bot=float(y[2 * H // 3:].mean()),
                size='%dx%d' % (im.shape[1], im.shape[0])), y


def main():
    d = sys.argv[1]; pre = sys.argv[2:]
    names = sorted(n for n in os.listdir(d) if n.lower().endswith('.png') and (not pre or any(n.startswith(p) for p in pre)))
    if not names:
        print('aucune capture dans %s pour %s' % (d, pre)); return
    for n in names:
        s, y = stats(os.path.join(d, n))
        print('%s (%s) : moyenne %.1f · p1/p50/p99 %.0f/%.0f/%.0f · écrasé %.1f %% · brûlé %.2f %% · haut %.1f · bas %.1f'
              % (n, s['size'], s['mean'], s['p1'], s['p50'], s['p99'], s['black'], s['white'], s['top'], s['bot']))
        for line in thumb(y):
            print('   |' + line + '|')


if __name__ == '__main__':
    main()
