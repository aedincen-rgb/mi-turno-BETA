package one.miturno.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Las geofences registradas NO sobreviven al reinicio del dispositivo.
 * Este receiver re-registra la geovalla del trabajo tras el boot si el
 * usuario la tenía activa y los permisos siguen concedidos.
 */
public class GeoBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (GeoPrefs.isOn(context) && GeoPrefs.hasFineLocation(context)) {
            GeoPrefs.register(context);
        }
    }
}
