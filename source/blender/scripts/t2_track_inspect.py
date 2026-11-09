import bpy,sys,json,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
bpy.ops.wm.open_mainfile(filepath=STAGES+'/t1_track_raw.blend')
out=[]
for o in bpy.data.objects:
    if o.type!='MESH': continue
    mn,mx=wbbox([o]); out.append(dict(n=o.name,me=o.data.name,mats=[m.name for m in o.data.materials if m],tris=sum(len(p.vertices)-2 for p in o.data.polygons),mn=[round(v,2) for v in mn],mx=[round(v,2) for v in mx],coll=o.users_collection[0].name))
json.dump(out,open(R+'/reports/track_objects.json','w'),indent=0)
mn,mx=wbbox([o for o in bpy.data.objects if o.type=='MESH'])
print('WORLD BBOX',mn,mx)
c=(mn+mx)/2
wb_render(R+'/blender/renders/track_top.png',(c.x,c.y,mx.z+500),(0,0,0),ortho=max(mx.x-mn.x,mx.y-mn.y)*1.05,res=(2000,2000))
