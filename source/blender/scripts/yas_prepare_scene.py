#!/usr/bin/env python3
"""Prépare une scène de travail Blender Yas Marina 2021 depuis le GLB fourni.

Le GLB source n'est jamais modifié. Le script crée une copie Blender, applique
une mise à l'échelle uniforme (calibration indicative fondée sur 5 281 m),
charge l'HDRI nocturne Qwantani Night, bake l'occlusion ambiante Cycles et
exporte un GLB métrique destiné au pipeline de tuilage.

Usage :
  blender --background --python yas_prepare_scene.py -- \
    --input /path/to/yas_marina.glb --hdri /path/to/qwantani_night_puresky_24k.hdr \
    --blend /path/to/yas_marina_2021.blend --glb /path/to/yas_marina_scaled_ao.glb \
    --preview /path/to/yas_marina_night_preview.png

L'échelle reste à valider sur les dimensions réelles du circuit et une ligne
centrale contrôlée. La calibration uniforme préserve strictement les proportions.
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

OFFICIAL_LENGTH_M = 5281.0
MODEL_LENGTH_UNITS = 2651.9172210764095
DEFAULT_SCALE = OFFICIAL_LENGTH_M / MODEL_LENGTH_UNITS


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', required=True, help='GLB source utilisateur, lu seulement')
    p.add_argument('--hdri', required=True, help='HDRI source Qwantani Night, Poly Haven CC0')
    p.add_argument('--blend', required=True, help='Fichier .blend de travail à créer')
    p.add_argument('--glb', required=True, help='GLB métrique exporté après AO')
    p.add_argument('--preview', required=True, help='Rendu PNG de contrôle')
    p.add_argument('--scale', type=float, default=DEFAULT_SCALE, help='Échelle uniforme calculée depuis la longueur officielle')
    p.add_argument('--samples', type=int, default=32, help='Échantillons Cycles pour AO')
    p.add_argument('--ao-distance', type=float, default=4.0, help='Distance AO en mètres')
    p.add_argument('--skip-ao', action='store_true', help='Ignorer le bake AO (diagnostic uniquement)')
    p.add_argument('--render-samples', type=int, default=48, help='Échantillons Cycles pour le rendu de contrôle')
    return p.parse_args(argv)


def log(*items):
    print('[YAS-BLENDER]', *items, flush=True)


def model_bounds(objects):
    pts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for ob in objects:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(depsgraph)
        for p in ev.bound_box:
            pts.append(ev.matrix_world @ Vector(p))
    if not pts:
        raise RuntimeError('Le GLB ne contient aucun maillage.')
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return lo, hi


def set_metric_scene(scene):
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0.25
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 75


def downsample_hdr(src, max_width=4096):
    """Charge le HDRI, le réduit en mémoire pour une scène Blender transportable."""
    image = bpy.data.images.load(str(src), check_existing=True)
    w, h = image.size
    if w > max_width:
        nh = max(1, round(h * max_width / w))
        log('Réduction HDRI', f'{w}x{h}', '->', f'{max_width}x{nh}')
        image.scale(max_width, nh)
    compact = Path(src).with_name(Path(src).stem + '_4k_work.hdr')
    image.name = 'Qwantani_Night_CC0_4K'
    image.file_format = 'HDR'
    image.filepath_raw = str(compact)
    image.save()
    image.filepath = str(compact)
    image.pack()
    return image


def add_night_world(scene, image):
    world = bpy.data.worlds.new('Yas Marina | Qwantani Night')
    world.use_nodes = True
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.name = 'HDRI Qwantani Night (CC0)'
    env.image = image
    env.projection = 'EQUIRECTANGULAR'
    env.interpolation = 'Linear'
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 0.85
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    world['source'] = 'Poly Haven Qwantani Night Pure Sky, CC0'
    world['note'] = 'HDRI nocturne ; source runtime préparée conservée dans public/assets/sky.'
    return world


def add_preview_lighting(scene, center, size):
    """Éclairage doux de contrôle : la scène reste dédiée à la nuit."""
    col = bpy.data.collections.new('PREVIEW_ONLY — éclairage nocturne de contrôle')
    scene.collection.children.link(col)
    data = bpy.data.lights.new('Moon_fill_preview', 'SUN')
    data.energy = 0.42
    data.color = (0.60, 0.69, 0.92)
    data.angle = math.radians(18)
    light = bpy.data.objects.new('Moon_fill_preview', data)
    col.objects.link(light)
    light.location = (center[0] - size * 0.3, center[1] - size * 0.4, center[2] + size * 0.8)
    light.rotation_euler = (math.radians(32), math.radians(-18), math.radians(-25))
    light['preview_only'] = True


def add_preview_camera(scene, lo, hi):
    col = bpy.data.collections.get('PREVIEW_ONLY — éclairage nocturne de contrôle')
    if col is None:
        col = bpy.data.collections.new('PREVIEW_ONLY — caméra')
        scene.collection.children.link(col)
    center = [(lo[i] + hi[i]) * 0.5 for i in range(3)]
    dims = [hi[i] - lo[i] for i in range(3)]
    size = max(dims[0], dims[1], dims[2], 1.0)
    data = bpy.data.cameras.new('Yas Marina | contrôle général')
    data.type = 'ORTHO'
    data.ortho_scale = max(dims[0], dims[1]) * 1.12
    data.clip_start = 0.1
    data.clip_end = max(size * 5.0, 10000.0)
    cam = bpy.data.objects.new('Yas Marina | contrôle général', data)
    col.objects.link(cam)
    cam.location = (center[0], center[1], hi[2] + size * 0.72)
    direction = Vector(center) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return center, size


def bake_ao(meshes, samples, distance):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.world.light_settings.distance = distance
    for ob in meshes:
        me = ob.data
        if 'AO' not in me.color_attributes:
            me.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        me.color_attributes.active_color = me.color_attributes['AO']
        me.attributes.render_color_index = me.color_attributes.find('AO')
    t0 = time.time()
    batch = 24
    total_verts = sum(len(ob.data.vertices) for ob in meshes)
    log('Début bake AO Cycles', f'{len(meshes)} meshes', f'{total_verts} sommets', f'{samples} samples', f'{distance} m')
    for start in range(0, len(meshes), batch):
        bpy.ops.object.select_all(action='DESELECT')
        group = meshes[start:start + batch]
        for ob in group:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
        log('AO', min(start + batch, len(meshes)), '/', len(meshes), f'{time.time()-t0:.0f}s')
    return {'samples': samples, 'distance_m': distance, 'objects': len(meshes), 'vertices': total_verts, 'bake_seconds': round(time.time()-t0)}


def main():
    args = parse_args()
    for path in (args.input, args.hdri):
        if not Path(path).is_file():
            raise FileNotFoundError(path)
    for out in (args.blend, args.glb, args.preview):
        Path(out).parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    log('Import GLB', args.input)
    bpy.ops.import_scene.gltf(filepath=args.input)
    scene = bpy.context.scene
    objects = [o for o in scene.objects if o.type in {'MESH', 'EMPTY'}]
    meshes = [o for o in objects if o.type == 'MESH']
    if not meshes:
        raise RuntimeError('Aucun mesh après import glTF.')
    before_lo, before_hi = model_bounds(objects)

    # Mettre les objets importés sous une racine unique, sans altérer les matrices monde.
    # Un seul facteur de racine conserve exactement les proportions et l'orientation.
    worlds = {o: o.matrix_world.copy() for o in objects}
    for ob in objects:
        ob.parent = None
        ob.matrix_world = worlds[ob]
    root = bpy.data.objects.new('YAS_MARINA_2021_METRIC_ROOT', None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 24.0
    scene.collection.objects.link(root)
    for ob in objects:
        ob.parent = root
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_world = worlds[ob]
    root.scale = (args.scale, args.scale, args.scale)
    bpy.context.view_layer.update()
    after_lo, after_hi = model_bounds(objects)
    log('Échelle uniforme', args.scale, 'bounds source', before_lo, before_hi, 'bounds métriques', after_lo, after_hi)

    set_metric_scene(scene)
    hdri = downsample_hdr(Path(args.hdri))
    add_night_world(scene, hdri)
    center, size = add_preview_camera(scene, after_lo, after_hi)
    add_preview_lighting(scene, center, size)
    scene['circuit'] = 'Yas Marina Grand Prix Circuit — configuration 2021'
    scene['track_length_official_m'] = OFFICIAL_LENGTH_M
    scene['scale_uniform'] = args.scale
    scene['scale_basis'] = 'Estimation par alignement du plan 2021 fourni et de la surface GLB; à revalider par relevé/centreline.'
    scene['source_glb'] = Path(args.input).name
    scene['source_glb_license'] = 'Fichier fourni par l’utilisateur via WeTransfer; licence non vérifiée.'
    scene['night_environment'] = 'Poly Haven Qwantani Night Pure Sky (CC0)'
    scene['physical_data_status'] = 'Non générée par ce script; centreline, surfaces, barrières et pitlane à valider séparément.'

    ao_meta = {'skipped': True}
    if not args.skip_ao:
        ao_meta = bake_ao(meshes, args.samples, args.ao_distance)

    # Sauvegarde intermédiaire avant le rendu : la scène et ses images restent
    # livrables même si le rendu de contrôle dépasse les ressources disponibles.
    bpy.ops.file.pack_all()
    log('Sauvegarde .blend avant rendu de contrôle', args.blend)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)

    # Rendu de contrôle en nuit. La lumière bleue faible est un outil de preview, pas
    # une configuration de projecteurs runtime; l'HDRI est bien celui du circuit.
    # EEVEE est utilisé pour maintenir un coût mémoire raisonnable sur cette scène.
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = max(8, min(32, args.render_samples))
    scene.render.filepath = args.preview
    scene.render.resolution_percentage = 50
    log('Rendu de contrôle nuit', args.preview)
    bpy.ops.render.render(write_still=True)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True

    # Exporter seulement les objets du modèle et la racine; caméra/lumière de preview exclues.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    exporter_props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    export_kwargs = dict(
        filepath=args.glb,
        use_selection=True,
        export_format='GLB',
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_image_format='AUTO',
        export_yup=True,
    )
    if 'export_apply' in exporter_props:
        export_kwargs['export_apply'] = True
    if not args.skip_ao:
        if 'export_vertex_color' in exporter_props:
            export_kwargs['export_vertex_color'] = 'NAME'
            export_kwargs['export_vertex_color_name'] = 'AO'
        elif 'export_colors' in exporter_props:
            export_kwargs['export_colors'] = True
    log('Export GLB métrique', args.glb)
    bpy.ops.export_scene.gltf(**export_kwargs)
    bpy.ops.file.pack_all()
    log('Sauvegarde .blend autonome', args.blend)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)

    report = {
        'circuit': 'Yas Marina GP 2021',
        'input_glb': str(Path(args.input).resolve()),
        'input_bytes': Path(args.input).stat().st_size,
        'hdri_source': str(Path(args.hdri).resolve()),
        'hdri_cc0': 'Poly Haven Qwantani Night Pure Sky',
        'official_length_m': OFFICIAL_LENGTH_M,
        'uniform_scale': args.scale,
        'scale_basis': 'map-to-mesh alignment; estimate, not independent survey',
        'bounds_source_blender_units': {'min': before_lo, 'max': before_hi},
        'bounds_scaled_m': {'min': after_lo, 'max': after_hi},
        'mesh_objects': len(meshes),
        'physical_data': 'not included or validated',
        'ao': ao_meta,
        'blend': str(Path(args.blend).resolve()),
        'glb': str(Path(args.glb).resolve()),
        'preview': str(Path(args.preview).resolve()),
    }
    meta_path = Path(args.blend).with_suffix('.json')
    meta_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    log('Terminé; rapport', meta_path)


if __name__ == '__main__':
    main()
