"""Peint la livrée casque Hamilton 2020 (version noire/violette, saison 2020) sur une COPIE de l'atlas Image_7.
Méthode : rastérisation UV -> position 3D -> projection latérale de la référence (Commons, CC BY-SA 4.0, Auge=mit),
textes de marques retirés de la référence puis ré-écrits en police libre (approximation, pas les logos officiels)."""
import numpy as np, json
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates, distance_transform_edt, binary_fill_holes
d=np.load('assets-work/helmet_tris.npz')
atlas=Image.open('assets-work/helmet_atlas_orig.png').convert('RGBA'); W,H=atlas.size
SHELL=['Helmet_Base_Helmet_Base_0','Helmet_Wing_Helmet_Base_0','Helmet_Wing_001_001_Helmet_Base_0']
STRIP=['VISOR_Sticker01_Helmet_Visor_Strip_0','VISOR_Sticker02_Helmet_Visor_Strip_0']
PB=np.zeros((H,W,3),np.float32); NB=np.zeros((H,W,3),np.float32); ID=np.zeros((H,W),np.uint8)
def rast(key,idv):
    P=d[key+'__P']; U=d[key+'__U']; N=d[key+'__N']
    for t in range(len(P)):
        uv=np.c_[U[t,:,0]*W, -U[t,:,1]*H]
        x0=int(np.floor(uv[:,0].min()))-1; x1=int(np.ceil(uv[:,0].max()))+1
        y0=int(np.floor(uv[:,1].min()))-1; y1=int(np.ceil(uv[:,1].max()))+1
        x0=max(x0,0); y0=max(y0,0); x1=min(x1,W-1); y1=min(y1,H-1)
        if x1<x0 or y1<y0: continue
        yy,xx=np.mgrid[y0:y1+1,x0:x1+1]; px=xx+0.5; py=yy+0.5
        (ax,ay),(bx,by),(cx,cy)=uv
        den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-9: continue
        l0=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den; l1=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/den; l2=1-l0-l1
        m=(l0>=-0.02)&(l1>=-0.02)&(l2>=-0.02)
        if not m.any(): continue
        p=l0[m,None]*P[t,0]+l1[m,None]*P[t,1]+l2[m,None]*P[t,2]
        PB[yy[m],xx[m]]=p; NB[yy[m],xx[m]]=N[t]; ID[yy[m],xx[m]]=idv
for k in SHELL: rast(k,1)
for k in STRIP: rast(k,2)
# dilatation (bords de seams) : 6 px par plus proche voisin
mask=ID>0
dist,(iy,ix)=distance_transform_edt(~mask,return_indices=True)
grow=(dist<=6)&~mask
PB[grow]=PB[iy[grow],ix[grow]]; NB[grow]=NB[iy[grow],ix[grow]]; ID[grow]=ID[iy[grow],ix[grow]]
# --- référence nettoyée
BLACK=(22,22,24)
import cv2
ref0=np.asarray(Image.open('reports/helmet_ref/h2020.jpg').convert('RGB')).copy()
rm=binary_fill_holes(ref0.min(2)<235); rm[1000:]=False
ref0[~rm]=BLACK
hsv=cv2.cvtColor(ref0,cv2.COLOR_RGB2HSV)
white=(ref0.min(2)>150)
green=(hsv[...,0]>22)&(hsv[...,0]<65)&(hsv[...,1]>35)&(hsv[...,2]>22)
light=ref0.max(2)>70
def fillmask(b,m,colour,dil=3):
    x0,y0,x1,y1=b; mm=np.zeros(ref0.shape[:2],np.uint8); mm[y0:y1,x0:x1]=m[y0:y1,x0:x1]
    mm=cv2.dilate(mm,np.ones((dil,dil),np.uint8)).astype(bool)&rm
    if colour is None:   # couleur médiane des pixels non masqués et colorés de la boîte
        reg=ref0[y0:y1,x0:x1].reshape(-1,3); keep=(~mm[y0:y1,x0:x1].ravel())&(hsv[y0:y1,x0:x1,1].ravel()>90)
        colour=np.median(reg[keep],0)
    ref0[mm]=colour
