import numpy as np
from PIL import Image, ImageDraw
im=Image.open('/workspace/w11/assets-work/centerline_dbg.png'); H=im.height
X0,Y0,RES=-700,-1160,0.25
Q=np.load('/workspace/w11/assets-work/cl_smooth.npy')
tiles=[]
for k in range(0,len(Q),350):
    cx,cy=Q[k]; half=110; px=(cx-X0)/RES; py=H-(cy-Y0)/RES; h=half/RES
    t=im.crop((int(px-h),int(py-h),int(px+h),int(py+h))).resize((300,300)); ImageDraw.Draw(t).text((5,5),f's={k}',fill=(255,255,0)); tiles.append(t)
cols=5; rows=(len(tiles)+cols-1)//cols
W=Image.new('RGB',(cols*300,rows*300))
for i,t in enumerate(tiles): W.paste(t,((i%cols)*300,(i//cols)*300))
W.save('/tmp/cl_contact.jpg',quality=85)
