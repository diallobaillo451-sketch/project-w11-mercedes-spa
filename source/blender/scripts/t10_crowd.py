"""Public des tribunes (point 8) : places assises extraites de la géométrie réelle des tribunes du modèle.
- Tribune du Raidillon (Gold 3) : gradins modélisés en pente unique (≈ 33°, 2 181 m²) → treillis 0,52 m (largeur de place)
  × 0,78 m (pas de rangée le long de la pente) ; orientation = normale horizontale de la pente (vers la piste).
- Tribune principale (seat1) : gradins à marches → une rangée au milieu de chaque marche, place tous les 0,52 m,
  orientée vers le point le plus proche de la ligne centrale.
Taux d'occupation 72 % (tirage déterministe). Sortie game/public/track/crowd.bin : en-tête uint32 [n], puis n × float32
(x, y, z, lacet) en coordonnées glTF (Y haut), + crowd.json (comptes)."""
import bpy,json,math,numpy as np
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='/workspace/w11/blender/stages/t2_track_assembled.blend')
R='/workspace/w11/'
cl=json.load(open(R+'assets-work/spa_centerline_v4.json'));P=np.array(cl['points']);CX=P[:,0];CY=-P[:,2]
rng=np.random.default_rng(2020)
out=[];stat={}
def face(fx,fy): return math.atan2(fx,fy)
def tris_of(o,cond):
    W=o.matrix_world;N=W.to_3x3();o.data.calc_loop_triangles();T=[]
    for t in o.data.loop_triangles:
        n=(N@t.normal).normalized()
        if cond(n): T.append(([W@o.data.vertices[i].co for i in t.vertices],n))
    return T
# --- Raidillon : pente
o=bpy.data.objects['raidillon-grandstand__0_0']
T=tris_of(o,lambda n:0.8<n.z<=0.95)
nm=sum((n for _,n in T),Vector()).normalized()
h=Vector((nm.x,nm.y,0)).normalized()          # vers la piste (horizontal)
u=Vector((-h.y,h.x,0))                          # le long des rangées
v=nm.cross(u).normalized()                      # le long de la pente
if v.z<0: v=-v
pts=[]
for tri,_ in T:
    A=np.array([[p.dot(u),p.dot(v)] for p in tri]);o3=tri[0]
    lo=A.min(0);hi=A.max(0)
    for a in np.arange(math.floor(lo[0]/0.52)*0.52,hi[0],0.52):
        for b in np.arange(math.floor(lo[1]/0.78)*0.78+0.39,hi[1],0.78):
            # barycentrique
            p=np.array([a,b]);v0=A[1]-A[0];v1=A[2]-A[0];v2=p-A[0]
            d=v0[0]*v1[1]-v0[1]*v1[0]
            if abs(d)<1e-9: continue
            l1=(v2[0]*v1[1]-v2[1]*v1[0])/d;l2=(v0[0]*v2[1]-v0[1]*v2[0])/d
            if l1<0 or l2<0 or l1+l2>1: continue
            q=tri[0]+(tri[1]-tri[0])*l1+(tri[2]-tri[0])*l2
            pts.append((q.x,q.y,q.z))
pts=np.unique(np.round(np.array(pts),2),axis=0)
yaw=face(h.x,h.y);n0=0
for x,y,z in pts:
    if rng.random()<0.72: out.append((x,y,z,yaw));n0+=1
stat['raidillon']=dict(places=len(pts),occupees=n0)
# --- tribune principale : marches
o=bpy.data.objects['seat1__far'];n1=0;nplaces=0
for tri,n in []: pass
W=o.matrix_world;N=W.to_3x3()
for p in o.data.polygons:
    n=(N@p.normal).normalized()
    if n.z<0.95 or p.area<0.3: continue
    V=np.array([tuple(W@o.data.vertices[i].co) for i in p.vertices]);c=V.mean(0)
    X=V[:,:2]-c[:2];w,E=np.linalg.eigh(X.T@X);ax=E[:,1];L=np.ptp(X@ax)
    if L<1.0: continue
    i=int(np.argmin((CX-c[0])**2+(CY-c[1])**2));dx,dy=CX[i]-c[0],CY[i]-c[1]
    for t in np.arange(-L/2+0.26,L/2-0.2,0.52):
        nplaces+=1
        if rng.random()<0.72: out.append((c[0]+ax[0]*t,c[1]+ax[1]*t,c[2],face(dx,dy)));n1+=1
stat['principale']=dict(places=nplaces,occupees=n1)
A=np.array(out,np.float32)
G=np.c_[A[:,0],A[:,2],-A[:,1],A[:,3]].astype(np.float32)   # Blender (x,y,z) → glTF (x, z, -y) ; lacet autour de Y
with open(R+'game/public/track/crowd.bin','wb') as f: f.write(np.array([len(G)],np.uint32).tobytes()); f.write(G.tobytes())
json.dump(stat,open(R+'game/public/track/crowd.json','w'))
print('CROWD',stat,len(G))
