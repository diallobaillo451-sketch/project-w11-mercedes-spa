"""Bake Interlagos surface.bin/surface.json from the supplied GLB working copy.

Conservative physics tags: Object_109 asphalt (1), Object_24 grass (4), and
Object_25 terrain fallback (4, geometry only; its satellite texture is not read).
Object_87 supplies only one exact center-height fallback at the audited mesh seam
near s=3849 m; it is not treated as a general asphalt surface. Other scenery is excluded.

Usage from repository root:
  INTERLAGOS_CENTERLINE=source/blender/work/interlagos_2023/interlagos_centerline.json \\
  INTERLAGOS_TRACK_OUT=source/game/public/track_interlagos \\
  blender -b source/blender/work/interlagos_2023/interlagos_2023_source.blend \\
    --python source/blender/scripts/interlagos_2023_build_surface.py
"""
import bpy, json, os, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[3]
BLEND = Path(os.environ.get('INTERLAGOS_BLEND_IN', str(REPO / 'source/blender/work/interlagos_2023/interlagos_2023_source.blend')))
CENTERLINE = Path(os.environ.get('INTERLAGOS_CENTERLINE', str(REPO / 'source/blender/work/interlagos_2023/interlagos_centerline.json')))
OUT = Path(os.environ.get('INTERLAGOS_TRACK_OUT', str(REPO / 'source/game/public/track_interlagos')))
D0 = float(os.environ.get('INTERLAGOS_D0', '-45'))
DSTEP = float(os.environ.get('INTERLAGOS_DSTEP', '0.5'))
D1 = float(os.environ.get('INTERLAGOS_D1', '45'))
if not CENTERLINE.is_file(): raise FileNotFoundError(f'Centreline absent : {CENTERLINE}')
if not OUT.is_absolute(): OUT = (REPO / OUT).resolve()
OUT.mkdir(parents=True, exist_ok=True)

# The invoking command normally opens the source .blend; also accept direct script use.
if bpy.data.filepath != str(BLEND) and BLEND.is_file():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
center = json.loads(CENTERLINE.read_text())
xw = np.asarray(center['points_x_blender'], dtype=np.float64)
yw = np.asarray(center['points_y_blender'], dtype=np.float64)
N = len(xw)
if N < 1000 or len(yw) != N: raise RuntimeError(f'Centreline length/count invalid: N={N}')
L = float(center['length_m'])
ds = L / N
SEAM_STATION_M = 3849.0
SEAM_INDEX = int(round(SEAM_STATION_M / ds))
SEAM_XY = (-445.3926, 237.0459)


