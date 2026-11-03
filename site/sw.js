const CACHE_NAME = 'galleryweb-shell-v2';
const SHELL_ASSETS = [
    './assets/css/style.css',
    './assets/js/main.js',
    './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (!/\.(css|js|svg)$/.test(url.pathname)) return;
    // Network-first: gli asset aggiornati arrivano subito, la cache serve solo offline
    event.respondWith(
        fetch(request).then((response) => {
            if (response.ok && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.svg'))) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request))
    );
});
