# Contrôle : aucun segment de barrière sur la chaussée (|d| < bord - 0,3 m) ; liste les suspects par (s, d, type)
import numpy as np, json, struct
from scipy.spatial import cKDTree
R='/workspace/w11'; b=open(R+'/game/public/track/barriers.bin','rb').read()
n,nc,x0,z0,C,gw,gh=struct.unpack('<IIfffII',b[:28]); S=np.frombuffer(b,np.float32,n*4,28).reshape(n,4); K=np.frombuffer(b,np.uint8,n,28+n*16)
m=json.load(open(R+'/game/public/track/surface.json')); cx=np.array(m['cx']); cz=np.array(m['cz']); wl=np.array(m['wl']); wr=np.array(m['wr'])
tx=np.roll(cx,-2)-np.roll(cx,2); tz=np.roll(cz,-2)-np.roll(cz,2); L=np.hypot(tx,tz); tx/=L; tz/=L
mid=np.stack([(S[:,0]+S[:,2])/2,(S[:,1]+S[:,3])/2],-1)
_,i=cKDTree(np.stack([cx,cz],-1)).query(mid)
d=(mid[:,0]-cx[i])*(-tz[i])+(mid[:,1]-cz[i])*tx[i]
on=((d>0)&(d<wr[i]-0.3))|((d<0)&(-d<wl[i]-0.3))
print('segments sur la chaussée',on.sum(),'/',n)
from collections import Counter
print(Counter(zip((i[on]//50*50).tolist(),K[on].tolist())).most_common(40))
np.save('/tmp/onroad.npy',np.where(on)[0])
