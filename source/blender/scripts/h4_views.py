import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
TAG=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=STAGES+'/d1b_driver_lh.blend')
c=(0,0.062,1.357)
views={'R':((0.9,0.062,1.36),(90,0,90)),'L':((-0.9,0.062,1.36),(90,0,-90)),'F':((0,0.95,1.38),(90,0,180)),
       'B':((0,-0.85,1.5),(78,0,0)),'TQ':((0.55,0.6,1.62),(65,0,135)),'TQL':((-0.55,-0.5,1.62),(65,0,-45))}
for k,(loc,rot) in views.items():
    wb_render(f'/tmp/hv{TAG}_{k}.png',loc,tuple(math.radians(a) for a in rot),ortho=0.42,res=(600,600))
