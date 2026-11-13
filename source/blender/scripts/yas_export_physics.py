#!/usr/bin/env python3
"""Bake Yas-only track surface samples and candidate barriers from the supplied Blender model.

Run with Blender 5.2.4:
  blender -b source/blender/stages/yas_marina_2021.blend --python source/blender/scripts/yas_export_physics.py
All route points are estimated from the FIA 2021 plan and aligned to the supplied Yas model.
"""
from pathlib import Path
import json
import os
import time
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path('/workspace/tools/yas_estimated_route')
ROUTE_PATH = Path(os.environ.get('YAS_CENTERLINE_PATH', str(ROOT / 'yas_centerline_final_xy.npy')))
OUT = ROOT / os.environ.get('YAS_PHYSICS_OUT', 'yas_physics_sampled.npz')
REPORT = ROOT / os.environ.get('YAS_PHYSICS_REPORT', 'yas_physics_bake_report.json')
ROAD_NAMES = ['Object_37', 'Object_38', 'Object_39', 'Object_40']
SURFACE_NAMES = os.environ.get('YAS_SURFACE_NAMES', 'Object_40').split(',')
N_LAT = 361
D0 = -45.0
DSTEP = 0.25
RAY_TOP_MARGIN = 35.0
RAY_DEPTH = 140.0

started = time.time()
route = np.load(ROUTE_PATH).astype(np.float64)
N = len(route)
if N != 3882:
    raise ValueError(f'expected 3,882 centerline samples, got {N}')
route_closed = np.vstack((route, route[0]))
route_length = float(np.linalg.norm(np.diff(route_closed, axis=0), axis=1).sum())
if not np.isfinite(route_length) or route_length < 5000.0:
    raise ValueError(f'implausible Yas centerline length: {route_length:.2f} m')
road_objects = [bpy.data.objects.get(name) for name in ROAD_NAMES]
surface_objects = [bpy.data.objects.get(name) for name in SURFACE_NAMES]
if any(o is None or o.type != 'MESH' for o in road_objects + surface_objects):
    raise RuntimeError('missing one of the Yas road meshes: ' + ', '.join(ROAD_NAMES))

# Blender source uses Z-up / XY plan; runtime glTF uses Y-up / XZ plan.
cx = route[:, 0].copy()
cz = -route[:, 1].copy()
delta = np.roll(route, -2, axis=0) - np.roll(route, 2, axis=0)
norm = np.linalg.norm(delta, axis=1)
tx = delta[:, 0] / np.maximum(norm, 1e-9)
ty = delta[:, 1] / np.maximum(norm, 1e-9)
# Right in game X/Z becomes (ty, -tx) in Blender X/Y.
rx, ry = ty, -tx

# Use one selected Yas surface layer; unioning stacked objects can jump between decks.
verts = []
faces = []
for ob in surface_objects:
    mesh = ob.data
    mesh.calc_loop_triangles()
    off = len(verts)
    verts.extend(ob.matrix_world @ v.co for v in mesh.vertices)
    faces.extend(tuple(off + idx for idx in tri.vertices) for tri in mesh.loop_triangles)
print(f'road BVH input: {len(verts):,} vertices, {len(faces):,} triangles')
bvh = BVHTree.FromPolygons(verts, faces, all_triangles=True)
if bvh is None:
    raise RuntimeError('could not build Yas road BVH')

z_top = max(float((ob.matrix_world @ v.co).z) for ob in surface_objects for v in ob.data.vertices) + RAY_TOP_MARGIN
down = Vector((0.0, 0.0, -1.0))
cy = np.full(N, np.nan, dtype=np.float32)
center_hit = np.zeros(N, dtype=np.uint8)
for i in range(N):
    hit = bvh.ray_cast(Vector((float(cx[i]), float(route[i, 1]), z_top)), down, RAY_DEPTH)
    if hit[0] is not None:
        cy[i] = float(hit[0].z)
        center_hit[i] = 1
valid = np.flatnonzero(center_hit)
if len(valid) < int(N * 0.90):
    raise RuntimeError(f'only {len(valid)}/{N} center samples ray-hit Yas asphalt')
