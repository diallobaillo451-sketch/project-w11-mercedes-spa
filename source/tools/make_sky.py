"""Ciel HDRI (Poly Haven « Kloofendal 48d Partly Cloudy (Pure Sky) », CC0) → textures compactes pour le jeu.
Hémisphère haut seulement (+ 6° sous l'horizon), encodage e = x/(1+x), x = L/S (rapport dynamique conservé, pas de
bandes sur le bleu en 8 bits). Le disque solaire est retiré (écrêté) : le soleil vient de la lumière directionnelle et d'un
disque analytique dans le shader. Sorties : game/public/assets/sky/sky_4k.webp, sky_2k.webp, sky.json (direction du soleil)."""
import cv2,numpy as np,json,os,subprocess
R='/workspace/w11/'; S=0.5
im=cv2.imread(R+'assets-raw/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr',cv2.IMREAD_ANYDEPTH|cv2.IMREAD_COLOR)[:,:,::-1].astype(np.float32)
H,W,_=im.shape
L=im@np.array([0.2126,0.7152,0.0722],np.float32)
sy,sx=np.unravel_index(L.argmax(),L.shape)
# centre photométrique du soleil (pixels > 50 % du max)
m=L>L.max()*0.02; ys,xs=np.nonzero(m[max(0,sy-60):sy+60,max(0,sx-60):sx+60]); sy=ys.mean()+max(0,sy-60); sx=xs.mean()+max(0,sx-60)
u=(sx+0.5)/W; v=(sy+0.5)/H
# disque solaire : remplacé par la médiane de l'anneau autour (le jeu dessine son propre soleil)
yy,xx=np.mgrid[0:H,0:W]; r=np.hypot(yy-sy,(xx-sx)); disc=r<14; ring=(r>=14)&(r<20)
for c in range(3): im[...,c][disc]=np.median(im[...,c][ring])
rows=int(H/2+H*6/180); crop=im[:rows]
x=np.clip(crop/S,0,None); e=x/(1+x)
os.makedirs(R+'game/public/assets/sky',exist_ok=True)
for name,w in (('sky_4k',4096),('sky_2k',2048)):
    h=round(rows*w/W); img=cv2.resize(e,(w,h),interpolation=cv2.INTER_AREA)
    png='/tmp/'+name+'.png'; cv2.imwrite(png,np.clip(img[:,:,::-1]*65535+0.5,0,65535).astype(np.uint16))
    subprocess.run(['npx','sharp-cli','--version'],capture_output=True)
    out=R+'game/public/assets/sky/'+name+'.webp'
    subprocess.run(['node','-e',f"require('sharp')('{png}').webp({{quality:94,smartSubsample:true,effort:6}}).toFile('{out}').then(i=>console.log('{name}',i.size))"],cwd=R+'game',check=True)
meta=dict(src='Poly Haven kloofendal_48d_partly_cloudy_puresky (CC0)',scale=S,encode='x/(1+x), L=S*x',vMax=rows/H,
  sun=dict(u=u,v=v,elev=90-v*180),horizon=crop[int(H/2)-30:int(H/2)].reshape(-1,3).mean(0).round(4).tolist())
json.dump(meta,open(R+'game/public/assets/sky/sky.json','w'),indent=1);print(meta)
