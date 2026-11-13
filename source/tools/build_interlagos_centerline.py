#!/usr/bin/env python3
"""Extract a closed, smoothed Interlagos centerline from the Object_109 road skeleton.

The 0.5 m raster skeleton can contain pixel-scale zig-zags. A 2 m periodic Gaussian
smoothing was validated against both 0.5 m and 1 m rasters (lengths converge near
4.29 km). A plan-to-mesh affine fit supplies the start/finish anchor and forward
orientation (towards T1). This tool writes Blender-horizontal XY points; the Blender
bake converts them to glTF (x, height, -y).

Requires Python packages: opencv-python, networkx, numpy, scipy.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import cv2
import networkx as nx
import numpy as np
from scipy.ndimage import gaussian_filter1d


def affine_map(source_xy: np.ndarray, ref_mask: np.ndarray, alignment: dict, target_shape: tuple[int, int]) -> np.ndarray:
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ref_mask.astype(np.uint8), 8)
    keep = np.zeros_like(ref_mask)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area >= 3 and y < 340 and x < 470 and x + w > 20:
            keep[labels == i] = True
    ys, xs = np.where(keep)
    sx0, sx1 = int(xs.min()), int(xs.max())
    sy0, sy1 = int(ys.min()), int(ys.max())
    source_center = np.array([(sx0 + sx1) * 0.5, (sy0 + sy1) * 0.5], dtype=np.float64)
    theta = math.radians(alignment['theta_deg'])
    c, s = math.cos(theta), math.sin(theta)
    ax, ay = alignment['scale_xy']
    dx, dy = alignment['offset_px']
    th, tw = target_shape
    target_center = np.array([(tw - 1) * 0.5, (th - 1) * 0.5], dtype=np.float64)
    p = np.asarray(source_xy, dtype=np.float64) - source_center
    x = target_center[0] + dx + ax * (c * p[..., 0] - s * p[..., 1])
    y = target_center[1] + dy + ay * (s * p[..., 0] + c * p[..., 1])
    return np.stack([x, y], axis=-1)


def project_to_loop(points: np.ndarray, cumulative: np.ndarray, query: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a = points
    b = np.roll(points, -1, axis=0)
    v = b - a
    den = np.einsum('ij,ij->i', v, v)
    q = np.asarray(query, dtype=np.float64)
    t = np.clip(np.einsum('ij,ij->i', q[None, :] - a, v) / np.maximum(den, 1e-12), 0.0, 1.0)
    closest = a + v * t[:, None]
    d2 = np.einsum('ij,ij->i', closest - q[None, :], closest - q[None, :])
    i = int(np.argmin(d2))
    return np.array([cumulative[i] + t[i] * math.sqrt(den[i])]), np.array([math.sqrt(d2[i])])


def sample_loop(points: np.ndarray, cumulative: np.ndarray, s: float) -> np.ndarray:
    length = float(cumulative[-1])
    u = s % length
    i = int(np.searchsorted(cumulative, u, side='right') - 1)
    i = max(0, min(i, len(points) - 1))
    seg = cumulative[i + 1] - cumulative[i]
    f = 0.0 if seg < 1e-12 else (u - cumulative[i]) / seg
    return points[i] * (1 - f) + points[(i + 1) % len(points)] * f


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--mask-dir', type=Path, required=True, help='directory containing road_skeleton.png and road_mask_report.json at 0.5 m/px')
    ap.add_argument('--mask1-report', type=Path, required=True, help='road_mask_report.json for 1 m/px raster')
    ap.add_argument('--reference', type=Path, required=True, help='FanAmp track map skeleton image (512x413)')
    ap.add_argument('--alignment', type=Path, required=True, help='reference_alignment_global.json')
    ap.add_argument('--out', type=Path, required=True, help='output centerline JSON')
    ap.add_argument('--overlay', type=Path, required=True, help='diagnostic overlay PNG')
    ap.add_argument('--start-xy', type=float, nargs=2, default=(143.0, 72.0), help='source-map XY on the finish straight, at the track (not the flag icon center)')
    ap.add_argument('--t1-xy', type=float, nargs=2, default=(39.0, 130.0), help='source-map XY near T1 apex, for direction')
    ap.add_argument('--smoothing-m', type=float, default=2.0)
    ap.add_argument('--spacing-m', type=float, default=1.0)
    args = ap.parse_args()

    report = json.loads((args.mask_dir / 'road_mask_report.json').read_text())
    report1 = json.loads(args.mask1_report.read_text())
    alignment = json.loads(args.alignment.read_text())
    ref = cv2.imread(str(args.reference), cv2.IMREAD_GRAYSCALE)
    if ref is None:
        raise FileNotFoundError(args.reference)
    skeleton = cv2.imread(str(args.mask_dir / 'road_skeleton.png'), cv2.IMREAD_GRAYSCALE) > 0
    cell = float(report['cell_m_per_px'])
    min_x, min_y = report['bounds_xy_min']
    max_x, max_y = report['bounds_xy_max']
    ys, xs = np.where(skeleton)
    pix = set(zip(ys.tolist(), xs.tolist()))
    graph = nx.Graph()
    graph.add_nodes_from(sorted(pix))
    for y, x in sorted(pix):
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            q = (y + dy, x + dx)
            if q not in pix:
                continue
            if dy and dx and ((y + dy, x) in pix or (y, x + dx) in pix):
                continue
            graph.add_edge((y, x), q, weight=cell * (math.sqrt(2) if dy and dx else 1.0))
    components = sorted(nx.connected_components(graph), key=len, reverse=True)
    main_graph = graph.subgraph(components[0]).copy()
    cycles = nx.cycle_basis(main_graph)
    if not cycles:
        raise RuntimeError('No closed cycle found in road skeleton')
    # In this mesh only one cycle spans the complete track; short cycles are branches/loops.
    def raw_length(cycle: list[tuple[int, int]]) -> float:
        xy = np.asarray([(x, y) for y, x in cycle], dtype=np.float64)
        return float(np.linalg.norm(np.roll(xy, -1, axis=0) - xy, axis=1).sum() * cell)
    candidate = max(cycles, key=raw_length)
    pix_xy = np.asarray([(x, y) for y, x in candidate], dtype=np.float64)
    world = np.column_stack([min_x + pix_xy[:, 0] * cell, max_y - pix_xy[:, 1] * cell])
    sigma_px = args.smoothing_m / cell
    smooth = np.column_stack([gaussian_filter1d(world[:, k], sigma_px, mode='wrap') for k in range(2)])
    seg = np.roll(smooth, -1, axis=0) - smooth
    seg_len = np.linalg.norm(seg, axis=1)
    cumulative = np.r_[0.0, np.cumsum(seg_len)]
    length = float(cumulative[-1])

    # Map the start/T1 anchors through the same affine fit used for the route overlay.
    target_h, target_w = alignment['target_hw']
    ref_mask = cv2.imread(str(args.reference), cv2.IMREAD_GRAYSCALE) > 0
    start_px1, t1_px1 = affine_map(np.asarray([args.start_xy, args.t1_xy]), ref_mask, alignment, (target_h, target_w))
    r1 = float(report1['cell_m_per_px'])
    x0_1, y0_1 = report1['bounds_xy_min']
    x1_1, y1_1 = report1['bounds_xy_max']
    start_world = np.array([x0_1 + start_px1[0] * r1, y1_1 - start_px1[1] * r1])
    t1_world = np.array([x0_1 + t1_px1[0] * r1, y1_1 - t1_px1[1] * r1])
    start_s_a, start_err = project_to_loop(smooth, cumulative, start_world)
    t1_s_a, t1_err = project_to_loop(smooth, cumulative, t1_world)
    s0 = float(start_s_a[0])
    t1_s = float(t1_s_a[0])
    forward_delta = (t1_s - s0) % length
    reverse_delta = (s0 - t1_s) % length
    direction = 1 if forward_delta <= reverse_delta else -1
    t1_progress = forward_delta if direction == 1 else reverse_delta

    n = max(3, int(round(length / args.spacing_m)))
    ds = length / n
    s_samples = np.arange(n, dtype=np.float64) * ds
    points = np.asarray([sample_loop(smooth, cumulative, s0 + direction * s) for s in s_samples])

    # Length comparison at both available raster resolutions, applying the same 2 m low-pass.
    def smoothed_length(sk_path: Path, rr_path: Path) -> float:
        rr = json.loads(rr_path.read_text()); sk = cv2.imread(str(sk_path), 0) > 0
        yy, xx = np.where(sk); pp = set(zip(yy.tolist(), xx.tolist())); gg = nx.Graph(); gg.add_nodes_from(sorted(pp))
        cc = float(rr['cell_m_per_px'])
        for yy0, xx0 in sorted(pp):
            for ddy, ddx in ((0, 1), (1, 0), (1, 1), (1, -1)):
                qq = (yy0 + ddy, xx0 + ddx)
                if qq not in pp or (ddy and ddx and ((yy0 + ddy, xx0) in pp or (yy0, xx0 + ddx) in pp)):
                    continue
                gg.add_edge((yy0, xx0), qq, weight=cc * (math.sqrt(2) if ddy and ddx else 1))
        hh = gg.subgraph(max(nx.connected_components(gg), key=len)).copy()
        cyc = max(nx.cycle_basis(hh), key=lambda c: sum(hh[u][v]['weight'] for u, v in zip(c, c[1:] + c[:1])))
        pxy = np.asarray([(x, y) for y, x in cyc], dtype=float) * cc
        pp2 = np.column_stack([gaussian_filter1d(pxy[:, k], args.smoothing_m / cc, mode='wrap') for k in range(2)])
        return float(np.linalg.norm(np.roll(pp2, -1, axis=0) - pp2, axis=1).sum())

    # The 1 m skeleton PNG lives beside its report; the caller may pass that report path.
    m1_skeleton = args.mask1_report.parent / 'road_skeleton.png'
    length_1m = smoothed_length(m1_skeleton, args.mask1_report)
    length_05m = length
    official = 4309.0
    result = {
        'source_mesh': 'Object_109', 'source_raster': str(args.mask_dir),
        'horizontal_coordinates': 'Blender world X,Y; convert to glTF (x, height, -y)',
        'cell_m_per_px': cell, 'selected_cycle_nodes': int(len(candidate)),
        'smoothing_sigma_m': args.smoothing_m, 'sample_spacing_m': ds,
        'length_m': round(length, 3), 'official_length_m': official,
        'length_difference_percent': round((length / official - 1) * 100, 3),
        'stability_1m_smoothed_length_m': round(length_1m, 3),
        'stability_0_5m_smoothed_length_m': round(length_05m, 3),
        'start_finish_source_xy': list(args.start_xy), 'start_finish_world_xy': start_world.tolist(),
        'start_finish_fit_error_m': round(float(start_err[0]), 3),
        't1_source_xy': list(args.t1_xy), 't1_world_xy': t1_world.tolist(),
        't1_fit_error_m': round(float(t1_err[0]), 3), 'forward_direction': 'increasing_s' if direction == 1 else 'decreasing_s',
        't1_s_m': round(t1_progress, 3), 'n': n,
        'points_x_blender': [round(float(v), 4) for v in points[:, 0]],
        'points_y_blender': [round(float(v), 4) for v in points[:, 1]],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(',', ':')))

    # Diagnostic overlay: centerline red, start green, T1 blue, registered map skeleton white.
    base = cv2.imread(str(args.mask_dir / 'road_mask.png'), cv2.IMREAD_GRAYSCALE)
    overlay = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    route_px = np.column_stack([(points[:, 0] - min_x) / cell, (max_y - points[:, 1]) / cell]).round().astype(np.int32).reshape(-1, 1, 2)
    cv2.polylines(overlay, [route_px], True, (0, 0, 255), 2, cv2.LINE_AA)
    start_p = np.array([(start_world[0] - min_x) / cell, (max_y - start_world[1]) / cell]).round().astype(int)
    t1_p = np.array([(t1_world[0] - min_x) / cell, (max_y - t1_world[1]) / cell]).round().astype(int)
    cv2.circle(overlay, tuple(start_p.tolist()), 6, (0, 255, 0), -1, cv2.LINE_AA)
    cv2.circle(overlay, tuple(t1_p.tolist()), 6, (255, 0, 0), -1, cv2.LINE_AA)
    args.overlay.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.overlay), overlay)
    print(json.dumps({k: result[k] for k in ['length_m', 'official_length_m', 'length_difference_percent', 'stability_1m_smoothed_length_m', 'stability_0_5m_smoothed_length_m', 'start_finish_fit_error_m', 't1_fit_error_m', 'forward_direction', 't1_s_m', 'n']}))

if __name__ == '__main__':
    main()