missing = np.flatnonzero(center_hit == 0)
# A nearest-neighbor fallback creates vertical height steps at mesh gaps. Interpolate
# between adjacent valid Yas ray hits, including across the lap seam.
valid_f = valid.astype(np.float64)
valid_z = cy[valid].astype(np.float64)
x_ext = np.concatenate(([valid_f[-1] - N], valid_f, [valid_f[0] + N]))
z_ext = np.concatenate(([valid_z[-1]], valid_z, [valid_z[0]]))
cy[missing] = np.interp(missing.astype(np.float64), x_ext, z_ext).astype(np.float32)
miss_mask = center_hit == 0
max_run_rows = 0
for start in np.flatnonzero(miss_mask & ~np.roll(miss_mask, 1)):
    run = 0
    while run < N and miss_mask[(int(start) + run) % N]:
        run += 1
    max_run_rows = max(max_run_rows, run)
max_center_step = float(np.max(np.abs(np.roll(cy, -1) - cy)))
print(f'centerline ray hits: {int(center_hit.sum())}/{N} ({center_hit.mean()*100:.2f}%), z range {cy.min():.3f}..{cy.max():.3f}, max adjacent height step {max_center_step:.3f} m')

# Raster physics surface: asphalt mesh hits = type 1; outside the supplied paved meshes = type 4.
ND = N_LAT
D = D0 + np.arange(ND, dtype=np.float64) * DSTEP
absolute_h = np.empty((N, ND), dtype=np.float32)
types = np.full((N, ND), 4, dtype=np.uint8)
jc = ND // 2
start_flat = time.time()
for i in range(N):
    for j, d in enumerate(D):
        wx = cx[i] + rx[i] * d
        wy = route[i, 1] + ry[i] * d
        hit = bvh.ray_cast(Vector((float(wx), float(wy), z_top)), down, RAY_DEPTH)
        if hit[0] is not None:
            absolute_h[i, j] = float(hit[0].z)
            types[i, j] = 1
        else:
            # No terrain mesh is provided: keep a conservative, shallow grass fallback near the road height.
            absolute_h[i, j] = cy[i] - 0.20
    if (i + 1) % 300 == 0 or i + 1 == N:
        done = (i + 1) * ND
        print(f'surface raycasts {done:,}/{N*ND:,} ({done/(N*ND)*100:.1f}%)')

# The source model has short centerline gaps. Fill an 8 m-wide central corridor at those
# rows with interpolated center heights and lateral offsets from the same selected layer.
types[:, jc] = 1
absolute_h[:, jc] = cy
bridge_half_width = 4.0
bridge_cols = np.abs(D) <= bridge_half_width
valid_idx = np.flatnonzero(center_hit)
for i in missing:
    pos = int(np.searchsorted(valid_idx, i))
    left = int(valid_idx[pos - 1]) if pos > 0 else int(valid_idx[-1] - N)
    right = int(valid_idx[pos]) if pos < len(valid_idx) else int(valid_idx[0] + N)
    li, ri = left % N, right % N
    f = (float(i) - left) / max(1.0, float(right - left))
    types[i, bridge_cols] = 1
    for j in np.flatnonzero(bridge_cols):
        rel_l = float(absolute_h[li, j] - cy[li]) if types[li, j] == 1 else 0.0
        rel_r = float(absolute_h[ri, j] - cy[ri]) if types[ri, j] == 1 else 0.0
        absolute_h[i, j] = cy[i] + rel_l * (1.0 - f) + rel_r * f
relative_cm = np.rint((absolute_h - cy[:, None]) * 100.0).astype(np.int32)
relative_cm = np.clip(relative_cm, -4096, 4095)
packed = (((relative_cm + 4096) << 3) | types.astype(np.int32)).astype('<u2')

# Extract vertical face candidates carrying the supplied model's tentrail material; filter by route proximity and height.
route_tree = KDTree(N)
for i, (x, y) in enumerate(route):
    route_tree.insert(Vector((float(x), 0.0, float(y))), i)
