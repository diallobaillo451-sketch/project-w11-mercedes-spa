# Code source — PROJECT W11 (Mercedes-AMG F1 W11 · Spa)

Code TypeScript / three.js / Vite du jeu. **Les gros assets binaires (GLB, KTX2, audio, bins de piste) ne sont pas ici** : ils sont déjà déployés sur le site GitLab Pages.

## Jouer (build déjà publié)
https://issagabah451.gitlab.io/project-w11-mercedes-spa/

## Contenu
- `game/` — application (src, tests, configs Vite/TS, public léger)
- `tools/` — scripts d’assets (Python / Node)
- `blender/scripts/` — scripts Blender headless
- `docs/` — AUDIT, SOURCES, RESEARCH_W11, ARCHITECTURE, FEATURES_STATUS
- `STATUS.md` — état honnête du projet

## Construire localement
```bash
cd game
npm ci   # ou : npm install
# Copier les assets depuis le site déployé (ou depuis un mirror) dans game/public/assets/,
# game/public/audio/, game/public/track/surface.bin, game/public/basis/basis_transcoder.wasm
npm run build    # → game/dist/
npm run preview  # http://127.0.0.1:4199
```

Sans les assets binaires, le build JS/CSS réussit mais le jeu ne peut pas charger la piste ni la voiture.

## Assets exclus (déjà sur Pages)
- `game/public/assets/**` (GLB / KTX2 / BIN / glTF lourds) — présents dans `public/` + `parts/` à la racine du dépôt
- `game/public/audio/**/*.wav|mp3`
- `game/public/track/surface.bin`
- `game/public/basis/basis_transcoder.wasm`
- `node_modules/`, `dist/`, `assets-raw/`, `assets-work/`, fichiers `.blend`, secrets

## Licence / avertissements
Projet de fan non officiel. Voir le README à la racine du dépôt pour les droits (Sketchfab CC BY, pilote CC BY-NC-SA, sons d’origine inconnue).
