#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  scripts/build-twa.sh
#  Compila el AAB firmado de Mi Turno para Google Play Store.
#
#  REQUISITOS:
#    - Java 17+ (ya disponible en tu sistema: openjdk 17.0.19)
#    - Android SDK en $ANDROID_HOME o ~/.bubblewrap/android_sdk
#    - twa/android.keystore (se genera si no existe)
#
#  RESULTADO:
#    - app/build/outputs/bundle/release/app-release.aab  ← SUBIR A PLAY STORE
#    - app/build/outputs/apk/release/app-release.apk    ← opcional, para sideload
#
#  USO:
#    bash scripts/build-twa.sh
# ════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

KEYSTORE="${TWA_KEYSTORE:-$ROOT/twa/android.keystore}"
KEY_ALIAS="${TWA_KEY_ALIAS:-miturno}"
KEY_PASS="${TWA_KEY_PASS:-miturno2026}"
STORE_PASS="${TWA_STORE_PASS:-$KEY_PASS}"

# ─── Validaciones previas ──────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   Mi Turno · Build TWA (Android App Bundle)                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

mkdir -p "$(dirname "$KEYSTORE")"

if [ ! -f "$KEYSTORE" ]; then
  echo "→ No existe keystore. Generando $KEYSTORE..."
  keytool -genkeypair -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 25000 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname 'CN=Mi Turno, OU=Apps, O=Mi Turno, L=Bogota, C=CO' >/dev/null
  echo "  ✓ Keystore generado"
  echo ""
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "⚠ ANDROID_HOME no configurado. Probando con ~/.bubblewrap/android_sdk"
  export ANDROID_HOME="$HOME/.bubblewrap/android_sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "✗ ERROR: java no está en PATH"
  exit 1
fi

if [ -x "./gradlew" ]; then
  GRADLE_CMD=("./gradlew")
elif command -v gradle >/dev/null 2>&1; then
  GRADLE_CMD=("gradle")
elif [ -x "$HOME/.gradle/wrapper/dists/gradle-8.11.1-bin/bpt9gzteqjrbo1mjrsomdt32c/gradle-8.11.1/bin/gradle" ]; then
  GRADLE_CMD=("$HOME/.gradle/wrapper/dists/gradle-8.11.1-bin/bpt9gzteqjrbo1mjrsomdt32c/gradle-8.11.1/bin/gradle")
else
  echo "✗ ERROR: No encuentro Gradle ni ./gradlew"
  exit 1
fi

GRADLE_FLAGS=("--no-daemon")
if [ "${TWA_GRADLE_OFFLINE:-0}" = "1" ]; then
  GRADLE_FLAGS+=("--offline")
fi

# ─── Verificar keystore ────────────────────────────────────────
echo "→ Verificando keystore..."
SHA256=$(keytool -list -v -keystore "$KEYSTORE" -storepass "$STORE_PASS" -alias "$KEY_ALIAS" 2>/dev/null | grep "SHA256:" | awk '{print $2}')
if [ -z "$SHA256" ]; then
  echo "✗ ERROR: No pude leer el keystore. ¿Password correcto? (esperado: $STORE_PASS)"
  exit 1
fi
echo "  SHA256: $SHA256"
echo "  Alias:  $KEY_ALIAS"
echo ""

# ─── Verificar que assetlinks.json coincide con el keystore ────
echo "→ Verificando .well-known/assetlinks.json..."
ASSETLINKS_SHA=$(grep -o '[A-F0-9:]\{95\}' .well-known/assetlinks.json | head -1)
if [ "$ASSETLINKS_SHA" != "$SHA256" ]; then
  echo "  ⚠ ADVERTENCIA: El SHA256 de assetlinks.json NO coincide con el keystore"
  echo "    Keystore:  $SHA256"
  echo "    assetlinks: $ASSETLINKS_SHA"
  echo "    Si subís este AAB a Play Store, Digital Asset Links NO va a validar."
  read -p "    ¿Continuar de todos modos? (s/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
    exit 1
  fi
else
  echo "  ✓ Coincide: $SHA256"
fi
echo ""

# ─── Limpiar builds previos ────────────────────────────────────
echo "→ Limpiando builds previos..."
"${GRADLE_CMD[@]}" clean --quiet "${GRADLE_FLAGS[@]}" 2>&1 | tail -3 || true
echo ""

# ─── Compilar AAB/APK release ──────────────────────────────────
echo "→ Compilando app-release.aab y app-release.apk (puede tardar 2-5 min la primera vez)..."
"${GRADLE_CMD[@]}" :app:bundleRelease :app:assembleRelease \
  -Pandroid.injected.signing.store.file="$KEYSTORE" \
  -Pandroid.injected.signing.store.password="$STORE_PASS" \
  -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$KEY_PASS" \
  "${GRADLE_FLAGS[@]}" 2>&1 | tail -30

# ─── Verificar resultado ───────────────────────────────────────
AAB="app/build/outputs/bundle/release/app-release.aab"
APK="app/build/outputs/apk/release/app-release.apk"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
if [ -f "$AAB" ]; then
  AAB_SIZE=$(du -h "$AAB" | awk '{print $1}')
  echo "║  ✓ BUILD EXITOSO                                            ║"
  echo "╠═══════════════════════════════════════════════════════════════╣"
  echo "║  AAB:  $AAB ($AAB_SIZE)"
  if [ -f "$APK" ]; then
    echo "║  APK:  $APK ($(du -h "$APK" | awk '{print $1}'))"
  else
    echo "║  APK:  no generado"
  fi
  echo "╠═══════════════════════════════════════════════════════════════╣"
  echo "║  PRÓXIMOS PASOS:                                            ║"
  echo "║                                                              ║"
  echo "║  1. Ir a https://play.google.com/console                     ║"
  echo "║  2. Crear app: 'Mi Turno' (id: one.miturno.twa)            ║"
  echo "║  3. Testing → Internal testing → Create release             ║"
  echo "║  4. Subir: $AAB"
  echo "║  5. Para Xiaomi GetApps, subir el APK en Mi Developer       ║"
  echo "║  6. Revisar y enviar a revisión según cada tienda           ║"
  echo "║                                                              ║"
  echo "║  Ver ANDROID_DISTRIBUTION.md para la guía corta.             ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
else
  echo "║  ✗ BUILD FALLÓ                                               ║"
  echo "╠═══════════════════════════════════════════════════════════════╣"
  echo "║  No se generó $AAB"
  echo "║  Revisá los logs arriba o corré:                             ║"
  echo "║    ./gradlew :app:bundleRelease --stacktrace                 ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  exit 1
fi
