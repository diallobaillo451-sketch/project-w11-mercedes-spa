import numpy as np, json, math
from scipy import ndimage
M=np.load('/workspace/w11/assets-work/track_masks.npz')
X0,Y0,RES=-700.0,-1160.0,0.25
Lr=M['line']
lab,nl=ndimage.label(Lr,structure=np.ones((3,3)))
sl=ndimage.find_objects(lab)
keep=np.zeros(nl+1,bool)
for i,s in enumerate(sl):
    ext=max(s[0].stop-s[0].start,s[1].stop-s[1].start)*RES
    keep[i+1]=ext>25
L=keep[lab]
A=(M['asph'])&~L
H,W=A.shape
print('line comps',nl,'kept',keep.sum())
def prof(m,q,n,offs):
    xs=q[0]+n[0]*offs; ys=q[1]+n[1]*offs
    j=((xs-X0)/RES).astype(int); i=((ys-Y0)/RES).astype(int)
    ok=(i>=0)&(i<H)&(j>=0)&(j<W); r=np.zeros(len(offs),bool); r[ok]=m[i[ok],j[ok]]; return r
p=np.array([-311.0,728.0]); d=np.array([-0.53,0.85]); d/=np.linalg.norm(d)
start=p.copy(); pts=[p.copy()]; widths=[]; s=0; STEP=1.0
offs=np.arange(-30,30.01,0.125); c0=len(offs)//2
prevW=(-7,7)
flags=[]
for it in range(20000):
    q=p+d*STEP; n=np.array([-d[1],d[0]])
    a=prof(A,q,n,offs)
    c=c0
    if not a[c]:
        k=np.where(a)[0]
        if len(k)==0: print('lost',it,q); break
        c=k[np.argmin(abs(k-c))]
    lo=c
    while lo>0 and a[lo-1]: lo-=1
    hi=c
    while hi<len(offs)-1 and a[hi+1]: hi+=1
    eR,eL=offs[lo],offs[hi]; w=eL-eR; flag=0
    if w>17 or w<6:   # fuite (sortie de piste/pitlane) ou rétrécissement: garder la largeur précédente
        pw=prevW[1]-prevW[0]
        # garder le bord le plus proche de la position prévue
        if abs(eR-prevW[0])<abs(eL-prevW[1]): eL=eR+pw
        else: eR=eL-pw
        flag=1
    else: prevW=(eR,eL)
    mid=(eL+eR)/2
    newp=q+n*np.clip(mid,-1.5,1.5)*0.5
    nd=newp-p; nd/=np.linalg.norm(nd); d=0.5*d+0.5*nd; d/=np.linalg.norm(d)
    prevW=(prevW[0]-mid*0.5,prevW[1]-mid*0.5) if not flag else (eR-mid*0.5,eL-mid*0.5)
    s+=np.linalg.norm(newp-p); p=newp; pts.append(p.copy()); widths.append((eR-np.clip(mid,-1.5,1.5)*0.5,eL-np.clip(mid,-1.5,1.5)*0.5)); flags.append(flag)
    if s>5000 and np.linalg.norm(p-start)<6: print('closed',it,s); break
pts=np.array(pts)
print('length',s,'n',len(pts),'flagged',sum(flags))
json.dump({'pts':pts.round(3).tolist(),'widths':np.array(widths).round(2).tolist(),'flags':flags,'len':s},open('/workspace/w11/assets-work/centerline_raw.json','w'))
from PIL import Image, ImageDraw
im=Image.open('/workspace/w11/assets-work/track_masks.png').convert('RGB'); dr=ImageDraw.Draw(im)
dr.line([((x-X0)/RES,H-(y-Y0)/RES) for x,y in pts],fill=(0,200,255),width=3)
for k,(x,y) in enumerate(pts[1:]):
    if flags[k]: dr.point(((x-X0)/RES,H-(y-Y0)/RES),fill=(255,0,255))
im.save('/workspace/w11/assets-work/centerline_dbg.png')
def crop(cx,cy,half,name):
  px=(cx-X0)/RES; py=H-(cy-Y0)/RES; h=half/RES
  im.crop((int(px-h),int(py-h),int(px+h),int(py+h))).resize((700,700)).save(name)
crop(-480,980,120,'/tmp/c_lasource.png'); crop(-250,560,140,'/tmp/c_busstop.png')
im.resize((im.width//6,im.height//6)).save('/tmp/cl.png')
