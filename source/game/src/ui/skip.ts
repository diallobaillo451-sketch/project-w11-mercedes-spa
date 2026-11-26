/** Bouton Skip : formation + neutralisations (SC / VSC / rouge / jaune). */

const $ = (id: string) => document.getElementById(id)!

export function syncRaceSkipButton(
  F: { ctrl: { phase: string; sc: { active: boolean }; vsc: boolean; vscEnding: number; red: boolean; incidents: unknown[] } },
  show: (id: string, v: boolean) => void,
) {
  const C = F.ctrl
  const formation = C.phase === 'formation' || C.phase === 'gridding'
  const neutralisation = C.sc.active || C.vsc || C.vscEnding > 0 || C.red || C.incidents.length > 0
  const b = $('bSkipF')
  b.textContent = neutralisation ? 'Skip' : 'Passer le tour de formation ›'
  show('bSkipF', formation || neutralisation)
}

export function wireSkipButton(
  getField: () => { ctrl: { sc: { active: boolean }; vsc: boolean; vscEnding: number; red: boolean; incidents: unknown[]; skipSafety: () => boolean } } | null | undefined,
  skipFormation: () => void,
  toast: (msg: string, ms: number) => void,
  setScreen: (s: string) => void,
) {
  $('bSkipF').addEventListener('click', () => {
    const F = getField()
    const C = F?.ctrl
    if (!F || !C) return
    const neutralisation = C.sc.active || C.vsc || C.vscEnding > 0 || C.red || C.incidents.length > 0
    if (neutralisation) {
      if (C.skipSafety()) { toast('Neutralisation passée · la course reprend', 2200); setScreen('drive') }
    } else skipFormation()
  })
}
