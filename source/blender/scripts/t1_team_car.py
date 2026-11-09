"""Lot 8 — pipeline W11 appliqué aux voitures d'équipe 2020 (famille OUTPISTON « LOD_A » + AlphaTauri + safety car).
usage : blender -b --python t1_team_car.py -- <id> <src.glb> [--render] [--diag]
Étapes : import (lecture seule de /workspace/w11-shared) → aplatissement → orientation W11 (avant +Y, haut +Z, sol z=0,
origine = milieu des essieux) → roues W_xx (pivot braquage) / W_xx_spin (rotation) → volet DRS (DRS_pivot au bord de fuite)
→ matériaux renommés (PAINT/CARBON/...) + vernis → volant d'origine retiré (le pilote W11 + son volant sont greffés au
chargement à l'offset « seat ») → export GLB haute + LOD1 + LOD2 dans assets-work/cars/ + méta JSON."""
import bpy, bmesh, sys, json, math, os, re
import numpy as np
from mathutils import Vector, Matrix
A = sys.argv[sys.argv.index('--') + 1:]
CID, SRC = A[0], A[1]; RENDER = '--render' in A; DIAG = '--diag' in A
OUT = '/workspace/w11/assets-work/cars'; OB = '/workspace/w11/out/cars'
os.makedirs(OUT, exist_ok=True); os.makedirs(OB, exist_ok=True)
CFG = json.load(open(os.path.join(os.path.dirname(__file__), 't1_cars.json')))[CID]
W11_SW = Vector((0.0, 0.7269, 0.6468))   # centre du volant W11 (repère voiture Blender, c4_car_drs)
W11_FRONT_Y = 1.821
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

def vw(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); a = a.reshape(-1, 3)
    M = np.array(o.matrix_world); return a @ M[:3, :3].T + M[:3, 3]
def matname(o): return o.data.materials[0].name if o.data.materials and o.data.materials[0] else ''

# ---------- 1. aplatissement : chaque maillage garde son nom de nœud source (LOD_A_xxx) ----------
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    p, tag = o.parent, ''
    while p is not None and not tag:
        if re.match(r'(LOD_|WHEEL_|TYRE_|RIM_|STEER|DRS|a_rear|wheel_|disc_|hub_|g_Caliper|g_Disc|DISC_)', p.name): tag = p.name
        p = p.parent
    o['src'] = tag or o.name
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.make_single_user(object=True, obdata=True)
for o in meshes:
    M = o.matrix_world.copy(); o.parent = None; o.matrix_world = M
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
for o in meshes: o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
# suppressions demandées par la config (pièces indésirables : pilote/volant d'origine…)
drop = re.compile(CFG.get('drop', r'^$'))
sw_pts = []
for o in list(meshes):
    if CFG.get('steer') and re.search(CFG['steer'], o['src']) : sw_pts.append(vw(o)); bpy.data.objects.remove(o); meshes.remove(o); continue
    if drop.search(o['src']) or drop.search(matname(o)): bpy.data.objects.remove(o); meshes.remove(o)
# matériaux par nom d'objet (safety car : les matériaux du GLB sont tous gris et mal attribués ; le nom de nœud garde l'original)
OM = {}
for pat, spec in CFG.get('objmats', []):
    for o in meshes:
        if o.get('om') or not re.search(pat, o.name, re.I): continue
        key = spec['name']
        if key not in OM:
            m = bpy.data.materials.new(f'{CID}_{key}'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*spec['rgb'], 1); b.inputs['Metallic'].default_value = spec.get('met', 0.0); b.inputs['Roughness'].default_value = spec.get('rough', 0.5)
            if spec.get('coat'): b.inputs['Coat Weight'].default_value = spec['coat']; b.inputs['Coat Roughness'].default_value = 0.05
            if spec.get('alpha') is not None: b.inputs['Alpha'].default_value = spec['alpha']; m.surface_render_method = 'BLENDED'
            if spec.get('emit'): b.inputs['Emission Color'].default_value = (*spec['emit'], 1); b.inputs['Emission Strength'].default_value = spec.get('emitS', 1.0)
            OM[key] = m
        o.data.materials.clear(); o.data.materials.append(OM[key]); o['om'] = 1
