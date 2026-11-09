# Audit des assets (rapports bruts : `reports/`)

## Voiture `car_w11.glb` (16,4 Mo)
43 meshes / 43 matériaux / 48 textures, ≈ 200 k triangles. Roues **non séparées** dans la source : séparées en Blender (`c2_parts.py`, `c3_car_rig.py`) en 4 × (moyeu fixe braqué + partie tournante : pneu, jante, disque, blur), étriers dans la partie braquée (ne tournent pas). Pivots : `W_FL/FR/RL/RR` (braquage) > `W_xx_spin` (rotation). Centres/rayons dans `reports/car_rig.json` (rayon ≈ 0,335 m, voie AV ≈ 1,59 m, empattement ≈ 3,64 m mesurés sur le modèle). Repère : origine milieu des essieux au sol, avant = −Z glTF.

## Pilote `driver_bell.glb` (10,7 Mo)
50 meshes, pose « debout » sans squelette. Mis en position assise (`d2_driver_flat.py`), squelette 17 os + clip `steer` (bras qui suivent le volant, 9 images −1…+1) (`d5_driver_rig.py`). Casque retexturé Hamilton 2020 (`h1…h4`), combinaison/gants teinte Mercedes 2020.

## Circuit `spa_part1..8.glb` (196 Mo, 8 parties d'un même export Sketchfab)
≈ 1,19 M triangles, 95 Mo de PNG. Problèmes trouvés (`reports/track_layers.json`, `track_overlaps.json`) :
- couches de sol **coplanaires** (asph / asph_new / patchs / lignes / traces de gomme / kerbs, écarts 0–5 mm) → z-fighting garanti en WebGL ;
- doublon intégral `new_AO2` = `new_AO` (4 963 faces) ; objet `Null` (bloqueurs invisibles) ;
- matériaux dupliqués entre parties (`.001/.002/.003`) ;
- alpha : arbres/buissons/grilles en BLEND dans la source (tri impossible → scintillement) ;
- objets géants (jusqu'à plusieurs km) → pas de culling.

Corrections (`blender/scripts/t7_assemble.py` → `stages/t2_track_assembled.blend`) :
1. suppression `Null` et `new_AO2` ;
2. fusion de 9 matériaux identiques (même nom de base + même hash d'images) ;
3. **ordre de couches fixe** avec élévation de 4 mm × priorité (0 herbe/sable … 7 lignes peintes), priorité stockée en `extras.w11_layer` et appliquée aussi au rendu (polygonOffset + renderOrder ; décals BLEND sans écriture de profondeur) ;
4. tuilage spatial 500 m + fusion par matériau → 413 objets (fond lointain non tuilé) ;
5. post-traitement (`tools/opt_track.mjs`) : alpha MASK 0,5 pour arbres/buissons/grilles/clôtures, BLEND seulement pour vitres/traces/patchs, WebP, dédup/prune/weld, compression meshopt, **positions en float32** (la quantification 14/16 bits détruisait la précision millimétrique).

Résultat : `out/assets/spa_high.glb` 35,5 Mo (textures ≤ 2048, ≈ 131 Mo GPU), `spa_medium.glb` 31,4 Mo (≤ 1024, ≈ 45 Mo GPU) — sous la cible 60–80 Mo.
Contrôle : 16 captures three.js réelles (SwiftShader, 844×390 @2x) dans `out/app/track/`, dont 2 caméras rasantes à 0,9 m : aucun z-fighting ni trou visible. **Non vérifié sur iPhone réel.**

## Audio `engine_new.mp3`
MP3 320 kb/s, 44,1 kHz stéréo, 136,96 s. Analyse spectrale / découpe en couches : à faire (étape moteur audio).
