#!/usr/bin/env python3
"""Port of source/tools/make_sky.py without OpenCV: Radiance HDR → encoded webp sky (upper hemisphere)."""
from __future__ import annotations
import argparse, json, math, os, struct, subprocess
from pathlib import Path
import numpy as np
from PIL import Image

def read_hdr(path: Path) -> np.ndarray:
    """Read a Radiance RGBE .hdr into float32 RGB (H,W,3)."""
    with path.open('rb') as f:
        # header
        line = f.readline()
        if not line.startswith(b'#?RADIANCE') and not line.startswith(b'#?RGBE'):
            # some files start with # Written or FORMAT
            f.seek(0)
        else:
            pass
        fmt = None
        while True:
            line = f.readline()
            if not line:
                raise ValueError('bad hdr header')
            line = line.strip()
            if line == b'':
                break
            if line.startswith(b'FORMAT='):
                fmt = line.split(b'=',1)[1]
        # resolution
        res = f.readline().strip().split()
        # typically -Y height +X width
        if len(res) != 4:
            raise ValueError(f'bad resolution line {res}')
        h = int(res[1]); w = int(res[3])
        if res[0] not in (b'-Y', b'+Y') or res[2] not in (b'+X', b'-X'):
            # still try
            pass
        # Radiance "-Y H +X W" is already top-to-bottom (row 0 = zenith in lat-long).
        # Only flip when the file is stored bottom-up (+Y) or right-to-left (-X).
        flip_y = res[0] == b'+Y'
        flip_x = res[2] == b'-X'
        img = np.zeros((h, w, 4), np.uint8)
        for y in range(h):
            prefix = f.read(4)
            if len(prefix) < 4:
                raise ValueError('truncated')
            if prefix[0] == 2 and prefix[1] == 2 and (prefix[2] << 8 | prefix[3]) == w:
                # new RLE
                row = np.empty((4, w), np.uint8)
                for ch in range(4):
                    x = 0
                    while x < w:
                        c = f.read(1)
                        if not c: raise ValueError('truncated rle')
                        n = c[0]
                        if n > 128:
                            val = f.read(1)
                            count = n - 128
                            row[ch, x:x+count] = val[0]
                            x += count
                        else:
                            vals = f.read(n)
                            row[ch, x:x+n] = np.frombuffer(vals, np.uint8)
                            x += n
                img[y] = row.T
            else:
                # old uncompressed / old rle — fallback scan
                # put prefix back
                data = prefix + f.read(w*4 - 4)
                if len(data) < w*4:
                    raise ValueError('truncated old scan')
                img[y] = np.frombuffer(data, np.uint8).reshape(w, 4)
        if flip_y:
            img = img[::-1]
        if flip_x:
            img = img[:, ::-1]
    # RGBE → float
    e = img[:,:,3].astype(np.int32)
    rgb = img[:,:,:3].astype(np.float32)
    out = np.zeros((h,w,3), np.float32)
    mask = e > 0
    # f = 2^(e-128-8)
    scale = np.ldexp(1.0, e[mask] - 128 - 8).astype(np.float32)
    out[mask] = rgb[mask] * scale[:, None]
    return out


