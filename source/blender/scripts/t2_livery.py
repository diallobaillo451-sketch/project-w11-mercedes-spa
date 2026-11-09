"""Lot 8 — livrée recréée par cuisson : UV uniques (projection « smart ») sur les pièces peintes, cuisson Cycles de la
position et de la normale (repère voiture : avant +Y, haut +Z) par texel, puis couleurs calculées en numpy (zones + marques
texte seulement, aucun logo officiel copié). Utilisé par t1_team_car.py quand la config a « livery »."""
import bpy, math, os
import numpy as np
LIV = '/workspace/w11/assets-work/livery'

def _img_np(path):
    im = bpy.data.images.load(path); a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], im.channels)
    bpy.data.images.remove(im); return a  # origine en bas à gauche (convention Blender)

def _bake(objs, img, expr):
    """expr : 'pos' ou 'nrm' → émission = coordonnée objet (identité = repère voiture) / normale, remappées."""
    m = bpy.data.materials.new('_bake_' + expr); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(em.outputs[0], out.inputs[0])
    if expr == 'pos':
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (0.5, 0.5, 0.0); mp.inputs['Scale'].default_value = (0.2, 0.125, 0.5)  # x∈[-2.5,2.5], y∈[-4,4], z∈[0,2]
        nt.links.new(tc.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], em.inputs[0])
    else:
        g = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (0.5, 0.5, 0.5); mp.inputs['Scale'].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], mp.inputs[0]); nt.links.new(mp.outputs[0], em.inputs[0])
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; nt.nodes.active = tx
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 1; sc.cycles.device = 'CPU'
    sc.render.bake.margin = 6; sc.render.bake.use_clear = True
    bpy.ops.object.bake(type='EMIT')
    a = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4); return a

def stamp(col, P, N, mask_img, u, v, rgb, face):
    """applique une marque texte : u,v (0..1) calculés par texel ; face = masque des texels concernés"""
    h, w = mask_img.shape[:2]
    ok = face & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    iu = np.clip((u * (w - 1)).astype(int), 0, w - 1); iv = np.clip((v * (h - 1)).astype(int), 0, h - 1)
    a = np.where(ok, mask_img[iv, iu, 0], 0)[..., None]
    col[:] = col * (1 - a) + np.array(rgb, np.float32) * a

def alphatauri(P, N, W):
    x, y, z = P[..., 0], P[..., 1], P[..., 2]; nx, ny, nz = N[..., 0], N[..., 1], N[..., 2]
    WHITE = np.array([0.80, 0.81, 0.82], np.float32); NAVY = np.array([0.012, 0.022, 0.06], np.float32)  # linéaire (≈ #F0F1F2 / #1A2640)
    yF, yR = W['FL']['c'][1], W['RL']['c'][1]
    col = np.empty(P.shape, np.float32); col[:] = WHITE
    # ligne de séparation blanc/bleu : basse sur le nez, remonte en vague sur le ponton, haute vers l'arrière
    t = np.clip((yF - y) / (yF - yR), 0, 1)                    # 0 = essieu AV, 1 = essieu AR
    zcut = 0.30 + 0.20 * np.sin(np.pi * np.clip(t * 1.25, 0, 1)) + 0.12 * t
    navy = (z < zcut) & (np.abs(nz) < 0.85)                     # flancs bas en bleu, dessus blanc
    navy |= (z < 0.16)                                           # fond plat / bords
    navy |= (y > yF + 0.35)                                      # aileron AV bleu
    navy |= (y < yR - 0.25) & (z > 0.55)                         # aileron AR bleu
    navy |= (y < yR - 0.25) & (z <= 0.55) & (np.abs(x) > 0.3)   # dérives basses
    col[navy] = NAVY
    # dérives d'aileron AR (faces latérales) : blanches avec bandeau bleu en haut
    epl = (y < yR - 0.2) & (np.abs(nx) > 0.8) & (np.abs(x) > 0.42) & (z > 0.45)
    col[epl & (z < 0.85)] = WHITE
    return col, dict(navy=navy)

