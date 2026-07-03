package one.miturno.twa;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

/**
 * Config compartida de la geovalla del trabajo + registro en el sistema.
 * La usan GeoConfigActivity (alta/baja desde el deep link del TWA) y
 * GeoBootReceiver (re-registro tras reinicio: las geofences no sobreviven
 * al reboot).
 */
final class GeoPrefs {

    static final String PREFS = "mt_geo";
    static final String REQUEST_ID = "mt_work";
    static final int LOITER_MS = 2 * 60 * 1000;      // DWELL: 2 min adentro
    static final int RESPONSIVENESS_MS = 60 * 1000;  // latencia aceptada (ahorra batería)

    private GeoPrefs() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context ctx, boolean on, double lat, double lng, float radius) {
        prefs(ctx).edit()
                .putBoolean("on", on)
                .putLong("lat", Double.doubleToRawLongBits(lat))
                .putLong("lng", Double.doubleToRawLongBits(lng))
                .putFloat("radius", radius)
                .apply();
    }

    static boolean isOn(Context ctx) {
        return prefs(ctx).getBoolean("on", false);
    }

    static double lat(Context ctx) {
        return Double.longBitsToDouble(prefs(ctx).getLong("lat", 0L));
    }

    static double lng(Context ctx) {
        return Double.longBitsToDouble(prefs(ctx).getLong("lng", 0L));
    }

    static float radius(Context ctx) {
        return prefs(ctx).getFloat("radius", 150f);
    }

    static boolean hasFineLocation(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackgroundLocation(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static PendingIntent geofencePendingIntent(Context ctx) {
        Intent intent = new Intent(ctx, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Geofencing necesita MUTABLE: el sistema adjunta los extras del evento.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, 100, intent, flags);
    }

    /** Registra (o re-registra) la geovalla guardada. Requiere FINE ya concedido. */
    @SuppressWarnings("MissingPermission")
    static void register(Context ctx) {
        if (!isOn(ctx) || !hasFineLocation(ctx)) return;
        GeofencingClient client = LocationServices.getGeofencingClient(ctx);
        Geofence fence = new Geofence.Builder()
                .setRequestId(REQUEST_ID)
                .setCircularRegion(lat(ctx), lng(ctx), radius(ctx))
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(
                        Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
                .setLoiteringDelay(LOITER_MS)
                .setNotificationResponsiveness(RESPONSIVENESS_MS)
                .build();
        GeofencingRequest request = new GeofencingRequest.Builder()
                // DWELL como trigger inicial: si el usuario YA está en el trabajo
                // al activar, dispara a los 2 min (no un ENTER falso al caminar cerca).
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_DWELL)
                .addGeofence(fence)
                .build();
        client.addGeofences(request, geofencePendingIntent(ctx));
    }

    static void unregister(Context ctx) {
        LocationServices.getGeofencingClient(ctx)
                .removeGeofences(geofencePendingIntent(ctx));
    }
}
