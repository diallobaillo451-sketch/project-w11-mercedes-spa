# Importe les 8 GLB de Spa dans une seule scène (repère commun vérifié : matrices racine identiques)
import bpy, sys, json, os
R='/workspace/w11'
bpy.ops.wm.read_factory_settings(use_empty=True)
info={}
for i in range(1,9):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f'{R}/assets-raw/spa_part{i}.glb')
    new=[o for o in bpy.data.objects if o not in before]
    c=bpy.data.collections.new(f'SPA_part{i}'); bpy.context.scene.collection.children.link(c)
    for o in new:
        for u in list(o.users_collection): u.objects.unlink(o)
        c.objects.link(o)
    info[i]=[(o.name,o.type,[round(x,3) for x in o.matrix_world.translation]) for o in new if o.type=='MESH']
import mathutils
# matrices monde des meshes
mw=set()
for o in bpy.data.objects:
    if o.type=='MESH': mw.add(tuple(round(x,4) for r in o.matrix_world for x in r))
print('DISTINCT_MESH_WORLD_MATRICES',len(mw),list(mw)[:3])
json.dump(info,open(f'{R}/reports/track_import.json','w'),indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f'{R}/blender/stages/t1_track_raw.blend')
