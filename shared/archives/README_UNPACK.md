# Archives shared/

Les binaires sont poussés en archives ZIP (limite API GitLab via connecteur).

## Déballage

```bash
cd shared/radio && for z in ../archives/radio_*.zip; do unzip -o "$z"; done
cd shared/downloads && for z in ../archives/downloads_*.zip; do unzip -o "$z"; done
```

Les fichiers trop lourds pour l’API sont listés dans SKIPPED.txt et restent sur l’ordinateur partagé `/workspace/w11-shared/`.
