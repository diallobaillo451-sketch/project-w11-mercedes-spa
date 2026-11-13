#!/usr/bin/env python3
"""Build Yas Marina runtime physics files from the Blender 5.2.4 Yas-only bake.

The surface map is not an official survey: the 2021 FIA plan is digitized and aligned to the
supplied model. Only Yas road meshes and Yas tentrail triangles are used; no Spa/Monza data.
"""
from pathlib import Path
import json
import math
import os
import struct
import time
import numpy as np
import cv2
from scipy.ndimage import median_filter
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw

ROOT = Path('/workspace/tools/yas_estimated_route')
SAMPLED = Path(os.environ.get('YAS_PHYSICS_SAMPLED', str(ROOT / 'yas_physics_sampled.npz')))
OUT = Path(os.environ.get('YAS_RUNTIME_OUT', '/workspace/project-yas-marina/source/game/public/track_yas'))
REPORT = Path(os.environ.get('YAS_ASSETS_REPORT', str(ROOT / 'yas_physics_assets_report.json')))
BAKE_REPORT = Path(os.environ.get('YAS_PHYSICS_BAKE_REPORT', str(ROOT / 'yas_physics_bake_report.json')))
OUT.mkdir(parents=True, exist_ok=True)
NOMINAL_N = 3882
D0, DSTEP = -45.0, 0.25
PX, CELL = 0.20, 8.0
PIT_MIN_COVERAGE = float(os.environ.get('YAS_PIT_MIN_COVERAGE', '0.80'))
# Stations reprojetées géométriquement sur le centerline final (estimations, pas des valeurs FIA).
PIT_LIMIT_FROM_S, PIT_LIMIT_TO_S = 5083.83, 400.16
started = time.time()

bake = np.load(SAMPLED)
N, ND = bake['surface_types'].shape
if (N, ND) != (NOMINAL_N, 361):
    raise ValueError(f'unexpected Yas grid shape {(N, ND)}')
Ds = D0 + np.arange(ND, dtype=np.float64) * DSTEP
jc = ND // 2
T = bake['surface_types'].astype(np.uint8)
packed = bake['surface_packed'].astype('<u2')
cx = bake['cx'].astype(np.float64)
cy = bake['cy'].astype(np.float64)
cz = bake['cz'].astype(np.float64)
route = bake['route_xy'].astype(np.float64)
route_closed = np.vstack([route, route[0]])
length = float(np.linalg.norm(np.diff(route_closed, axis=0), axis=1).sum())
if not np.isfinite(length) or length < 5000.0:
    raise ValueError(f'implausible Yas centerline length: {length:.2f} m')
bake_report = json.loads(BAKE_REPORT.read_text()) if BAKE_REPORT.exists() else {}
surface_objects = bake_report.get('surface_objects', ['Object_37', 'Object_38', 'Object_39', 'Object_40'])
surface_source = ', '.join(surface_objects)

# Road edge estimates: contiguous paved samples from the center, smoothed and bounded to avoid broad aprons.
wl = np.zeros(N, dtype=np.float32)
wr = np.zeros(N, dtype=np.float32)
for i in range(N):
    j = jc
    while j > 0 and T[i, j - 1] in (1, 2, 3):
        j -= 1
    wl[i] = (jc - j) * DSTEP
    j = jc
    while j < ND - 1 and T[i, j + 1] in (1, 2, 3):
        j += 1
    wr[i] = (j - jc) * DSTEP
wl = np.clip(median_filter(wl, size=9, mode='wrap'), 4.0, 9.0).astype(np.float32)
wr = np.clip(median_filter(wr, size=9, mode='wrap'), 4.0, 9.0).astype(np.float32)

# Convert the Yas Blender vertical-face candidates to a 2D runtime collision raster.
tri_xyz = bake['barrier_triangles_blender_xyz'].astype(np.float64)
tri_xz = np.empty((len(tri_xyz), 3, 2), dtype=np.float64)
tri_xz[:, :, 0] = tri_xyz[:, :, 0]
tri_xz[:, :, 1] = -tri_xyz[:, :, 1]
cent = tri_xz.mean(axis=1)
route_xz = np.column_stack([cx, cz])
route_tree = cKDTree(route_xz)
dist_route, near_i = route_tree.query(cent, k=1)
# Discard candidate faces whose plan centroid lies over the paved driving strip; keep side-mounted objects.
# Recompute robust local signed offsets with wrapped central tangents.
prev = np.roll(route_xz, 2, axis=0)
next_ = np.roll(route_xz, -2, axis=0)
tan = next_ - prev
tan /= np.maximum(np.linalg.norm(tan, axis=1)[:, None], 1e-9)
right = np.column_stack([-tan[:, 1], tan[:, 0]])
vec = cent - route_xz[near_i]
lat = np.einsum('ij,ij->i', vec, right[near_i])
edge_half = np.where(lat < 0, wl[near_i], wr[near_i])
keep = (dist_route <= 20.0) & (np.abs(lat) >= np.maximum(2.8, edge_half - 1.2))
tri_xz = tri_xz[keep]
if len(tri_xz) < 100:
    raise RuntimeError(f'not enough Yas barrier faces after edge filtering: {len(tri_xz)}')