# échelle (AlphaTauri : nœud fbx 0,01 déjà appliqué par le glTF ; facteur optionnel)
if CFG.get('scale', 1) != 1:
    S = Matrix.Scale(CFG['scale'], 4)
    for o in meshes: o.data.transform(S)
    sw_pts = [p * CFG['scale'] for p in sw_pts]

if CFG.get('hi_decimate'):
    for o in meshes:
        if len(o.data.polygons) > 300 and not re.search(CFG.get('tyre', r'tyre|tire'), matname(o) + o['src'], re.I):
            md = o.modifiers.new('d', 'DECIMATE'); md.ratio = CFG['hi_decimate']; md.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
# couleurs unies imposées (pièces grises « argile » : carbone…)
for pat, rgb in CFG.get('flat', {}).items():
    for m in bpy.data.materials:
        if re.search(pat, m.name) and m.use_nodes and 'Principled BSDF' in m.node_tree.nodes:
            b = m.node_tree.nodes['Principled BSDF']
            for l in list(b.inputs['Base Color'].links): m.node_tree.links.remove(l)
            b.inputs['Base Color'].default_value = (*rgb, 1)
# ---------- 2. roues : pneus → 4 centres ----------
tyre_re = re.compile(CFG.get('tyre', r'tyre|tire'), re.I)
TP = np.vstack([vw(o) for o in meshes if tyre_re.search(matname(o)) or tyre_re.search(o['src'])])
ALL = np.vstack([vw(o) for o in meshes])
cx = (ALL[:, 0].min() + ALL[:, 0].max()) / 2; cy = (ALL[:, 1].min() + ALL[:, 1].max()) / 2
corners = {}
for sx in (-1, 1):
    for sy in (-1, 1):
        q = TP[(np.sign(TP[:, 0] - cx) == sx) & (np.sign(TP[:, 1] - cy) == sy)]
        corners[(sx, sy)] = (q.min(0), q.max(0))
wid = {k: v[1][0] - v[0][0] for k, v in corners.items()}
wy = {sy: (wid[(-1, sy)] + wid[(1, sy)]) / 2 for sy in (-1, 1)}
front_sy = CFG.get('front_sy') or (-1 if wy[-1] < wy[1] else 1)   # pneus AV plus étroits (305 vs 405 mm en 2020)
print('TYRE widths', {k: round(v, 3) for k, v in wid.items()}, 'front_sy', front_sy)
ctr = {k: (v[0] + v[1]) / 2 for k, v in corners.items()}
ground = TP[:, 2].min()
mid = (ctr[(-1, -1)] + ctr[(1, -1)] + ctr[(-1, 1)] + ctr[(1, 1)]) / 4
T = Matrix.Translation(Vector((-mid[0], -mid[1], -ground)))
R = Matrix.Rotation(math.pi, 4, 'Z') if front_sy == -1 else Matrix.Identity(4)
X = R @ T
for o in meshes: o.data.transform(X)
sw_pts = [(np.c_[p, np.ones(len(p))] @ np.array(X).T)[:, :3] for p in sw_pts]
TP = (np.c_[TP, np.ones(len(TP))] @ np.array(X).T)[:, :3]
W = {}
for nm, (sx, sy) in {'FL': (-1, 1), 'FR': (1, 1), 'RL': (-1, -1), 'RR': (1, -1)}.items():
    q = TP[(np.sign(TP[:, 0]) == sx) & (np.sign(TP[:, 1]) == sy)]
    lo, hi = q.min(0), q.max(0); c = (lo + hi) / 2
    W[nm] = dict(c=Vector(c), lo=lo, hi=hi, r=max(hi[1] - lo[1], hi[2] - lo[2]) / 2, w=hi[0] - lo[0])
print('WHEELS', {k: (tuple(round(x, 3) for x in v['c']), round(v['r'], 3), round(v['w'], 3)) for k, v in W.items()})

