# Radio ingénieur de course — W11 (FR)

Bibliothèque de messages radio d'ingénieur F1 en français pour le pilote joueur « Lewis ».
Index complet : `manifest.json` (champ `langue: "fr"`).

## Voix et génération
- Voix : **F1** (voix clonée personnelle de Baillo, ses droits) — voice_id `hENoCPm60lhmLthS2uSL`
- Modèle : `eleven_multilingual_v2` (meilleur que v4 pour cet usage : v4 ignore les balises de pause, donc pas de découpe fiable ; v2 testé plus juste que v2 « expressif »)
- Réglages identiques partout : stability 0.65, similarity_boost 0.9, style 0, speaker boost activé, speed 1.05, language_code fr
- Production par lots de 30 phrases séparées par `<break time="1.2s"/>` dans une seule lecture (prosodie homogène), puis découpe automatique (silences + programmation dynamique sur la durée attendue) et contrôle Whisper (aucun décalage détecté).

## Format
- M4A / AAC-LC, 44,1 kHz, mono, ~96 kbps
- Voix normalisées à −16 LUFS (crête ≈ −1 dBFS), blancs de début/fin coupés (~30 ms / ~60 ms gardés)
- Voix PROPRES, sans effet : le filtre radio (300 Hz–3,4 kHz, saturation, souffle) se fait dans le jeu.

## Arborescence
- `voix/<categorie>/<id>_vN.m4a` — 161 messages, 393 prises (2–3 variantes formulées différemment)
- `clips/<groupe>/<id>.m4a` — 209 clips assemblables : nombres 0–70, dixièmes (« virgule zéro » à « virgule neuf »), positions P1–P20, 23 pilotes 2020, 10 écuries, 5 pneus, 65 segments
- `sfx/` — bips et souffle (fichiers séparés)

## Messages (manifest.messages)
Chaque entrée : `id, categorie, declencheur, texte, duree_ms, fichier, priorite (0–3), variantes[{fichier, texte, duree_ms}]`.
Priorités : 0 ambiance, 1 info, 2 important, 3 critique (doit interrompre).
Catégories : general, reponses_courtes, depart, qualification, rythme, positions, drs, pneus, stands, drapeaux, safety_car (SC/VSC), penalites, degats, gestion (ERS/carburant/modes), meteo, strategie, fin_course, encouragements, muret.
Conseil : choisir une variante au hasard en évitant la dernière jouée.

## Assemblage (manifest.clips_assemblables)
Enchaîner les clips listés en insérant 40–80 ms de silence entre eux. Exemples (30 dans le manifest) :
- `["seg_ecart_devant","num_1","dixieme_4","seg_secondes"]` → « Écart avec la voiture devant : un virgule quatre secondes. »
- `["pilote_verstappen","seg_est_derriere_a","num_2","dixieme_1","seg_secondes"]`
- `["pilote_leclerc","seg_s_arrete_ce_tour"]`, `["seg_attention","pilote_bottas","seg_en_difficulte"]`, `["pilote_gasly","seg_penalite_5"]`
- `["seg_tour","num_23"]`, `["num_12","seg_tours_restants"]`, `["seg_tu_es","pos_3"]`, `["seg_box_box","seg_on_met_les","pneu_durs"]`
`num_N` sert pour les secondes, les tours (1–70) et les tours d'usure. `pilotes_2020` donne écurie, numéro et statut (titulaire/remplaçant) de chaque pilote.

## Effets (manifest.sfx)
| Fichier | Origine | Licence |
|---|---|---|
| radio_ouverture_1/2, radio_fermeture_1/2, radio_souffle_boucle_1/2 | ElevenLabs Sound Effects v2, généré sur le compte de Baillo | usage selon son abonnement ElevenLabs |
| radio_ouverture_3_synth, radio_fermeture_3_synth, radio_souffle_boucle_3_synth | synthèse ffmpeg (sinus + bruit rose filtré 300–3400 Hz) | CC0 / domaine public |
Bips à −16 LUFS ; souffles en boucle à −30 LUFS (fond, à mixer sous la voix). Les variantes « synth » sont les plus propres et prévisibles ; les ElevenLabs sont plus « réalistes » mais plus bruitées.

## Limites connues
- La voix prononce parfois « Lewis » à la française (« Louis »).
- Pas d'imitation de vrais ingénieurs : voix de Baillo uniquement.
- Les clips très courts (« et », « dans », « plus ») sonnent un peu détachés : garder des pauses courtes à l'assemblage.

## Lot 2 (réduit) — prononciation de « Lewis »
Le quota ElevenLabs ne laissait que ~928 crédits : lot 2 réduit à 11 messages + 6 clips (620 crédits).
Le moteur prononce parfois « Lewis » comme « Louis ». Test de graphies dans `tests_lewis/` (hors manifest).
En attendant une régénération, le jeu peut préférer les variantes sans « Lewis » (la plupart des messages en ont une).
