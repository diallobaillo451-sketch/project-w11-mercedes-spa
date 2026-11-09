import bpy,sys,json,math,random
import numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
from mathutils.bvhtree import BVHTree
import bmesh
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
def bymat(m): return [o for o in bpy.data.objects if o.type=='MESH' and any(mm and mm.name.startswith(m) for mm in o.data.materials)]
def bvh(objs):
    bm=bmesh.new()
    for o in objs:
        me=o.data.copy(); me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    t=BVHTree.FromBMesh(bm); bm.free(); return t
A=bvh(bymat('asph.001')+bymat('asph_new'))
res={}
for m in ['line.001','kerb_new','CURB_B','groove1','groove2','groove3','groove_custom','carpet.001','carpet-full','asph_new','asph.001','asph_patch_joint','doted_line','grass-side1.','GRASS','sand.001','sand_new','texts_new','asph-pitlane-old.001','diss2','carpet-blue']:
    objs=bymat(m)
    if not objs: res[m]='none'; continue
    P=np.vstack([verts_world(o) for o in objs]); idx=np.random.default_rng(0).choice(len(P),min(3000,len(P)),replace=False)
    d=[]
    for p in P[idx]:
        v=mathutils.Vector(p)
        hit=A.ray_cast(v+mathutils.Vector((0,0,2)),mathutils.Vector((0,0,-1)),4)
        if hit[0]: d.append(v.z-hit[0].z)
    d=np.array(d)
    if len(d)==0: res[m]='no asph below'; continue
    res[m]=dict(n=len(d),frac_on_asph=round(len(d)/len(idx),2),p5=round(float(np.percentile(d,5)),4),p50=round(float(np.median(d)),4),p95=round(float(np.percentile(d,95)),4),min=round(float(d.min()),3))
for k,v in res.items(): print('LAYER',k,v)
json.dump(res,open(R+'/reports/track_layers.json','w'),indent=1)
