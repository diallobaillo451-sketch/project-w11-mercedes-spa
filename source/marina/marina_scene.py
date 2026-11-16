# -*- coding: utf-8 -*-
"""Scène de Marina Bay : base.gltf + tuiles t00…tNN (.gltf/.bin) + tex/<hash>.webp partagées + tiles.json.

- la géométrie du GLB n'est pas retouchée : seulement recentrée sur la ligne de départ (origine du jeu), découpée en tuiles le long de la
  piste (décor lointain et très grandes faces dans « base », chargée avant le départ) et regroupée par matériau ;
- les noms de matériaux d'origine (11001Mtl…) sont conservés tels quels ; classe et alias d'exécution vont dans `extras`
  (w11_class / w11_alias), l'identifiant global dans extras.mid (matériau partagé entre tuiles : textures décodées une seule fois) ;
- le fond de ville de jour et la géométrie de collision invisible sont retirés ; les cartes à découpe passent en alphaMode MASK ;
- éclairage de nuit : émission = couleur de base × facteur par classe (voir marina_tables.NIGHT_EMISSIVE), sans image supplémentaire ;
- les textures (256 px au plus, hors public) sont converties en WebP, nommées par empreinte, et partagées par toutes les tuiles.
"""
import copy, hashlib, io, json, os, time
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree
from marina_core import Glb
import marina_tables as T

BAND = 350.0          # au-delà de cette distance à la piste : décor lointain → « base »
BIG_EDGE = 80.0       # faces plus grandes que ça (sol, eau…) → « base » (toujours chargée)
TILE_TRIS = 65000     # triangles visés par tuile
TEX_SLOTS = [('pbrMetallicRoughness', 'baseColorTexture'), ('pbrMetallicRoughness', 'metallicRoughnessTexture'),
             ('normalTexture',), ('occlusionTexture',), ('emissiveTexture',)]


def primitives(glb):
    """primitives du GLB en coordonnées monde du modèle (transformations de nœuds appliquées), avec normales et UV"""
    js = glb.js
    out = []
    stack = [(i, np.eye(4)) for i in js['scenes'][js.get('scene', 0)]['nodes']]
    while stack:
        ni, Pm = stack.pop()
        n = js['nodes'][ni]
        M = Pm @ glb.node_matrix(n)
        for c in n.get('children', []):
            stack.append((c, M))
        if 'mesh' not in n:
            continue
        R = M[:3, :3]
        Nm = np.linalg.inv(R).T
        flip = np.linalg.det(R) < 0
        for p in js['meshes'][n['mesh']]['primitives']:
            if p.get('mode', 4) != 4 or p.get('material') is None:
                continue
            V = glb.accessor(p['attributes']['POSITION']).astype(np.float64) @ R.T + M[:3, 3]
            Nr = glb.accessor(p['attributes']['NORMAL']).astype(np.float64) @ Nm.T
            Nr /= np.linalg.norm(Nr, axis=1, keepdims=True) + 1e-12
            UV = glb.accessor(p['attributes']['TEXCOORD_0']).astype(np.float32)
            F = glb.accessor(p['indices']).reshape(-1, 3).astype(np.int64)
            if flip:
                F = F[:, [0, 2, 1]]
            out.append(dict(mat=int(p['material']), V=V, N=Nr, UV=UV, F=F))
    return out


class Buf:
    """tampon binaire d'une tuile : une vue serrée par attribut"""
    def __init__(self):
        self.chunks = []; self.off = 0; self.views = []; self.acc = []

    def add(self, arr, ctype, typ, target, minmax=False):
        arr = np.ascontiguousarray(arr)
        raw = arr.tobytes()
        pad = (-self.off) % 4
        if pad:
            self.chunks.append(b'\0' * pad); self.off += pad
        self.views.append({'buffer': 0, 'byteOffset': self.off, 'byteLength': len(raw), 'target': target})
        self.chunks.append(raw); self.off += len(raw)
        a = {'bufferView': len(self.views) - 1, 'componentType': ctype, 'count': int(len(arr)), 'type': typ}
        if minmax:
            a['min'] = [float(v) for v in arr.min(0)]; a['max'] = [float(v) for v in arr.max(0)]
        self.acc.append(a)
        return len(self.acc) - 1


