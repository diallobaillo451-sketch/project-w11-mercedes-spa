# Outils circuits (lot 1+)

Scripts Blender headless et utilitaires **réutilisables d’un circuit à l’autre**.
Un seul pipeline, pas d’expérimentations ponctuelles.

| Script | Rôle |
|---|---|
| `extract_kit_by_material.py` | Extraire des pièces kit depuis un GLB / un `.blend` de stage, par nom de matériau (`CID`, `SRC` ou `STAGE`, `OUT`, `MATS_FILE`). |
| `create_night_floodlight.py` | Création unique (liste fermée) du mât / projecteurs de stade. Instancier ensuite, lightmap Cycles, ≤ 4 lumières dynamiques. |
| `hdr_to_sky.py` | HDRI Poly Haven → ciel encodé `x/(1+x)` (webp + json), même recette que `source/tools/make_sky.py`, sans OpenCV. |
| `build_anchors.py` | `pits.json` + `marshals.json` + `track/meta.json` → `anchors.json` aux noms contractuels. Ne invente pas de position. |

Lancement typique : `blender -b -t 2 --python <script.py>` (un seul Blender à la fois).

Les clips d’animation NPC viennent du pack Spa (`idle`, `jack_push`, `tyre_change`, `flag_wave_yellow`, …). Pas de génération d’animation IA ; toute retouche se fait en keyframes Blender sur le rig existant, export glTF.
