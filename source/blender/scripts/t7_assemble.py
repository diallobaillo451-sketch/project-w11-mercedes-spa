"""Assemblage piste Spa : suppression doublons, ordre de couches anti z-fighting, tuilage spatial, export GLB.
Ne modifie pas les sources (assets-raw) ; part de stages/t1_track_raw.blend."""
import bpy,sys,json,math,re
import numpy as np, bmesh
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
def base(n): return re.sub(r'\.\d{3}$','',n)
PRIO=[(['GRASS','grass-side1','grass-side2','grass-side4','grass-side1B','grass-ext-shad','sand','construction_dirt','Parking','top-ext','road-ext-tile','sbancamento_D','water'],0),
      (['sand_new'],1),(['asph','asph-pitlane-old','asph_pitlane_old','asph-grv','asph-pitlane-old-red'],2),(['asph_new'],3),
      (['asph_patch_joint','diss2','new_AO','carpet','carpet-full','carpet-blue'],4),(['kerb_new','CURB_B'],5),
      (['groove1','groove2','groove3','groove_custom'],6),(['line','doted_line','texts_new'],7)]
PMAP={m:p for ms,p in PRIO for m in ms}
LIFT=0.004
log={'deleted':[],'lift':{},'tiles':0}
# 1) suppression : Null (bloqueurs invisibles), new_AO2 (doublon 100 % de new_AO)
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.data.materials and base(o.data.materials[0].name) in ('Null','new_AO2'):
        log['deleted'].append((o.name,o.data.materials[0].name,len(o.data.polygons))); bpy.data.objects.remove(o)
# 2) aplatir les transformations (monde) + single user
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in meshes:
    if o.data.users>1: o.data=o.data.copy()
    o.data.transform(o.matrix_world); o.parent=None; o.matrix_world=__import__('mathutils').Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o.type!='MESH': bpy.data.objects.remove(o)
# 3) un objet = un matériau (les meshes Sketchfab sont déjà mono-matériau ; on vérifie)
multi=[o.name for o in meshes if len(o.data.materials)>1]
print('MULTI',multi)
# 3b) fusion des matériaux dupliqués entre fichiers (.001/.002/.003) si même nom de base ET mêmes images (hash)
import hashlib
def sig(m):
    h=[]
    for n in m.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image:
            d=n.image.packed_file.data if n.image.packed_file else n.image.filepath.encode()
            h.append(hashlib.md5(d).hexdigest())
    b=m.node_tree.nodes.get('Principled BSDF')
    if b: h.append(str(round(b.inputs['Roughness'].default_value,3))+str(round(b.inputs['Metallic'].default_value,3)))
    return tuple(sorted(h))
canon={}; merged=[]
for o in meshes:
    m=o.data.materials[0]; key=(base(m.name),sig(m))
    if key not in canon: canon[key]=m
    elif canon[key] is not m:
        merged.append((m.name,canon[key].name)); o.data.materials[0]=canon[key]
log['merged_materials']=sorted(set(merged))
print('MERGED',len(set(merged)))
# 4) lifts par priorité de couche
for o in meshes:
    mb=base(o.data.materials[0].name)
    if mb in PMAP:
        p=PMAP[mb]; dz=LIFT*p
        if dz: o.data.transform(__import__('mathutils').Matrix.Translation((0,0,dz)))
        o['w11_layer']=p; o.data.materials[0]['w11_layer']=p
        log['lift'][mb]=dz
# 5) tuilage spatial (400 m) des gros objets puis fusion par (matériau, tuile)
T=500.0
def tile_of(c): return (int(math.floor(c[0]/T)),int(math.floor(c[1]/T)))
groups={}
NOTILE={'top-ext','grass-ext-shad','treesline','water','sbancamento_D'}
MATTRIS={}
for o in meshes: MATTRIS[base(o.data.materials[0].name)]=MATTRIS.get(base(o.data.materials[0].name),0)+len(o.data.polygons)
for o in list(meshes):
    me=o.data; n=len(me.polygons)
    cent=np.zeros(n*3); me.polygons.foreach_get('center',cent); cent=cent.reshape(-1,3)
    keys=np.floor(cent[:,:2]/T).astype(int)
    far=(np.abs(cent[:,0])>900)|(np.abs(cent[:,1])>1300)
    keys[far]=99
    if MATTRIS[base(o.data.materials[0].name)]<4000 or base(o.data.materials[0].name) in NOTILE: keys[:]=99
    uk=np.unique(keys,axis=0)
    mat=o.data.materials[0].name
    if len(uk)==1:
        groups.setdefault((mat,tuple(uk[0])),[]).append(o); continue
    for k in uk:
        bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        kill=[f for f,kk in zip(bm.faces,keys) if not (kk[0]==k[0] and kk[1]==k[1])]
        bmesh.ops.delete(bm,geom=kill,context='FACES')
        nm=bpy.data.meshes.new(me.name+f'_t{k[0]}_{k[1]}'); bm.to_mesh(nm); bm.free()
        for m_ in me.materials: nm.materials.append(m_)
        no=bpy.data.objects.new(o.name+f'_t{k[0]}_{k[1]}',nm); o.users_collection[0].objects.link(no)
        for kk_,vv in o.items(): no[kk_]=vv
        groups.setdefault((mat,tuple(k)),[]).append(no)
    bpy.data.objects.remove(o)
# fusion
out=bpy.data.collections.new('TRACK'); bpy.context.scene.collection.children.link(out)
final=[]
for (mat,k),ol in groups.items():
    if len(ol)>1:
        with bpy.context.temp_override(active_object=ol[0],selected_editable_objects=ol,object=ol[0]):
            bpy.ops.object.join()
    o=ol[0]; o.name=f'{base(mat)}__'+('far' if k[0]==99 else f'{k[0]}_{k[1]}')
    for u in list(o.users_collection): u.objects.unlink(o)
    out.objects.link(o); final.append(o)
for c in list(bpy.data.collections):
    if c is not out and len(c.all_objects)==0: bpy.data.collections.remove(c)
log['tiles']=len(final); log['tris']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in final)
print('FINAL objects',len(final),'tris',log['tris'])
json.dump(log,open(R+'/reports/track_assemble.json','w'),indent=1)
save('t2_track_assembled')
bpy.ops.export_scene.gltf(filepath=R+'/assets-work/spa_assembled.glb',export_format='GLB',export_extras=True,
    export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_image_format='AUTO')
print('EXPORTED')
