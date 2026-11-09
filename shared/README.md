# shared/ — ressources NewBot (branche `newbot-shared`)

Dossier partagé entre NewBot et Opi. Ne touche pas au code du jeu sur `main`.

## Contenu

| Chemin | Description |
|--------|-------------|
| `radio/` | Bibliothèque radio ingénieur de course **en français**, voix ElevenLabs **« f1 »** (droits Baillo). Messages course / qualifs / réglages / chauffe pneus, clips assemblables, SFX ouverture/fermeture radio. Voir `radio/README.md`, `radio/manifest.json`, `radio/PROGRESS.md`. |
| `RESEARCH_NEWBOT.md` | Recherches techniques (volant W11, Spa, textures, sons, OSM). |
| `PIPELINE_OPI.md` | Fiche pipeline d’Opi : comment préparer un nouveau circuit ou une F1 (glTF/meshopt/KTX2/LOD) avant de lui passer la physique. |
| `spa_osm_geometry.json` | Géométrie Spa dérivée d’OpenStreetMap — licence **ODbL**, à créditer. |
| `downloads/` | Textures, HDRI et sons **CC0 / libres** (Poly Haven, ambientCG, etc.). Licences détaillées dans `downloads/LICENCES.txt`. |
| `assets/` | Sortie du pipeline NewBot pour nouveaux circuits/voitures (vide pour l’instant). |

## Notes

- Branche dédiée pour éviter tout conflit avec le travail d’Opi sur `main`.
- Les fichiers trop lourds pour un push GitLab (limite ~100 Mo / contraintes API) peuvent être absents ; la liste est indiquée dans le message de commit ou le rapport NewBot.
