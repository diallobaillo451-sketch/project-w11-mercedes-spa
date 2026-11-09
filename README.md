# PROJECT W11 — Mercedes-AMG F1 W11 (2020) · Spa-Francorchamps

> ⚠️ **Projet de fan, gratuit et non commercial. Non officiel et NON AFFILIÉ** à Mercedes-AMG Petronas F1, Mercedes-Benz, Lewis Hamilton, Pirelli, la FIA, Formula 1 ni au circuit de Spa-Francorchamps. Marques, noms et livrées : propriété de leurs détenteurs.

Jeu de pilotage 3D pour iPhone (Safari), **à jouer en mode paysage**. Touchez « Toucher pour démarrer » pour activer le son (et le gyroscope si choisi).

Piste en **pleine qualité pour tous les niveaux** (1,18 M triangles, textures natives jusqu'à 8192×1024, AO précalculée), chargée par tuiles, les plus proches d'abord. Téléchargement total ≈ 68 Mo (mis en cache hors ligne après la première session).

## Contenu du dépôt
- `source/` : **code source** (TypeScript, three.js, Vite, scripts assets/Blender, docs). Voir `source/README.md` pour construire. Archive complète : `source/archive/w11-source.tar.gz`.
- `public/` : build de production (Vite, chemins relatifs), chaque fichier encodé en base64.
- `parts/` : fichiers > 5 Mo découpés (base64), réassemblés par la CI.
- `SHA256SUMS` : empreintes des fichiers d'origine, vérifiées par la CI.
- `.gitlab-ci.yml` : décodage, réassemblage, vérification SHA-256, publication GitLab Pages.

## Droits et avertissements
- **Modèles 3D (voiture W11 et circuit) : fournis par l'auteur du projet** (sources Sketchfab de Kevin Love / Dave Love, CC BY 4.0).
- **Modèle du pilote** « rhp_bell_hp77_driver_f1 » de MattDoesBlender : **CC BY-NC-SA 4.0 — usage NON COMMERCIAL uniquement**, partage à l'identique ; casque et combinaison retexturés (référence casque : Wikimedia Commons, Auge=mit, CC BY-SA 4.0) distribués sous la même licence.
- **Sons moteur : origine et droits d'auteur INCONNUS** — à vérifier avant toute diffusion plus large.
- Valeurs techniques : publiées (P) ou estimées (E).
- Aucune garantie : non testé sur un vrai iPhone par l'auteur de ce build.
