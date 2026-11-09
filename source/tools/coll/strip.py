# Bande « dépliée » le long de la ligne centrale (lignes = s en m, colonnes = d) pour inspecter barrières / stands
import numpy as np, json, cv2, sys
R='/workspace/w11'; z=np.load(R+'/assets-work/coll/raster.npz'); meta=json.load(open(R+'/game/public/track/surface.json'))
cx=np.array(meta['cx']); cz=np.array(meta['cz']); N=len(cx); x0,z0,PX=float(z['x0']),float(z['z0']),float(z['PX'])
s0,s1,DM=int(sys.argv[1]),int(sys.argv[2]),float(sys.argv[3]) if len(sys.argv)>3 else 60
ii=np.arange(s0,s1)%N; tx=np.roll(cx,-2)-np.roll(cx,2); tz=np.roll(cz,-2)-np.roll(cz,2); n=np.hypot(tx,tz); tx/=n; tz/=n
rx,rz=-tz,tx
dd=np.arange(-DM,DM,0.25)
X=cx[ii][:,None]+rx[ii][:,None]*dd[None]; Zz=cz[ii][:,None]+rz[ii][:,None]*dd[None]
c=((X-x0)/PX).astype(int); r=((Zz-z0)/PX).astype(int)
img=np.zeros(X.shape+(3,),np.uint8)
for key,col in (('road',(90,90,90)),('pit',(0,200,255)),('bar',(0,0,255))):
    a=z[key]; ok=(r>=0)&(r<a.shape[0])&(c>=0)&(c<a.shape[1]); m=np.zeros(X.shape,bool); m[ok]=a[r[ok],c[ok]]>0; img[m]=col
img[:,len(dd)//2]=(0,255,0)
for s in range(s0,s1,50): cv2.putText(img,str(s%N),(2,s-s0+4),cv2.FONT_HERSHEY_SIMPLEX,0.35,(255,255,255),1)
img=cv2.resize(img,(img.shape[1],img.shape[0]*2),interpolation=cv2.INTER_NEAREST)
cv2.imwrite(sys.argv[4] if len(sys.argv)>4 else '/tmp/strip.png',img); print(img.shape, 'd -',DM,'..',DM,'gauche→droite')
