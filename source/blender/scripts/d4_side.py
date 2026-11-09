import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/d1_driver_flat.blend')
wb_render('/tmp/dflat_side.png',(3,0.46,0.98),(math.radians(90),0,math.radians(90)),ortho=1.4,res=(1000,1000))
wb_render('/tmp/dflat_front.png',(0,3,0.98),(math.radians(90),0,math.radians(180)),ortho=1.4,res=(1000,1000))
