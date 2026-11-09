# Convertit TOUTES les textures WebP en KTX2 UASTC+zstd (ASTC/BC7 côté GPU, ~4x moins de VRAM).
# Les .webp restent en place (fallback). Écrit tex/ktx2.json = liste des textures disponibles en KTX2.
import json, os, subprocess, sys, tempfile
from PIL import Image
K='/workspace/tools/ktx/KTX-Software-4.4.2-Linux-x86_64'
env=dict(os.environ, LD_LIBRARY_PATH=K+'/lib')
D=os.path.join(os.path.dirname(__file__),'../public/assets/spa/tex')
use=json.load(open('/tmp/texuse.json'))
out={}
for f in sorted(os.listdir(D)):
    if not f.endswith('.webp'): continue
    im=Image.open(os.path.join(D,f)); w,h=im.size
    if w*h < 16: continue
    lin = any(k in s.lower() for s in use.get('tex/'+f,[]) for k in ('specular','normal','rough','metal','occlusion'))
    dst=os.path.join(D,f[:-5]+'.ktx2')
    if not os.path.exists(dst):
        with tempfile.NamedTemporaryFile(suffix='.png') as t:
            im.convert('RGBA' if im.mode in ('RGBA','LA','P') else 'RGB').save(t.name)
            cmd=[K+'/bin/ktx','create','--format','R8G8B8A8_UNORM' if lin else 'R8G8B8A8_SRGB','--assign-tf','linear' if lin else 'srgb',
                 '--encode','uastc','--uastc-quality','2','--zstd','19','--generate-mipmap','--threads','8',t.name,dst]
            subprocess.run(cmd,check=True,env=env,stderr=subprocess.DEVNULL)
    out[f[:-5]]=[w,h]
    print(f,w,h,lin,os.path.getsize(dst),flush=True)
json.dump(out,open(os.path.join(D,'ktx2.json'),'w'))
