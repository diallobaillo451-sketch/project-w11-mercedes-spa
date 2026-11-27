/** Shared difficulty tuning for opponent driving. Difficulty is fixed for the session; there is no rubberbanding. */
export interface AIDifficultyTuning {
  value: number
  level: number
  pace: number
  overtakeMargin: number
  attackDuration: number
  mistakeMultiplier: number
  strategyAggression: number
  strategyMargin: number
}

const MIN_DIFFICULTY = 40
const MAX_DIFFICULTY = 100

/** Convert the menu's 40–100 difficulty into consistent driving traits. */
export function aiDifficultyTuning(rawDifficulty: number): AIDifficultyTuning {
  const value = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY,
    Number.isFinite(rawDifficulty) ? rawDifficulty : 85))
  const level = (value - MIN_DIFFICULTY) / (MAX_DIFFICULTY - MIN_DIFFICULTY)
  return {
    value,
    level,
    pace: 0.94 + 0.09 * level,
    overtakeMargin: 1.25 - 1.0 * level,
    attackDuration: 1.2 + 0.6 * level,
    mistakeMultiplier: 1.12 - 0.57 * level,
    strategyAggression: 0.71 + 0.24 * level,
    strategyMargin: 2.3 - 1.5 * level,
  }
}
