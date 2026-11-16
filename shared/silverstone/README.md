# Silverstone : paquet de données

Cette branche ne contient que les données lourdes de Silverstone (comme `newbot-shared` pour Monza). La CI du jeu va les chercher ici.

Dépose dans ce dossier (`shared/silverstone/`) le fichier **`silverstone_pack.tar`** (environ 72 Mo). Son empreinte SHA-256 attendue est dans `shared/silverstone/silverstone_pack.sha256` sur la branche du code (`claude/silverstone`, puis `main`).

Contenu du paquet : `scene/` (tuiles 3D, textures WebP + KTX2), `track/` (surface.json, surface.bin, meta.json), `tools/` (scripts de fabrication).

Modèle source : « Silverstone Circuit 2024 layout » par Dave Love (Sketchfab Tyler_Dave), CC BY 4.0.
