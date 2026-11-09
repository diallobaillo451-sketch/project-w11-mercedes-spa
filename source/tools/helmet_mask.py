import numpy as np
from PIL import Image,ImageDraw
d=np.load('assets-work/helmet_tris.npz')
A=Image.open('assets-work/helmet_atlas_orig.png').convert('RGB'); W,H=A.size
ov=A.copy(); dr=ImageDraw.Draw(ov)
cols={'Helmet_Base_Helmet_Base_0':(255,0,0),'Helmet_Wing_Helmet_Base_0':(0,200,0),'Helmet_Wing_001_001_Helmet_Base_0':(0,0,255)}
for k in sorted(set(x.split('__')[0] for x in d.files)):
    U=d[k+'__U']; c=cols.get(k,(255,160,0))
    for t in U:
        pts=[(u*W,(-v)*H) for u,v in t]
        dr.polygon(pts,outline=c)
ov.resize((1024,512)).save('/tmp/helmet_uv.png')
