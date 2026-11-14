#!/usr/bin/env python3
"""Bake runtime surface data for Barcelona from the supplied GLB and a fitted public 2023 lap trace.

Run with Blender 5.x:
  blender -b --factory-startup --python barcelona_gameplay_blender.py -- input.glb fitted-trace.json output-dir

The trace is a sparse OpenF1 driving trajectory fitted to the asphalt footprint, not a surveyed centerline.
"""
import bpy
import json
import math
import os
import sys

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROAD_NAMES = ("Object_115", "Object_66")
GROUND_NAME = "Object_92"
ORTHO_SCALE = 1600.0
RENDER_SIZE = 1800.0
PIXEL_PER_WORLD = RENDER_SIZE / ORTHO_SCALE
D0 = -45.0
DSTEP = 0.25
ND = 361
RAY_Z = 1000.0
RAY_DISTANCE = 2000.0


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 3:
        raise SystemExit("Expected: input.glb fitted-trace.json output-dir")
    return args


def find_mesh(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"Required mesh {name!r} was not found after GLB import")
    return obj


def build_bvh(objects_and_tags):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    verts = []
    faces = []
    face_tags = []
    for obj, tag in objects_and_tags:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        offset = len(verts)
        matrix = evaluated.matrix_world
        verts.extend(matrix @ v.co for v in mesh.vertices)
        for tri in mesh.loop_triangles:
            faces.append(tuple(offset + int(v) for v in tri.vertices))
            face_tags.append(tag)
        vertex_count = len(mesh.vertices)
        triangle_count = len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
        print(f"BVH mesh {obj.name}: {vertex_count} vertices, {triangle_count} triangles, type {tag}")
    if not faces:
        raise RuntimeError("No triangles available for BVH")
    return BVHTree.FromPolygons(verts, faces, all_triangles=True), face_tags


def ray(bvh, x, y):
    return bvh.ray_cast(Vector((float(x), float(y), RAY_Z)), Vector((0.0, 0.0, -1.0)), RAY_DISTANCE)


def select_run(offsets, hits):
    runs = []
    start = None
    for i, ok in enumerate(hits):
        if ok and start is None:
            start = i
        if start is not None and (not ok or i == len(hits) - 1):
            end = i - 1 if not ok else i
            lo = float(offsets[start])
            hi = float(offsets[end])
            runs.append((lo, hi))
            start = None
    if not runs:
        return None
    containing = [r for r in runs if r[0] <= 0.0 <= r[1]]
    if containing:
        return min(containing, key=lambda r: r[1] - r[0])
    return min(runs, key=lambda r: 0.0 if r[0] <= 0.0 <= r[1] else min(abs(r[0]), abs(r[1])))


def closed_length(points):
    q = np.vstack((points, points[:1]))
    return float(np.linalg.norm(np.diff(q, axis=0), axis=1).sum())


def resample_closed(points, count):
    q = np.vstack((points, points[:1]))
    seg = np.linalg.norm(np.diff(q, axis=0), axis=1)
    keep = seg > 1e-6
    q0 = q[:-1][keep]
    seg = seg[keep]
    if len(seg) < 4:
        raise RuntimeError("Trace is degenerate")
    cumulative = np.concatenate(([0.0], np.cumsum(seg)))
    total = float(cumulative[-1])
    s = np.arange(count, dtype=np.float64) * (total / count)
    idx = np.searchsorted(cumulative, s, side="right") - 1
    idx = np.clip(idx, 0, len(seg) - 1)
    f = (s - cumulative[idx]) / seg[idx]
    return q0[idx] + (q0[(idx + 1) % len(q0)] - q0[idx]) * f[:, None], total


def smooth_closed(points, sigma_m=2.0):
    # A light cyclic Gaussian smoothing removes interpolation kinks without rounding the main corners.
    radius = max(2, int(math.ceil(3.0 * sigma_m)))
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    weights = np.exp(-0.5 * (offsets / sigma_m) ** 2)
    weights /= weights.sum()
    out = np.zeros_like(points, dtype=np.float64)
    for offset, weight in zip(offsets.astype(int), weights):
        out += np.roll(points, int(offset), axis=0) * float(weight)
    return out


