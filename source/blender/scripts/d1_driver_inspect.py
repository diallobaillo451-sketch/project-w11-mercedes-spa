import bpy,sys
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=R+'/assets-raw/driver_bell.glb')
for o in bpy.data.objects:
    if o.type=='MESH':
        mn,mx=wbbox([o]); print('OBJ',o.name,len(o.data.polygons),[m.name for m in o.data.materials],[round(v,3) for v in mn],[round(v,3) for v in mx],[u.name for u in o.data.uv_layers])
    else: print('NODE',o.name,o.type,o.parent.name if o.parent else '')
for m in bpy.data.materials:
    if m.node_tree:
        ims=[n.image.name+':'+str(tuple(n.image.size)) for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
        print('MAT',m.name,m.blend_method if hasattr(m,'blend_method') else '',ims)
mn,mx=wbbox([o for o in bpy.data.objects if o.type=='MESH']); print('BBOX',mn,mx)
save('d0_driver_raw')
import math
wb_render(R+'/blender/renders/drv_side.png',((mn.x+mx.x)/2+6,(mn.y+mx.y)/2,(mn.z+mx.z)/2),(math.radians(90),0,math.radians(90)),ortho=max(mx.y-mn.y,mx.z-mn.z)*1.1,res=(1000,1000))
wb_render(R+'/blender/renders/drv_front.png',((mn.x+mx.x)/2,(mn.y+mx.y)/2-6,(mn.z+mx.z)/2),(math.radians(90),0,0),ortho=max(mx.x-mn.x,mx.z-mn.z)*1.1,res=(1000,1000))
