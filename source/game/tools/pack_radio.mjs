// Banque radio : messages utiles en contre-la-montre / essais + clips à assembler + bips/souffle ffmpeg, en UN fichier
// (public/radio/bank.bin, M4A concaténés) + index public/radio/bank.json. Variantes sans « Lewis » préférées.
import fs from 'node:fs'
const SRC = '/workspace/w11-shared/radio/', OUT = 'public/radio/'
const m = JSON.parse(fs.readFileSync(SRC + 'manifest.json', 'utf8'))
const MSG = ['radio_check', 'radio_check_ok', 'sortie_garage', 'tour_sortie', 'tour_lance_go', 'meilleur_perso', 'secteur_violet', 'rythme_bon', 'pousser',
  'perte_temps_secteur', 'tour_annule_limites', 'limites_piste', 'avertissement', 'limiteur', 'sortie_stands', 'arret_ok', 'exces_vitesse_stands',
  'drapeau_jaune', 'double_jaune', 'drapeau_vert', 'drapeau_rouge', 'debris', 'degats_aileron', 'degats_fond', 'degats_mineurs', 'contact',
  'pneus_temp_haute', 'pneus_temp_basse', 'blocage', 'freins_temp', 'recharge_ers', 'overtake', 'drs_dispo', 'encouragement', 'concentre', 'calme',
  'chauffe_ok_attaque', 'chauffe_zigzag', 'compris', 'mode_moteur_attaque', 'fin_session_rentre']
const SEG = ['seg_temps_au_tour', 'seg_une_minute', 'seg_deux_minutes', 'seg_secondes', 'seg_seconde', 'seg_delta', 'seg_plus', 'seg_moins', 'seg_secteur', 'seg_violet', 'seg_vert', 'seg_tour', 'seg_bien_joue', 'seg_chrono_a_battre']
const chunks = [], idx = { messages: {}, clips: {}, sfx: {} }; let off = 0
const add = f => { const b = fs.readFileSync(SRC + f); chunks.push(b); const r = [off, b.length]; off += b.length; return r }
for (const id of MSG) { const x = m.messages.find(e => e.id === id); if (!x) { console.warn('absent', id); continue }
  const ok = x.variantes.filter(v => !/Lewis/.test(v.texte)), vs = ok.length ? ok : x.variantes
  idx.messages[id] = { p: x.priorite, cat: x.categorie, v: vs.map(v => ({ r: add(v.fichier), t: v.texte, ms: v.duree_ms })) } }
for (const c of m.clips_assemblables.items) if (/^(num_|dixieme_)/.test(c.id) || SEG.includes(c.id)) idx.clips[c.id] = { r: add(c.fichier), t: c.texte, ms: c.duree_ms }
for (const [k, f] of [['open', 'sfx/radio_ouverture_3_synth.m4a'], ['close', 'sfx/radio_fermeture_3_synth.m4a'], ['hiss', 'sfx/radio_souffle_boucle_3_synth.m4a']]) idx.sfx[k] = add(f)
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + 'bank.bin', Buffer.concat(chunks)); fs.writeFileSync(OUT + 'bank.json', JSON.stringify(idx))
console.log('messages', Object.keys(idx.messages).length, 'clips', Object.keys(idx.clips).length, 'octets', off)
