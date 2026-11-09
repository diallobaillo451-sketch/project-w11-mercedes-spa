import numpy as np, json, math
M=np.load('/workspace/w11/assets-work/track_masks.npz')
A=M['asph']|M['kerb']; L=M['line']
X0,Y0,RES=-700.0,-1160.0,0.25
H,W=A.shape
def at(m,x,y):
    i=int((y-Y0)/RES); j=int((x-X0)/RES)
    if 0<=i<H and 0<=j<W: return m[i,j]
    return False
p=np.array([-311.0,728.0]); d=np.array([-0.53,0.85]); d/=np.linalg.norm(d)
start=p.copy(); pts=[p.copy()]; widths=[]; s=0; STEP=2.0
offs=np.arange(-25,25.01,0.25)
for it in range(6000):
    q=p+d*STEP; n=np.array([-d[1],d[0]])  # n = gauche
    prof_a=np.array([at(A,*(q+n*o)) for o in offs]); prof_l=np.array([at(L,*(q+n*o)) for o in offs])
    c=len(offs)//2
    # run asphalte contenant q
    if not prof_a[c]:
        k=np.where(prof_a)[0]
        if len(k)==0: print('lost',it,q); break
        c=k[np.argmin(abs(k-c))]
    lo=c
    while lo>0 and (prof_a[lo-1] or prof_l[lo-1]): lo-=1
    hi=c
    while hi<len(offs)-1 and (prof_a[hi+1] or prof_l[hi+1]): hi+=1
    def edge(rng):
        i=None; run=0
        for k in rng:
            if prof_l[k]:
                run+=1
                if i is None: i=k
            elif i is not None:
                if run*RES<=0.9 and abs(offs[i]-offs[len(offs)//2])>3.0: return i
                i=None; run=0
        return None
    r=edge(range(len(offs)//2,lo-1,-1)); l=edge(range(len(offs)//2,hi+1))
    eR=offs[r] if r is not None else offs[lo]; eL=offs[l] if l is not None else offs[hi]
    w=eL-eR
    if w>20: # bord manquant: largeur bornée autour du côté sûr
        if r is not None and l is None: eL=eR+12
        elif l is not None and r is None: eR=eL-12
        else: eR,eL=-6,6
        w=eL-eR
    mid=(eL+eR)/2
    newp=q+n*np.clip(mid,-3.0,3.0)*0.8
    nd=newp-p; nd/=np.linalg.norm(nd); d=0.4*d+0.6*nd; d/=np.linalg.norm(d)
    s+=np.linalg.norm(newp-p); p=newp; pts.append(p.copy()); widths.append((eR,eL))
    if s>5000 and np.linalg.norm(p-start)<8: print('closed',it,s); break
pts=np.array(pts)
print('length',s,'n',len(pts))
json.dump({'pts':pts.round(3).tolist(),'widths':np.array(widths).round(2).tolist(),'len':s},open('/workspace/w11/assets-work/centerline_raw.json','w'))
from PIL import Image, ImageDraw
im=Image.open('/workspace/w11/assets-work/track_masks.png').convert('RGB'); dr=ImageDraw.Draw(im)
xy=[((x-X0)/RES,H-(y-Y0)/RES) for x,y in pts]; dr.line(xy,fill=(0,200,255),width=6)
im.resize((im.width//5,im.height//5)).save('/tmp/cl.png')
