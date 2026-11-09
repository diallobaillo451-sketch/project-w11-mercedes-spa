"""Réglage de la prise du volant (point 9) : rotation de la main autour de l axe du volant et direction des doigts,
rendus workbench avant/après. Usage : blender -b --python d7_grip_check.py -- 18 -0.6,0.75,-0.1 t2 (valeurs retenues, appliquées au jeu dans carRig.fixGrip)."""
import bpy,math,sys
from mathutils import Vector,Matrix,Quaternion
a=sys.argv[sys.argv.index('--')+1:]; HA=float(a[0]); FD=[float(x) for x in a[1].split(',')]; tag=a[2]
bpy.ops.wm.open_mainfile(filepath='/workspace/w11/blender/stages/c3_car_driver_lh.blend')
sc=bpy.context.scene; sc.frame_set(4)
arm=bpy.data.objects['DRV_rig']; PB=arm.pose.bones; AW=arm.matrix_world
def rot_world(pb,R):
    M=AW@pb.matrix; h=M.translation.copy()
    N=Matrix.Translation(h)@R.to_4x4()@Matrix.Translation(-h)@M
    pb.matrix=AW.inverted()@N; bpy.context.view_layer.update()
if HA!=0 or FD[0]!=0:
  for s,sg in (('R',1),('L',-1)):
    # désactive l'action pour figer la pose
    pass
  arm.animation_data.action=None
  for s,sg in (('R',1),('L',-1)):
    rot_world(PB['hand.'+s],Matrix.Rotation(math.radians(-HA*sg),3,'Z'))
    pb=PB['fingers.'+s]; M=AW@pb.matrix; cur=(M.to_3x3()@Vector((0,1,0))).normalized()
    want=Vector((FD[0]*sg,FD[1],FD[2])).normalized()
    rot_world(pb,cur.rotation_difference(want).to_matrix())
    print('POS',s,tuple(round(x,3) for x in AW@PB['hand.'+s].head),tuple(round(x,3) for x in AW@PB['fingers.'+s].head),tuple(round(x,3) for x in AW@PB['fingers.'+s].tail))
drvc=bpy.data.collections.get('DRIVER'); keep=set(drvc.all_objects)
sw=bpy.data.objects['STEERING_WHEEL']; keep|={sw}|set(sw.children_recursive)
for o in bpy.data.objects:
    if o.type=='MESH' and o not in keep: o.hide_render=True
sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=700; sc.render.resolution_y=500
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam; cam.data.lens=50
tgt=Vector((0,0.7,0.62))
for n,off in (('drv',Vector((0.0,-0.55,0.25))),('top',Vector((0.05,0.05,0.6))),('front',Vector((0.2,0.8,0.15)))):
    cam.location=tgt+off; cam.rotation_euler=(tgt-cam.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f'/tmp/h_{tag}_{n}.png'; bpy.ops.render.render(write_still=True)
