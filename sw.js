/* Cuartel General — service worker para que la página abra sin internet
   o con datos móviles lentos.
   - La página (index.html): se intenta bajar la versión nueva; si no hay
     internet o tarda más de 4 segundos, se abre la copia guardada.
   - Firebase y tipografías: se usan de la copia guardada (no cambian).
   - Los datos de Firestore NO pasan por aquí: Firebase ya guarda su propia
     copia en el teléfono. */
const CACHE = 'cg-v1';
const CORE = ['./', './index.html'];
const LIBS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE).catch(() => {});
    await Promise.all(LIBS.map(u =>
      fetch(new Request(u, {mode: 'no-cors'})).then(r => c.put(u, r)).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isPage(req, url) {
  return req.mode === 'navigate' ||
    (url.origin === self.location.origin && /\/(index\.html)?$/.test(url.pathname));
}
function isStatic(url) {
  return (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function pageNetworkFirst(req) {
  const c = await caches.open(CACHE);
  const fromNet = fetch(req).then(r => {
    if (r && r.ok) c.put('./index.html', r.clone());
    return r;
  });
  const timeout = new Promise(res => setTimeout(() => res(null), NET_TIMEOUT_MS));
  try {
    const r = await Promise.race([fromNet, timeout]);
    if (r && r.ok) return r;
  } catch (e) { /* sin internet */ }
  const cached = await c.match('./index.html') || await c.match('./');
  if (cached) return cached;
  return fromNet; // primera vez y sin copia: no queda más que esperar a la red
}

async function staticCacheFirst(req) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req, {ignoreVary: true}) || await c.match(req.url);
  if (cached) return cached;
  const r = await fetch(req);
  if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isPage(req, url)) { e.respondWith(pageNetworkFirst(req)); return; }
  if (isStatic(url)) { e.respondWith(staticCacheFirst(req)); return; }
  /* todo lo demás (Firestore, etc.) va directo a la red como siempre */
});
