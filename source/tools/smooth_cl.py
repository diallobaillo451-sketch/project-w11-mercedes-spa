import numpy as np, json
from scipy import ndimage
P=np.load('/workspace/w11/assets-work/cl_path.npy')
def resample(P,step):
    s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]
    t=np.arange(0,s[-1],step); return np.c_[np.interp(t,s,P[:,0]),np.interp(t,s,P[:,1])]
Q=resample(P,0.5)
for sig in (6,):
    Q=np.c_[ndimage.gaussian_filter1d(Q[:,0],sig/0.5,mode='wrap'),ndimage.gaussian_filter1d(Q[:,1],sig/0.5,mode='wrap')]
Q=resample(np.vstack([Q,Q[:1]]),1.0)
L=np.linalg.norm(np.diff(np.vstack([Q,Q[:1]]),axis=0),axis=1).sum()
print('smoothed length',L,len(Q))
np.save('/workspace/w11/assets-work/cl_smooth.npy',Q)
from PIL import Image, ImageDraw
X0,Y0,RES=-700,-1160,0.25
im=Image.open('/workspace/w11/assets-work/track_masks.png').convert('RGB'); dr=ImageDraw.Draw(im); H=im.height
dr.line([((x-X0)/RES,H-(y-Y0)/RES) for x,y in Q]+[((Q[0][0]-X0)/RES,H-(Q[0][1]-Y0)/RES)],fill=(0,200,255),width=3)
for k in range(0,len(Q),500): 
    x,y=Q[k]; dr.text(((x-X0)/RES+8,H-(y-Y0)/RES),str(k),fill=(255,255,0))
im.save('/workspace/w11/assets-work/centerline_dbg.png')
def crop(cx,cy,half,name):
  px=(cx-X0)/RES; py=H-(cy-Y0)/RES; h=half/RES
  im.crop((int(px-h),int(py-h),int(px+h),int(py+h))).resize((700,700)).save(name)
crop(-480,980,110,'/tmp/c1.png'); crop(-230,560,120,'/tmp/c2.png'); crop(150,500,200,'/tmp/c3.png'); crop(450,-950,200,'/tmp/c4.png')
crop(380,-800,150,'/tmp/c5.png'); crop(-450,-850,250,'/tmp/c6.png')