# volant d'origine (petit maillage centré dans l'habitacle) : retiré, son centre sert de référence au siège
yF = W['FL']['c'][1]
for o in (list(meshes) if CFG.get('seat', True) else []):
    P = vw(o); lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2
    if (hi - lo).max() < 0.34 and abs(c[0]) < 0.05 and yF - 1.4 < c[1] < yF - 0.9 and 0.4 < c[2] < 0.8 and (hi[0] - lo[0]) > 0.15 and (hi[1] - lo[1]) < 0.16 and (hi[2] - lo[2]) > 0.09:
        print('STEER_WHEEL', o.name, o['src'], np.round(lo, 3), np.round(hi, 3)); sw_pts.append(P); bpy.data.objects.remove(o); meshes.remove(o)
# ---------- 3. séparation des pièces de roue (îlots dans le volume du pneu) ----------
def split_loose(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.mesh.separate(type='LOOSE'); return list(bpy.context.selected_objects)
spin_re = re.compile(CFG.get('spin', r'tyre|tire|wheel|rim'), re.I)
def in_wheel(P):
    for nm, w in W.items():
        lo, hi, c, r = w['lo'], w['hi'], w['c'], w['r']
        ex = 0.03
        if (P[:, 0].min() >= min(lo[0], c[0] - 0.4 * np.sign(c[0])) - ex and P[:, 0].max() <= max(hi[0], c[0] - 0.4 * np.sign(c[0])) + ex
            and np.all(np.hypot(P[:, 1] - c[1], P[:, 2] - c[2]) <= r + ex)):
            # côté intérieur : pas plus de 0,16 m vers l'axe de la voiture depuis la face intérieure du pneu
            inner = lo[0] if c[0] > 0 else hi[0]
            if c[0] > 0 and P[:, 0].min() < inner - 0.16: continue
            if c[0] < 0 and P[:, 0].max() > inner + 0.16: continue
            return nm
    return None
parts = {nm: {'spin': [], 'hub': []} for nm in W}
cand = []
WS = CFG.get('wheel_src')
if WS:   # nœuds de roue nommés dans la source : pas de découpe en îlots (lente sur 260 k triangles)
    for o in list(meshes):
        k = 'spin' if re.search(WS['spin'], o['src']) else 'hub' if re.search(WS['hub'], o['src']) else None
        if not k: continue
        c = vw(o).mean(0); nm = min(W, key=lambda n: (W[n]['c'] - Vector(c)).length)
        parts[nm][k].append(o); meshes.remove(o)
for o in ([] if WS else list(meshes)):
    P = vw(o)
    near = any(np.any((np.hypot(P[:, 1] - w['c'][1], P[:, 2] - w['c'][2]) < w['r'] + 0.03) & (np.abs(P[:, 0] - w['c'][0]) < w['w'] / 2 + 0.2)) for w in W.values())
    if near: cand.append(o)
for o in cand:
    meshes.remove(o)
    for p in split_loose(o):
        nm = in_wheel(vw(p))
        if nm is None: meshes.append(p); continue
        P2 = vw(p); c = W[nm]['c']; ang = np.arctan2(P2[:, 2] - c[2], P2[:, 1] - c[1]); cov = len(set(((ang + np.pi) / (2 * np.pi) * 12).astype(int) % 12))
        kind = 'spin' if (spin_re.search(matname(p)) or spin_re.search(p['src']) or cov >= 11) else 'hub'
        parts[nm][kind].append(p)
for nm in W: print('WHEEL', nm, {k: len(v) for k, v in parts[nm].items()})

# ---------- 4. volet DRS : îlots de l'aileron AR dans la zone haute ----------
yR = W['RL']['c'][1]
def faces_islands(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); seen = set(); out = []
    for f in bm.faces:
        if f.index in seen: continue
        st = [f]; isl = []; seen.add(f.index)
        while st:
            g = st.pop(); isl.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        out.append(isl)
    return bm, out
RW = []  # (obj, island face idx, bbox)
for o in (meshes if CFG.get('drs', True) else []):
    P = vw(o)
    if not np.any((P[:, 1] < yR - 0.25) & (P[:, 2] > 0.55)): continue
    bm, isls = faces_islands(o)
    for isl in isls:
        V = np.array([v.co[:] for i in isl for v in bm.faces[i].verts])
        if V[:, 1].max() < yR - 0.25 and V[:, 2].min() > 0.5 and np.abs(V[:, 0]).max() < 0.62:
            RW.append((o, isl, V.min(0), V.max(0)))
    bm.free()
ztop = max((b[3][2] for b in RW if np.abs(b[2][0]) < 0.45 or True), default=1.0)
fl = CFG.get('flap', {})
zmin_flap = ztop - fl.get('dz', 0.15)
pick = {}
for o, isl, lo, hi in RW:
    if DIAG: print('RW_ISL', o.name, matname(o)[:20], len(isl), np.round(lo, 3), np.round(hi, 3))
    span = hi[0] - lo[0]
    if lo[2] >= zmin_flap and np.abs(lo[0]) < 0.6 and hi[1] - lo[1] < fl.get('maxdy', 0.32) and span > fl.get('minspan', 0.15):
        pick.setdefault(o.name, []).extend(isl)
mode = 'islands'
if not CFG.get('drs', True): pick = {}; mode = 'none'
elif CFG.get('flap_src'):
    mode = 'src'; pick = {o.name: list(range(len(o.data.polygons))) for o in meshes if re.search(CFG['flap_src'], o['src'])}
elif not pick or fl.get('faces'):
    # repli : faces (pas d'îlot isolé) au-dessus de zmin dans la partie centrale de l'aileron
    mode = 'faces'; pick = {}
    for o, isl, lo, hi in RW:
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        for i in isl:
            vs = [v.co for v in bm.faces[i].verts]
            if min(v.z for v in vs) >= zmin_flap + fl.get('fdz', 0.02) and max(abs(v.x) for v in vs) < fl.get('fx', 0.5):
                pick.setdefault(o.name, []).append(i)
        bm.free()
flap = []
for name, idx in pick.items():
    o = bpy.data.objects[name]; s = set(idx)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for i in s: o.data.polygons[i].select = True
    if len(s) == len(o.data.polygons): meshes.remove(o); flap.append(o); continue
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    nw = [x for x in bpy.context.selected_objects if x != o][0]; flap.append(nw)
FP = np.vstack([vw(o) for o in flap]) if flap else None
print('FLAP', mode, len(flap), 'ztop', round(ztop, 3), FP is not None and (np.round(FP.min(0), 3), np.round(FP.max(0), 3)))

if CFG.get('livery'):
    sys.path.insert(0, os.path.dirname(__file__)); import t2_livery
    lr = re.compile(CFG.get('livery_mats', r'PAINT'))
    objs = [o for o in meshes + flap if lr.search(matname(o)) and len(o.data.polygons)]
    t2_livery.bake_livery(objs, CID, W, CFG.get('livery_res', 2048))
# ---------- 5. matériaux ----------
MAP = CFG.get('mats', {})
for m in bpy.data.materials:
    if m.name.startswith(CID + '_'): continue
    new = None
    for pat, nm in MAP.items():
        if re.search(pat, m.name, re.I): new = nm; break
    if not new: continue
    m.name = f'{CID}_{new}'
    b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if not b: continue
    def S(k, v):
        if k in b.inputs and not b.inputs[k].is_linked: b.inputs[k].default_value = v
    if new == 'PAINT': S('Metallic', 0.0); S('Roughness', 0.32); S('Coat Weight', 0.9); S('Coat Roughness', 0.04)
    elif new == 'CARBON': S('Metallic', 0.0); S('Roughness', 0.42); S('Coat Weight', 0.5); S('Coat Roughness', 0.08)
    elif new == 'Tyre': S('Metallic', 0.0); S('Roughness', 0.88)
    elif new == 'wheel_hub': S('Metallic', 0.55); S('Roughness', 0.35)
    elif new == 'GLASS': S('Roughness', 0.05)
    elif new in ('DETAIL', 'decals', 'cab'): S('Metallic', 0.0); S('Roughness', 0.5)

# ---------- 6. hiérarchie + export ----------
def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); e.location = loc
    if parent: e.parent = parent
    return e
