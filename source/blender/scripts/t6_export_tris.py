import bpy,sys
import numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
groups={'asph':['asph.001','asph_new','asph_patch_joint','asph-pitlane-old','asph_pitlane_old','groove'],'line':['line.001','doted_line'],'kerb':['kerb_new','CURB_B','carpet','diss2'],'grass':['GRASS','grass-side'],'sand':['sand'],'wall':['walls','barriers','jersey','grails','concrete-barrie','fences.','fence','metal_beam','grilles']}
out={}
for g,ms in groups.items():
    T=[]
    for o in bpy.data.objects:
        if o.type!='MESH' or not any(mm and mm.name.startswith(tuple(ms)) for mm in o.data.materials): continue
        V=verts_world(o); me=o.data; me.calc_loop_triangles()
        tri=np.empty(len(me.loop_triangles)*3,dtype=np.int64); me.loop_triangles.foreach_get('vertices',tri)
        T.append(V[tri.reshape(-1,3)])
    out[g]=np.vstack(T).astype(np.float32); print('G',g,out[g].shape)
np.savez_compressed(R+'/assets-work/track_tris.npz',**out)
