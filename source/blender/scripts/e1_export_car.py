"""Export GLB voiture W11 + pilote (casque Hamilton 2020) depuis c3_car_driver_lh. Hiérarchie conservée : W11_root > W_xx (braquage) > W_xx_spin (rotation)."""
import bpy,sys
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c3_car_driver_lh.blend')
sc=bpy.context.scene; sc.frame_set(4)  # pose volant au centre
for o in bpy.data.objects: o.hide_set(False); o.hide_render=False
arm=bpy.data.objects.get('DRV_rig')
if arm and arm.animation_data is None: arm.animation_data_create()
if arm: arm.animation_data.action=bpy.data.actions['steer']
bpy.ops.export_scene.gltf(filepath=R+'/assets-work/w11_car_raw.glb',export_format='GLB',export_extras=True,export_yup=True,
  export_apply=False,export_cameras=False,export_lights=False,export_animations=True,export_animation_mode='ACTIONS',
  export_skins=True,export_image_format='AUTO',use_visible=False)
print('EXPORTED')
