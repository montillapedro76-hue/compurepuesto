/**
 * Utility client-side library to handle Web Push Notifications
 */

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied';
  return await Notification.requestPermission();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeUser(orderId?: string, email?: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js');
    }

    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) throw new Error('Failed to fetch VAPID public key');
    const { publicKey } = await res.json();

    const subscribeOptions = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    };

    const subscription = await registration.pushManager.subscribe(subscribeOptions);

    const registerRes = await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId || null,
        email: email || null,
        subscription
      })
    });

    return registerRes.ok;
  } catch (err) {
    console.error('Error subscribing user to push notifications:', err);
    return false;
  }
}

export async function getSubscriptionStatus(): Promise<'granted' | 'default' | 'denied' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'default';
    
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'granted' : 'default';
  } catch (err) {
    return 'default';
  }
}

export async function sendPushNotification(orderId: string, title: string, body: string): Promise<boolean> {
  try {
    const res = await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, title, body })
    });
    return res.ok;
  } catch (err) {
    console.error('Error sending push notification request:', err);
    return false;
  }
}
