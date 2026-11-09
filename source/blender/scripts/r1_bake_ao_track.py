"""Rendu « style ray tracing » précalculé : occlusion ambiante de la piste cuite dans Cycles (lancer de rayons hors ligne)
dans un attribut de couleur par sommet « AO » (R=G=B=AO), puis export GLB avec COLOR_0. La source t2 n'est pas modifiée :
sauvegarde dans stages/t3_track_ao.blend. Usage : blender -b --python r1_bake_ao_track.py -- [--limit N] [--samples S] [--dist D]"""
import bpy, sys, time, json
a=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
opt=lambda k,d: type(d)(a[a.index(k)+1]) if k in a else d
LIMIT=opt('--limit',0); SAMPLES=opt('--samples',32); DIST=opt('--dist',4.0)
R='/workspace/w11'
bpy.ops.wm.open_mainfile(filepath=R+'/blender/stages/t2_track_assembled.blend')
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=SAMPLES
sc.cycles.use_denoising=False
if sc.world is None: sc.world=bpy.data.worlds.new('W')
sc.world.light_settings.distance=DIST        # rayons AO limités à DIST m (E : échelle d'une barrière / d'un muret)
ms=[o for o in sc.objects if o.type=='MESH']
if LIMIT: ms=ms[:LIMIT]
for o in ms:
    me=o.data
    if 'AO' not in me.color_attributes: me.color_attributes.new('AO','BYTE_COLOR','POINT')
    me.color_attributes.active_color=me.color_attributes['AO']
    me.attributes.render_color_index=me.color_attributes.find('AO')
t0=time.time(); B=40; log={'samples':SAMPLES,'dist':DIST,'objects':len(ms),'verts':sum(len(o.data.vertices) for o in ms)}
for i in range(0,len(ms),B):
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms[i:i+B]: o.select_set(True)
    bpy.context.view_layer.objects.active=ms[i]
    bpy.ops.object.bake(type='AO',target='VERTEX_COLORS',use_clear=True)
    print('BAKE',min(i+B,len(ms)),'/',len(ms),'%.0f s'%(time.time()-t0),flush=True)
log['bake_s']=round(time.time()-t0)
# statistiques
import statistics
vals=[]
for o in ms:
    d=o.data.color_attributes['AO'].data
    vals+= [d[j].color[0] for j in range(0,len(d),max(1,len(d)//200))]
log['ao_mean']=statistics.mean(vals); log['ao_p5']=sorted(vals)[len(vals)//20]
print('STATS',log,flush=True)
if not LIMIT:
    bpy.ops.wm.save_as_mainfile(filepath=R+'/blender/stages/t3_track_ao.blend',compress=False)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=R+'/assets-work/spa_assembled_ao.glb',export_format='GLB',export_extras=True,
        export_yup=True,export_apply=True,export_cameras=False,export_lights=False,export_image_format='AUTO',
        export_vertex_color='NAME',export_vertex_color_name='AO')
    json.dump(log,open(R+'/reports/track_ao_bake.json','w'),indent=1)
    print('EXPORTED',flush=True)
