import bpy,sys,math
from mathutils import Vector
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
args=sys.argv[sys.argv.index('--')+1:]; OUT=args[0]; SAMPLES=int(args[1]); RES=(int(args[2]),int(args[3])); only=args[4:] 
bpy.ops.wm.open_mainfile(filepath=STAGES+'/c3_car_driver_lh.blend')
sc=bpy.context.scene; sc.frame_set(4)
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=SAMPLES; sc.cycles.use_denoising=True
sc.render.resolution_x,sc.render.resolution_y=RES; sc.render.film_transparent=False
sc.view_settings.view_transform='AgX'; sc.view_settings.look='AgX - Medium High Contrast'
# monde : ciel physique
w=bpy.data.worlds.new('W'); sc.world=w; w.use_nodes=True; nt=w.node_tree; nt.nodes.clear()
sky=nt.nodes.new('ShaderNodeTexSky'); bg=nt.nodes.new('ShaderNodeBackground'); o=nt.nodes.new('ShaderNodeOutputWorld')
try: sky.sky_type='NISHITA'
except Exception: pass
try: sky.sun_elevation=math.radians(28); sky.sun_rotation=math.radians(140)
except Exception: pass
bg.inputs['Strength'].default_value=0.35
nt.links.new(sky.outputs[0],bg.inputs[0]); nt.links.new(bg.outputs[0],o.inputs[0])
sun=bpy.data.lights.new('Sun','SUN'); sun.energy=3.2; sun.angle=math.radians(1.5)
so=bpy.data.objects.new('Sun',sun); sc.collection.objects.link(so); so.rotation_euler=(math.radians(55),0,math.radians(140))
# sol : asphalte sombre + léger reflet
bpy.ops.mesh.primitive_plane_add(size=60,location=(0,0,0)); g=bpy.context.object
m=bpy.data.materials.new('Ground'); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value=(0.018,0.019,0.021,1); b.inputs['Roughness'].default_value=0.55
nz=m.node_tree.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value=900
bm=m.node_tree.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value=0.08
m.node_tree.links.new(nz.outputs[0],bm.inputs['Height']); m.node_tree.links.new(bm.outputs[0],b.inputs['Normal'])
g.data.materials.append(m)
cam=bpy.data.cameras.new('C'); co=bpy.data.objects.new('C',cam); sc.collection.objects.link(co); sc.camera=co
def look(loc,target,lens):
    co.location=loc; d=Vector(target)-Vector(loc); co.rotation_euler=d.to_track_quat('-Z','Y').to_euler(); cam.lens=lens
shots={
 'w11_lh2020_34avant':((5.6,7.0,1.6),(0,0.1,0.45),50),
 'w11_lh2020_profil':((7.8,0.0,0.9),(0,0,0.5),45),
 'w11_lh2020_casque':((1.7,2.5,1.55),(0,0.1,0.82),75),
 'w11_lh2020_arriere34':((-4.6,-6.2,1.9),(0,-0.4,0.5),50),
 'w11_lh2020_dessus':((2.6,2.2,3.1),(0,0.15,0.75),40),
}
for k,(l,t,lens) in shots.items():
    if only and k not in only: continue
    look(l,t,lens); sc.render.filepath=f'{OUT}/{k}.png'; bpy.ops.render.render(write_still=True); print('RENDERED',k)
