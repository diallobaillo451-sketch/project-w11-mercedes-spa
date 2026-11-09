/** Panneau Diagnostic (Options → Diagnostic) : i/s, mémoire estimée, préréglage actif, dernière erreur, journal. */
import { diag } from '../diag.ts'
import type { Renderer } from '../render/renderer.ts'
import type { AdaptiveResolution } from '../quality/quality.ts'
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const mb = (b: number) => (b / 1048576).toFixed(0) + ' Mo'
export function diagPanel(body: HTMLElement, ren: () => Renderer | undefined, adapt: () => AdaptiveResolution, reloadSafe: (on: boolean) => void) {
  body.innerHTML = '<div class="diag"><table id="dT"></table><div class="frow" style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">' +
    `<button class="btn small" id="dSafe">${diag.safe ? 'Quitter le mode sans échec' : 'Relancer en mode sans échec'}</button>` +
    '<button class="btn small" id="dCopy">Copier le journal</button></div><pre id="dLog"></pre></div>'
  body.querySelector<HTMLElement>('#dSafe')!.onclick = () => reloadSafe(!diag.safe)
  body.querySelector<HTMLElement>('#dCopy')!.onclick = () => { void navigator.clipboard?.writeText(diag.log.join('\n') + '\n' + diag.lastError).catch(() => {}) }
  const tick = () => {
    if (!body.isConnected || !body.querySelector('#dT') || (body.closest('[hidden]'))) { clearInterval(id); return }
    const r = ren(), a = adapt(), info = r?.r.info
    const c = r?.canvas, px = c ? c.width * c.height : 0
    // estimation GPU : textures piste + cibles de rendu (couleur HalfFloat ×MSAA + profondeur) + carte d'ombre
    const rt = px * (8 * (r?.q.msaa && (r.q.bloom || r.q.gtao) ? (r.mobile ? 3 : 5) : 1) + 4) + (r?.q.gtao ? px * 12 : 0)
    const sh = r ? r.sun.shadow.mapSize.x ** 2 * 4 : 0
    const jsMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
    const rows: [string, string][] = [
      ['Images / s', diag.fps ? diag.fps.toFixed(0) : '—'],
      ['Préréglage', diag.preset + (diag.safe ? ' — ' + diag.safeReason : '')],
      ['Résolution', c ? `${c.width}×${c.height} (échelle ${a.scale.toFixed(2)}, effets ${a.fx})` : '—'],
      ['Mémoire GPU estimée', (() => { const e = r?.gpuEstimate(); return e ? `${mb(e.total)} (textures ${mb(e.tex)}, géométrie ${mb(e.geo)}, cibles ${mb(e.rt)}, ombre/sonde ${mb(e.sh)})` : `${mb(diag.texBytes + rt + sh)}` })()],
      ['Tuiles dans la scène', r ? `${r.tilesInScene} (dernière : ${r.lastTile})${r.mobile ? (r.upgraded ? ' · qualité montée' : ' · démarrage léger') : ''}` : '—'],
      ['Mémoire JS', jsMem ? mb(jsMem) : 'non exposée par Safari'],
      ['Appels de dessin', info ? `${info.render.calls} · ${(info.render.triangles / 1e3).toFixed(0)} k triangles · ${info.memory.textures} textures` : '—'],
      ['Piste', r?.tiles ? `${r.tiles.loaded.size}/${r.tiles.total} tuiles` : '—'],
      ['Démarrage', diag.bootMs ? (diag.bootMs / 1000).toFixed(1) + ' s' : '—'],
      ['Dernière erreur', diag.lastError || 'aucune'],
    ]
    body.querySelector('#dT')!.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')
    body.querySelector('#dLog')!.textContent = diag.log.slice(-40).join('\n')
  }
  const id = setInterval(tick, 500); tick()
}
