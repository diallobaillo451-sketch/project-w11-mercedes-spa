# Pilote : armature, pesage auto, pose cockpit, IK des bras vers le volant, animation "steer" (gauche->droite)
import bpy,sys,math,json
import numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
P=dict(theta=48,head=-30,hip=(0,0.60,0.27),thigh=3,shin=2,yaw=6)
if '--' in sys.argv:
    a=sys.argv[sys.argv.index('--')+1:]
    if a: P['theta']=float(a[0]); P['head']=float(a[1]); P['hip']=(0,float(a[2]),float(a[3]))
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c1_car_rig.blend')
with bpy.data.libraries.load(STAGES+'/d1_driver_flat.blend') as (src,dst): dst.objects=src.objects
cd=coll('DRIVER')
for o in dst.objects: cd.objects.link(o)
D={o.name:o for o in dst.objects}
# ---- armature au repos (coordonnées pilote d'origine)
J=dict(hip=(0,0.068,0.574),neck=(0,0.026,1.19),headtop=(0,0.05,1.47),
       shR=(0.217,0.068,1.078),elR=(0.26,0.33,1.064),wrR=(0.282,0.595,1.075),knR=(0.29,0.69,1.07),tipR=(0.29,0.785,1.07),
       hpR=(0.14,0.068,0.574),kneeR=(0.14,0.544,0.728),ankR=(0.14,0.866,0.574),toeR=(0.14,1.0,0.72))
for k in list(J):
    if k.endswith('R'): x,y,z=J[k]; J[k[:-1]+'L']=(-x,y,z)
arm_d=bpy.data.armatures.new('DRV_arm'); arm=bpy.data.objects.new('DRV_rig',arm_d); cd.objects.link(arm)
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT')
def bone(n,h,t,par=None,conn=False):
    b=arm_d.edit_bones.new(n); b.head=Vector(J[h]) if isinstance(h,str) else Vector(h); b.tail=Vector(J[t]) if isinstance(t,str) else Vector(t)
    b.roll=0
    if par: b.parent=arm_d.edit_bones[par]; b.use_connect=conn
    return b
bone('root',(0,0.068,0.474),'hip')
bone('spine','hip','neck','root')
bone('head','neck','headtop','spine')
for s in 'LR':
    bone('upperarm.'+s,'sh'+s,'el'+s,'spine')
    bone('forearm.'+s,'el'+s,'wr'+s,'upperarm.'+s,True)
    bone('hand.'+s,'wr'+s,'kn'+s,'forearm.'+s,True)
    bone('fingers.'+s,'kn'+s,'tip'+s,'hand.'+s,True)
    bone('thigh.'+s,'hp'+s,'knee'+s,'root')
    bone('shin.'+s,'knee'+s,'ank'+s,'thigh.'+s,True)
    bone('foot.'+s,'ank'+s,'toe'+s,'shin.'+s,True)
bpy.ops.object.mode_set(mode='OBJECT')
suit=[o for o in dst.objects if 'SUIT' in o.name][0]; glov=[o for o in dst.objects if 'GLOVES' in o.name][0]
def auto(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    arm.select_set(True); bpy.context.view_layer.objects.active=arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
auto([suit]); auto([glov])
for o in (suit,glov):
    nz=sum(1 for v in o.data.vertices if len(v.groups)==0); print('UNWEIGHTED',o.name,nz,len(o.data.vertices))
# objets rigides -> parent os
rigid_head=[o for o in dst.objects if o.name.startswith(('Helmet','HansStrap','VISOR','DRIVER:GEO_Driver'))]
rigid_spine=[o for o in dst.objects if o.name.startswith(('DRIVER:COLLARE','F1:Comms'))]
def bone_parent(o,b):
    mw=o.matrix_world.copy(); o.parent=arm; o.parent_type='BONE'; o.parent_bone=b
    bpy.context.view_layer.update(); o.matrix_world=mw
for o in rigid_head: bone_parent(o,'head')
for o in rigid_spine: bone_parent(o,'spine')
left=[o.name for o in dst.objects if o.parent is None and o!=arm]; print('UNPARENTED',left)
arm.parent=bpy.data.objects['W11_body']
# ---- pose cockpit
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='POSE')
PB=arm.pose.bones
def setw(n,M): PB[n].matrix=M; bpy.context.view_layer.update()
def rest(n): return arm_d.bones[n].matrix_local.copy()
hipR=Vector(J['hip']); hipT=Vector(P['hip'])
Troot=Matrix.Translation(hipT-hipR)
setw('root',Troot@rest('root'))
Rs=Matrix.Translation(hipT)@Matrix.Rotation(math.radians(P['theta']),4,'X')@Matrix.Translation(-hipT)
setw('spine',Rs@Troot@rest('spine'))
neckW=(Rs@Troot)@Vector(J['neck'])
Rh=Matrix.Translation(neckW)@Matrix.Rotation(math.radians(P['head']),4,'X')@Matrix.Translation(-neckW)
setw('head',Rh@Rs@Troot@rest('head'))
TH=math.radians(P.get('thigh',8)); SH=math.radians(P.get('shin',22))
for s in 'LR':
    hp=Troot@Vector(J['hp'+s]); YW=math.radians(P.get('yaw',6))*(1 if s=='R' else -1); Rt=Matrix.Translation(hp)@Matrix.Rotation(YW,4,'Z')@Matrix.Rotation(TH,4,'X')@Matrix.Translation(-hp)
    setw('thigh.'+s,Rt@Troot@rest('thigh.'+s))
    kn=Rt@Troot@Vector(J['knee'+s]); Rk=Matrix.Translation(kn)@Matrix.Rotation(SH,4,'X')@Matrix.Translation(-kn)
    setw('shin.'+s,Rk@Rt@Troot@rest('shin.'+s)); setw('foot.'+s,Rk@Rt@Troot@rest('foot.'+s))
