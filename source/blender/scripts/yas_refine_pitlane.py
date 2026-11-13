#!/usr/bin/env python3
"""Snap the estimated Yas pitlane candidate onto exact Yas road-mesh hits and validate it.
Run after build_physics_assets.py with Blender 5.2.4 and yas_marina_2021.blend.
"""
from pathlib import Path
import json, math, time
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path('/workspace/project-yas-marina/source/game/public/track_yas')
PIT=ROOT/'pitlane.json'; META=ROOT/'surface.json'
OUT=Path('/workspace/tools/yas_estimated_route/yas_pitlane_exact_refinement.json')
ROAD_NAMES=['Object_37','Object_38','Object_39','Object_40']
started=time.time()
road=[bpy.data.objects.get(n) for n in ROAD_NAMES]
if any(o is None or o.type!='MESH' for o in road): raise RuntimeError('missing Yas road mesh')
verts=[];faces=[]
for ob in road:
 mesh=ob.data;mesh.calc_loop_triangles();off=len(verts)
 verts.extend(ob.matrix_world@v.co for v in mesh.vertices)
 faces.extend(tuple(off+idx for idx in tri.vertices) for tri in mesh.loop_triangles)
bvh=BVHTree.FromPolygons(verts,faces,all_triangles=True)
z_top=max(float((ob.matrix_world@v.co).z) for ob in road for v in ob.data.vertices)+35.0
meta=json.loads(META.read_text());pit=json.loads(PIT.read_text())
N=int(meta['N']);L=float(meta['length']);ds=float(meta['ds'])
cx=np.asarray(meta['cx'],dtype=np.float64);cz=np.asarray(meta['cz'],dtype=np.float64)
route=np.column_stack([cx,cz]);tan=np.roll(route,-2,axis=0)-np.roll(route,2,axis=0);tan/=np.maximum(np.linalg.norm(tan,axis=1)[:,None],1e-9)
right=np.column_stack([-tan[:,1],tan[:,0]])

def center_right(s):
 u=(s%L)/ds;i=int(math.floor(u))%N;f=u-math.floor(u);j=(i+1)%N
 c=route[i]*(1-f)+route[j]*f;t=tan[i]*(1-f)+tan[j]*f;t/=max(float(np.linalg.norm(t)),1e-9)
 return c,np.array([-t[1],t[0]])
def mesh_hit(x,z):
 return bvh.ray_cast(Vector((float(x),float(-z),z_top)),Vector((0,0,-1)),140.0)[0] is not None
def xyz(s,d):
 c,r=center_right(s);p=c+r*d
 return float(p[0]),float(p[1])
# Recover an unwrapped s timeline across the lap seam and use existing corridor as lateral target.
smod=np.asarray(pit['s'],dtype=np.float64);dref=np.asarray(pit['d'],dtype=np.float64)
un=np.empty_like(smod);un[0]=smod[0];wrap=0.0
for i in range(1,len(smod)):
 if smod[i]<smod[i-1]-L/2: wrap+=L
 un[i]=smod[i]+wrap
start_s=float(un[0]);end_s=float(un[-1])
step=0.5;ss=np.arange(start_s,end_s+step*0.25,step)
refs=np.interp(ss,un,dref)
# Search one side only, and never close enough to the racing centerline to spuriously count as pit entry.
D=np.arange(-30.0,-7.49,0.25);M=len(D)
valid=np.zeros((len(ss),M),dtype=bool)
for k,s in enumerate(ss):
 c,r=center_right(s)
 local=np.flatnonzero(np.abs(D-refs[k])<=4.0)
 if len(local)==0: local=np.arange(M)
 for j in local:
  p=c+r*D[j]
  valid[k,j]=mesh_hit(p[0],p[1])
 if not valid[k].any():
  for j in np.flatnonzero(~valid[k]):
   p=c+r*D[j]
   valid[k,j]=mesh_hit(p[0],p[1])
 if (k+1)%250==0 or k+1==len(ss): print(f'exact lateral scans {k+1}/{len(ss)}')
no_state=np.flatnonzero(~valid.any(axis=1))
if len(no_state):
 report={'status':'incomplete: no exact Yas asphalt state at one or more pitlane stations','unresolved_s_mod_m':np.round(ss[no_state]%L,3).tolist(),'no_Spa_or_Monza_meshes_used':True}
 OUT.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));raise RuntimeError(f'{len(no_state)} pitlane stations have no supported exact road hit')

