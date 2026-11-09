import numpy as np, json, math, time
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
M=np.load('/workspace/w11/assets-work/track_masks.npz')
X0,Y0,RES=-700.0,-1160.0,0.25
Lr=M['line']
lab,nl=ndimage.label(Lr,structure=np.ones((3,3)))
sl=ndimage.find_objects(lab); keep=np.zeros(nl+1,bool)
for i,s in enumerate(sl): keep[i+1]=max(s[0].stop-s[0].start,s[1].stop-s[1].start)*RES>25
L=ndimage.binary_dilation(keep[lab],iterations=1)
A=M['asph']|L
LL=L
# 0.5 m
H,W=A.shape; A2=A[:H//2*2,:W//2*2].reshape(H//2,2,W//2,2).any(axis=(1,3)); L2=LL[:H//2*2,:W//2*2].reshape(H//2,2,W//2,2).any(axis=(1,3)); R2=0.5
# barrière au départ : segment perpendiculaire au point de départ
start=np.array([-311.0,728.0]); d=np.array([-0.53,0.85]); d/=np.linalg.norm(d); n=np.array([-d[1],d[0]])
def ij(p): return int((p[1]-Y0)/R2),int((p[0]-X0)/R2)
for o in np.arange(-40,40,0.2):
    for t in (0,0.25,0.5):
        i,j=ij(start+n*o+d*t); A2[i,j]=False
a=start+d*3; b=start-d*3
dt=ndimage.distance_transform_edt(A2&~L2)*R2
cost=1.0+ 30.0/np.maximum(dt,0.5)**2 + 20000.0*L2
idx=-np.ones(A2.shape,np.int64); nz=np.argwhere(A2); idx[A2]=np.arange(len(nz))
rows=[];cols=[];vals=[]
for di,dj in [(0,1),(1,0),(1,1),(1,-1)]:
    src=nz; dst=nz+[di,dj]
    ok=(dst[:,0]>=0)&(dst[:,0]<A2.shape[0])&(dst[:,1]>=0)&(dst[:,1]<A2.shape[1])
    src=src[ok]; dst=dst[ok]; ok2=A2[dst[:,0],dst[:,1]]; src=src[ok2]; dst=dst[ok2]
    w=math.hypot(di,dj)*R2*0.5*(cost[src[:,0],src[:,1]]+cost[dst[:,0],dst[:,1]])
    rows.append(idx[src[:,0],src[:,1]]); cols.append(idx[dst[:,0],dst[:,1]]); vals.append(w)
G=sparse.csr_matrix((np.concatenate(vals),(np.concatenate(rows),np.concatenate(cols))),shape=(len(nz),len(nz)))
WP=[a,np.array([-150.0,461.0]),b]
path=[]
for u,v in zip(WP[:-1],WP[1:]):
    iu=idx[ij(u)]; iv=idx[ij(v)]
    assert iu>=0 and iv>=0,(u,v)
    D,P=dijkstra(G,directed=False,indices=iu,return_predecessors=True); print('seg cost',D[iv])
    pp=[iv]
    while pp[-1]!=iu and pp[-1]>=0: pp.append(P[pp[-1]])
    path+=pp[::-1][(1 if path else 0):]
pts=np.array([[X0+(nz[k][1]+0.5)*R2,Y0+(nz[k][0]+0.5)*R2] for k in path])
seg=np.linalg.norm(np.diff(pts,axis=0),axis=1); print('raw length',seg.sum())
np.save('/workspace/w11/assets-work/cl_path.npy',pts)
from PIL import Image, ImageDraw
im=Image.open('/workspace/w11/assets-work/track_masks.png').convert('RGB'); dr=ImageDraw.Draw(im); HH=im.height
dr.line([((x-X0)/RES,HH-(y-Y0)/RES) for x,y in pts],fill=(0,200,255),width=4)
im.save('/workspace/w11/assets-work/centerline_dbg.png')
