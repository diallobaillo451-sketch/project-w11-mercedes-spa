# PROGRESS — bibliothèque radio ingénieur (FR)

- Voix : « F1 » (voix clonée de Baillo) — voice_id `hENoCPm60lhmLthS2uSL` (PAS « F1 2 » = lkFh1B9EXRPqHx41AA3e)
- Modèle : eleven_multilingual_v2, language_code fr
- Réglages (tranchés après test A/B/C) : stability 0.65, similarity_boost 0.9, style 0, use_speaker_boost true, speed 1.05
- Flow ElevenLabs : bTeiFAIxgvmhoZTZo1X5 (« W11 Radio ingénieur FR »)
- Méthode : lots de 30 phrases séparées par `<break time="1.2s" />`, découpe par silences + programmation dynamique (durée attendue), QA Whisper.
- Atelier (sources, scripts) : /workspace/radio_work (src/*.mp3 = lots bruts, raw/*.wav = clips découpés, content.py = textes)

## État
- [x] Tests voix (≈ 2 000 crédits)
- [x] Lots TTS b00–b20 générés et téléchargés (src/b00..b20.mp3) — ≈ 25 200 crédits
- [x] SFX ElevenLabs (bips ouverture/fermeture ×2, souffles ×4) + SFX synthétisés CC0
- [x] Découpe 602/602 (lot de correction fix1 = 54 crédits pour seg_fenetre_dans, seg_dans, seg_virage)
- [x] QA Whisper des messages : aucun décalage détecté
- [x] Lot de correction généré (54 crédits)
- [x] Encodage M4A −16 LUFS : 611 fichiers audio
- [x] manifest.json + README.md écrits et vérifiés (toutes les entrées pointent vers un fichier existant)

**TERMINÉ.** Pour reprendre/rejouer : `cd /workspace/radio_work && python3 build.py && python3 finalize.py` (saute les fichiers déjà encodés).

## Budget crédits ElevenLabs
- Solde exact : NON LISIBLE via le connecteur ElevenLabs (aucun outil d'abonnement/solde exposé ; seul `estimate_only` existe). À vérifier dans elevenlabs.io → Subscription. Aucune génération n'a échoué pour manque de crédits.
- Coût mesuré : multilingual_v2 ≈ 1 crédit/caractère (balises `<break>` facturées partiellement, ~0,8 crédit/caractère du prompt) ; v4 ≈ 1 crédit/caractère sur le texte (balises ignorées, donc inutilisable pour la découpe). SFX : 2 crédits par bip, 27 crédits par souffle de 8 s.
- Réserve : la production était déjà entièrement générée quand la consigne budget est arrivée ; plus aucune grosse génération n'est prévue (seul lot restant : correction ≈ 60–300 crédits).

| Lot | Contenu | Crédits |
|---|---|---|
| tests | 3 réglages × 2 phrases + 2 tests de pauses | 664 |
| b00 | radio check, réponses courtes, sortie garage | 1 250 |
| b01 | départ / formation / feux / qualif début | 1 865 |
| b02 | qualifications | 1 711 |
| b03 | qualif fin, rythme, meilleur tour | 1 625 |
| b04 | positions, bagarre, DRS | 1 670 |
| b05 | DRS, pneus, box | 1 581 |
| b06 | stands | 1 538 |
| b07 | stands, drapeaux | 1 677 |
| b08 | safety car, VSC, limites | 1 595 |
| b09 | pénalités, dégâts | 1 733 |
| b10 | abandon, carburant/ERS, météo | 1 539 |
| b11 | météo, stratégie | 1 332 |
| b12 | fin de course, encouragements, muret | 1 339 |
| b13 | muret (3 phrases) | 90 |
| b14–b16 | nombres 0–70, dixièmes, P1–P9 | 577 + 752 + 656 |
| b17 | P10–P20, pilotes | 544 |
| b18 | pilotes, écuries, pneus, segments | 658 |
| b19–b20 | segments assemblables | 782 + 722 |
| SFX | 2 bips ouverture, 2 fermeture, 4 souffles (ElevenLabs) | 116 |
| **Total (hors fix1)** | | **≈ 26 016** |
| fix1 | 3 segments manquants | 54 |

**Total dépensé : ≈ 26 070 crédits.**

## Lot 2 — Qualifs + Réglages (plafond strict 4 000 crédits)
- Contenu : 46 messages (25 qualif + 21 réglages), 50 prises (2e prise seulement pour q_dernier_run, q_sors_maintenant, q_gros_tour, reg_confirme) + 31 clips assemblables
- Estimation (estimate_only) : b22 qualif + b23 qualif/réglages + b24 clips = **3 232 crédits** ; marge restante sous plafond : 768 (corrections éventuelles)
- ❌ b22/b23/b24 (3 232 crédits) REFUSÉS par ElevenLabs, rien n'a été facturé : « quota of 30113, 928 credits remaining ». **Solde réel ≈ 928 crédits** sur un quota de 30 113.
- Plan réduit (réserve ~30 %) : 1 lot de 17 éléments, estimation 620 crédits → solde attendu après ≈ 308.
  - qualif ≈ 45 % : 6 messages + 3 clips (minutes restantes, provisoirement, jaune)
  - réglages ≈ 25 % : 3 messages + clip « Brake bias, position »
  - course ≈ 30 % : 2 messages + 2 clips (revient fort, est sorti de la piste) à combiner avec les écuries/pilotes existants
- ✅ lot 2 réduit généré, découpé (DP sans écart), QA Whisper, encodé, manifest à jour : +11 messages (6 qualif, 3 réglages, 2 course), +6 clips. Coût réel 620 crédits.
- ✅ test prononciation « Lewis » (Liouisse / Lou-isse / Lewiss) : 70 crédits, fichiers dans tests_lewis/. Whisper entend « Louis » partout → non concluant, à écouter à l'oreille.
- Total lot 2 dépensé : 690 crédits (plafond 4 000). Solde ElevenLabs restant estimé ≈ 238 crédits.
- Correction Lewis : 0 prise corrigée, 56 prises contenant « Lewis » restent (≈ 2 050 caractères ≈ 1 700 crédits) → à faire après recharge du quota.
- Reste à faire quand le quota sera rechargé : le reste du plan qualif/réglages initial (b22/b23/b24 d'origine, ≈ 3 230 crédits ; sauvegarde dans content_v1_backup + historique).

## Lot 3 — chauffe pneus (tour de formation / tour de sortie)
- ✅ 4 messages, 1 prise, sans « Lewis » : chauffe_zigzag, chauffe_premier_virage, chauffe_avant_gauche, chauffe_ok_attaque (catégorie pneus).
- Coût : 186 crédits (estimation = réel), 216 caractères facturés incl. balises de pause. Aucune requête refusée.
- Solde ElevenLabs restant estimé ≈ 238 − 186 = **≈ 52 crédits**.
