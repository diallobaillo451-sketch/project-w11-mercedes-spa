"""Create a sanitized visual copy of the supplied Interlagos GLB.

Only Image_98 (identified as satellite imagery in the provided source) is removed.
Its material is replaced by a flat grass-like color. Geometry, transforms, and all
other materials/images are retained. The original GLB and imported source .blend
are not modified.
"""
import bpy, os, json, hashlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SOURCE_BLEND = Path(os.environ.get('INTERLAGOS_BLEND_IN', str(REPO / 'source/blender/work/interlagos_2023/interlagos_2023_source.blend')))
OUT_BLEND = Path(os.environ.get('INTERLAGOS_SANITIZED_BLEND', str(REPO / 'source/blender/work/interlagos_2023/interlagos_2023_sanitized.blend')))
OUT_GLB = Path(os.environ.get('INTERLAGOS_SANITIZED_GLB', str(REPO / 'source/blender/work/interlagos_2023/interlagos_2023_sanitized.glb')))
OUT_REPORT = OUT_GLB.with_suffix('.json')
IMAGE_NAME = os.environ.get('INTERLAGOS_SATELLITE_IMAGE', 'Image_98')
if not SOURCE_BLEND.is_file(): raise FileNotFoundError(SOURCE_BLEND)
OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
if bpy.data.filepath != str(SOURCE_BLEND): bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))

removed_from = []
for mat in bpy.data.materials:
    if not mat.use_nodes or not mat.node_tree: continue
    nodes = mat.node_tree.nodes
    image_nodes = [n for n in nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name == IMAGE_NAME]
    if not image_nodes: continue
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        base = bsdf.inputs.get('Base Color')
        if base:
            for link in list(base.links): mat.node_tree.links.remove(link)
            base.default_value = (0.13, 0.20, 0.11, 1.0)
        rough = bsdf.inputs.get('Roughness')
        if rough: rough.default_value = 0.92
        metal = bsdf.inputs.get('Metallic')
        if metal: metal.default_value = 0.0
    for node in image_nodes:
        for link in list(node.inputs[0].links) + list(node.outputs[0].links):
            mat.node_tree.links.remove(link)
        nodes.remove(node)
    mat['satellite_texture_removed'] = IMAGE_NAME
    mat['replacement'] = 'flat green; geometry and world transforms preserved'
    removed_from.append(mat.name)
if not removed_from: raise RuntimeError(f'No material used the target image {IMAGE_NAME}; refusing to export an unchanged copy.')
img = bpy.data.images.get(IMAGE_NAME)
if img and img.users == 0: bpy.data.images.remove(img)
# Remove unused copies/aliases that point to the same original image datablock name.
for image in list(bpy.data.images):
    if IMAGE_NAME in image.name and image.users == 0: bpy.data.images.remove(image)

bpy.context.scene['visual_sanitization'] = f'{IMAGE_NAME} removed; corresponding material replaced with flat color.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)
OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
result = bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format='GLB', export_apply=False, export_yup=True, export_image_format='AUTO')
if 'FINISHED' not in result: raise RuntimeError(f'GLB export failed: {result}')
report = {
    'source_blend': str(SOURCE_BLEND), 'sanitized_blend': str(OUT_BLEND), 'sanitized_glb': str(OUT_GLB),
    'removed_image': IMAGE_NAME, 'materials_replaced': removed_from,
    'mesh_count': sum(o.type == 'MESH' for o in bpy.data.objects),
    'remaining_image_names': [i.name for i in bpy.data.images],
    'notes': 'Original GLB/source .blend are unchanged. Object geometry/transforms are retained. Image_98 satellite imagery is not present in the exported model.'
}
OUT_REPORT.write_text(json.dumps(report, indent=2))
print('INTERLAGOS_SANITIZED_OK', json.dumps(report, separators=(',', ':')))
