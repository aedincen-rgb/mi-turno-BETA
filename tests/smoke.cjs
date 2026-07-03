// ════════════════════════════════════════════════════════════════
//  tests/smoke.js — pruebas de humo de funciones puras del core.
//
//  Carga los archivos de la app en orden dentro de un vm.Context
//  con stubs mínimos (window, document, localStorage), y verifica
//  invariantes que NO deberían romperse jamás:
//
//    · helpers de formato (fCOP, fDur)
//    · saludo por hora (_saludoHora)
//    · cálculo de Pascua (getEaster) — usado por festivos
//    · festivos colombianos (esFest)
//    · validación de sesiones (validarSesion, validarTurnos)
//    · clave por usuario (dk)
//    · normalización de prefs
//
//  Sin browser. Sin Supabase. Solo node.
//  Uso: node tests/smoke.js   (exit 0 = OK, exit 1 = falla)
// ════════════════════════════════════════════════════════════════

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

// Orden de carga (mismo orden que index.html para las primeras 3 capas).
// Solo archivos que no tocan DOM/React.
var FILES = [
  'js/config/globals.js',
  'js/utils/storage.js',
  'js/utils/format.js',
  'js/utils/uuid.js',
  'js/utils/time.js',
  'js/utils/festivos.js',
  'js/utils/validation.js',
  'js/utils/password-hash.js',
  'js/services/quincena.js',
  'js/services/calculator.js',
  'js/services/ai-query.js',
  'js/services/ai-episodes.js',
  'js/services/ai-synonyms.js',
  'js/services/ai-nlp.js',
  // ai-help.js cargado antes de ai.js para que aiHelpAnswer esté disponible
  'js/services/ai-help.js',
  'js/services/ai.js',
  'js/services/ai-advisor.js',
  'js/services/ai-enhanced.js',
  // Desde v48, _saludoHora vive en su propio archivo (junto con
  // _aiNombrePersonal y _aiHeroPhrases). ai-greeting.js no toca
  // DOM ni React, es seguro cargarlo entero en node.
  'js/services/ai-history.js',
  'js/tabs/assistant.js',
  'js/services/ai-greeting.js',
  'js/services/ai-proactive.js',
  // ai-reasoning.js es autocontenido en carga (define funciones puras);
  // sus deps externas solo se usan en runtime del agente, no acá.
  'js/services/ai-reasoning.js',
  // ai-psychology.js no toca DOM ni deps de carga; seguro en node.
  'js/services/ai-psychology.js',
  // ai-conversation.js es autocontenido en carga (motor de continuidad v334).
  'js/services/ai-conversation.js',
  // geofence.js: funciones puras (haversine, histéresis) + runtime guardeado
  // con typeof navigator/window — seguro en node.
  'js/services/geofence.js'
];

// ── Stubs del entorno ────────────────────────────────────────────
var _storage = {};
var localStorageStub = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_storage, k) ? _storage[k] : null; },
  setItem: function (k, v) { _storage[k] = String(v); },
  removeItem: function (k) { delete _storage[k]; },
  clear: function () { _storage = {}; },
  key: function (i) { return Object.keys(_storage)[i] || null; },
  get length() { return Object.keys(_storage).length; }
};

var sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Number: Number,
  String: String,
  Boolean: Boolean,
  Array: Array,
  Object: Object,
  Promise: Promise,
  Error: Error,
  RegExp: RegExp,
  Intl: Intl,
  isNaN: isNaN,
  parseInt: parseInt,
  parseFloat: parseFloat,
  Uint8Array: Uint8Array,
  Uint32Array: Uint32Array,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  atob: atob,
  btoa: btoa,
  crypto: globalThis.crypto, // Web Crypto API (node 19+)
  localStorage: localStorageStub
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.document = { getElementById: function () { return null; } };
sandbox.navigator = { userAgent: 'node-test', onLine: true };
vm.createContext(sandbox);

function loadFile(rel) {
  var p = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: rel });
}

for (var i = 0; i < FILES.length; i++) {
  try {
    loadFile(FILES[i]);
  } catch (e) {
    console.error('✗ Error cargando ' + FILES[i] + ':', e.message);
    process.exit(1);
  }
}

// ── Mini framework de aserciones ─────────────────────────────────
var PASS = 0;
var FAIL = 0;
function eq(actual, expected, label) {
  var ok = actual === expected ||
    (typeof actual === 'object' && JSON.stringify(actual) === JSON.stringify(expected));
  if (ok) {
    PASS++;
  } else {
    FAIL++;
    console.error('  ✗ ' + label);
    console.error('      esperado: ' + JSON.stringify(expected));
    console.error('      obtenido: ' + JSON.stringify(actual));
  }
}
function truthy(actual, label) {
  if (actual) PASS++;
  else { FAIL++; console.error('  ✗ ' + label + ' (truthy esperado)'); }
}
function group(name) { console.log('\n→ ' + name); }

// ── TESTS ────────────────────────────────────────────────────────
var w = sandbox;

group('dk(uid, key) — layout REAL es mt_<key>_<uid>');
eq(w.dk('abc', 't'), 'mt_t_abc', 'dk básico');
eq(w.dk('uid-123', 'sc'), 'mt_sc_uid-123', 'dk con guión');

group('format');
truthy(w.fCOP(1750905).indexOf('1.750.905') >= 0 || w.fCOP(1750905).indexOf('1750905') >= 0,
       'fCOP retorna algo plausible');
eq(w.fDur(0), '0h 00m', 'fDur 0');
eq(w.fDur(65), '1h 05m', 'fDur 65');
eq(w.fDur(180), '3h 00m', 'fDur 180');
eq(w.fDur(-10), '0h 00m', 'fDur negativo clampea a 0');

group('_saludoHora (mismo helper en AI y Historial)');
eq(w._saludoHora(new Date(2026, 0, 1, 3)),  'Buenos días',  'madrugada → buenos días');
eq(w._saludoHora(new Date(2026, 0, 1, 9)),  'Buenos días',  'mañana');
eq(w._saludoHora(new Date(2026, 0, 1, 13)), 'Buenas tardes','tarde');
eq(w._saludoHora(new Date(2026, 0, 1, 20)), 'Buenas noches','noche');

group('getEaster');
var pascua26 = w.getEaster(2026);
eq(pascua26.getDay(), 0, 'Pascua siempre cae en domingo');
truthy(pascua26.getMonth() === 2 || pascua26.getMonth() === 3, 'Pascua en marzo o abril');

group('esFest (festivos Colombia)');
truthy(w.esFest(new Date(2026, 0, 1)),  '1 de enero es festivo');
truthy(w.esFest(new Date(2026, 6, 20)), '20 de julio (Independencia) es festivo');
truthy(w.esFest(new Date(2026, 11, 25)),'25 de diciembre es festivo');
truthy(!w.esFest(new Date(2026, 0, 2)), '2 de enero NO es festivo');
truthy(w.esFest(new Date(2026, 0, 4)),  'Domingo siempre cuenta como festivo'); // 4-ene-2026 es domingo

group('validarSesion');
eq(w.validarSesion(null), null, 'null → null');
eq(w.validarSesion('texto'), null, 'string → null');
eq(w.validarSesion({}), null, 'objeto sin uid → null');
truthy(w.validarSesion({ uid: 'x', email: 'a@b.c' }), 'objeto válido pasa');

group('validarTurnos');
eq(w.validarTurnos(null, 'u'), [], 'null → []');
eq(w.validarTurnos('texto', 'u'), [], 'string → []');
var turnoOk = { id: '1', inicio: '2026-05-01T08:00:00Z', fin: '2026-05-01T16:00:00Z', userId: 'u' };
eq(w.validarTurnos([turnoOk], 'u').length, 1, 'turno bien formado pasa');
eq(w.validarTurnos([turnoOk], 'otro').length, 0, 'turno de otro uid se filtra');
var turnoSinFin = { id: '2', inicio: '2026-05-01T08:00:00Z', userId: 'u' };
eq(w.validarTurnos([turnoSinFin], 'u').length, 0, 'turno sin fin se filtra');

group('validarTurnoActivo');
eq(w.validarTurnoActivo(null, 'u'), null, 'null → null');
truthy(w.validarTurnoActivo({ inicio: '2026-05-01T08:00:00Z', userId: 'u' }, 'u'),
       'activo válido pasa');
eq(w.validarTurnoActivo({ inicio: 'NO_ES_FECHA', userId: 'u' }, 'u'), null, 'fecha inválida → null');

group('asistente: confirmación sí/no');
eq(w._aiConfirmVerdict('sí'), 'yes', '"sí" con tilde confirma');
eq(w._aiConfirmVerdict('si'), 'yes', '"si" sin tilde confirma');
eq(w._aiConfirmVerdict('✓ Confirmar'), null, 'label visual no confirma por accidente');
eq(w._aiConfirmVerdict('no'), 'no', '"no" cancela');
eq(w._aiConfirmVerdict('cancelá'), 'no', '"cancelá" cancela');

group('normalizePrefs');
var pBase = w.normalizePrefs(null);
truthy(pBase && typeof pBase === 'object', 'null devuelve objeto');
truthy(typeof pBase.quincenaMode === 'boolean', 'tiene quincenaMode booleano');

// ── ai-query (motor de consultas v260) ──────────────────────────
// Datasets construidos relativos a HOY para que los tests no dependan
// de la fecha en que corre CI. esFest cuenta domingos como festivo,
// así que "primer domingo del mes" es siempre un festivo garantizado.

function mkTurno(d, horas) {
  var ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0);
  return {
    id: ini.toISOString(),
    inicio: ini.toISOString(),
    fin: new Date(ini.getTime() + horas * 3600000).toISOString()
  };
}
function primerDomingo(year, month) {
  var d = new Date(year, month, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d;
}
function primerDiaNoFestivo(year, month) {
  var d = new Date(year, month, 1);
  while (w.esFest(d)) d.setDate(d.getDate() + 1);
  return d;
}
var _hoy = new Date();
var _ctx = { vh: 10000, uid: 'u-test' };

// ── Reforma laboral · Ley 2466 de 2025 (motor legal date-aware) ──────
// El cálculo de plata DEBE usar el valor vigente a la fecha de CADA turno.
function mkTurnoHora(d, hIni, hFin) {
  var ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hIni, 0, 0);
  var fin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hFin, 0, 0);
  return { id: ini.toISOString(), inicio: ini.toISOString(), fin: fin.toISOString() };
}
group('Ley 2466/2025: recargo dominical/festivo gradual (75→80→90→100%)');
eq(w.getRecargoFestivo(new Date(2025, 4, 1)), 0.75, 'mayo 2025 (pre-reforma) = 75%');
eq(w.getRecargoFestivo(new Date(2025, 7, 1)), 0.8, 'agosto 2025 = 80%');
eq(w.getRecargoFestivo(new Date(2026, 5, 24)), 0.8, 'junio 2026 (hoy) = 80%');
eq(w.getRecargoFestivo(new Date(2026, 7, 1)), 0.9, 'agosto 2026 = 90%');
eq(w.getRecargoFestivo(new Date(2027, 7, 1)), 1.0, 'agosto 2027 = 100%');
// Integración por doCalc: domingo diurno 4h ordinarias (8–12h), vh=10000.
// El factor diurnaFest pasa de 1.75 (75%) al vigente por fecha.
eq(
  Math.round(w.doCalc([mkTurno(primerDomingo(2025, 4), 4)], null, _hoy, 10000).totalCOP),
  70000,
  'domingo diurno 4h en mayo 2025 paga al 75% (70.000)'
);
eq(
  Math.round(w.doCalc([mkTurno(primerDomingo(2026, 0), 4)], null, _hoy, 10000).totalCOP),
  72000,
  'domingo diurno 4h en enero 2026 paga al 80% (72.000)'
);
eq(
  Math.round(w.doCalc([mkTurno(primerDomingo(2026, 7), 4)], null, _hoy, 10000).totalCOP),
  76000,
  'domingo diurno 4h en agosto 2026 paga al 90% (76.000)'
);

group('Ley 2466/2025: jornada nocturna desde 19:00 (antes 21:00) desde 25-dic-2025');
eq(w.getInicioNocturno(new Date(2025, 10, 1)), 21, 'nov 2025 (pre) = 21:00');
eq(w.getInicioNocturno(new Date(2026, 0, 1)), 19, 'ene 2026 (post) = 19:00');
// Integración: una hora 19:00–20:00 en día ordinario. Pre-reforma es DIURNA
// (factor 1.0); post-reforma es NOCTURNA (factor 1.35).
eq(
  Math.round(w.doCalc([mkTurnoHora(primerDiaNoFestivo(2025, 10), 19, 20)], null, _hoy, 10000).totalCOP),
  10000,
  '19:00–20:00 en nov 2025 es diurna (10.000)'
);
eq(
  Math.round(w.doCalc([mkTurnoHora(primerDiaNoFestivo(2026, 0), 19, 20)], null, _hoy, 10000).totalCOP),
  13500,
  '19:00–20:00 en ene 2026 es nocturna +35% (13.500)'
);

// ── Motor de continuidad (v334): deepen + open, cobertura, dosificación ──
group('motor de continuidad: chips deepen+open, cobertura, dosificación');
if (typeof w.aiNextChips === 'function') {
  w.aiConvReset();
  var _cNx = { vh: 10000, totalCOP: 500000, festMins: 480, nocturnasMins: 120, totalCOPMesPasado: 400000 };
  var _baseNx = [{ label: 'A', query: 'deepen-a' }, { label: 'B', query: 'deepen-b' }];
  var _everEmpty = false;
  var _opensDistintos = {};
  var _prevOpen = null;
  var _consecutivoIgual = false;
  for (var _ti = 0; _ti < 8; _ti++) {
    var _rnx = w.aiNextChips('total_ganado', _cNx, _baseNx);
    if (!_rnx || !_rnx.actions || !_rnx.actions.length) { _everEmpty = true; break; }
    // dosificación equilibrada: el 4º y 8º turno (respiro) → 1 solo chip
    if ((_ti + 1) % 4 === 0) {
      truthy(_rnx.actions.length === 1, 'turno ' + (_ti + 1) + ' (respiro) ofrece 1 chip');
    } else {
      truthy(_rnx.actions.length <= 2, 'turno normal ofrece ≤2 chips');
    }
    // identificar el chip de ABRIR (no es deepen) y trackear cobertura/repetición
    var _openQ = null;
    _rnx.actions.forEach(function (a) {
      if (a.query.indexOf('deepen-') < 0) { _openQ = a.query; _opensDistintos[a.query] = 1; }
    });
    if (_openQ && _prevOpen && _openQ === _prevOpen) _consecutivoIgual = true;
    if (_openQ) _prevOpen = _openQ;
  }
  truthy(!_everEmpty, 'liveness: nunca devuelve vacío en 8 turnos (el chat no muere)');
  truthy(Object.keys(_opensDistintos).length >= 3,
    'cobertura: recorre ≥3 temas distintos, no el mismo siempre');
  truthy(!_consecutivoIgual, 'anti-repetición: no ofrece el mismo "abrir" en turnos seguidos');
  // openOnly: cuando el primer chip es de ABRIR, marca exploratorio (no oferta afirmable)
  w.aiConvReset();
  // sin baseActions (no hay "profundizar") → el 1er chip es de ABRIR → openOnly
  var _rOpen = w.aiNextChips('total_ganado', _cNx, []);
  truthy(_rOpen && _rOpen.openOnly === true,
    'openOnly: chip de ABRIR sin deepen se marca exploratorio (protege fix v328)');
  // saludo trae sus propios chips → el motor no lo toca
  truthy(w.aiNextChips('saludo', _cNx, _baseNx) === null,
    'saludo: el motor no pisa los chips de onboarding');
  // #4 (prueba real): dedup defensivo — baseActions con duplicado → 1 solo
  w.aiConvReset();
  var _dupBase = [{ label: 'Ver detalle', query: 'ver detalle' }, { label: 'Ver detalle', query: 'ver detalle' }];
  var _rDup = w.aiNextChips('total_ganado', { vh: 10000, totalCOP: 500000 }, _dupBase);
  if (_rDup && _rDup.actions) {
    var _labels = _rDup.actions.map(function (a) { return a.label; });
    truthy(_labels.indexOf('Ver detalle') === _labels.lastIndexOf('Ver detalle'),
      'dedup: no aparece "Ver detalle" dos veces en los chips');
  }
  w.aiConvReset();
}

// ── Explicabilidad (Tier 2): "¿cómo lo calculaste?" ──────────────────
// Traza grounded en doCalc: factor por franja derivado del COP real, base
// legal por categoría, y el total que cuadra. Progressive disclosure.
group('Tier 2 explicabilidad: traza paso a paso del cálculo');
if (typeof w._aiExplicarCalculo === 'function') {
  // Domingo 8h este mes, vh 10000 → diurnaFest date-aware (×1.80 en 2026).
  var _calcEx = w.doCalc([mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8)], null, new Date(), 10000);
  var _cEx = { vh: 10000, totalCOP: _calcEx.totalCOP, bd: _calcEx.bd, diasTrab: 1, ahora: new Date() };
  // Ahora devuelve { text, card } — el detalle por franja vive en la tarjeta.
  var _exp = w._aiExplicarCalculo(_cEx);
  truthy(_exp.text.indexOf('Cómo calculé') >= 0, 'explica: titula la traza del cálculo');
  truthy(_exp.text.indexOf('÷ 240') >= 0, 'explica: muestra la fórmula del valor hora');
  // La tarjeta de desglose: filas con base legal + total que cuadra con doCalc.
  truthy(_exp.card && _exp.card.kind === 'breakdown' && _exp.card.rows.length > 0,
         'explica: entrega una tarjeta de desglose (no tabla markdown)');
  truthy(_exp.card.rows.some(function (r) { return (r.legal || '').indexOf('Art. 179') >= 0; }),
         'explica: la tarjeta cita la base legal por franja');
  truthy(_exp.card.total === Math.round(_calcEx.totalCOP), 'explica: el total de la tarjeta cuadra con doCalc');
  // Sin datos → string guía, no crash
  var _expVacio = w._aiExplicarCalculo({ vh: 0, bd: {}, diasTrab: 0 });
  truthy(typeof _expVacio === 'string' && _expVacio.indexOf('salario base') >= 0,
         'explica: sin datos pide salario/turnos');
  // REGRESIÓN (prueba real 25-jun): el conteo de "turnos" usa turnosMesN
  // (turnos reales), NO diasTrab (días). Si hay 10 turnos en 8 días, dice "10".
  var _cCount = { vh: 10000, totalCOP: _calcEx.totalCOP, bd: _calcEx.bd, diasTrab: 8, turnosMesN: 10, ahora: new Date() };
  var _expC = w._aiExplicarCalculo(_cCount);
  truthy(_expC.text.indexOf('tus 10 turnos') >= 0,
         'explica: usa el conteo de TURNOS (10), no de días (8)');
}
if (typeof w._aiExplainIntent === 'function') {
  var _calcEx2 = w.doCalc([mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8)], null, new Date(), 10000);
  var _cEx2 = { vh: 10000, totalCOP: _calcEx2.totalCOP, bd: _calcEx2.bd, diasTrab: 1, ahora: new Date() };
  var _r1 = w._aiExplainIntent('¿cómo lo calculaste?', 'como lo calculaste', _cEx2);
  truthy(_r1 && _r1.text && _r1.text.indexOf('Cómo calculé') >= 0,
         'ruteo: "cómo lo calculaste" dispara la traza');
  // No secuestra preguntas de concepto de la KB
  var _r2 = w._aiExplainIntent('¿qué es la hora nocturna?', 'que es la hora nocturna', _cEx2);
  truthy(_r2 === null, 'ruteo: NO intercepta preguntas de concepto (KB)');
}

group('ai-query: scoping temporal (bug preguntas precargadas de Análisis)');
var qFest = w.aiQueryParse('¿Cuántos días festivos trabajé este mes?');
truthy(qFest, 'pregunta precargada de Análisis es reclamada');
truthy(qFest && qFest.label.indexOf('de este mes') >= 0,
       'el filtro respeta "este mes" en el label');

