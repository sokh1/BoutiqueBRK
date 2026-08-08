// Service worker de Boutique B.R.K : met en cache l'interface (app shell) pour un chargement
// rapide et un fonctionnement hors-ligne, mais laisse TOUJOURS passer les appels vers l'API
// Google Apps Script (script.google.com) directement au réseau, pour ne jamais afficher de
// données périmées quand une connexion est disponible.
const CACHE_NAME = 'boutique-brk-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('Mise en cache initiale partielle :', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ne jamais intercepter les appels API (Google Apps Script / Google Sheets / Drive) : toujours
  // du réseau frais, jamais de cache, pour garder les données à jour.
  if (req.url.includes('script.google.com') || req.url.includes('googleusercontent.com')) {
    return;
  }

  // Seules les requêtes GET sont mises en cache (les POST de synchronisation ne le sont jamais).
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      // Sert le cache immédiatement si disponible (rapide + fonctionne hors-ligne), tout en
      // rafraîchissant le cache en arrière-plan dès que le réseau répond.
      return cached || networkFetch;
    })
  );
});
