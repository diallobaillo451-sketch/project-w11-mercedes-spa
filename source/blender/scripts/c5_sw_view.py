import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c1_car_rig.blend')
wb_render('/tmp/sw_front.png',(0,0.3,0.647),(math.radians(90),0,0),ortho=0.5,res=(1000,1000),clip=(0.2,0.6))
wb_render('/tmp/sw_side.png',(2,0.727,0.647),(math.radians(90),0,math.radians(90)),ortho=0.5,res=(1000,1000),clip=(1.75,2.25))
