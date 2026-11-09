// Génère les icônes PWA (gratuit : sharp + SVG). Usage : node tools/make-icons.mjs
import sharp from 'sharp'
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1d21"/><stop offset="1" stop-color="#050506"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00d2be"/><stop offset="1" stop-color="#00a19c"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<path d="M40 330 L472 250 L472 282 L40 362 Z" fill="url(#t)"/>
<path d="M40 378 L472 298 L472 306 L40 386 Z" fill="#c8ccd2" opacity=".7"/>
<text x="256" y="250" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="190" fill="#f2f4f6" letter-spacing="-6">W11</text>
<text x="256" y="452" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" fill="#9aa3ad" letter-spacing="8">SPA 2020</text></svg>`
for (const s of [180, 192, 512]) await sharp(Buffer.from(svg(s))).png().toFile(`public/icons/icon-${s}.png`)
await sharp(Buffer.from(svg(512).replace('<rect width="512" height="512"', '<rect width="512" height="512"'))).resize(512).png().toFile('public/icons/icon-maskable-512.png')
console.log('icônes OK')
