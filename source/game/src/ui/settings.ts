/** Réglages persistants (localStorage) : voiture, aides, commandes, qualité, audio. */
import { defaultSetup, type Setup } from '../physics/vehicle.ts'
import type { ErsMode } from '../physics/powertrain.ts'
import { defaultInput, type InputSettings } from '../controls/input.ts'
import { defaultQuality, type QualityName } from '../quality/quality.ts'
import type { CamMode } from '../render/cameras.ts'
import { defaultProfile, type Profile } from './menu.ts'
export interface Settings {
  setup: Setup; ersMode: ErsMode; input: InputSettings; quality: QualityName; adaptive: boolean
  volume: number; muted: boolean; music: boolean; musicVol: number; weather: 'dry' | 'damp' | 'wet' | 'rain'; blanketF: number; blanketR: number; damage: 'off' | 'visual' | 'real'; radio: boolean; radioVol: number; camera: CamMode; perf: boolean; autoDrs: boolean; haptics: boolean
  /** lot 7 : choix du menu (pilote, circuit, voiture, mode, tours, durées du week-end) */
  profile: Profile
}
const KEY = 'w11.settings.v1'
export function loadSettings(): Settings {
  const d: Settings = { setup: defaultSetup(), ersMode: 'hotlap', input: defaultInput(), quality: defaultQuality(), adaptive: true,
    volume: 0.8, muted: false, music: true, musicVol: 0.7, weather: 'dry', blanketF: 100, blanketR: 80, damage: 'real', radio: true, radioVol: 0.9, camera: 'chase', perf: false, autoDrs: false, haptics: true, profile: defaultProfile() }
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Settings> | null
    // v2 (9 nov.) : la qualité enregistrée par les versions précédentes (souvent abaissée après un faux plantage) repart au maximum
    if (s && !(s as { v?: number }).v) { s.quality = d.quality; s.adaptive = true }
    if (s) return { ...d, ...s, v: 2, setup: { ...d.setup, ...(s.setup ?? {}) }, input: { ...d.input, ...(s.input ?? {}) }, profile: { ...d.profile, ...(s.profile ?? {}) } } as Settings
  } catch { /* stockage indisponible */ }
  return d
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify({ ...s, v: 2 })) } catch { /* mode privé */ } }
