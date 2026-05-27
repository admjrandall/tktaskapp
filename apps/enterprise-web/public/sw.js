// Service worker — TechKey CRM Enterprise PWA
//
// Cache strategy:
//   /assets/*          → cache-first (content-hashed filenames; immutable once cached)
//   /api/*             → network-first; stale-while-revalidate fallback (GET only)
//   navigation (HTML)  → network-first; serve cached shell on network failure
//
// Security:
//   The API cache is cleared on logout via postMessage('CLEAR_API_CACHE') so
//   stale authenticated responses are never served to a different user on this device.

const SHELL_CACHE = 'tkcrm-enterprise-shell-v1'
const API_CACHE = 'tkcrm-enterprise-api-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Cache the SPA shell on install so the app launches offline immediately.
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// ── Message handler ────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.origin !== self.location.origin) return
  if (event.data === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE))
  }
})

// ── Fetch handler ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return

  // Assets: cache-first — filenames are content-hashed so cached copies are always fresh
  if (url.pathname.startsWith('/assets/')) {
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
    return
  }

  // API routes: network-first, stale-while-revalidate fallback
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

  // Navigation requests: network-first, fall back to cached SPA shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    )
    return
  }

  // All other same-origin requests: cache-first, populate on miss
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
