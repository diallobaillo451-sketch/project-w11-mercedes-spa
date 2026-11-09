"""v3 : lissage local des zigzags de la ligne centrale v2 (artefacts du tracé source) pour éviter le repli de la grille physique.
Fenêtres : sortie La Source 360–430, 3315–3365, entrée Pouhon 3640–3765. Largeurs corrigées du décalage latéral."""
import json, numpy as np
from scipy import ndimage
d=json.load(open('/workspace/w11/assets-work/spa_centerline_v2.json'))
P=np.array(d['points'],float); N=len(P)
x,y,z=P[:,0].copy(),P[:,1].copy(),P[:,2].copy()
xs=ndimage.gaussian_filter1d(x,9,mode='wrap'); zs=ndimage.gaussian_filter1d(z,9,mode='wrap')
w=np.zeros(N)
for a,b in [(360,430),(3315,3365),(3640,3765)]:
    for i in range(a-25,b+25):
        u=1.0 if a<=i<=b else max(0,1-min(abs(i-a),abs(i-b))/25)
        w[i%N]=max(w[i%N],0.5-0.5*np.cos(np.pi*u))
nx=x*(1-w)+xs*w; nz=z*(1-w)+zs*w
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
for a,b in [(360,430),(3315,3365),(3640,3765)]: print(a,b,'max 10m heading',round(np.abs(dh[a:b]).max(),1))
out=dict(d); out['points']=[[round(float(v),4) for v in r] for r in Q]; out['length']=float(seg.sum())
out['note']=d['note']+' | v3 : zigzags lissés (360–430, 3315–3365, 3640–3765).'
json.dump(out,open('/workspace/w11/assets-work/spa_centerline_v3.json','w'))
np.save('/tmp/shift.npy',shift); print('length',seg.sum())
