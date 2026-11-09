"""Sépare le volet mobile du DRS (élément supérieur de l'aileron arrière) depuis c3_car_driver_lh → c4_car_drs.
Règle : îlots (faces connexes) des objets d'aileron dont la boîte englobante est dans la zone du volet.
Pivot : bord de fuite du volet (axe X voiture) — ouverture = rotation qui lève le bord d'attaque (E : ~85 mm max réglementaire).
Exporte aussi /workspace/w11/assets-work/drs_flap_tris.json (triangles en coordonnées glTF) pour découper les GLB optimisés."""
import bpy, bmesh, sys, json, math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c3_car_driver_lh.blend')
RENDER='--render' in sys.argv; DRS_DEG=25  # E : ouverture ≈ 25° → fente ≈ 55 mm (max réglementaire 85 mm)
INC_LE='--with-le' in sys.argv
body=bpy.data.objects['W11_body']
def flap_island(name,isl,M):
    vs=[M@v.co for g in isl for v in g.verts]; xs=[v.x for v in vs]; ys=[v.y for v in vs]; zs=[v.z for v in vs]
    if not (min(ys)>=-2.402 and max(ys)<=-2.286 and min(zs)>=0.845 and max(abs(min(xs)),abs(max(xs)))<=0.506): return False
    if name=="MERCEDES_DETAIL" and max(abs(min(xs)),abs(max(xs)))<0.01: return False   # actionneur central (fixe) ; la cloison centrale CARBON1 et les flasques d'extrémité suivent le volet
    if max(zs)<0.885: return INC_LE and name=='Car_wing' and min(ys)>-2.34   # bandes de bord de fuite du plan principal
    return True
tris=[]; sel={}
for name in ['Car_wing','MERCEDES_CARBON1','MERCEDES_DETAIL']:
    o=bpy.data.objects[name]; M=o.matrix_world
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); seen=set(); pick=[]
    for f in bm.faces:
        if f.index in seen: continue
        st=[f]; isl=[]; seen.add(f.index)
        while st:
            g=st.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        if flap_island(name,isl,M): pick+= [g.index for g in isl]
    for i in pick:
        vs=[M@v.co for v in bm.faces[i].verts]
        for k in range(1,len(vs)-1):
            tris.append([[round(v.x,5),round(v.z,5),round(-v.y,5)] for v in (vs[0],vs[k],vs[k+1])])
    sel[name]=pick; print('FLAP',name,len(pick)); bm.free()
# séparation effective dans Blender
bpy.ops.object.select_all(action='DESELECT'); parts=[]
for name,pick in sel.items():
    if not pick: continue
    o=bpy.data.objects[name]; bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for i in pick: o.data.polygons[i].select=True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    new=[x for x in bpy.context.selected_objects if x!=o][0]; new.name='DRS_flap_'+name; parts.append(new); o.select_set(False); new.select_set(False)
lo,hi=wbbox(parts); print('FLAP_BBOX',tuple(lo),tuple(hi))
# pivot au bord de fuite (arrière = −Y, haut) : y min, z max
piv=empty('DRS_pivot',loc=(0,lo.y+0.004,hi.z-0.006),c=body.users_collection[0],size=0.05)
parent_keep(piv,body)
for p in parts: parent_keep(p,piv)
json.dump({'open_deg':DRS_DEG,'pivot_gltf':[0,round(hi.z-0.006,5),round(-(lo.y+0.004),5)],'axis_gltf':[1,0,0],'tris':tris},open(R+'/assets-work/drs_flap_tris.json','w'))
print('TRIS',len(tris))
# animation DRS : 0 = fermé, 1 = ouvert (rotation X)
piv.rotation_mode='XYZ'; piv.keyframe_insert('rotation_euler',frame=1); piv.rotation_euler.x=math.radians(DRS_DEG); piv.keyframe_insert('rotation_euler',frame=10)
act=piv.animation_data.action; act.name='drs_open'
save('c4_car_drs')
if RENDER:
    for p in parts:
        for m in p.data.materials: pass
    sc=bpy.context.scene; sc.display.shading.color_type='OBJECT'
    for o in bpy.data.objects:
        if o.type=='MESH': o.color=(1,0.1,0.1,1) if o in parts else (0.7,0.7,0.7,1)
    for fr,tag in ((1,'ferme'),(10,'ouvert')):
        sc.frame_set(fr)
        sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'
        cd=bpy.data.cameras.new('c'); co=bpy.data.objects.new('c',cd); sc.collection.objects.link(co); cd.type='ORTHO'; cd.ortho_scale=0.6
        co.location=(2.0,-2.33,0.93); co.rotation_euler=(math.radians(90),0,math.radians(90)); sc.camera=co
        sc.render.resolution_x,sc.render.resolution_y=900,700; sc.render.filepath=R+f'/out/blender/drs_cote_{tag}.png'; bpy.ops.render.render(write_still=True)
        co.location=(1.2,-3.6,1.6); cd.type='PERSP'; cd.lens=50
        d=mathutils.Vector((0,-2.3,0.9))-co.location; co.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
        sc.render.filepath=R+f'/out/blender/drs_34_{tag}.png'; bpy.ops.render.render(write_still=True); bpy.data.objects.remove(co)
