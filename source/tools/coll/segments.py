# Contours des barrières réelles (raster 0,2 m) → segments 2D (glTF x,z) + type (pneus/rail/béton/objet) + hachage spatial 8 m
# Sortie : game/public/track/barriers.bin  [u32 nSeg][u32 nCell][f32 x0][f32 z0][f32 cell][u32 gw][u32 gh]
#          seg : nSeg × (f32 x1,z1,x2,z2) ; kind : nSeg × u8 ; cellKeys : nCell × u32 (gy*gw+gx) ; cellOff : (nCell+1) × u32 ; idx : u32
import numpy as np, cv2, json, struct
R='/workspace/w11'; z=np.load(R+'/assets-work/coll/raster.npz'); bar=z['bar'].copy(); kind=z['kind']; x0,z0,PX=float(z['x0']),float(z['z0']),float(z['PX'])
bar=cv2.morphologyEx(bar,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
n,lab,st,_=cv2.connectedComponentsWithStats(bar,8)
small=st[:,cv2.CC_STAT_AREA]<3   # < 0,12 m² : poussière de raster
bar[small[lab]]=0
cs,_=cv2.findContours(bar,cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
segs=[];kinds=[]
for c in cs:
    if len(c)<3: continue
    a=cv2.approxPolyDP(c,0.6,True)[:,0,:].astype(np.float32)  # tolérance 0,12 m
    for i in range(len(a)):
        p,q=a[i],a[(i+1)%len(a)]
        m=((p+q)/2).astype(int); k=int(kind[min(kind.shape[0]-1,m[1]),min(kind.shape[1]-1,m[0])])
        if k==0:  # pixel voisin
            y,x=m[1],m[0]; w=kind[max(0,y-2):y+3,max(0,x-2):x+3]; k=int(w.max())
        segs.append([x0+(p[0]+0.5)*PX,z0+(p[1]+0.5)*PX,x0+(q[0]+0.5)*PX,z0+(q[1]+0.5)*PX]); kinds.append(k or 4)
S=np.array(segs,np.float32); K=np.array(kinds,np.uint8)
print('segments',len(S),'types',np.bincount(K))
C=8.0; gx0,gz0=x0,z0; gw=int(bar.shape[1]*PX/C)+2; gh=int(bar.shape[0]*PX/C)+2
cells={}
for i,(a,b,c2,d) in enumerate(S):
    m=1.6
    for gy in range(int((min(b,d)-m-gz0)//C),int((max(b,d)+m-gz0)//C)+1):
        for gx in range(int((min(a,c2)-m-gx0)//C),int((max(a,c2)+m-gx0)//C)+1):
            cells.setdefault(gy*gw+gx,[]).append(i)
keys=np.array(sorted(cells),np.uint32); off=[0]; idx=[]
for k in keys: idx+=cells[int(k)]; off.append(len(idx))
buf=struct.pack('<IIfffII',len(S),len(keys),gx0,gz0,C,gw,gh)+S.tobytes()+K.tobytes()+b'\0'*((4-len(K)%4)%4)+keys.tobytes()+np.array(off,np.uint32).tobytes()+np.array(idx,np.uint32).tobytes()
open(R+'/game/public/track/barriers.bin','wb').write(buf); print('barriers.bin',len(buf)/1e6,'Mo, cellules',len(keys),'refs',len(idx))
