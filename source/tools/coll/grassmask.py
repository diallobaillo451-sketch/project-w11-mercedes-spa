"""Masque d'herbe 3D : classe par cellule de la grille physique (0 rien, 1 GRASS, 2 grass-side1/4, 3 grass-side2),
uniquement herbe verte (pas l'herbe sèche grass-side1B, ni la terre sbancamento_D) et pente faible.
Entrées : assets-work/surf_mat.npy + surf_mnames.json (t9_surface_v5.py), game/public/track/surface.bin.
Sortie : game/public/track/grassmask.bin = uint16 [C0, W] + 4 bits/cellule (colonnes C0..C0+W, |d| ≤ 16 m)."""
import numpy as np,json
R='/workspace/w11/'
MI=np.load(R+'assets-work/surf_mat.npy');mn=json.load(open(R+'assets-work/surf_mnames.json'))
cl={'GRASS':1,'grass-side1':2,'grass-side4':2,'grass-side2':3}
lut=np.array([cl.get(n,0) for n in mn]+[0],np.uint8)
g=np.fromfile(R+'game/public/track/surface.bin',dtype=np.uint16).reshape(MI.shape);T=g&7;H=((g>>3).astype(np.float32)-4096)*0.01
C=lut[MI]*(T==4)
sl=np.zeros_like(H);sl[:,2:-2]=np.abs(H[:,4:]-H[:,:-4]); sl2=np.abs(np.roll(H,-1,0)-np.roll(H,1,0))/2
C[(sl>=0.25)|(sl2>=0.25)]=0
C0,W=116,130; sub=C[:,C0:C0+W]; print('cellules',(sub>0).sum())
b=(sub[:,0::2]|(sub[:,1::2]<<4)).astype(np.uint8)
open(R+'game/public/track/grassmask.bin','wb').write(np.array([C0,W],dtype=np.uint16).tobytes()+b.tobytes())
