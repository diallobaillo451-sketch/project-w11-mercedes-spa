import assert from 'node:assert/strict'
import { aiDifficultyTuning } from '../src/race/ai-difficulty.ts'

const novice = aiDifficultyTuning(40)
const standard = aiDifficultyTuning(85)
const expert = aiDifficultyTuning(100)

assert.equal(novice.value, 40)
assert.equal(expert.value, 100)
assert.ok(novice.pace < standard.pace && standard.pace < expert.pace, 'pace must rise with difficulty')
assert.ok(novice.overtakeMargin > standard.overtakeMargin && standard.overtakeMargin > expert.overtakeMargin,
  'stronger drivers should need less speed advantage to attempt a safe pass')
assert.ok(novice.attackDuration < standard.attackDuration && standard.attackDuration < expert.attackDuration,
  'attack commitment must rise with difficulty')
assert.ok(novice.mistakeMultiplier > standard.mistakeMultiplier && standard.mistakeMultiplier > expert.mistakeMultiplier,
  'mistake frequency must fall with difficulty')
assert.ok(novice.strategyAggression < standard.strategyAggression && standard.strategyAggression < expert.strategyAggression,
  'strategy aggression must rise with difficulty')
assert.ok(novice.strategyMargin > standard.strategyMargin && standard.strategyMargin > expert.strategyMargin,
  'stronger strategists should accept smaller expected pit-stop gains')
assert.equal(aiDifficultyTuning(-5).value, 40, 'lower values must clamp to the menu minimum')
assert.equal(aiDifficultyTuning(500).value, 100, 'higher values must clamp to the menu maximum')
assert.equal(aiDifficultyTuning(Number.NaN).value, 85, 'invalid values must use the default setting')
assert.ok(expert.pace <= 1.03 && expert.mistakeMultiplier >= 0.5, 'expert tuning must stay inside safe bounds')
console.log('AI difficulty tests passed: pace, tactics, strategy, mistakes, and bounds')
