/** Bouton Skip : tour de formation et neutralisations SC / VSC / rouge / jaune. */

type SkipController = {
  phase: string
  sc: { active: boolean }
  vsc: boolean
  vscEnding: number
  red: boolean
  incidents: unknown[]
  skipSafety: () => boolean
}

type SkipField = { ctrl: SkipController }

type NeutralisationState = Pick<SkipController, 'sc' | 'vsc' | 'vscEnding' | 'red' | 'incidents'>

export function hasActiveNeutralisation(C: NeutralisationState) {
  return C.sc.active || C.vsc || C.vscEnding > 0 || C.red || C.incidents.length > 0
}

export function syncRaceSkipButton(
  F: { ctrl: Pick<SkipController, 'phase' | 'sc' | 'vsc' | 'vscEnding' | 'red' | 'incidents'> },
  show: (id: string, visible: boolean) => void,
) {
  const C = F.ctrl
  const formation = C.phase === 'formation' || C.phase === 'gridding'
  const neutralisation = hasActiveNeutralisation(C)
  const button = document.getElementById('bSkipF')
  const label = neutralisation ? 'Skip' : 'Passer le tour de formation ›'
  if (button && button.textContent !== label) button.textContent = label
  show('bSkipF', formation || neutralisation)
}

export function wireSkipButton(
  getField: () => SkipField | null | undefined,
  skipFormation: () => void,
  toast: (message: string, durationMs: number) => void,
  resumeDrive: () => void,
) {
  document.getElementById('bSkipF')?.addEventListener('click', () => {
    const F = getField()
    const C = F?.ctrl
    if (!F || !C) return
    if (hasActiveNeutralisation(C)) {
      if (C.skipSafety()) {
        toast('Neutralisation passée · la course reprend', 2200)
        resumeDrive()
      }
    } else skipFormation()
  })
}
