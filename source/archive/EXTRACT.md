# Archive source complète

Les fichiers `w11-source.tar.gz.b64.part00` … `part03` forment l'archive gzip du dossier `source/` (code + docs + scripts, sans gros binaires).

```bash
cat w11-source.tar.gz.b64.part0* | base64 -d > w11-source.tar.gz
tar -xzf w11-source.tar.gz
```

Le même contenu est aussi versionné fichier par fichier sous `source/` à la racine du dépôt.
