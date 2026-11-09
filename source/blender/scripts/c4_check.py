import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c1_car_rig.blend')
O=bpy.data.objects
for k in ('W_FL','W_FR'): O[k].rotation_euler=(0,0,math.radians(25))
for k in ('W_FL_spin','W_FR_spin','W_RL_spin','W_RR_spin'): O[k].rotation_euler=(math.radians(40),0,0)
O['STEERING_WHEEL'].rotation_euler=(0,math.radians(-60),0)
O['W_RL'].location.z+=0.05
wb_render(R+'/blender/renders/car_check_34.png',(5,6,2.5),(math.radians(70),0,math.radians(140)),res=(1400,900),lens=40)
wb_render(R+'/blender/renders/car_check_top.png',(0,0,10),(0,0,0),ortho=6.5,res=(1000,1300))
wb_render(R+'/blender/renders/car_check_sw.png',(0,0.25,0.92),(math.radians(45),0,math.radians(0)),res=(1000,800),lens=35)
