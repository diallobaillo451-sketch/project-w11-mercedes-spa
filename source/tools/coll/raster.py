# Raster de collision réel (barrières) + sol + asphalte stands, depuis assets-work/coll/tris.npz (coords Blender)
import numpy as np, json, cv2, sys
R='/workspace/w11'
d=np.load(R+'/assets-work/coll/tris.npz'); names=list(d['names'])
meta=json.load(open(R+'/game/public/track/surface.json'))
cx=np.array(meta['cx']); cz=np.array(meta['cz']); cy=np.array(meta['cy'])
# glTF (x, z) ↔ Blender (X, Y=-z)
PX=0.2; M=90
x0,x1=cx.min()-M,cx.max()+M; z0,z1=cz.min()-M,cz.max()+M
W=int((x1-x0)/PX)+1; H=int((z1-z0)/PX)+1
print('raster',W,H)
def pix(X,Y): # Blender XY → pixels (col=x, row=z)
    return np.stack([(X-x0)/PX,(-Y-z0)/PX],-1)
# sol : hauteur max des triangles de sol par cellule de 2 m
G=10; gW,gH=W//G+1,H//G+1; ground=np.full((gH,gW),np.nan,np.float32); gmin=np.full((gH,gW),np.nan,np.float32)
# rastérisation vraie des triangles de sol sur la grille 2 m (plan du triangle évalué au centre des cellules) :
# les grands triangles d'asphalte couvrent toutes leurs cellules (avant : seul le centre comptait → trous, nappes enterrées)
GT=np.concatenate([d['c2'],d['c3'],d['c4']]).astype(np.float64)
cells=[]
for tri in GT:
    p=pix(tri[:,0],tri[:,1])/G; a0=np.floor(p.min(0)).astype(int); a1=np.ceil(p.max(0)).astype(int)+1
    a0=np.maximum(a0,0); a1=np.minimum(a1,[gW,gH])
    if (a1<=a0).any(): continue
    sub=np.zeros((a1[1]-a0[1],a1[0]-a0[0]),np.uint8); q=np.round(p-a0).astype(np.int32)
    cv2.fillConvexPoly(sub,q,1); cv2.polylines(sub,[q],True,1,1)
    yy,xx=np.nonzero(sub)
    if not len(yy): continue
    e1=tri[1]-tri[0]; e2=tri[2]-tri[0]; n=np.cross(e1,e2)
    gx=(xx+a0[0]+0.5)*G*PX+x0; gyB=-((yy+a0[1]+0.5)*G*PX+z0)  # centre cellule (Blender X, Y)
    if abs(n[2])>1e-6: zz=tri[0,2]-(n[0]*(gx-tri[0,0])+n[1]*(gyB-tri[0,1]))/n[2]
    else: zz=np.full(len(xx),tri[:,2].max())
    zz=np.clip(zz,tri[:,2].min(),tri[:,2].max())
    cells.append((yy+a0[1],xx+a0[0],zz))
YY=np.concatenate([c_[0] for c_ in cells]); XX=np.concatenate([c_[1] for c_ in cells]); ZZ=np.concatenate([c_[2] for c_ in cells])
gm=np.full((gH,gW),-np.inf); np.maximum.at(gm,(YY,XX),ZZ); ground[:]=np.where(np.isinf(gm),np.nan,gm)
keep=ZZ>=gm[YY,XX]-3
gn=np.full((gH,gW),np.inf); np.minimum.at(gn,(YY[keep],XX[keep]),ZZ[keep]); gmin[:]=np.where(np.isinf(gn),np.nan,gn)
from scipy.ndimage import distance_transform_edt
nan=np.isnan(ground); idx=distance_transform_edt(nan,return_distances=False,return_indices=True); ground=ground[tuple(idx)]; gmin=gmin[tuple(idx)]
np.save(R+'/assets-work/coll/ground.npy',ground)
def gz(px, zlo=None):  # hauteur sol sous des pixels ; avec zlo : sol le plus haut situé sous le bas de l'objet
    iy=np.clip((px[:,1]/G).astype(int),0,gH-1); ix=np.clip((px[:,0]/G).astype(int),0,gW-1)
    if zlo is None: return ground[iy,ix]
    # cellule à deux niveaux (voie des stands en contrebas d'un talus…) : un mur posé sur le niveau bas est gardé
    g1=ground[iy,ix]; g0=gmin[iy,ix]
    return np.where(zlo>g1-0.5, g1, g0)
