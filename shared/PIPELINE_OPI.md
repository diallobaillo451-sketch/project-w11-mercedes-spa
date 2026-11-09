# Spécification d'Opi pour les nouveaux circuits et voitures (9 nov. 2026)
Sortie : /workspace/w11-shared/assets/<circuit_ou_voiture>/. Ne jamais toucher /workspace/w11 (copier les scripts, ne pas les modifier sur place). Rien pousser sur GitLab.
À lire d'abord (lecture seule) : /workspace/w11/STATUS.md, docs/ARCHITECTURE.md, docs/AUDIT.md, docs/SOURCES.md, docs/IMPROVEMENTS_20.md.
Blender headless : /workspace/blender/blender ; utilitaires blender/scripts/common.py.
## Circuit
t1_track_import → t2_track_inspect → t3_layers → t4_overlap → t5_top → t6_export_tris → t7_assemble ; t8_centerline + tools/centerline_v4.py + tools/smooth_cl.py ; t9_surface_v5.py ; r1_bake_ao_track.py ; k1_export_coll.py + tools/coll/ (segments.py, pitmap.py, pitpath.py, grassmask.py, raster.py, check.py) ; t10_crowd.py, t10_startline.py ; tools/opt_track.mjs, tools/build_track_tiles.mjs, game/tools/lod_tiles.mjs, game/tools/make_ktx2.py ; tools/make_sky.py ; contrôle tools/audit_glb.py.
Specs : glTF Y-up, mètres, échelle réelle (longueur officielle ±0,5 %), origine ligne de départ, orientation comme Spa. assets/<id>/tiles.json + 13-20 tuiles .glb meshopt ; tex/ KTX2 UASTC + mipmaps ; LOD lointain ~50 % ; ~1,2 M tris total, 150-250 k visibles, ≤ ~130 Mo textures GPU ; arbres/public en instancing (crowd.bin/json) ; AO par sommet.
Physique track/ : surface.json + surface.bin même format que /workspace/w11/game/public/track/surface.json (N, ND, D0=-45, DSTEP=0.25, cx, cy, cz, wl, wr, wallL, wallR, types, materials ; cell=(hcm+4096)<<3|type), barriers.bin, pitlane.json (chemin, entrée, sortie, zone limitée), grassmask.bin, <id>_centerline.json, meta.json (DRS, secteurs, longueur, virages, record, sources).
## Voiture
c1_car_inspect → c2_parts → c3_car_rig → c4_check → s1_drs_flap → e1_export_car ; tools/opt_car.mjs, game/tools/car_ktx2.mjs, game/tools/split-drs.mjs, game/tools/glb_meshopt.mjs ; pilote : d1-d7 (d7_grip_check).
Specs : <id>_high_ktx2.glb, noms de nœuds comme w11_lh2020_high_ktx2.glb (vérifier avec tools/audit_glb.py) ; ≤ ~16 Mo, ~300 k tris ; car_meta.json (dimensions, empattement, voies, CdG estimé, sources physique puissance/masse/aéro/boîte/pneus marquées P/M/E).
## Interdits
Ne rien modifier dans /workspace/w11 ni pousser sur GitLab ; pas de baisse visible de qualité ; prudence logos officiels, jeu non payant (pilote CC BY-NC-SA) ; SOURCES.md par asset avec licences ; pas de tâche lourde en double (un rendu tourne chez Opi).
Livraison : un circuit ou une voiture à la fois ; rapport court (chemins, budgets mesurés, captures, incertitudes).
