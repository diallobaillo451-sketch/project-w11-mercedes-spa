import bpy,sys,math
from mathutils import Matrix,Vector
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
pitch=float(sys.argv[-3]); dy=float(sys.argv[-2]); dz=float(sys.argv[-1])
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c1_car_rig.blend')
with bpy.data.libraries.load(STAGES+'/d1_driver_flat.blend') as (src,dst): dst.objects=src.objects
piv=Vector((0,0,0.45))
M=Matrix.Translation((0,dy,dz))@Matrix.Translation(piv)@Matrix.Rotation(math.radians(pitch),4,'X')@Matrix.Translation(-piv)
for o in dst.objects:
    bpy.context.scene.collection.objects.link(o); o.matrix_world=M
tag=f'{pitch}_{dy}_{dz}'
wb_render(f'/tmp/place_sec_{tag}.png',(3,0.3,0.7),(math.radians(90),0,math.radians(90)),ortho=2.4,res=(1200,800),clip=(3.0,10))
wb_render(f'/tmp/place_out_{tag}.png',(3,0.3,0.7),(math.radians(90),0,math.radians(90)),ortho=2.4,res=(1200,800),clip=(0.1,10))
