// The service worker: what lets the site be installed as an app on a phone.
// It always asks the network first, so an update shows on the next open; the
// copy it keeps is only for opening the app's screens when there is no signal.
// Data (Supabase) is never kept here - it is always fetched live.
const CACHE = 'cpmg-projects-v1';
const LIBRARIES = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const own = url.origin === self.location.origin;
  if (!own && !LIBRARIES.test(url.hostname)) return; // the database and photos go straight through

  event.respondWith((async () => {
    try {
      // "no-cache": the server is asked each time (a quick "unchanged" when nothing is new).
      // (A page itself cannot be copied with new options, so it is asked for by its address.)
      const fresh = !own ? await fetch(request)
        : request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
          : await fetch(new Request(request, { cache: 'no-cache' }));
      if (fresh.ok) (await caches.open(CACHE)).put(request, fresh.clone());
      return fresh;
    } catch {
      const kept = await caches.match(request);
      if (kept) return kept;
      throw new Error('offline');
    }
  })());
});
