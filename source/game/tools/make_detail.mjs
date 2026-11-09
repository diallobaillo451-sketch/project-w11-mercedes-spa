// Textures de détail CC0 (ambientCG Gravel023 / Grass001) → 1024² WebP + KTX2 UASTC (public/assets/detail/)
// couleur × AO (une seule texture), normale OpenGL. Usage : node tools/make_detail.mjs
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const D = '/workspace/w11-shared/downloads', O = new URL('../public/assets/detail/', import.meta.url).pathname
const K = '/workspace/tools/ktx/KTX-Software-4.4.2-Linux-x86_64'
mkdirSync(O, { recursive: true })
const set = [['gravel', D + '/gravier_bac/ambientcg_Gravel023_2K-JPG/Gravel023_2K-JPG_'], ['grass', D + '/herbe/ambientcg_Grass001_2K-JPG/Grass001_2K-JPG_']]
for (const [n, p] of set) {
  const ao = await sharp(p + 'AmbientOcclusion.jpg').resize(1024, 1024).greyscale().raw().toBuffer()
  const col = await sharp(p + 'Color.jpg').resize(1024, 1024).removeAlpha().raw().toBuffer()
  for (let i = 0; i < 1024 * 1024; i++) { const a = 0.35 + 0.65 * ao[i] / 255; for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.round(col[i * 3 + c] * a) }
  const colImg = sharp(col, { raw: { width: 1024, height: 1024, channels: 3 } })
  await colImg.clone().webp({ quality: 88 }).toFile(O + n + '_col.webp'); await colImg.clone().png().toFile('/tmp/' + n + '_col.png')
  await sharp(p + 'NormalGL.jpg').resize(1024, 1024).webp({ quality: 92 }).toFile(O + n + '_nrm.webp'); await sharp(p + 'NormalGL.jpg').resize(1024, 1024).png().toFile('/tmp/' + n + '_nrm.png')
  for (const [k, lin] of [['col', false], ['nrm', true]]) {
    execFileSync(K + '/bin/ktx', ['create', '--format', lin ? 'R8G8B8A8_UNORM' : 'R8G8B8A8_SRGB', '--assign-tf', lin ? 'linear' : 'srgb', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '19', '--generate-mipmap', '--threads', '8', '/tmp/' + n + '_' + k + '.png', O + n + '_' + k + '.ktx2'], { env: { ...process.env, LD_LIBRARY_PATH: K + '/lib' } })
  }
  console.log('ok', n)
}
