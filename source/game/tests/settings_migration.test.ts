import { loadSettings, saveSettings } from '../src/ui/settings.ts'

function assert(ok: boolean, message: string) { if (!ok) throw new Error(message) }
const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
})

values.set('w11.settings.v1', JSON.stringify({ v: 2, profile: { driver: 'ham', difficulty: 42 } }))
const migrated = loadSettings()
assert(migrated.profile.difficulty === 100, 'un ancien profil doit être migré une fois à difficulté maximale')
assert(migrated.profile.driver === 'ham', 'la migration conserve les autres choix du profil')
saveSettings(migrated)
assert(JSON.parse(values.get('w11.settings.v1')!).v === 3, 'la migration est marquée comme version 3')
migrated.profile.difficulty = 65
saveSettings(migrated)
assert(loadSettings().profile.difficulty === 65, 'un choix manuel ultérieur reste enregistré')
console.log('OK : migration de difficulté persistante')
