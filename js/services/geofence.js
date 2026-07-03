// ════════════════════════════════════════════════════════════════
//  MI TURNO · services/geofence.js  (v368)
//  Detección del lugar de trabajo: inicio/cierre de turno por ubicación.
//
//  Dos capas complementarias:
//   1) WEB (este archivo): watchPosition mientras la app está abierta +
//      chequeo inmediato al abrir/resumir. Funciona en PWA y dentro del TWA.
//   2) NATIVA (Android TWA): GeofencingClient del sistema dispara aunque la
//      app esté cerrada; postea una notificación cuya acción abre
//      /app?geo=enter|exit&at=<epoch>. Este archivo consume ese deep link.
//      La config viaja al nativo vía miturno://geofence?... (GeoConfigActivity).
//
//  La pieza clave contra el "me di cuenta 2 horas tarde" es el BACKDATING:
//  la hora de llegada/salida se registra cuando ocurre (web o nativa) y el
//  turno se inicia/cierra CON ESA hora, no con la del tap.
//
//  Config y estado en localStorage: mt_geo_<uid> via dk(uid,'geo').
//    { on, lat, lng, radius, modo:'ask'|'auto', autoStart, autoEnd,
//      arrivedAt, leftAt, inside }
// ════════════════════════════════════════════════════════════════
/* global leer, grabar, dk, notifEnviar, fCOP */

var GEO_DEFAULTS = {
  on: false,
  lat: null,
  lng: null,
  radius: 150, // metros
  modo: 'ask', // 'ask' = preguntar antes | 'auto' = ejecutar solo
  autoStart: true, // reaccionar al llegar
  autoEnd: true, // reaccionar al salir
  arrivedAt: null, // epoch ms de la última llegada detectada (para backdate)
  leftAt: null, // epoch ms de la última salida detectada
  inside: null // último estado conocido (null = desconocido)
};

// Histéresis: entra con radius, sale con radius*1.5 + 40 m. La banda muerta
// evita el flapping GPS en el borde de la geovalla (drift de 20-60 m es normal).
var GEO_EXIT_FACTOR = 1.5;
var GEO_EXIT_PAD = 40;
// Confirmaciones consecutivas del watch antes de aceptar una transición
// (equivale al DWELL nativo). El chequeo al abrir la app es inmediato.
var GEO_DWELL_TICKS = 2;

function geoConfig(uid) {
  var raw = leer(dk(uid, 'geo'), null);
  var out = {};
  for (var k in GEO_DEFAULTS) {
    if (Object.prototype.hasOwnProperty.call(GEO_DEFAULTS, k)) {
      out[k] = raw && Object.prototype.hasOwnProperty.call(raw, k) ? raw[k] : GEO_DEFAULTS[k];
    }
  }
  return out;
}

function geoPatch(uid, patch) {
  var cfg = geoConfig(uid);
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) cfg[k] = patch[k];
  }
  grabar(dk(uid, 'geo'), cfg);
  return cfg;
}

