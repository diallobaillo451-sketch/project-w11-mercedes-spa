# -*- coding: utf-8 -*-
"""Prépare la scène de Yas Marina avant le découpage en tuiles (tiles.mjs). Ne modifie QUE le JSON du glTF (le binaire est repris tel quel) :
- aucun matériau n'est renommé ; la classe visuelle et l'alias (herbe → GRASS, gravier → sand_new, palmier → trees1_palm) vont dans `extras`
  (w11_class, w11_alias), appliqués en mémoire par le moteur (renderer.ts, afterRoot) : même détail de près que Spa et Monza ;
- matériaux de sol calibrés (rugosité, métal, spéculaire, albédo de la texture « bruit gris ») ;
- matériaux sans texture ni couleur → gris neutre ; cartes alpha → MASK ; horizon (texture tronquée) supprimé ;
- nœud racine `w11_origin` : échelle réelle, orientation et origine = ligne de départ (même transformation que la physique)."""
import os
from yas_core import load_glb, save_glb
from yas_tables import CLASS, ALIAS, PBR, SPECULAR_MAX, ALBEDO_MUL, UNTEXTURED, MASKED, DROP


def prepare_scene(glb_in, glb_out, root_matrix, log=print):
    J, B = load_glb(glb_in)
    names = [m.get('name', '') for m in J['materials']]
    idx = {n: i for i, n in enumerate(names)}
    drop = {idx[n] for n in DROP if n in idx}

    # 1. suppression des primitives de l'horizon, puis des maillages vides (réindexation propre)
    keep_mesh = {}; meshes = []
    for mi, me in enumerate(J['meshes']):
        prims = [p for p in me['primitives'] if p.get('material') not in drop]
        if prims:
            me['primitives'] = prims; keep_mesh[mi] = len(meshes); meshes.append(me)
    J['meshes'] = meshes
    for n in J['nodes']:
        if 'mesh' in n:
            if n['mesh'] in keep_mesh: n['mesh'] = keep_mesh[n['mesh']]
            else: del n['mesh']

    # 2. matériaux : extras, calibrage PBR, alpha
    stats = dict(classes=0, aliased=0, untextured=0, masked=0)
    for m in J['materials']:
        n = m.get('name', ''); pbr = m.setdefault('pbrMetallicRoughness', {})
        cls = CLASS.get(n); ex = dict(m.get('extras') or {}); ex['w11_src'] = n
        if cls:
            ex['w11_class'] = cls; stats['classes'] += 1
            if cls in ALIAS: ex['w11_alias'] = ALIAS[cls]; stats['aliased'] += 1
            if cls in PBR:
                pbr['roughnessFactor'], pbr['metallicFactor'] = PBR[cls]
                for k in ('metallicRoughnessTexture',): pbr.pop(k, None)           # la texture d'origine peut contenir un rugueux nul
                sp = (m.get('extensions') or {}).get('KHR_materials_specular')
                if sp is not None: sp['specularFactor'] = min(sp.get('specularFactor', 1.0), SPECULAR_MAX); sp.pop('specularTexture', None)
        if n in ALBEDO_MUL:
            f = pbr.get('baseColorFactor', [1, 1, 1, 1]); pbr['baseColorFactor'] = [f[0] * ALBEDO_MUL[n], f[1] * ALBEDO_MUL[n], f[2] * ALBEDO_MUL[n], f[3]]
        if n in UNTEXTURED:
            r, g, b_ = UNTEXTURED[n]; pbr['baseColorFactor'] = [r, g, b_, 1.0]; pbr['roughnessFactor'] = 0.8; pbr['metallicFactor'] = 0.0; stats['untextured'] += 1
        if n in MASKED:
            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.4; stats['masked'] += 1
        m['extras'] = ex

    # 3. racine : échelle réelle + orientation + origine = ligne de départ
    scene = J['scenes'][J.get('scene', 0)]
    J['nodes'].append({'name': 'w11_origin', 'matrix': [float(v) for v in root_matrix], 'children': list(scene['nodes'])})
    scene['nodes'] = [len(J['nodes']) - 1]
    save_glb(J, B, glb_out)
    log('scène préparée : %d matériaux classés (%d alias), %d sans texture, %d en MASK, %d maillages ; %s (%.1f Mo)' %
        (stats['classes'], stats['aliased'], stats['untextured'], stats['masked'], len(meshes), os.path.basename(glb_out), os.path.getsize(glb_out) / 1e6))