# masque : à moins de 70 m de la ligne centrale
mask=np.zeros((H,W),np.uint8); pts=np.stack([(cx-x0)/PX,(cz-z0)/PX],-1).astype(np.int32)
cv2.polylines(mask,[pts],True,255,int(2*70/PX))
bar=np.zeros((H,W),np.uint8); kind=np.zeros((H,W),np.uint8)
KIND={'barriers':1,'grails':2,'jersey':3,'concrete-barrie-raw':3,'concrete-barrie-red':3,'walls':3,'stone-wall':3,'ivy-wall':3}
t=d['c1']; m=d['m1']; zmin=t[:,:,2].min(1); zmax=t[:,:,2].max(1); c=t.mean(1)
gp=gz(pix(c[:,0],c[:,1]), zmin)
# niveau de roulage réel = grille physique (s, d) du jeu : un obstacle compte s'il est à hauteur de voiture par rapport à
# la surface roulée à ±1 m (min/max) ; passerelles, grillages de pont, nappes enterrées, crêtes de talus lointaines : ignorés
from scipy.spatial import cKDTree
NDg,D0g,DSg=meta['ND'],meta['D0'],meta['DSTEP']
SG=np.fromfile(R+'/game/public/track/surface.bin',dtype=np.uint16).reshape(-1,NDg)
SH=((SG>>3).astype(np.float32)-4096)/100+np.array(cy,np.float32)[:,None]; SH[(SG&7)==0]=np.nan
txg=np.roll(cx,-1)-np.roll(cx,1); tzg=np.roll(cz,-1)-np.roll(cz,1); nn=np.hypot(txg,tzg); txg/=nn; tzg/=nn
Xg=c[:,0]; Zg_=-c[:,1]
_,I=cKDTree(np.c_[cx,cz]).query(np.c_[Xg,Zg_])
dd=(Xg-cx[I])*(-tzg[I])+(Zg_-cz[I])*txg[I]
jj=np.round((dd-D0g)/DSg).astype(int)
hl=np.full(len(c),np.nan,np.float32); hh=np.full(len(c),np.nan,np.float32)
for o in range(-4,5):
    jo=np.clip(jj+o,0,NDg-1); v=SH[I,jo]; ok=(jj+o>=0)&(jj+o<NDg)
    v=np.where(ok,v,np.nan); hl=np.fmin(hl,v); hh=np.fmax(hh,v)
inside=np.abs(dd)<45
sel=inside&~np.isnan(hl)&(zmin<hh+1.0)&(zmax>hl+0.22)
print('obstacles retenus',sel.sum(),'/',len(t))
import os
_q=[float(v) for v in os.environ.get('DBGP','0,0,-1').split(',')]
_dbg=(np.hypot(c[:,0]-_q[0],c[:,1]-_q[1])<_q[2])&sel
for i in np.where(_dbg)[0]: print('DBG',names[m[i]],zmin[i],zmax[i],'g1',g1c[i],'g0',g0c[i],'gp',gp[i],'sel',sel[i])
P=pix(t[sel][:,:,0],t[sel][:,:,1]).astype(np.int32)
ms=m[sel]
for tri,mi in zip(P,ms):
    k=KIND.get(names[mi],4)
    cv2.fillConvexPoly(bar,tri,255); cv2.polylines(bar,[tri],True,255,1)
    cv2.fillConvexPoly(kind,tri,k); cv2.polylines(kind,[tri],True,k,1)
