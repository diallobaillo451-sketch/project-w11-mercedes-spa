"""Extrait les images et l'inventaire des matériaux du .blend de travail pour audit."""
import bpy, json, os
from pathlib import Path
from mathutils import Vector
REPO=Path(__file__).resolve().parents[3]
BLEND=Path(os.environ.get('INTERLAGOS_BLEND_IN',str(REPO/'source/blender/work/interlagos_2023/interlagos_2023_source.blend')))
OUT=Path(os.environ.get('INTERLAGOS_TEXTURE_OUT',str(REPO/'source/blender/work/interlagos_2023/textures')))
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
images=[]
for i,img in enumerate(bpy.data.images):
 if img.type=='RENDER_RESULT' or img.size[0]<1 or img.size[1]<1: continue
 p=OUT/f'{i:03d}_{img.name.replace("/","_")}.png'
 try:
  img.filepath_raw=str(p); img.file_format='PNG'; img.save()
 except Exception as e:
  print('IMAGE_SAVE_FAIL',img.name,str(e)); continue
 images.append({'name':img.name,'path':str(p),'width':int(img.size[0]),'height':int(img.size[1]),'bytes':p.stat().st_size})
materials=[]
for mat in bpy.data.materials:
 refs=[]
 if mat.node_tree:
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image: refs.append(node.image.name)
 materials.append({'name':mat.name,'images':refs,'base_color':list(mat.diffuse_color)})
objects=[]
for obj in bpy.data.objects:
 if obj.type!='MESH': continue
 obj.data.calc_loop_triangles()
 pts=[obj.matrix_world@Vector(v) for v in obj.bound_box]
 objects.append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'materials':[m.name if m else None for m in obj.data.materials],
  'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]})
report={'source':str(BLEND),'images':images,'materials':materials,'objects':objects}
(OUT/'interlagos_materials.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(f'INTERLAGOS_TEXTURE_REPORT images={len(images)} materials={len(materials)} objects={len(objects)} dir={OUT}')
