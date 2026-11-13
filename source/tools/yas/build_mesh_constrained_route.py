#!/usr/bin/env python3
"""Direct-raycast A* through the supplied Yas road meshes for a FIA-estimated route gap.

Run with Blender 5.2.4 and START/END/PREFIX environment variables. Every path cell is
verified by a downward BVH ray against the Yas road meshes; no Spa/Monza data is used.
"""
import os, json, math, heapq, time
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT=Path('/workspace/tools/yas_estimated_route')
ROUTE=ROOT/'yas_centerline_final_xy.npy'
OUT_PREFIX=os.environ.get('PREFIX','yas_mesh_astar')
START=int(os.environ.get('START','260')); END=int(os.environ.get('END','325'))
PIXELS_PER_M=float(os.environ.get('PIXELS_PER_M','2.0'))
PAD=float(os.environ.get('PAD','35.0'))
RAY_DEPTH=float(os.environ.get('RAY_DEPTH','140.0'))
CENTER_PENALTY=float(os.environ.get('CENTER_PENALTY','2.0'))
SOURCE_PENALTY=float(os.environ.get('SOURCE_PENALTY','1.5'))
ROAD_NAMES=['Object_37','Object_38','Object_39','Object_40']
started=time.time()
A=np.load(ROUTE).astype(np.float64); seg=A[START:END+1]
if END<=START: raise ValueError('END must be greater than START')
objects=[bpy.data.objects.get(n) for n in ROAD_NAMES]
if any(o is None or o.type!='MESH' for o in objects): raise RuntimeError('missing Yas road mesh')
verts=[]; faces=[]
for ob in objects:
    mesh=ob.data; mesh.calc_loop_triangles(); off=len(verts)
    verts.extend(ob.matrix_world@v.co for v in mesh.vertices)
    faces.extend(tuple(off+i for i in tri.vertices) for tri in mesh.loop_triangles)
bvh=BVHTree.FromPolygons(verts,faces,all_triangles=True)
if bvh is None: raise RuntimeError('could not build Yas road BVH')
z_top=max(float(v.z) for v in verts)+35.0
# Local raycast grid in Blender XY; rows run from high Y to low Y.
lo=seg.min(0)-PAD; hi=seg.max(0)+PAD
x0=math.floor(lo[0]*PIXELS_PER_M)/PIXELS_PER_M
y1=math.ceil(hi[1]*PIXELS_PER_M)/PIXELS_PER_M
W=int(math.ceil((hi[0]-x0)*PIXELS_PER_M)); H=int(math.ceil((y1-lo[1])*PIXELS_PER_M))
if W*H>500000: raise RuntimeError(f'local ray grid too large: {W}x{H}')
valid=np.zeros((H,W),dtype=np.uint8); down=Vector((0,0,-1));
for r in range(H):
    y=y1-(r+0.5)/PIXELS_PER_M
    for c in range(W):
        x=x0+(c+0.5)/PIXELS_PER_M
        hit=bvh.ray_cast(Vector((x,y,z_top)),down,RAY_DEPTH)
        if hit[0] is not None: valid[r,c]=1
    if (r+1)%50==0 or r+1==H: print(f'Yas direct-raycast grid {r+1}/{H}')
# KDTree of the FIA-estimated source segment sampled at <=0.5 m for a source-path prior.
source_pts=[]
for a,b in zip(seg[:-1],seg[1:]):
    d=float(np.linalg.norm(b-a)); n=max(1,int(math.ceil(d*PIXELS_PER_M)))
    for t in np.linspace(0,1,n,endpoint=False): source_pts.append(a+(b-a)*t)
source_pts.append(seg[-1]); source_tree=KDTree(len(source_pts))
for i,p in enumerate(source_pts): source_tree.insert(Vector((float(p[0]),0,float(p[1]))),i)
source_tree.balance()
def grid_xy(r,c): return (x0+(c+0.5)/PIXELS_PER_M,y1-(r+0.5)/PIXELS_PER_M)
def pixel(p): return (int(round((y1-p[1])*PIXELS_PER_M-0.5)),int(round((p[0]-x0)*PIXELS_PER_M-0.5)))
valid_rc=np.column_stack(np.where(valid>0))
if not len(valid_rc): raise RuntimeError('no ray-valid Yas cells in search region')
def nearest_anchor(p):
    xy=np.column_stack([x0+(valid_rc[:,1]+0.5)/PIXELS_PER_M,y1-(valid_rc[:,0]+0.5)/PIXELS_PER_M])
    j=int(np.argmin(np.sum((xy-p[None,:])**2,axis=1))); return int(valid_rc[j,0]),int(valid_rc[j,1]),float(np.linalg.norm(xy[j]-p))
