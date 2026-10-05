/* Service worker : chaque ouverture vérifie auprès du serveur si les fichiers
   ont changé (requête conditionnelle) ; la dernière version reçue sert de
   secours hors ligne. L'app-shell est aussi pré-mis en cache à l'installation,
   pour qu'un tout premier lancement hors ligne affiche l'app au lieu d'un
   écran blanc. Les bibliothèques d'import (vendor/ : pdf.js, SheetJS) ne
   sont pas pré-chargées : elles sont mises en cache au premier import. */
const CACHE = 'ma-maison-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './apple-touch-icon.png',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/styles.css',
  './css/theme.css',
  './css/tokens.css',
  './css/views/maison.css',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './js/config/firebase-config.js',
  './js/core/calc.js',
  './js/core/dates.js',
  './js/core/schema.js',
  './js/core/season-tasks.js',
  './js/core/store.js',
  './js/core/utils.js',
  './js/core/validation.js',
  './js/features/amortization-import.js',
  './js/features/overdue-prompt.js',
  './js/main.js',
  './js/services/carnet-sync.js',
  './js/services/files.js',
  './js/services/firebase.js',
  './js/services/storage.js',
  './js/ui/charts.js',
  './js/ui/dialog.js',
  './js/ui/icons.js',
  './js/ui/status.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/charges.js',
  './js/views/common.js',
  './js/views/docs.js',
  './js/views/home.js',
  './js/views/house.js',
  './js/views/inventory.js',
  './js/views/maintenance.js',
  './js/views/project.js',
  './js/views/resale.js',
  './js/views/season.js',
  './js/views/works.js',
  './manifest.webmanifest'
];

async function precache() {
  const cache = await caches.open(CACHE);
  // addAll échouerait en bloc au premier fichier manquant : chaque échec est isolé.
  await Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn('[sw] précache échoué:', url, err))));
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase, polices… : non concernés.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