lo = tri_xz.reshape(-1, 2).min(axis=0) - 2.0
hi = tri_xz.reshape(-1, 2).max(axis=0) + 2.0
x0 = math.floor(lo[0] / PX) * PX
z0 = math.floor(lo[1] / PX) * PX
W = int(math.ceil((hi[0] - x0) / PX)) + 1
H = int(math.ceil((hi[1] - z0) / PX)) + 1
bar = np.zeros((H, W), dtype=np.uint8)
for k, tri in enumerate(tri_xz):
    p = np.rint((tri - np.array([x0, z0])) / PX).astype(np.int32)
    cv2.fillPoly(bar, [p.reshape(-1, 1, 2)], 255)
    cv2.polylines(bar, [p.reshape(-1, 1, 2)], True, 255, 1, lineType=cv2.LINE_8)
    if (k + 1) % 10000 == 0:
        print(f'barrier face raster {k+1:,}/{len(tri_xz):,}')
bar = cv2.morphologyEx(bar, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
ncc, labels, stats, _ = cv2.connectedComponentsWithStats(bar, 8)
small = stats[:, cv2.CC_STAT_AREA] < 3
bar[small[labels]] = 0
contours, _ = cv2.findContours(bar, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
segments = []
for contour in contours:
    if len(contour) < 2:
        continue
    approx = cv2.approxPolyDP(contour, 0.6, True)[:, 0, :].astype(np.float32)
    if len(approx) < 2:
        continue
    for p0, p1 in zip(approx, np.roll(approx, -1, axis=0)):
        a = np.array([x0 + (float(p0[0]) + 0.5) * PX, z0 + (float(p0[1]) + 0.5) * PX], dtype=np.float32)
        b = np.array([x0 + (float(p1[0]) + 0.5) * PX, z0 + (float(p1[1]) + 0.5) * PX], dtype=np.float32)
        if np.linalg.norm(a - b) < 0.05:
            continue
        segments.append([a[0], a[1], b[0], b[1]])
S = np.asarray(segments, dtype=np.float32).reshape((-1, 4))
K = np.full(len(S), 4, dtype=np.uint8)  # generic Yas-side object/barrier; no Spa collision classes/data copied
if len(S) < 100:
    raise RuntimeError(f'not enough Yas collision segments: {len(S)}')
print(f'Yas barrier contours: {len(tri_xz):,} faces -> {len(S):,} segments')

# Local spatial hash, compatible with the runtime Barriers reader.
all_xy = S.reshape(-1, 2)
gx0, gz0 = float(all_xy[:, 0].min() - 2.0), float(all_xy[:, 1].min() - 2.0)
gx1, gz1 = float(all_xy[:, 0].max() + 2.0), float(all_xy[:, 1].max() + 2.0)
gw = int(math.ceil((gx1 - gx0) / CELL)) + 2
gh = int(math.ceil((gz1 - gz0) / CELL)) + 2
cells = {}
for i, (ax, az, bx, bz) in enumerate(S):
    m = 1.6
    for gy in range(max(0, int(math.floor((min(az, bz) - m - gz0) / CELL))), min(gh - 1, int(math.floor((max(az, bz) + m - gz0) / CELL))) + 1):
        for gx in range(max(0, int(math.floor((min(ax, bx) - m - gx0) / CELL))), min(gw - 1, int(math.floor((max(ax, bx) + m - gx0) / CELL))) + 1):
            cells.setdefault(gy * gw + gx, []).append(i)
keys = np.asarray(sorted(cells), dtype='<u4')
off = [0]
idxs = []
for key in keys:
    idxs.extend(cells[int(key)])
    off.append(len(idxs))
off = np.asarray(off, dtype='<u4')
idxs = np.asarray(idxs, dtype='<u4')
header = struct.pack('<IIfffII', len(S), len(keys), gx0, gz0, CELL, gw, gh)
barrier_bytes = header + np.ascontiguousarray(S, dtype='<f4').tobytes() + K.tobytes() + b'\0' * ((4 - len(K) % 4) % 4) + keys.tobytes() + off.tobytes() + idxs.tobytes()
(OUT / 'barriers.bin').write_bytes(barrier_bytes)

# Real wall distances from the new Yas segments; use nearest projected segment per side.
mid = 0.5 * (S[:, :2] + S[:, 2:])
seg_tree = cKDTree(mid)
kq = min(80, len(S))
_, near_seg = seg_tree.query(route_xz, k=kq)
wallL = np.full(N, 35.0, dtype=np.float32)
wallR = np.full(N, 35.0, dtype=np.float32)
for i in range(N):
    inds = np.atleast_1d(near_seg[i])
    C = route_xz[i]
    Tdir = tan[i]
    Rdir = right[i]
    best_l = best_r = 35.0
    for si in inds:
        a = S[si, :2].astype(np.float64)
        b = S[si, 2:].astype(np.float64)
        ab = b - a
        l2 = float(np.dot(ab, ab))
        if l2 < 1e-9:
            continue
        u = float(np.clip(np.dot(C - a, ab) / l2, 0.0, 1.0))
        q = a + ab * u
        v = q - C
        dist = float(np.linalg.norm(v))
        if dist > 38.0:
            continue
        signed = float(np.dot(v, Rdir))
        edge = float(wr[i] if signed >= 0 else wl[i])
        if abs(signed) < max(2.5, edge - 1.2):
            continue
        if signed < 0:
            best_l = min(best_l, abs(signed))
        else:
            best_r = min(best_r, abs(signed))
    wallL[i] = best_l
    wallR[i] = best_r
# Preserve the measured Yas rail distance even where a rail sits inside the ray-hit asphalt envelope.
# The old road-width floor hid the close T1 rail from TrackSurface's usable-width limiter.
wallL = np.maximum(median_filter(wallL, size=7, mode='wrap'), 2.5).astype(np.float32)
wallR = np.maximum(median_filter(wallR, size=7, mode='wrap'), 2.5).astype(np.float32)

# Yas pit lane candidate: choose the best continuous paved corridor alongside the start/finish straight.
# FIA race direction and centerline are estimated; the negative-d branch here comes from the supplied Yas meshes.
ss_probe = np.r_[np.arange(length - 260.0, length, 2.0), np.arange(0.0, 451.0, 2.0)]
candidates = np.r_[np.arange(-30.0, -10.49, 0.25), np.arange(10.5, 30.01, 0.25)]
coverage = []
for d in candidates:
    j = int(round((d - D0) / DSTEP))
    ii = (np.floor((ss_probe % length) / (length / N)).astype(int)) % N
    coverage.append(float(np.mean(T[ii, j] == 1)))
coverage = np.asarray(coverage)
best_index = int(np.argmax(coverage))
pit_side = -1 if candidates[best_index] < 0 else 1
pit_nominal = float(candidates[best_index])
pit_coverage_fixed = float(coverage[best_index])
if pit_coverage_fixed < PIT_MIN_COVERAGE:
    print(f'pitlane fixed-offset guide coverage {pit_coverage_fixed:.3f} < {PIT_MIN_COVERAGE:.3f}; continue to the smoothed mesh-constrained path validation')

# Follow the same paved side at every point using a smooth discrete path through asphalt cells.
ss_path = np.arange(length - 260.0, length + 400.01, 2.0)
side_offsets = pit_side * np.arange(10.5, 30.01, 0.25)
M = len(side_offsets)
prev_cost = np.full(M, np.inf, dtype=np.float64)
back = np.zeros((len(ss_path), M), dtype=np.int16)
path_cover = np.zeros(len(ss_path), dtype=np.uint8)
nominal_j = int(np.argmin(np.abs(side_offsets - pit_nominal)))
for k, s in enumerate(ss_path):
    i = int((s % length) / (length / N)) % N
    js = np.rint((side_offsets - D0) / DSTEP).astype(int)
    asphalt = T[i, js] == 1
    path_cover[k] = asphalt.any()
    emission = 0.025 * (side_offsets - pit_nominal) ** 2 + np.where(asphalt, 0.0, 30.0)
    if k == 0:
        prev_cost = emission + 0.015 * (side_offsets - pit_nominal) ** 2
        continue
    trans = prev_cost[:, None] + 1.8 * (side_offsets[None, :] - side_offsets[:, None]) ** 2
    parent = np.argmin(trans, axis=0)
    back[k] = parent.astype(np.int16)
    prev_cost = trans[parent, np.arange(M)] + emission
state = int(np.argmin(prev_cost))
pit_d = np.empty(len(ss_path), dtype=np.float32)
for k in range(len(ss_path) - 1, -1, -1):
    pit_d[k] = side_offsets[state]
    if k:
        state = int(back[k, state])
# At s≈360–400 m the Yas mesh shows a continuous paved merge back onto the left edge of the racing surface.
exit_start, exit_end, exit_d = length + 360.0, length + 400.0, -8.0
k0 = int(np.argmin(np.abs(ss_path - exit_start)))
d_start = float(pit_d[k0])
mask_exit = ss_path >= exit_start
u_exit = np.clip((ss_path[mask_exit] - exit_start) / (exit_end - exit_start), 0.0, 1.0)
u_exit = u_exit * u_exit * (3.0 - 2.0 * u_exit)
pit_d[mask_exit] = d_start + (exit_d - d_start) * u_exit
pit_rows = (np.floor((ss_path % length) / (length / N)).astype(int)) % N
pit_cols = np.rint((pit_d - D0) / DSTEP).astype(int)
pit_paved_coverage = float(np.mean(T[pit_rows, pit_cols] == 1))
if pit_paved_coverage < PIT_MIN_COVERAGE:
    raise RuntimeError(f'Yas pitlane path leaves the supplied paved mesh too often: {pit_paved_coverage:.3f} < {PIT_MIN_COVERAGE:.3f}')

# Runtime centerline interpolation and right-offset into the asphalt-selected pit corridor.
tx = tan[:, 0]
tz = tan[:, 1]
pit_x = np.empty(len(ss_path), dtype=np.float32)
pit_z = np.empty(len(ss_path), dtype=np.float32)
for k, s in enumerate(ss_path):
    u = (s % length) / (length / N)
    i = int(math.floor(u)) % N
    f = u - math.floor(u)
    i1 = (i + 1) % N
    px = cx[i] + (cx[i1] - cx[i]) * f
    pz = cz[i] + (cz[i1] - cz[i]) * f
    vx = tx[i] + (tx[i1] - tx[i]) * f
    vz = tz[i] + (tz[i1] - tz[i]) * f
    vn = math.hypot(vx, vz) or 1.0
    vx, vz = vx / vn, vz / vn
    pit_x[k] = px - vz * pit_d[k]
    pit_z[k] = pz + vx * pit_d[k]
pit_length = float(np.hypot(np.diff(pit_x), np.diff(pit_z)).sum())
pit_s_mod = np.rint(ss_path % length).astype(int)
pit_data = {
    'x': pit_x.tolist(), 'z': pit_z.tolist(), 's': pit_s_mod.tolist(), 'd': pit_d.tolist(), 'length': pit_length,
    'status': 'estimated/non-official; route selected from Yas paved mesh corridor',
    'pit_corridor_side_d_m': pit_nominal, 'paved_cell_coverage': pit_paved_coverage,
    'limitFromS_estimate': PIT_LIMIT_FROM_S, 'limitToS_estimate': PIT_LIMIT_TO_S, 'official_speed_limit_kmh': 80,
    'exit_merge_estimate': {'from_s': 360, 'to_s': 400, 'end_d_m': exit_d, 'surface_grid_coverage': pit_paved_coverage},
}
(OUT / 'pitlane.json').write_text(json.dumps(pit_data, separators=(',', ':')))

# Runtime surface metadata, with explicit provenance labels.
meta = {
    'N': int(N), 'ND': int(ND), 'D0': float(D0), 'DSTEP': float(DSTEP), 'ds': float(length / N), 'length': float(length),
    'cx': cx.tolist(), 'cy': cy.tolist(), 'cz': cz.tolist(),
    'wl': wl.tolist(), 'wr': wr.tolist(), 'wallL': wallL.tolist(), 'wallR': wallR.tolist(),
    'status': f'estimated/non-official runtime physics; {surface_source} surface layer; not a surveyed or FIA-provided grid',
    'provenance': f'FIA 2021 Doc 1 plan digitization aligned to supplied Yas model; ray-cast from Yas {surface_source} only; centerline and local gaps are estimated',
    'surface_type_note': 'type 1 = selected-layer Yas ray-hit pavement or explicitly estimated bridge corridor; type 4 = conservative fallback',
    'lineOffsetMax': 1.0,
    'lineOffsetNote': 'estimated/non-official conservative AI racing-line offset cap selected from Yas-only T1 barrier-clearance sweeps; not an FIA value',
    'no_Spa_or_Monza_surface_or_barrier_data_used': True,
    'official_reference': {'length_m': 5281, 'laps': 58, 'pit_speed_kmh': 80, 'track_map': 'FIA Abu Dhabi GP 2021 Doc 1'},
    'barrier_note': 'Yas tentrail-material vertical faces, filtered around the route; wall distances use nearest filtered segments per side; generic collision kind 4',
}
meta_path = OUT / 'surface.json'
meta_path.write_text(json.dumps(meta, separators=(',', ':')))
(OUT / 'surface.bin').write_bytes(np.ascontiguousarray(packed, dtype='<u2').tobytes())
if (OUT / 'surface.bin').stat().st_size != N * ND * 2:
    raise RuntimeError('surface.bin byte size mismatch')

# Visual diagnostics of geometry-derived Yas collision and pit lane only.
allp = np.vstack([route_xz, S[:, :2], S[:, 2:], np.column_stack([pit_x, pit_z])])
mn, mx = allp.min(axis=0), allp.max(axis=0)
size = (1400, 1000)
scale = min((size[0] - 40) / max(mx[0] - mn[0], 1), (size[1] - 40) / max(mx[1] - mn[1], 1))
def xy(p): return (int(20 + (p[0] - mn[0]) * scale), int(size[1] - 20 - (p[1] - mn[1]) * scale))
im = Image.new('RGB', size, (246, 247, 249)); draw = ImageDraw.Draw(im)
for a, b, c, d in S:
    draw.line([xy((a, b)), xy((c, d))], fill=(204, 92, 74), width=1)
draw.line([xy(p) for p in route_xz] + [xy(route_xz[0])], fill=(35, 87, 177), width=3)
draw.line([xy((x, z)) for x, z in zip(pit_x, pit_z)], fill=(230, 160, 28), width=4)
draw.text((16, 8), f'Yas estimated only | {len(S):,} barrier segments | pit coverage {pit_paved_coverage:.1%}', fill=(0, 0, 0))
preview = ROOT / 'yas_physics_geometry_preview.png'
im.save(preview)

report = {
    'status': 'estimated/non-official runtime candidate',
    'centerline_samples': int(N), 'centerline_ds_m': float(length / N), 'estimated_length_m': float(length),
    'official_fia_2021_length_m': 5281.0, 'length_delta_percent': (length / 5281.0 - 1) * 100,
    'surface_grid': {'N': int(N), 'ND': int(ND), 'cell_size_m': [float(length / N), DSTEP], 'type_counts': {str(int(k)): int(v) for k, v in zip(*np.unique(T, return_counts=True))}, 'bin_bytes': (OUT / 'surface.bin').stat().st_size},
    'road_halfwidth_p05_m': [float(np.percentile(wl, 5)), float(np.percentile(wr, 5))], 'road_halfwidth_median_m': [float(np.median(wl)), float(np.median(wr))],
    'barriers': {'source': 'Yas tentrail-material vertical triangles', 'candidate_triangles': int(len(bake['barrier_triangles_blender_xyz'])), 'edge_filtered_triangles': int(len(tri_xz)), 'segments': int(len(S)), 'spatial_cells': int(len(keys)), 'spatial_index_refs': int(len(idxs)), 'bin_bytes': len(barrier_bytes), 'collision_kind': 4},
    'pitlane': {'estimated_side_offset_m': pit_nominal, 'fixed_offset_corridor_coverage': pit_coverage_fixed, 'smoothed_path_paved_cell_coverage': pit_paved_coverage, 'minimum_path_coverage_threshold': PIT_MIN_COVERAGE, 'smoothed_path_threshold_met': pit_paved_coverage >= PIT_MIN_COVERAGE, 'path_length_m': pit_length, 'limit_start_s_estimate': PIT_LIMIT_FROM_S, 'limit_end_s_estimate': PIT_LIMIT_TO_S, 'official_speed_limit_kmh': 80},
    'official_reference_data': {'laps': 58, 'length_m': 5281.0, 'drs': {'detection_1_before_T5_m': 40, 'activation_1_after_T5_m': 210, 'detection_2_after_T7_m': 50, 'activation_2_after_T7_m': 165}, 'source': 'FIA 2021 Abu Dhabi GP Doc 1 circuit map and final classification'},
    'no_Spa_or_Monza_physical_data_used': True,
    'files': [str(OUT / 'surface.json'), str(OUT / 'surface.bin'), str(OUT / 'barriers.bin'), str(OUT / 'pitlane.json'), str(preview)],
    'elapsed_seconds': time.time() - started,
}
REPORT.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
