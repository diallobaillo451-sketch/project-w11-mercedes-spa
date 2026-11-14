"""Headless Blender worker: import an input GLB, inventory it, optionally re-export it unchanged."""
import argparse
import json
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--output")
    return parser.parse_args(argv)


def write_json(path, data):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(target)


def main():
    args = parse_args()
    source = Path(args.source).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if "FINISHED" not in result:
        raise RuntimeError("bpy.ops.import_scene.gltf did not finish: " + str(result))
    bpy.context.view_layer.update()

    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    vertices = 0
    triangles = 0
    shared_mesh_objects = 0
    non_identity_transforms = 0
    non_finite_vertices = 0
    min_bound = [float("inf"), float("inf"), float("inf")]
    max_bound = [float("-inf"), float("-inf"), float("-inf")]

    for obj in meshes:
        mesh = obj.data
        vertices += len(mesh.vertices)
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        if mesh.users > 1:
            shared_mesh_objects += 1
        ident = ((1.0, 0.0, 0.0, 0.0), (0.0, 1.0, 0.0, 0.0), (0.0, 0.0, 1.0, 0.0), (0.0, 0.0, 0.0, 1.0))
        if any(abs(obj.matrix_world[r][c] - ident[r][c]) > 1e-6 for r in range(4) for c in range(4)):
            non_identity_transforms += 1
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                min_bound[axis] = min(min_bound[axis], float(world[axis]))
                max_bound[axis] = max(max_bound[axis], float(world[axis]))
        # Check coordinates in bounded per-mesh memory using Blender's bundled NumPy.
        if len(mesh.vertices):
            import numpy as np
            coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
            mesh.vertices.foreach_get("co", coords)
            non_finite_vertices += int(coords.size - np.isfinite(coords).sum())
            del coords

    materials = sorted({mat.name for obj in meshes for mat in obj.data.materials if mat})
    images = sorted({image.name for image in bpy.data.images})
    missing_external_images = []
    for image in bpy.data.images:
        if image.source == "FILE" and not image.packed_file:
            image_path = bpy.path.abspath(image.filepath)
            if image_path and not os.path.isfile(image_path):
                missing_external_images.append({"name": image.name, "path": image.filepath})

    warnings = []
    if not meshes:
        warnings.append("Aucun objet mesh importé.")
    if not triangles:
        warnings.append("Aucun triangle importé.")
    if non_finite_vertices:
        warnings.append(f"{non_finite_vertices} coordonnées de sommets non finies.")
    if missing_external_images:
        warnings.append(f"{len(missing_external_images)} image(s) externe(s) manquante(s).")
    if min_bound[0] == float("inf"):
        bounds = None
    else:
        bounds = {"min": [round(v, 6) for v in min_bound], "max": [round(v, 6) for v in max_bound]}

    report = {
        "source_file": source.name,
        "blender_version": bpy.app.version_string,
        "objects": len(objects),
        "mesh_objects": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "materials": materials,
        "material_count": len(materials),
        "images": images,
        "image_count": len(images),
        "missing_external_images": missing_external_images,
        "shared_mesh_objects": shared_mesh_objects,
        "non_identity_transform_objects": non_identity_transforms,
        "non_finite_vertex_coordinates": non_finite_vertices,
        "bounds_m": bounds,
        "source_geometry_modified": False,
        "warnings": warnings,
    }

    if args.output:
        output = Path(args.output).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        exported = bpy.ops.export_scene.gltf(
            filepath=str(output),
            export_format="GLB",
            export_extras=True,
            export_yup=True,
            export_apply=False,
        )
        if "FINISHED" not in exported or not output.is_file():
            raise RuntimeError("Échec de l’export GLB: " + str(exported))
        report["roundtrip_file"] = output.name
        report["roundtrip_size_bytes"] = output.stat().st_size

    write_json(args.report, report)
    print("CIRCUIT_PIPELINE_REPORT " + json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
