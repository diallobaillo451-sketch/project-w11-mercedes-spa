/** Journal de démarrage, écran d'erreur lisible, mode sans échec automatique (plantage / démarrage trop long). */
const T0 = performance.now()
export const diag = {
  log: [] as string[], lastError: '', safe: false, safeReason: '', preset: '', fps: 0, bootMs: 0,
  drop: 0, ktx: false, texBytes: 0, mobile: false, lastProgress: T0, ready: false,
  gpu: null as null | { tex: number; geo: number; rt: number; sh: number; total: number },
}
export function dlog(msg: string) {
  const line = `${((performance.now() - T0) / 1000).toFixed(2)} s · ${msg}`
  diag.log.push(line); if (diag.log.length > 80) diag.log.shift()
  console.info('[w11]', line)
}
export function derr(e: unknown, where = '') {
  const m = (where ? where + ' : ' : '') + (e instanceof Error ? e.message : String(e))
  diag.lastError = m; dlog('ERREUR ' + m)
}
const ALIVE = 'w11.alive', SAFE = 'w11.safe', DROP = 'w11.drop'
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* privé */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* privé */ } } }
export const isMobile = () => /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
/** Décide du mode sans échec AVANT de créer le rendu : ?safe=1 forcé, ?safe=0 désactivé, sinon session précédente
 *  morte alors que la page était visible (onglet tué par manque de mémoire iOS) ou choix enregistré. */
export function decideSafe(params: URLSearchParams) {
  diag.mobile = isMobile()
  if (params.get('safe') === '0') { ls.del(SAFE); diag.safe = false }
  else if (params.get('safe') === '1') { diag.safe = true; diag.safeReason = 'demandé (?safe=1)' }
  else if (ls.get(ALIVE) === '1') { bumpDrop('la session précédente s’est arrêtée brutalement (mémoire ?)') }
  else if (ls.get(SAFE) === '1') { diag.safe = true; diag.safeReason = 'mode sans échec conservé (plantage antérieur)' }
  diag.drop = Math.min(3, Number(ls.get(DROP) || 0) | 0)
  if (diag.drop >= 3 && !diag.safe && params.get('safe') !== '0') { diag.safe = true; diag.safeReason = diag.safeReason || 'plusieurs plantages GPU' }
  if (diag.drop) dlog('qualité réduite de ' + diag.drop + ' cran(s) après plantage · ' + (ls.get(DROP + '.why') || ''))
  ls.set(ALIVE, '1')
  const off = () => ls.del(ALIVE), on = () => ls.set(ALIVE, '1')
  addEventListener('pagehide', off)
  document.addEventListener('visibilitychange', () => document.hidden ? off() : on())
  addEventListener('error', e => derr(e.error ?? e.message, 'erreur'))
  addEventListener('unhandledrejection', e => derr(e.reason, 'promesse'))
  if (diag.safe) dlog('MODE SANS ÉCHEC : ' + diag.safeReason)
}
export function setSafe(on: boolean) { if (on) ls.set(SAFE, '1'); else { ls.del(SAFE); ls.del(DROP) } }
/** plantage GPU : on baisse d'UN cran seulement (haute → moyenne → basse → sans échec) */
function bumpDrop(why: string) { const n = Math.min(3, (Number(ls.get(DROP) || 0) | 0) + 1); ls.set(DROP, String(n)); ls.set(DROP + '.why', why + ' · ' + new Date().toISOString()); dlog('plantage → qualité −1 cran (' + n + ') : ' + why) }
/** contexte WebGL perdu : journal, −1 cran, rechargement automatique */
export function gpuLost() {
  dlog('contexte WebGL perdu → rechargement avec un cran de qualité en moins'); bumpDrop('contexte WebGL perdu · ' + diag.log.slice(-3).join(' | '))
  ls.del(ALIVE); setTimeout(() => location.reload(), 600)
}
export function reloadSafe(on: boolean) {
  setSafe(on); ls.del(ALIVE)
  const u = new URL(location.href); u.searchParams.delete('safe'); if (on) u.searchParams.set('safe', '1'); else u.searchParams.set('safe', '0')
  location.replace(u.toString())
}
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
/** écran d'erreur plein écran, lisible, avec journal et boutons de relance */
export function fatal(title: string, detail = '') {
  derr(detail || title, 'fatal')
  let el = document.getElementById('fatal')
  if (!el) { el = document.createElement('div'); el.id = 'fatal'; document.body.appendChild(el) }
  el.innerHTML = `<div class="fbox"><h2>${esc(title)}</h2><p>${esc(detail)}</p>
<div class="frow"><button class="btn primary" id="fSafe">Relancer en mode sans échec</button><button class="btn" id="fRe">Réessayer</button></div>
<pre>${esc(diag.log.slice(-25).join('\n'))}</pre></div>`
  document.getElementById('fSafe')!.onclick = () => reloadSafe(true)
  document.getElementById('fRe')!.onclick = () => { ls.del(ALIVE); location.reload() }
}
/** chien de garde : aucun progrès pendant stallS secondes (ou plus de maxS au total) → relance automatique allégée,
 *  ou écran d'erreur si on est déjà en mode sans échec. */
export function watchdog(stallS = 30, maxS = 120) {
  const id = setInterval(() => {
    if (diag.ready) { clearInterval(id); return }
    const now = performance.now()
    if (now - diag.lastProgress > stallS * 1000 || now - T0 > maxS * 1000) {
      clearInterval(id)
      dlog('chien de garde : démarrage bloqué')
      if (!diag.safe) reloadSafe(true)
      else fatal('Le démarrage est bloqué', 'Aucun progrès depuis ' + stallS + ' s. Vérifie la connexion puis réessaie.')
    }
  }, 2000)
}
export function bootDone() { diag.ready = true; diag.bootMs = Math.round(performance.now() - T0); dlog('prêt en ' + (diag.bootMs / 1000).toFixed(1) + ' s') }
