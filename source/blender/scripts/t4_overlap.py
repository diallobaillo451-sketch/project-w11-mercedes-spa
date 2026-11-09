import bpy,sys,json
import numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
from mathutils.bvhtree import BVHTree
from mathutils import Vector
import bmesh
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
GROUND=['asph.001','asph_new','asph_patch_joint','asph-pitlane-old.001','asph_pitlane_old','asph-grv','line.001','kerb_new','CURB_B','groove1','groove2','groove3','groove_custom','carpet.001','carpet-full','carpet-blue','doted_line','diss2','GRASS','grass-side1.','grass-side2','grass-side4','grass-side1B','grass-ext-shad','road-ext-tile','top-ext','sand.001','sand_new','Parking','construction_dirt','new_AO','new_AO2','texts_new','water','asph-pitlane-old-red','sbancamento']
objs={}
for o in bpy.data.objects:
    if o.type!='MESH': continue
    for m in GROUND:
        if any(mm and mm.name.startswith(m) for mm in o.data.materials): objs.setdefault(m,[]).append(o)
data={}
for m,ol in objs.items():
    bm=bmesh.new()
    for o in ol:
        me=o.data.copy(); me.transform(o.matrix_world); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.faces.ensure_lookup_table()
    cents=[(f.calc_center_median(),f.normal.copy(),f.calc_area()) for f in bm.faces]
    data[m]=(BVHTree.FromBMesh(bm),cents)
    bm.free()
rng=np.random.default_rng(1)
pairs=[]
for a,(ta,ca) in data.items():
    idx=rng.choice(len(ca),min(1500,len(ca)),replace=False)
    for b,(tb,cb) in data.items():
        if a==b: continue
        cnt=0; area=0; n=0
        for i in idx:
            c,nr,ar=ca[i]
            if nr.z<0.3: continue
            n+=1
            loc,nor,fi,dist=tb.find_nearest(c,0.006)
            if loc is not None:
                cnt+=1; area+=ar
        if n and cnt/n>0.02: pairs.append((a,b,round(cnt/n,3),n))
for p in sorted(pairs,key=lambda p:-p[2]): print('OVERLAP',p)
json.dump(pairs,open(R+'/reports/track_overlaps.json','w'),indent=0)