// Distancia haversine en metros.
function geoDist(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var dLat = ((lat2 - lat1) * Math.PI) / 180;
  var dLng = ((lng2 - lng1) * Math.PI) / 180;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Máquina de estados pura (testeable): dado el estado previo y una posición,
// decide si hay transición. Devuelve { inside, transition: 'enter'|'exit'|null }.
function geoEval(cfg, lat, lng) {
  if (!cfg || cfg.lat == null || cfg.lng == null) return { inside: null, transition: null };
  var d = geoDist(cfg.lat, cfg.lng, lat, lng);
  var was = cfg.inside;
  var enterR = cfg.radius;
  var exitR = cfg.radius * GEO_EXIT_FACTOR + GEO_EXIT_PAD;
  if (was === true) {
    if (d >= exitR) return { inside: false, transition: 'exit', dist: d };
    return { inside: true, transition: null, dist: d };
  }
  // was === false o desconocido: entra solo si cruza el radio interno
  if (d <= enterR) return { inside: true, transition: 'enter', dist: d };
  return { inside: false, transition: null, dist: d };
}

// Etiqueta corta de hora para los prompts ("7:58 a. m.").
function geoHora(epochMs) {
  try {
    return new Date(epochMs).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

// ¿Corremos dentro del TWA Android? Chrome lanza el TWA con referrer
// android-app://<packageId>; se persiste porque el referrer solo llega
// en la primera navegación.
function geoIsTwa() {
  try {
    if (leer('mt_twa', false)) return true;
    if (
      typeof document !== 'undefined' &&
      document.referrer &&
      document.referrer.indexOf('android-app://one.miturno.twa') === 0
    ) {
      grabar('mt_twa', true);
      return true;
    }
  } catch (e) {}
  return false;
}

// Manda la config al lado nativo (Android). La navegación a un scheme custom
// desde un gesto del usuario lanza GeoConfigActivity, que registra/desregistra
// la geovalla del sistema y vuelve al TWA. En web puro es un no-op silencioso.
function geoSyncNative(cfg) {
  if (!geoIsTwa()) return false;
  try {
    var url =
      'miturno://geofence?on=' +
      (cfg.on && cfg.lat != null ? '1' : '0') +
      '&lat=' +
      encodeURIComponent(cfg.lat != null ? cfg.lat : '') +
      '&lng=' +
      encodeURIComponent(cfg.lng != null ? cfg.lng : '') +
      '&radius=' +
      encodeURIComponent(cfg.radius || 150);
    window.location.href = url;
    return true;
  } catch (e) {
    return false;
  }
}

// ── Deep link nativo: /app?geo=enter|exit&at=<epoch> ──
// La notificación de la geovalla nativa abre la app con estos params.
// Se consume UNA vez: guarda la marca de tiempo real del evento y limpia la URL.
function geoConsumeDeepLink(uid) {
  try {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return null;
    var mAt = window.location.search.match(/[?&]at=(\d+)/);
    var mGeo = window.location.search.match(/[?&]geo=(enter|exit)/);
    if (!mGeo) return null;
    var kind = mGeo[1];
    var at = mAt ? parseInt(mAt[1], 10) : Date.now();
    // Sanity: máximo 20 h hacia atrás; el futuro se recorta a ahora.
    if (!(at > Date.now() - 20 * 3600000 && at <= Date.now() + 60000)) at = Date.now();
    if (kind === 'enter') geoPatch(uid, { arrivedAt: at, inside: true });
    else geoPatch(uid, { leftAt: at, inside: false });
    try {
      var clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', clean);
    } catch (e2) {}
    return { kind: kind, at: at };
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  Runtime del watcher (solo navegador)
// ════════════════════════════════════════════════════════════════
var _geoWatchId = null;
var _geoTicksInside = 0;
var _geoTicksOutside = 0;
var _geoUid = null;
var _geoHooks = null; // { tieneActivo(), salarioOk(), iniciarDesde(iso), cerrarEn(iso), prompt(obj) }

// Reacciona a una transición confirmada. `at` = epoch real del evento.
function _geoOnTransition(kind, at) {
  var uid = _geoUid;
  if (!uid || !_geoHooks) return;
  var cfg = geoConfig(uid);
  if (kind === 'enter') {
    geoPatch(uid, { arrivedAt: at, inside: true });
    if (!cfg.autoStart) return;
    if (_geoHooks.tieneActivo()) return; // ya hay turno corriendo
    if (!_geoHooks.salarioOk()) return; // sin salario no se puede iniciar
    var iso = new Date(at).toISOString();
    if (cfg.modo === 'auto') {
      _geoHooks.iniciarDesde(iso);
      if (typeof notifEnviar === 'function') {
        notifEnviar(
          'Turno iniciado 🟢',
          'Llegaste al trabajo a las ' + geoHora(at) + '.',
          'mt-geo'
        );
      }
    } else {
      _geoHooks.prompt({
        kind: 'enter',
        at: at,
        title: 'Llegaste al trabajo',
        body: '¿Inicio el turno desde las ' + geoHora(at) + '?',
        actionLabel: 'Iniciar turno',
        iso: iso
      });
    }
  } else if (kind === 'exit') {
    geoPatch(uid, { leftAt: at, inside: false });
    if (!cfg.autoEnd) return;
    if (!_geoHooks.tieneActivo()) return; // nada que cerrar
    var isoFin = new Date(at).toISOString();
    if (cfg.modo === 'auto') {
      _geoHooks.cerrarEn(isoFin);
      if (typeof notifEnviar === 'function') {
        notifEnviar('Turno cerrado ✅', 'Saliste del trabajo a las ' + geoHora(at) + '.', 'mt-geo');
      }
    } else {
      _geoHooks.prompt({
        kind: 'exit',
        at: at,
        title: 'Saliste del trabajo',
        body: '¿Cierro el turno a las ' + geoHora(at) + '?',
        actionLabel: 'Cerrar turno',
        iso: isoFin
      });
    }
  }
}

function _geoTick(pos, immediate) {
  var uid = _geoUid;
  if (!uid) return;
  var cfg = geoConfig(uid);
  if (!cfg.on || cfg.lat == null) return;
  var r = geoEval(cfg, pos.coords.latitude, pos.coords.longitude);
  if (r.inside === null) return;

  // Lecturas con precisión pésima (>150 m) no deciden transiciones.
  if (pos.coords.accuracy && pos.coords.accuracy > 150 && !immediate) return;

  if (r.transition === 'enter') {
    _geoTicksInside++;
    _geoTicksOutside = 0;
    if (immediate || _geoTicksInside >= GEO_DWELL_TICKS) {
      _geoTicksInside = 0;
      _geoOnTransition('enter', Date.now());
    }
  } else if (r.transition === 'exit') {
    _geoTicksOutside++;
    _geoTicksInside = 0;
    if (immediate || _geoTicksOutside >= GEO_DWELL_TICKS) {
      _geoTicksOutside = 0;
      _geoOnTransition('exit', Date.now());
    }
  } else {
    _geoTicksInside = 0;
    _geoTicksOutside = 0;
    // sin transición: solo persistir el estado si cambió de desconocido
    if (cfg.inside === null) geoPatch(uid, { inside: r.inside });
  }
}

// Chequeo puntual (al abrir o resumir): una lectura fresca y acción inmediata.
// Cubre el caso real de "abro el teléfono ya en el trabajo": no hay que esperar
// al watch, y si hay marca de llegada previa (nativa) se usa para el backdate.
function geoCheckNow() {
  var uid = _geoUid;
  if (!uid || typeof navigator === 'undefined' || !navigator.geolocation) return;
  var cfg = geoConfig(uid);
  if (!cfg.on || cfg.lat == null) return;
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var r = geoEval(cfg, pos.coords.latitude, pos.coords.longitude);
      if (r.inside === true && !_geoHooks.tieneActivo() && cfg.autoStart) {
        // Backdate: si el nativo (o una sesión previa) registró la llegada y
        // sigue vigente (< 16 h), iniciar desde ESA hora, no desde ahora.
        var at =
          cfg.arrivedAt && Date.now() - cfg.arrivedAt < 16 * 3600000 ? cfg.arrivedAt : Date.now();
        geoPatch(uid, { inside: true });
        _geoOnTransition('enter', at);
      } else if (r.inside === false && _geoHooks.tieneActivo() && cfg.autoEnd) {
        var atExit = cfg.leftAt && Date.now() - cfg.leftAt < 16 * 3600000 ? cfg.leftAt : Date.now();
        geoPatch(uid, { inside: false });
        _geoOnTransition('exit', atExit);
      } else {
        geoPatch(uid, { inside: r.inside });
      }
    },
    function () {},
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
  );
}

function geoStartWatch() {
  if (_geoWatchId != null) return;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  var uid = _geoUid;
  if (!uid) return;
  var cfg = geoConfig(uid);
  if (!cfg.on || cfg.lat == null) return;
  try {
    _geoWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        _geoTick(pos, false);
      },
      function () {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  } catch (e) {}
}

function geoStopWatch() {
  if (_geoWatchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      navigator.geolocation.clearWatch(_geoWatchId);
    } catch (e) {}
  }
  _geoWatchId = null;
  _geoTicksInside = 0;
  _geoTicksOutside = 0;
}

// Punto de entrada: la App lo llama cuando hay sesión y hooks listos.
// 1) consume el deep link nativo si vino en la URL, 2) chequeo inmediato,
// 3) watch continuo mientras la app esté visible.
function geoInit(uid, hooks) {
  _geoUid = uid;
  _geoHooks = hooks;
  var dl = geoConsumeDeepLink(uid);
  var cfg = geoConfig(uid);
  if (!cfg.on) return;
  // El deep link YA trae la transición confirmada por el sistema operativo:
  // actuar directo con su timestamp real (sin esperar GPS).
  if (dl && dl.kind === 'enter' && !hooks.tieneActivo()) {
    _geoOnTransition('enter', dl.at);
  } else if (dl && dl.kind === 'exit' && hooks.tieneActivo()) {
    _geoOnTransition('exit', dl.at);
  } else {
    geoCheckNow();
  }
  geoStartWatch();
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        geoCheckNow();
        geoStartWatch();
      } else {
        geoStopWatch();
      }
    });
  } catch (e) {}
}

function geoStop() {
  geoStopWatch();
  _geoUid = null;
  _geoHooks = null;
}

// expose
if (typeof window !== 'undefined') {
  window.GEO_DEFAULTS = GEO_DEFAULTS;
  window.geoConfig = geoConfig;
  window.geoPatch = geoPatch;
  window.geoDist = geoDist;
  window.geoEval = geoEval;
  window.geoHora = geoHora;
  window.geoIsTwa = geoIsTwa;
  window.geoSyncNative = geoSyncNative;
  window.geoConsumeDeepLink = geoConsumeDeepLink;
  window.geoInit = geoInit;
  window.geoStop = geoStop;
  window.geoCheckNow = geoCheckNow;
  window.geoStartWatch = geoStartWatch;
  window.geoStopWatch = geoStopWatch;
}