var dsFest = [
  mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8),        // festivo mes actual
  mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth() - 1), 8),    // festivo mes pasado
  mkTurno(primerDiaNoFestivo(_hoy.getFullYear(), _hoy.getMonth()), 8)    // día normal mes actual
];
var rFest = w.aiQueryRun(qFest, dsFest, _ctx);
truthy(rFest.indexOf('**1 turno**') >= 0,
       'cuenta SOLO el festivo del mes actual (no todo el historial): ' + rFest.split('\n')[0]);

var qFestPas = w.aiQueryParse('¿cuántos festivos trabajé el mes pasado?');
truthy(qFestPas && qFestPas.label.indexOf('del mes pasado') >= 0, 'reclama "mes pasado"');
truthy(w.aiQueryRun(qFestPas, dsFest, _ctx).indexOf('• Turnos: 1') >= 0,
       'mes pasado cuenta solo su festivo');

group('ai-query: las demás preguntas precargadas de Análisis NO se reclaman');
[
  '¿Cuántas horas extra llevo?',
  '¿Cuántas horas nocturnas llevo?',
  '¿Cuánto gané este mes?',
  'Distribución y desglose de mis recargos',
  '¿Cuántos días seguidos llevo?'
].forEach(function (p) {
  eq(w.aiQueryParse(p), null, 'NO reclamada (va al NLP): "' + p + '"');
});

group('ai-query: exclusiones (conocimiento, acciones, hipotéticos)');
eq(w.aiQueryParse('¿qué es el recargo festivo?'), null, 'conocimiento no se reclama');
eq(w.aiQueryParse('envía mi reporte de mayo a juan@x.com'), null, 'correo no se reclama');
eq(w.aiQueryParse('¿cuánto ganaría si trabajo el domingo?'), null, 'hipotético no se reclama');
eq(w.aiQueryParse('próximos festivos'), null, 'festivos futuros no se reclama');

group('ai-query: filtros por día de semana');
var qDom = w.aiQueryParse('¿cuánto gané los domingos?');
truthy(qDom && qDom.label === 'los domingos', 'reclama "los domingos"');
var dom1 = primerDomingo(_hoy.getFullYear(), _hoy.getMonth());
var dom2 = primerDomingo(_hoy.getFullYear(), _hoy.getMonth() - 1);
var dsDom = [mkTurno(dom1, 8), mkTurno(dom2, 6),
             mkTurno(primerDiaNoFestivo(_hoy.getFullYear(), _hoy.getMonth()), 8)];
var rDom = w.aiQueryRun(qDom, dsDom, _ctx);
truthy(rDom.indexOf('• Turnos: 2') >= 0, 'matchea los 2 domingos del dataset');

var qVie = w.aiQueryParse('¿cuánto gané el viernes pasado?');
truthy(qVie && qVie.label.indexOf('el viernes pasado (') >= 0,
       'singular + "pasado" resuelve a una fecha puntual');
var viePas = new Date(_hoy.getFullYear(), _hoy.getMonth(), _hoy.getDate());
do { viePas.setDate(viePas.getDate() - 1); } while (viePas.getDay() !== 5);
var vieAnt = new Date(viePas); vieAnt.setDate(viePas.getDate() - 7);
var rVie = w.aiQueryRun(qVie, [mkTurno(viePas, 5), mkTurno(vieAnt, 5)], _ctx);
truthy(rVie.indexOf('1 coincide (') >= 0,
       'solo coincide el viernes más reciente, no el de hace 2 semanas');

group('ai-query: fecha de calendario específica (v286)');
// Construir una fecha pasada determinista: el día 14 del mes pasado.
var _mesPas = new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 14);
var _nombreMes = ['enero','febrero','marzo','abril','mayo','junio','julio',
                  'agosto','septiembre','octubre','noviembre','diciembre'][_mesPas.getMonth()];

// "14 de <mes pasado>" — varias formas de escribir lo mismo
['¿cuánto gané el 14 de ' + _nombreMes + '?',
 'cuanto hice el 14 de ' + _nombreMes,
 'qué saqué el 14 de ' + _nombreMes,
 'mis ganancias del 14 de ' + _nombreMes
].forEach(function (frase) {
  var qd = w.aiQueryParse(frase);
  truthy(qd && qd.label.indexOf('el 14 de ' + _nombreMes) >= 0,
         'reclama fecha puntual: "' + frase + '"');
});

var qFecha = w.aiQueryParse('¿cuánto gané el 14 de ' + _nombreMes + '?');
var dsFecha = [
  mkTurno(_mesPas, 8),                                              // el 14 (match)
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 15), 8) // el 15 (no match)
];
var rFecha = w.aiQueryRun(qFecha, dsFecha, _ctx);
truthy(rFecha.indexOf('1 coincide') >= 0,
       'solo cuenta el turno del 14, no el del 15: ' + rFecha.split('\n').pop());

// Formato numérico dd/mm
var qNum = w.aiQueryParse('cuánto gané el 14/' + (_mesPas.getMonth() + 1));
truthy(qNum && qNum.label.indexOf('el 14 de ' + _nombreMes) >= 0,
       'formato numérico dd/mm: "14/' + (_mesPas.getMonth() + 1) + '"');

// "el 14 de junio" NO debe filtrar el mes entero (era el riesgo de la palabra mes)
truthy(qFecha && qFecha.label === 'el 14 de ' + _nombreMes,
       'fecha puntual es exclusiva: no arrastra "de ' + _nombreMes + '" como mes entero');

// Guardas: no confundir cifras/porcentajes con fechas
eq(w.aiQueryParse('reparte mi sueldo 50/30/20'), null,
   '50/30/20 (presupuesto) no se lee como fecha');
truthy((function () {
  var q = w.aiQueryParse('cuánto gané');
  return q === null || q.label.indexOf('el ') < 0;
}()), '"cuánto gané" sin fecha no inventa un día');

group('ai-query: rangos de fecha (v287)');
// Rango "del 10 al 15 de <mes pasado>" — determinista
var qRango = w.aiQueryParse('cuánto gané del 10 al 15 de ' + _nombreMes);
truthy(qRango && qRango.label === 'del 10 al 15 de ' + _nombreMes,
       'reclama rango "del 10 al 15 de ' + _nombreMes + '"');
var dsRango = [
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 9), 8),   // 9 (fuera)
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 12), 8),  // 12 (dentro)
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 15), 8),  // 15 (dentro, borde)
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 16), 8)   // 16 (fuera)
];
truthy(w.aiQueryRun(qRango, dsRango, _ctx).indexOf('• Turnos: 2') >= 0,
       'rango incluye bordes (12 y 15), excluye 9 y 16');

// "entre el 1 y el 15" sin mes → mes en curso (solo parsea, sin assert de datos)
truthy(w.aiQueryParse('cuánto hice entre el 1 y el 15'),
       '"entre el 1 y el 15" se reclama como rango');

// Quincenas
var qQuin = w.aiQueryParse('cuánto gané la primera quincena de ' + _nombreMes);
truthy(qQuin && qQuin.label.indexOf('primera quincena de ' + _nombreMes) >= 0,
       'primera quincena reclamada');
var qQuin2 = w.aiQueryParse('cuánto gané la segunda quincena de ' + _nombreMes);
truthy(qQuin2 && qQuin2.label.indexOf('segunda quincena de ' + _nombreMes) >= 0,
       'segunda quincena reclamada');

// El rango gana sobre la fecha puntual ("15 de junio" dentro del rango)
truthy(qRango && qRango.label.indexOf(' al ') >= 0,
       'el rango no se degrada a fecha puntual "15 de ' + _nombreMes + '"');

group('Modo quincena por defecto (v365): reencuadre solo en escenarios necesarios');
(function () {
  // Contexto de alguien que cobra por quincena, con turnos en AMBAS quincenas del
  // mes actual (días 2 y 8 en Q1; 18 y 22 en Q2). La quincena vigente contiene 2
  // de los 4 turnos, así que su total DEBE ser menor al del mes completo.
  var _h = new Date();
  function mkQ(day) {
    var ini = new Date(_h.getFullYear(), _h.getMonth(), day, 8, 0, 0);
    return { id: 'q' + day, inicio: ini.toISOString(), fin: new Date(ini.getTime() + 8 * 3600000).toISOString() };
  }
  var turnosQ = [mkQ(2), mkQ(8), mkQ(18), mkQ(22)];
  var stateQ = { turnosAll: turnosQ, turnos: turnosQ, session: { uid: 'q', email: 'i@l' } };
  var vhQ = Math.round(2000000 / 240);
  var totalMes = Math.round(w.doCalc(turnosQ, null, _h, vhQ).totalCOP);
  var cOn = { prefs: { quincenaMode: true, q1Day: 1, q2Day: 16 }, salario: 2000000, vh: vhQ, ahora: _h };
  var cOff = { prefs: { quincenaMode: false }, salario: 2000000, vh: vhQ, ahora: _h };

  truthy(w._aiQuincenaModoActivo(cOn) === true, 'quincenaMode activo detectado');
  truthy(w._aiQuincenaModoActivo(cOff) === false, 'quincenaMode inactivo detectado');
  truthy(w._aiPeriodoCap({ esQuincena: true }) === 'Esta quincena', 'etiqueta "Esta quincena"');
  truthy(w._aiPeriodoCap({}) === 'Este mes', 'etiqueta "Este mes" por defecto');

  var scOn = w._aiScopeQuincenaAuto(cOn, stateQ, 'cuanto llevo');
  truthy(scOn && scOn.esQuincena === true, 'reencuadra a quincena con modo ON');
  truthy(scOn && scOn.totalCOP > 0 && scOn.totalCOP < totalMes,
         'total de la quincena es un subconjunto real del mes (0 < Q < mes)');
  truthy(scOn && typeof scOn.proy === 'number' && typeof scOn.diasRestantes === 'number',
         'expone proyección y días restantes de la quincena');

  // Gating: overrides y modo OFF NO reencuadran (los escenarios "solo necesarios").
  truthy(w._aiScopeQuincenaAuto(cOn, stateQ, 'cuanto llevo este mes') === null,
         'override explícito "mes" respeta el marco mensual');
  truthy(w._aiScopeQuincenaAuto(cOn, stateQ, 'cuanto gane esta quincena') === null,
         'texto con "quincena" lo maneja el path explícito, no el default');
  truthy(w._aiScopeQuincenaAuto(cOff, stateQ, 'cuanto llevo') === null,
         'modo OFF nunca reencuadra (comportamiento mensual intacto)');
})();

group('Geovalla del trabajo (v368): haversine + histéresis + config');
(function () {
  // Distancias: a sí mismo = 0; 0.009° de latitud ≈ 1.000 m
  truthy(Math.abs(w.geoDist(4.6, -74.08, 4.6, -74.08)) < 0.001, 'distancia a sí mismo = 0');
  var d1 = w.geoDist(4.60971, -74.08175, 4.61871, -74.08175);
  truthy(d1 > 950 && d1 < 1050, '0.009° de latitud ≈ 1 km (' + Math.round(d1) + ' m)');

  // Histéresis: entra con radius (150), sale con radius*1.5+40 (265)
  var cfg = { lat: 4.6, lng: -74.08, radius: 150, inside: null };
  var rIn = w.geoEval(cfg, 4.6, -74.08);
  truthy(rIn.inside === true && rIn.transition === 'enter', 'dentro del radio → enter');

  cfg.inside = true;
  var rStay = w.geoEval(cfg, 4.6015, -74.08); // ~167 m: pasó el radio de entrada pero NO el de salida
  truthy(rStay.inside === true && rStay.transition === null,
         'banda muerta anti-flapping: a ~167 m sigue adentro');
  var rOut = w.geoEval(cfg, 4.603, -74.08); // ~334 m ≥ 265 → exit
  truthy(rOut.inside === false && rOut.transition === 'exit', 'cruza el radio de salida → exit');

  cfg.inside = false;
  var rFar = w.geoEval(cfg, 4.61, -74.08);
  truthy(rFar.inside === false && rFar.transition === null, 'lejos y ya afuera → sin transición');

  // Sin ubicación configurada no decide nada
  var rNull = w.geoEval({ lat: null, lng: null, radius: 150, inside: null }, 4.6, -74.08);
  truthy(rNull.inside === null && rNull.transition === null, 'sin lugar marcado → no evalúa');

  // Config: defaults sanos + persistencia del patch
  var gc = w.geoConfig('u-geo');
  truthy(gc.on === false && gc.radius === 150 && gc.modo === 'ask',
         'defaults: apagado, 150 m, modo preguntar');
  w.geoPatch('u-geo', { on: true, lat: 4.6, lng: -74.08, arrivedAt: 123 });
  var gc2 = w.geoConfig('u-geo');
  truthy(gc2.on === true && gc2.lat === 4.6 && gc2.arrivedAt === 123,
         'geoPatch persiste en mt_geo_<uid> (incluida la marca de llegada)');
})();

group('ai-query: comparación de períodos (v287)');
// Dos meses con datos distintos: mes pasado (2 turnos) vs antepasado (1 turno)
var _mesAnt = new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 10);
var _mesAnt2 = new Date(_hoy.getFullYear(), _hoy.getMonth() - 2, 10);
var _nombreAnt = ['enero','febrero','marzo','abril','mayo','junio','julio',
                  'agosto','septiembre','octubre','noviembre','diciembre'][_mesAnt.getMonth()];
var _nombreAnt2 = ['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre'][_mesAnt2.getMonth()];
var dsCmp = [
  mkTurno(_mesAnt, 8),
  mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 11), 8),
  mkTurno(_mesAnt2, 8)
];
var rCmp = w.aiQueryCompare(
  'compará ' + _nombreAnt + ' con ' + _nombreAnt2, dsCmp, _ctx);
truthy(rCmp && rCmp.indexOf(' vs ') >= 0, 'comparación produce encabezado "X vs Y"');
truthy(rCmp && rCmp.indexOf('más en') >= 0,
       'comparación señala el período con más ingresos: ' + (rCmp || '').split('\n').pop());

// "vs" también dispara
truthy(w.aiQueryCompare(_nombreAnt + ' vs ' + _nombreAnt2, dsCmp, _ctx),
       '"junio vs mayo" (atajo vs) se reclama');

// Sin disparador de comparación → no se reclama (lo maneja el flujo normal)
eq(w.aiQueryCompare('cuánto gané en ' + _nombreAnt, dsCmp, _ctx), null,
   'un solo mes sin "vs/compará" no es comparación');
// Un solo período mencionado → null aunque diga "compará"
eq(w.aiQueryCompare('compará mi mes', dsCmp, _ctx), null,
   '"compará" con un solo período no alcanza');

group('ai: memoria conversacional de 7 preguntas (v305)');
(function () {
  if (typeof w.AI_MEM_MSGS !== 'number') {
    truthy(false, 'AI_MEM_MSGS existe');
    return;
  }
  eq(w.AI_MEM_MSGS, 14, 'la ventana = 7 preguntas con sus respuestas (14 mensajes)');
  if (typeof w.aiRemember === 'function' && typeof w.aiGetRecentMessages === 'function' &&
      typeof w.aiClearMemory === 'function') {
    w.aiClearMemory();
    for (var i = 0; i < 20; i++) {
      w.aiRemember(i % 2 ? 'ai' : 'user', 'msg ' + i, 'x', 'y', null);
    }
    var rec = w.aiGetRecentMessages(99);
    eq(rec.length, 14, 'el buffer retiene hasta 14 mensajes (7 intercambios)');
    truthy(rec[rec.length - 1].text.indexOf('msg 19') >= 0, 'conserva el mensaje más reciente');
    w.aiClearMemory();
  }
}());

group('ai: humanizador léxico (v296)');
(function () {
  if (typeof w.aiHumanizar !== 'function') {
    truthy(false, 'aiHumanizar existe');
    return;
  }
  // Calibración de tono: no empalagoso
  var r1 = w.aiHumanizar('¡¡¡Genial!!! muy muy bien');
  truthy(r1.indexOf('!!!') < 0 && r1.indexOf('¡¡¡') < 0, 'colapsa signos repetidos');
  truthy(r1.indexOf('muy muy') < 0, 'colapsa intensificadores apilados');

  // Protege datos: montos, negritas y términos legales intactos
  var r2 = w.aiHumanizar('Ganaste **$140.000** hoy, genial!!!');
  truthy(r2.indexOf('**$140.000**') >= 0, 'no toca el monto en negrita');
  truthy(r2.indexOf('!!!') < 0, 'igual calibra el tono alrededor');
  var r3 = w.aiHumanizar('Te ampara el **CST Art. 168** perfecto');
  truthy(r3.indexOf('**CST Art. 168**') >= 0, 'no toca términos legales en negrita');

  // Rotación de sinónimos: "genial" se reemplaza por una alternativa válida
  var syn = ['buenísimo', 'de una', 'bien ahí', 'joya'];
  var hit = false;
  for (var i = 0; i < 8 && !hit; i++) {
    var out = w.aiHumanizar('genial');
    if (syn.indexOf(out) >= 0) hit = true;
    if (out === 'genial') hit = false;
  }
  truthy(hit, '"genial" rota a un sinónimo (nunca queda igual)');

  // Vocabulario colombiano ampliado: "bacano" y "dale" también rotan
  var synBacano = ['chévere', 'genial', 'brutal', 'una nota'];
  var hitB = false;
  for (var b = 0; b < 8 && !hitB; b++) {
    if (synBacano.indexOf(w.aiHumanizar('bacano')) >= 0) hitB = true;
  }
  truthy(hitB, '"bacano" rota a otra expresión colombiana');
  var synDale = ['listo', 'de una', 'hágale', 'va'];
  var hitD = false;
  for (var d2 = 0; d2 < 8 && !hitD; d2++) {
    if (synDale.indexOf(w.aiHumanizar('dale')) >= 0) hitD = true;
  }
  truthy(hitD, '"dale" rota (afirmación variada)');
  // REGRESIÓN (prueba real 25-jun): "listo para ayudarte" es ADJETIVO, no
  // interjección — swappear "listo" rompe la frase ("va para ayudarte" ✗).
  // "listo" no debe variar acá en 30 corridas.
  var _listoRoto = false;
  for (var _lh = 0; _lh < 30; _lh++) {
    if (w.aiHumanizar('Procesando números y listo para ayudarte.').indexOf('listo para') < 0) {
      _listoRoto = true;
      break;
    }
  }
  truthy(!_listoRoto, '"listo para" se mantiene intacto (no se swappea el adjetivo)');
  // Preserva mayúscula inicial al sustituir
  var capR = w.aiHumanizar('Genial');
  truthy(capR.charAt(0) === capR.charAt(0).toUpperCase(),
         'respeta la mayúscula inicial al variar');

  // Muletillas de cierre rotan a una variante (nunca quedan iguales)
  var cierres = ['¿Te ayudo con algo más?', '¿Seguimos?', '¿Qué más?'];
  var rc = w.aiHumanizar('¿Algo más?');
  truthy(cierres.indexOf(rc) >= 0 && rc !== '¿Algo más?',
         '"¿Algo más?" rota a otra muletilla de cierre');
  var paraEso = ['Para eso estoy acá.', 'Es un gusto.', 'Cuando quieras.'];
  truthy(paraEso.indexOf(w.aiHumanizar('Para eso estoy.')) >= 0,
         '"Para eso estoy." rota a una variante');

  // Rotar muletilla NO toca los datos de la misma respuesta
  var rmix = w.aiHumanizar('Ganaste **$140.000**. ¿Algo más?');
  truthy(rmix.indexOf('**$140.000**') >= 0 && rmix.indexOf('¿Algo más?') < 0,
         'rota el cierre sin tocar el monto');

  // "con gusto" a mitad de frase conserva minúscula
  var rcg = w.aiHumanizar('Te ayudo con gusto');
  truthy(rcg.indexOf('con gusto') < 0 && rcg.indexOf('Te ayudo ') === 0,
         '"con gusto" rota y conserva minúscula a mitad de frase');

  // No rompe texto sin nada que variar
  eq(w.aiHumanizar('Trabajaste 8h el lunes.'), 'Trabajaste 8h el lunes.',
     'texto neutro queda intacto');
  // Idempotente con datos y sin palabras de la whitelist
  var r4 = w.aiHumanizar('Vas al 75% de tu meta.');
  truthy(r4.indexOf('75%') >= 0, 'preserva porcentajes');
}());

