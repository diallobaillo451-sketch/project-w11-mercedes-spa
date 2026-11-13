"""Rendu de diagnostic top-down, sans modification de la géométrie source."""
import bpy
from pathlib import Path
from mathutils import Vector
REPO=Path(__file__).resolve().parents[3]
blend=REPO/'source/blender/work/interlagos_2023/interlagos_2023_source.blend'
out=REPO/'source/blender/work/interlagos_2023/interlagos_2023_top.png'
bpy.ops.wm.open_mainfile(filepath=str(blend))
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1200; scene.render.resolution_y=1350; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.film_transparent=False
scene.render.filepath=str(out)
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=1.0
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background')
if background: background.inputs['Color'].default_value=(0.32,0.34,0.38,1); background.inputs['Strength'].default_value=0.8
# Plan centré sur l'emprise détaillée du circuit, en laissant de côté la grande marge de terrain.
target=Vector((-100.0, 0.0, 0.0))
cam_data=bpy.data.cameras.new('Interlagos_Top_Camera'); cam=bpy.data.objects.new('Interlagos_Top_Camera',cam_data); scene.collection.objects.link(cam)
cam.location=Vector((target.x,target.y,2400)); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=1450; cam.data.clip_end=10000; scene.camera=cam
sun_data=bpy.data.lights.new('Interlagos_Audit_Sun','SUN'); sun_data.energy=4.0; sun_data.angle=0.16
sun=bpy.data.objects.new('Interlagos_Audit_Sun',sun_data); scene.collection.objects.link(sun)
sun.location=Vector((target.x-1200,target.y-1500,2200)); sun.rotation_euler=(target-sun.location).to_track_quat('-Z','Y').to_euler()
scene.eevee.taa_render_samples=24
bpy.ops.render.render(write_still=True)
print(f'INTERLAGOS_PREVIEW_OK {out}')
