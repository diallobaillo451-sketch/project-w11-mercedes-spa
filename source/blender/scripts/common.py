import bpy, mathutils, math, os, json
R='/workspace/w11'
STAGES=R+'/blender/stages'
def coll(name, parent=None):
    c=bpy.data.collections.get(name)
    if not c:
        c=bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c)
    return c
def move_to(o,c):
    for u in list(o.users_collection): u.objects.unlink(o)
    c.objects.link(o)
def empty(name,loc=(0,0,0),parent=None,c=None,size=0.1,disp='PLAIN_AXES'):
    e=bpy.data.objects.new(name,None); e.empty_display_size=size; e.empty_display_type=disp
    (c or bpy.context.scene.collection).objects.link(e)
    if parent: e.parent=parent
    e.location=loc; return e
def verts_world(o):
    import numpy as np
    a=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',a); a=a.reshape(-1,3)
    M=np.array(o.matrix_world); return a@M[:3,:3].T+M[:3,3]
def wbbox(objs):
    import numpy as np
    P=np.vstack([verts_world(o) for o in objs if o.type=='MESH' and len(o.data.vertices)]); return mathutils.Vector(P.min(0)),mathutils.Vector(P.max(0))
def parent_keep(child,parent):
    bpy.context.view_layer.update()
    mw=child.matrix_world.copy(); child.parent=parent; child.matrix_parent_inverse=parent.matrix_world.inverted(); child.matrix_world=mw
def save(stage):
    p=f'{STAGES}/{stage}.blend'; bpy.ops.wm.save_as_mainfile(filepath=p,compress=False); print('SAVED',p)
def wb_render(path,cam_loc,cam_rot,ortho=None,res=(1600,1000),lens=35,clip=(0.1,20000)):
    sc=bpy.context.scene
    cd=bpy.data.cameras.new('cam'); co=bpy.data.objects.new('cam',cd); sc.collection.objects.link(co)
    co.location=cam_loc; co.rotation_euler=cam_rot; cd.clip_start,cd.clip_end=clip; cd.lens=lens
    if ortho: cd.type='ORTHO'; cd.ortho_scale=ortho
    sc.camera=co; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
    sc.render.resolution_x,sc.render.resolution_y=res; sc.render.resolution_percentage=100
    sc.render.filepath=path; bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co)
