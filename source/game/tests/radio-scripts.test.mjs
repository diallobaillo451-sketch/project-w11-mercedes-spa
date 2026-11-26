import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(game, 'src/audio/radio-scripts.json'), 'utf8'))
const index = JSON.parse(fs.readFileSync(path.join(game, 'public/radio/scriptbank.json'), 'utf8'))
const audio = fs.readFileSync(path.join(game, 'public/radio/scriptbank.bin'))
const lines = manifest.categories.flatMap(c => c.lines)
assert.equal(manifest.categories.length, 35, '35 radio situations expected')
assert.equal(lines.length, 350, '350 authored radio lines expected')
assert.equal(new Set(lines).size, 350, 'every radio line should be unique')
assert.equal(Object.keys(index.messages).length, manifest.categories.length, 'all categories need a packed message')
let nextOffset = 0, count = 0
for (const category of manifest.categories) {
  const id = `script_${category.id}`, msg = index.messages[id]
  assert.ok(msg, `missing message ${id}`)
  assert.equal(msg.cat, category.id)
  assert.equal(msg.role, category.role)
  assert.equal(msg.p, category.priority)
  assert.equal(msg.v.length, category.lines.length)
  msg.v.forEach((v, i) => {
    assert.equal(v.t, category.lines[i], `${id} variant ${i} text mismatch`)
    assert.equal(v.r[0], nextOffset, `${id} variant ${i} offset mismatch`)
    assert.ok(v.r[1] > 1024, `${id} variant ${i} audio is unexpectedly small`)
    assert.ok(v.r[0] + v.r[1] <= audio.length, `${id} variant ${i} audio range out of bounds`)
    assert.equal(audio.toString('ascii', v.r[0] + 4, v.r[0] + 8), 'ftyp', `${id} variant ${i} is not a self-contained M4A clip`)
    nextOffset += v.r[1]
    count++
  })
}
assert.equal(count, 350)
assert.equal(nextOffset, audio.length, 'all bytes in the script bank must be referenced')
console.log(`radio scripts OK: ${manifest.categories.length} situations, ${count} voice clips, ${audio.length} bytes`)
