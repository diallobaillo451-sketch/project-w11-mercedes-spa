#!/bin/bash
# PNG peints -> KTX2 (casque UASTC+zstd 2048x1024 ; combinaison 1024² et gants 1024x512 ETC1S) : mêmes tailles que les textures d'origine du GLB
K=/workspace/tools/ktx/KTX-Software-4.4.2-Linux-x86_64; set -e
cd /workspace/w11
for f in assets-work/drivers/*_helmet.png; do id=$(basename $f _helmet.png); mkdir -p game/public/drivers/$id
  LD_LIBRARY_PATH=$K/lib $K/bin/ktx create --format R8G8B8A8_SRGB --assign-tf srgb --encode uastc --uastc-quality 2 --zstd 19 --generate-mipmap $f game/public/drivers/$id/helmet.ktx2; done
for f in assets-work/drivers/*_suit.png; do id=$(basename $f _suit.png); python3 -c "from PIL import Image;Image.open('$f').convert('RGBA').resize((1024,1024),Image.LANCZOS).save('/tmp/s.png')"
  LD_LIBRARY_PATH=$K/lib $K/bin/ktx create --format R8G8B8A8_SRGB --assign-tf srgb --encode basis-lz --qlevel 255 --clevel 4 --generate-mipmap /tmp/s.png game/public/drivers/$id/suit.ktx2; done
for f in assets-work/drivers/*_gloves.png; do id=$(basename $f _gloves.png); python3 -c "from PIL import Image;Image.open('$f').convert('RGBA').save('/tmp/g.png')"
  LD_LIBRARY_PATH=$K/lib $K/bin/ktx create --format R8G8B8A8_SRGB --assign-tf srgb --encode basis-lz --qlevel 255 --clevel 4 --generate-mipmap /tmp/g.png game/public/drivers/$id/gloves.ktx2; done
du -sh game/public/drivers
