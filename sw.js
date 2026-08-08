// Service worker de Boutique B.R.K : met en cache l'interface (app shell) pour un chargement
// rapide et un fonctionnement hors-ligne, mais laisse TOUJOURS passer les appels vers l'API
// Google Apps Script (script.google.com) directement au réseau, pour ne jamais afficher de
// données périmées quand une connexion est disponible.
//
// v2 : la page HTML principale (index.html / navigation) passe désormais en stratégie
// "réseau EN PRIORITÉ, cache en repli" au lieu de "cache en priorité, réseau en arrière-plan".
// Avec l'ancienne stratégie, après chaque mise à jour de l'appli, la version PÉRIMÉE restait
// affichée à la réouverture (le réseau ne rafraîchissait le cache qu'EN ARRIÈRE-PLAN, pour la
// PROCHAINE ouverture) — ce qui a fait croire que des correctifs déjà livrés n'étaient pas
// pris en compte. Le cache ne sert plus que de repli hors-ligne pour la page principale ; les
// autres ressources statiques (icônes, manifest) restent en cache-d'abord pour rester rapides.
const CACHE_NAME = 'boutique-brk-v2';
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

  // Page HTML principale (ouverture de l'appli / navigation) : RÉSEAU EN PRIORITÉ. On ne sert
  // le cache que si le réseau échoue (mode hors-ligne), afin que toute mise à jour livrée de
  // l'appli soit visible dès la prochaine ouverture avec connexion — jamais une version figée.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Autres ressources (icônes, manifest...) : cache d'abord pour la rapidité, rafraîchies en
  // arrière-plan dès que le réseau répond — ces fichiers changent rarement, le risque de
  // "version figée" gênante y est négligeable.
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
      return cached || networkFetch;
    })
  );
});
