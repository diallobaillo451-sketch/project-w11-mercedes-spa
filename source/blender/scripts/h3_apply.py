import bpy,sys,math
sys.path.insert(0,'/workspace/w11/blender/scripts'); from common import *
src=sys.argv[sys.argv.index('--')+1]; outst=sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.open_mainfile(filepath=STAGES+'/'+src)
def load(path,name):
    for i in list(bpy.data.images):
        if i.name==name: bpy.data.images.remove(i)
    i=bpy.data.images.load(path); i.name=name; i.pack(); return i
H=load(R+'/assets-work/helmet_lh2020.png','LH2020_helmet')
S=load(R+'/assets-work/suit_merc2020.png','MERC2020_suit')
G=load(R+'/assets-work/gloves_merc2020.png','MERC2020_gloves')
n=0
for m in bpy.data.materials:
    if not m.node_tree: continue
    for nd in m.node_tree.nodes:
        if nd.type!='TEX_IMAGE' or not nd.image: continue
        if (m.name.startswith('Helmet_Base') or m.name.startswith('Helmet_Visor_Strip')) and nd.image.name.split('.')[0] in ('Image_7','LH2020_helmet'): nd.image=H; n+=1
        if m.name=='Driver_Suit' and nd.image.name.split('.')[0] in ('Image_20','MERC2020_suit'): nd.image=S; n+=1
        if m.name=='Driver_Gloves' and nd.image.name.split('.')[0] in ('Image_18','MERC2020_gloves'): nd.image=G; n+=1
    if m.name.startswith('Helmet_Base'):
        b=m.node_tree.nodes.get('Principled BSDF')
        if b: b.inputs['Roughness'].default_value=0.18
print('retextured nodes',n)
if outst!='-': save(outst)
