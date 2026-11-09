import numpy as np
from PIL import Image
M=np.array([(100,470),(480,145),(565,430),(325,625),(175,735),(880,860)],float)
Rf=np.array([(65,470),(600,75),(616,481),(285,820),(200,960),(1150,1030)],float)
X=np.c_[M,np.ones(len(M))]; A,res,_,_=np.linalg.lstsq(X,Rf,rcond=None)
print(A.T); print('resid',np.round(X@A-Rf,1))
np.save('assets-work/helmet_affine.npy',A)
ref=np.asarray(Image.open('reports/helmet_ref/h2020.jpg').convert('RGB'))
side=np.asarray(Image.open('/tmp/hside.png').convert('RGB')).astype(float)
yy,xx=np.mgrid[0:1000,0:1000]; P=np.c_[xx.ravel(),yy.ravel(),np.ones(xx.size)]@A
px=np.clip(P[:,0].astype(int),0,ref.shape[1]-1); py=np.clip(P[:,1].astype(int),0,ref.shape[0]-1)
w=ref[py,px].reshape(1000,1000,3).astype(float)
Image.fromarray((0.5*w+0.5*side).astype(np.uint8)).save('/tmp/hfit.png')
