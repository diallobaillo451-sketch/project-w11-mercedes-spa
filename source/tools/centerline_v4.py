"""v4 : second lissage (sigma 20) de l'entrée de Pouhon et de petits zigzags restants.
Fenêtres : sortie La Source 360–430, 3315–3365, entrée Pouhon 3640–3765. Largeurs corrigées du décalage latéral."""
import json, numpy as np
from scipy import ndimage
d=json.load(open('/workspace/w11/assets-work/spa_centerline_v3.json'))
P=np.array(d['points'],float); N=len(P)
x,y,z=P[:,0].copy(),P[:,1].copy(),P[:,2].copy()
xs=ndimage.gaussian_filter1d(x,20,mode='wrap'); zs=ndimage.gaussian_filter1d(z,20,mode='wrap')
xs2=ndimage.gaussian_filter1d(x,10,mode='wrap'); zs2=ndimage.gaussian_filter1d(z,10,mode='wrap')
w=np.zeros(N)
W2=np.zeros(N)
for a,b,ww in [(3610,3790,None),(330,400,1),(1490,1550,1),(4030,4090,1)]:
    for i in range(a-25,b+25):
        u=1.0 if a<=i<=b else max(0,1-min(abs(i-a),abs(i-b))/25)
        val=0.5-0.5*np.cos(np.pi*u)
        if ww is None: w[i%N]=max(w[i%N],val)
        else: W2[i%N]=max(W2[i%N],val)
nx=x*(1-w-W2)+xs*w+xs2*W2; nz=z*(1-w-W2)+zs*w+zs2*W2
# tangente/droite d'origine → décalage latéral
tx=np.gradient(x); tz=np.gradient(z); n=np.hypot(tx,tz); tx/=n; tz/=n
rx,rz=-tz,tx
shift=(nx-x)*rx+(nz-z)*rz
print('max shift',np.abs(shift).max(),'at',int(np.abs(shift).argmax()))
Q=P.copy(); Q[:,0]=nx; Q[:,2]=nz
Q[:,6]=np.maximum(1.5,P[:,6]+shift); Q[:,7]=np.maximum(1.5,P[:,7]-shift)
# s recalculé
seg=np.hypot(np.diff(np.r_[nx,nx[0]]),np.diff(np.r_[nz,nz[0]])); s=np.r_[0,np.cumsum(seg)[:-1]]; Q[:,8]=s
h=np.unwrap(np.arctan2(np.gradient(nz),np.gradient(nx))); dh=np.degrees(np.roll(h,-5)-np.roll(h,5))
for a,b in [(330,400),(1490,1550),(3610,3790),(4030,4090)]: print(a,b,'max 10m heading',round(np.abs(dh[a:b]).max(),1))
out=dict(d); out['points']=[[round(float(v),4) for v in r] for r in Q]; out['length']=float(seg.sum())
out['note']=d['note']+' | v4 : Pouhon lissé sigma 20 (3610–3790), zigzags 330–400, 1490–1550, 4030–4090.'
json.dump(out,open('/workspace/w11/assets-work/spa_centerline_v4.json','w'))
np.save('/tmp/shift.npy',shift); print('length',seg.sum())
