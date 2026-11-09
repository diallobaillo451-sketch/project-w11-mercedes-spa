"""Exporte les triangles (coords Blender, Z haut) par catégorie pour la collision réelle et la voie des stands :
barrières (rails, murs, béton, pneus, grillages bas), sol de piste, asphalte des stands → assets-work/coll/tris.npz"""
import bpy,re,numpy as np
bpy.ops.wm.open_mainfile(filepath='/workspace/w11/blender/stages/t2_track_assembled.blend')
def base(n): return re.sub(r'\.\d{3}$','',n)
CAT={}
for m in ['grails','jersey','concrete-barrie-raw','concrete-barrie-red','walls','barriers','stone-wall','ivy-wall','fences','fence2_at','fence-special','box1-ppix','box1_multimap','box1_map','box-door','box-door2','structures','main-gstand','raidillon-grandstand','houses1','houses5','houses12','house7_Slot_1','marshal-post','digitalflag_pole','seat1','misc','objects1']: CAT[m]=1  # obstacles
for m in ['asph','asph_new','asph-grv','road-ext-tile','asph_patch_joint','diss2','kerb_new','CURB_B','carpet','carpet-full','carpet-blue','grilles','Parking']: CAT[m]=2  # sol roulable
for m in ['asph_pitlane_old','asph-pitlane-old','asph-pitlane-old-red']: CAT[m]=3  # asphalte stands
for m in ['grass-side1','grass-side1B','grass-side2','grass-side4','GRASS','top-ext','grass-ext-shad','sbancamento_D','sand','sand_new','construction_dirt']: CAT[m]=4
out={k:[] for k in (1,2,3,4)}; mats={k:[] for k in (1,2,3,4)}; names=[]
for o in bpy.data.objects:
    if o.type!='MESH' or not o.data.materials: continue
    me=o.data; M=o.matrix_world; V=np.array([(M@v.co)[:] for v in me.vertices],np.float32)
    me.calc_loop_triangles()
    for t in me.loop_triangles:
        ms=me.materials[t.material_index]
        if not ms: continue
        mb=base(ms.name); c=CAT.get(mb)
        if not c: continue
        if mb not in names: names.append(mb)
        out[c].append(V[list(t.vertices)]); mats[c].append(names.index(mb))
np.savez_compressed('/workspace/w11/assets-work/coll/tris.npz',**{f'c{k}':np.array(v,np.float32) for k,v in out.items()},**{f'm{k}':np.array(v,np.int16) for k,v in mats.items()},names=np.array(names))
print({k:len(v) for k,v in out.items()})
