import numpy as np
from PIL import Image
from scipy.optimize import minimize
from scipy.ndimage import binary_fill_holes, map_coordinates, gaussian_filter
ref=np.asarray(Image.open('reports/helmet_ref/h2020.jpg').convert('RGB')).astype(float)
rm=binary_fill_holes((ref.min(2)<235)); 
rm[1000:]=False  # exclure le liseré brun du bas
side=np.asarray(Image.open('/tmp/hside.png').convert('L')).astype(float)
mm=binary_fill_holes(side>12); mm[:,:110]=mm[:,:110]&False|mm[:,:110]  # garde
mm[620:670,80:200]=False  # sangle HANS
mm[820:]=False
def bb(m):
    ys,xs=np.nonzero(m); return xs.min(),xs.max(),ys.min(),ys.max()
print('ref bb',bb(rm),'model bb',bb(mm))
rx0,rx1,ry0,ry1=bb(rm); mx0,mx1,my0,my1=bb(mm)
sx=(rx1-rx0)/(mx1-mx0); sy=(ry1-ry0)/(my1-my0)
p0=np.array([sx,0,rx0-sx*mx0,0,sy,ry0-sy*my0])
rmb=gaussian_filter(rm.astype(float),3)
ys,xs=np.nonzero(mm[::2,::2]); ys=ys*2; xs=xs*2
yb,xb=np.nonzero(~mm[::4,::4]); yb*=4; xb*=4
def f(p):
    a=p.reshape(2,3)
    X=a[0,0]*xs+a[0,1]*ys+a[0,2]; Y=a[1,0]*xs+a[1,1]*ys+a[1,2]
    inside=map_coordinates(rmb,[Y,X],order=1,cval=0).mean()
    X=a[0,0]*xb+a[0,1]*yb+a[0,2]; Y=a[1,0]*xb+a[1,1]*yb+a[1,2]
    outside=map_coordinates(rmb,[Y,X],order=1,cval=0).mean()
    return -(inside-outside*len(xb)/len(xs)*0.5)
r=minimize(f,p0,method='Nelder-Mead',options=dict(maxiter=4000,xatol=1e-4,fatol=1e-6))
print(p0,f(p0)); print(r.x,r.fun)
A=r.x.reshape(2,3).T
np.save('assets-work/helmet_affine.npy',A)
yy,xx=np.mgrid[0:1000,0:1000]; P=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@A
w=np.stack([map_coordinates(ref[...,c],[P[:,1],P[:,0]],order=1,cval=255) for c in range(3)],1).reshape(1000,1000,3)
s3=np.asarray(Image.open('/tmp/hside.png').convert('RGB')).astype(float)
Image.fromarray((0.6*w+0.4*s3).astype(np.uint8)).save('/tmp/hfit2.png')
