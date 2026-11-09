"""Surface physique dédiée : grille alignée sur la ligne centrale (s pas 1 m, d pas 0,25 m sur ±25 m).
Chaque cellule = hauteur réelle du sol rendu (raycast BVH) + type de surface. Les décors plats (lignes, rainures, AO, textes)
sont exclus pour que la physique voie l'asphalte/vibreur réel. Sortie : game/public/track/surface.bin + surface.json (coords glTF)."""
import bpy,sys,json,re,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t2_track_assembled.blend')
def base(n): return re.sub(r'\.\d{3}$','',n)
CAT={}
for m in ['asph','asph_new','asph-grv','asph_pitlane_old','asph-pitlane-old','asph-pitlane-old-red','Parking','road-ext-tile','asph_patch_joint','diss2']: CAT[m]=1
for m in ['kerb_new','CURB_B']: CAT[m]=2
for m in ['carpet','carpet-full','carpet-blue']: CAT[m]=3
for m in ['grass-side1','grass-side1B','grass-side2','grass-side4','GRASS','top-ext','grass-ext-shad','sbancamento_D']: CAT[m]=4
for m in ['sand','sand_new','construction_dirt']: CAT[m]=5
CAT['water']=6
CAT['grilles']=1  # grilles d'évacuation posées à plat au bord de piste
SKIP={'line','doted_line','texts_new','groove1','groove2','groove3','groove_custom','new_AO','new_AO2',
      'trees1_2022','trees2_2022','treesline','bushesB','hedge','Glass','Glass-blend','LED_Display','transp-alpha_test'}
verts=[];tris=[];tag=[];stat={};mid=[];mnames=[]
for o in bpy.data.objects:
    if o.type!='MESH' or not o.data.materials: continue
    mb=base(o.data.materials[0].name)
    if mb in SKIP or any(mb.startswith(k) for k in ('trees','bush')): continue
    c=CAT.get(mb,7); me=o.data; off=len(verts); mnames.append(mb)
    M=o.matrix_world
    verts+=[M@v.co for v in me.vertices]
    me.calc_loop_triangles()
    for t in me.loop_triangles: tris.append(tuple(off+i for i in t.vertices)); tag.append(c);mid.append(len(mnames)-1)
    stat[mb]=c
bvh=BVHTree.FromPolygons(verts,tris); print('bvh tris',len(tris))
cl=json.load(open(R+'/assets-work/spa_centerline_v3.json'));P=np.array(cl['points']);L=cl['length']
# rééchantillonnage à 1 m (coords Blender : X=x, Y=-z, Z=y)
S=np.append(P[:,8],L);B=np.vstack([P,P[:1]])
xb=B[:,0];yb=-B[:,2];zb=B[:,1]
N=int(math.floor(L));ss=np.arange(N)*(L/N)
cx=np.interp(ss,S,xb);cy=np.interp(ss,S,yb);cz=np.interp(ss,S,zb)
wl=np.interp(ss,S,B[:,6]);wr=np.interp(ss,S,B[:,7])
tx=np.roll(cx,-2)-np.roll(cx,2);ty=np.roll(cy,-2)-np.roll(cy,2);n=np.hypot(tx,ty);tx/=n;ty/=n
rx,ry=ty,-tx  # droite
DSTEP=0.25;ND=201;D0=-25.0
H=np.zeros((N,ND),np.float32);T=np.zeros((N,ND),np.uint8);MI=np.full((N,ND),-1,np.int32);down=Vector((0,0,-1))
for i in range(N):
    for j in range(ND):
        d=D0+j*DSTEP;x=cx[i]+rx[i]*d;y=cy[i]+ry[i]*d
        z0=cz[i]+3.0+0.12*abs(d)
        loc,nor,idx,dist=bvh.ray_cast(Vector((x,y,z0)),down,40)
        if loc is None: H[i,j]=cz[i]-1;T[i,j]=0;continue
        H[i,j]=loc.z;T[i,j]=tag[idx];MI[i,j]=mid[idx]
    if i%1000==0: print('row',i)
np.save(R+'/assets-work/surf_mat.npy',MI);json.dump(mnames,open(R+'/assets-work/surf_mnames.json','w'))
# trous de maillage (cellule sans impact entre deux surfaces) : comblés par la voisine latérale la plus proche
for i in range(N):
    for j in np.where(T[i]==0)[0]:
        for k in (1,-1,2,-2):
            jj=j+k
            if 0<=jj<ND and T[i,jj] not in (0,7): H[i,j]=H[i,jj];T[i,j]=T[i,jj];break
# murs : 1re cellule non-sol, ou marche > 0,30 m, en partant du centre
jc=(ND-1)//2;WL=np.zeros(N);WR=np.zeros(N)
for i in range(N):
    for sgn,arr in ((1,WR),(-1,WL)):
        j=jc;lim=25.0
        while 0<j+sgn<ND:
            k=j+sgn
            if T[i,k]==0 or (T[i,k]==7 and H[i,k]-H[i,j]>0.12) or abs(H[i,k]-H[i,j])>0.30: lim=abs(D0+k*DSTEP)-0.0;break
            j=k
        arr[i]=lim
# encodage : uint16 = (hauteur relative cm + 4096) << 3 | type   (±40,9 m, 1 cm)
rel=np.clip(np.round((H-cz[:,None])*100)+4096,0,8191).astype(np.uint16)
G=(rel<<3)|T.astype(np.uint16)
os.makedirs(R+'/game/public/track',exist_ok=True)
G.tofile(R+'/game/public/track/surface.bin')
meta=dict(note='Grille physique alignée sur la ligne centrale, coords glTF (Y haut). cell=(hcm+4096)<<3|type, h relative à cy[i]',
  N=N,ND=ND,D0=D0,DSTEP=DSTEP,ds=L/N,length=L,types={0:'vide',1:'asphalte',2:'vibreur',3:'tapis/peint',4:'herbe',5:'gravier/sable',6:'eau',7:'objet/mur'},
  cx=[round(float(v),3) for v in cx],cy=[round(float(v),3) for v in cz],cz=[round(float(-v),3) for v in cy],
  wl=[round(float(v),2) for v in wl],wr=[round(float(v),2) for v in wr],wallL=[round(float(v),2) for v in WL],wallR=[round(float(v),2) for v in WR],
  materials=stat)
json.dump(meta,open(R+'/game/public/track/surface.json','w'))
u,c=np.unique(T,return_counts=True);print('types',dict(zip(u.tolist(),c.tolist())))
print('wallL p5/50/95',np.percentile(WL,[5,50,95]),'wallR',np.percentile(WR,[5,50,95]))
print('narrow walls (<width+0.5):',int(((WL<wl+0.3)|(WR<wr+0.3)).sum()))
