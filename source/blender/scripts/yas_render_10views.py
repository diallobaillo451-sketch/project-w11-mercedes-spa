#!/usr/bin/env python3
"""Prepare Yas Marina as a night scene and render ten real circuit views in Blender 5.2+.

Uses the repository-prepared upper-hemisphere sky texture and the repository's
36 m stadium floodlight mast kit. The sky dome and cameras are preview-only;
the imported floodlight masts remain part of the circuit export.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector


def cli_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--blend', required=True)
    p.add_argument('--sky', required=True)
    p.add_argument('--sky-meta', required=True)
    p.add_argument('--mast', required=True)
    p.add_argument('--out-dir', required=True)
    p.add_argument('--glb', required=True)
    p.add_argument('--width', type=int, default=960)
    p.add_argument('--height', type=int, default=600)
    p.add_argument('--samples', type=int, default=16)
    p.add_argument('--mast-count', type=int, default=10)
    p.add_argument('--sky-intensity', type=float, default=0.12)
    p.add_argument('--limit-views', type=int, default=0, help='Render only the first N cameras for a quick check.')
    return p.parse_args(argv)


def link_collection(scene, name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)
    return col


def move_to_collection(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def math_node(nodes, operation, name):
    node = nodes.new('ShaderNodeMath')
    node.operation = operation
    node.label = name
    return node


def make_prepared_skydome(scene, col, sky_path, meta_path, intensity=0.12):
    meta = json.loads(Path(meta_path).read_text(encoding='utf-8'))
    vmax = float(meta['vMax'])
    decode_scale = float(meta['scale'])
    image = bpy.data.images.load(str(sky_path), check_existing=True)
    image.name = 'Yas Marina | prepared sky_night_4k.webp'
    image.colorspace_settings.name = 'Non-Color'
    image.pack()

    mat = bpy.data.materials.new('Yas Marina | prepared night sky (decoded)')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nodes, links = nt.nodes, nt.links
    tex = nodes.new('ShaderNodeTexImage')
    tex.name = 'Repository prepared sky_night_4k.webp'
    tex.label = 'Upper-hemisphere night texture (repository asset)'
    tex.image = image
    tex.extension = 'REPEAT'
    tex.interpolation = 'Linear'
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.mode = 'RGB'
    combine = nodes.new('ShaderNodeCombineColor')
    combine.mode = 'RGB'
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1.0
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(tex.outputs['Color'], sep.inputs['Color'])
    for channel, socket in enumerate(('Red', 'Green', 'Blue')):
        one_minus = math_node(nodes, 'SUBTRACT', f'1 - {socket}')
        one_minus.inputs[0].default_value = 1.0
        links.new(sep.outputs[socket], one_minus.inputs[1])
        decode = math_node(nodes, 'DIVIDE', f'{socket} / (1 - {socket})')
        links.new(sep.outputs[socket], decode.inputs[0])
        links.new(one_minus.outputs[0], decode.inputs[1])
        scale = math_node(nodes, 'MULTIPLY', f'{socket} × sky scale')
        scale.inputs[1].default_value = decode_scale * intensity
        links.new(decode.outputs[0], scale.inputs[0])
        links.new(scale.outputs[0], combine.inputs[socket])
    links.new(combine.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], out.inputs['Surface'])

    # Blender's image node maps V=0 to the file's top row; the prepared
    # texture stores zenith there and the lower horizon near its bottom.
    lat_min = math.pi / 2.0 - math.pi * vmax
    lat_max = math.radians(89.8)
    sun = meta.get('sun', {})
    sun_elev = math.radians(float(sun.get('elev', 0.0)))
    sun_azimuth = math.radians(215.0)
    sun_theta = math.pi / 2.0 - sun_elev
    sun_x = math.sin(sun_azimuth) * math.sin(sun_theta)
    sun_z = math.cos(sun_azimuth) * math.sin(sun_theta)
    u_want = math.atan2(sun_z, sun_x) / (2.0 * math.pi) + 0.5
    u_offset = (float(sun.get('u', 0.5)) - u_want) % 1.0
    n_lat, n_lon, radius = 64, 256, 9000.0
    verts, uvs = [], []
    for i in range(n_lat + 1):
        el = lat_min + (lat_max - lat_min) * i / n_lat
        for j in range(n_lon + 1):
            az = 2.0 * math.pi * j / n_lon
            ce = math.cos(el)
            verts.append((radius * ce * math.cos(az), radius * ce * math.sin(az), radius * math.sin(el)))
            v_r = (math.pi / 2.0 - el) / (math.pi * vmax)
            uvs.append(((0.5 + j / n_lon + u_offset) % 1.0, max(0.0, min(0.999, v_r))))
    faces = []
    stride = n_lon + 1
    for i in range(n_lat):
        for j in range(n_lon):
            a = i * stride + j
            b = a + 1
            d = (i + 1) * stride + j
            c = d + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new('Yas Marina | prepared sky dome mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    uv_layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    mesh.update()
    dome = bpy.data.objects.new('YAS_PREPARED_NIGHT_SKYDOME', mesh)
    col.objects.link(dome)
    dome['preview_only'] = True
    dome['yas_generated_night'] = True
    dome.hide_select = True
    try:
        dome.visible_shadow = False
        dome.visible_diffuse = False
        dome.visible_glossy = False
    except Exception:
        pass

    world = scene.world or bpy.data.worlds.new('Yas Marina | night world')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.clear()
    bg = world.node_tree.nodes.new('ShaderNodeBackground')
    bg.name = 'Dark night below the prepared horizon'
    bg.inputs['Color'].default_value = (0.001, 0.0025, 0.009, 1.0)
    bg.inputs['Strength'].default_value = 1.0
    wo = world.node_tree.nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    world['sky_asset'] = str(Path(sky_path).resolve())
    world['sky_metadata'] = str(Path(meta_path).resolve())
    world['sky_intensity'] = float(intensity)
    return dome


def scene_bounds(scene):
    points = []
    for obj in scene.objects:
        if obj.type != 'MESH' or obj.get('preview_only') or obj.get('yas_generated_night'):
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return Vector((0, 0, 0)), Vector((2800, 2800, 200))
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def clear_previous_generated(scene):
    # Save the previous floodlight helper positions before removing the first
    # preview rig; these positions were laid out against the imported circuit.
    old_positions = []
    for obj in scene.objects:
        if obj.type == 'LIGHT' and obj.name.startswith('YAS_PREVIEW_FLOOD_'):
            old_positions.append((obj.location.x, obj.location.y))
    doomed = []
    for obj in list(scene.objects):
        if (obj.name.startswith('YAS_PREVIEW_FLOOD_') or obj.name == 'Moon_fill_preview'
                or obj.name == 'Yas Marina — Night Hero'
                or obj.name.startswith('YAS_VIEW_')
                or obj.get('preview_only') or obj.get('yas_generated_night')
                or obj.get('yas_generated_mast')):
            doomed.append(obj)
    for obj in doomed:
        if bpy.data.objects.get(obj.name):
            bpy.data.objects.remove(obj, do_unlink=True)
    for name in ('PREVIEW_ONLY — projecteurs de contrôle', 'YAS NIGHT PRESENTATION — preview only', 'YAS Marina | floodlight instances'):
        coll = bpy.data.collections.get(name)
        if coll and len(coll.objects) == 0:
            bpy.data.collections.remove(coll)
    return old_positions


def ground_z(scene, x, y, depsgraph):
    origin = Vector((x, y, 2000.0))
    direction = Vector((0.0, 0.0, -1.0))
    try:
        hit, loc, normal, face_index, obj, matrix = scene.ray_cast(depsgraph, origin, direction, distance=5000.0)
        return float(loc.z) + 0.03 if hit else 0.0
    except Exception:
        return 0.0


def add_floodlight_instances(scene, mast_path, preview_col, mast_col, positions, count, center):
    if len(positions) < count:
        fallback = [(-1180, 620), (-800, 780), (-350, 820), (120, 820), (600, 780),
                    (1050, 620), (1120, 100), (850, -520), (300, -820), (-480, -820)]
        positions = positions + fallback[len(positions):]
    positions = positions[:count]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lamps = []
    for index, (x, y) in enumerate(positions, start=1):
        # Raycast against the original circuit before this mast is imported.
        z = ground_z(scene, x, y, depsgraph)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(mast_path))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        roots = [obj for obj in imported if obj.type == 'EMPTY' and 'stadium_floodlight_mast' in obj.name]
        if not roots:
            roots = [obj for obj in imported if obj.parent is None]
        if not roots:
            raise RuntimeError(f'Could not find mast root for light {index}')
        root = roots[0]
        for obj in imported:
            move_to_collection(obj, mast_col)
            obj['yas_generated_mast'] = True
            obj['yas_floodlight_index'] = index
            obj.name = f'YAS_FLOOD_{index:02d}_{obj.name}'
            if obj.type == 'MESH':
                for material in obj.data.materials:
                    if material and 'floodlight_lens' in material.name.lower() and material.use_nodes:
                        bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                        if bsdf:
                            if 'Emission Color' in bsdf.inputs:
                                bsdf.inputs['Emission Color'].default_value = (1.0, 0.92, 0.76, 1.0)
                            if 'Emission Strength' in bsdf.inputs:
                                bsdf.inputs['Emission Strength'].default_value = 3.0
        direction = Vector((center.x - x, center.y - y, 0.0))
        yaw = math.atan2(-direction.x, direction.y) if direction.length > 1e-4 else 0.0
        root.location = (x, y, z)
        root.rotation_euler = Euler((0.0, 0.0, yaw), 'XYZ')
        root['yas_generated_mast'] = True
        root['yas_floodlight_index'] = index

        light_data = bpy.data.lights.new(f'YAS_FLOODLIGHT_{index:02d}_beam', 'AREA')
        light_data.energy = 1200000.0
        light_data.shape = 'DISK'
        light_data.size = 48.0
        light_data.color = (1.0, 0.93, 0.82)
        light_data.use_shadow = False
        light_obj = bpy.data.objects.new(f'YAS_PREVIEW_FLOOD_{index:02d}', light_data)
        preview_col.objects.link(light_obj)
        light_obj.location = (x, y, z + 35.0)
        light_obj['preview_only'] = True
        light_obj['yas_generated_night'] = True
        target = Vector((center.x * 0.45 + x * 0.55, center.y * 0.45 + y * 0.55, center.z + 5.0))
        look_at(light_obj, target)
        lamps.append(light_obj)
    return positions, lamps


def add_moon_fill(scene, col, center):
    data = bpy.data.lights.new('YAS_MOON_FILL', 'SUN')
    data.energy = 0.35
    data.angle = math.radians(22.0)
    data.color = (0.40, 0.52, 0.85)
    data.use_shadow = False
    obj = bpy.data.objects.new('Moon_fill_preview', data)
    col.objects.link(obj)
    obj.location = (center.x - 900.0, center.y - 1200.0, center.z + 2200.0)
    look_at(obj, (center.x, center.y, center.z))
    obj['preview_only'] = True
    obj['yas_generated_night'] = True
    return obj


def add_camera(scene, col, name, pos, target, lens=50.0, ortho=None):
    data = bpy.data.cameras.new(name + ' lens')
    obj = bpy.data.objects.new('YAS_VIEW_' + name, data)
    col.objects.link(obj)
    obj.location = Vector(pos)
    look_at(obj, target)
    data.lens = lens
    data.clip_start = 0.1
    data.clip_end = 30000.0
    if ortho is not None:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    obj['preview_only'] = True
    obj['yas_generated_night'] = True
    return obj


def setup_compositor(scene):
    # Blender 5.2 moved compositing to a node-group API. Keep the saved scene
    # on a deterministic direct EEVEE path; the floodlight lenses remain emissive.
    scene.render.use_compositing = False
    print('[YAS-10VIEWS] EEVEE direct output; compositor bloom disabled.', flush=True)


def export_track_glb(scene, out_path):
    roots = [o for o in scene.objects if o.type == 'EMPTY' and o.name == 'YAS_MARINA_2021_METRIC_ROOT']
    if not roots:
        raise RuntimeError('Metric Yas root is missing; refusing a misleading track export.')
    export_objects = [o for o in scene.objects if o.type in {'MESH', 'EMPTY'} and not o.get('preview_only')]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kwargs = dict(filepath=str(out_path), use_selection=True, export_format='GLB',
                  export_extras=True, export_cameras=False, export_lights=False,
                  export_yup=True)
    if 'export_apply' in props:
        kwargs['export_apply'] = True
    if 'export_vertex_color' in props:
        kwargs['export_vertex_color'] = 'NAME'
        kwargs['export_vertex_color_name'] = 'AO'
    elif 'export_colors' in props:
        kwargs['export_colors'] = True
    if 'export_all_vertex_colors' in props:
        kwargs['export_all_vertex_colors'] = False
    print('[YAS-10VIEWS] Exporting', len(export_objects), 'mesh/empty objects to', out_path, flush=True)
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    a = cli_args()
    for path in (a.blend, a.sky, a.sky_meta, a.mast):
        if not Path(path).exists():
            raise FileNotFoundError(path)
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    glb_path = Path(a.glb)
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=a.blend)
    scene = bpy.context.scene

    old_positions = clear_previous_generated(scene)
    lo, hi = scene_bounds(scene)
    center = (lo + hi) * 0.5
    print('[YAS-10VIEWS] Blender', bpy.app.version_string, 'bounds', tuple(lo), tuple(hi), flush=True)

    presentation = link_collection(scene, 'YAS NIGHT PRESENTATION — preview only')
    masts = link_collection(scene, 'YAS Marina | floodlight instances')
    make_prepared_skydome(scene, presentation, a.sky, a.sky_meta, a.sky_intensity)
    positions, lamps = add_floodlight_instances(scene, a.mast, presentation, masts,
                                                 old_positions, a.mast_count, center)
    add_moon_fill(scene, presentation, center)

    # Preview settings are tuned for fast, clean EEVEE output in 5.2.4.
    scene.render.engine = 'BLENDER_EEVEE'
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = max(8, min(32, a.samples))
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'use_raytracing'):
        scene.eevee.use_raytracing = False
    scene.render.resolution_x = a.width
    scene.render.resolution_y = a.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0.5
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    setup_compositor(scene)

    # The overview uses the full model bounds; all remaining cameras are
    # intentionally aimed at real visible sectors of this circuit mesh.
    cx, cy, cz = center.x, center.y, center.z
    views = [
        ('01_overview', 'Full circuit — aerial overview', (cx, cy, cz + 4700), (cx, cy, cz), 50, 3550),
        ('02_hero_straight', 'Main straight — night approach', (cx + 150, cy + 2250, cz + 310), (cx, cy + 640, cz + 18), 58, None),
        ('03_pit_complex', 'Pit complex — garages and entry', (cx - 1680, cy - 1420, cz + 520), (cx - 790, cy - 480, cz + 20), 52, None),
        ('04_hotel_sector', 'Hotel sector — floodlit bend', (cx + 1580, cy + 1450, cz + 850), (cx + 650, cy + 500, cz + 24), 52, None),
        ('05_north_loop', 'North loop — elevated view', (cx + 980, cy + 1760, cz + 600), (cx + 570, cy + 720, cz + 20), 58, None),
        ('06_south_marina', 'South section — low oblique', (cx - 1500, cy - 920, cz + 600), (cx - 470, cy - 240, cz + 18), 56, None),
        ('07_central_chicane', 'Central link — track-level', (cx + 520, cy - 1230, cz + 430), (cx + 190, cy + 70, cz + 20), 58, None),
        ('08_west_sweeper', 'West sweeper — floodlight view', (cx - 1830, cy + 420, cz + 520), (cx - 920, cy + 180, cz + 18), 60, None),
        ('09_east_sweeper', 'East sweeper — night panorama', (cx + 2090, cy + 430, cz + 720), (cx + 820, cy + 200, cz + 24), 56, None),
        ('10_full_hero', 'Yas Marina — full night hero', (cx + 40, cy - 3200, cz + 1460), (cx, cy + 40, cz + 20), 42, None),
    ]
    if a.limit_views > 0:
        views = views[:max(1, min(a.limit_views, len(views)))]
    cameras = []
    for slug, title, pos, target, lens, ortho in views:
        cam = add_camera(scene, presentation, slug, pos, target, lens=lens, ortho=ortho)
        cam['view_title'] = title
        cameras.append((slug, title, cam))

    # Keep the realistic waterline horizon from the prepared sky and aim each
    # floodlight beam toward the center of the mapped circuit.
    for light in lamps:
        light.data.energy = 1200000.0
    scene['night_environment'] = 'Repository-prepared sky_night_4k.webp + sky_night.json; decoded using the repository skydome mapping.'
    scene['night_floodlight_asset'] = str(Path(a.mast).resolve())
    scene['night_floodlight_instances'] = len(positions)
    scene['visual_preview'] = f'{len(views)} real Blender camera renders; sky dome/cameras/lights are preview-only.'

    report_path = Path(a.blend).with_suffix('.json')
    report = {}
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text(encoding='utf-8'))
        except Exception:
            report = {}
    report.update({
        'blender_version': bpy.app.version_string,
        'night_environment': 'Repository-prepared sky_night_4k.webp + sky_night.json; CC0 source and conversion recorded in source/tools/circuits/hdr_to_sky.py.',
        'night_floodlight_asset': str(Path(a.mast).resolve()),
        'night_floodlight_instances': len(positions),
        'rendered_views': [str(out_dir / f'{slug}.png') for slug, _, _ in cameras],
        'preview_only_objects': 'sky dome, preview cameras, area lights, moon fill; excluded from the GLB export',
    })

    for index, (slug, title, cam) in enumerate(cameras, start=1):
        scene.camera = cam
        scene.render.filepath = str(out_dir / f'{slug}.png')
        print(f'[YAS-10VIEWS] Rendering {index}/{len(cameras)} — {title} -> {scene.render.filepath}', flush=True)
        bpy.ops.render.render(write_still=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')

    # Save the actual scene with the prepared sky packed; leave the hero camera active.
    scene.camera = cameras[-1][2]
    bpy.ops.file.pack_all()
    print('[YAS-10VIEWS] Saving scene', a.blend, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=a.blend, compress=True)
    export_track_glb(scene, glb_path)
    report['night_glb'] = str(glb_path.resolve())
    report['night_glb_bytes'] = glb_path.stat().st_size
    report['rendered_views_complete'] = len(cameras)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'[YAS-10VIEWS] COMPLETE — {len(cameras)} renders, .blend and GLB exported', flush=True)


if __name__ == '__main__':
    main()