route_tree.balance()
barrier_tris = []
barrier_source_counts = {}
for ob in bpy.data.objects:
    if ob.type != 'MESH' or ob.name in ROAD_NAMES:
        continue
    mesh = ob.data
    if not any(m and m.name.startswith('tentrail') for m in mesh.materials):
        continue
    mesh.calc_loop_triangles()
    local_count = 0
    for tri in mesh.loop_triangles:
        mi = tri.material_index
        if mi >= len(mesh.materials) or not mesh.materials[mi] or not mesh.materials[mi].name.startswith('tentrail'):
            continue
        a, b, c = [ob.matrix_world @ mesh.vertices[k].co for k in tri.vertices]
        nrm = (b - a).cross(c - a)
        area_n = nrm.length
        if area_n < 1e-7 or abs(nrm.z) / area_n > 0.35:
            continue
        minz = min(a.z, b.z, c.z)
        maxz = max(a.z, b.z, c.z)
        if maxz - minz < 0.50 or maxz - minz > 24.0:
            continue
        mid = (a + b + c) / 3.0
        near = route_tree.find(Vector((mid.x, 0.0, mid.y)))
        if near is None or near[2] > 20.0:
            continue
        ground = float(cy[int(near[1])])
        if minz > ground + 1.25 or maxz < ground + 0.30:
            continue
        barrier_tris.append(((a.x, a.y, a.z), (b.x, b.y, b.z), (c.x, c.y, c.z)))
        local_count += 1
    if local_count:
        barrier_source_counts[ob.name] = local_count
barrier_tris = np.asarray(barrier_tris, dtype=np.float32).reshape((-1, 3, 3))
if len(barrier_tris) < 100:
    raise RuntimeError(f'too few Yas tentrail vertical barrier triangles: {len(barrier_tris)}')

np.savez_compressed(OUT,
    route_xy=route.astype(np.float32), cx=cx.astype(np.float32), cy=cy.astype(np.float32), cz=cz.astype(np.float32),
    surface_packed=packed, surface_types=types, center_hit=center_hit,
    barrier_triangles_blender_xyz=barrier_tris)
report = {
    'status': 'estimated/non-official runtime candidate',
    'source': 'Blender 5.2.4 supplied Yas Marina model; FIA 2021 plan-aligned estimated route',
    'road_objects': ROAD_NAMES,
    'surface_objects': SURFACE_NAMES,
    'barrier_source_material': 'tentrail* materials on non-road meshes; near-centerline vertical triangles only',
    'centerline_samples': N,
    'centerline_ray_hit_count': int(center_hit.sum()),
    'centerline_ray_hit_fraction': float(center_hit.mean()),
    'centerline_height_max_adjacent_step_m': max_center_step,
    'estimated_gap_fill': {'method': 'periodic linear interpolation of selected-layer center height and lateral offsets between adjacent valid Yas ray hits', 'missing_center_rows': int(len(missing)), 'max_missing_run_rows': int(max_run_rows), 'paved_corridor_half_width_m': bridge_half_width, 'non_official': True},
    'centerline_length_m': route_length,
    'surface_grid': {'N': N, 'ND': ND, 'D0_m': D0, 'DSTEP_m': DSTEP, 'ds_m': route_length / N, 'packed_type_counts': {str(int(k)): int(v) for k, v in zip(*np.unique(types, return_counts=True))}},
    'barrier_triangle_count': int(len(barrier_tris)),
    'barrier_source_objects': barrier_source_counts,
    'no_Spa_or_Monza_geometry_or_physics_data_used': True,
    'terrain_limitation': 'No distinct Yas terrain mesh was available; non-asphalt cells use a shallow type-4 fallback at nearest route height.',
    'elapsed_seconds': time.time() - started,
}
REPORT.write_text(json.dumps(report, indent=2))
print('saved', OUT, f'({OUT.stat().st_size/1e6:.2f} MB)')
print('barrier candidates', len(barrier_tris), 'sources', barrier_source_counts)
print('elapsed', round(time.time() - started, 1), 's')