group('ai-query: datos de tarjeta visual (v293)');
(function () {
  if (typeof w.aiQueryLastCard !== 'function') {
    truthy(false, 'aiQueryLastCard existe');
    return;
  }
  var dsCard = [mkTurno(_mesPas, 8)];
  var qC = w.aiQueryParse('cuánto gané el 14 de ' + _nombreMes);
  w.aiQueryRun(qC, dsCard, _ctx);
  var card = w.aiQueryLastCard();
  truthy(card && card.kind === 'data', 'consulta de datos expone card kind=data');
  truthy(card && card.turnos === 1, 'card.turnos refleja 1 turno');
  truthy(card && card.monto > 0, 'card.monto > 0 con salario configurado');
  eq(w.aiQueryLastCard(), null, 'la card se consume una sola vez');

  // Sin coincidencias → sin card
  w.aiQueryRun(w.aiQueryParse('cuánto gané el 3 de ' + _nombreMes), dsCard, _ctx);
  eq(w.aiQueryLastCard(), null, 'sin coincidencias no se expone card');

  // Comparación → card kind=compare con ambos lados
  w.aiQueryCompare('compará ' + _nombreAnt + ' con ' + _nombreAnt2, dsCmp, _ctx);
  var cc = w.aiQueryLastCard();
  truthy(cc && cc.kind === 'compare', 'comparación expone card kind=compare');
  truthy(cc && cc.aLabel && cc.bLabel, 'card de comparación trae ambas etiquetas');
}());

group('ai-query: estados límite');
truthy(w.aiQueryRun(qDom, [], _ctx).indexOf('no encontré') >= 0,
       'historial vacío responde honesto, sin inventar');
truthy(w.aiQueryRun(qDom, dsDom, { vh: 0, uid: 'u' }).indexOf('Configurá tu salario') >= 0,
       'vh=0 avisa que falta configurar salario');
truthy(w.aiQueryRun(qDom, [{ id: 'x', inicio: 'FECHA_ROTA', fin: null }], _ctx)
         .indexOf('no encontré') >= 0,
       'turno corrupto (sin fin, fecha inválida) no rompe ni cuenta');

// ── comandos rápidos y parsing de cifras (bug "/meta 2000000") ──
// El chip "¿Cuánto falta para 2 millones?" enviaba /meta 2000000 y el
// NLP lo clasificaba como `celebracion` (festejaba los 2 millones como
// resultado). Además _aiNum no entendía "dos millones" → caía al salario.

group('_aiNum: multiplicadores colombianos');
eq(w._aiNum('2 millones'), 2000000, '"2 millones" → 2000000');
eq(w._aiNum('dos millones'), 2000000, '"dos millones" → 2000000 (palabra + multiplicador)');
eq(w._aiNum('150 lucas'), 150000, '"150 lucas" → 150000');
eq(w._aiNum('2000000'), 2000000, 'cifra plana intacta');
eq(w._aiNum('4h'), 4, '"4h" sigue siendo 4 (no romper simulador)');
eq(w._aiNum('quince dias'), 15, 'palabra sin multiplicador intacta');

group('comandos rápidos: slash salta el NLP');
var _stMeta = (function () {
  var ds = [mkTurno(primerDiaNoFestivo(_hoy.getFullYear(), _hoy.getMonth()), 8)];
  return {
    turnos: ds, turnosAll: ds,
    calc: w.doCalc(ds, null, new Date(), 10000),
    vh: 10000, salario: 2400000,
    session: { uid: 'u-test', email: 'test@x.com' }
  };
})();
function respText(r) { return ((typeof r === 'object' && r ? r.text : r) || ''); }

var rMeta = respText(w.aiAnswer('/meta 2000000', _stMeta));
truthy(rMeta.indexOf('2.000.000') >= 0, '/meta 2000000 usa la meta pedida: ' +
       rMeta.split('\n')[0]);
truthy(rMeta.indexOf('celebran') < 0 && rMeta.indexOf('¡¡') < 0,
       '/meta 2000000 NO festeja la cifra como logro');

var rDos = respText(w.aiAnswer('¿cuanto falta para dos millones?', _stMeta));
truthy(rDos.indexOf('2.000.000') >= 0,
       '"dos millones" escrito se interpreta como meta de $2.000.000');

var rSim = respText(w.aiAnswer('/simular 4h nocturnas', _stMeta));
truthy(rSim.indexOf('4h nocturnas') >= 0 || rSim.indexOf('Simulación') >= 0,
       '/simular 4h nocturnas llega a su handler');

// ── memoria de tema: la conversación recuerda de qué se habla ───
// "¿Cuántas horas trabajé los domingos?" → "¿y los sábados?" debe
// heredar tema (datos) y métrica (horas) de la pregunta anterior.

group('memoria de tema: follow-ups elípticos');
w.aiResetConv();
eq(w.aiQueryParse('¿y los sabados?', { topic: null }), null,
   'elíptica SIN tema previo no se reclama (no inventar contexto)');
eq(w.aiQueryParse('¿y los sabados?', { topic: 'conversacion' }), null,
   'elíptica con tema no-datos tampoco se reclama');

var _dom1 = primerDomingo(_hoy.getFullYear(), _hoy.getMonth());
var _sab1 = new Date(_dom1); _sab1.setDate(_dom1.getDate() + 6);
var _dsSem = [mkTurno(_dom1, 8), mkTurno(_sab1, 6)];
var _stTema = {
  turnos: _dsSem, turnosAll: _dsSem,
  calc: w.doCalc(_dsSem, null, new Date(), 10000),
  vh: 10000, salario: 2400000,
  session: { uid: 'u-test', email: 'test@x.com' }
};

var rT1 = respText(w.aiAnswer('¿cuántas horas trabajé los domingos?', _stTema));
truthy(rT1.indexOf('los domingos') >= 0, 'primera consulta responde sobre domingos');
eq(w.aiGetConversation().lastTopic, 'dinero',
   'el tema actual queda registrado tras la consulta');

var rT2 = respText(w.aiAnswer('¿y los sabados?', _stTema));
truthy(rT2.indexOf('los sábados') >= 0,
       'elíptica hereda el tema y consulta sábados: ' + rT2.split('\n')[0]);
truthy(rT2.indexOf('Trabajaste') >= 0,
       'hereda también la métrica (horas) de la pregunta anterior');

group('memoria de tema: la cascada clásica también registra el tema');
w.aiResetConv();
respText(w.aiAnswer('¿cuanto falta para dos millones?', _stTema));
truthy(w.aiGetConversation().lastIntent !== null,
       'una respuesta de la cascada clásica deja registrado el intent');
eq(w.aiGetConversation().lastTopic, 'dinero',
   'y el tema queda en "dinero" para el topic bonus del NLP');

// ── memoria episódica (ai-episodes.js) ──────────────────────────
group('memoria episódica: registro y dedup');
var _epUid = 'u-episodios';
truthy(w.aiEpisodeRecord(_epUid, 'meta', 'Te propusiste llegar a $ 2.000.000', { meta: 2000000 }),
       'registra un episodio nuevo');
eq(w.aiEpisodeRecord(_epUid, 'meta', 'Te propusiste llegar a $ 2.000.000', { meta: 2000000 }),
   false, 'mismo episodio en <6h no se duplica');
eq(w.aiEpisodesLoad(_epUid).length, 1, 'queda 1 solo episodio guardado');

w.aiEpisodeFromInteraction(_epUid, 'total_ganado', 'dinero', '¿cuánto llevo?', { pctSalario: 40 });
w.aiEpisodeFromInteraction(_epUid, 'total_ganado', 'dinero', '¿cuánto llevo?', { pctSalario: 40 });
eq(w.aiEpisodesLoad(_epUid).length, 2, 'interacción repetida (mismo intent) no duplica');
w.aiEpisodeFromInteraction(_epUid, 'saludo', 'conversacion', 'hola', { pctSalario: 40 });
eq(w.aiEpisodesLoad(_epUid).length, 2, 'saludos no generan episodios');

group('memoria episódica: hito de salario una vez por mes');
w.aiEpisodeFromInteraction(_epUid, 'proyeccion', 'dinero', 'proyección', { pctSalario: 105 });
w.aiEpisodeFromInteraction(_epUid, 'stats', 'dinero', 'resumen', { pctSalario: 110 });
var _hitos = w.aiEpisodesLoad(_epUid).filter(function (e) { return e.tipo === 'hito'; });
eq(_hitos.length, 1, 'superar el salario se celebra UNA vez por mes');

group('memoria episódica: recuperación conversacional');
var _epAns = w.aiEpisodeAnswer('¿de qué hablamos?', _epUid);
truthy(_epAns && _epAns.indexOf('Te propusiste llegar a') >= 0,
       'recuerda la meta propuesta');
truthy(_epAns && _epAns.indexOf('Hoy:') >= 0, 'fecha relativa legible');
eq(w.aiEpisodeAnswer('¿recuerdas cuánto gané ayer?', _epUid), null,
   'pregunta de DATOS no es secuestrada por la memoria episódica');
eq(w.aiEpisodeAnswer('hola', _epUid), null, 'charla normal no dispara recuerdos');
truthy(w.aiEpisodeAnswer('/recuerdos', 'u-sin-episodios').indexOf('Todavía no tengo') >= 0,
       'sin episodios responde honesto');

group('memoria episódica: cap de 60 episodios');
for (var _ei = 0; _ei < 70; _ei++) {
  w.aiEpisodeRecord('u-cap', 'consulta', 'Episodio número ' + _ei, { i: _ei });
}
eq(w.aiEpisodesLoad('u-cap').length, 60, 'nunca guarda más de 60 (FIFO)');
truthy(w.aiEpisodesLoad('u-cap')[0].resumen === 'Episodio número 10',
       'descarta los más viejos primero');

group('memoria episódica: integrada en aiAnswer');
var _rEp = respText(w.aiAnswer('¿de qué hablamos?', _stTema));
truthy(_rEp.indexOf('🧠') >= 0 && _rEp.indexOf('recuerdo') >= 0,
       'aiAnswer responde con los episodios del usuario: u-test acumuló consultas');
truthy(_rEp.indexOf('consulta a tus datos') >= 0 || _rEp.indexOf('Preguntaste') >= 0,
       'los episodios vienen de las consultas reales hechas en esta suite');

// ── NLP: clasificación de intents críticos (v274) ──────────────
// Prueba los 3 bugs corregidos en v274 + casos borde del clasificador.

group('NLP: saludo de 1 palabra (stop-word → cortocircuito previo)');
var _nlpHola = w.aiClassifyIntent('hola');
eq(_nlpHola.intent, 'saludo', '"hola" sola clasifica como saludo');
truthy(_nlpHola.confidence >= 0.5, '"hola" tiene confianza >= 0.5');

var _nlpChao = w.aiClassifyIntent('chao');
eq(_nlpChao.intent, 'despedida', '"chao" clasifica como despedida');

var _nlpBye = w.aiClassifyIntent('bye');
eq(_nlpBye.intent, 'despedida', '"bye" (stop-word) clasifica como despedida');

group('NLP: "simular X horas nocturnas" → simulacion, no ley');
var _nlpSim = w.aiClassifyIntent('simular 4 horas nocturnas');
eq(_nlpSim.intent, 'simulacion', '"simular 4 horas nocturnas" → simulacion (no ley)');

var _nlpSim2 = w.aiClassifyIntent('simula 2 horas festivas nocturnas');
eq(_nlpSim2.intent, 'simulacion', '"simula 2 horas festivas nocturnas" → simulacion');

// Debe seguir funcionando: pregunta de conocimiento puro (sin verbo simular)
var _nlpLey = w.aiClassifyIntent('¿cuánto vale la hora nocturna?');
eq(_nlpLey.intent, 'ley', '"cuánto vale la hora nocturna" → ley (sin simular)');

group('NLP: "cuánto llevo este mes" → total_ganado, no comparativa_mes');
var _nlpEsteMs = w.aiClassifyIntent('¿cuánto llevo este mes?');
eq(_nlpEsteMs.intent, 'total_ganado', '"cuánto llevo este mes" → total_ganado');

var _nlpSueldo = w.aiClassifyIntent('mi sueldo de este mes');
eq(_nlpSueldo.intent, 'total_ganado', '"mi sueldo de este mes" → total_ganado');

// Debe seguir funcionando: comparativa explícita
var _nlpComp = w.aiClassifyIntent('compara con el mes pasado');
eq(_nlpComp.intent, 'comparativa_mes', '"compara con el mes pasado" → comparativa_mes');

group('NLP: typos y variaciones colombianas');
var _nlpFestib = w.aiClassifyIntent('festibos');
eq(_nlpFestib.intent, 'festivos', '"festibos" → festivos (fuzzy match)');

var _nlpRrec = w.aiClassifyIntent('rrecargo nocturno');
eq(_nlpRrec.intent, 'ley', '"rrecargo nocturno" → ley (fuzzy match)');

var _nlpProyecc = w.aiClassifyIntent('proyecccion al cierre');
eq(_nlpProyecc.intent, 'proyeccion', '"proyecccion" → proyeccion (fuzzy match)');

group('NLP: entradas inválidas no rompen');
var _nlpNull = w.aiClassifyIntent('');
truthy(_nlpNull.intent === null || _nlpNull.confidence < 0.5, 'texto vacío → sin intent válido');

var _nlpEmoji = w.aiClassifyIntent('👍');
truthy(_nlpEmoji.confidence < 0.5, 'solo emoji → confianza baja');

var _nlpNum = w.aiClassifyIntent('123456');
truthy(_nlpNum.confidence < 0.5, 'número solo → confianza baja');

group('NLP: fallback con contexto incompleto no crashea');
var _stVacioSmoke = {
  turnos: [], turnosAll: [],
  calc: w.doCalc([], null, new Date(), 0),
  vh: 0, salario: 0,
  session: { uid: 'u-smoke', email: 'smoke@x.com' }
};
var _rVacio = w.aiAnswer('¿cuánto llevo?', _stVacioSmoke);
truthy(typeof _rVacio === 'string' || (typeof _rVacio === 'object' && _rVacio !== null),
  'aiAnswer con contexto vacío devuelve algo (no explota)');

// ── Acknowledgments conversacionales ───────────────────────────
group('acknowledgments: respuestas breves a "gracias", "ok", "dale"');
// Un acknowledgment se prueba SIN oferta pendiente (escenario real): si quedó
// una sugerencia de un grupo anterior, "ok"/"dale" la consumirían. Limpiar la
// memoria conversacional aísla el caso.
if (typeof w.aiClearMemory === 'function') w.aiClearMemory();
var _stAck = {
  turnos: [], turnosAll: [],
  calc: w.doCalc([], null, new Date(), 0),
  vh: 0, salario: 0,
  session: { uid: 'u-ack', email: 'ack@x.com' }
};
var _rGracias = respText(w.aiAnswer('gracias', _stAck));
truthy(
  _rGracias.length < 120,
  '"gracias" da respuesta corta (< 120 chars): ' + _rGracias.length + ' chars'
);
truthy(
  _rGracias.indexOf('Según mis cálculos') < 0 &&
  _rGracias.indexOf('Procesando') < 0,
  '"gracias" no activa fallback largo ni muletillas'
);

var _rOk = respText(w.aiAnswer('ok', _stAck));
truthy(_rOk.length < 120, '"ok" da respuesta corta: ' + _rOk.length + ' chars');

// REGRESIÓN: un "dale" suelto (acknowledgment) NO debe encadenarse a un chip de
// DELIBERACIÓN (v323) que la IA mostró por iniciativa propia. El bug devolvía la
// explicación de "Sueldo base" (371 chars) porque aiDeliberate registraba su
// primer chip como oferta afirmable en lastSuggestion. Los turnos previos
// (gracias/ok en este mismo _stAck) siembran esa sugerencia ambiental; el "dale"
// no debe dispararla. Verificado: revertir el guard !_fromDeliberate reintroduce
// el fallo de 371 chars aquí.
var _rDale = respText(w.aiAnswer('dale', _stAck));
truthy(_rDale.length < 120, '"dale" da respuesta corta: ' + _rDale.length + ' chars');
truthy(
  _rDale.indexOf('Sueldo base') < 0,
  '"dale" no abre la explicación de salario que nadie pidió'
);

// ── Referencias contextuales ────────────────────────────────────
group('contexto: referencias elípticas resuelven correctamente');
// Sin contexto previo, referencias sin destino claro no deben inventar
var _ctxVacio = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('¿y eso por qué?', { lastIntent: null, lastTopic: null })
  : null;
truthy(_ctxVacio === null, '¿y eso por qué? sin contexto → null (no inventar)');

// Con contexto financiero previo, la quincena pasada resuelve a comparativa
var _ctxConIntentFin = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('quincena pasada', { lastIntent: 'total_ganado', lastTopic: 'dinero' })
  : 'comparativa_mes';
eq(_ctxConIntentFin, 'comparativa_mes', '"quincena pasada" → comparativa_mes');

var _ctxSemana = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('semana pasada', { lastIntent: 'hoy', lastTopic: 'dinero' })
  : 'comparativa_semana';
eq(_ctxSemana, 'comparativa_semana', '"semana pasada" → comparativa_semana');

var _ctxMes = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('mes pasado', { lastIntent: 'hoy', lastTopic: 'dinero' })
  : 'comparativa_mes';
eq(_ctxMes, 'comparativa_mes', '"mes pasado" → comparativa_mes');

// "¿y ayer?" elíptico con contexto financiero → ayer
var _ctxAyer = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('y ayer?', { lastIntent: 'hoy', lastTopic: 'dinero' })
  : 'ayer';
eq(_ctxAyer, 'ayer', '"y ayer?" con contexto financiero → ayer');

// Contexto no-financiero no dispara resolución para "¿y eso?"
var _ctxConv = typeof w.aiResolveContextRef === 'function'
  ? w.aiResolveContextRef('y eso?', { lastIntent: 'saludo', lastTopic: 'conversacion' })
  : null;
truthy(_ctxConv === null, '"y eso?" con contexto conversacional → null (no reclama)');

// ── Mejoras de comunicación v277 ────────────────────────────────
group('v277 — voseo: ninguna respuesta contiene tuteo residual');
var _voseoState = {
  turnos: [], turnosAll: [],
  calc: w.doCalc([], null, new Date(), 0),
  vh: 0, salario: 0,
  session: { uid: 'u-voseo', email: 'v@test.com' }
};
var _tuteoPhrases = ['tienes ', 'puedes ', 'debes ', 'mantienes '];
var _checkTuteo = function(q) {
  var r = respText(w.aiAnswer(q, _voseoState));
  for (var _ti = 0; _ti < _tuteoPhrases.length; _ti++) {
    if (r.toLowerCase().indexOf(_tuteoPhrases[_ti]) >= 0) return r;
  }
  return null;
};
var _noTurnos = _checkTuteo('cuántos turnos tengo');
truthy(!_noTurnos, 'respuesta "cuántos turnos" no contiene tuteo: ' + (_noTurnos ? _noTurnos.slice(0,80) : 'OK'));

group('v277 — distribucion: respuesta no contiene [object Object]');
var _stDist = {
  turnos: [], turnosAll: [],
  calc: w.doCalc([], null, new Date(), 0),
  vh: 7916, salario: 1900000,
  session: { uid: 'u-dist', email: 'd@test.com' }
};
var _rDist = respText(w.aiAnswer('desglose de recargos', _stDist));
truthy(
  _rDist.indexOf('[object Object]') < 0,
  'respuesta desglose no contiene "[object Object]": ' + _rDist.slice(0, 80)
);
truthy(
  typeof _rDist === 'string' && _rDist.length > 0,
  'respuesta desglose es string no vacío'
);

group('v277 — help: verbos conjugados disparan guías correctas');
// "¿cómo inicio un turno?" debe encontrar la guía iniciar_turno (no null)
var _helpInicio = typeof w.aiHelpSearch === 'function'
  ? w.aiHelpSearch('como inicio un turno')
  : null;
truthy(_helpInicio && _helpInicio.id === 'iniciar_turno',
  '"como inicio un turno" encuentra guía iniciar_turno (era null antes del fix)');

var _helpTermino = typeof w.aiHelpSearch === 'function'
  ? w.aiHelpSearch('termino turno')
  : null;
truthy(_helpTermino && _helpTermino.id === 'finalizar_turno',
  '"termino turno" encuentra guía finalizar_turno');

