"""Import non destructif du GLB Interlagos fourni et génération d'une copie .blend.

Usage depuis la racine du dépôt :
  blender -b --python source/blender/scripts/interlagos_2023_import.py
Optionnel : définir INTERLAGOS_SOURCE et INTERLAGOS_BLEND_OUT.
Le script ne re-scale, ne déplace et ne supprime aucune géométrie du modèle source.
"""
import bpy, hashlib, os
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
SOURCE = Path(os.environ.get('INTERLAGOS_SOURCE', str(REPO / 'source/blender/assets/interlagos_2023/failed_import_interlagos_circuit_2023_layout.glb')))
OUTPUT = Path(os.environ.get('INTERLAGOS_BLEND_OUT', str(REPO / 'source/blender/work/interlagos_2023/interlagos_2023_source.blend')))
if not SOURCE.is_file(): raise FileNotFoundError(f"GLB source introuvable : {SOURCE}")
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
result = bpy.ops.import_scene.gltf(filepath=str(SOURCE))
if 'FINISHED' not in result: raise RuntimeError(f"Échec de l'import glTF : {result}")
scene = bpy.context.scene
scene['project_label'] = 'INTERLAGOS_2023_WORKING_COPY'
text = bpy.data.texts.new('SOURCE_AND_LICENSE.txt')
text.write(
    'Source GLB : failed_import_interlagos_circuit_2023_layout.glb\n'
    'Auteur déclaré dans asset.extras : Dave Love / Sketchfab (Tyler_Dave)\n'
    'Licence déclarée : CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/\n'
    'Source : https://sketchfab.com/3d-models/failed-import-interlagos-circuit-2023-layout-4e5f0ebb2f2b48d289d5f6231c22512b\n'
    f'SHA-256 : {sha}\n'
    'Modifications réalisées par ce script : import glTF et encapsulation dans ce .blend seulement.\n'
    'La géométrie et les transformations importées sont conservées; valider le repère et l’échelle avant tout export de jeu.\n'
)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
print(f'INTERLAGOS_BLEND_OK source={SOURCE} sha256={sha} output={OUTPUT} meshes={sum(o.type == "MESH" for o in bpy.data.objects)} images={len(bpy.data.images)}')
