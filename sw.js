// Service Worker for Copias Bella Vista Push Notifications
self.addEventListener('push', event => {
  let data = {
    title: 'Copias Bella Vista',
    body: 'Tienes una nueva actualización en tu pedido.'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'Copias Bella Vista',
        body: event.data.text()
      };
    }
  }

  const options = {
    body: data.body,
    icon: 'https://raw.githubusercontent.com/copiasbellavistafp-sys/imagenes-tortas/main/favicom-copias-bella-vista.png',
    badge: 'https://raw.githubusercontent.com/copiasbellavistafp-sys/imagenes-tortas/main/favicom-copias-bella-vista.png',
    vibrate: [100, 50, 100],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const orderId = event.notification.data ? event.notification.data.orderId : null;
  
  let targetUrl = self.location.origin;
  if (orderId) {
    targetUrl += `/?pedido=${orderId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
