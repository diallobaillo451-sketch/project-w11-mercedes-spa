// Service worker PROJECT W11 : cache-first pour les ressources (GLB, textures, audio, JS), réseau d'abord pour la page.
// Note iOS : Safari peut purger ce cache après quelques semaines sans utilisation ; pas de mise à jour en arrière-plan.
// v3 : piste pleine qualité en tuiles (assets/spa/*) mises en cache à mesure qu'elles arrivent → jeu complet hors ligne
// après une première session ; tiles.json en réseau d'abord (mise à jour), le reste en cache d'abord.
const V = 'w11-v10'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './assets/spa/tiles.json']).catch(() => {}))) })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin || r.headers.has('range')) return
  if (r.mode === 'navigate' || r.url.endsWith('/tiles.json')) { e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : m)))); return }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)) } return res })))
})
