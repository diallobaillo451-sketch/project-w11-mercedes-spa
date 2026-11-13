/** Track limits use the circuit's authored white-line widths, not all paved asphalt.
 * Some circuits (including Spa) have asphalt runoff beyond the white line. */
import { W11 } from '../physics/params.ts'
import type { Surface, TrackSurface } from './surface.ts'
export const TRACK_LIMIT_GRACE_SECONDS = 0.25

type WheelContact = { front: boolean; sample: { d: number; i: number; s: number } }

/** A tyre remains on track while any part of its contact width overlaps the white-line boundary. */
export function allWheelsOutsideTrack(wheels: readonly WheelContact[], surface: Pick<Surface, 'edges'>) {
  if (wheels.length < 4) return false
  return wheels.slice(0, 4).every(w => {
    const { d, i, s } = w.sample
    if (!Number.isFinite(d) || !Number.isFinite(i) || !Number.isFinite(s) || i < 0) return false
    const [left, right] = surface.edges(i, s)
    const halfTyre = (w.front ? W11.tyreWidthF : W11.tyreWidthR) / 2
    return d + halfTyre < -left || d - halfTyre > right
  })
}

/** Four tyre footprints for AI cars, simulated in the track's s/d frame. */
export function simulatedCarOutsideTrack(track: TrackSurface, s: number, d: number) {
  const wheels = [
    { along: W11.wheelbase / 2, lateral: -W11.halfTrackF, front: true },
    { along: W11.wheelbase / 2, lateral: W11.halfTrackF, front: true },
    { along: -W11.wheelbase / 2, lateral: -W11.halfTrackR, front: false },
    { along: -W11.wheelbase / 2, lateral: W11.halfTrackR, front: false },
  ]
  return wheels.every(w => {
    const at = s + w.along
    const i = ((Math.round(at / track.ds) % track.N) + track.N) % track.N
    const [left, right] = track.edges(i, at)
    const wheelD = d + w.lateral
    const halfTyre = (w.front ? W11.tyreWidthF : W11.tyreWidthR) / 2
    return wheelD + halfTyre < -left || wheelD - halfTyre > right
  })
}

/** Inclusive signed interval of car-center offsets that keeps all four tyre footprints inside the white lines. */
export function simulatedCarLegalEdges(track: TrackSurface, s: number): [number, number] {
  const front = s + W11.wheelbase / 2, rear = s - W11.wheelbase / 2
  const margin = 0.12 // stay just inside the line despite 1 m longitudinal rasterization
  const iF = ((Math.round(front / track.ds) % track.N) + track.N) % track.N
  const iR = ((Math.round(rear / track.ds) % track.N) + track.N) % track.N
  const [leftF, rightF] = track.edges(iF, front), [leftR, rightR] = track.edges(iR, rear)
  const minimum = Math.max(-leftF + W11.halfTrackF + W11.tyreWidthF / 2, -leftR + W11.halfTrackR + W11.tyreWidthR / 2) + margin
  const maximum = Math.min(rightF - W11.halfTrackF - W11.tyreWidthF / 2, rightR - W11.halfTrackR - W11.tyreWidthR / 2) - margin
  return [minimum, maximum]
}

/** Clamp a car-center offset to [minimum, maximum], including intervals not centered on the track reference. */
export function clampToLegalCenterOffset(d: number, bounds: readonly [number, number]) {
  const [minimum, maximum] = bounds
  return minimum <= maximum ? Math.max(minimum, Math.min(maximum, d)) : (minimum + maximum) / 2
}
