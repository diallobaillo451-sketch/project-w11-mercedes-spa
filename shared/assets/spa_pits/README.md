# assets/spa_pits — livraison stands Spa 2020 (W11)

À lire d'abord : `USAGE_ASSETS.md` (intégration). Données : `pits.json`, `marshals.json`. Licences : `SOURCES.md`. Recherche : `RECHERCHE_GARAGE.md`. Rendus : `preview/`.

## Budget GPU (textures UASTC ≈ w×h×1,33 o + géométrie)
| Élément | Texture GPU | Géométrie | Tris |
|---|---:|---:|---:|
| garage_player | 15,40 Mo | 3,03 Mo | 94 453 |
| PNJ ingénieur + mécanicien (1 texture d'équipe chacun, instances partagées) | 3,66 Mo | 0,54 Mo | 9 160 + 9 000 / instance |
| **Total garage joueur + PNJ** | | | **≈ 22,6 Mo (< 25 Mo)** |
| garages_lod (10) | 1,75 Mo | 0,03 Mo | 778 |
| pitwall_stands (10) | 2,27 Mo | 0,36 Mo | 9 760 |
| pit_exit_lights | 0,09 Mo | 0,01 Mo | 424 |
| npc_marshal | 1,83 Mo | 0,28 Mo | 9 104 |
| marshal_lamps (16 postes × 4) | 0,03 Mo | ~0 | 128 |
| marshal_platforms (8) | — | 0,08 Mo | 2 016 |
| brakeboards (18) | 0,35 Mo | 0,01 Mo | 216 |

Variantes `_256` des tenues : environ 0,09 Mo chacune, pour la foule et le lointain.
Aucun PNG non compressé n'est embarqué : tout est en KTX2.

Générateurs : `/workspace/w11-shared/work/spa_pits/`, avec
`b_garage.py`, `b_world.py`, `b_npc.py`, `gen_tex.py`, `gen_outfits.py`, `mk_world.py`, `mk_trackside.py`, `mk_marshals_b.py`, `mk_lamps.mjs`, `b_boards.py`, `b_platforms.py`, `mk_pits.py`, `s2_final.mjs`.