fillmask((330,150,500,212),white,None,5); fillmask((595,178,778,243),white,None,5)   # BOSE x2 -> violet de la bande
fillmask((210,195,350,345),green,BLACK,7); fillmask((795,265,912,405),green,BLACK,7) # griffes Monster
fillmask((1095,795,1170,895),ref0.max(2)>45,BLACK,5)                                         # TIE
M=np.zeros(ref0.shape[:2],np.uint8); M[700:790,80:205]=1; M&=rm.astype(np.uint8)    # filigrane Wikipedia
ref0=cv2.inpaint(ref0,M*255,7,cv2.INPAINT_TELEA)
# visière + platine de pivot de la référence : la vraie visière est un objet séparé -> fond noir
vis=np.zeros(ref0.shape[:2],np.uint8)
cv2.fillPoly(vis,[np.array([(560,445),(1060,430),(1135,560),(1140,700),(760,690),(700,620),(575,560)],np.int32)],1)
ref0[vis>0]=BLACK
ref0[238:382,385:768]=BLACK   # MONSTER ENERGY (fond noir uni)
ref=Image.fromarray(ref0)
ref.save('assets-work/helmet_ref_clean.png')
R=np.asarray(ref).astype(np.float32)
A=np.load('assets-work/helmet_affine.npy')
sel=ID>0; p=PB[sel]; n=NB[sel]
sx=500+(p[:,1]-0.062)*1000/0.45; sy=500-(p[:,2]-1.357)*1000/0.45
X=np.c_[sx,sy,np.ones(len(sx))]@A
col=np.stack([map_coordinates(R[...,c],[X[:,1],X[:,0]],order=1,mode='nearest') for c in range(3)],1)
inside=map_coordinates(rm.astype(np.float32),[X[:,1],X[:,0]],order=1,cval=0)>0.5
col[~inside]=BLACK
# liseré noir du contour de la référence trop épais à l'arrière/bas : ok (le vrai casque a un bord noir)
# --- textes (approximations, police libre DejaVu Sans Bold)
FB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def canvas(lines,wm,hm,ppm=4000):
    w=int(wm*ppm); h=int(hm*ppm); im=Image.new('RGBA',(w,h),(0,0,0,0)); g=ImageDraw.Draw(im)
    for txt,cy,size,c in lines:
        f=ImageFont.truetype(FB,int(size*ppm)); bb=g.textbbox((0,0),txt,font=f)
        g.text(((w-(bb[2]-bb[0]))/2-bb[0],cy*ppm-(bb[3]-bb[1])/2-bb[1]),txt,font=f,fill=c)
    return np.asarray(im).astype(np.float32)/255.,ppm
def overlay(col,cv,ppm,u,v,wm,hm,ok):
    # u,v en mètres, centre (0,0) = centre du canevas ; v vers le haut
    h,w=cv.shape[:2]
    cx=(u+wm/2)*ppm; cy=(hm/2-v)*ppm
    a=np.stack([map_coordinates(cv[...,c],[cy,cx],order=1,cval=0) for c in range(4)],1)
    a[~ok,3]=0
    col[:]=col*(1-a[:,3:4])+a[:,:3]*255*a[:,3:4]
shell=ID[sel]==1; strip=ID[sel]==2
# MONSTER ENERGY sur le front (projection frontale, vue de face : droite écran = -x)
cvm,ppm=canvas([('MONSTER',0.010,0.016,(240,240,240,255)),('ENERGY',-0.0085,0.0085,(150,215,40,255))],0.17,0.045)
# canevas y axe : cy en m depuis le haut -> on place lignes à 0.5h±
cvm,ppm=canvas([('MONSTER',0.0105,0.0125,(240,240,240,255)),('ENERGY',0.0235,0.0065,(150,215,40,255))],0.12,0.032)
ok=shell&(n[:,1]>0.25)&(p[:,1]>0.12)
overlay(col,cvm,ppm,-p[:,0],p[:,2]-1.418,0.12,0.032,ok)
# bandeau de visière : fond noir, PETRONAS au centre (face), EPSON sur les côtés
col[strip]=(14,14,16)
cvp,ppm=canvas([('PETRONAS',0.0175,0.020,(245,245,245,255))],0.16,0.035)
ok=strip&(np.abs(p[:,0])<0.064)
overlay(col,cvp,ppm,-p[:,0],p[:,2]-1.376,0.16,0.035,ok)
cve,ppm=canvas([('EPSON',0.0175,0.0155,(245,245,245,255))],0.075,0.035)
ok=strip&(np.abs(p[:,0])>0.065)
u=np.where(p[:,0]>0,p[:,1]-0.172,-(p[:,1]-0.172))
overlay(col,cve,ppm,u,p[:,2]-1.376,0.075,0.035,ok)
# 44 à l'arrière (numéro de course, présent à l'arrière du casque 2020)
cv4,ppm=canvas([('44',0.02,0.03,(245,245,245,255))],0.08,0.04)
ok=shell&(n[:,1]<-0.6)&(p[:,2]>1.30)&(p[:,2]<1.42)
overlay(col,cv4,ppm,p[:,0],p[:,2]-1.36,0.08,0.04,ok)
out=np.asarray(atlas).copy()
out[sel,:3]=np.clip(col,0,255).astype(np.uint8); out[sel,3]=255
Image.fromarray(out).save('assets-work/helmet_lh2020.png')
Image.fromarray(out).convert('RGB').resize((1024,512)).save('/tmp/helmet_new_atlas.png')
print('painted texels',sel.sum())
