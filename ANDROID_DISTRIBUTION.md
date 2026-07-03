# Android distribution

Mi Turno se empaqueta como Trusted Web Activity (TWA). Esto conserva la misma
experiencia que la PWA instalada desde Chrome: abre `https://miturno.one/app`
sin pegar la landing dentro de un WebView.

## Build

```bash
bash scripts/build-twa.sh
```

Artefactos esperados:

- `app/build/outputs/bundle/release/app-release.aab`: Google Play.
- `app/build/outputs/apk/release/app-release.apk`: Xiaomi GetApps u otras tiendas que acepten APK.

## Requisito critico

El archivo publico `https://miturno.one/.well-known/assetlinks.json` debe tener
la huella SHA-256 del mismo keystore usado para firmar la app. Si no coincide,
Android/Chrome abre la app como Custom Tab o fallback, y puede verse como
navegador.

Huella actual:

```text
DD:EF:74:B8:29:C8:0E:8F:00:2C:80:AE:B5:8A:98:97:DA:47:71:A8:B8:E7:98:08:97:33:57:0E:21:D4:92:A2
```

Antes de probar el APK en un Xiaomi o de enviarlo a revision, desplegar este
repo para que `miturno.one` sirva esa huella nueva.

## Firma

El keystore local queda en `twa/android.keystore` y esta ignorado por Git. Hay
que guardarlo en un lugar seguro: GetApps y Play Store exigen que las futuras
actualizaciones se firmen con la misma llave.

## Publicacion

Google Play requiere una cuenta de desarrollador de Play Console. Segun la ayuda
oficial de Google, la cuota de registro sigue siendo unica de USD 25.

Xiaomi GetApps se gestiona desde el portal de Mi Developer:

```text
https://global.developer.mi.com/
```

La subida final no se puede automatizar desde este repositorio porque requiere
iniciar sesion, verificar la cuenta y aceptar los formularios de la tienda.
