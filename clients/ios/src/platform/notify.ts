// Notificaciones locales del iPad (no pasan por ningún servidor: las programa el propio iOS).
import * as Notifications from 'expo-notifications';

export type NotifData = { type: 'reminder'; channelKey: string } | { type: 'recording'; recordingId: string; channelKey: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensureNotifyPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return r.granted;
}

/** Programa un aviso; devuelve su id (null si la hora ya pasó o no hay permiso). */
export async function notifyAt(at: number, title: string, body: string, data: NotifData): Promise<string | null> {
  if (at <= Date.now() + 2000) return null;
  if (!(await ensureNotifyPermission())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data: data as unknown as Record<string, unknown>, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

export async function notifyNow(title: string, body: string): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(() => {});
}

export async function cancelNotify(id: string | null | undefined): Promise<void> {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Al tocar una notificación (con la app abierta o al abrirla desde la notificación). */
export function onNotificationTap(cb: (d: NotifData) => void): () => void {
  const handle = (r: Notifications.NotificationResponse | null) => {
    const d = r?.notification.request.content.data as unknown as NotifData | undefined;
    if (d && (d.type === 'reminder' || d.type === 'recording')) cb(d);
  };
  Notifications.getLastNotificationResponseAsync().then((r) => {
    handle(r);
    if (r) Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
