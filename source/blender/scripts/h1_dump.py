import bpy,sys,math
import numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/d1_driver_flat.blend')
out={}
for o in bpy.data.objects:
    if o.type!='MESH': continue
    mats=[m.name for m in o.data.materials]
    ims=set()
    for m in o.data.materials:
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE' and n.image: ims.add(n.image.name)
    if 'Image_7' not in ims: continue
    me=o.data; me.calc_loop_triangles()
    uvl=me.uv_layers.active.data  # UV active
    uvname=me.uv_layers.active.name
    # quel UV le matériau utilise ?
    used=set()
    for m in o.data.materials:
        for n in m.node_tree.nodes:
            if n.type=='UVMAP': used.add(n.uv_map)
    T=len(me.loop_triangles); P=np.zeros((T,3,3)); U=np.zeros((T,3,2)); N=np.zeros((T,3))
    for i,t in enumerate(me.loop_triangles):
        for j,l in enumerate(t.loops):
            P[i,j]=me.vertices[me.loops[l].vertex_index].co; U[i,j]=uvl[l].uv
        N[i]=t.normal
    key=o.name.replace(':','_')
    out[key+'__P']=P; out[key+'__U']=U; out[key+'__N']=N
    print('DUMP',o.name,mats,T,'uv',uvname,'nodes_uv',used,'U range',U.reshape(-1,2).min(0),U.reshape(-1,2).max(0))
np.savez_compressed(R+'/assets-work/helmet_tris.npz',**out)
img=bpy.data.images['Image_7']; img.filepath_raw=R+'/assets-work/helmet_atlas_orig.png'; img.file_format='PNG'; img.save()
print('SAVED atlas')
