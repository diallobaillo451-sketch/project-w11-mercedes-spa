#!/usr/bin/env python3
"""Finalise un .blend Yas déjà importé et bake AO, sans refaire le bake.

Corrige l'orientation de l'HDRI dans le shader World, rend une vue de contrôle,
réexporte le GLB métrique avec les couleurs de sommet AO et met à jour le rapport.
Usage : blender --background --python yas_finalize_scene.py -- --blend ... --glb ... --preview ...
"""
import argparse
import json
import statistics
import sys
from pathlib import Path

import bpy


def args_from_cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--blend', required=True)
    p.add_argument('--glb', required=True)
    p.add_argument('--preview', required=True)
    p.add_argument('--render-samples', type=int, default=32)
    p.add_argument('--width', type=int, default=1600)
    p.add_argument('--height', type=int, default=1000)
    return p.parse_args(argv)


def main():
    a = args_from_cli()
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    scene = bpy.context.scene
    if scene.world and scene.world.use_nodes:
        nt = scene.world.node_tree
        for node in nt.nodes:
            if node.type == 'TEX_ENVIRONMENT':
                for link in list(nt.links):
                    if link.to_node == node and link.to_socket == node.inputs['Vector']:
                        nt.links.remove(link)
    if scene.camera:
        scene.camera.data.clip_start = 0.1
        scene.camera.data.clip_end = max(scene.camera.data.clip_end, 10000.0)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = max(8, min(64, a.render_samples))
    scene.render.resolution_x = a.width
    scene.render.resolution_y = a.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = a.preview
    Path(a.preview).parent.mkdir(parents=True, exist_ok=True)
    Path(a.glb).parent.mkdir(parents=True, exist_ok=True)
    print('[YAS-FINAL] Rendu HDRI nuit', a.preview, flush=True)
    bpy.ops.render.render(write_still=True)

    bpy.ops.file.pack_all()
    print('[YAS-FINAL] Sauvegarde .blend', a.blend, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=a.blend, compress=True)

    meshes = [o for o in scene.objects if o.type == 'MESH']
    roots = [o for o in scene.objects if o.type == 'EMPTY' and o.name == 'YAS_MARINA_2021_METRIC_ROOT']
    if not roots:
        raise RuntimeError('Racine métrique Yas absente du .blend.')
    export_objects = [o for o in scene.objects if o.type in {'MESH', 'EMPTY'} and not o.get('preview_only')]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in export_objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    print('[YAS-FINAL] Export GLB; meshes', len(meshes), 'vertices', sum(len(o.data.vertices) for o in meshes), flush=True)
    export_props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    export_args = dict(filepath=a.glb, use_selection=True, export_format='GLB',
                       export_extras=True, export_cameras=False, export_lights=False,
                       export_image_format='AUTO', export_yup=True)
    if 'export_apply' in export_props:
        export_args['export_apply'] = True
    if 'export_vertex_color' in export_props:
        export_args['export_vertex_color'] = 'NAME'
        export_args['export_vertex_color_name'] = 'AO'
    elif 'export_colors' in export_props:
        export_args['export_colors'] = True
    bpy.ops.export_scene.gltf(**export_args)
    ao_meshes = [o for o in meshes if 'AO' in o.data.color_attributes]
    ao_values = []
    for ob in ao_meshes:
        data = ob.data.color_attributes['AO'].data
        step = max(1, len(data) // 100)
        ao_values.extend(data[i].color[0] for i in range(0, len(data), step))
    report = {
        'circuit': 'Yas Marina GP 2021',
        'blend': str(Path(a.blend).resolve()),
        'glb': str(Path(a.glb).resolve()),
        'preview': str(Path(a.preview).resolve()),
        'official_length_m': 5281.0,
        'uniform_scale': 1.9913894589275487,
        'scale_basis': 'estimation par alignement carte/maillage; à confirmer par relevé du centreline',
        'mesh_objects': len(meshes),
        'ao': {
            'meshes': len(ao_meshes),
            'samples': 32,
            'distance_m': 4.0,
            'sampled_mean': statistics.mean(ao_values) if ao_values else None,
            'sampled_p05': sorted(ao_values)[max(0, len(ao_values)//20)] if ao_values else None,
        },
        'night_environment': 'Repository-prepared sky_night_4k.webp and sky_night.json, packed in the Blender scene',
        'physical_data': 'surfaces, ligne centrale, barrières et pitlane non inclus/validés',
    }
    meta = Path(a.blend).with_suffix('.json')
    meta.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('[YAS-FINAL] Rapport', str(meta), flush=True)


if __name__ == '__main__':
    main()
