import bpy,sys,json,re,numpy as np
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t2_track_assembled.blend')
def base(n): return re.sub(r'\.\d{3}$','',n)
m=json.load(open(R+'/game/public/track/surface.json'))
cx=np.array(m['cx']);cyb=-np.array(m['cz'])
out=[]
for o in bpy.data.objects:
    if o.type!='MESH' or not o.data.materials: continue
    mb=base(o.data.materials[0].name)
    if mb not in ('line','doted_line','texts_new'): continue
    me=o.data;M=o.matrix_world
    for p in me.polygons:
        c=M@p.center
        out.append((mb,c.x,c.y,p.area))
P=np.array([[o[1],o[2],o[3]] for o in out]);names=[o[0] for o in out]
# projection sur s
idx=[];dd=[]
for x,y,a in P:
    i=int(np.argmin((cx-x)**2+(cyb-y)**2));idx.append(i)
idx=np.array(idx)
for s0 in range(-150,400,1):
    pass
h=np.bincount(idx[[n=='line' for n in names]],weights=P[[n=='line' for n in names],2],minlength=len(cx))
top=np.argsort(h)[::-1][:25];print('line area by s:',[(int(i),round(float(h[i]),1)) for i in sorted(top)])
