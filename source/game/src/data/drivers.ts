/** Grille 2020 : 20 pilotes titulaires, 10 équipes (données dans drivers2020.json, partagées avec tools/drivers_paint.py). */
import data from './drivers2020.json'
export interface Team { name: string; short: string; c1: string; c2: string; c3: string; chest: string; chest2: string }
export interface Driver { id: string; first: string; last: string; num: number; team: string; nat: string; flag: string[]; original?: boolean }
export const TEAMS = data.teams as Record<string, Team>
export const DRIVERS = data.drivers as Driver[]
export const driverById = (id: string) => DRIVERS.find(d => d.id === id) ?? DRIVERS[0]
/** couleur d'accent lisible pour l'interface (la 1re couleur des équipes sombres est noire / bleu nuit) */
export const teamAccent = (t: string) => ({ mercedes: '#00d2be', ferrari: '#dc0000', redbull: '#3671c6', mclaren: '#ff8700', renault: '#fff500', alphatauri: '#c8d1db', racingpoint: '#f596c8', alfaromeo: '#a6051a', haas: '#b6babd', williams: '#00a3e0' } as Record<string, string>)[t] ?? '#ffffff'
/** calendrier 2020 (17 manches) : Spa disponible, les autres circuits arrivent avec les assets de Baillo */
export interface Circuit { id: string; name: string; gp: string; country: string; km: number; laps: number; available: boolean; round: number }
export const CIRCUITS: Circuit[] = [
  ['aut', 'Red Bull Ring', 'Autriche', 'AUT', 4.318, 71], ['sty', 'Red Bull Ring', 'Styrie', 'AUT', 4.318, 71], ['hun', 'Hungaroring', 'Hongrie', 'HUN', 4.381, 70],
  ['gbr', 'Silverstone', 'Grande-Bretagne', 'GBR', 5.891, 52], ['70a', 'Silverstone', '70e anniversaire', 'GBR', 5.891, 52], ['esp', 'Barcelone-Catalogne', 'Espagne', 'ESP', 4.655, 66],
  ['bel', 'Spa-Francorchamps', 'Belgique', 'BEL', 7.004, 44], ['ita', 'Monza', 'Italie', 'ITA', 5.793, 53], ['tus', 'Mugello', 'Toscane', 'ITA', 5.245, 59],
  ['rus', 'Sotchi', 'Russie', 'RUS', 5.848, 53], ['eif', 'Nürburgring', 'Eifel', 'GER', 5.148, 60], ['por', 'Portimão', 'Portugal', 'POR', 4.653, 66],
  ['emi', 'Imola', 'Émilie-Romagne', 'ITA', 4.909, 63], ['tur', 'Istanbul Park', 'Turquie', 'TUR', 5.338, 58], ['bhr', 'Sakhir', 'Bahreïn', 'BHR', 5.412, 57],
  ['skh', 'Sakhir (Outer)', 'Sakhir', 'BHR', 3.543, 87], ['abu', 'Yas Marina', 'Abou Dabi', 'UAE', 5.554, 55],
].map(([id, name, gp, country, km, laps], i) => ({ id: id as string, name: name as string, gp: gp as string, country: country as string, km: km as number, laps: laps as number, available: id === 'bel', round: i + 1 }))
export interface Car { id: string; name: string; team: string; available: boolean }
export const CARS: Car[] = [{ id: 'w11', name: 'Mercedes-AMG F1 W11 EQ Performance', team: 'mercedes', available: true },
  ...['ferrari', 'redbull', 'mclaren', 'renault', 'alphatauri', 'racingpoint', 'alfaromeo', 'haas', 'williams'].map(t => ({ id: t, name: ({ ferrari: 'Ferrari SF1000', redbull: 'Red Bull RB16', mclaren: 'McLaren MCL35', renault: 'Renault R.S.20', alphatauri: 'AlphaTauri AT01', racingpoint: 'Racing Point RP20', alfaromeo: 'Alfa Romeo C39', haas: 'Haas VF-20', williams: 'Williams FW43' } as Record<string, string>)[t], team: t, available: false }))]
