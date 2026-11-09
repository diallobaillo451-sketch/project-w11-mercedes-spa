import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
import time
st='c2_car_driver'; TAG=str(int(time.time())%100000)
bpy.ops.wm.open_mainfile(filepath=STAGES+f'/{st}.blend'); print('TAG',TAG)
sc=bpy.context.scene; sw=bpy.data.objects['STEERING_WHEEL']
hide=[o for o in bpy.data.objects if o.parent_type=='BONE' and o.parent_bone=='head']
for fr in (0,4,8):
    sc.frame_set(fr); sw.rotation_euler=(0,math.radians(-90+22.5*fr),0)
    for o in hide: o.hide_render=True
    wb_render(f'/tmp/dc{TAG}_hands_{fr}.png',(0,0.05,1.0),(math.radians(62),0,0),res=(1000,700),lens=24,clip=(0.05,500))
    for o in hide: o.hide_render=False
sc.frame_set(4)
wb_render(f'/tmp/dc{TAG}_top.png',(0,0.6,5),(0,0,0),ortho=2.2,res=(1000,1000))
wb_render(f'/tmp/dc{TAG}_left.png',(-3.2,2.2,1.9),(math.radians(62),0,math.radians(-125)),res=(1200,800),lens=50)
for fr in (4,):
    sc.frame_set(fr); sw.rotation_euler=(0,math.radians(-90+22.5*fr),0)
    wb_render(f'/tmp/dc{TAG}_sec_{fr}.png',(3,0.3,0.7),(math.radians(90),0,math.radians(90)),ortho=2.4,res=(1200,800),clip=(3.0,10))
    wb_render(f'/tmp/dc{TAG}_out_{fr}.png',(3.2,2.2,1.9),(math.radians(62),0,math.radians(125)),res=(1200,800),lens=50)
    wb_render(f'/tmp/dc{TAG}_pov_{fr}.png',(0,0.05,0.95),(math.radians(80),0,0),res=(1200,800),lens=22,clip=(0.12,500))