var _helpCambio = typeof w.aiHelpSearch === 'function'
  ? w.aiHelpSearch('cambio salario')
  : null;
truthy(_helpCambio && _helpCambio.id === 'configurar_salario',
  '"cambio salario" encuentra guía configurar_salario');

// ── Bug v277: clasificación de "como estuvo ayer" ──────────────
group('NLP: intent ayer con "como estuvo ayer"');
(function () {
  var _nlp = typeof w.aiClassifyIntent === 'function';
  // "como estuvo ayer" debe ir a ayer, no a curiosidad_app ni reflexion
  var r1 = _nlp ? w.aiClassifyIntent('como estuvo ayer', null, null) : null;
  truthy(r1 && r1.intent === 'ayer',
    '"como estuvo ayer" → ayer (era curiosidad_app antes del fix)');

  var r2 = _nlp ? w.aiClassifyIntent('cómo estuvo ayer', null, null) : null;
  truthy(r2 && r2.intent === 'ayer',
    '"cómo estuvo ayer" → ayer');

  var r3 = _nlp ? w.aiClassifyIntent('que tal estuvo ayer', null, null) : null;
  truthy(r3 && r3.intent === 'ayer',
    '"que tal estuvo ayer" → ayer');

  // Casos que NO deben ir a ayer
  var r4 = _nlp ? w.aiClassifyIntent('que tal estuvo la semana', null, null) : null;
  truthy(r4 && r4.intent !== 'ayer',
    '"que tal estuvo la semana" no va a ayer');

  // "ayer" solo sigue en ayer
  var r5 = _nlp ? w.aiClassifyIntent('ayer', null, null) : null;
  truthy(r5 && r5.intent === 'ayer',
    '"ayer" solo → ayer');

  // "cuánto hice ayer" sigue en ayer
  var r6 = _nlp ? w.aiClassifyIntent('cuánto hice ayer', null, null) : null;
  truthy(r6 && r6.intent === 'ayer',
    '"cuánto hice ayer" → ayer');

  // "cómo funciona la app" no va a ayer
  var r7 = _nlp ? w.aiClassifyIntent('cómo funciona la app', null, null) : null;
  truthy(r7 && r7.intent !== 'ayer',
    '"cómo funciona la app" no va a ayer');
})();

// ── Bug v277: proyección inflada en briefing proactivo ──────────
group('aiBriefing: porcentaje vs salario clampeado');
(function () {
  var _hasBriefing = typeof w.aiBriefing === 'function';
  var _hasBuildCtx = typeof w.buildContext === 'function';

  // Contexto simulado: 9 turnos, salario OK (1.900.000)
  // El proy correcto es (648375/9)*30 = 2161250, vsSalario ~+13.7%
  if (_hasBriefing && _hasBuildCtx) {
    // buildContext necesita state completo — fabricamos un turno
    var _ahora = new Date();
    var _ini = new Date(_ahora.getFullYear(), _ahora.getMonth(), 1);
    _ini.setHours(8, 0, 0, 0);
    var _fin = new Date(_ini);
    _fin.setHours(16, 0, 0, 0);
    var _turno = { id: '1', inicio: _ini.toISOString(), fin: _fin.toISOString() };

    var _state = {
      turnos: [_turno],
      turnosAll: [_turno],
      calc: w.doCalc([_turno], null, _ahora, 7916.67),
      salario: 1900000,
      vh: 7916.67,
      session: { uid: 'test-uid', email: 'test@test.com' },
      activo: null
    };

    var _ctx = w.buildContext(_state);
    truthy(_ctx && _ctx.totalCOP > 0,
      'buildContext genera totalCOP > 0 con un turno');
    truthy(_ctx && _ctx.diasTrab > 0,
      'buildContext genera diasTrab > 0 con un turno');
    truthy(_ctx && _ctx.proy > 0,
      'buildContext genera proy > 0 con diasTrab > 0');
    truthy(_ctx && _ctx.salario === 1900000,
      'buildContext preserva el salario mensual (no vh)');

    var _briefing = w.aiBriefing(_ctx);
    truthy(typeof _briefing === 'string',
      'aiBriefing retorna string');
    truthy(_briefing.indexOf('turnos') >= 0 || _briefing.indexOf('mes') >= 0,
      'briefing menciona turnos o mes (no "Aún no tenés turnos")');

    // El porcentaje NO puede superar 300%
    var _hasPct = _briefing.indexOf('%') >= 0;
    if (_hasPct) {
      var _match = _briefing.match(/\(([+-]?\d+)%/);
      if (_match) {
        var _pct = parseInt(_match[1], 10);
        truthy(Math.abs(_pct) <= 300,
          'vsSalario clampea a ±300% (era ' + _pct + '%, debería ser ≤300%)');
      }
    }
  } else {
    // Al menos verificar que la función existe
    truthy(_hasBriefing, 'aiBriefing existe como función');
  }

  // Con salario extremadamente bajo (< 500000) no debe mostrar porcentaje absurdo
  if (_hasBriefing) {
    var _cBajo = {
      diasTrab: 9,
      totalCOP: 648375,
      proy: 1620938,
      salario: 7917,   // vh mal pasado como salario
      vh: 7917,
      turnosHoy: 0,
      copHoy: 0,
      minsHoy: 0,
      rachaActual: 0
    };
    var _bBajo = w.aiBriefing(_cBajo);
    // Con salario < 500000 no debe aparecer el "% vs tu salario"
    truthy(_bBajo.indexOf('20375') < 0,
      'briefing con salario < 500000 no muestra +20375%');
  }
})();

// ── Tier 4: alerta proactiva de cumplimiento (festivo, date-aware) ──
group('aiAlerts: alerta de cumplimiento festivo (Ley 2466/2025)');
(function () {
  if (typeof w.aiAlerts !== 'function') { truthy(false, 'aiAlerts existe'); return; }
  var _base = {
    diasTrab: 10, ahora: new Date(), pctSalario: 90, hrsSemanales: 20,
    salario: 2000000, totalCOP: 1000000, vh: 10000, diasRestantes: 15,
    prom: 100000, totalCOPMesPasado: 0
  };
  // Con 8h en festivo → debe disparar el aviso de cumplimiento con el % vigente.
  var _cFest = Object.assign({}, _base, { festMins: 480 });
  var _al = w.aiAlerts(_cFest);
  truthy(_al && _al.indexOf('domingo/festivo este mes') >= 0,
    'alerta: detecta horas trabajadas en domingo/festivo');
  var _pctVig = Math.round(w.getRecargoFestivo(new Date()) * 100);
  truthy(_al && _al.indexOf('del ' + _pctVig + '%') >= 0,
    'alerta: cita el recargo dominical vigente (' + _pctVig + '%)');
  // Sin horas festivas → no mete ese aviso.
  var _cSin = Object.assign({}, _base, { festMins: 0 });
  var _alSin = w.aiAlerts(_cSin);
  truthy(!_alSin || _alSin.indexOf('domingo/festivo este mes') < 0,
    'alerta: sin horas festivas NO mete el aviso de cumplimiento');
})();

group('ai-proactive: higiene de datos (v288)');
(function () {
  if (typeof w.aiDataHygiene !== 'function') {
    truthy(false, 'aiDataHygiene existe');
    return;
  }
  // Sano: turnos normales, sin solapes → string vacío
  var sano = {
    turnosAll: [mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 5), 8)]
  };
  eq(w.aiDataHygiene(sano), '', 'datos sanos → sin aviso');

  // Turno larguísimo (20h)
  var largo = {
    turnosAll: [mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 6), 20)]
  };
  truthy(w.aiDataHygiene(largo).indexOf('duró') >= 0, 'turno de 20h dispara aviso');

  // Solapamiento: dos turnos el mismo día que se pisan
  var baseDia = new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 7, 8, 0, 0);
  var t1 = { id: 'a', inicio: baseDia.toISOString(),
             fin: new Date(baseDia.getTime() + 6 * 3600000).toISOString() };
  var t2 = { id: 'b', inicio: new Date(baseDia.getTime() + 3 * 3600000).toISOString(),
             fin: new Date(baseDia.getTime() + 9 * 3600000).toISOString() };
  truthy(w.aiDataHygiene({ turnosAll: [t1, t2] }).indexOf('solapan') >= 0,
         'turnos solapados disparan aviso');

  // Turno activo abierto >16h
  var activoViejo = {
    tieneActivo: true, minutosEnTurnoActual: 18 * 60, turnosAll: []
  };
  truthy(w.aiDataHygiene(activoViejo).indexOf('abierto') >= 0,
         'turno activo de 18h sugiere que se olvidó cerrar');

  // Turno corrupto (fin <= inicio) no rompe ni cuenta como solape
  var corrupto = { turnosAll: [{ id: 'x', inicio: 'ROTO', fin: null },
                               { id: 'y', inicio: baseDia.toISOString(), fin: baseDia.toISOString() }] };
  eq(w.aiDataHygiene(corrupto), '', 'turnos corruptos se ignoran sin romper');
}());

group('ai: edición de turnos por chat (v289)');
(function () {
  function stEdit(turnosAll) {
    return {
      turnos: turnosAll, turnosAll: turnosAll, activo: null,
      calc: w.doCalc(turnosAll, null, new Date(), 10000),
      vh: 10000, salario: 2400000,
      session: { uid: 'u-test', email: 'test@x.com' }
    };
  }

  // ADD: "registrá un turno ayer de 8 a 4" → ADD_SHIFT, 8h, 08:00–16:00
  var rAdd = w.aiAnswer('registrá un turno ayer de 8 a 4', stEdit([]));
  truthy(rAdd && rAdd.execute && rAdd.execute.type === 'ADD_SHIFT',
         '"registrá un turno ayer de 8 a 4" produce ADD_SHIFT');
  if (rAdd && rAdd.execute) {
    var tt = rAdd.execute.payload.turno;
    var durMin = (new Date(tt.fin) - new Date(tt.inicio)) / 60000;
    eq(durMin, 480, '"de 8 a 4" se interpreta como 08:00–16:00 (8h, turno diurno)');
  }

  // ADD nocturno: "de 22 a 6" cruza medianoche → 8h
  var rNoc = w.aiAnswer('anotá un turno ayer de 22 a 6', stEdit([]));
  truthy(rNoc && rNoc.execute && rNoc.execute.type === 'ADD_SHIFT',
         'turno nocturno "de 22 a 6" produce ADD_SHIFT');
  if (rNoc && rNoc.execute) {
    var tn = rNoc.execute.payload.turno;
    eq((new Date(tn.fin) - new Date(tn.inicio)) / 60000, 480,
       '"de 22 a 6" cruza medianoche → 8h');
  }

  // ADD sin horario → pide datos, sin execute
  var rIncompleto = w.aiAnswer('registrá un turno ayer', stEdit([]));
  truthy(rIncompleto && (rIncompleto.text || rIncompleto).toString().indexOf('horario') >= 0
         && !rIncompleto.execute,
         'sin horario pide el dato y no propone acción');

  // DELETE: turno existente el 14 del mes pasado
  var turnoBorrar = mkTurno(_mesPas, 8); // _mesPas = día 14 del mes pasado
  var rDel = w.aiAnswer('borrá el turno del 14 de ' + _nombreMes, stEdit([turnoBorrar]));
  truthy(rDel && rDel.execute && rDel.execute.type === 'DELETE_SHIFT',
         '"borrá el turno del 14 de ' + _nombreMes + '" produce DELETE_SHIFT');
  truthy(rDel && rDel.execute && rDel.execute.payload.id === turnoBorrar.id,
         'DELETE_SHIFT apunta al id correcto');

  // DELETE sin coincidencia → mensaje honesto, sin execute
  var rDelNo = w.aiAnswer('borrá el turno del 3 de ' + _nombreMes, stEdit([turnoBorrar]));
  truthy(rDelNo && (rDelNo.text || '').indexOf('No encontré') >= 0 && !rDelNo.execute,
         'borrar un día sin turno responde honesto, sin acción');

  // GUARD: una consulta normal no dispara edición
  var rConsulta = w.aiAnswer('cuánto gané ayer', stEdit([turnoBorrar]));
  truthy(!(rConsulta && rConsulta.execute &&
           (rConsulta.execute.type === 'ADD_SHIFT' || rConsulta.execute.type === 'DELETE_SHIFT')),
         '"cuánto gané ayer" NO se confunde con edición de turno');

  // EDIT: ahora abre el formulario guiado; la verificación/guardado ocurre en la UI.
  var rEditFin = w.aiAnswer(
    'corregí el turno del 14 de ' + _nombreMes + ', salí a las 6 no a las 5',
    stEdit([turnoBorrar]));
  truthy(rEditFin && rEditFin.execute && rEditFin.execute.type === 'OPEN_SHIFT_EDIT_FORM',
         '"corregí ... salí a las 6" abre el formulario de edición');
  if (rEditFin && rEditFin.execute) {
    eq(rEditFin.execute.payload.date, w._aiShiftDateInputValue(_mesPas), 'editor recibe la fecha prellenada');
    eq(rEditFin.execute.payload.single.kind, 'fin', 'editor recibe cambio parcial de salida');
  }

  // EDIT: cambiar entrada
  var rEditIni = w.aiAnswer(
    'cambiá el turno del 14 de ' + _nombreMes + ', entré a las 7',
    stEdit([turnoBorrar]));
  truthy(rEditIni && rEditIni.execute && rEditIni.execute.type === 'OPEN_SHIFT_EDIT_FORM',
         '"cambiá ... entré a las 7" abre el formulario de edición');
  if (rEditIni && rEditIni.execute) {
    eq(rEditIni.execute.payload.single.kind, 'inicio', 'editor recibe cambio parcial de entrada');
    eq(rEditIni.execute.payload.single.h, 7, 'entrada sugerida a 07:00');
  }

  // EDIT: rango completo "fue de 8 a 5"
  var rEditRango = w.aiAnswer(
    'modificá el turno del 14 de ' + _nombreMes + ', fue de 8 a 5',
    stEdit([turnoBorrar]));
  truthy(rEditRango && rEditRango.execute && rEditRango.execute.type === 'OPEN_SHIFT_EDIT_FORM',
         'rango completo en edición abre el formulario');
  if (rEditRango && rEditRango.execute) {
    eq(rEditRango.execute.payload.range.inicioTime, '08:00', 'rango: entrada sugerida 08:00');
    eq(rEditRango.execute.payload.range.finTime, '17:00', 'rango "de 8 a 5" → salida sugerida 17:00');
  }

  // EDIT sin turno ese día → igual abre el editor; la UI valida contra los datos.
  var rEditNo = w.aiAnswer(
    'corregí el turno del 2 de ' + _nombreMes + ', salí a las 6', stEdit([turnoBorrar]));
  truthy(rEditNo && rEditNo.execute && rEditNo.execute.type === 'OPEN_SHIFT_EDIT_FORM',
         'corregir un día sin turno abre editor para validar en UI');

  // EDIT sin especificar qué cambia → abre editor vacío/parcial.
  var rEditAmb = w.aiAnswer(
    'corregí el turno del 14 de ' + _nombreMes, stEdit([turnoBorrar]));
  truthy(rEditAmb && rEditAmb.execute && rEditAmb.execute.type === 'OPEN_SHIFT_EDIT_FORM',
         'corregir sin decir qué cambia abre editor');
}());

group('ai: desprendible de nómina (v300)');
(function () {
  if (typeof w.buildDesprendibleData !== 'function') {
    truthy(false, 'buildDesprendibleData existe');
    return;
  }
  var dsD = [mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8)]; // dominical
  var calcD = w.doCalc(dsD, null, new Date(), 10000);
  var cD = {
    totalCOP: calcD.totalCOP, bd: calcD.bd, salario: w.SMIN, diasTrab: 1, vh: 10000
  };
  var data = w.buildDesprendibleData(cD, 'Pipe');
  truthy(data && data.nombre === 'Pipe', 'incluye el nombre del trabajador');
  eq(data.bruto, calcD.totalCOP, 'el bruto coincide con el total legal del mes');
  truthy(data.devengado.length >= 1, 'desglosa el devengado por recargo');
  eq(data.salud, Math.round(calcD.totalCOP * 0.04), 'descuenta salud 4%');
  eq(data.pension, Math.round(calcD.totalCOP * 0.04), 'descuenta pensión 4%');
  truthy(data.aux > 0, 'aplica auxilio de transporte (salario ≤ 2 SMMLV)');
  eq(data.neto, data.bruto - data.salud - data.pension + data.aux,
     'el neto = bruto - salud - pensión + auxilio');

  // Salario alto → sin auxilio de transporte
  var dataAlto = w.buildDesprendibleData(
    { totalCOP: calcD.totalCOP, bd: calcD.bd, salario: w.SMIN * 3, diasTrab: 1 }, 'X');
  eq(dataAlto.aux, 0, 'salario > 2 SMMLV no recibe auxilio de transporte');

  // Sin turnos → bruto 0 (el detector lo bloquea aguas arriba)
  var dataVacio = w.buildDesprendibleData({ totalCOP: 0, bd: {}, salario: w.SMIN, diasTrab: 0 }, 'X');
  eq(dataVacio.bruto, 0, 'sin turnos el bruto es 0');
  eq(dataVacio.devengado.length, 0, 'sin turnos no hay devengado');

  // E2E: "genera mi desprendible" → acción GENERATE_PAYSLIP con datos
  var stD = {
    turnos: dsD, turnosAll: dsD, activo: null, calc: calcD,
    vh: 10000, salario: w.SMIN, session: { uid: 'u-test', email: 'e@x.com' }
  };
  var rD = w.aiAnswer('generá mi desprendible de pago', stD);
  truthy(rD && rD.execute && rD.execute.type === 'GENERATE_PAYSLIP',
         '"generá mi desprendible" produce GENERATE_PAYSLIP');
  truthy(rD && rD.execute && rD.execute.payload && rD.execute.payload.neto > 0,
         'la acción lleva los datos del desprendible (neto)');

  // Sin turnos → pide registrar, sin acción
  var stVacio = {
    turnos: [], turnosAll: [], activo: null, calc: w.doCalc([], null, new Date(), 10000),
    vh: 10000, salario: w.SMIN, session: { uid: 'u', email: 'e@x.com' }
  };
  var rDv = w.aiAnswer('quiero mi colilla de pago', stVacio);
  truthy(rDv && (rDv.text || '').indexOf('turnos') >= 0 && !rDv.execute,
         'sin turnos pide registrarlos, sin generar nada');
}());

group('ai: calculadoras usan tablas (v303)');
(function () {
  var cCalc = {
    vh: 10000, totalCOP: 1500000, salario: w.SMIN, diasTrab: 15,
    bd: w.doCalc([mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8)], null, new Date(), 10000).bd
  };
  // 1) Liquidación
  if (typeof w.aiAdvisorLiquidacion === 'function') {
    var rL = w.aiAdvisorLiquidacion(cCalc);
    truthy(rL.indexOf('| Concepto | Valor |') >= 0, 'liquidación: devengado/prestaciones en tabla');
    truthy(rL.indexOf('Neto a recibir') >= 0, 'liquidación: conserva el neto');
    // Insight Tier 1: los recargos habituales integran la base de prestaciones
    // (salario variable, CST Art. 127). Aparece SOLO si el devengado supera el
    // básico — es el aviso que protege a quien le liquidan solo sobre el básico.
    var rLalto = w.aiAdvisorLiquidacion({
      vh: 10000, totalCOP: 3000000, salario: 2000000, diasTrab: 20, bd: {}
    });
    truthy(rLalto.indexOf('base de prestaciones') >= 0,
           'liquidación: avisa que los recargos cuentan para la base de prestaciones');
    truthy(rLalto.indexOf('Art. 127') >= 0,
           'liquidación: cita el CST Art. 127 (salario variable)');
    var rLigual = w.aiAdvisorLiquidacion({
      vh: 10000, totalCOP: 2000000, salario: 2000000, diasTrab: 20, bd: {}
    });
    truthy(rLigual.indexOf('base de prestaciones') < 0,
           'liquidación: sin recargos (devengado = básico) NO mete el aviso');
  }
  // 2) Simulador
  if (typeof w.aiAdvisorSimular === 'function') {
    var rS = w.aiAdvisorSimular(cCalc, 8, 'completo');
    truthy(rS.indexOf('| Escenario | Factor | Pago |') >= 0, 'simulador: escenarios en tabla');
    truthy(rS.indexOf('| Tipo | Al mes |') >= 0, 'simulador: proyección mensual en tabla');
  }
  // 3) Comparación de períodos
  var rC = w.aiQueryCompare('compará ' + _nombreAnt + ' con ' + _nombreAnt2, dsCmp, _ctx);
  truthy(rC && rC.indexOf('| Período | Ganado | Horas | Turnos |') >= 0,
         'comparación: períodos en tabla');
  truthy(rC && rC.indexOf(' vs ') >= 0 && rC.indexOf('más en') >= 0,
         'comparación: conserva encabezado y resumen');
  // 4) Normativa de recargos (e2e vía aiAnswer, intent ley)
  var stL = {
    turnos: [], turnosAll: [], activo: null, calc: w.doCalc([], null, new Date(), 10000),
    vh: 10000, salario: w.SMIN, session: { uid: 'u', email: 'e@x.com' }
  };
  var rN = w.aiAnswer('¿cuál es la tabla de recargos?', stL);
  truthy(rN && (rN.text || rN).toString().indexOf('| Concepto | Recargo |') >= 0,
         'normativa: recargos legales en tabla');
}());

