# Rendus Eevee des pilotes : casque 3/4 (vignette menu, fond transparent) + vues de contrôle.
# blender -b --python d9_driver_shots.py -- <id,id,...|all> <mode: thumb|check> 
import bpy, sys, math, os, json, mathutils
sys.path.insert(0, '/workspace/w11/blender/scripts'); from common import *
a = sys.argv[sys.argv.index('--') + 1:]; ids = a[0]; mode = a[1]
D = json.load(open(R + '/game/src/data/drivers2020.json'))
bpy.ops.wm.open_mainfile(filepath=STAGES + '/d1b_driver_lh.blend')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
try: sc.eevee.taa_render_samples = 24
except Exception: pass
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o)
w = bpy.data.worlds.new('w') if not sc.world else sc.world; sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.55, 0.57, 0.6, 1); bg.inputs[1].default_value = 0.7
def light(name, loc, en, size=1.0):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = en; L.size = size; o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    c = o.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'; return o
hb = bpy.data.objects.get('Helmet_Base_Helmet_Base_0') or [o for o in bpy.data.objects if o.name.startswith('Helmet_Base')][0]
bb = [hb.matrix_world @ mathutils.Vector(v) for v in hb.bound_box]; ctr = sum(bb, mathutils.Vector()) / 8
tgt = bpy.data.objects.new('tgt', None); sc.collection.objects.link(tgt); tgt.location = ctr
# repère : on déduit l'avant du casque depuis la visière
vis = [o for o in bpy.data.objects if o.name.startswith('Helmet_Visor_Helmet_Visor')][0]
vb = sum([vis.matrix_world @ mathutils.Vector(v) for v in vis.bound_box], mathutils.Vector()) / 8
fwd = (vb - ctr); fwd.z = 0; fwd.normalize(); up = mathutils.Vector((0, 0, 1)); side = fwd.cross(up)
light('key', ctr + fwd * 1.2 + side * 0.9 + up * 0.9, 120, 1.2); light('rim', ctr - fwd * 1.0 - side * 0.8 + up * 0.6, 90, 1.0); light('fill', ctr + side * -1.2 + up * 0.2, 35, 2.0)
cam = bpy.data.cameras.new('cam'); cam.lens = 85; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
cc = co.constraints.new('TRACK_TO'); cc.target = tgt; cc.track_axis = 'TRACK_NEGATIVE_Z'; cc.up_axis = 'UP_Y'
def img(path, name):
    for i in list(bpy.data.images):
        if i.name == name: bpy.data.images.remove(i)
    i = bpy.data.images.load(path); i.name = name; return i
orig = {}
for m in bpy.data.materials:
    if not m.node_tree: continue
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image: orig[(m.name, nd.name)] = nd.image
def apply(dr):
    od = R + '/assets-work/drivers/' + dr['id']
    H = img(od + '_helmet.png', 'H_' + dr['id']) if os.path.exists(od + '_helmet.png') else None
    S = img(od + '_suit.png', 'S_' + dr['id']) if os.path.exists(od + '_suit.png') else None
    G = img(od + '_gloves.png', 'G_' + dr['id']) if os.path.exists(od + '_gloves.png') else None
    for m in bpy.data.materials:
        if not m.node_tree: continue
        for nd in m.node_tree.nodes:
            if nd.type != 'TEX_IMAGE' or (m.name, nd.name) not in orig: continue
            o = orig[(m.name, nd.name)]; nd.image = o
            nm = o.name.split('.')[0]
            if H and (m.name.startswith('Helmet_Base') or m.name.startswith('Helmet_Visor_Strip')) and nm in ('Image_7', 'LH2020_helmet'): nd.image = H
            if S and m.name == 'Driver_Suit' and nm in ('Image_20', 'MERC2020_suit'): nd.image = S
            if G and m.name == 'Driver_Gloves' and nm in ('Image_18', 'MERC2020_gloves'): nd.image = G
os.makedirs(R + '/out/drivers', exist_ok=True); os.makedirs(R + '/game/public/drivers/thumb', exist_ok=True)
for dr in D['drivers']:
    if ids != 'all' and dr['id'] not in ids.split(','): continue
    apply(dr)
    if mode == 'thumb':
        sc.render.resolution_x = sc.render.resolution_y = 320; cam.lens = 105
        co.location = ctr + (fwd * 0.62 + side * 0.62) * 1.45 + up * 0.22; tgt.location = ctr + up * 0.005
        sc.render.filepath = R + f'/game/public/drivers/thumb/{dr["id"]}.png'; bpy.ops.render.render(write_still=True)
    else:
        sc.render.resolution_x = 900; sc.render.resolution_y = 600; cam.lens = 85
        for k, (d, h) in enumerate([(fwd * 0.9 + side * 0.9, 0.2), (-fwd * 0.8 - side * 0.8, 0.35), (side * -1.25, 0.05)]):
            co.location = ctr + d + up * h; tgt.location = ctr
            sc.render.filepath = R + f'/out/drivers/{dr["id"]}_helmet_{k}.png'; bpy.ops.render.render(write_still=True)
        cam.lens = 50; tgt.location = ctr - up * 0.35 + fwd * 0.25
        co.location = ctr + fwd * 2.3 + side * 1.4 + up * 0.5; sc.render.filepath = R + f'/out/drivers/{dr["id"]}_body.png'; bpy.ops.render.render(write_still=True)
    print('RENDU', dr['id'])
