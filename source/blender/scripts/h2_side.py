import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/d1_driver_flat.blend')
keep=('Helmet','VISOR','HansStrap')
for o in bpy.data.objects:
    if o.type=='MESH' and not o.name.startswith(keep): o.hide_render=True
# centre (y,z) = (0.062,1.357), ortho 0.45 -> 1000px : 2222 px/m
wb_render('/tmp/hside.png',(3,0.062,1.357),(math.radians(90),0,math.radians(90)),ortho=0.45,res=(1000,1000))
