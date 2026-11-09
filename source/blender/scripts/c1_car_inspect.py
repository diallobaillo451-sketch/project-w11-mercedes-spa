import bpy,sys,json
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=R+'/assets-raw/car_w11.glb')
for o in bpy.data.objects:
    if o.type=='MESH':
        mn,mx=wbbox([o]); print('OBJ',o.name,o.data.name,[m.name for m in o.data.materials],len(o.data.polygons),[round(v,3) for v in mn],[round(v,3) for v in mx])
mn,mx=wbbox([o for o in bpy.data.objects if o.type=='MESH']); print('ALL',mn,mx)
save('c0_car_raw')
c=(mn+mx)/2
import math
wb_render(R+'/blender/renders/car_side.png',(c.x+12,c.y,c.z),(math.pi/2,0,math.pi/2),ortho=7,res=(1400,700))
wb_render(R+'/blender/renders/car_top.png',(c.x,c.y,c.z+10),(0,0,0),ortho=7,res=(1400,1400))
