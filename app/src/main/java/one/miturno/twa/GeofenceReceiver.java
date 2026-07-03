package one.miturno.twa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

/**
 * Recibe los eventos de la geovalla del sistema (aunque la app esté cerrada)
 * y postea una notificación cuyo tap abre el TWA con el deep link
 *   https://miturno.one/app?geo=enter|exit&at=<epoch>
 * El epoch es la hora REAL del evento: la web inicia/cierra el turno con esa
 * hora (backdate), no con la hora del tap. Así, aunque el usuario toque la
 * notificación dos horas después, el turno queda bien.
 */
public class GeofenceReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "mt_geo";
    private static final int NOTIF_ID = 4210;

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;

        int transition = event.getGeofenceTransition();
        boolean enter = transition == Geofence.GEOFENCE_TRANSITION_DWELL
                || transition == Geofence.GEOFENCE_TRANSITION_ENTER;
        boolean exit = transition == Geofence.GEOFENCE_TRANSITION_EXIT;
        if (!enter && !exit) return;

        long at = System.currentTimeMillis();
        String kind = enter ? "enter" : "exit";
        String title = enter ? "Llegaste al trabajo 📍" : "Saliste del trabajo 🏠";
        String body = enter
                ? "Tocá para iniciar el turno con tu hora de llegada."
                : "Tocá para cerrar el turno con tu hora de salida.";

        Uri link = Uri.parse("https://miturno.one/app?geo=" + kind + "&at=" + at);
        Intent open = new Intent(Intent.ACTION_VIEW, link);
        open.setPackage(context.getPackageName()); // directo al TWA, sin chooser
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent tap = PendingIntent.getActivity(context, enter ? 1 : 2, open, piFlags);

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Lugar de trabajo", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Llegadas y salidas del trabajo detectadas");
            nm.createNotificationChannel(ch);
        }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(context, CHANNEL_ID);
        } else {
            b = new Notification.Builder(context);
        }
        b.setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.app_icon)
                .setContentIntent(tap)
                .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        nm.notify(NOTIF_ID + (enter ? 0 : 1), b.build());
    }
}