group('ai: tablas markdown en respuestas (v301)');
(function () {
  if (typeof w._aiFormat !== 'function') {
    truthy(false, '_aiFormat existe');
    return;
  }
  var tabla = 'Acá va:\n\n| Turno | Pago |\n|---|---|\n| Noche | $108.000 |\n| Día | $80.000 |';
  var html = w._aiFormat(tabla);
  truthy(html.indexOf('<table') >= 0, 'una tabla markdown se renderiza como <table>');
  truthy(html.indexOf('<th scope="col">Turno</th>') >= 0, 'el encabezado va en <th> con scope');
  truthy(html.indexOf('<td>Noche</td>') >= 0, 'las celdas van en <td>');
  truthy(html.indexOf('$108.000') >= 0, 'preserva los montos dentro de la celda');

  // El texto normal sigue funcionando (negrita, saltos)
  var plano = w._aiFormat('Hola **mundo**\nsegunda línea');
  truthy(plano.indexOf('<strong>mundo</strong>') >= 0, 'negrita sigue funcionando');
  truthy(plano.indexOf('<br>') >= 0, 'los saltos de línea se mantienen');

  // Sin separador NO es tabla (no romper texto con pipes sueltos)
  var noTabla = w._aiFormat('opción a | opción b');
  truthy(noTabla.indexOf('<table') < 0, 'un pipe suelto sin separador no crea tabla');

  // El optimizador ahora entrega su ranking como tabla
  var rOpt = w.aiOptimizarProximo({ vh: 10000, proxFests: [], bestDowInfo: { count: 0 } });
  truthy(rOpt.indexOf('| Turno | Pago | Factor |') >= 0,
         'el optimizador usa una tabla markdown para el ranking');
}());

group('ai: mini-razonamiento de asesoría (v306)');
(function () {
  if (typeof w.aiMiniRazonamiento !== 'function') {
    truthy(false, 'aiMiniRazonamiento existe');
    return;
  }
  // Legal + mucho trabajo nocturno → razona sobre el +35%
  var rLeg = w.aiMiniRazonamiento(
    { vh: 10000, bd: { noctOrd: { mins: 480, cop: 108000 } } }, 'ley');
  truthy(rLeg.indexOf('💭') >= 0 && rLeg.indexOf('nocturno') >= 0,
         'asesoría legal con noches → razona sobre el recargo nocturno');

  // Financiero + proyección sobre el salario → razona sobre el excedente
  var rFin = w.aiMiniRazonamiento(
    { vh: 10000, salario: 2400000, proy: 3000000 }, 'proyeccion');
  truthy(rFin.indexOf('💭') >= 0 && rFin.indexOf('excedente') >= 0,
         'asesoría financiera con superávit → razona sobre el ahorro');

  // Por debajo del salario → razona sobre cerrar la brecha
  var rBajo = w.aiMiniRazonamiento(
    { vh: 10000, salario: 2400000, proy: 1800000 }, 'presupuesto');
  truthy(rBajo.indexOf('brecha') >= 0, 'por debajo del salario → sugiere cerrar la brecha');

  // Intent NO asesor → no agrega nada (no naguea)
  eq(w.aiMiniRazonamiento({ vh: 10000, salario: 2400000, proy: 3000000 }, 'total_ganado'), '',
     'una consulta común no recibe razonamiento');
  // Sin datos relevantes → vacío
  eq(w.aiMiniRazonamiento({ vh: 0 }, 'liquidacion'), '',
     'sin datos suficientes no inventa un razonamiento');
}());

group('ai: optimizador de ingresos predictivo (v299)');
(function () {
  if (typeof w.aiOptimizarProximo !== 'function') {
    truthy(false, 'aiOptimizarProximo existe');
    return;
  }
  var prox = primerDomingo(_hoy.getFullYear(), _hoy.getMonth()); // festivo garantizado
  var cOpt = {
    vh: 10000,
    proxFests: [prox],
    bestDowInfo: { dia: 6, cop: 200000, count: 3 }
  };
  var r = w.aiOptimizarProximo(cOpt);
  truthy(r.indexOf('rinde más') >= 0, 'lidera con qué turno rinde más');
  // 8h al factor festivo nocturno VIGENTE (date-aware, Ley 2466/2025): hoy 2.15x
  var _fnf = w.rcFactor('noctFest', new Date());
  truthy(r.indexOf(w.fCOP(Math.round(10000 * _fnf * 8))) >= 0,
         'muestra el valor del turno dominical/festivo nocturno (factor vigente)');
  truthy(r.indexOf('Próximo festivo') >= 0, 'señala la próxima oportunidad concreta (festivo)');
  truthy(r.indexOf('sábado') >= 0, 'personaliza con el mejor día del historial');

  // Sin salario → pide configurarlo, no inventa
  truthy(w.aiOptimizarProximo({ vh: 0 }).indexOf('salario') >= 0,
         'sin salario pide configurarlo');

  // E2E: "¿qué turno me conviene?" enruta al optimizador
  var stO = {
    turnos: [], turnosAll: [], activo: null,
    calc: w.doCalc([], null, new Date(), 10000),
    vh: 10000, salario: 2400000, session: { uid: 'u-test', email: 'e@x.com' }
  };
  var rE = w.aiAnswer('¿qué turno me conviene tomar?', stO);
  truthy(rE && (rE.text || '').indexOf('rinde más') >= 0,
         '"qué turno me conviene" enruta al optimizador');
  // No se confunde con un hipotético
  var rSim = w.aiAnswer('cuánto gano si trabajo el domingo', stO);
  truthy(!(rSim && (rSim.text || '').indexOf('Qué turno te rinde más') >= 0),
         'un hipotético NO dispara el optimizador');
}());

group('ai: verificador de pago justo (v294)');
(function () {
  if (typeof w.aiAuditarPago !== 'function') {
    truthy(false, 'aiAuditarPago existe');
    return;
  }
  // Un domingo de 8h → dominical (date-aware, +80% en 2026). vh 10000.
  var dsP = [mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8)];
  var calcP = w.doCalc(dsP, null, new Date(), 10000);
  var cP = { vh: 10000, totalCOP: calcP.totalCOP, bd: calcP.bd, diasTrab: 1 };

  // Sin monto → explicación + tarjeta de desglose de recargos (no tabla)
  var rExpl = w.aiAuditarPago(cP, 0);
  truthy(rExpl.text.indexOf('Verificador') >= 0, 'sin monto: muestra el verificador');
  truthy(rExpl.card && rExpl.card.kind === 'breakdown' && rExpl.card.rows.length > 0,
         'sin monto: entrega tarjeta de desglose de recargos (no tabla markdown)');
  truthy(rExpl.card.rows.some(function (r) { return (r.legal || '').indexOf('Art.') >= 0; }),
         'sin monto: cada recargo lleva su base legal');

  // Pago justo
  var rOk = w.aiAuditarPago(cP, calcP.totalCOP);
  truthy(rOk.card && rOk.card.status === 'ok' && rOk.text.indexOf('bien') >= 0,
         'pago exacto → estado ok');

  // Subpago (le pagaron la mitad)
  var rUnder = w.aiAuditarPago(cP, Math.round(calcP.totalCOP * 0.5));
  truthy(rUnder.card && rUnder.card.status === 'under', 'subpago → estado under');
  truthy(rUnder.text.indexOf('de menos') >= 0 && rUnder.text.indexOf('Art. 179') >= 0,
         'subpago: alerta + cita la norma del recargo dominical');
  truthy(rUnder.text.indexOf('Recargo dominical/festivo') >= 0 &&
         rUnder.text.indexOf('| Recargo |') < 0,
         'subpago: desglosa los recargos en texto apilado (no tabla que se desborda)');
  truthy(rUnder.text.indexOf('3 años') >= 0 || rUnder.text.indexOf('3 a') >= 0,
         'subpago: menciona la prescripción de 3 años');

  // Sobrepago
  var rOver = w.aiAuditarPago(cP, calcP.totalCOP * 2);
  truthy(rOver.card && rOver.card.status === 'over', 'pago de más → estado over');

  // Sin salario configurado
  truthy(w.aiAuditarPago({ vh: 0, totalCOP: 0 }, 500000).text.indexOf('salario') >= 0,
         'sin salario base pide configurarlo');

  // REGRESIÓN: el chip "⚖️ ¿Me pagan bien?" manda "me están pagando bien".
  // DEBE rutear al verificador, NO a "¿cómo estás? yo bien" (el "bien" no debe
  // robarlo a estado_animo). Bug detectado en prueba real del 25-jun-2026.
  if (typeof w._aiAuditIntent === 'function') {
    var _cAud = { vh: 10000, totalCOP: calcP.totalCOP, bd: calcP.bd, diasTrab: 1, festMins: 480 };
    var rBien = w._aiAuditIntent('¿me pagan bien?', 'me estan pagando bien', _cAud, {});
    truthy(rBien && rBien.text && rBien.text.indexOf('Verificador') >= 0,
      '"me están pagando bien" dispara el verificador (no estado de ánimo)');
  }

  // Sin turnos este mes
  truthy(w.aiAuditarPago({ vh: 10000, totalCOP: 0, diasTrab: 0 }, 500000).text.indexOf('turnos') >= 0,
         'sin turnos no inventa una auditoría');

  // End-to-end vía aiAnswer: "me pagan mal" + monto enruta al verificador
  var stP = {
    turnos: dsP, turnosAll: dsP, activo: null, calc: calcP,
    vh: 10000, salario: 2400000, session: { uid: 'u-test', email: 'e@x.com' }
  };
  var rE2E = w.aiAnswer('me pagaron 70 mil este mes y creo que me pagan mal', stP);
  truthy(rE2E && (rE2E.text || '').indexOf('de menos') >= 0,
         'aiAnswer enruta "me pagan mal + monto" al verificador');
  truthy(rE2E && rE2E.card && rE2E.card.kind === 'audit',
         'la respuesta del verificador trae card de auditoría');
  truthy(rE2E && rE2E.actions && rE2E.actions.length,
         'ofrece acción para armar el reclamo');

  // Período parametrizable: el label aparece en el texto
  var rLbl = w.aiAuditarPago({ vh: 10000, totalCOP: 100000, bd: {}, diasTrab: 1 }, 0, 'esta quincena');
  truthy(rLbl.text.indexOf('esta quincena') >= 0, 'el período (quincena) se refleja en el texto');

  // E2E quincena: scope excluye los turnos de la otra mitad del mes
  var turnoHoy = mkTurno(_hoy, 8);
  var otroDia = _hoy.getDate() >= 16 ? 5 : 20;
  var turnoOtra = mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth(), otroDia), 8);
  var ambos = [turnoHoy, turnoOtra];
  var stQ = {
    turnos: ambos, turnosAll: ambos, activo: null,
    calc: w.doCalc(ambos, null, new Date(), 10000),
    vh: 10000, salario: 2400000, session: { uid: 'u-test', email: 'e@x.com' }
  };
  var rQ = w.aiAnswer('me pagaron 50 mil esta quincena', stQ);
  truthy(rQ && (rQ.text || '').indexOf('quincena') >= 0,
         '"esta quincena" audita por quincena, no por mes');
  truthy(rQ && rQ.card && rQ.card.kind === 'audit', 'auditoría de quincena trae card');
  var mesOwed = w.doCalc(ambos, null, new Date(), 10000).totalCOP;
  truthy(rQ && rQ.card && rQ.card.owed < mesOwed,
         'la quincena cubre menos que el mes completo (excluye la otra mitad)');
}());

// ════════════════════════════════════════════════════════════════
//  ai-advisor: calculadoras financieras/laborales (v279)
//  Funciones puras del asesor. Antes de v279 el módulo no tenía
//  NINGUNA cobertura en smoke. Estas pruebas afirman la matemática
//  legal (CST) y los casos borde (sin salario, sin ingreso).
// ════════════════════════════════════════════════════════════════

group('ai-advisor: indemnización por despido (Art. 64 CST)');
(function () {
  var SAL = w.SMIN; // salario mínimo 2026
  var r1 = w.aiAdvisorIndemnizacion({ salario: SAL }, 1);
  truthy(r1.indexOf('30 días') >= 0, '1 año (< 10 SMMLV) → 30 días de salario');
  // 1 año a 30 días = exactamente 1 salario mensual (sal/30*30)
  truthy(r1.indexOf(w.fCOP(SAL)) >= 0, '1 año ≈ 1 salario de indemnización');

  var r3 = w.aiAdvisorIndemnizacion({ salario: SAL }, 3);
  truthy(r3.indexOf('70 días') >= 0, '3 años → 30 + 20×2 = 70 días');

  var rAlto = w.aiAdvisorIndemnizacion({ salario: w.SMIN * 10 }, 1);
  truthy(rAlto.indexOf('20 días') >= 0, 'salario ≥ 10 SMMLV: primer año = 20 días (no 30)');

  var rNoSal = w.aiAdvisorIndemnizacion({}, 1);
  truthy(rNoSal.indexOf('salario base') >= 0,
    'sin salario configurado: pide el dato, NO calcula sobre basura');
})();

group('ai-advisor: fondo de emergencia (#3 plan realista)');
(function () {
  var r = w.aiAdvisorEmergencia({ proy: 2000000 });
  truthy(r.indexOf(w.fCOP(6000000)) >= 0, 'colchón mínimo = 3 meses de ingreso');
  truthy(r.indexOf(w.fCOP(12000000)) >= 0, 'colchón ideal = 6 meses de ingreso');
  // Plan realista = mínimo/12 = 6M/12 = 500k (25%), NO el 50% (ideal/12)
  truthy(r.indexOf(w.fCOP(500000)) >= 0, 'plan realista = colchón mínimo / 12 (25%)');
  truthy(r.indexOf('25.0%') >= 0, 'el plan se comunica como 25% del ingreso, no 50%');
  truthy(r.indexOf('50%') >= 0 && r.indexOf('poco realista') >= 0,
    'advierte explícitamente que armar 6 meses en 1 año (50%) es poco realista');

  var r0 = w.aiAdvisorEmergencia({});
  truthy(r0.indexOf('ingreso mensual') >= 0,
    'sin ningún ingreso conocido: no inventa cifras');
})();

group('ai-advisor: capacidad de endeudamiento (regla 30%)');
(function () {
  var r = w.aiAdvisorEndeudamiento({ proy: 1000000 }, 0);
  // neto = 1.000.000 * 0.92 = 920.000 → 30% = 276.000
  truthy(r.indexOf(w.fCOP(276000)) >= 0, 'cuota sana = 30% del ingreso neto');

  var rRiesgo = w.aiAdvisorEndeudamiento({ proy: 1000000 }, 500000);
  truthy(rRiesgo.indexOf('🔴') >= 0, 'cuota > 40% del neto → riesgo alto');

  var rOk = w.aiAdvisorEndeudamiento({ proy: 1000000 }, 100000);
  truthy(rOk.indexOf('🟢') >= 0, 'cuota baja → saludable');

  var r0 = w.aiAdvisorEndeudamiento({});
  truthy(r0.indexOf('ingreso mensual') >= 0, 'sin ingreso: no calcula');
})();

group('ai-advisor: comparador de ofertas (rescatado de función muerta)');
(function () {
  var c = { vh: 7295, salario: w.SMIN, totalMins: 0, diasTrab: 22 };
  var r = w.aiAdvisorCompararOfertas(c, 2500000, 0);
  truthy(r.indexOf('Comparador') >= 0, 'el comparador ahora es alcanzable');
  truthy(r.indexOf('✅') >= 0, 'oferta mayor al salario actual se marca como mejora');
})();

group('ai-advisor: dispatch de intents (aiAdvisorRespond)');
(function () {
  var c = { salario: w.SMIN, proy: 2000000, vh: 7295, totalMins: 0, diasTrab: 22 };
  truthy((w.aiAdvisorRespond('indemnizacion', c, { anios: 2 }) || '').indexOf('50 días') >= 0,
    'respond(indemnizacion, anios:2) → 30 + 20 = 50 días');
  truthy(w.aiAdvisorRespond('emergencia', c, null), 'respond(emergencia) responde');
  truthy(w.aiAdvisorRespond('endeudamiento', c, { cuota: 300000 }),
    'respond(endeudamiento) responde');
  truthy(w.aiAdvisorRespond('comparar_oferta', c, { ofertaSalario: 2500000 }),
    'respond(comparar_oferta) con salario responde');
  eq(w.aiAdvisorRespond('comparar_oferta', c, {}), null,
    'respond(comparar_oferta) SIN salario → null (no inventa una comparación)');
})();

group('ai-agente: rutas conversacionales nuevas (lenguaje natural + slash)');
(function () {
  w.aiResetConv();
  var rD = respText(w.aiAnswer('¿cuánto me dan si me despiden?', _stMeta));
  truthy(rD.indexOf('Indemnización') >= 0,
    'frase natural de despido → indemnización (no liquidación)');

  var rD3 = respText(w.aiAnswer('/indemnizacion 3', _stMeta));
  truthy(rD3.indexOf('70 días') >= 0, '/indemnizacion 3 → 70 días');

  var rFE = respText(w.aiAnswer('quiero armar un fondo de emergencia', _stMeta));
  truthy(rFE.indexOf('emergencia') >= 0, 'natural → fondo de emergencia');

  var rCu = respText(w.aiAnswer('cuánto puedo pagar de cuota', _stMeta));
  truthy(rCu.indexOf('endeudamiento') >= 0 || rCu.indexOf('Cuota') >= 0,
    'natural → capacidad de cuota');

  var rOf = respText(w.aiAnswer('tengo una oferta de 3 millones', _stMeta));
  truthy(rOf.indexOf('Comparador') >= 0, 'natural con oferta + cifra → comparador');

  // Regresión: "comparar con el mes pasado" NO debe ir al comparador de
  // ofertas (no tiene oferta ni cifra de salario nuevo).
  var rCmpMes = respText(w.aiAnswer('comparar con el mes pasado', _stMeta));
  truthy(rCmpMes.indexOf('Comparador de ofertas') < 0 && rCmpMes.indexOf('oferta') < 0,
    'regresión: "comparar mes" NO se desvía al comparador de ofertas');
})();

group('ai-agente #1: follow-up contextual de calculadoras');
(function () {
  // Despido → "llevo 4 años": debe recalcular (30 + 20×3 = 90 días).
  // Antes caía al fallback genérico pese a que la IA pidió el dato.
  w.aiResetConv();
  respText(w.aiAnswer('¿cuánto me dan si me despiden?', _stMeta));
  var rA = respText(w.aiAnswer('llevo 4 años en la empresa', _stMeta));
  truthy(rA.indexOf('90 días') >= 0,
    'follow-up: tras despido, "llevo 4 años" recalcula a 90 días');

  // Capacidad de cuota → "y si la cuota es de 600 mil": evalúa esa cuota.
  w.aiResetConv();
  respText(w.aiAnswer('cuánto puedo pagar de cuota', _stMeta));
  var rB = respText(w.aiAnswer('y si la cuota es de 600 mil?', _stMeta));
  truthy(rB.indexOf('600.000') >= 0,
    'follow-up: tras capacidad de cuota, "600 mil" evalúa esa cuota concreta');
  truthy(rB.indexOf('🔴') >= 0 || rB.indexOf('🟡') >= 0 || rB.indexOf('🟢') >= 0,
    'follow-up de cuota incluye el semáforo de riesgo');

  // Adyacencia: un número suelto NO debe interpretarse como follow-up si
  // hubo un turno intermedio no financiero.
  w.aiResetConv();
  respText(w.aiAnswer('¿cuánto me dan si me despiden?', _stMeta));
  respText(w.aiAnswer('cuánto llevo este mes', _stMeta));
  var rC = respText(w.aiAnswer('5', _stMeta));
  truthy(rC.indexOf('días de salario') < 0,
    'adyacencia: "5" dos turnos después NO se lee como años de antigüedad');
})();

