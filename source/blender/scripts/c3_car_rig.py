# Voiture W11 : orientation (avant=+Y, haut=+Z, sol z=0, origine = milieu des essieux),
# séparation des roues en 4 coins (pièces tournantes / pièces fixes de moyeu), pivots, volant.
import bpy,sys,bmesh,math,json
import numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c0_car_raw.blend')
meshes=[o for o in bpy.data.objects if o.type=='MESH']
# 1) aplatir : tout en coordonnées monde, rotation 180° Z
Rz=Matrix.Rotation(math.pi,4,'Z')
for o in meshes:
    mw=o.matrix_world.copy(); o.parent=None; o.data=o.data.copy() if o.data.users>1 else o.data
    o.data.transform(Rz@mw); o.matrix_world=Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o.type!='MESH': bpy.data.objects.remove(o)
def mat(o): return o.data.materials[0].name if o.data.materials else ''
tyre=[o for o in meshes if mat(o)=='Tyre'][0]
V=verts_world(tyre)
corners={}
for k,(sx,sy) in {'FL':(-1,1),'FR':(1,1),'RL':(-1,-1),'RR':(1,-1)}.items():
    # après rotation 180°, l'avant est +Y ; gauche = -X (vu du pilote regardant +Y, la gauche est -X)
    m=(np.sign(V[:,0])==sx)&(np.sign(V[:,1])==sy); P=V[m]
    c=(P.min(0)+P.max(0))/2; r=(P[:,2].max()-P[:,2].min())/2
    corners[k]=dict(c=c,r=r,xmin=P[:,0].min(),xmax=P[:,0].max())
yf=(corners['FL']['c'][1]+corners['FR']['c'][1])/2; yr=(corners['RL']['c'][1]+corners['RR']['c'][1])/2; ymid=(yf+yr)/2
print('WHEELBASE',yf-yr,'radii',{k:round(v['r'],4) for k,v in corners.items()},'tracks',corners['FR']['c'][0]-corners['FL']['c'][0],corners['RR']['c'][0]-corners['RL']['c'][0])
T=Matrix.Translation((0,-ymid,0))
for o in meshes: o.data.transform(T)
for k in corners: corners[k]['c'][1]-=ymid
SPIN_MATS={'Tyre','RIM_BLUR','mercedes_wheel_hub_BLUR','mercedes_wheel_hub','discs','EXT_Disc','GENERICS'}
STATIC_MATS={'EXT_Caliper','EXT_Caliper_Logo'}
coll_car=coll('W11'); 
root=empty('W11_root',c=coll_car,size=0.5)
body=empty('W11_body',parent=root,c=coll_car,size=0.3)
wheel_objs={k:{'spin':[], 'hub':[]} for k in corners}
def which_corner(P):
    cx,cy=P[:,0].mean(),P[:,1].mean()
    best=None
    for k,c in corners.items():
        cc=c['c']; d=np.hypot(P[:,1]-cc[1],P[:,2]-cc[2]).max()
        inx=(P[:,0].min()>=min(c['xmin'],cc[0])-0.25) and (P[:,0].max()<=max(c['xmax'],cc[0])+0.25) and np.sign(cx)==np.sign(cc[0])
        if inx and d<=c['r']+0.03: best=k
    return best
def split_loose(o):
    bpy.context.view_layer.objects.active=o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    return list(bpy.context.selected_objects)
stats={}
for o in list(meshes):
    m=mat(o); V=verts_world(o)
    if np.abs(V[:,0]).max()<0.5: continue
    parts=split_loose(o)
    groups={}
    for p in parts:
        P=verts_world(p); k=which_corner(P)
        if k is None: groups.setdefault('body',[]).append(p); continue
        # tournant ? matériau ou couverture angulaire
        cc=corners[k]['c']; ang=np.arctan2(P[:,2]-cc[2],P[:,1]-cc[1]); cov=len(np.unique(((ang+math.pi)/(2*math.pi)*36).astype(int)))
        spin = (m in SPIN_MATS) or (m not in STATIC_MATS and cov>=33)
        groups.setdefault((k,'spin' if spin else 'hub'),[]).append(p)
    for g,ps in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in ps: p.select_set(True)
        bpy.context.view_layer.objects.active=ps[0]
        if len(ps)>1: bpy.ops.object.join()
        j=bpy.context.view_layer.objects.active
        if g=='body': j.name=f'{m}'; 
        else:
            j.name=f'{g[0]}_{g[1]}_{m}'; wheel_objs[g[0]][g[1]].append(j)
        stats[str(g)+m]=len(ps)
# hiérarchie roues
info={}
for k,c in corners.items():
    cc=Vector(c['c'])
    up=empty(f'W_{k}',loc=cc,parent=root,c=coll_car,size=0.35,disp='CIRCLE')  # pivot direction (front) / suspension
    sp=empty(f'W_{k}_spin',loc=(0,0,0),parent=up,c=coll_car,size=0.3,disp='SPHERE')
    for o in wheel_objs[k]['spin']: o.data.transform(Matrix.Translation(-cc)); o.parent=sp
    for o in wheel_objs[k]['hub']: o.data.transform(Matrix.Translation(-cc)); o.parent=up
    info[k]=dict(center=[round(x,4) for x in cc],radius=round(c['r'],4),spin=[o.name for o in wheel_objs[k]['spin']],hub=[o.name for o in wheel_objs[k]['hub']])
# volant
SW_MATS=['mercedes_steeringwheel','mercedes_carbon4','CLEARLED','CLEARLED_PRE','W11_DISPLAY','kers_brown','kers_green','kers_red','gp21_LCD','TAG_DRS_ON','SW_ALPHA','Steer_Logo','vehicle_revs_type2','Material.001']
sw=[o for o in bpy.data.objects if o.type=='MESH' and o.parent is None and mat(o) in SW_MATS]
mn,mx=wbbox(sw); swc=Vector(((mn.x+mx.x)/2,(mn.y+mx.y)/2,(mn.z+mx.z)/2))
disp=[o for o in sw if mat(o) in ('W11_DISPLAY','gp21_LCD')]
dmn,dmx=wbbox(disp); swc.z=(dmn.z+dmx.z)/2   # axe de colonne ≈ centre de l'écran
swe=empty('STEERING_WHEEL',loc=swc,parent=root,c=coll_car,size=0.15,disp='ARROWS')
for o in sw: o.data.transform(Matrix.Translation(-swc)); o.parent=swe
info['steering_wheel']=dict(center=[round(x,4) for x in swc],objs=[o.name for o in sw])
for o in bpy.data.objects:
    if o.type=='MESH' and o.parent is None: o.parent=body
for o in bpy.data.objects:
    if o.users_collection and o.users_collection[0]!=coll_car: move_to(o,coll_car)
mn,mx=wbbox([o for o in bpy.data.objects if o.type=='MESH'])
info['bbox']=[list(mn),list(mx)]; info['wheelbase']=yf-yr
print('INFO',json.dumps(info)[:1500]); print('STATS',stats)
json.dump(info,open(R+'/reports/car_rig.json','w'),indent=1)
save('c1_car_rig')
