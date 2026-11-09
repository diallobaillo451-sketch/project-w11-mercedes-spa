import bpy,sys,math,json
import numpy as np
from mathutils import Matrix,Vector
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/d0_driver_raw.blend')
meshes=[o for o in bpy.data.objects if o.type=='MESH']
hb=[o for o in meshes if o.name.startswith('Helmet_Base_Helmet')][0]
mn,mx=wbbox([hb]); S=0.275/(mx.x-mn.x)
print('HELMET raw',mn,mx,'S',S)
Rz=Matrix.Rotation(math.pi,4,'Z'); Sm=Matrix.Scale(S,4)
for o in meshes:
    mw=o.matrix_world.copy()
    if o.data.users>1: o.data=o.data.copy()
    o.parent=None; o.data.transform(Rz@Sm@mw); o.matrix_world=Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o.type!='MESH': bpy.data.objects.remove(o)
mn,mx=wbbox(meshes); print('DRV bbox',mn,mx)
suit=[o for o in meshes if 'Suit' in o.name][0]; gl=[o for o in meshes if 'Gloves' in o.name][0]
V=verts_world(gl); print('GLOVES',V.min(0),V.max(0))
hm,hx=wbbox([hb]); print('HELMET',hm,hx)
V=verts_world(suit)
# épaule : sommets du costume avec |x| max au niveau des bras
for side in (-1,1):
    m=(np.sign(V[:,0])==side)&(V[:,2]>V[:,2].max()-0.35)
    P=V[m]; print('ARMSIDE',side,P.min(0),P.max(0))
save('d1_driver_flat')
