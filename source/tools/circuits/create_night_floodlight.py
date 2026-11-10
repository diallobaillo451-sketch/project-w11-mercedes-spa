"""Unique kit piece: stadium floodlight mast (absent from all audited circuit GLBs).

Scripted, reproducible, metric, origin = ground centre of the base plate.
Nodes:
  floodlight_mast          — shaft + base + service cage
  floodlight_head          — empty at the cluster pivot (slight downward tilt)
  floodlight_luminaire_N   — housings
  floodlight_lens_N        — emissive glass (w11_on_color, emission 0 by default?
                            night baking will use these as Cycles lamps / emit)
  floodlight_ground_blob   — soft elliptical ground glow (emissive, no runtime light)

Typical 2020 Bahrain / Yas / Marina Bay: ~36 m mast, 2×5 or 3×6 fixture head,
~5000–5700 K. Budget: a few thousand tris, instance many times.
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix, Euler

OUT = os.environ.get('OUT', '/workspace/f1work/kit_pieces/night_floodlights/stadium_floodlight_mast.glb')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

H_MAST = 36.0          # metres
R_BASE = 0.95
R_TOP = 0.28
N_SIDES = 8
N_ROWS = 3
N_COLS = 6
FIXTURE = (0.62, 0.28, 0.42)  # width, depth, height
TILT = math.radians(18)       # downward
ARM_Y = 1.15                  # head stands in front of the mast
KELVIN_RGB = (1.0, 0.96, 0.88)  # ~5500 K-ish

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection

def mesh_from_bm(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    if mat: me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob

def mat(name, color, rough=0.45, metal=0.0, emit=0.0, emit_color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit > 0:
        b.inputs['Emission Color'].default_value = (*(emit_color or color), 1)
        b.inputs['Emission Strength'].default_value = emit
        m['w11_lamp'] = 'flood'
        m['w11_on_color'] = list(emit_color or color)
        m['w11_on_intensity'] = emit
    return m

mat_steel = mat('floodlight_steel', (0.12, 0.125, 0.13), rough=0.38, metal=0.85)
mat_galva = mat('floodlight_galva', (0.35, 0.36, 0.34), rough=0.45, metal=0.7)
mat_conc  = mat('floodlight_concrete', (0.42, 0.41, 0.38), rough=0.9, metal=0.0)
mat_hous  = mat('floodlight_housing', (0.03, 0.03, 0.032), rough=0.35, metal=0.4)
mat_lens  = mat('floodlight_lens', (0.85, 0.82, 0.75), rough=0.15, metal=0.0,
               emit=0.0, emit_color=KELVIN_RGB)  # off by default; baker / runtime turns on
mat_blob  = mat('floodlight_blob', (1.0, 0.96, 0.85), rough=1.0, metal=0.0,
               emit=2.5, emit_color=KELVIN_RGB)

# --- base footing
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16,
                      radius1=1.35, radius2=1.2, depth=0.35)
bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, 0.175)))
# slightly inset top
footing = mesh_from_bm('floodlight_footing', bm, mat_conc)

# --- tapered octagonal mast (loft)
bm = bmesh.new()
def ring(z, r):
    return [bm.verts.new((r*math.cos(i/N_SIDES*2*math.pi), r*math.sin(i/N_SIDES*2*math.pi), z)) for i in range(N_SIDES)]
# sections
zs = [0.35, 2.0, 12.0, 24.0, H_MAST-1.8]
rs = [0.72, 0.62, 0.48, 0.36, R_TOP]
rings = [ring(z, r) for z, r in zip(zs, rs)]
for a, b in zip(rings, rings[1:]):
    for i in range(N_SIDES):
        j = (i+1) % N_SIDES
        bm.faces.new((a[i], a[j], b[j], b[i]))
# close bottom already on footing; cap top
bm.faces.new(list(reversed(rings[-1])))
for v in bm.verts: v.co  # ensure
bm.normal_update()
mast = mesh_from_bm('floodlight_mast', bm, mat_steel)

# service ladder (simple stiles + rungs, low tris) on +Y
bm = bmesh.new()
# two stiles as thin boxes via skin of verts
def box(bm, c, sx, sy, sz):
    x0,y0,z0 = c[0]-sx/2, c[1]-sy/2, c[2]-sz/2
    vs = [bm.verts.new((x0+ix*sx, y0+iy*sy, z0+iz*sz)) for iz in (0,1) for iy in (0,1) for ix in (0,1)]
    # bit ugly winding — use bmesh box primitive
    return vs
# use cones/cubes via ops on a temp
# stiles
for x in (-0.16, 0.16):
    bmesh.ops.create_cube(bm, size=1)
    # last 8 verts
# rebuild simpler with cylinders
bm.free(); bm = bmesh.new()
for x in (-0.15, 0.15):
    ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.022, radius2=0.022, depth=H_MAST-3.2)
    bmesh.ops.translate(bm, verts=ret['verts'], vec=Vector((x, 0.70, (H_MAST-3.2)/2 + 0.5)))
# rungs every 0.35 m
z = 0.6
while z < H_MAST-2.4:
    ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.014, radius2=0.014, depth=0.30)
    bmesh.ops.rotate(bm, verts=ret['verts'], cent=Vector((0,0,0)),
                     matrix=Matrix.Rotation(math.pi/2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=ret['verts'], vec=Vector((0, 0.70, z)))
    z += 0.35
ladder = mesh_from_bm('floodlight_ladder', bm, mat_galva)

# --- head armature empty
head = bpy.data.objects.new('floodlight_head', None)
head.empty_display_size = 0.5
head.location = (0, ARM_Y, H_MAST - 0.6)
head.rotation_euler = Euler((TILT, 0, 0), 'XYZ')
col.objects.link(head)

# cluster frame
bm = bmesh.new()
fw, fd, fh = N_COLS*0.70 + 0.25, 0.18, N_ROWS*0.50 + 0.20
bmesh.ops.create_cube(bm, size=1)
for v in bm.verts:
    v.co.x *= fw
    v.co.y *= fd
    v.co.z *= fh
frame = mesh_from_bm('floodlight_frame', bm, mat_steel)
frame.parent = head
# local at head origin
frame.location = (0, 0, 0)

luminaires = []
lenses = []
idx = 0
for row in range(N_ROWS):
    for col_i in range(N_COLS):
        idx += 1
        x = (col_i - (N_COLS-1)/2) * 0.70
        z = (row - (N_ROWS-1)/2) * 0.50
        y = 0.22
        # housing
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        w,d,h = FIXTURE
        for v in bm.verts:
            v.co.x *= w; v.co.y *= d; v.co.z *= h
        # bevel front opening slightly by scaling front verts
        hous = mesh_from_bm(f'floodlight_luminaire_{idx}', bm, mat_hous)
        hous.parent = head
        hous.location = (x, y, z)
        luminaires.append(hous)
        # lens (thin disk on front)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.26, radius2=0.26, depth=0.03)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0,0,0)),
                         matrix=Matrix.Rotation(math.pi/2, 3, 'X'))
        lens = mesh_from_bm(f'floodlight_lens_{idx}', bm, mat_lens)
        lens.parent = head
        lens.location = (x, y + d/2 + 0.02, z)
        lens['w11_lamp'] = 'flood'
        lenses.append(lens)

# ground blob — ellipse, lying on z=0.02, larger toward the beam direction (+Y after tilt, approx +Y)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=24, y_segments=24, size=1)
# shape as ellipse 18 x 28 m, fade verts to 0 alpha via z-up slight dome
for v in bm.verts:
    v.co.x *= 9.0
    v.co.y *= 14.0
    v.co.y += 8.0  # shift in beam direction
    # slight raise at centre
    r = math.hypot(v.co.x/9.0, (v.co.y-8.0)/14.0)
    v.co.z = 0.04 + 0.06 * max(0, 1 - r)
# we cannot easily do vertex alpha here; material is emissive, we'll use a generated blend
blob = mesh_from_bm('floodlight_ground_blob', bm, mat_blob)

# add a simple radial fade to the blob material (emission * gradient)
nt = mat_blob.node_tree
nodes, links = nt.nodes, nt.links
tex = nodes.new('ShaderNodeTexGradient'); tex.gradient_type = 'SPHERICAL'
mapn = nodes.new('ShaderNodeMapping'); mapn.inputs['Scale'].default_value = (0.07, 0.045, 0.07)
texc = nodes.new('ShaderNodeTexCoord')
links.new(texc.outputs['Object'], mapn.inputs['Vector'])
links.new(mapn.outputs['Vector'], tex.inputs['Vector'])
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (*KELVIN_RGB, 1)
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = (0,0,0,0)
links.new(tex.outputs['Color'], ramp.inputs['Fac'])
prin = nodes['Principled BSDF']
links.new(ramp.outputs['Color'], prin.inputs['Emission Color'])
# scale emission by ramp alpha via math
mul = nodes.new('ShaderNodeMath'); mul.operation='MULTIPLY'
mul.inputs[1].default_value = 2.5
links.new(ramp.outputs['Alpha'], mul.inputs[0])
links.new(mul.outputs['Value'], prin.inputs['Emission Strength'])
prin.inputs['Alpha'].default_value = 0.7
mat_blob.blend_method = 'BLEND'
try:
    mat_blob.surface_render_method = 'BLENDED'
except Exception:
    pass

# apply / keep hierarchy: parent footing, mast, ladder to a root empty
root = bpy.data.objects.new('stadium_floodlight_mast', None)
root.empty_display_size = 2.0
col.objects.link(root)
for o in (footing, mast, ladder, head, blob):
    o.parent = root

# count tris
tris = 0
for o in bpy.data.objects:
    if o.type=='MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
print('TRIS', tris)

# export
# select all
for o in bpy.data.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=OUT,
    use_selection=False,
    export_format='GLB',
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_extras=True,
    export_yup=True,
)
print('WROTE', OUT, os.path.getsize(OUT), 'tris', tris)
meta = dict(height_m=H_MAST, rows=N_ROWS, cols=N_COLS, tilt_deg=18,
            color_temp_K=5500, tris=tris, bytes=os.path.getsize(OUT),
            origin='base centre, Z-up Blender / Y-up glTF',
            notes='Instance at real mast positions. Bake Cycles emission into track lightmap; do not add one runtime light per fixture.')
json.dump(meta, open(os.path.splitext(OUT)[0]+'.json','w'), indent=2)
