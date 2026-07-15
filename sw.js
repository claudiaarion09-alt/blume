/* Blume service worker.
 * - HTML / navigations: network-first (with a timeout) so a new release is
 *   picked up on the next launch; falls back to cache when offline.
 * - Icons / manifest / static assets: cache-first.
 * Bump CACHE on every release (kept in step with the visible app version).
 */
const CACHE = 'blume-v1-3'
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './flower.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function putInCache(request, response) {
  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
}

// Network-first with a timeout, falling back to cache (then the app shell).
function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false
    const done = (res) => {
      if (settled) return
      settled = true
      resolve(res)
    }
    const fallback = () =>
      caches.match(request).then((cached) => done(cached || caches.match('./index.html')))

    const timer = setTimeout(fallback, 4000)
    fetch(request)
      .then((res) => {
        clearTimeout(timer)
        putInCache(request, res)
        done(res)
      })
      .catch(() => {
        clearTimeout(timer)
        fallback()
      })
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isNavigation =
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html')

  if (isNavigation) {
    event.respondWith(networkFirst(request))
  } else {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((res) => {
              putInCache(request, res)
              return res
            })
            .catch(() => cached),
      ),
    )
  }
})
