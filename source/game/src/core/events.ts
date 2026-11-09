/** Bus d'événements de course (radio équipe, HUD, volant, futur mode course multi-voitures).
 *  Chaque événement porte l'id de la voiture (0 = joueur) pour accueillir plus tard tout le plateau 2020. */
export type RaceEvent =
  | { t: 'lap'; car: number; time: number; valid: boolean; best: boolean }
  | { t: 'sector'; car: number; n: number }
  | { t: 'invalid'; car: number; warnings: number }
  | { t: 'flag'; car: number; flag: string }
  | { t: 'impact'; car: number; k: number; kind: number }
  | { t: 'damage'; car: number; total: number }
  | { t: 'pitEntry'; car: number } | { t: 'pitExit'; car: number }
  | { t: 'pitSpeeding'; car: number; kmh: number; penalty: number }
  | { t: 'reset'; car: number }
type Fn = (e: RaceEvent) => void
export class EventBus {
  private fns = new Map<string, Set<Fn>>()
  on(t: RaceEvent['t'] | '*', f: Fn) { let s = this.fns.get(t); if (!s) this.fns.set(t, s = new Set()); s.add(f); return () => s!.delete(f) }
  emit(e: RaceEvent) { this.fns.get(e.t)?.forEach(f => f(e)); this.fns.get('*')?.forEach(f => f(e)) }
}