def slot_refs(mat):
    for slot in TEX_SLOTS:
        d = mat
        for k in slot:
            d = d.get(k) if isinstance(d, dict) else None
            if d is None:
                break
        if d is not None:
            yield d


def convert_textures(glb, used_imgs, alpha_imgs, outdir, log):
    """images sources utilisées → WebP partagées dans outdir/tex/<empreinte>.webp ; renvoie {indice source: (empreinte, octets)}"""
    js = glb.js
    tdir = os.path.join(outdir, 'tex'); os.makedirs(tdir, exist_ok=True)
    out = {}; total = 0; gpu = 0
    for src in sorted(used_imgs):
        v = js['bufferViews'][js['images'][src]['bufferView']]
        raw = bytes(glb.bin[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        im = Image.open(io.BytesIO(raw)); im.load()
        rgba = im.convert('RGBA')
        a = np.asarray(rgba)[..., 3]
        w, h = rgba.size
        keep_alpha = src in alpha_imgs and a.min() < 250
        if max(w, h) > T.TEX_CAP:
            sc = T.TEX_CAP / max(w, h); w, h = max(4, int(w * sc)), max(4, int(h * sc)); rgba = rgba.resize((w, h), Image.LANCZOS)
        if keep_alpha:
            # couleur des pixels transparents = couleur opaque la plus proche : pas de frange noire aux bords des feuilles / grillages
            arr = np.asarray(rgba).copy(); opaque = arr[..., 3] > 16
            if opaque.any() and (~opaque).any():
                idx = distance_transform_edt(~opaque, return_distances=False, return_indices=True)
                arr[..., :3] = arr[idx[0], idx[1], :3]
            rgba = Image.fromarray(arr, 'RGBA')
            buf = io.BytesIO(); rgba.save(buf, 'WEBP', quality=90, alpha_quality=100, method=4)
        else:
            buf = io.BytesIO(); rgba.convert('RGB').save(buf, 'WEBP', quality=88, method=4)
        data = buf.getvalue()
        hx = hashlib.sha1(data).hexdigest()[:16]
        with open(os.path.join(tdir, hx + '.webp'), 'wb') as f:
            f.write(data)
        out[src] = (hx, len(data)); total += len(data); gpu += w * h * 4 * 4 // 3
    log('textures : %d images WebP, %.2f Mo de fichiers, ~%.0f Mo de mémoire GPU (RGBA + mipmaps)' % (len(out), total / 1e6, gpu / 1e6))
    return out


def build_scene(glb_path, surface_json, outdir, night=True, log=print):
    t0 = time.time()
    glb = Glb(glb_path); js = glb.js
    sj = json.load(open(surface_json))
    O = np.array([sj['origin']['x'], sj['origin']['y'], sj['origin']['z']])
    C = np.stack([sj['cx'], sj['cz']], 1).astype(float)
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(('.gltf', '.bin')) or f == 'tiles.json':
            os.remove(os.path.join(outdir, f))

    # 1. primitives gardées, recentrées sur la ligne de départ
    prims = [p for p in primitives(glb) if p['mat'] not in T.DROP]
    tree = cKDTree(C)
    for p in prims:
        p['V'] = p['V'] - O
        V, F = p['V'], p['F']
        A, B, Cc = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        cen = (A + B + Cc) / 3
        e = np.maximum.reduce([np.linalg.norm(B - A, axis=1), np.linalg.norm(Cc - B, axis=1), np.linalg.norm(A - Cc, axis=1)])
        dist, j = tree.query(cen[:, [0, 2]])
        p['base'] = (dist > BAND) | (e > BIG_EDGE)
        p['j'] = j
    ntri = sum(len(p['F']) for p in prims)
    nbase = sum(int(p['base'].sum()) for p in prims)
    log('triangles : %d au total, %d dans base (décor lointain ou très grandes faces)' % (ntri, nbase))

    # 2. tuiles le long de la piste, à nombre de triangles équilibré
    cnt = np.zeros(len(C), np.int64)
    for p in prims:
        np.add.at(cnt, p['j'][~p['base']], 1)
    K = max(1, int(np.ceil(cnt.sum() / TILE_TRIS)))
    cum = np.cumsum(cnt)
    bounds = np.searchsorted(cum, cnt.sum() * np.arange(1, K) / K)
    tile_of_station = np.searchsorted(bounds, np.arange(len(C)), side='right')
    for p in prims:
        p['tile'] = np.where(p['base'], -1, tile_of_station[p['j']])
    ids = [-1] + list(range(K))

    # 3. regroupement : (tuile, matériau) → sommets / normales / UV / indices fusionnés
    parts = {}
    for p in prims:
        for t in ids:
            sel = p['tile'] == t
            if not sel.any():
                continue
            Fs = p['F'][sel]
            used, inv = np.unique(Fs, return_inverse=True)
            parts.setdefault((t, p['mat']), []).append((p['V'][used], p['N'][used], p['UV'][used], inv.reshape(-1, 3)))
    log('tuiles : %d (+ base), %d lots (tuile × matériau)' % (K, len(parts)))

    # 4. textures utilisées par les matériaux conservés
    used_mats = sorted({m for (_t, m) in parts})
    alpha_mats = set(T.FOLIAGE) | set(T.CUTOUT) | set(T.KEEP_BLEND)
    used_imgs = set(); alpha_imgs = set()
    for m in used_mats:
        for ref in slot_refs(js['materials'][m]):
            src = js['textures'][ref['index']]['source']
            used_imgs.add(src)
            if m in alpha_mats or js['materials'][m].get('alphaMode', 'OPAQUE') != 'OPAQUE':
                alpha_imgs.add(src)
    tex = convert_textures(glb, used_imgs, alpha_imgs, outdir, log)

    def make_material(mi, timg):
        """matériau d'origine (nom conservé) + extras ; timg : {indice source d'image → indice d'image dans la tuile}"""
        mat = copy.deepcopy(js['materials'][mi])
        for ref in slot_refs(mat):
            ref['index'] = timg[js['textures'][ref['index']]['source']][1]
        cls = T.CLASS.get(mi, T.CLASS_DEFAULT)
        ex = dict(mat.get('extras') or {})
        ex.update({'mid': mi, 'w11_src': mat.get('name'), 'w11_class': cls})
        if cls in T.ALIAS:
            ex['w11_alias'] = T.ALIAS[cls]
        mat['extras'] = ex
        pbr = mat.setdefault('pbrMetallicRoughness', {})
        if mi in T.FLAT_COLOR:
            pbr['baseColorFactor'] = T.FLAT_COLOR[mi]
        if cls in T.PBR_FIX:
            pbr.update(T.PBR_FIX[cls])
        if mi in T.FOLIAGE:
            mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.4
        elif mi in T.CUTOUT:
            mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.5
        if night:
            k = T.NIGHT_EMISSIVE.get(cls, 0.2)
            if k > 0:
                bc = pbr.get('baseColorTexture')
                base = pbr.get('baseColorFactor', [1, 1, 1, 1])
                mat['emissiveFactor'] = [round(k * base[0], 4), round(k * base[1], 4), round(k * base[2], 4)]
                if bc is not None:
                    mat['emissiveTexture'] = {'index': bc['index']}
        return mat

    # 5. une glTF par tuile
    tiles = []; tex_sizes = {}
    for t in ids:
        tid = 'base' if t < 0 else 't%02d' % t
        mats_here = sorted({m for (tt, m) in parts if tt == t})
        if not mats_here:
            continue
        B = Buf()
        meshes = []; nodes = []; ntris = 0
        mat_index = {m: i for i, m in enumerate(mats_here)}
        timg = {}                                      # image source → (empreinte, indice local)
        images = []
        for m in mats_here:
            for ref in slot_refs(js['materials'][m]):
                src = js['textures'][ref['index']]['source']
                if src not in timg:
                    timg[src] = (tex[src][0], len(images)); images.append({'uri': 'tex/%s.webp' % tex[src][0]})
        # une texture glTF par image, dans le même ordre : indice de texture = indice local d'image
        textures = [{'source': li, 'sampler': 0} for (_hx, li) in timg.values()]
        for m in mats_here:
            vs = parts[(t, m)]
            off = 0; Vs = []; Ns = []; Us = []; Fs = []
            for (V, N, UV, F) in vs:
                Vs.append(V); Ns.append(N); Us.append(UV); Fs.append(F + off); off += len(V)
            V = np.concatenate(Vs); N = np.concatenate(Ns); UV = np.concatenate(Us); F = np.concatenate(Fs)
            lo = V.min(0); hi = V.max(0); ctr = (lo + hi) / 2
            prim = {'attributes': {'POSITION': B.add((V - ctr).astype('<f4'), 5126, 'VEC3', 34962, True),
                                   'NORMAL': B.add(N.astype('<f4'), 5126, 'VEC3', 34962),
                                   'TEXCOORD_0': B.add(UV.astype('<f4'), 5126, 'VEC2', 34962)},
                    'indices': B.add(F.reshape(-1).astype('<u2' if len(V) < 65536 else '<u4'), 5123 if len(V) < 65536 else 5125, 'SCALAR', 34963),
                    'material': mat_index[m], 'mode': 4}
            meshes.append({'name': 'm%d' % m, 'primitives': [prim]})
            nodes.append({'name': 'm%d_%s' % (m, tid), 'mesh': len(meshes) - 1, 'translation': [round(float(c), 3) for c in ctr]})
            ntris += len(F)
        # matériaux : l'indice de texture d'un matériau = indice local d'image (les textures sont créées dans le même ordre)
        mats = []
        for m in mats_here:
            mm = make_material(m, timg)
            mats.append(mm)
        doc = {'asset': {'version': '2.0', 'generator': 'w11 build_marina.py',
                         'copyright': 'Marina Bay Street Circuit — Dave Bored SketchFab / Tyler_Dave (CC BY 4.0)'},
               'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
               'materials': mats, 'textures': textures, 'images': images,
               'samplers': copy.deepcopy(js.get('samplers') or [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]),
               'accessors': B.acc, 'bufferViews': B.views, 'buffers': [{'uri': tid + '.bin', 'byteLength': B.off}]}
        if any('KHR_materials_specular' in (mm.get('extensions') or {}) for mm in mats):
            doc['extensionsUsed'] = ['KHR_materials_specular']
        if not doc['images']:
            for k in ('images', 'textures', 'samplers'):
                doc.pop(k)
        with open(os.path.join(outdir, tid + '.bin'), 'wb') as f:
            for c in B.chunks:
                f.write(c)
        with open(os.path.join(outdir, tid + '.gltf'), 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        # emprise (XZ) de la tuile
        allv = np.concatenate([v[0] for m in mats_here for v in parts[(t, m)]])
        x0, x1 = allv[:, 0].min(), allv[:, 0].max(); z0, z1 = allv[:, 2].min(), allv[:, 2].max()
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        r = float(np.sqrt(((allv[:, 0] - cx) ** 2 + (allv[:, 2] - cz) ** 2).max()))
        tl = sorted({tex[s][0] for s in timg})
        for s in timg:
            tex_sizes[tex[s][0]] = tex[s][1]
        tiles.append({'id': tid, 'file': tid + '.gltf', 'nodes': len(nodes), 'tris': int(ntris), 'cx': round(float(cx), 1), 'cz': round(float(cz), 1),
                      'r': round(r, 1), 'geoBytes': int(B.off), 'tex': tl})
        log('  %-4s %6d triangles, %2d matériaux, %5.1f Mo, rayon %4.0f m' % (tid, ntris, len(mats_here), B.off / 1e6, r))
    manifest = {'version': 1, 'tiles': tiles, 'texSizes': tex_sizes}
    with open(os.path.join(outdir, 'tiles.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    # convention du jeu : pas de KTX2 pour les textures de piste (WebP) → manifeste vide
    with open(os.path.join(outdir, 'tex', 'ktx2.json'), 'w') as f:
        f.write('{}')
    geo = sum(t['geoBytes'] for t in tiles)
    log('scène : %d fichiers de tuiles, géométrie %.1f Mo, %d triangles (%.1fs)' % (len(tiles), geo / 1e6, sum(t['tris'] for t in tiles), time.time() - t0))
    return manifest


if __name__ == '__main__':
    import sys
    build_scene(sys.argv[1], sys.argv[2], sys.argv[3])
