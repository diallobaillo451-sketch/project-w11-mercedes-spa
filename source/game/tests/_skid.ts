import { Vehicle } from '../src/physics/vehicle.ts'
import { FlatSurface } from '../src/track/surface.ts'
for (const V of [20, 30, 45, 60, 75]) {
  const car = new Vehicle(new FlatSurface()); car.setup.steerAssist = 0; car.setup.stability = 0
  car.placeAt(0, 0, V)
  let best = 0, info = ''
  const DT = 1 / 240
  for (let i = 0; i < 240 * 10; i++) {
    const t = i * DT
    const v = car.forwardSpeed()
    const err = V - v
    const throttle = Math.max(0, Math.min(1, 0.3 + err * 0.3)), brake = err < -1 ? Math.min(1, -err * 0.1) : 0
    const steer = Math.min(1, t / 9) * (V < 35 ? 1 : 0.5)
    car.step(DT, { throttle, brake, steer, drs: false })
    const ay = Math.abs(car.wb[1]) * v / 9.81
    if (t > 1 && ay > best && Math.abs(err) < 2) { best = ay; const w = car.wheels; info = `t ${t.toFixed(1)} st ${steer.toFixed(2)} aF ${((w[0].alpha + w[1].alpha) / 2).toFixed(3)} aR ${((w[2].alpha + w[3].alpha) / 2).toFixed(3)} fz ${w.map(x => (x.fz / 1000).toFixed(1)).join('/')} thr ${throttle.toFixed(2)} k ${w.map(x=>x.kappa.toFixed(3)).join('/')} T ${w.map(x=>x.tyre.tc?.toFixed?.(0) ?? '').join('/')}` }
  }
  console.log('V', V, 'max ay g', best.toFixed(2), info)
}
