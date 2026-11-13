#!/usr/bin/env python3
"""Exact mesh raycast validation for the generated Yas pit lane candidate.
Run with Blender 5.2.4 and the supplied Yas .blend open via -b.
"""
from pathlib import Path
import json
import math
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROAD_NAMES = ['Object_37', 'Object_38', 'Object_39', 'Object_40']
PIT = Path('/workspace/project-yas-marina/source/game/public/track_yas/pitlane.json')
OUT = Path('/workspace/tools/yas_estimated_route/yas_pitlane_mesh_validation.json')
ROAD = [bpy.data.objects.get(n) for n in ROAD_NAMES]
if any(o is None or o.type != 'MESH' for o in ROAD):
    raise RuntimeError('missing Yas road mesh')
verts, faces = [], []
for ob in ROAD:
    mesh = ob.data
    mesh.calc_loop_triangles()
    off = len(verts)
    verts.extend(ob.matrix_world @ v.co for v in mesh.vertices)
    faces.extend(tuple(off + idx for idx in tri.vertices) for tri in mesh.loop_triangles)
bvh = BVHTree.FromPolygons(verts, faces, all_triangles=True)
z_top = max(float((ob.matrix_world @ v.co).z) for ob in ROAD for v in ob.data.vertices) + 35.0
pit = json.loads(PIT.read_text())
px = np.asarray(pit['x'], dtype=np.float64)
pz = np.asarray(pit['z'], dtype=np.float64)
ps = np.asarray(pit['s'], dtype=np.float64)
pd = np.asarray(pit['d'], dtype=np.float64)
points = []
for i in range(len(px) - 1):
    dx, dz = px[i+1] - px[i], pz[i+1] - pz[i]
    dist = math.hypot(dx, dz)
    n = max(1, int(math.ceil(dist / 0.5)))
    for k in range(n):
        f = k / n
        points.append((px[i] + dx*f, pz[i] + dz*f, ps[i] + (ps[i+1]-ps[i])*f, pd[i] + (pd[i+1]-pd[i])*f))
points.append((px[-1], pz[-1], ps[-1], pd[-1]))
misses = []
hits = 0
for x, z, s, d in points:
    loc = bvh.ray_cast(Vector((float(x), float(-z), z_top)), Vector((0.0,0.0,-1.0)), 140.0)[0]
    if loc is None:
        misses.append({'s_mod_m':round(float(s),2),'d_m':round(float(d),2),'x':round(float(x),3),'z':round(float(z),3)})
    else:
        hits += 1
report = {
    'status':'estimated/non-official route; exact raycast against Yas road meshes',
    'source_meshes':ROAD_NAMES,
    'path_points':len(px),
    'validation_samples_spacing_max_m':0.5,
    'validation_sample_count':len(points),
    'ray_hit_count':hits,
    'ray_hit_fraction':hits/len(points),
    'miss_count':len(misses),
    'first_20_misses':misses[:20],
    'pitlane_json_status':pit.get('status'),
    'pitlane_grid_coverage':pit.get('paved_cell_coverage'),
    'no_Spa_or_Monza_meshes_used':True,
}
OUT.write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
