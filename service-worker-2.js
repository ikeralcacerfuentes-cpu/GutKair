// ══════════════════════════════════════════════════════════
// KAIR SERVICE WORKER — v2
// Gestiona caché estático + notificaciones push programadas
// ══════════════════════════════════════════════════════════

const CACHE_NAME = 'kair-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/cuestionarios.html',
  '/manifest.json',
  '/icon-180.png'
];

// ─── INSTALACIÓN ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ─── ACTIVACIÓN ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH — cache first, red como fallback ───────────────
self.addEventListener('fetch', event => {
  // No interceptar las llamadas a la API
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});

// ─── MENSAJES DESDE LA APP ────────────────────────────────
// La app envía { type: 'SCHEDULE_NOTIFICATION', time: 'HH:MM', title, body }
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { time, title, body } = event.data;
    // Guardar la preferencia en IndexedDB no está disponible de forma sencilla
    // en todos los SW; usamos una variable en memoria + alarm periódica.
    // El SW programa un timeout hasta la próxima ocurrencia de la hora elegida.
    scheduleNextNotification(time, title || 'Registro diario · Kair', body || 'Es hora de hacer tu registro diario.');
  }
});

// ─── NOTIFICACIÓN PUSH NATIVA (servidor→SW) ───────────────
self.addEventListener('push', event => {
  let data = { title: 'Kair', body: 'Es hora de hacer tu registro diario.' };
  try { if (event.data) data = event.data.json(); } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      tag: 'kair-daily',
      renotify: true,
      data: { url: '/' }
    })
  );
});

// ─── CLICK EN NOTIFICACIÓN ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── PROGRAMAR NOTIFICACIÓN LOCAL ─────────────────────────
// Calcula cuántos ms faltan para la próxima ocurrencia de HH:MM
// y dispara la notificación. Luego la reprograma cada 24h.
let scheduledTimer = null;

function scheduleNextNotification(timeStr, title, body) {
  if (scheduledTimer) clearTimeout(scheduledTimer);

  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);

  // Si la hora ya pasó hoy, programar para mañana
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - now.getTime();

  scheduledTimer = setTimeout(async () => {
    await self.registration.showNotification(title, {
      body,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      tag: 'kair-daily',
      renotify: true,
      data: { url: '/' }
    });
    // Reprogramar para el día siguiente
    scheduleNextNotification(timeStr, title, body);
  }, delay);
}

// Al reactivarse el SW (ej. tras reinicio del navegador),
// recuperar la hora guardada y reprogramar si existe.
// Como el SW no tiene acceso a localStorage, el cliente
// reenvía el mensaje cada vez que abre la app (ver init en index.html).