# cibles IK attachées au volant
sw=bpy.data.objects['STEERING_WHEEL']; bpy.context.view_layer.update()
SWM=sw.matrix_world.copy()
grip={'R':Vector((0.15,0.64,0.605)),'L':Vector((-0.15,0.64,0.605))}
targets={}
for s,sg in (('R',1),('L',-1)):
    f=Vector((-0.22*sg,0.85,0.45)).normalized(); n=Vector((-1.0*sg,0,0)); n=(n-f*f.dot(n)).normalized(); b3=f.cross(n)
    f0=Vector((0,1,0)); n0=Vector((0,0,-1)); b0=f0.cross(n0)
    A=Matrix((f,n,b3)).transposed(); B=Matrix((f0,n0,b0)).transposed(); Rg=(A@B.transposed()).to_4x4()
    handrest=rest('hand.'+s)
    Mt=Matrix.Translation(grip[s])@Rg@Matrix.Translation(-Vector(J['wr'+s]))@handrest
    e=empty('IK_hand.'+s,c=cd,size=0.03); e.matrix_world=Mt; parent_keep(e,sw)
    pole=empty('IK_pole.'+s,loc=(0.55*sg,0.30,0.25),c=cd,size=0.03); parent_keep(pole,bpy.data.objects['W11_body'])
    c=PB['forearm.'+s].constraints.new('IK'); c.target=e; c.pole_target=pole; c.chain_count=2; c.pole_angle=math.radians(-90 if sg>0 else -90)
    c2=PB['hand.'+s].constraints.new('COPY_ROTATION'); c2.target=e
    targets[s]=e
bpy.context.view_layer.update()
CURL=math.radians(70)
def fingers():
    for s in 'LR':
        hr=rest('hand.'+s); hc=PB['hand.'+s].matrix.copy(); k=Vector(J['kn'+s])
        Mf=hc@hr.inverted()@Matrix.Translation(k)@Matrix.Rotation(-CURL,4,Vector((1,0,0)))@Matrix.Translation(-k)@rest('fingers.'+s)
        PB['fingers.'+s].matrix=Mf
# ---- bake de l'animation steer : 9 clés de -90° à +90°
act=bpy.data.actions.new('steer'); arm.animation_data_create(); arm.animation_data.action=act
sc=bpy.context.scene; sc.frame_start=0; sc.frame_end=8
sw.rotation_mode='XYZ'
baked={}
for fr in range(9):
    ang=-90+22.5*fr; sw.rotation_euler=(0,math.radians(ang),0); bpy.context.view_layer.update()
    mats={b.name:b.matrix.copy() for b in PB}
    baked[fr]=mats
for b in PB:
    for c in list(b.constraints): b.constraints.remove(c)
for fr in range(9):
    sw.rotation_euler=(0,math.radians(-90+22.5*fr),0); bpy.context.view_layer.update()
    for name in [b.name for b in arm_d.bones if b.parent is None]+[b.name for b in arm_d.bones if b.parent is not None]:
        PB[name].matrix=baked[fr][name]; bpy.context.view_layer.update()
    fingers(); bpy.context.view_layer.update()
    for b in PB:
        b.rotation_mode='QUATERNION'
        b.keyframe_insert('location',frame=fr); b.keyframe_insert('rotation_quaternion',frame=fr); b.keyframe_insert('scale',frame=fr)
sw.rotation_euler=(0,0,0); sc.frame_set(4)
bpy.ops.object.mode_set(mode='OBJECT')
for o in (targets['L'],targets['R']): pass
for n in ('IK_hand.L','IK_hand.R','IK_pole.L','IK_pole.R'): bpy.data.objects.remove(bpy.data.objects[n])
bpy.context.view_layer.update()
hb=[o for o in dst.objects if o.name.startswith('Helmet_Base_Helmet')][0]
mn,mx=wbbox([hb]); print('HELMET_POSED',mn,mx)
save('c2_car_driver')