sr,sc,sd=nearest_anchor(A[START]); er,ec,ed=nearest_anchor(A[END])
if max(sd,ed)>5: raise RuntimeError(f'anchor too far from actual Yas surface: {sd:.2f}/{ed:.2f}m')
# A* on ray-valid cells, with a soft preference for the FIA-derived source segment and interior cells.
R,C=valid.shape; best=np.full((R,C),np.inf); parent_r=np.full((R,C),-1,np.int32); parent_c=np.full((R,C),-1,np.int32)
best[sr,sc]=0.; heap=[(math.hypot(er-sr,ec-sc)/PIXELS_PER_M,0.,sr,sc)]
steps=[(-1,-1,math.sqrt(2)),(-1,0,1),(-1,1,math.sqrt(2)),(0,-1,1),(0,1,1),(1,-1,math.sqrt(2)),(1,0,1),(1,1,math.sqrt(2))]
visited=0
while heap:
    _,cost,r,c=heapq.heappop(heap)
    if cost!=best[r,c]: continue
    if (r,c)==(er,ec): break
    visited+=1
    for dr,dc,step in steps:
        nr,nc=r+dr,c+dc
        if nr<0 or nr>=R or nc<0 or nc>=C or not valid[nr,nc]: continue
        if dr and dc and (not valid[r,nc] or not valid[nr,c]): continue
        x,y=grid_xy(nr,nc)
        _,_,dsrc=source_tree.find(Vector((float(x),0,float(y))))
        # Count blocked local neighbours as an inexpensive mesh-edge penalty.
        blocked=0
        for ar,ac,_ in steps:
            if nr+ar<0 or nr+ar>=R or nc+ac<0 or nc+ac>=C or not valid[nr+ar,nc+ac]: blocked+=1
        dist=step/PIXELS_PER_M
        edge=dist*(1.0+SOURCE_PENALTY*(float(dsrc)/10.0)**2+CENTER_PENALTY*(blocked/8.0)*0.25)
        new=cost+edge
        if new<best[nr,nc]:
            best[nr,nc]=new;parent_r[nr,nc]=r;parent_c[nr,nc]=c
            heapq.heappush(heap,(new+math.hypot(er-nr,ec-nc)/PIXELS_PER_M,new,nr,nc))
if not np.isfinite(best[er,ec]): raise RuntimeError('no connected direct-raycast Yas path between anchors')
path=[];r,c=er,ec
while (r,c)!=(sr,sc):
    path.append((r,c));rr=int(parent_r[r,c]);cc=int(parent_c[r,c])
    if rr<0: raise RuntimeError('broken A* parent chain')
    r,c=rr,cc
path.append((sr,sc));path=np.asarray(path[::-1],dtype=np.int32)
world=np.asarray([grid_xy(int(r),int(c)) for r,c in path],dtype=np.float32)
world[0]=A[START];world[-1]=A[END]
length=float(np.linalg.norm(np.diff(world,axis=0),axis=1).sum())
# Save native coordinates and a minimal diagnostic report.
np.save(ROOT/f'{OUT_PREFIX}_xy.npy',world)
np.savez_compressed(ROOT/f'{OUT_PREFIX}_grid.npz',valid=valid,x0=x0,y1=y1,pixels_per_m=PIXELS_PER_M,source=seg,path=world)
report={'status':'estimated/non-official; direct-raycast mesh-constrained candidate','source':'FIA 2021 plan-derived Yas route anchors; A* over 0.5m cells that each ray-hit supplied Yas road meshes','no_Spa_or_Monza_data':True,'road_meshes':ROAD_NAMES,'anchor_indices':[START,END],'anchor_snap_distance_m':[sd,ed],'grid_resolution_m':1.0/PIXELS_PER_M,'route_path_points':len(world),'route_length_m':length,'astar_cost':float(best[er,ec]),'visited_grid_cells':visited,'ray_valid_grid_cells':int(valid.sum()),'runtime_seconds':time.time()-started,'notes':'Only ray-valid cells are traversable; source prior preserves the estimated FIA route where the supplied meshes allow.'}
(ROOT/f'{OUT_PREFIX}_report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
