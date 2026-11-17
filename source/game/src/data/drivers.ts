/** Grille 2020 : 20 pilotes titulaires, 10 équipes (données dans drivers2020.json, partagées avec tools/drivers_paint.py). */
import data from './drivers2020.json'
import { isCircuitAvailable, trackForGrandPrix } from '../core/circuit.ts'
export interface Team { name: string; short: string; c1: string; c2: string; c3: string; chest: string; chest2: string }
export interface Driver { id: string; first: string; last: string; num: number; team: string; nat: string; flag: string[]; original?: boolean }
export const TEAMS = data.teams as Record<string, Team>
export const DRIVERS = data.drivers as Driver[]
export const driverById = (id: string) => DRIVERS.find(d => d.id === id) ?? DRIVERS[0]
/** couleur d'accent lisible pour l'interface (la 1re couleur des équipes sombres est noire / bleu nuit) */
export const teamAccent = (t: string) => ({ mercedes: '#00d2be', ferrari: '#dc0000', redbull: '#3671c6', mclaren: '#ff8700', renault: '#fff500', alphatauri: '#c8d1db', racingpoint: '#f596c8', alfaromeo: '#a6051a', haas: '#b6babd', williams: '#00a3e0' } as Record<string, string>)[t] ?? '#ffffff'
/** Calendrier 2020 et circuits ajoutés ; les manches dont le pack n’est pas disponible dans le build restent simulées.
 *  Mugello, Sotchi, Portimão, Istanbul et Sakhir Outer sont retirés. La disponibilité est dérivée des packs assemblés. */
export interface Circuit { id: string; name: string; gp: string; country: string; km: number; laps: number; available: boolean; round: number; career: boolean; night?: boolean; rain: number; air: [number, number] }
const ROWS: [string, string, string, string, number, number, number, number, number, boolean?][] = [
  ['aut', 'Red Bull Ring', 'Autriche', 'AUT', 4.318, 71, 0.28, 14, 26],
  ['sty', 'Red Bull Ring', 'Styrie', 'AUT', 4.318, 71, 0.22, 16, 28],
  ['hun', 'Hungaroring', 'Hongrie', 'HUN', 4.381, 70, 0.18, 22, 32],
  ['gbr', 'Silverstone', 'Grande-Bretagne', 'GBR', 5.891, 52, 0.32, 14, 24],
  ['70a', 'Silverstone', '70e anniversaire', 'GBR', 5.891, 52, 0.28, 15, 26],
  ['esp', 'Barcelone-Catalogne', 'Espagne', 'ESP', 4.655, 66, 0.06, 24, 32],
  ['bel', 'Spa-Francorchamps', 'Belgique', 'BEL', 7.004, 44, 0.45, 12, 22],
  ['ita', 'Monza', 'Italie', 'ITA', 5.793, 53, 0.14, 18, 28],
  ['eif', 'Nürburgring', 'Eifel', 'GER', 5.148, 60, 0.38, 8, 16],
  ['emi', 'Imola', 'Émilie-Romagne', 'ITA', 4.909, 63, 0.3, 12, 20],
  ['bhr', 'Sakhir', 'Bahreïn', 'BHR', 5.412, 57, 0.02, 26, 34, true],
  ['abu', 'Yas Marina', 'Abou Dabi', 'UAE', 5.554, 55, 0.02, 24, 32, true],
  ['mel', 'Albert Park', 'Australie', 'AUS', 5.303, 58, 0.2, 16, 26],
  ['chn', 'Shanghai', 'Chine', 'CHN', 5.451, 56, 0.22, 16, 24],
  ['can', 'Gilles-Villeneuve', 'Canada', 'CAN', 4.361, 70, 0.18, 16, 26],
  ['mgc', 'Magny-Cours', 'France', 'FRA', 4.411, 70, 0.25, 14, 26],
  ['bra', 'Interlagos', 'Brésil', 'BRA', 4.309, 71, 0.35, 18, 28],
  ['sgp', 'Marina Bay', 'Singapour', 'SGP', 5.063, 61, 0.12, 26, 31, true],
  ['mys', 'Sepang', 'Malaisie', 'MYS', 5.543, 56, 0.4, 26, 33],
]
export const CIRCUITS: Circuit[] = ROWS.map(([id, name, gp, country, km, laps, rain, lo, hi, night], i) => ({
  id, name, gp, country, km, laps, rain, air: [lo, hi] as [number, number], night: !!night, career: true,
  available: (() => { const track = trackForGrandPrix(id); return !!track && isCircuitAvailable(track) })(), round: i + 1,
}))
export interface Car { id: string; name: string; team: string; available: boolean }
export const CARS: Car[] = [{ id: 'w11', name: 'Mercedes-AMG F1 W11 EQ Performance', team: 'mercedes', available: true },
  ...['ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams'].map(t => ({ id: t, name: ({ ferrari: 'Ferrari SF1000', redbull: 'Red Bull RB16', mclaren: 'McLaren MCL35', renault: 'Renault R.S.20', alphatauri: 'AlphaTauri AT01', racingpoint: 'Racing Point RP20', alfaromeo: 'Alfa Romeo C39', haas: 'Haas VF-20', williams: 'Williams FW43' } as Record<string, string>)[t], team: t, available: true }))]
export const carOfTeam = (team: string) => CARS.find(c => c.team === team)?.id ?? 'w11'