def join(objs, name):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    if not objs: return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = name; return j
def by_mat(objs):
    g = {}
    for o in objs: g.setdefault(matname(o), []).append(o)
    return g
root = empty(f'{CID}_root'); body = empty(f'{CID}_body', parent=root)
bodies = []
for mn, objs in by_mat(meshes).items(): bodies.append(join(objs, f'{CID}_B_{mn}'))
for b in bodies: b.parent = body
hubs = {}
for nm, w in W.items():
    h = empty('W_' + nm, tuple(w['c']), root); s = empty('W_' + nm + '_spin', (0, 0, 0), h); hubs[nm] = (h, s)
    for kind, tgt in (('spin', s), ('hub', h)):
        for mn, objs in by_mat(parts[nm][kind]).items():
            j = join(objs, f'{nm}_{kind}_{mn.replace(CID + "_", "")}')
            j.data.transform(Matrix.Translation(-w['c'])); j.parent = tgt
piv = None
if flap:
    lo, hi = FP.min(0), FP.max(0)
    pv = Vector((0, lo[1] + 0.004, hi[2] - 0.006))
    piv = empty('DRS_pivot', tuple(pv), root); fo = empty('DRS_flap', (0, 0, 0), piv)
    for mn, objs in by_mat(flap).items():
        j = join(objs, 'DRS_flap_' + mn); j.data.transform(Matrix.Translation(-pv)); j.parent = fo
