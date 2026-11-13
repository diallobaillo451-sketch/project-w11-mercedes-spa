"""Extrait les triangles orientés vers le haut d'un mesh GLB en coordonnées world Blender.
Sortie d'audit uniquement; ne modifie jamais la géométrie de la copie .blend.
"""
import bpy, os, json, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
REPO=Path(__file__).resolve().parents[3]
BLEND=Path(os.environ.get('INTERLAGOS_BLEND_IN',str(REPO/'source/blender/work/interlagos_2023/interlagos_2023_source.blend')))
OUT=Path(os.environ.get('INTERLAGOS_MESH_OUT',str(REPO/'source/blender/work/interlagos_2023/object_109_top_triangles.npz')))
NAME=os.environ.get('INTERLAGOS_MESH_NAME','Object_109')
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
obj=bpy.data.objects.get(NAME)
if not obj or obj.type!='MESH': raise RuntimeError(f'Mesh absent : {NAME}')
obj.data.calc_loop_triangles(); M=obj.matrix_world; R=M.to_3x3()
verts=np.asarray([tuple(M@v.co) for v in obj.data.vertices],dtype=np.float64)
faces=[]; normals=[]
for tri in obj.data.loop_triangles:
 n=R@tri.normal
 if n.length: n.normalize()
 if n.z>0.55:
  faces.append(tri.vertices); normals.append((n.x,n.y,n.z))
faces=np.asarray(faces,dtype=np.int32); normals=np.asarray(normals,dtype=np.float32)
tris=verts[faces]
OUT.parent.mkdir(parents=True,exist_ok=True)
np.savez_compressed(OUT,triangles=tris.astype(np.float32),normals=normals)
mins=tris.reshape(-1,3).min(axis=0); maxs=tris.reshape(-1,3).max(axis=0)
print(json.dumps({'mesh':NAME,'allTriangles':len(obj.data.loop_triangles),'upwardTriangles':len(faces),'boundsMin':mins.tolist(),'boundsMax':maxs.tolist(),'output':str(OUT)},separators=(',',':')))
