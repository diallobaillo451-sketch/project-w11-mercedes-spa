import assert from 'node:assert/strict'
import { CarLODManager, HD_BUDGET, type CarLODInput } from '../src/render/carLODManager.ts'

const car = (id: string, distance: number, options: Partial<CarLODInput> = {}): CarLODInput => ({
  id,
  distanceSq: distance * distance,
  visible: true,
  hasHD: true,
  lod1Distance: 120,
  lod2Distance: 450,
  ...options,
})

for (const [quality, budget] of Object.entries(HD_BUDGET)) {
  const manager = new CarLODManager()
  const cars = Array.from({ length: 10 }, (_, i) => car(`c${i}`, 5 + i * 2))
  const selected = manager.update(cars, quality)
  assert.equal([...selected.values()].filter(tier => tier === 0).length, budget, `${quality} HD budget`)
  assert.equal(selected.get('c0'), 0, `${quality} nearest car is HD`)
}

{
  const manager = new CarLODManager()
  const result = manager.update([
    car('offscreen', 2, { visible: false }),
    car('no-hd', 3, { hasHD: false }),
    car('onscreen', 12),
  ], 'ultra')
  assert.equal(result.get('offscreen'), 1, 'offscreen cars do not consume HD budget')
  assert.equal(result.get('no-hd'), 1, 'teams without HD fall back to LOD1')
  assert.equal(result.get('onscreen'), 0)
}

{
  const manager = new CarLODManager()
  assert.equal(manager.update([car('front', 30), car('challenger', 31)], 'low').get('front'), 0)
  // The current HD owner is retained through the 12% exit band.
  assert.equal(manager.update([car('front', 40), car('challenger', 37)], 'low').get('front'), 0)
  // Once beyond the exit band, the closer challenger takes the slot.
  const switched = manager.update([car('front', 42), car('challenger', 30)], 'low')
  assert.equal(switched.get('front'), 1)
  assert.equal(switched.get('challenger'), 0)
}

{
  const manager = new CarLODManager()
  assert.equal(manager.update([car('x', 119)], 'low').get('x'), 1)
  assert.equal(manager.update([car('x', 130)], 'low').get('x'), 1, 'LOD1 exit hysteresis')
  assert.equal(manager.update([car('x', 140)], 'low').get('x'), 2)
  assert.equal(manager.update([car('x', 110)], 'low').get('x'), 2, 'LOD2 entry hysteresis')
  assert.equal(manager.update([car('x', 100)], 'low').get('x'), 1)
  assert.equal(manager.update([car('x', 200)], 'low').get('x'), 2)
  assert.equal(manager.update([car('x', 460)], 'low').get('x'), 2)
  assert.equal(manager.update([car('x', 510)], 'low').get('x'), 3, 'LOD3 culling')
  assert.equal(manager.update([car('x', 430)], 'low').get('x'), 3, 'LOD3 return hysteresis')
  assert.equal(manager.update([car('x', 390)], 'low').get('x'), 2)
}

console.log('car_lod_manager: ok')