# siège : centre du volant d'origine si présent, sinon même distance à l'essieu AV que la W11
if sw_pts:
    S = np.vstack(sw_pts); swc = Vector((0, (S[:, 1].min() + S[:, 1].max()) / 2, (S[:, 2].min() + S[:, 2].max()) / 2))
else:
    swc = Vector((0, W['FL']['c'][1] - (W11_FRONT_Y - W11_SW.y), W11_SW.z))
swc += Vector(CFG.get('seat_adj', (0, 0, 0)))
seat = swc - W11_SW
# caméra T (haut de la boîte à air) : sommet de la carrosserie au-dessus/derrière la tête
B = np.vstack([vw(o) for o in bodies])
m = (np.abs(B[:, 0]) < 0.14) & (B[:, 1] < swc.y - 0.55) & (B[:, 1] > swc.y - 1.25)
tz = float(B[m, 2].max()) if m.any() else 1.1; ty = float(B[m][np.argmax(B[m, 2]), 1]) if m.any() else swc.y - 0.8
lo_all, hi_all = B.min(0), B.max(0)
meta = dict(id=CID, src=os.path.basename(SRC), seat_blender=[round(x, 4) for x in seat], sw=[round(x, 4) for x in swc],
            seat_gltf=[round(seat.x, 4), round(seat.z, 4), round(-seat.y, 4)], tcam_gltf=[0, round(tz + 0.06, 3), round(-ty, 3)],
            wheels={k: dict(c=[round(x, 4) for x in v['c']], r=round(v['r'], 4), w=round(v['w'], 4)) for k, v in W.items()},
            wheelbase=round(W['FL']['c'][1] - W['RL']['c'][1], 3), trackF=round(W['FR']['c'][0] - W['FL']['c'][0], 3), trackR=round(W['RR']['c'][0] - W['RL']['c'][0], 3),
            bbox=[[round(x, 3) for x in lo_all], [round(x, 3) for x in hi_all]], flap_mode=mode, flap=bool(flap),
            drs_pivot_gltf=[0, round(piv.location.z, 4), round(-piv.location.y, 4)] if piv else None)
print('META', json.dumps(meta))
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{CID}_rig.blend')

def export(path, objs_root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs_root.children_recursive + [objs_root]: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_image_format='AUTO', export_animations=False, export_extras=False, export_draco_mesh_compression_enable=False)
export(f'{OUT}/{CID}_hi.glb', root)