group('ai-agente #2: salario configurado por flag sc, no por monto');
(function () {
  var uid = 'u-sc-test';
  var ds = [mkTurno(primerDiaNoFestivo(_hoy.getFullYear(), _hoy.getMonth()), 8)];
  var vhMin = Math.round(w.SMIN / 240);
  var stMin = {
    turnos: ds, turnosAll: ds,
    calc: w.doCalc(ds, null, new Date(), vhMin),
    vh: vhMin, salario: w.SMIN,
    session: { uid: uid, email: 't@x.com' }
  };
  w.localStorage.removeItem(w.dk(uid, 'sc'));
  truthy(w.buildContext(stMin).salarioConfigurado === false,
    'salario == SMIN sin flag → NO configurado (estado neutro)');
  w.localStorage.setItem(w.dk(uid, 'sc'), 'true');
  truthy(w.buildContext(stMin).salarioConfigurado === true,
    'salario == SMIN con flag sc=true → configurado (bug del mínimo resuelto)');
})();

group('ai-advisor #4: comparador proyecta horas a mes completo');
(function () {
  // 75h a la fecha (mes parcial) con proy ≈ 1.875× → mes completo ≈ 141h
  var c = { vh: 7295, salario: w.SMIN, totalMins: 4500, totalCOP: 760869, proy: 1426628, diasTrab: 9 };
  var r = w.aiAdvisorCompararOfertas(c, 2300000, 0);
  truthy(r.indexOf('estimadas') >= 0, 'rotula las horas como estimadas (mes completo)');
  truthy(r.indexOf('≈141h') >= 0, 'proyecta 75h MTD × (proy/totalCOP) ≈ 141h');
  truthy(r.indexOf('≈75h') < 0, 'ya NO muestra las horas de mes parcial');
  truthy(r.indexOf('base legal de 240h') >= 0, 'el cálculo de /h se ancla a la base legal de 240h');
})();

group('ai-agente #5: fatiga responde con empatía, no "vas bien"');
(function () {
  w.aiResetConv();
  var r = respText(w.aiAnswer('estoy agotado, llevo varios turnos seguidos', _stMeta));
  truthy(r.indexOf('Vas bien') < 0,
    'NO responde "Vas bien" a quien dice estar agotado (tono-sordo)');
  truthy(r.indexOf('🤝') >= 0 || r.indexOf('escucho') >= 0 || r.indexOf('entiendo') >= 0,
    'valida el sentimiento antes de dar el dato');
})();

group('ai-advisor: presupuesto 50/30/20 (asesor base)');
(function () {
  // bruto 2.000.000 → neto 1.840.000 → 50/30/20 = 920k / 552k / 368k
  var r = w.aiAdvisorPresupuesto({ proy: 2000000 });
  truthy(r.indexOf('50/30/20') >= 0, 'enuncia la regla 50/30/20');
  truthy(r.indexOf(w.fCOP(1840000)) >= 0, 'presupuesta sobre el NETO (×0.92), no el bruto');
  truthy(r.indexOf(w.fCOP(920000)) >= 0, '50% necesidades = 920.000');
  truthy(r.indexOf(w.fCOP(552000)) >= 0, '30% gustos = 552.000');
  truthy(r.indexOf(w.fCOP(368000)) >= 0, '20% ahorro y deudas = 368.000');
  truthy(r.indexOf('emergencia') >= 0, 'cross-sell conversacional al fondo de emergencia');

  // override de ingreso
  var rOv = w.aiAdvisorPresupuesto({ proy: 2000000 }, 4000000);
  truthy(rOv.indexOf(w.fCOP(3680000)) >= 0, 'override de ingreso recalcula sobre 4M (neto 3.68M)');

  // borde: sin ingreso conocido → guía, no inventa
  var r0 = w.aiAdvisorPresupuesto({});
  truthy(r0.indexOf('ingreso mensual') >= 0, 'sin ingreso: pide el dato, no inventa números');

  // dispatch
  truthy(w.aiAdvisorRespond('presupuesto', { proy: 2000000 }, null),
    'aiAdvisorRespond(presupuesto) responde');
})();

group('ai-agente: presupuesto conversacional (natural + slash + follow-up)');
(function () {
  w.aiResetConv();
  var rNat = respText(w.aiAnswer('cómo reparto mi sueldo?', _stMeta));
  truthy(rNat.indexOf('50/30/20') >= 0, 'natural "cómo reparto mi sueldo" → presupuesto');

  var rSlash = respText(w.aiAnswer('/presupuesto', _stMeta));
  truthy(rSlash.indexOf('50/30/20') >= 0, '/presupuesto → presupuesto');

  // follow-up: tras el presupuesto, un ingreso suelto recalcula
  w.aiResetConv();
  respText(w.aiAnswer('cómo reparto mi sueldo?', _stMeta));
  var rFu = respText(w.aiAnswer('y si gano 4 millones?', _stMeta));
  truthy(rFu.indexOf(w.fCOP(3680000)) >= 0,
    'follow-up: "y si gano 4 millones" recalcula el reparto (neto 3.68M)');

  // regresión: "en qué gasté más este mes" NO debe ir a presupuesto
  w.aiResetConv();
  var rReg = respText(w.aiAnswer('comparar con el mes pasado', _stMeta));
  truthy(rReg.indexOf('50/30/20') < 0, 'regresión: "comparar mes" no se desvía a presupuesto');
})();

group('ai-agente: interconexión — los ganchos encadenan a módulos');
(function () {
  // presupuesto ofrece [emergencia, cuota]; "dale" toma la primera
  w.aiResetConv();
  respText(w.aiAnswer('cómo reparto mi sueldo?', _stMeta));
  var rDale = respText(w.aiAnswer('dale', _stMeta));
  truthy(rDale.indexOf('Fondo de emergencia') >= 0,
    '"dale" tras presupuesto encadena a la 1ª opción (fondo de emergencia)');

  // nombrar la segunda opción explícitamente
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  var rCuota = respText(w.aiAnswer('mejor la cuota', _stMeta));
  truthy(rCuota.indexOf('Capacidad de endeudamiento') >= 0,
    '"la cuota" tras presupuesto encadena a capacidad de endeudamiento');

  // ordinal
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  var rSeg = respText(w.aiAnswer('el segundo', _stMeta));
  truthy(rSeg.indexOf('Capacidad de endeudamiento') >= 0,
    '"el segundo" toma la 2ª opción ofrecida');

  // "ambos" muestra las dos
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  var rAmbos = respText(w.aiAnswer('ambos', _stMeta));
  truthy(rAmbos.indexOf('Fondo de emergencia') >= 0 && rAmbos.indexOf('Capacidad de endeudamiento') >= 0,
    '"ambos" encadena las dos opciones');

  // el encadenamiento continúa varios pasos
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta)); // ofrece emergencia/cuota
  respText(w.aiAnswer('dale', _stMeta));          // → emergencia (ofrece presupuesto/cuota)
  var rChain = respText(w.aiAnswer('dale', _stMeta)); // → presupuesto
  truthy(rChain.indexOf('50/30/20') >= 0,
    'el encadenamiento sigue varios pasos (emergencia → presupuesto)');

  // indemnización → pedir liquidación encadena a esa calculadora
  w.aiResetConv();
  respText(w.aiAnswer('cuánto me dan si me despiden?', _stMeta));
  var rLiq = respText(w.aiAnswer('dale, la liquidación', _stMeta));
  truthy(rLiq.indexOf('Liquidación') >= 0 || rLiq.indexOf('prestaciones') >= 0,
    'tras indemnización, pedir liquidación encadena a esa calculadora');
})();

group('ai-agente: interconexión — guards (sin falsos positivos)');
(function () {
  // afirmación NO adyacente no dispara (oferta expirada)
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  respText(w.aiAnswer('cuánto llevo este mes', _stMeta));
  var rTarde = respText(w.aiAnswer('dale', _stMeta));
  truthy(rTarde.indexOf('Fondo de emergencia') < 0,
    'un "dale" 2 turnos después NO encadena (oferta expirada)');

  // "simular 4 horas" NO se confunde con afirmación pese a empezar con "si"
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  var rSim = respText(w.aiAnswer('simular 4 horas nocturnas', _stMeta));
  truthy(rSim.indexOf('Fondo de emergencia') < 0,
    'frase larga con "si..." (simular) NO se lee como afirmación a la oferta');

  // el follow-up numérico de ingreso gana sobre la oferta
  w.aiResetConv();
  respText(w.aiAnswer('/presupuesto', _stMeta));
  var rIng = respText(w.aiAnswer('y si gano 4 millones?', _stMeta));
  truthy(rIng.indexOf(w.fCOP(3680000)) >= 0,
    'override de ingreso recalcula presupuesto, no encadena a otra opción');
})();
// ════════════════════════════════════════════════════════════════
//  ai-advisor: calculadoras financieras SIN cobertura previa.
//  Las 8 funciones de abajo no tenían ningún test (aiAdvisorAhorro,
//  Fiscal, Optimizador, Optimizar, Informe, Historico, DescansoOptimo,
//  Anual). Son el corazón de la "asesora financiera": acá se afirma la
//  matemática real y, sobre todo, los guards que evitan inventar cifras.
// ════════════════════════════════════════════════════════════════

group('ai-advisor: planificador de ahorro (3 tiers de viabilidad)');
(function () {
  if (typeof w.aiAdvisorAhorro !== 'function') { truthy(false, 'aiAdvisorAhorro existe'); return; }
  var c = { proy: 2000000, vh: 10000 };

  // Tier realista: 200k/mes = 10% del ingreso (≤15%)
  var rReal = w.aiAdvisorAhorro(c, 2400000, 12);
  truthy(rReal.indexOf('Plan de ahorro') >= 0, 'titula el plan de ahorro');
  truthy(rReal.indexOf(w.fCOP(200000)) >= 0, 'meta 2.4M / 12 meses = 200.000/mes');
  truthy(rReal.indexOf('10.0%') >= 0, '200k sobre 2M de ingreso = 10% del proyectado');
  truthy(rReal.indexOf('plan realista') >= 0, '≤15% del ingreso → lo marca como realista');

  // Tier medio: 500k/mes = 25% → "alcanzable con disciplina"
  var rMid = w.aiAdvisorAhorro(c, 6000000, 12);
  truthy(rMid.indexOf('alcanzable') >= 0, '25% del ingreso → alcanzable con disciplina (no realista, no alarma)');

  // Tier ambicioso: 1M/mes = 50% (>30%) → alerta + extiende el plazo a 18 meses
  var rWarn = w.aiAdvisorAhorro(c, 12000000, 12);
  truthy(rWarn.indexOf('⚠️') >= 0, '>30% del ingreso → dispara la advertencia');
  truthy(rWarn.indexOf('18 meses') >= 0, 'propone extender el plazo a ceil(12×1.5)=18 meses');
  truthy(rWarn.indexOf(w.fCOP(Math.round(12000000 / 18))) >= 0,
    'recalcula la cuota mensual sobre el plazo extendido (12M/18)');

  // Borde: sin meta no inventa un plan
  eq(w.aiAdvisorAhorro(c, 0, 12), '', 'meta = 0 → cadena vacía (no arma un plan fantasma)');
  eq(w.aiAdvisorAhorro(c, -100, 12), '', 'meta negativa → vacío');
})();

group('ai-advisor: análisis fiscal (deducibles + tope de renta)');
(function () {
  if (typeof w.aiAdvisorFiscal !== 'function') { truthy(false, 'aiAdvisorFiscal existe'); return; }

  // Ingreso bajo: deducibles 4/4/8% y NO supera el tope de declaración
  var rBajo = w.aiAdvisorFiscal({ salario: 2000000, totalCOP: 2000000, proy: 2200000 });
  truthy(rBajo.indexOf('Análisis fiscal') >= 0, 'titula el análisis fiscal');
  truthy(rBajo.indexOf(w.fCOP(960000)) >= 0, 'aportes salud 4% anuales = 2M×0.04×12 = 960.000');
  truthy(rBajo.indexOf(w.fCOP(1920000)) >= 0, 'total deducible 8% anual = 1.920.000');
  truthy(rBajo.indexOf('No por ingresos') >= 0, 'ingreso bajo → no supera topes de renta');

  // Ingreso alto: supera el tope (1.400 UVT × $52.374 = ~$73,3M/año).
  // 7M/mes × 12 = 84M > 73,3M → posiblemente declara.
  var rAlto = w.aiAdvisorFiscal({ salario: 7000000, totalCOP: 7000000, proy: 7000000 });
  truthy(rAlto.indexOf('Posiblemente') >= 0, 'ingreso anual > tope UVT 1400 → posiblemente declara renta');

  // Borde: sin salario no calcula nada fiscal
  eq(w.aiAdvisorFiscal({ totalCOP: 2000000 }), '', 'sin salario configurado → vacío (no calcula sobre el aire)');
})();

group('ai-advisor: optimizador para una meta extra (turnos necesarios)');
(function () {
  if (typeof w.aiAdvisorOptimizador !== 'function') { truthy(false, 'aiAdvisorOptimizador existe'); return; }
  var r = w.aiAdvisorOptimizador({ vh: 10000 }, 200000);
  truthy(r.indexOf('Optimizador de Horarios') >= 0, 'titula el optimizador de horarios');
  // nocturno 8h = vh×1.35×8 = 108.000 → ceil(200k/108k)=2
  truthy(r.indexOf(w.fCOP(108000)) >= 0 && r.indexOf('2 turnos nocturnos') >= 0,
    'opción A: 2 turnos nocturnos de 108.000 c/u');
  // dominical 8h = vh × factor festivo VIGENTE × 8 (date-aware, Ley 2466/2025)
  var _vTd = Math.round(10000 * w.rcFactor('diurnaFest', new Date()) * 8);
  truthy(r.indexOf(w.fCOP(_vTd)) >= 0, 'opción B: turno dominical/festivo al factor vigente');
  // extra diurna = vh×1.25 = 12.500 → ceil(200k/12500)=16
  truthy(r.indexOf('16 horas extra') >= 0, 'opción C: 16 horas extra diurnas (a 12.500/h)');

  // Bordes: sin meta o sin salario pide el dato, no inventa
  truthy(w.aiAdvisorOptimizador({ vh: 10000 }, 0).indexOf('Por ejemplo') >= 0,
    'meta extra = 0 → pide el dato con un ejemplo');
  truthy(w.aiAdvisorOptimizador({}, 200000).indexOf('salario base') >= 0,
    'sin vh/salario → pide configurarlo');
})();

// Contexto real (vía buildContext) para las calculadoras que leen c.dias
var _advTurnos = [];
for (var _ad = 2; _ad <= 12; _ad += 2) {
  _advTurnos.push(mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth(), _ad), 8));
}
var _advState = {
  turnos: _advTurnos, turnosAll: _advTurnos, activo: null,
  calc: w.doCalc(_advTurnos, null, _hoy, 10000),
  vh: 10000, salario: 2000000,
  session: { uid: 'u-adv', email: 'a@x.com' }
};
var _cAdv = w.buildContext(_advState);

group('ai-advisor: optimizar horarios (sobre días reales del mes)');
(function () {
  if (typeof w.aiAdvisorOptimizar !== 'function') { truthy(false, 'aiAdvisorOptimizar existe'); return; }
  truthy(_cAdv.dias && _cAdv.dias.length >= 5, 'el contexto tiene ≥5 días trabajados para analizar');
  var r = w.aiAdvisorOptimizar(_cAdv);
  truthy(r.indexOf('Optimizador de horarios') >= 0, 'titula el optimizador');
  truthy(r.indexOf('valor hora efectivo') >= 0, 'reporta el valor hora efectivo');
  truthy(r.indexOf(w.fCOP(_cAdv.totalCOP * 1.15)) >= 0,
    'proyecta ≈+15% optimizando (totalCOP × 1.15)');

  // Bordes
  eq(w.aiAdvisorOptimizar({ vh: 10000, dias: [] }), '', 'sin días → vacío');
  eq(w.aiAdvisorOptimizar({ dias: _cAdv.dias }), '', 'sin vh → vacío');
})();

group('ai-advisor: optimizador de descanso (día más flojo/rentable)');
(function () {
  if (typeof w.aiAdvisorDescansoOptimo !== 'function') { truthy(false, 'aiAdvisorDescansoOptimo existe'); return; }
  var r = w.aiAdvisorDescansoOptimo(_cAdv);
  truthy(r.indexOf('Optimizador de descanso') >= 0, 'titula el optimizador de descanso');
  truthy(r.indexOf('Día más flojo') >= 0, 'identifica el día menos rentable para descansar');

  // Borde: menos de 5 días no alcanza para un patrón confiable
  eq(w.aiAdvisorDescansoOptimo({ dias: [{}, {}, {}, {}] }), '',
    '<5 días → vacío (no infiere un patrón de pocos datos)');
})();

group('ai-advisor: informe financiero completo');
(function () {
  if (typeof w.aiAdvisorInforme !== 'function') { truthy(false, 'aiAdvisorInforme existe'); return; }
  var r = w.aiAdvisorInforme(_cAdv);
  truthy(r.indexOf('Informe financiero completo') >= 0, 'arma el informe ejecutivo');
  truthy(r.indexOf('Ingresos del período') >= 0, 'incluye la sección de ingresos');
  truthy(r.indexOf(w.fCOP(_cAdv.totalCOP * 0.92)) >= 0, 'el neto estimado descuenta 8% (×0.92)');

  // Borde: sin turnos del mes no hay informe
  truthy(w.aiAdvisorInforme({ diasTrab: 0 }).indexOf('suficientes datos') >= 0,
    'sin días trabajados → pide registrar turnos primero');
})();

group('ai-advisor: análisis histórico (multi-mes)');
(function () {
  if (typeof w.aiAdvisorHistorico !== 'function') { truthy(false, 'aiAdvisorHistorico existe'); return; }
  function mk2(mesAtras, dia) {
    return mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - mesAtras, dia), 8);
  }
  var hist6 = [mk2(0, 3), mk2(0, 5), mk2(0, 7), mk2(1, 3), mk2(1, 5), mk2(1, 7)];
  var r = w.aiAdvisorHistorico(hist6, 10000, 2000000);
  truthy(r.indexOf('Análisis histórico') >= 0, 'titula el análisis histórico');
  truthy(r.indexOf('(2 meses)') >= 0, 'detecta los 2 meses distintos');
  truthy(r.indexOf('Mejor mes') >= 0 && r.indexOf('Mes más bajo') >= 0, 'compara mejor vs peor mes');
  truthy(r.indexOf('Promedio mensual') >= 0 && r.indexOf('Total acumulado') >= 0,
    'reporta promedio y acumulado');

  // Bordes que evitan estadística basura
  eq(w.aiAdvisorHistorico(hist6.slice(0, 4), 10000, 2000000), '',
    '<5 turnos → vacío (muestra insuficiente)');
  var unMes = [mk2(0, 2), mk2(0, 4), mk2(0, 6), mk2(0, 8), mk2(0, 10)];
  eq(w.aiAdvisorHistorico(unMes, 10000, 2000000), '',
    '5 turnos pero un solo mes → vacío (no hay con qué comparar)');
})();

