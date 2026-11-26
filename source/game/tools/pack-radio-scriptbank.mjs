import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const game = path.resolve(here, '..')
const manifestPath = path.join(game, 'src/audio/radio-scripts.json')
const clipDir = path.resolve(process.argv[2] || '/workspace/w11-radio-tts/clips')
const outDir = path.join(game, 'public/radio')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const chunks = [], index = { messages: {} }
let offset = 0, clipNo = 0

for (const category of manifest.categories) {
  const variants = []
  for (const text of category.lines) {
    const file = path.join(clipDir, `clip_${String(clipNo).padStart(3, '0')}.m4a`)
    if (!fs.existsSync(file)) throw new Error(`Clip manquant : ${file}`)
    const audio = fs.readFileSync(file)
    if (audio.length < 1024) throw new Error(`Clip trop petit : ${file}`)
    chunks.push(audio)
    variants.push({ r: [offset, audio.length], t: text, ms: Math.max(700, Math.round(text.trim().split(/\s+/).length * 230)) })
    offset += audio.length
    clipNo++
  }
  index.messages[`script_${category.id}`] = { p: category.priority, cat: category.id, role: category.role, v: variants }
}

const expected = manifest.categories.reduce((n, c) => n + c.lines.length, 0)
if (clipNo !== expected || expected !== 350) throw new Error(`Nombre de clips inattendu : ${clipNo}/${expected}`)
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'scriptbank.bin'), Buffer.concat(chunks))
fs.writeFileSync(path.join(outDir, 'scriptbank.json'), JSON.stringify(index))
console.log(`scriptbank : ${Object.keys(index.messages).length} catégories, ${clipNo} variantes, ${offset} octets`)