# ---------- 7. LOD1 / LOD2 ----------
def dup_tree(r, suffix):
    m = {}
    for o in [r] + r.children_recursive:
        n = o.copy()
        if o.data: n.data = o.data.copy()
        bpy.context.scene.collection.objects.link(n); n.name = o.name + suffix; m[o] = n
    for o, n in m.items():
        if o.parent in m: n.parent = m[o.parent]
    return m[r], m
def decimate(o, ratio):
    if ratio >= 1 or len(o.data.polygons) < 60: return
    md = o.modifiers.new('d', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
def tris(r): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [r] + r.children_recursive if o.type == 'MESH')
L = CFG.get('lod', [0.45, 0.14])
# LOD1 : carrosserie décimée ; par roue un seul maillage tournant (pneu + jante), pas d'étrier ; pas de volet séparé ni d'habitacle
r1, mp = dup_tree(root, '.L1')
for o in list(r1.children_recursive):
    if o.type != 'MESH': continue
    if re.search(r'_cab|GLASS', o.name, re.I): bpy.data.objects.remove(o); continue
    decimate(o, L[0] if not re.search(r'_spin_', o.name) else 0.5)
for o in list(r1.children_recursive):
    if o.type == 'MESH' and '_hub_' in o.name: bpy.data.objects.remove(o)
r1.name = f'{CID}_root'
export(f'{OUT}/{CID}_lod1.glb', r1)
# LOD2 : tout fusionné par matériau (roues fixes), forte décimation
r2, mp2 = dup_tree(root, '.L2')
ms = [o for o in r2.children_recursive if o.type == 'MESH' and not re.search(r'_cab|GLASS|_hub_', o.name, re.I)]
for o in r2.children_recursive:
    if o.type == 'MESH' and o not in ms: bpy.data.objects.remove(o)
for o in ms:
    M = o.matrix_world.copy(); o.parent = None; o.data.transform(M); o.matrix_world = Matrix.Identity(4)
g = by_mat(ms); keep = []
for mn, objs in g.items():
    j = join(objs, f'L2_{mn}'); decimate(j, L[1]); keep.append(j)
r2n = empty(f'{CID}_root')
for j in keep: j.parent = r2n
export(f'{OUT}/{CID}_lod2.glb', r2n)
meta['tris'] = dict(hi=tris(root), lod1=tris(r1), lod2=tris(r2n))
json.dump(meta, open(f'{OUT}/{CID}.json', 'w'), indent=1)
print('TRIS', meta['tris'])

# ---------- 8. contrôle visuel ----------
if RENDER:
    for o in r1.children_recursive + [r1] + r2n.children_recursive + [r2n]: o.hide_render = True
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'OBJECT'
    for o in root.children_recursive:
        if o.type != 'MESH': continue
        o.color = (1, .1, .1, 1) if 'DRS_flap' in o.name else (.1, .4, 1, 1) if '_spin_' in o.name else (.1, .8, .2, 1) if '_hub_' in o.name else (.75, .75, .75, 1)
    # mannequin : casque W11 approximatif (sphère) au siège pour juger la position du pilote
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, location=(0, 0.105 + seat.y, 0.83 + seat.z)); hm = bpy.context.active_object; hm.color = (1, .8, 0, 1)
    cd = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cd); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 1200, 700
    def shot(loc, tgt, tag, ortho=None):
        co.location = loc; d = Vector(tgt) - Vector(loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cd.type = 'ORTHO' if ortho else 'PERSP'; cd.lens = 40
        if ortho: cd.ortho_scale = ortho
        sc.render.filepath = f'{OB}/{CID}_{tag}.png'; bpy.ops.render.render(write_still=True)
    shot((6.5, 0, 0.5), (0, 0, 0.5), 'side', 6.4)
    shot((3.6, -4.6, 2.2), (0, -0.6, 0.5), 'rear34')
    shot((2.8, 4.2, 1.8), (0, 0.4, 0.4), 'front34')
    shot((0, -4.2, 2.4), (0, -2.2, 0.9), 'wing', None)
    shot((1.6, swc.y - 0.3, 1.5), (0, swc.y - 0.3, 0.7), 'cockpit', None)
