import json,struct,sys,collections
def load(p):
    b=open(p,'rb').read()
    assert b[:4]==b'glTF'
    l=struct.unpack('<I',b[12:16])[0]
    return json.loads(b[20:20+l]), len(b)
for p in sys.argv[1:]:
    j,size=load(p)
    print('=====',p,size/1e6,'MB')
    print('asset',j.get('asset'),'ext',j.get('extensionsUsed'))
    print('scenes',len(j.get('scenes',[])),'nodes',len(j['nodes']),'meshes',len(j.get('meshes',[])),'mats',len(j.get('materials',[])),'tex',len(j.get('textures',[])),'imgs',len(j.get('images',[])),'skins',len(j.get('skins',[])),'anims',len(j.get('animations',[])))
    acc=j['accessors']; bv=j['bufferViews']
    tris=0
    for m in j.get('meshes',[]):
        t=0;bb=None
        for pr in m['primitives']:
            if 'indices' in pr: t+=acc[pr['indices']]['count']//3
            pa=acc[pr['attributes']['POSITION']]
            mn,mx=pa.get('min'),pa.get('max')
        tris+=t
        attrs=list(m['primitives'][0]['attributes'].keys())
        mats=[j['materials'][pr['material']]['name'] if 'material' in pr else None for pr in m['primitives']]
        print(f"  mesh {m.get('name')!s:40} tris {t:7d} prims {len(m['primitives'])} attrs {attrs} mats {mats} bb {[round(x,2) for x in mn]}..{[round(x,2) for x in mx]}")
    print('  TOTAL tris',tris)
    for i,mt in enumerate(j.get('materials',[])):
        pb=mt.get('pbrMetallicRoughness',{})
        print('  mat',i,mt.get('name'),'alpha',mt.get('alphaMode'),'ds',mt.get('doubleSided'),'bc',pb.get('baseColorFactor'),'bct',pb.get('baseColorTexture',{}).get('index'),'mr',pb.get('metallicFactor'),pb.get('roughnessFactor'),'mrt',pb.get('metallicRoughnessTexture',{}).get('index'),'n',mt.get('normalTexture',{}).get('index'),'ext',list(mt.get('extensions',{}).keys()))
    for i,im in enumerate(j.get('images',[])):
        sz=bv[im['bufferView']]['byteLength'] if 'bufferView' in im else 0
        print('  img',i,im.get('name'),im.get('mimeType'),round(sz/1e6,2),'MB')
    # node hierarchy summary
    def walk(n,d):
        nd=j['nodes'][n]
        if d<4: print('  '+'  '*d+f"node {nd.get('name')} mesh={nd.get('mesh')} t={[round(x,2) for x in nd.get('translation',[])]} r={[round(x,3) for x in nd.get('rotation',[])]} s={[round(x,3) for x in nd.get('scale',[])]} m={'Y' if 'matrix' in nd else ''} ch={len(nd.get('children',[]))}")
        for c in nd.get('children',[]): walk(c,d+1)
    for r in j['scenes'][0]['nodes']: walk(r,0)
