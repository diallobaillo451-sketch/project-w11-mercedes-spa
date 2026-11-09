"""Combinaison/gants : approximation des couleurs Mercedes 2020 (noir, accents vert Petronas). Copie, sources intactes."""
import numpy as np
from PIL import Image
for nm,out in [('drv_Image_20','suit_merc2020.png'),('drv_Image_18','gloves_merc2020.png')]:
    im=Image.open(f'assets-work/{nm}.png'); a=np.asarray(im.convert('RGBA')).astype(np.float32)/255
    L=a[...,:3]@[0.299,0.587,0.114]
    t=np.clip((L-0.22)/(0.45-0.22),0,1); t=t*t*(3-2*t)
    black=np.array([0.075,0.075,0.085])*(L[...,None]/0.85)**1.2
    teal=np.array([0.0,0.55,0.52])*(0.35+L[...,None]*2.0)
    col=black*t[...,None]+teal*(1-t[...,None])
    a[...,:3]=np.clip(col,0,1)
    Image.fromarray((a*255).astype(np.uint8)).save(f'assets-work/{out}')
    print(out)
