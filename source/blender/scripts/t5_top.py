import bpy,sys
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
HIDE=('top-ext','treesline','trees','road-ext','grass-ext','Glass','bushes')
for o in bpy.data.objects:
    if o.type=='MESH' and any(mm and mm.name.startswith(HIDE) for mm in o.data.materials): o.hide_render=True
wb_render(R+'/blender/renders/track_top_circuit.png',(0,-50,800),(0,0,0),ortho=2250,res=(2400,2400))