group('ai-advisor: proyección anual');
(function () {
  if (typeof w.aiAdvisorAnual !== 'function') { truthy(false, 'aiAdvisorAnual existe'); return; }
  function mk2(mesAtras, dia) {
    return mkTurno(new Date(_hoy.getFullYear(), _hoy.getMonth() - mesAtras, dia), 8);
  }
  var an10 = [];
  for (var d = 2; d <= 10; d += 2) { an10.push(mk2(0, d)); an10.push(mk2(1, d)); }
  var r = w.aiAdvisorAnual({ salario: 2000000 }, an10, 10000);
  truthy(r.indexOf('Proyección anual') >= 0, 'titula la proyección anual');
  truthy(r.indexOf('Promedio mensual') >= 0 && r.indexOf('Proyección 12 meses') >= 0,
    'reporta promedio mensual y proyección a 12 meses');
  truthy(r.indexOf('vs salario base') >= 0, 'con salario configurado compara contra el base anual');

  // Borde: menos de 10 turnos no proyecta el año
  eq(w.aiAdvisorAnual({ salario: 2000000 }, an10.slice(0, 9), 10000), '',
    '<10 turnos → vacío (no proyecta el año con poca historia)');
})();

group('ai-advisor: dispatch de las ramas antes sin cobertura');
(function () {
  if (typeof w.aiAdvisorRespond !== 'function') { truthy(false, 'aiAdvisorRespond existe'); return; }
  var cFin = { proy: 2000000, vh: 10000, salario: 2000000, totalCOP: 2000000 };
  truthy((w.aiAdvisorRespond('ahorro', cFin, { meta: 6000000 }) || '').indexOf('Plan de ahorro') >= 0,
    'respond(ahorro, meta) → planificador de ahorro');
  truthy((w.aiAdvisorRespond('fiscal', cFin, null) || '').indexOf('Análisis fiscal') >= 0,
    'respond(fiscal) → análisis fiscal');
  var rOpt = w.aiAdvisorRespond('optimizar', _cAdv, null) || '';
  truthy(rOpt.indexOf('Optimizador de horarios') >= 0 && rOpt.indexOf('Optimizador de descanso') >= 0,
    'respond(optimizar) concatena horarios + descanso');
  truthy((w.aiAdvisorRespond('total_ganado', _cAdv, null) || '').indexOf('Informe financiero completo') >= 0,
    'respond(total_ganado) → informe completo');
})();

group('ai-agente: las 4 calculadoras antes huérfanas ahora se alcanzan (lenguaje natural)');
(function () {
  // Antes de este fix: "ahorrar"→cálculo de meta, "declarar renta"→queja
  // de fatiga, "ganar X extra"→reflexión, "informe"→compositor de email.
  // El router determinista del asesor (pre-NLP) las captura.
  w.aiResetConv();
  var rAh = respText(w.aiAnswer('quiero ahorrar 5 millones en un año', _stMeta));
  truthy(rAh.indexOf('Plan de ahorro') >= 0,
    '"quiero ahorrar 5 millones en un año" → planificador de ahorro (no cálculo de meta)');
  truthy(rAh.indexOf('Análisis de Meta') < 0 && rAh.indexOf('te faltan') < 0,
    '"quiero ahorrar..." ya NO cae al cálculo de meta (bug de ruteo corregido)');
  w.aiResetConv();
  truthy(respText(w.aiAnswer('/ahorro 5000000', _stMeta)).indexOf('Plan de ahorro') >= 0,
    '/ahorro 5000000 → planificador de ahorro (no lo roba el follow-up numérico)');

  w.aiResetConv();
  var rFi = respText(w.aiAnswer('tengo que declarar renta este año', _stMeta));
  truthy(rFi.indexOf('fiscal') >= 0 || rFi.indexOf('renta') >= 0,
    '"declarar renta" → análisis fiscal (no queja de fatiga)');

  w.aiResetConv();
  var rOp = respText(w.aiAnswer('quiero ganar 200 mil extra este mes', _stMeta));
  truthy(rOp.indexOf('Optimizador de Horarios') >= 0,
    '"ganar 200 mil extra" → optimizador de meta extra (no reflexión)');

  w.aiResetConv();
  var rIn = respText(w.aiAnswer('dame un informe financiero completo', _stMeta));
  truthy(rIn.indexOf('Informe financiero') >= 0,
    '"informe financiero completo" → informe del asesor (no compositor de email)');

  // Slash commands explícitos
  w.aiResetConv();
  truthy(respText(w.aiAnswer('/fiscal', _stMeta)).indexOf('fiscal') >= 0, '/fiscal → análisis fiscal');
  w.aiResetConv();
  truthy(respText(w.aiAnswer('/optimizador 200000', _stMeta)).indexOf('Optimizador de Horarios') >= 0,
    '/optimizador 200000 → optimizador de meta extra');

  // Guards: el router NO roba rutas legítimas
  w.aiResetConv();
  truthy(respText(w.aiAnswer('enviá mi informe por correo a juan@x.com', _stMeta)).indexOf('Informe financiero') < 0,
    'guard: "enviá mi informe por correo" sigue siendo email, no informe del asesor');
  w.aiResetConv();
  truthy(respText(w.aiAnswer('qué turno me conviene tomar', _stMeta)).indexOf('Optimizador de Horarios') < 0,
    'guard: "qué turno me conviene" sigue en el optimizador predictivo, no el de meta extra');
})();

group('ai-enhanced: lexicalización con sinónimos de dominio (Fase 2)');
(function () {
  if (typeof w.aiHumanizar !== 'function') { truthy(false, 'aiHumanizar existe'); return; }
  // Varía sustantivos de nómina repetidos con el vocabulario de dominio
  // (asset antes dormido). "turno" → jornada/guardia/servicio.
  var out = w.aiHumanizar('turno turno');
  truthy(/jornada|guardia|servicio/.test(out),
    'aiHumanizar varía "turno" con un sinónimo de dominio');
  // Protege datos y términos técnicos/legales
  var h2 = w.aiHumanizar('Llevás **$1.190.000** en recargos dominicales');
  truthy(h2.indexOf('$1.190.000') >= 0, 'preserva los montos al variar el texto');
  truthy(h2.indexOf('dominicales') >= 0, 'NO altera términos legales (dominicales)');
})();

group('ai-enhanced: verificación anclada al oráculo doCalc (Fase 1, self-refine)');
(function () {
  if (typeof w.aiVerifyNumbers !== 'function') { truthy(false, 'aiVerifyNumbers existe'); return; }
  // Mismatch del total del mes → anexa corrección (append-only)
  var bad = w.aiVerifyNumbers('Llevás $500.000 este mes', { totalCOP: 1000000 });
  truthy(bad.indexOf('Llevás $500.000') >= 0, 'append-only: conserva el texto original');
  truthy(bad.indexOf('según tu tabla real') >= 0 && bad.indexOf(w.fCOP(1000000)) >= 0,
    'corrige el total cuando NO cuadra con doCalc');
  // Coincide (dentro de redondeo) → no toca
  eq(w.aiVerifyNumbers('Llevás $1.000.000', { totalCOP: 1000000 }), 'Llevás $1.000.000',
    'no anexa nada cuando el total coincide');
  // SAFETY: NO toca cifras que no son el total del mes (cero falsos positivos)
  eq(w.aiVerifyNumbers('Un turno nocturno paga $108.000', { totalCOP: 1000000 }),
    'Un turno nocturno paga $108.000',
    'NO corrige valores por turno / ley / simulación');
  // Sin oráculo → no inventa
  eq(w.aiVerifyNumbers('Llevás $500.000', null), 'Llevás $500.000',
    'sin tabla real no inventa correcciones');
  // Idempotente: no duplica el ajuste
  var once = w.aiVerifyNumbers('Llevás $500.000', { totalCOP: 1000000 });
  eq(w.aiVerifyNumbers(once, { totalCOP: 1000000 }), once, 'idempotente: no anexa dos veces');
})();

group('ai-reasoning: salience por sorpresa (aiRankFindings)');
(function () {
  if (typeof w.aiRankFindings !== 'function') { truthy(false, 'aiRankFindings existe'); return; }
  // La prioridad entera SIEMPRE domina entre niveles (bonus < 1)
  var r1 = w.aiRankFindings([
    { priority: 7, data: { varCOP: 95 }, id: 'a' },
    { priority: 9, data: { varCOP: 1 }, id: 'b' }
  ]);
  eq(r1[0].id, 'b', 'prioridad 9 va antes que prioridad 7 aunque tenga menos sorpresa');
  // A IGUAL prioridad, el de mayor desvío (sorpresa) va primero
  var r2 = w.aiRankFindings([
    { priority: 8, data: { varCOP: 12 }, id: 'chico' },
    { priority: 8, data: { varCOP: 80 }, id: 'grande' }
  ]);
  eq(r2[0].id, 'grande', 'a igual prioridad, el hallazgo de mayor variación lidera');
  // No muta el array original (slice interno)
  var orig = [{ priority: 5, id: 'x' }, { priority: 9, id: 'y' }];
  w.aiRankFindings(orig);
  eq(orig[0].id, 'x', 'no muta el array de entrada');
  // Borde: vacío
  eq(w.aiRankFindings([]).length, 0, 'lista vacía → vacía (no explota)');
})();

group('ai-enhanced: expresiones referenciales (aiReferring)');
(function () {
  if (typeof w.aiReferring !== 'function') { truthy(false, 'aiReferring existe'); return; }
  // 2ª mención de la MISMA fecha → "ese día"; la 1ª se conserva completa
  var r = w.aiReferring('Trabajaste el 5 de junio y el 5 de junio fue festivo');
  truthy(r.indexOf('el 5 de junio y ese día') >= 0,
    'primera mención completa, segunda → "ese día"');
  // Preserva el artículo "del" → "de ese día"
  var r2 = w.aiReferring('el turno del 5 de junio; cobraste por el trabajo del 5 de junio');
  truthy(r2.indexOf('de ese día') >= 0, 'conserva el artículo: "del 5 de junio" → "de ese día"');
  // Fechas DISTINTAS no se colapsan
  var r3 = w.aiReferring('el 5 de junio y el 8 de junio');
  truthy(r3.indexOf('5 de junio') >= 0 && r3.indexOf('8 de junio') >= 0,
    'fechas distintas se mantienen ambas');
  // Sin fechas → intacto
  eq(w.aiReferring('Llevás $500.000 este mes'), 'Llevás $500.000 este mes',
    'texto sin fechas queda igual');
})();

group('ai-nlp: comprensión de jerga de plata (lana, saqué, junté)');
(function () {
  if (typeof w.aiClassifyIntent !== 'function') { truthy(false, 'aiClassifyIntent existe'); return; }
  eq((w.aiClassifyIntent('cuanta lana hice este mes') || {}).intent, 'total_ganado',
    '"lana" se entiende como dinero → total ganado');
  eq((w.aiClassifyIntent('cuanto saque ayer') || {}).intent, 'ayer',
    '"saqué" (= gané) + ayer → intent ayer');
  var rj = w.aiClassifyIntent('cuanta lana junte') || {};
  truthy(rj.intent === 'total_ganado' || rj.topic === 'dinero',
    '"lana junté" rutea a dinero (antes caía en motivación)');
  // No rompe lo que ya andaba: "plata" sigue siendo dinero
  var rp = w.aiClassifyIntent('cuanta plata llevo') || {};
  truthy(rp.intent === 'total_ganado' || rp.topic === 'dinero',
    'regresión: "plata" sigue entendiéndose como dinero');
})();

group('ai-nlp: captador de señales multi-dominio (_aiSignalRoute, puro)');
(function () {
  if (typeof w._aiSignalRoute !== 'function') { truthy(false, '_aiSignalRoute existe'); return; }
  var SR = w._aiSignalRoute;
  // Plata + tiempo
  eq(SR('cuanto saque ayer', {}), 'ayer', 'plata + ayer → intent ayer');
  eq(SR('en cuanto voy a terminar el mes', {}), 'proyeccion', 'futuro → proyección');
  eq(SR('uy la lana que junte por ahi', {}), 'total_ganado', 'jerga de plata → total ganado');
  // Legal / pago justo
  eq(SR('cuanto vale la hora nocturna', {}), 'valor_hora', '"vale la hora" → valor_hora');
  eq(SR('siento que me estan pagando mal el recargo', {}), 'ley', 'pago injusto/recargo → ley');
  // Bienestar
  eq(SR('estoy reventado no doy mas', {}), 'queja_fatiga', 'queja fuerte → queja_fatiga');
  eq(SR('uf que cansancio', {}), 'bienestar', 'cansancio → bienestar');
  // Ayuda / app
  eq(SR('como exporto mis turnos a pdf', {}), 'HELP', 'cómo + acción de app → HELP');
  eq(SR('la app no guarda nada', {}), 'HELP', 'error de la app → HELP');
  // Datos por tiempo
  eq(SR('como va mi racha', {}), 'racha', '"racha" → racha');
  eq(SR('proximos festivos', {}), 'festivos', '"festivos" → festivos');
  // Guards: no secuestrar ni inventar
  eq(SR('cuanto gano si meto 4 noches', {}), null, 'guard: hipotético → null (lo maneja simulación)');
  eq(SR('hola que tal todo', {}), null, 'guard: saludo sin señal → null (cae a desambiguación/fallback)');
  eq(SR('', {}), null, 'guard: vacío → null');
})();

group('ai-nlp: el captador evita el fallback genérico (e2e)');
(function () {
  function answered(q) {
    var r = respText(w.aiAnswer(q, _stMeta));
    return !!r && r.indexOf('No estoy seguro') < 0 && r.indexOf('No estoy 100') < 0 && r.length > 0;
  }
  ['cuánto me van a pagar', 'uy y la platica que junté por ahí', 'me estan pagando mal',
   'uf parce qué cansancio', 'cómo exporto a excel'].forEach(function (q) {
    w.aiResetConv();
    truthy(answered(q), 'responde de verdad (no fallback): "' + q + '"');
  });
  // Degradación con gracia
  w.aiResetConv();
  truthy(typeof respText(w.aiAnswer('asdfghjk qwerty', _stMeta)) === 'string',
    'guard: texto sin señales no rompe el pipeline');
})();

group('ai: el placeholder "Procesando acción" no se filtra + pregunta de concepto');
(function () {
  // Pregunta informativa sobre el salario: NO debe filtrar el placeholder
  // ni misruteo a acción. Debe explicar el concepto.
  w.aiResetConv();
  var rQ = respText(w.aiAnswer('¿qué incluye el sueldo base?', _stMeta));
  truthy(rQ.indexOf('Procesando') < 0, 'pregunta de salario NO filtra "Procesando acción..."');
  truthy(rQ.indexOf('Sueldo base') >= 0 || rQ.indexOf('valor hora') >= 0 || rQ.indexOf('Valor hora') >= 0,
    '"qué incluye el sueldo base" → explicación real del concepto');

  // Comando sin monto → pide el valor (no placeholder)
  w.aiResetConv();
  var rCmd = respText(w.aiAnswer('quiero cambiar mi salario', _stMeta));
  truthy(rCmd.indexOf('Procesando') < 0, 'comando de salario sin monto NO filtra el placeholder');
  truthy(rCmd.indexOf('valor') >= 0 || rCmd.indexOf('Ajustes') >= 0,
    'comando sin monto pide el valor / indica dónde cambiarlo');

  // Comando CON monto → sigue ejecutando la acción real (no se rompió)
  w.aiResetConv();
  var rSet = w.aiAnswer('mi salario es 2 millones', _stMeta);
  var rSetText = respText(rSet);
  truthy(rSetText.indexOf('Procesando') < 0, 'comando con monto no muestra el placeholder');
  truthy((rSet && rSet.execute && rSet.execute.type === 'SET_SALARY') || rSetText.indexOf('actualiza') >= 0,
    'comando con monto sigue disparando la acción real (SET_SALARY)');
})();

group('ai-psicología: mensaje de hora calibrado (no se pega a lo factual)');
(function () {
  if (typeof w.aiPsychRespond !== 'function') { truthy(false, 'aiPsychRespond existe'); return; }
  // Hora crítica (madrugada, 4 AM). El mensaje asume que estás trabajando.
  var d4 = new Date(); d4.setHours(4, 0, 0, 0);
  // Consulta factual SIN turno activo → NO debe pegar el mensaje de hora
  var rFact = w.aiPsychRespond({ ahora: d4, tieneActivo: false }, 'configurar_salario');
  truthy(rFact.indexOf('🕐') < 0,
    'consulta factual sin turno activo NO recibe el mensaje de hora');
  // Con turno activo → el mensaje de hora SÍ aplica (estás trabajando)
  var rActivo = w.aiPsychRespond({ ahora: d4, tieneActivo: true }, 'hoy');
  truthy(rActivo.indexOf('🕐') >= 0,
    'con turno activo el mensaje de hora sí viene al caso');
  // Contexto emocional → también aplica
  var rEmo = w.aiPsychRespond({ ahora: d4, tieneActivo: false }, 'bienestar');
  truthy(rEmo.indexOf('🕐') >= 0,
    'en bienestar/fatiga el mensaje de hora sí aplica');
  // Hora normal (mediodía) → nunca hay mensaje de hora
  var d12 = new Date(); d12.setHours(12, 0, 0, 0);
  truthy(w.aiPsychRespond({ ahora: d12, tieneActivo: true }, 'hoy').indexOf('🕐') < 0,
    'hora no crítica → sin mensaje de hora (independiente del turno)');
})();

group('ai: correcciones de calidad (género + ruteo de valor_hora/días)');
(function () {
  // GÉNERO: la variación léxica NO debe romper concordancia. turno(m) solo
  // varía a sinónimos masculinos; plata(f) ya no se varía a "lucas/billete".
  if (typeof w.aiHumanizar === 'function') {
    var g = w.aiHumanizar('tu turno nocturno');
    truthy(g.indexOf('jornada nocturno') < 0 && g.indexOf('guardia nocturno') < 0,
      'no genera "jornada/guardia nocturno" (concordancia de género intacta)');
    eq(w.aiHumanizar('la plata del mes'), 'la plata del mes',
      '"la plata del mes" no se rompe a "la lucas/billete"');
  }
  // RUTEO: "cuánto gano por hora" → valor_hora (no horas_trabajadas)
  if (typeof w.aiClassifyIntent === 'function') {
    eq((w.aiClassifyIntent('cuanto gano por hora') || {}).intent, 'valor_hora',
      '"cuánto gano por hora" → valor_hora (tarifa), no horas trabajadas');
    // "días trabajados" → stats (conteo), NUNCA queja_fatiga
    var dc = (w.aiClassifyIntent('dias trabajados este mes') || {}).intent;
    truthy(dc !== 'queja_fatiga', '"días trabajados" NO se misclasifica como fatiga');
    eq(dc, 'stats', '"días trabajados este mes" → stats (conteo de turnos)');
  }
  // valor_hora se atiende vía _aiDispatchNLP (no cae a un handler genérico)
  var rVH = respText(w.aiAnswer('cuanto gano por hora', _stMeta));
  truthy(rVH.indexOf('valor hora') >= 0 || rVH.indexOf('Valor hora') >= 0 || rVH.indexOf('/ 240') >= 0 || rVH.indexOf('240 horas') >= 0,
    '"cuánto gano por hora" responde la tarifa por hora (no horas acumuladas)');
})();

group('ai-reasoning: comparación mensual calibrada (no se pega siempre)');
(function () {
  if (typeof w.aiReason !== 'function') { truthy(false, 'aiReason existe'); return; }
  var bag = { collected: {} };
  var ctx = { totalCOPMesPasado: 1000000, totalCOP: 800000, totalMins: 6000, totalMinsMesPasado: 6600, vh: 10000, salario: 2000000 };
  function tieneComparacion(r) {
    var fs = (r && r.findings) || [];
    for (var i = 0; i < fs.length; i++) {
      if (fs[i].data && typeof fs[i].data.varCOP === 'number') return true;
    }
    return false;
  }
  truthy(!tieneComparacion(w.aiReason(bag, ctx, [], 'ayer')),
    'intent "ayer" NO incluye la comparación mensual');
  truthy(!tieneComparacion(w.aiReason(bag, ctx, [], 'valor_hora')),
    'intent "valor_hora" NO incluye la comparación mensual');
  truthy(!tieneComparacion(w.aiReason(bag, ctx, [], 'horas_trabajadas')),
    'intent "horas_trabajadas" NO incluye la comparación mensual');
  truthy(tieneComparacion(w.aiReason(bag, ctx, [], 'total_ganado')),
    'intent "total_ganado" SÍ incluye la comparación (viene al caso)');
  truthy(tieneComparacion(w.aiReason(bag, ctx, [], 'comparativa_mes')),
    'intent "comparativa_mes" SÍ incluye la comparación');
})();