# Smooth dynamic program: stay close to the estimated corridor while making every vertex an exact road hit.
prev=np.full(M,np.inf,dtype=np.float64);back=np.zeros((len(ss),M),dtype=np.int16)
for k,s in enumerate(ss):
 emission=0.20*(D-refs[k])**2
 emission[~valid[k]]=np.inf
 if k==0:
  prev=emission+0.35*(D-refs[k])**2
  continue
 trans=prev[:,None]+1.4*(D[None,:]-D[:,None])**2
 parent=np.argmin(trans,axis=0)
 cur=trans[parent,np.arange(M)]+emission
 if not np.isfinite(cur).any():
  raise RuntimeError(f'no continuous exact-hit path at s={s%L:.2f} m')
 back[k]=parent.astype(np.int16);prev=cur
state=int(np.argmin(prev));dnew=np.empty(len(ss),dtype=np.float32)
for k in range(len(ss)-1,-1,-1):
 dnew[k]=D[state]
 if k: state=int(back[k,state])
coords=np.asarray([xyz(s,float(d)) for s,d in zip(ss,dnew)],dtype=np.float64)
vertex_hits=sum(mesh_hit(x,z) for x,z in coords)
# Revalidate the actual emitted polyline at no more than 0.05 m spacing (not only its vertices).
miss=[];samples=0;hits=0
for i in range(len(coords)-1):
 seg=coords[i+1]-coords[i];dist=float(np.linalg.norm(seg));n=max(1,int(math.ceil(dist/0.05)))
 for j in range(n):
  f=j/n;p=coords[i]+seg*f;s=ss[i]+(ss[i+1]-ss[i])*f;d=dnew[i]+(dnew[i+1]-dnew[i])*f
  samples+=1
  if mesh_hit(p[0],p[1]):hits+=1
  else:miss.append({'s_mod_m':round(float(s%L),3),'d_m':round(float(d),3),'x':round(float(p[0]),3),'z':round(float(p[1]),3)})
# Include terminal endpoint as a mesh sample.
samples+=1
if mesh_hit(coords[-1,0],coords[-1,1]): hits+=1
else: miss.append({'s_mod_m':round(float(ss[-1]%L),3),'d_m':round(float(dnew[-1]),3),'x':round(float(coords[-1,0]),3),'z':round(float(coords[-1,1]),3)})
pathlen=float(np.linalg.norm(np.diff(coords,axis=0),axis=1).sum())
new={**pit,'x':coords[:,0].tolist(),'z':coords[:,1].tolist(),'s':np.rint(ss%L).astype(int).tolist(),'d':dnew.tolist(),'length':pathlen,
     'grid_paved_cell_coverage':pit.get('paved_cell_coverage'),'paved_cell_coverage':hits/samples,'exact_mesh_hit_fraction':hits/samples,
     'status':'estimated/non-official; vertices snapped to exact Yas road-mesh hits; FIA-derived stationing'}
PIT.write_text(json.dumps(new,separators=(',',':')))
report={'status':'estimated/non-official; direct BVH validation against Yas road meshes',
 'source_meshes':ROAD_NAMES,'no_Spa_or_Monza_meshes_used':True,
 'original_path_points':len(pit['x']),'refined_path_points':len(coords),
 'station_spacing_m':step,'path_length_m':pathlen,'exact_vertex_hit_count':int(vertex_hits),'exact_vertex_count':len(coords),'exact_vertex_hit_fraction':vertex_hits/len(coords),
 'polyline_validation_max_spacing_m':0.05,'polyline_validation_hit_count':hits,'polyline_validation_sample_count':samples,'polyline_validation_hit_fraction':hits/samples,
 'miss_count':len(miss),'misses':miss[:40],
 'adjusted_points_over_0_25m':int(np.sum(np.abs(dnew-refs)>0.25)),'maximum_lateral_adjustment_m':float(np.max(np.abs(dnew-refs))),
 'exit_merge_estimate':{'s_from_m':360,'s_to_m':400,'end_offset_d_m':round(float(dnew[-1]),2),'paved_merge_supported':bool(mesh_hit(coords[-1,0],coords[-1,1]))},
 'elapsed_seconds':time.time()-started}
OUT.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
# Update the build report without implying official survey accuracy.
rep=Path('/workspace/tools/yas_estimated_route/yas_physics_assets_report.json')
if rep.exists():
 data=json.loads(rep.read_text());data['pitlane']['exact_mesh_hit_fraction']=hits/samples;data['pitlane']['exact_mesh_validation_samples']=samples;data['pitlane']['exact_mesh_validation_spacing_m']=0.05;data['pitlane']['exact_mesh_misses']=len(miss);data['pitlane']['exact_mesh_refinement_points_over_0_25m']=int(np.sum(np.abs(dnew-refs)>0.25));rep.write_text(json.dumps(data,indent=2))
