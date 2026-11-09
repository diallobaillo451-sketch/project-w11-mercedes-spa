// Prépare /workspace/w11/publish (méthode f1sg) — NE PUBLIE RIEN.
// public/ = dist/ ; fichiers > 5 Mo découpés en morceaux de 4,5 Mo dans parts/ ; tout est stocké encodé en base64
// (contrainte de l'outil d'envoi) ; la CI GitLab décode, réassemble et vérifie le SHA-256 de chaque fichier final.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const SRC = 'dist', P = '../publish', LIM = 5 * 1024 * 1024, CH = 4.5 * 1024 * 1024
fs.rmSync(P, { recursive: true, force: true }); fs.mkdirSync(P + '/public', { recursive: true }); fs.mkdirSync(P + '/parts')
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
const sums = [], joins = []
const put = (rel, buf) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const b = buf.toString('base64'); fs.writeFileSync(f, b) }
for (const f of walk(SRC)) {
  const rel = path.relative(SRC, f).split(path.sep).join('/'), buf = fs.readFileSync(f)
  sums.push(crypto.createHash('sha256').update(buf).digest('hex') + '  public/' + rel)
  if (buf.length <= LIM) { put('public/' + rel, buf); continue }
  const name = rel.replace(/\//g, '__'), parts = []
  for (let o = 0, k = 0; o < buf.length; o += CH, k++) { const pn = `parts/${name}.part${String(k).padStart(2, '0')}`; put(pn, buf.subarray(o, o + CH)); parts.push(pn) }
  joins.push(`    - mkdir -p "$(dirname public/${rel})" && cat ${parts.join(' ')} > public/${rel}`)
}
fs.writeFileSync(P + '/SHA256SUMS', sums.join('\n') + '\n')
fs.writeFileSync(P + '/.gitlab-ci.yml', `# GitLab Pages : publie public/ (build Vite, base './'). Fichiers stockés EN BASE64 ; gros fichiers découpés dans parts/.
# La CI décode, réassemble, puis vérifie TOUT par SHA-256 (SHA256SUMS).
pages:
  stage: deploy
  image: alpine:3.20
  script:
    - find public parts -type f | while read f; do base64 -d "$f" > "$f.bin" && mv "$f.bin" "$f"; done
${joins.join('\n')}
    - sha256sum -c SHA256SUMS
    - du -sh public
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
`)
fs.copyFileSync('../publish_README.md', P + '/README.md')
console.log('publish prêt :', sums.length, 'fichiers,', joins.length, 'découpés')
