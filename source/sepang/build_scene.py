# -*- coding: utf-8 -*-
"""Scène de Sepang : base.gltf + base.bin + tiles.json (une seule tuile « base », chargée avant le départ).

- la géométrie est celle du GLB (aucune retouche), recentrée sur la ligne de départ par un nœud racine ;
- le matériau invisible d'origine (collision, alpha 0) est retiré ;
- les noms de matériaux d'origine (Sepang691Mtl…) sont conservés tels quels ; la classe (route, herbe, gravier…)
  et l'alias d'exécution (herbe/gravier traités comme ceux de Monza) sont ajoutés dans `extras` ;
- les textures sont réduites (JPEG si opaque, PNG sinon) pour tenir dans la mémoire d'un téléphone.
"""
import copy, io, json, os, struct, time
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from sepang_core import Glb
from sepang_tables import DROP, FOLIAGE, CLASS, ALIAS, TEX_CAP, TEX_CAP_DEFAULT

TEX_SLOTS = [('pbrMetallicRoughness', 'baseColorTexture'), ('pbrMetallicRoughness', 'metallicRoughnessTexture'),
             ('normalTexture',), ('occlusionTexture',), ('emissiveTexture',)]


def build_scene(glb_path, outdir, origin, log=print, cut=None, strip=None):
    t0 = time.time()
    glb = Glb(glb_path)
    js = copy.deepcopy(glb.js)
    os.makedirs(outdir, exist_ok=True)

    # 0. coupure de la clôture à l'entrée des stands : triangles de barrière près du chemin retirés (cut), bande d'asphalte ajoutée (strip)
    filt = {}
    if cut is not None:
        ctree = cKDTree(cut['points'])
        for mat, W, F, _uv, id_ in glb.world_primitives():
            if mat in cut['mats']:
                cen = (W[F[:, 0]] + W[F[:, 1]] + W[F[:, 2]]) / 3
                dd, _ = ctree.query(cen[:, [0, 2]])
                drop = dd < cut['radius']
                if drop.any():
                    filt[id_] = F[~drop]
    for mi, m in enumerate(js['meshes']):
        for pi, p in enumerate(m['primitives']):
            p['_orig'] = (mi, pi)

    # 1. primitives gardées
    for m in js['meshes']:
        m['primitives'] = [p for p in m['primitives'] if p.get('material') is not None and p['material'] not in DROP and p.get('mode', 4) == 4]
    keep = [i for i, m in enumerate(js['meshes']) if m['primitives']]
    remap = {old: new for new, old in enumerate(keep)}
    for n in js['nodes']:
        if 'mesh' in n:
            if n['mesh'] in remap:
                n['mesh'] = remap[n['mesh']]
            else:
                del n['mesh']
    js['meshes'] = [js['meshes'][i] for i in keep]
    used_mats = sorted({p['material'] for m in js['meshes'] for p in m['primitives']})
    mat_map = {old: new for new, old in enumerate(used_mats)}

    # 2. nouveau tampon : un bufferView serré par accessor utilisé
    chunks = []; offset = [0]
    new_views = []; new_acc = []; acc_map = {}
    def add_blob(raw, target=None):
        pad = (-offset[0]) % 4
        if pad:
            chunks.append(b'\0' * pad); offset[0] += pad
        view = {'buffer': 0, 'byteOffset': offset[0], 'byteLength': len(raw)}
        if target:
            view['target'] = target
        chunks.append(raw); offset[0] += len(raw)
        new_views.append(view)
        return len(new_views) - 1
    def copy_accessor(ai, target):
        if ai in acc_map:
            return acc_map[ai]
        a = copy.deepcopy(js['accessors'][ai])
        arr = glb.accessor(ai)
        raw = np.ascontiguousarray(arr).tobytes()
        a['bufferView'] = add_blob(raw, target)
        a['byteOffset'] = 0
        a.pop('sparse', None)
        new_acc.append(a); acc_map[ai] = len(new_acc) - 1
        return acc_map[ai]
    def copy_filtered(ai, arr, target):
        a = copy.deepcopy(js['accessors'][ai])
        dt = {5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
        raw = np.ascontiguousarray(arr.astype(dt)).tobytes()
        a['bufferView'] = add_blob(raw, target); a['byteOffset'] = 0; a['count'] = int(len(arr))
        a['min'] = [int(arr.min())]; a['max'] = [int(arr.max())]
        a.pop('sparse', None)
        new_acc.append(a)
        return len(new_acc) - 1
    tris = 0
    for m in js['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: copy_accessor(v, 34962) for k, v in p['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0')}
            if 'indices' in p:
                if p['_orig'] in filt and len(filt[p['_orig']]):
                    p['indices'] = copy_filtered(p['indices'], filt[p['_orig']].reshape(-1), 34963)
                else:
                    p['indices'] = copy_accessor(p['indices'], 34963)
                tris += new_acc[p['indices']]['count'] // 3
            p.pop('_orig', None)
            p['material'] = mat_map[p['material']]
    geo_bytes = offset[0]
    log('géométrie : %d triangles, %.1f Mo' % (tris, geo_bytes / 1e6))

    # 3. textures : on ne garde que celles des matériaux conservés, réduites
    old_tex = js.get('textures', []); old_img = js.get('images', [])
    img_cap = {}; img_alpha = {}
    def slot_refs(mat):
        for slot in TEX_SLOTS:
            d = mat
            for k in slot:
                d = d.get(k) if isinstance(d, dict) else None
                if d is None:
                    break
            if d is not None:
                yield d
    for old in used_mats:
        mat = js['materials'][old]
        cls = CLASS.get(old)
        cap = TEX_CAP.get(cls, TEX_CAP_DEFAULT)
        for ref in slot_refs(mat):
            src = old_tex[ref['index']]['source']
            img_cap[src] = max(img_cap.get(src, 0), cap)
            if mat.get('alphaMode', 'OPAQUE') != 'OPAQUE' or old in FOLIAGE:
                img_alpha[src] = True
    new_images = []; img_map = {}; tex_bytes = 0; gpu = 0
    for src in sorted(img_cap):
        v = glb.js['bufferViews'][old_img[src]['bufferView']]
        raw = bytes(glb.bin[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        im = Image.open(io.BytesIO(raw)); im.load()
        w, h = im.size
        has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getchannel('A').getextrema()[0] < 250
        keep_alpha = has_alpha and img_alpha.get(src, False)
        sc = min(1.0, img_cap[src] / max(w, h))
        nw, nh = max(4, int(round(w * sc / 4)) * 4), max(4, int(round(h * sc / 4)) * 4)
        if (nw, nh) != (w, h):
            im = im.convert('RGBA' if keep_alpha else 'RGB').resize((nw, nh), Image.LANCZOS)
        buf = io.BytesIO()
        if keep_alpha:
            im.convert('RGBA').save(buf, 'PNG', optimize=True); mime = 'image/png'
        else:
            im.convert('RGB').save(buf, 'JPEG', quality=86, optimize=True); mime = 'image/jpeg'
        data = buf.getvalue()
        bv = add_blob(data)
        new_images.append({'bufferView': bv, 'mimeType': mime})
        img_map[src] = len(new_images) - 1
        tex_bytes += len(data); gpu += nw * nh * 4 * 4 // 3
    new_tex = []; tex_map = {}
    for old_i, t in enumerate(old_tex):
        if t['source'] in img_map:
            tex_map[old_i] = len(new_tex)
            nt = {'source': img_map[t['source']]}
            if 'sampler' in t:
                nt['sampler'] = t['sampler']
            new_tex.append(nt)
    log('textures : %d images, %.1f Mo de fichiers, ~%.0f Mo de mémoire GPU (RGBA + mipmaps)' % (len(new_images), tex_bytes / 1e6, gpu / 1e6))

    # 4. matériaux : noms d'origine conservés, classe/alias en extras
    new_mats = []
    for old in used_mats:
        mat = copy.deepcopy(js['materials'][old])
        for ref in slot_refs(mat):
            ref['index'] = tex_map[ref['index']]
        cls = CLASS.get(old, 'other')
        ex = dict(mat.get('extras') or {})
        ex['w11_src'] = mat.get('name'); ex['w11_class'] = cls
        if cls in ALIAS:
            ex['w11_alias'] = ALIAS[cls]
        mat['extras'] = ex
        if old in FOLIAGE:
            mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.4
        new_mats.append(mat)

    # 5. nœud racine : origine du monde = ligne de départ
    roots = js['scenes'][js.get('scene', 0)]['nodes']
    js['nodes'].append({'name': 'w11_origin', 'translation': [-origin[0], -origin[1], -origin[2]], 'children': list(roots)})
    scene_nodes = [len(js['nodes']) - 1]
    if strip is not None and 23 in mat_map:              # bande d'asphalte (déjà en repère jeu) : même matériau que la piste
        V, Nn, UV, ix = strip
        def add_acc(arr, comp, typ, target, minmax=False):
            raw = np.ascontiguousarray(arr).tobytes()
            a = {'bufferView': add_blob(raw, target), 'byteOffset': 0, 'componentType': comp, 'count': int(len(arr)), 'type': typ}
            if minmax:
                a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
            new_acc.append(a)
            return len(new_acc) - 1
        pos = add_acc(V, 5126, 'VEC3', 34962, True); nor = add_acc(Nn, 5126, 'VEC3', 34962)
        uvv = add_acc(UV, 5126, 'VEC2', 34962); ii = add_acc(ix.astype(np.uint32), 5125, 'SCALAR', 34963)
        js['meshes'].append({'name': 'w11_pit_strip', 'primitives': [{'attributes': {'POSITION': pos, 'NORMAL': nor, 'TEXCOORD_0': uvv}, 'indices': ii, 'material': mat_map[23]}]})
        js['nodes'].append({'name': 'w11_pit_strip', 'mesh': len(js['meshes']) - 1})
        scene_nodes.append(len(js['nodes']) - 1)
        tris += len(ix) // 3
    js['scenes'][js.get('scene', 0)]['nodes'] = scene_nodes

    js['accessors'] = new_acc; js['bufferViews'] = new_views
    js['images'] = new_images; js['textures'] = new_tex; js['materials'] = new_mats
    js['buffers'] = [{'uri': 'base.bin', 'byteLength': offset[0]}]
    js['asset'] = {'version': '2.0', 'generator': 'w11 build_sepang.py', 'copyright': 'Sepang International Circuit 2025 layout — Dave Love (CC BY 4.0)'}
    ext_used = [e for e in js.get('extensionsUsed', []) if e in ('KHR_materials_specular', 'KHR_texture_transform')]
    if ext_used:
        js['extensionsUsed'] = ext_used
    js.pop('extensionsRequired', None)

    with open(os.path.join(outdir, 'base.bin'), 'wb') as f:
        for c in chunks:
            f.write(c)
    with open(os.path.join(outdir, 'base.gltf'), 'w') as f:
        json.dump(js, f, separators=(',', ':'))

    # 6. emprise (monde recentré) pour tiles.json
    xs = []; zs = []
    for mat, W, F, _uv, _id in glb.world_primitives():
        if mat is None or mat in DROP:
            continue
        xs.append((W[:, 0].min(), W[:, 0].max())); zs.append((W[:, 2].min(), W[:, 2].max()))
    x0 = min(a for a, _ in xs) - origin[0]; x1 = max(b for _, b in xs) - origin[0]
    z0 = min(a for a, _ in zs) - origin[2]; z1 = max(b for _, b in zs) - origin[2]
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; r = float(np.hypot(x1 - x0, z1 - z0) / 2)
    manifest = {'version': 1, 'tiles': [{'id': 'base', 'file': 'base.gltf', 'nodes': len(js['nodes']), 'tris': int(tris),
                                         'cx': round(cx, 1), 'cz': round(cz, 1), 'r': round(r, 1), 'geoBytes': int(offset[0]), 'tex': []}],
                'texSizes': {}}
    with open(os.path.join(outdir, 'tiles.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    log('scène : base.gltf %.2f Mo + base.bin %.1f Mo, rayon %.0f m (%.1fs)' % (os.path.getsize(os.path.join(outdir, 'base.gltf')) / 1e6, offset[0] / 1e6, r, time.time() - t0))
    return manifest


if __name__ == '__main__':
    import sys
    o = json.load(open(sys.argv[2]))['origin']
    build_scene(sys.argv[1], sys.argv[3], (o['x'], o['y'], o['z']))
