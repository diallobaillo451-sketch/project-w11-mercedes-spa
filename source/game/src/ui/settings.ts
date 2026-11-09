/** Réglages persistants (localStorage) : voiture, aides, commandes, qualité, audio. */
import { defaultSetup, type Setup } from '../physics/vehicle.ts'
import type { ErsMode } from '../physics/powertrain.ts'
import { defaultInput, type InputSettings } from '../controls/input.ts'
import { defaultQuality, type QualityName } from '../quality/quality.ts'
import type { CamMode } from '../render/cameras.ts'
export interface Settings {
  setup: Setup; ersMode: ErsMode; input: InputSettings; quality: QualityName; adaptive: boolean
  volume: number; muted: boolean; camera: CamMode; perf: boolean; autoDrs: boolean; haptics: boolean
}
const KEY = 'w11.settings.v1'
export function loadSettings(): Settings {
  const d: Settings = { setup: defaultSetup(), ersMode: 'hotlap', input: defaultInput(), quality: defaultQuality(), adaptive: true,
    volume: 0.8, muted: false, camera: 'chase', perf: false, autoDrs: false, haptics: true }
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Settings> | null
    if (s) return { ...d, ...s, setup: { ...d.setup, ...(s.setup ?? {}) }, input: { ...d.input, ...(s.input ?? {}) } }
  } catch { /* stockage indisponible */ }
  return d
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* mode privé */ } }
