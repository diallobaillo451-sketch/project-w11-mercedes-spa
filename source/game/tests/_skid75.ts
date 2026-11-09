import { Vehicle } from '../src/physics/vehicle.ts'
import { FlatSurface } from '../src/track/surface.ts'
const V = Number(process.env.V ?? 75)
const car = new Vehicle(new FlatSurface()); car.setup.steerAssist = 0; car.setup.stability = 0
car.placeAt(0, 0, V)
const DT = 1 / 240
for (let i = 0; i < 240 * 2; i++) {
  const t = i * DT, v = car.forwardSpeed(), err = V - v
  const throttle = Math.max(0, Math.min(1, 0.3 + err * 0.3)), brake = err < -1 ? Math.min(1, -err * 0.1) : 0
  const steer = Math.min(1, t / 9) * 0.5
  car.step(DT, { throttle, brake, steer, drs: false })
  if (i % 12 === 0) { const w = car.wheels; console.log(t.toFixed(2), 'v', v.toFixed(1), 'wb', car.wb.map((q: number) => q.toFixed(2)).join(','), 'fz', w.map(x => (x.fz / 1000).toFixed(1)).join('/'), 'a', w.map(x => x.alpha.toFixed(3)).join('/'), 'k', w.map(x => x.kappa.toFixed(3)).join('/'), 'thr', throttle.toFixed(2)) }
}