def make_bvh(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != 'MESH':
        raise RuntimeError(f'Mesh requis absent : {name}')
    obj.data.calc_loop_triangles()
    M = obj.matrix_world
    verts = [M @ v.co for v in obj.data.vertices]
    tris = [tuple(t.vertices) for t in obj.data.loop_triangles]
    if not tris: raise RuntimeError(f'Mesh vide : {name}')
    tree = BVHTree.FromPolygons(verts, tris, all_triangles=True)
    return tree, len(tris)

road_bvh, road_tris = make_bvh('Object_109')
grass_bvh, grass_tris = make_bvh('Object_24')
terrain_bvh, terrain_tris = make_bvh('Object_25')
seam_bvh, seam_tris = make_bvh('Object_87')

def cast(tree, x, y):
    hit = tree.ray_cast(Vector((float(x), float(y), 160.0)), Vector((0.0, 0.0, -1.0)), 320.0)
    return None if hit[0] is None else float(hit[0].z)

# Track-right direction in Blender horizontal XY. In game/glTF coordinates (x,z)= (X,-Y).
dx = np.roll(xw, -2) - np.roll(xw, 2)
dy = np.roll(yw, -2) - np.roll(yw, 2)
norm = np.maximum(np.hypot(dx, dy), 1e-9)
tx, ty = dx / norm, dy / norm
rx, ry = ty, -tx
ND = int(round((D1 - D0) / DSTEP)) + 1
D = D0 + np.arange(ND, dtype=np.float64) * DSTEP
jc = (ND - 1) // 2
H = np.empty((N, ND), dtype=np.float32)
T = np.zeros((N, ND), dtype=np.uint8)
G = np.zeros((N, ND), dtype=np.uint8)  # masque séparé : hits directs d'Object_24 seulement
center_z = np.empty(N, dtype=np.float32)
center_snap = np.zeros(N, dtype=np.float32)
center_object87_fallback = np.zeros(N, dtype=bool)
road_center_hits = road_center_snaps = center_cells_bridged = 0
road_center_snap_max = 0.0
road_hits = grass_hits = terrain_hits = 0

for i in range(N):
    # Determine the true centerline elevation from the asphalt mesh itself.
    zc = cast(road_bvh, xw[i], yw[i])
    direct_hit = zc is not None
    snap = 0.0
    if zc is None:
        # Bridge only a small seam in the imported triangles; record each bounded lateral snap.
        for step in np.arange(0.5, 5.01, 0.5):
            for sign in (-1.0, 1.0):
                dd = sign * float(step)
                zc = cast(road_bvh, xw[i] + rx[i] * dd, yw[i] + ry[i] * dd)
                if zc is not None:
                    snap = float(step); road_center_snaps += 1
                    road_center_snap_max = max(road_center_snap_max, snap)
                    break
            if zc is not None: break
    if direct_hit: road_center_hits += 1
    if zc is None and i == SEAM_INDEX and abs(i * ds - SEAM_STATION_M) < 0.1 and np.hypot(xw[i] - SEAM_XY[0], yw[i] - SEAM_XY[1]) < 0.05:
        zc = cast(seam_bvh, xw[i], yw[i])
        if zc is not None: center_object87_fallback[i] = True
    if zc is None:
        raise RuntimeError(f'No asphalt hit at centerline s={i * ds:.1f} m; inspect alignment before baking')
    center_z[i] = zc
    center_snap[i] = snap
    for j, d in enumerate(D):
        px = xw[i] + rx[i] * d
        py = yw[i] + ry[i] * d
        zh = cast(road_bvh, px, py)
        if zh is not None:
            H[i, j] = zh; T[i, j] = 1; road_hits += 1
            continue
        zh = cast(grass_bvh, px, py)
        if zh is not None:
            H[i, j] = zh; T[i, j] = 4; G[i, j] = 1; grass_hits += 1
            continue
        # Terrain is a last-resort elevation source only; image/texture data is never used here.
        zh = cast(terrain_bvh, px, py)
        if zh is not None:
            H[i, j] = zh; T[i, j] = 4; terrain_hits += 1
            continue
        H[i, j] = zc - 1.0
        T[i, j] = 0
    if (0.0 < snap <= 2.0 or center_object87_fallback[i]) and T[i, jc] != 1:
        # Bridge a small seam from a measured asphalt height; Object_87 is exact-point only.
        H[i, jc] = zc; T[i, jc] = 1; center_cells_bridged += 1
    if i % 500 == 0: print(f'INTERLAGOS_SURFACE_ROW {i}/{N}')

# Fill isolated no-hit cells from the nearest nearby physical ground cell in the same cross-section.
for i in range(N):
    zeros = np.where(T[i] == 0)[0]
    for j in zeros:
        for step in range(1, 13):
            candidates = (j - step, j + step)
            k = next((q for q in candidates if 0 <= q < ND and T[i, q] in (1, 4)), None)
            if k is not None:
                H[i, j] = H[i, k]
                T[i, j] = 4
                break

# Asphalt/kerb widths are derived directly from contiguous road cells around s-centre.
jc = (ND - 1) // 2
wl = np.empty(N, dtype=np.float32); wr = np.empty(N, dtype=np.float32)
for i in range(N):
    for sign, arr in ((-1, wl), (1, wr)):
        j = jc
        while 0 <= j + sign < ND and T[i, j + sign] in (1, 2, 3):
            j += sign
        arr[i] = max(1.2, min(18.0, abs(j - jc) * DSTEP))
# The source does not provide validated continuous collision barriers. Keep the sampled grass run-off driveable.
wallL = np.full(N, 25.0, dtype=np.float32)
wallR = np.full(N, 25.0, dtype=np.float32)
rel = np.clip(np.round((H - center_z[:, None]) * 100.0) + 4096, 0, 8191).astype(np.uint16)
packed = (rel << 3) | T.astype(np.uint16)
GM_C0, GM_W = 26, 128  # colonnes -32.0 m à +31.5 m; Grass n'instancie qu'entre 2 et 16 m du centre.
if GM_C0 + GM_W > ND or GM_W % 2: raise RuntimeError('Grassmask window must be even and fit the surface grid')
gm = G[:, GM_C0:GM_C0 + GM_W]
gm_packed = (gm[:, 0::2] | (gm[:, 1::2] << 4)).astype(np.uint8)
grassmask_bytes = np.asarray([GM_C0, GM_W], dtype='<u2').tobytes() + gm_packed.tobytes(order='C')
(OUT / 'grassmask.bin').write_bytes(grassmask_bytes)

meta = {
    'note': 'Interlagos surface from the supplied CC BY GLB; Blender coordinates converted to glTF (Y up). Height is relative to cy[i]. No obstacle collisions are baked; Object_25 is elevation fallback only, with no texture data. Object_87 is used only for the exact center sample at s=3849 m after an audited Object_109 gap.',
    'N': N, 'ND': ND, 'D0': D0, 'DSTEP': DSTEP, 'ds': ds, 'length': L,
    'types': {'0': 'vide', '1': 'asphalte', '2': 'vibreur', '3': 'tapis/peint', '4': 'herbe', '5': 'gravier', '6': 'eau', '7': 'objet/mur'},
    'source_meshes': {'Object_109': {'class': 'asphalte', 'type': 1, 'triangles': road_tris}, 'Object_24': {'class': 'herbe', 'type': 4, 'triangles': grass_tris}, 'Object_25': {'class': 'terrain fallback, geometry only', 'type': 4, 'triangles': terrain_tris}, 'Object_87': {'class': 'exact single-sample seam fallback only', 'type': 1, 'triangles': seam_tris}},
    'grassmask': {'file': 'grassmask.bin', 'source': 'direct Object_24 hits only', 'column0': GM_C0, 'width': GM_W, 'packing': '2 four-bit classes per byte'},
    'center_gap_fallback': {'object': 'Object_87', 'station_m': SEAM_STATION_M, 'index': SEAM_INDEX, 'world_xy': list(SEAM_XY), 'uses': 'center cell only; not a general surface classification'},
    'provenance': {'file': 'failed_import_interlagos_circuit_2023_layout.glb', 'author': 'Dave Love / Sketchfab (Tyler_Dave)', 'license_declared': 'CC BY 4.0', 'source_url': 'https://sketchfab.com/3d-models/failed-import-interlagos-circuit-2023-layout-4e5f0ebb2f2b48d289d5f6231c22512b'},
    'cx': [round(float(v), 3) for v in xw],
    'cy': [round(float(v), 3) for v in center_z],
    'cz': [round(float(-v), 3) for v in yw],
    'wl': [round(float(v), 2) for v in wl], 'wr': [round(float(v), 2) for v in wr],
    'wallL': [round(float(v), 2) for v in wallL], 'wallR': [round(float(v), 2) for v in wallR],
}
(OUT / 'surface.bin').write_bytes(packed.tobytes(order='C'))
(OUT / 'surface.json').write_text(json.dumps(meta, separators=(',', ':')))

counts = {str(int(k)): int(v) for k, v in zip(*np.unique(T, return_counts=True))}
stats = {
    'N': N, 'ND': ND, 'length_m': L, 'ds_m': ds, 'D0_m': D0, 'DSTEP_m': DSTEP,
    'sample_cells': int(N * ND), 'type_counts': counts,
    'road_center_direct_hits_percent': 100.0 * road_center_hits / N,
    'road_center_snaps': road_center_snaps, 'road_center_snap_max_m': road_center_snap_max,
    'center_cells_bridged': center_cells_bridged,
    'object87_exact_sample_fallbacks': int(np.count_nonzero(center_object87_fallback)),
    'object87_fallback_stations_m': [float(i * ds) for i in np.where(center_object87_fallback)[0]],
    'road_grid_hits': road_hits, 'grass_grid_hits': grass_hits, 'terrain_fallback_hits': terrain_hits,
    'grassmask_bytes': len(grassmask_bytes), 'grassmask_active_cells': int(np.count_nonzero(G[:, GM_C0:GM_C0 + GM_W])),
    'remaining_empty_cells': int(np.count_nonzero(T == 0)),
    'wl_m_quantiles': [float(v) for v in np.percentile(wl, [5, 50, 95])],
    'wr_m_quantiles': [float(v) for v in np.percentile(wr, [5, 50, 95])],
    'height_relative_cm_minmax': [int(rel.min()), int(rel.max())],
    'warnings': []
}
if np.count_nonzero(T[:, jc] != 1) > max(5, N * 0.005):
    stats['warnings'].append('More than 0.5% of centre samples are not tagged asphalt; inspect centreline.')
if stats['remaining_empty_cells'] > 0:
    stats['warnings'].append('Some distant lateral cells have no ground hit; these are intentionally type 0.')
(OUT / 'surface_stats.json').write_text(json.dumps(stats, indent=2))
print('INTERLAGOS_SURFACE_OK', json.dumps(stats, separators=(',', ':')))
