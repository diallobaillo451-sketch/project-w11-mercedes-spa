"""Ligne centrale 3D : z, normale, largeur gauche/droite par raycast BVH sur couches roulables. Sortie en coordonnées glTF (x, z, -y)."""
import bpy,sys,json,re,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t2_track_assembled.blend')
def base(n): return re.sub(r'\.\d{3}$','',n)
DRIVE={'asph','asph_new','asph_patch_joint','asph-pitlane-old','asph_pitlane_old','asph-grv','kerb_new','CURB_B','carpet','carpet-full','carpet-blue','diss2'}
ROAD={'asph','asph_new','asph_patch_joint','asph-grv','diss2'}
verts=[];tris=[];tag=[]
for o in bpy.data.objects:
    if o.type!='MESH': continue
    mb=base(o.data.materials[0].name)
    if mb not in DRIVE: continue
    me=o.data; off=len(verts)
    verts+= [v.co.copy() for v in me.vertices]
    me.calc_loop_triangles()
    for t in me.loop_triangles: tris.append(tuple(off+i for i in t.vertices)); tag.append(mb in ROAD)
bvh=BVHTree.FromPolygons(verts,tris)
cl=np.load(R+'/assets-work/cl_smooth.npy')
area=0.5*np.sum(cl[:,0]*np.roll(cl[:,1],-1)-np.roll(cl[:,0],-1)*cl[:,1])
print('signed area',area)
if area>0: cl=cl[::-1].copy(); print('reversed to clockwise')
N=len(cl); D=Vector((0,0,-1))
def hit(x,y):
    r=bvh.ray_cast(Vector((x,y,600)),D,1200)
    return r
pts=[];miss=0
for i in range(N):
    p=cl[i]; q=cl[(i+1)%N]; m=cl[i-1]
    t=np.array(q)-np.array(m); t/=np.linalg.norm(t); lat=np.array([t[1],-t[0]])  # droite
    loc,nor,idx,d=hit(*p)
    if loc is None: miss+=1; pts.append(None); continue
    w=[]
    for sgn in (-1,1):
        k=0.0; last=0.0
        while k<25:
            k+=0.25; xy=p+sgn*lat*k; r=hit(*xy)
            if r[0] is None or abs(r[0].z-loc.z)>3 or not tag[r[2]]: break
            last=k
        w.append(last)
    pts.append(dict(x=float(p[0]),y=float(p[1]),z=float(loc.z),n=[float(nor.x),float(nor.y),float(nor.z)],wl=w[0],wr=w[1]))
# interpolation des manques
for i in range(N):
    if pts[i] is None:
        j=i
        while pts[j%N] is None: j+=1
        pts[i]=dict(pts[j%N])
s=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(cl,axis=0),axis=1))])
# glTF : X=x, Y=z, Z=-y
out=dict(note='coords glTF (Y haut), s en m depuis le point 0 de la ligne centrale (ligne de départ approx.)',length=float(s[-1]+np.linalg.norm(cl[0]-cl[-1])),
  points=[[round(p['x'],3),round(p['z'],3),round(-p['y'],3),round(p['n'][0],4),round(p['n'][2],4),round(-p['n'][1],4),round(p['wl'],2),round(p['wr'],2),round(float(si),2)] for p,si in zip(pts,s)],
  fields=['x','y','z','nx','ny','nz','widthLeft','widthRight','s'],miss=miss)
json.dump(out,open(R+'/assets-work/spa_centerline.json','w'))
W=np.array([[p['wl'],p['wr']] for p in pts]); Z=np.array([p['z'] for p in pts])
print('miss',miss,'width p5/p50/p95',np.percentile(W.sum(1),[5,50,95]),'z range',Z.min(),Z.max())