# marches du sol (voie des stands surélevée, murs de soutènement modélisés comme « jupe » d'asphalte, talus à pic) :
# triangles de sol presque verticaux (pente > 60°) et hauts de plus de 0,45 m → mur (béton)
allt=np.concatenate([d['c2'],d['c3'],d['c4']]).astype(np.float64)
nrm=np.cross(allt[:,1]-allt[:,0],allt[:,2]-allt[:,0]); nz=np.abs(nrm[:,2])/np.maximum(np.linalg.norm(nrm,axis=1),1e-12)
hgt=allt[:,:,2].max(1)-allt[:,:,2].min(1)
e3=np.stack([np.linalg.norm(allt[:,1]-allt[:,0],axis=1),np.linalg.norm(allt[:,2]-allt[:,1],axis=1),np.linalg.norm(allt[:,0]-allt[:,2],axis=1)],1)
alt=np.linalg.norm(nrm,axis=1)/np.maximum(e3.max(1),1e-9)  # hauteur du triangle (anti « aiguilles » dégénérées)
cc_=allt.mean(1); pp_=pix(cc_[:,0],cc_[:,1]); g1s=gz(pp_); g0s=gmin[np.clip((pp_[:,1]/G).astype(int),0,gH-1),np.clip((pp_[:,0]/G).astype(int),0,gW-1)]
st=(nz<0.5)&(hgt>0.45)&(alt>0.3)&(allt[:,:,2].max(1)>=g1s-0.4)&(allt[:,:,2].min(1)>=g0s-0.4)  # pied posé sur le niveau bas ; jupe qui part de la surface haute (pas une nappe enterrée)
print('triangles marche', int(st.sum()))
PA=pix(allt[st][:,:,0],allt[st][:,:,1]).astype(np.int32)
step=np.zeros((H,W),np.uint8)
for tri in PA: cv2.fillConvexPoly(step,tri,255); cv2.polylines(step,[tri],True,255,1)
import os
if os.environ.get("NOSTEP"): step[:]=0
bar|=step; kind[(step>0)&(kind==0)]=3
bar&=mask
pit=np.zeros((H,W),np.uint8); P3=pix(d['c3'][:,:,0],d['c3'][:,:,1]).astype(np.int32)
for tri in P3: cv2.fillConvexPoly(pit,tri,255)
road=np.zeros((H,W),np.uint8); P2=pix(d['c2'][:,:,0],d['c2'][:,:,1]).astype(np.int32)
for tri in P2: cv2.fillConvexPoly(road,tri,255)
soft=np.zeros((H,W),np.uint8); P4=pix(d['c4'][:,:,0],d['c4'][:,:,1]).astype(np.int32)
for tri in P4: cv2.fillConvexPoly(soft,tri,255)
np.savez_compressed(R+'/assets-work/coll/raster.npz',soft=soft,step=step,bar=bar,kind=kind,pit=pit,road=road,x0=x0,z0=z0,PX=PX)
json.dump({'x0':x0,'z0':z0,'PX':PX,'W':W,'H':H},open(R+'/assets-work/coll/raster.json','w'))
# image de contrôle
img=np.zeros((H,W,3),np.uint8); img[road>0]=(90,90,90); img[pit>0]=(0,200,255); img[bar>0]=(0,0,255)
cv2.polylines(img,[pts],True,(0,255,0),1)
cv2.imwrite(R+'/assets-work/coll/raster_full.png',cv2.resize(img,(W//4,H//4),interpolation=cv2.INTER_AREA))
# zoom stands : s 6500→900
i0=6400; ii=np.r_[i0:len(cx),0:1000]; a=pts[ii]; xa,ya=a.min(0)-200,a.max(0)+200
cv2.imwrite(R+'/assets-work/coll/raster_pit.png',img[max(0,ya[1]-0):0:1] if False else img[max(0,xa[1]):ya[1],max(0,xa[0]):ya[0]])
print('pit px',(pit>0).sum(),'bar px',(bar>0).sum())
