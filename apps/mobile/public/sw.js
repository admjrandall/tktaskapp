// Service worker — TechKey CRM Mobile PWA
// Cache-first for the app shell; network-first with stale-while-revalidate for API.
//
// Security: the API cache is cleared on logout and on user change to prevent
// stale authenticated responses being served to a different user on the same device.
// The app sends a 'CLEAR_API_CACHE' message via postMessage on logout.

const SHELL_CACHE = 'tkcrm-shell-v1'
const API_CACHE = 'tkcrm-api-v1'

// Precache the minimal app shell needed for offline launch.
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/mobile.css']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// ── Message handler ────────────────────────────────────────────────────────────
// The app sends 'CLEAR_API_CACHE' on logout so authenticated API responses
// from the previous session are not served to the next user on this device.
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE))
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return

  // API routes — network-first, stale-while-revalidate fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone()
            caches.open(API_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
    )
    return
  }

  // App shell — cache-first, populate cache on miss
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
        }
        return response
      })
    }),
  )
})
