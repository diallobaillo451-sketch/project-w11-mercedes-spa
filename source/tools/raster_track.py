import numpy as np
from PIL import Image, ImageDraw
D=np.load('/workspace/w11/assets-work/track_tris.npz')
X0,Y0,RES=-700.0,-1160.0,0.25
W,H=int(1400/RES),int(2200/RES)
masks={}
for g in ['asph','line','kerb','grass','sand']:
    T=D[g]; im=Image.new('L',(W,H),0); dr=ImageDraw.Draw(im)
    P=np.stack([(T[...,0]-X0)/RES,(T[...,1]-Y0)/RES],-1)
    for t in P: dr.polygon([tuple(v) for v in t],fill=255)
    masks[g]=np.array(im)>0
    print(g,masks[g].sum()*RES*RES,'m2')
np.savez_compressed('/workspace/w11/assets-work/track_masks.npz',**masks)
rgb=np.zeros((H,W,3),np.uint8)
rgb[masks['grass']]=(40,90,40); rgb[masks['sand']]=(150,130,80); rgb[masks['asph']]=(90,90,90); rgb[masks['kerb']]=(200,40,40); rgb[masks['line']]=(255,255,255)
Image.fromarray(rgb[::-1]).save('/workspace/w11/assets-work/track_masks.png')