def marks_alphatauri(col, P, N, W):
    x, y, z = P[..., 0], P[..., 1], P[..., 2]; nx, nz = N[..., 0], N[..., 2]
    yF, yR = W['FL']['c'][1], W['RL']['c'][1]
    at = _img_np(LIV + '/at_alphatauri.png'); ho = _img_np(LIV + '/at_honda.png')
    def side(img, y0, y1, zc, hgt, rgb):
        L = y1 - y0
        for s in (1, -1):
            face = (np.sign(x) == s) & (np.abs(nx) > 0.45) & (np.abs(x) > 0.15)
            u = ((y - y0) / L) if s > 0 else ((y1 - y) / L)        # lisible des deux côtés (avant = droite côté +X)
            v = (z - (zc - hgt / 2)) / hgt
            stamp(col, P, N, img, u, v, rgb, face)
    # « AlphaTauri » blanc sur le bas du ponton (bleu), « HONDA » rouge sur le capot moteur (blanc)
    side(at, -0.55, 0.65, 0.33, 0.115, (0.80, 0.81, 0.82))
    side(ho, -1.35, -0.75, 0.70, 0.075, (0.75, 0.02, 0.02))
    # « AlphaTauri » blanc sur le dessus du volet DRS (vu de derrière/dessus : gauche→droite = −X→+X)
    top = (nz > 0.3) & (y < yR - 0.25) & (z > 0.8)
    stamp(col, P, N, at, (x + 0.42) / 0.84, (y - (yR - 0.52)) / 0.12, (0.80, 0.81, 0.82), top)
    # nez : « AlphaTauri » sur le dessus, sens de lecture depuis le cockpit
    nose = (nz > 0.6) & (y > yF - 0.9) & (y < yF + 0.4) & (np.abs(x) < 0.2) & (z > 0.4)
    stamp(col, P, N, at, (x + 0.16) / 0.32, (y - (yF - 0.55)) / 0.07, (0.012, 0.022, 0.06), nose)

def bake_livery(objs, cid, W, res=2048):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        while len(o.data.uv_layers): o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='LIV')
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    ip = bpy.data.images.new('_pos', res, res, float_buffer=True); inr = bpy.data.images.new('_nrm', res, res, float_buffer=True)
    Pa = _bake(objs, ip, 'pos'); Na = _bake(objs, inr, 'nrm')
    cov = Pa[..., 3] > 0.5
    P = np.stack([(Pa[..., 0] - 0.5) / 0.2, (Pa[..., 1] - 0.5) / 0.125, Pa[..., 2] / 0.5], -1)
    N = Na[..., :3] * 2 - 1
    col, _ = alphatauri(P, N, W); marks_alphatauri(col, P, N, W)
    col[~cov] = (0.5, 0.5, 0.5)
    out = bpy.data.images.new(cid + '_livery', res, res); px = np.ones((res, res, 4), np.float32); px[..., :3] = col
    out.pixels.foreach_set(px.ravel()); out.colorspace_settings.name = 'Linear Rec.709'
    # → sRGB pour la texture couleur
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, 1), 1 / 2.4) - 0.055)
    px[..., :3] = srgb; img = bpy.data.images.new(cid + '_PAINT', res, res); img.pixels.foreach_set(px.ravel())
    path = f'{LIV}/{cid}_livery.png'; img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    m = bpy.data.materials.new(cid + '_PAINT'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    tx = m.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; m.node_tree.links.new(tx.outputs[0], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.42; b.inputs['Metallic'].default_value = 0.0   # bleu mat AlphaTauri, vernis léger
    b.inputs['Coat Weight'].default_value = 0.5; b.inputs['Coat Roughness'].default_value = 0.12
    for o in objs: o.data.materials.clear(); o.data.materials.append(m)
    bpy.data.images.remove(ip); bpy.data.images.remove(inr)
    print('LIVERY', path, 'coverage', round(float(cov.mean()), 3))
    return m
