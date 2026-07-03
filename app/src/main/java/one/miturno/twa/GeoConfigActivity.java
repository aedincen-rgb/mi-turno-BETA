package one.miturno.twa;

import android.Manifest;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Puente web → nativo. El TWA navega a
 *   miturno://geofence?on=1&lat=4.6...&lng=-74.0...&radius=150
 * desde el toggle de Ajustes (gesto del usuario). Esta activity invisible:
 *   1) guarda la config en SharedPreferences,
 *   2) pide los permisos de ubicación (FINE primero; BACKGROUND después,
 *      como exige Android 11+ en dos pasos),
 *   3) registra/borra la geovalla del sistema,
 *   4) hace finish() y el usuario vuelve al TWA donde estaba.
 */
public class GeoConfigActivity extends Activity {

    private static final int REQ_FINE = 1;
    private static final int REQ_BACKGROUND = 2;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data == null) {
            finish();
            return;
        }

        boolean on = "1".equals(data.getQueryParameter("on"));
        double lat = parseD(data.getQueryParameter("lat"));
        double lng = parseD(data.getQueryParameter("lng"));
        float radius = (float) parseD(data.getQueryParameter("radius"));
        if (radius < 100f) radius = 150f; // el mínimo fiable de geofencing es ~100 m

        if (!on || lat == 0d || lng == 0d) {
            GeoPrefs.save(this, false, lat, lng, radius);
            GeoPrefs.unregister(this);
            toast("Detección por ubicación desactivada");
            finish();
            return;
        }

        GeoPrefs.save(this, true, lat, lng, radius);

        if (GeoPrefs.hasFineLocation(this)) {
            afterFine();
        } else {
            List<String> wanted = new ArrayList<String>();
            wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
            wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            if (Build.VERSION.SDK_INT >= 33) {
                wanted.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            ActivityCompat.requestPermissions(
                    this, wanted.toArray(new String[0]), REQ_FINE);
        }
    }

    private void afterFine() {
        if (!GeoPrefs.hasBackgroundLocation(this)
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10 permite pedirlo directo; 11+ abre Ajustes del sistema
            // para elegir "Permitir todo el tiempo". Es el paso que habilita
            // la detección con la app cerrada.
            toast("Elegí \"Permitir todo el tiempo\" para detectar en segundo plano");
            ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                    REQ_BACKGROUND);
            return;
        }
        registerAndClose();
    }

    private void registerAndClose() {
        GeoPrefs.register(this);
        toast(GeoPrefs.hasBackgroundLocation(this)
                ? "Geovalla del trabajo activa 📍"
                : "Geovalla activa (solo con la app abierta)");
        finish();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_FINE) {
            if (GeoPrefs.hasFineLocation(this)) {
                afterFine();
            } else {
                toast("Sin permiso de ubicación no puedo detectar tu trabajo");
                finish();
            }
        } else if (requestCode == REQ_BACKGROUND) {
            // Con o sin background registramos igual: con la app abierta la capa
            // web cubre la detección; el background solo mejora la cobertura.
            registerAndClose();
        }
    }

    private static double parseD(String s) {
        if (s == null || s.length() == 0) return 0d;
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return 0d;
        }
    }

    private void toast(String msg) {
        Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_LONG).show();
    }
}
