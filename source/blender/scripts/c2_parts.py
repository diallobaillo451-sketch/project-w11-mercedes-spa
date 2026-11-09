import bpy,sys,bmesh
import numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c0_car_raw.blend')
for o in bpy.data.objects:
    if o.type!='MESH': continue
    bm=bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    M=o.matrix_world
    # composantes connexes
    seen=set(); comps=[]
    for v in bm.verts:
        if v.index in seen: continue
        st=[v]; seen.add(v.index); cs=[]
        while st:
            x=st.pop(); cs.append((M@x.co))
            for e in x.link_edges:
                w=e.other_vert(x)
                if w.index not in seen: seen.add(w.index); st.append(w)
        comps.append(np.array(cs))
    near=sum(1 for c in comps if abs(c[:,0].mean())>0.5)
    print('PARTS',o.data.materials[0].name if o.data.materials else '-',len(comps),'outer(|x|>0.5):',near)