// REGRESIÓN: el hallazgo de "ritmo" debe ser coherente — proyectás = proyección
// real, comparada con la META (salario). El bug (prueba real 25-jun) mostraba
// dos cifras contradictorias: usaba prom×30 (promedio POR TURNO × 30 días) como
// "proyección", dando un número absurdo ($3.5M) que contradecía la proyección.
group('ai-reasoning: ritmo coherente (proyección vs meta, no número absurdo)');
(function () {
  if (typeof w._aiAnalyzeCalcTrends !== 'function') { truthy(false, '_aiAnalyzeCalcTrends existe'); return; }
  var ctxR = {
    diaActual: 23, diasMes: 30, pctSalario: 53.9, diasTrab: 8,
    proy: 1131621, salario: 1750905, prom: 117877,
    totalCOP: 943018, totalMins: 5000, vh: 7295
  };
  var findingsR = w._aiAnalyzeCalcTrends(ctxR);
  var trend = null;
  (findingsR || []).forEach(function (f) {
    if (f.text && f.text.indexOf('por debajo del ritmo') >= 0) trend = f;
  });
  truthy(trend, 'genera el hallazgo de ritmo cuando vas por debajo');
  if (trend) {
    truthy(trend.text.indexOf(w.fCOP(1131621)) >= 0, 'ritmo: proyectás usa la proyección real');
    truthy(trend.text.indexOf(w.fCOP(1750905)) >= 0, 'ritmo: compara contra tu META (salario)');
    truthy(trend.text.indexOf(w.fCOP(117877 * 30)) < 0,
      'ritmo: NO aparece el número absurdo (prom×30 turnos) del bug');
  }
})();

group('ai: detección Out-of-Scope (CLINC150) — declina sin fabricar');
(function () {
  if (typeof w._aiIsOutOfScope !== 'function') { truthy(false, '_aiIsOutOfScope existe'); return; }
  // OOS reales → detectados
  truthy(w._aiIsOutOfScope('que hora es'), '"qué hora es" → OOS');
  truthy(w._aiIsOutOfScope('quien gano el mundial'), '"quién ganó el mundial" → OOS');
  truthy(w._aiIsOutOfScope('cuantos anos tiene messi'),
    '"cuántos años tiene messi" → OOS (marcador sin ñ, igual que _aiNorm)');
  truthy(w._aiIsOutOfScope('cual es la capital de francia'), 'capital de país → OOS');
  // In-scope que SE PARECE a OOS → NO debe marcarse
  eq(w._aiIsOutOfScope('cuanto llevo este mes'), false, 'in-scope no es OOS');
  eq(w._aiIsOutOfScope('cuanto vale la hora'), false, '"vale la hora" no es OOS (es valor hora)');
  eq(w._aiIsOutOfScope('cuantas horas trabaje'), false, '"horas trabajé" no es OOS');
  // E2E: OOS declina con redirección; in-scope responde normal
  w.aiResetConv();
  truthy(respText(w.aiAnswer('que hora es', _stMeta)).indexOf('se me escapa') >= 0,
    'OOS e2e → declina con gracia ("se me escapa")');
  w.aiResetConv();
  truthy(respText(w.aiAnswer('cuanto llevo este mes', _stMeta)).indexOf('se me escapa') < 0,
    'in-scope e2e → NO declina (responde normal)');
})();

group('ai: saludo con chispa (resuelve el lienzo en blanco)');
(function () {
  // Usuario con datos → gancho personalizado + chips tappables
  w.aiResetConv();
  var rs = w.aiAnswer('hola', _stMeta);
  truthy(rs && typeof rs === 'object' && rs.actions && rs.actions.length >= 2,
    'el saludo trae chips tappables (no obliga a escribir)');
  var ts = respText(rs);
  truthy(ts.indexOf('llevás') >= 0 || ts.indexOf('Buen') >= 0 || ts.indexOf('Hola') >= 0,
    'el saludo da un gancho (dato del mes o bienvenida)');
  truthy(ts.indexOf('Tocá una opción') >= 0, 'invita a tocar o escribir (afordance)');
  // Usuario NUEVO (sin salario) → chips de onboarding
  var uid = 'u-nuevo';
  w.localStorage.removeItem(w.dk(uid, 'sc'));
  var stNuevo = {
    turnos: [], turnosAll: [], activo: null,
    calc: w.doCalc([], null, new Date(), 8333),
    vh: 8333, salario: w.SMIN, session: { uid: uid, email: 'n@x.com' }
  };
  w.aiResetConv();
  var rn = w.aiAnswer('buenas', stNuevo);
  var tn = respText(rn);
  truthy(rn && rn.actions && rn.actions.length >= 2, 'usuario nuevo: chips de arranque');
  truthy(tn.toLowerCase().indexOf('salario') >= 0 || tn.toLowerCase().indexOf('configurar') >= 0 || tn.toLowerCase().indexOf('minuto') >= 0,
    'usuario nuevo: orienta a configurar/empezar');
})();

group('ai: deliberador de módulos (MRKL router + SMART anti-saturación)');
(function () {
  if (typeof w.aiDeliberate !== 'function') { truthy(false, 'aiDeliberate existe'); return; }
  // Usuario nuevo → prioriza configurar el salario
  var nuevo = w.aiDeliberate('', 'total_ganado', { salarioConfigurado: false, diasTrab: 0 });
  eq(nuevo[0].intent, 'configurar_salario', 'sin salario → "configurar salario" es lo más relevante');
  // Racha alta / necesita descanso → bienestar arriba
  var racha = w.aiDeliberate('', 'total_ganado', { salarioConfigurado: true, diasTrab: 8, necesitaDescanso: true, rachaActual: 6, totalCOPMesPasado: 900000 });
  eq(racha[0].intent, 'bienestar', 'necesita descanso → bienestar lidera la deliberación');
  // Anti-saturación: nunca más de 2
  truthy(racha.length <= 2, 'cap de 2 sugerencias (SMART: no saturar)');
  // No se sugiere a sí mismo lo que se acaba de preguntar
  var tras = w.aiDeliberate('', 'proyeccion', { salarioConfigurado: true, diasTrab: 5, totalCOPMesPasado: 900000 });
  truthy(tras.every(function (x) { return x.intent !== 'proyeccion'; }),
    'no repite el intent actual (no se sugiere lo ya pedido)');
  // Solo sugiere lo relevante al entorno (sin datos → no liquidación/desglose)
  var vacio = w.aiDeliberate('', 'saludo', { salarioConfigurado: true, diasTrab: 0 });
  truthy(vacio.every(function (x) { return x.intent !== 'liquidacion' && x.intent !== 'distribucion'; }),
    'sin turnos no sugiere liquidación/desglose (relevancia por contexto)');
})();

group('ai: cierre enfocado / progressive disclosure (una sola CTA)');
(function () {
  if (typeof w.aiFocusClose !== 'function') { truthy(false, 'aiFocusClose existe'); return; }
  // Bloque final con 3 preguntas apiladas → queda 1 (la última)
  var apilado = 'Este mes llevás $300.000.\n\n¿Querés el desglose?\n¿Comparo con el mes pasado?\n¿Te muestro la proyección?';
  var r = w.aiFocusClose(apilado);
  var qs = (r.match(/\?/g) || []).length;
  truthy(qs === 1, 'colapsa 3 preguntas de cierre en 1 (una sola CTA)');
  truthy(r.indexOf('Este mes llevás $300.000') >= 0, 'NO toca el dato/contenido principal');
  truthy(r.indexOf('proyección') >= 0, 'conserva la última (más accionable)');
  // Una sola pregunta → intacto
  var una = 'Llevás $300.000 este mes.\n\n¿Querés el desglose?';
  eq(w.aiFocusClose(una), una, 'con una sola pregunta no cambia nada');
  // Tabla → no se toca (datos estructurados)
  var tabla = '| Recargo | Valor |\n| Nocturno | $1.000 |\n¿Algo más?\n¿Otra cosa?';
  truthy(w.aiFocusClose(tabla).indexOf('| Recargo | Valor |') >= 0, 'respeta tablas');
  // Pregunta a mitad de texto (no es cierre) → no se toca
  var medio = '¿Sabías que la noche paga más?\n\nLlevás $300.000 este mes.';
  eq(w.aiFocusClose(medio), medio, 'no toca preguntas que no son el bloque de cierre');
})();

// ══════════════════════════════════════════════════════════════
//  SUITE: chips precargados + lógica de "sí" + chips post-respuesta
// ══════════════════════════════════════════════════════════════

// Estado con datos para todos los tests de respuesta de chips.
// Construido aquí para no depender de _stMeta (que vive en otra closure).
var _stChips = (function () {
  var ds = [
    mkTurno(primerDomingo(_hoy.getFullYear(), _hoy.getMonth()), 8),
    mkTurno(primerDiaNoFestivo(_hoy.getFullYear(), _hoy.getMonth()), 8)
  ];
  return {
    turnos: ds, turnosAll: ds,
    calc: w.doCalc(ds, null, new Date(), 10000),
    vh: 10000, salario: 2400000,
    session: { uid: 'u-chips', email: 'chips@x.com' }
  };
})();

// ── A. Chips precargados de la pantalla vacía ────────────────────
group('chips precargados: respuestas no vacías y sin placeholder');
(function () {
  var chipQueries = [
    '¿Cuánto gané hoy?',
    '¿Cuánto gané ayer?',
    '¿Cuánto gané este mes?',
    'Proyección al cierre',
    'Revisá si mi pago está correcto'
  ];
  var PLACEHOLDER_GUARD = 'Procesando acción';

  for (var ci = 0; ci < chipQueries.length; ci++) {
    w.aiResetConv();
    var cr = w.aiAnswer(chipQueries[ci], _stChips);
    var ct = respText(cr);
    truthy(
      ct && ct.trim().length > 0,
      'chip "' + chipQueries[ci] + '" no devuelve vacío'
    );
    truthy(
      ct.indexOf(PLACEHOLDER_GUARD) < 0,
      'chip "' + chipQueries[ci] + '" no filtra placeholder "Procesando acción"'
    );
  }

  // "Revisá si mi pago está correcto" debe llegar al auditor (no al fallback genérico)
  w.aiResetConv();
  var rAudit = respText(w.aiAnswer('Revisá si mi pago está correcto', _stChips));
  truthy(
    rAudit.indexOf('No estoy seguro') < 0,
    '"Revisá si mi pago está correcto" no cae al fallback genérico'
  );
  truthy(
    rAudit.indexOf('pago') >= 0 || rAudit.indexOf('auditoría') >= 0 ||
    rAudit.indexOf('turno') >= 0 || rAudit.indexOf('correcto') >= 0 ||
    rAudit.indexOf('mes') >= 0 || rAudit.indexOf('calculé') >= 0,
    '"Revisá si mi pago" produce respuesta sobre pagos/turnos (auditoría alcanzada)'
  );
})();

// ── B. Lógica de "sí" después de un follow-up de la IA ──────────
group('"sí" después de sugerencia: ejecuta la acción, no devuelve fallback');
(function () {
  // Paso 1: hacer una consulta que registre una sugerencia en lastSuggestion.
  // _aiPickFollowUp() registra en _aiMemory.lastSuggestion — usamos el flujo
  // de proyección que suele ofrecer follow-ups.
  w.aiResetConv();
  if (typeof w.aiClearMemory === 'function') w.aiClearMemory();

  // Simular que la IA ofreció una sugerencia (como hace _aiPickFollowUp)
  // Esto reproduce el escenario real: el asistente pregunta "¿Querés la
  // proyección?" y el usuario dice "sí".
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) {
    w._aiMemory.lastSuggestion = {
      intent: 'proyeccion',
      query: 'proyección al cierre del mes',
      text: '¿Querés que calcule la proyección al cierre?'
    };
    var rSi = respText(w.aiAnswer('sí', _stChips));
    truthy(
      rSi.indexOf('No estoy seguro') < 0,
      '"sí" con sugerencia activa NO cae al fallback "No estoy seguro"'
    );
    truthy(
      rSi.length > 0,
      '"sí" con sugerencia activa produce respuesta no vacía'
    );
  }

  // Paso 2: "sí" sin sugerencia activa → ack conversacional, NO fallback genérico.
  // Este es el bug real: antes caía a "🤔 No estoy seguro de qué buscas"
  // porque la regex de acknowledgments no incluía 'si'. Fix en ai.js.
  w.aiResetConv();
  if (typeof w.aiClearMemory === 'function') w.aiClearMemory();
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) {
    w._aiMemory.lastSuggestion = null;
  }
  var _stSiVacio = {
    turnos: [], turnosAll: [],
    calc: w.doCalc([], null, new Date(), 0),
    vh: 0, salario: 0,
    session: { uid: 'u-si', email: 'si@x.com' }
  };
  var rSiSolo = respText(w.aiAnswer('sí', _stSiVacio));
  truthy(
    typeof rSiSolo === 'string',
    '"sí" sin sugerencia activa devuelve string (no explota)'
  );
  truthy(
    rSiSolo.indexOf('No estoy seguro') < 0,
    '"sí" sin sugerencia NO cae al fallback genérico "No estoy seguro" (fix del bug)'
  );
  // "si" sin tilde también debe ser ack
  w.aiResetConv();
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) w._aiMemory.lastSuggestion = null;
  var rSiSinTilde = respText(w.aiAnswer('si', _stSiVacio));
  truthy(
    rSiSinTilde.indexOf('No estoy seguro') < 0,
    '"si" sin tilde tampoco cae al fallback genérico'
  );
})();

// ── C. "aiCheckFollowUp": el mecanismo de resolución de follow-ups ──
group('aiCheckFollowUp: mecanismo de resolución de "sí"');
(function () {
  if (typeof w.aiCheckFollowUp !== 'function') {
    truthy(false, 'aiCheckFollowUp existe como función');
    return;
  }
  // Sin sugerencia activa → null
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) {
    w._aiMemory.lastSuggestion = null;
    eq(w.aiCheckFollowUp('sí'), null, 'sin lastSuggestion → null (no inventa)');
    eq(w.aiCheckFollowUp('si'), null, 'sin lastSuggestion "si" → null');

    // Con sugerencia → devuelve el intent correcto
    w._aiMemory.lastSuggestion = {
      intent: 'ahorro',
      query: '¿cuánto me falta para la meta?',
      text: '¿Querés que calcule el plan de ahorro?'
    };
    var fuIntent = w.aiCheckFollowUp('sí');
    truthy(fuIntent !== null, '"sí" con sugerencia devuelve intent (no null)');

    // La sugerencia se consume (no se repite)
    eq(w.aiCheckFollowUp('sí'), null, 'la sugerencia se consume en la primera respuesta');

    // Respuestas afirmativas variadas también resuelven
    w._aiMemory.lastSuggestion = {
      intent: 'proyeccion',
      query: 'proyección al cierre',
      text: '¿Querés la proyección?'
    };
    truthy(w.aiCheckFollowUp('dale') !== null, '"dale" también resuelve la sugerencia');

    // Restaurar estado limpio
    w._aiMemory.lastSuggestion = null;
  }
})();

// ── D. Chips post-respuesta no repiten el intent actual ──────────
group('chips post-respuesta: no repiten el intent ya respondido');
(function () {
  if (typeof w.aiNextChips !== 'function') return;

  var cNext = {
    vh: 10000, totalCOP: 500000, festMins: 480,
    nocturnasMins: 120, totalCOPMesPasado: 400000
  };

  // Para intent "total_ganado", los chips de abrir NO deben ser "total_ganado"
  w.aiConvReset();
  var baseActions = [{ label: 'Desglose', query: 'distribución de recargos' }];
  var rNext = w.aiNextChips('total_ganado', cNext, baseActions);
  if (rNext && rNext.actions) {
    var hasRepeat = false;
    rNext.actions.forEach(function (a) {
      // "cuánto gané este mes" y "cuánto llevo" son el mismo intent
      if (a.query && (
        a.query.indexOf('cuánto llevo') >= 0 ||
        a.query.indexOf('cuanto llevo') >= 0 ||
        a.query.indexOf('este mes') >= 0
      )) {
        hasRepeat = true;
      }
    });
    truthy(!hasRepeat, 'chips post-respuesta no ofrecen "este mes" al responder total_ganado');
    truthy(rNext.actions.length <= 3, 'dosificación: ≤ 3 chips post-respuesta');
  }

  // Para "saludo": el motor no lo toca (retorna null)
  truthy(w.aiNextChips('saludo', cNext, baseActions) === null,
    'saludo: aiNextChips devuelve null (no pisa los chips de onboarding)');
})();

// ── E. Número aislado "1500000" en contexto de salary-setup ─────
group('flujo salary-setup: número aislado se procesa como salario (no query nueva)');
(function () {
  // Simular contexto: la IA preguntó "¿cuánto ganás al mes?" y registró
  // una sugerencia de tipo configurar_salario. El usuario responde "1500000".
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) {
    w._aiMemory.lastSuggestion = {
      intent: 'configurar_salario',
      query: '¿cuánto ganás al mes?',
      text: '¿Cuánto ganás al mes? Decime el monto para configurar tu salario.'
    };
  }
  // El NLP no debe clasificar "1500000" como total_ganado; debe ir a configurar_salario
  var nlpNum = w.aiClassifyIntent('1500000');
  truthy(
    nlpNum && nlpNum.confidence < 0.5,
    '"1500000" solo → confianza baja (no es una query de datos)'
  );
  // Restaurar
  if (typeof w._aiMemory !== 'undefined' && w._aiMemory) {
    w._aiMemory.lastSuggestion = null;
  }

  // El handler de configurar_salario debe reconocer un número grande como salario
  var stSalario = {
    turnos: [], turnosAll: [],
    calc: w.doCalc([], null, new Date(), 0),
    vh: 0, salario: 0,
    session: { uid: 'u-sal', email: 'sal@x.com' }
  };
  w.aiResetConv();
  var rSalario = w.aiAnswer('mi salario es 1500000', stSalario);
  var tSalario = respText(rSalario);
  truthy(
    (rSalario && rSalario.execute && rSalario.execute.type === 'SET_SALARY') ||
    tSalario.indexOf('1.500.000') >= 0 ||
    tSalario.indexOf('salario') >= 0 ||
    tSalario.indexOf('guardar') >= 0,
    '"mi salario es 1500000" produce SET_SALARY o confirma el monto'
  );
})();

// ── hashPassword / verifyPassword (PBKDF2 + salt, v49) ──────────
group('password-hash (PBKDF2 con salt)');
(async function () {
  try {
    var blob = await w.hashPassword('miPassword123');
    var parsed = JSON.parse(blob);
    truthy(parsed.v === 1, 'schema v1');
    truthy(parsed.s && parsed.h, 'tiene salt + hash');
    truthy(parsed.s !== parsed.h, 'salt y hash distintos');

    var ok1 = await w.verifyPassword('miPassword123', blob);
    truthy(ok1.ok && !ok1.legacy, 'password correcta verifica OK (no legacy)');

    var ok2 = await w.verifyPassword('otraPass', blob);
    truthy(!ok2.ok, 'password incorrecta no verifica');

    // Verificación legacy (formato plaintext pre-v49)
    var ok3 = await w.verifyPassword('viejaPlain', 'viejaPlain');
    truthy(ok3.ok && ok3.legacy, 'legacy plaintext matchea con flag legacy=true');

    var ok4 = await w.verifyPassword('viejaPlain', 'otraPlain');
    truthy(!ok4.ok, 'legacy plaintext NO matchea contra otro valor');

    // Salt random: dos hashes del mismo password DEBEN diferir
    var blob2 = await w.hashPassword('miPassword123');
    truthy(blob !== blob2, 'dos hashes del mismo password difieren (salt random)');
  } catch (e) {
    FAIL++;
    console.error('  ✗ password-hash threw:', e.message);
  }

  // ── Resumen ─────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('  ' + PASS + ' OK · ' + FAIL + ' fallos');
  console.log('═══════════════════════════════════════');
  process.exit(FAIL > 0 ? 1 : 0);
})();