def process(im: np.ndarray, scale=0.35, sun_clip=True):
    """Upper hemisphere (+6° below horizon), remove sun disk, encode x/(1+x)."""
    H, W, _ = im.shape
    L = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sy, sx = np.unravel_index(int(L.argmax()), L.shape)
    if sun_clip and L.max() > 20:
        m = L > L.max() * 0.02
        y0, y1 = max(0, sy-60), min(H, sy+60)
        x0, x1 = max(0, sx-60), min(W, sx+60)
        ys, xs = np.nonzero(m[y0:y1, x0:x1])
        if len(ys):
            sy = float(ys.mean() + y0); sx = float(xs.mean() + x0)
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.hypot(yy-sy, xx-sx)
        disc = r < 14; ring = (r >= 14) & (r < 20)
        if ring.any():
            for c in range(3):
                im[..., c][disc] = np.median(im[..., c][ring])
    u = (sx + 0.5) / W; v = (sy + 0.5) / H
    rows = int(H/2 + H*6/180)
    crop = im[:rows] if True else im  # Radiance after flip_y: typically +Z up is top?
    # After flip_y for -Y, row 0 is the top of the image, which for latlong is +Y / zenith in some conventions.
    # Poly Haven lat-long: row 0 = +Y (zenith). We already flipped if -Y so row 0 is zenith. Good.
    x = np.clip(crop / scale, 0, None)
    e = x / (1 + x)
    meta = dict(scale=scale, encode='x/(1+x), L=S*x', vMax=rows/H,
                sun=dict(u=float(u), v=float(v), elev=float(90-v*180)),
                horizon=crop[int(H/2)-30:int(H/2)].reshape(-1,3).mean(0).round(4).tolist())
    return e, meta


def save_webp(e: np.ndarray, out_prefix: Path, widths=(4096, 2048)):
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    H, W, _ = e.shape
    paths = {}
    # Prefer sharp 16-bit path (same as make_sky.py) when node+sharp are available.
    has_sharp = Path('/workspace/project-w11-mercedes-spa/source/game/node_modules/sharp').exists()
    for name, w in (('4k', widths[0]), ('2k', widths[1])):
        h = round(H * w / W)
        dest = out_prefix.parent / f'{out_prefix.name}_{name}.webp'
        if has_sharp:
            # 16-bit PNG then sharp webp
            # PIL cannot easily resize 16-bit RGB; resize in float then pack
            resized = np.array(
                Image.fromarray((np.clip(e, 0, 1) * 255).astype(np.uint8), 'RGB').resize((w, h), Image.Resampling.LANCZOS)
            ).astype(np.float32) / 255.0
            # Reconstruct 16-bit from the already-encoded e (lossy here only in resize). For higher fidelity, resize e in float.
            u16 = (np.clip(resized, 0, 1) * 65535 + 0.5).astype(np.uint16)
            png = Path('/tmp') / f'{out_prefix.name}_{name}.png'
            # Write 16-bit RGB PNG via imageio if present, else 8-bit + sharp still ok
            try:
                import imageio.v2 as imageio
                imageio.imwrite(str(png), u16)
            except Exception:
                Image.fromarray((np.clip(resized,0,1)*255+0.5).astype(np.uint8), 'RGB').save(png)
            js = f"require('sharp')('{png}').webp({{quality:94,smartSubsample:true,effort:6}}).toFile('{dest}').then(i=>console.log('{name}',i.size))"
            subprocess.run(['node','-e', js], cwd='/workspace/project-w11-mercedes-spa/source/game', check=True)
        else:
            pil = Image.fromarray((np.clip(e,0,1)*255+0.5).astype(np.uint8), 'RGB')
            pil = pil.resize((w, h), Image.Resampling.LANCZOS)
            pil.save(dest, 'WEBP', quality=94, method=6)
        paths[name] = dest
        print('wrote', dest, dest.stat().st_size)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hdr')
    ap.add_argument('-o', '--out-prefix', default='/workspace/f1work/sky_night/sky_night')
    ap.add_argument('--scale', type=float, default=0.20, help='smaller = brighter after encode (night: keep low)')
    ap.add_argument('--src-label', default='')
    args = ap.parse_args()
    print('reading', args.hdr)
    im = read_hdr(Path(args.hdr))
    print('shape', im.shape, 'min/max', float(im.min()), float(im.max()), 'mean', float(im.mean()))
    e, meta = process(im, scale=args.scale)
    meta['src'] = args.src_label or Path(args.hdr).name
    paths = save_webp(e, Path(args.out_prefix))
    meta_path = Path(args.out_prefix).with_suffix('.json') if False else Path(str(args.out_prefix)+'.json')
    json.dump(meta, open(meta_path,'w'), indent=1)
    print('meta', meta_path, meta)


if __name__ == '__main__':
    main()