def direction(points, i):
    n = len(points)
    v = points[(i + 2) % n] - points[(i - 2) % n]
    length = float(np.linalg.norm(v))
    if length < 1e-8:
        v = points[(i + 1) % n] - points[(i - 1) % n]
        length = float(np.linalg.norm(v))
    if length < 1e-8:
        return np.array([1.0, 0.0])
    return v / length


def main():
    source_glb, trace_path, out_dir = parse_args()
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.import_scene.gltf(filepath=source_glb)
    bpy.context.view_layer.update()

    road_objects = [find_mesh(name) for name in ROAD_NAMES]
    ground_object = find_mesh(GROUND_NAME)
    road_bvh, _ = build_bvh([(obj, 1) for obj in road_objects])
    surface_bvh, surface_tags = build_bvh([(obj, 1) for obj in road_objects] + [(ground_object, 4)])

    trace = json.load(open(trace_path, "r", encoding="utf-8"))
    points_px = np.asarray(trace["points_px"], dtype=np.float64)
    if points_px.ndim != 2 or points_px.shape[1] != 2 or len(points_px) < 100:
        raise RuntimeError("Fitted trace must contain at least 100 [x,y] image points")
    # The inspection render was orthographic, centered at (0,0), 1600 Blender units wide.
    # glTF/game coordinates are x, z; Blender's horizontal axes are x, -z.
    points = np.column_stack(((points_px[:, 0] - RENDER_SIZE / 2) / PIXEL_PER_WORLD,
                              (RENDER_SIZE / 2 - points_px[:, 1]) / PIXEL_PER_WORLD))
    endpoint_gap = float(np.linalg.norm(points[0] - points[-1]))
    print(f"Trace points {len(points)}, endpoint gap {endpoint_gap:.2f} m, fitted perimeter {closed_length(points):.2f} m")
    if endpoint_gap > 80.0:
        raise RuntimeError(f"Trace does not close within one lap (gap {endpoint_gap:.1f} m)")

    # Project the sparse telemetry laterally to the middle of the contiguous asphalt strip.
    scan = np.arange(-24.0, 24.0001, 0.5)
    corrected = points.copy()
    snaps = []
    for i in range(len(points)):
        prev = points[(i - 1) % len(points)]
        nxt = points[(i + 1) % len(points)]
        tangent = nxt - prev
        tangent /= max(float(np.linalg.norm(tangent)), 1e-8)
        lateral = np.array([tangent[1], -tangent[0]])
        hits = [ray(road_bvh, *(points[i] + lateral * d))[0] is not None for d in scan]
        interval = select_run(scan, hits)
        shift = 0.0 if interval is None else (interval[0] + interval[1]) * 0.5
        shift = float(np.clip(shift, -18.0, 18.0))
        corrected[i] = points[i] + lateral * shift
        snaps.append(shift)
    print(f"Sparse trace centering: {sum(abs(v) > 0.25 for v in snaps)}/{len(snaps)} moved; max {max(abs(v) for v in snaps):.1f} m")

    provisional_length = closed_length(corrected)
    provisional_n = max(100, int(round(provisional_length)))
    path, _ = resample_closed(corrected, provisional_n)
    path = smooth_closed(path, sigma_m=2.0)
    smoothed_length = closed_length(path)
    n = max(100, int(round(smoothed_length)))
    path, length = resample_closed(path, n)
    ds = length / n
    print(f"Runtime centreline: N={n}, ds={ds:.5f} m, length={length:.2f} m")

    # Recenter each 1 m station on the mesh and measure asphalt widths from the real mesh edges.
    width_offsets = np.arange(-24.0, 24.0001, 0.25)
    wl = np.zeros(n, dtype=np.float32)
    wr = np.zeros(n, dtype=np.float32)
    center_z = np.zeros(n, dtype=np.float32)
    road_valid = np.zeros(n, dtype=bool)
    onroad = 0
    recentered = 0
    raw_shifts = np.zeros(n, dtype=np.float64)
    intervals = [None] * n
    for i in range(n):
        tangent = direction(path, i)
        lateral = np.array([tangent[1], -tangent[0]])
        hits = [ray(road_bvh, *(path[i] + lateral * d))[0] is not None for d in width_offsets]
        interval = select_run(width_offsets, hits)
        if interval is not None:
                shift = (interval[0] + interval[1]) * 0.5
                if abs(shift) <= 18.0:
                    raw_shifts[i] = shift
                    intervals[i] = interval
    # Per-station mesh recentering can jump to another asphalt strip. Remove isolated
    # offsets with a cyclic median filter, then apply only a light smooth to the correction.
    median_radius = 8
    median_stack = np.stack([np.roll(raw_shifts, offset) for offset in range(-median_radius, median_radius + 1)])
    median_shifts = np.median(median_stack, axis=0)
    outlier_threshold = 6.0
    filtered_shifts = np.where(np.abs(raw_shifts - median_shifts) > outlier_threshold, median_shifts, raw_shifts)
    for i in range(n):
        if abs(raw_shifts[i] - median_shifts[i]) > outlier_threshold:
            intervals[i] = None
    filtered_shifts = np.clip(filtered_shifts, -2.5, 2.5)
    shift_vectors = np.column_stack((filtered_shifts, np.zeros(n), np.zeros(n)))
    shift_profile = smooth_closed(shift_vectors, sigma_m=1.5)[:, 0]
    recentered = int(np.count_nonzero(np.abs(shift_profile) > 0.15))
    raw_step_max = float(np.max(np.abs(np.diff(np.r_[raw_shifts, raw_shifts[0]]))))
    smooth_step_max = float(np.max(np.abs(np.diff(np.r_[shift_profile, shift_profile[0]]))))
    unshifted_length = closed_length(path)
    for i in range(n):
        tangent = direction(path, i)
        lateral = np.array([tangent[1], -tangent[0]])
        shift = float(shift_profile[i])
        if intervals[i] is not None:
            interval = intervals[i]
            path[i] += lateral * shift
            wl[i] = max(0.5, -interval[0] + shift)
            wr[i] = max(0.5, interval[1] - shift)
        loc, _, _, _ = ray(road_bvh, *path[i])
        if loc is not None:
            center_z[i] = loc.z
            onroad += 1
            road_valid[i] = True
        else:
            loc, _, idx, _ = ray(surface_bvh, *path[i])
            center_z[i] = loc.z if loc is not None else (center_z[i - 1] if i else 0.0)
            if loc is not None and surface_tags[idx] == 1:
                onroad += 1
                road_valid[i] = True
        if wl[i] <= 0.5 and wr[i] <= 0.5:
            wl[i] = 5.0
            wr[i] = 5.0
    length = closed_length(path)
    ds = length / n
    if abs(length / unshifted_length - 1.0) > 0.05:
        raise RuntimeError(f"Filtered mesh recentering changed centreline length by more than 5% ({unshifted_length:.1f} m -> {length:.1f} m)")
    print(f"Mesh recenter offsets: max step {raw_step_max:.2f} m -> {smooth_step_max:.2f} m (median radius {median_radius} m, sigma 1.5 m)")
    print(f"Final runtime centreline after mesh fit: N={n}, ds={ds:.5f} m, length={length:.2f} m")
    valid = np.flatnonzero(road_valid)
    if len(valid) > 1:
        extended_i = np.concatenate((valid[-1:] - n, valid, valid[:1] + n))
        extended_z = center_z[extended_i % n]
        center_z[:] = np.interp(np.arange(n), extended_i, extended_z)
    print(f"Final mesh fit: {onroad}/{n} center stations on asphalt; {recentered} stations recentered")
    print("Road width total p5/50/95:", np.percentile(wl + wr, [5, 50, 95]).round(2).tolist())
    if onroad < n * 0.90:
        raise RuntimeError(f"Only {onroad}/{n} centerline samples hit the asphalt mesh")

    # Cross-track grid: real track hits plus a flat grass fallback where no terrain collision mesh exists.
    virtual_wall = 25.0
    heights = np.zeros((n, ND), dtype=np.float32)
    types = np.zeros((n, ND), dtype=np.uint8)
    right_x = np.zeros(n, dtype=np.float64)
    right_y = np.zeros(n, dtype=np.float64)
    for i in range(n):
        tangent = direction(path, i)
        right_x[i], right_y[i] = tangent[1], -tangent[0]
        for j in range(ND):
            d = D0 + j * DSTEP
            x = path[i, 0] + right_x[i] * d
            y = path[i, 1] + right_y[i] * d
            loc, _, idx, _ = ray(surface_bvh, x, y)
            if loc is None:
                heights[i, j] = center_z[i]
                types[i, j] = 4 if abs(d) <= virtual_wall else 0
            else:
                heights[i, j] = loc.z
                types[i, j] = surface_tags[idx]
        if i % 250 == 0:
            print(f"surface row {i}/{n}")

    # Preserve the raycast-measured asphalt corridor across small gaps in the source mesh.
    lateral_d = D0 + np.arange(ND, dtype=np.float32) * DSTEP
    for i in range(n):
        asphalt = (lateral_d >= -wl[i]) & (lateral_d <= wr[i])
        missing = asphalt & (types[i] != 1)
        heights[i, missing] = center_z[i]
        types[i, missing] = 1

    # Fill tiny mesh seams from the nearest nearby lateral cell, as Spa's bake does.
    for i in range(n):
        for j in np.flatnonzero(types[i] == 0):
            for delta in (1, -1, 2, -2, 3, -3):
                jj = int(j) + delta
                if 0 <= jj < ND and types[i, jj] in (1, 4):
                    heights[i, j] = heights[i, jj]
                    types[i, j] = types[i, jj]
                    break

    relative_cm = np.clip(np.round((heights - center_z[:, None]) * 100.0) + 4096.0, 0, 8191).astype(np.uint16)
    grid = (relative_cm << 3) | types.astype(np.uint16)
    grid_path = os.path.join(out_dir, "surface.bin")
    grid.tofile(grid_path)
    meta = {
        "note": "Barcelona-Catalunya 2023 layout; OpenF1 race trajectory fitted to supplied GLB asphalt, not a surveyed centerline. Type 4 is a flat grass fallback at centerline height where no terrain collision mesh is available; virtual safety walls are 25 m from the centerline.",
        "N": int(n), "ND": ND, "D0": D0, "DSTEP": DSTEP, "ds": float(ds), "length": float(length),
        "types": {"0": "void", "1": "asphalt", "4": "terrain/grass"},
        "cx": [round(float(v), 3) for v in path[:, 0]],
        "cy": [round(float(v), 3) for v in center_z],
        "cz": [round(float(-v), 3) for v in path[:, 1]],
        "wl": [round(float(v), 2) for v in wl], "wr": [round(float(v), 2) for v in wr],
        "wallL": [virtual_wall] * n, "wallR": [virtual_wall] * n,
    }
    meta_path = os.path.join(out_dir, "surface.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    counts = {str(int(k)): int(v) for k, v in zip(*np.unique(types, return_counts=True))}
    report = {
        "source_glb": os.path.basename(source_glb),
        "trace_source": trace.get("source", "OpenF1 trace fitted to GLB asphalt"),
        "trace_points": int(len(points)), "endpoint_gap_m": endpoint_gap,
        "length_m": float(length), "N": int(n), "ds_m": float(ds),
        "centerline_asphalt_hits": int(onroad), "centerline_recentered_samples": int(recentered),
        "centerline_repaired_samples": int(n - onroad),
        "recenter_median_radius_m": median_radius,
        "recenter_outlier_threshold_m": outlier_threshold,
        "recenter_max_offset_m": 2.5,
        "recenter_smoothing_sigma_m": 1.5,
        "recenter_offset_step_max_m_before_after": [raw_step_max, smooth_step_max],
        "road_width_total_m_p5_p50_p95": [float(x) for x in np.percentile(wl + wr, [5, 50, 95])],
        "grid_types": counts, "grid_cells": int(grid.size), "surface_bin_bytes": int(grid.nbytes),
        "grass_fallback": "Type 4 uses centerline height where the GLB has no terrain collision mesh.",
        "barriers": "No circuit-specific barrier geometry was baked; virtual walls are 25 m from the centerline."
    }
    with open(os.path.join(out_dir, "bake-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"Wrote {meta_path} ({os.path.getsize(meta_path)} bytes) and {grid_path} ({os.path.getsize(grid_path)} bytes)")


if __name__ == "__main__":
    main()
