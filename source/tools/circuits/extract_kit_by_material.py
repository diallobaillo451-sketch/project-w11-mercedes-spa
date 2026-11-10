"""Extract kit pieces from a Sketchfab-style circuit GLB by material name.

Usage (headless):
  CID=imola SRC=/path/to.glb OUT=/path/to/out \
    blender -b -t 2 --python extract_kit_by_material.py -- mat1 mat2 ...

Or open an existing stage blend:
  CID=imola STAGE=t1_raw OUT=... blender -b --python ... -- mat1 ...

Writes one GLB per material (faces isolated, transforms applied, origin = ground
center of the piece) plus report.json (tris, bbox metres, world location).
"""
import bpy, sys, os, json, math, re
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
CID = os.environ.get('CID', 'kit')
SRC = os.environ.get('SRC')
STAGE = os.environ.get('STAGE')  # e.g. t1_raw — opens work blend
OUT = os.environ.get('OUT') or (argv[0] if argv else None)
mats_arg = argv[1:] if (argv and os.environ.get('OUT')) else argv
if os.environ.get('MATS_FILE'):
    mats_arg = [ln.strip() for ln in open(os.environ['MATS_FILE']) if ln.strip() and not ln.startswith('#')]

assert OUT, 'OUT= dir required'
os.makedirs(OUT, exist_ok=True)

def base(n):
    return re.sub(r'\.\d{3}$', '', n or '')

def slug(n):
    s = re.sub(r'[^A-Za-z0-9]+', '_', (n or 'piece')).strip('_').lower()
    return s or 'piece'

def mat_matches(mname, wanted):
    if not mname:
        return None
    b = base(mname)
    for w in wanted:
        wb = base(w)
        if mname == w or b == wb or b.lower() == wb.lower() or mname.lower() == w.lower():
            return w
    return None

# load
if STAGE:
    blend = f"/workspace/w11-shared/work/circuits/{CID}/stages/{STAGE}.blend"
    print('OPEN', blend)
    bpy.ops.wm.open_mainfile(filepath=blend)
elif SRC:
    print('IMPORT', SRC)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
else:
    raise SystemExit('SRC or STAGE required')

# gather wanted faces
wanted = mats_arg
print('WANTED', wanted)
found_mats = {}
for m in bpy.data.materials:
    hit = mat_matches(m.name, wanted)
    if hit:
        found_mats.setdefault(hit, []).append(m.name)
print('FOUND', {k: v for k, v in found_mats.items()})

report = {'cid': CID, 'src': SRC, 'stage': STAGE, 'pieces': {}}

# For each wanted material, build a new mesh from matching faces across all objects
for want in wanted:
    names = found_mats.get(want) or []
    if not names:
        report['pieces'][want] = {'error': 'material not found'}
        print('MISSING', want)
        continue
    # collect
    import bmesh, numpy as np
    bm_out = bmesh.new()
    tris = 0
    src_objs = []
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or not o.data.materials:
            continue
        me = o.data
        slot_idx = [i for i, m in enumerate(me.materials) if m and m.name in names]
        if not slot_idx:
            continue
        # transform faces into world
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        # apply world matrix
        bm.transform(o.matrix_world)
        keep = [f for f in bm.faces if f.material_index in slot_idx]
        if not keep:
            bm.free()
            continue
        src_objs.append(o.name)
        # copy kept faces into bm_out
        # Use a temp mesh
        tmp = bpy.data.meshes.new('_tmp')
        bm2 = bm.copy()
        bm2.faces.ensure_lookup_table()
        bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.material_index not in slot_idx], context='FACES')
        bm2.to_mesh(tmp)
        bm2.free()
        bm_out.from_mesh(tmp)
        tris += len(tmp.polygons)
        bpy.data.meshes.remove(tmp)
        bm.free()

    if not len(bm_out.verts):
        bm_out.free()
        report['pieces'][want] = {'error': 'no faces'}
        print('EMPTY', want)
        continue

    # origin = bottom center (min Z, xy mean of bbox)
    coords = np.array([v.co[:] for v in bm_out.verts])
    mn, mx = coords.min(0), coords.max(0)
    origin = Vector(((mn[0]+mx[0])/2, (mn[1]+mx[1])/2, mn[2]))
    bmesh.ops.translate(bm_out, verts=bm_out.verts, vec=-origin)
    me_out = bpy.data.meshes.new(slug(want))
    bm_out.to_mesh(me_out)
    bm_out.free()
    # assign a clean-ish material name
    mat = bpy.data.materials.get(names[0])
    if mat:
        me_out.materials.append(mat)
    ob = bpy.data.objects.new(slug(want), me_out)
    bpy.context.scene.collection.objects.link(ob)
    # export only this object
    for x in bpy.data.objects:
        x.select_set(x == ob)
    bpy.context.view_layer.objects.active = ob
    out_path = os.path.join(OUT, slug(want) + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        use_selection=True,
        export_format='GLB',
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    size = list((mx-mn).round(3)) if hasattr((mx-mn), 'round') else [round(float(x),3) for x in (mx-mn)]
    entry = {
        'file': os.path.basename(out_path),
        'bytes': os.path.getsize(out_path),
        'tris': int(len(me_out.loop_triangles) if me_out.loop_triangles else len(me_out.polygons)),
        'bbox_xyz_m': [round(float(x), 3) for x in (mx-mn)],
        'origin_world_xyz': [round(float(x), 3) for x in origin],
        'source_materials': names,
        'source_objects': src_objs,
        'scale_notes': {},
    }
    # scale heuristics
    dx, dy, dz = entry['bbox_xyz_m']
    entry['scale_notes']['height_m'] = dz
    entry['scale_notes']['footprint_m'] = [dx, dy]
    report['pieces'][want] = entry
    print('EXPORT', want, entry)
    # remove exported object to keep scene lighter
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me_out)

rep_path = os.path.join(OUT, 'report.json')
json.dump(report, open(rep_path, 'w'), indent=2)
print('REPORT', rep_path)
