// ════════════════════════════════════════════════════════════════
//  MI TURNO · services/ai.js
//  Motor de IA local 100% offline · 50+ capacidades
//  Sin red, sin LLM, sin dependencias externas
// ════════════════════════════════════════════════════════════════
/* global aiBestSearch */

// ─── NLP HELPERS ───────────────────────────────────────────────

function _aiNorm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡?!;:()[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _aiHas(t) {
  for (var i = 1; i < arguments.length; i++) {
    if (t.indexOf(arguments[i]) >= 0) return true;
  }
  return false;
}

function _aiAll(t, arr) {
  for (var i = 0; i < arr.length; i++) if (t.indexOf(arr[i]) < 0) return false;
  return true;
}

// ¿El texto trae un número EXPLÍCITAMENTE negativo? _aiNum() lee solo dígitos
// (ignora el signo), así que "-5000000" se interpretaba como +5.000.000. Para
// validar entradas (meta, simulación) hay que mirar el signo en el texto crudo.
// El minus debe ir tras inicio o espacio para no confundir rangos ("10-15").
function _aiEsNegativo(s) {
  return /(^|\s)-\s*\d/.test(s || '');
}

// ¿La pregunta menciona una fecha que NO existe? ("31 de febrero", "31 de abril").
// Sin esto el parser hacía rollover en silencio (31-feb → 3-mar) y respondía por
// la fecha equivocada. febrero tope 29 (permite bisiesto).
function _aiFechaImposible(s) {
  var max = {
    enero: 31,
    febrero: 29,
    marzo: 31,
    abril: 30,
    mayo: 31,
    junio: 30,
    julio: 31,
    agosto: 31,
    septiembre: 30,
    setiembre: 30,
    octubre: 31,
    noviembre: 30,
    diciembre: 31
  };
  var m = (s || '').match(
    /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/
  );
  if (!m) return false;
  var d = parseInt(m[1], 10);
  return d < 1 || d > max[m[2]];
}

// Extrae primer número en texto. Soporta dígitos y palabras (uno..diez)
function _aiNum(t) {
  // Limpiar formato de moneda común en Colombia (puntos de miles)
  var clean = t.replace(/\./g, '').replace(/,/g, '.');
  // Multiplicadores colombianos: "2 millones" → 2000000, "150 lucas" →
  // 150000. Sin esto "dos millones" devolvía 2 y los handlers de meta
  // caían al salario base como si el número no existiera.
  var m = clean.match(/(\d+(?:\.\d+)?)\s*([a-z]*)/);
  if (m) {
    var val = parseFloat(m[1]);
    var unit = m[2] || '';
    if (unit.indexOf('millon') === 0 || unit === 'palos' || unit === 'palo') {
      return val * 1000000;
    }
    if (unit === 'mil' || unit === 'lucas' || unit === 'k') return val * 1000;
    return val;
  }

  // Mapeo de palabras a números
  var w = {
    cero: 0,
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    veinte: 20,
    treinta: 30
  };
  for (var k in w) {
    var idx = t.indexOf(k);
    if (idx >= 0) {
      var rest = t.substring(idx + k.length);
      if (/^\s*millon/.test(rest)) return w[k] * 1000000;
      if (/^\s*(mil|lucas)\b/.test(rest)) return w[k] * 1000;
      return w[k];
    }
  }
  return null;
}

// ─── DETECCIÓN DE TIPO DE HORA (para simulador) ──────────────
// Detecta el tipo de hora mencionado en el texto y devuelve una
// clave canónica. Retorna null si no hay tipo específico.
// Orden de evaluación: combinaciones primero, luego simples.
function _aiDetectarTipoHora(t) {
  var s = (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  var esFest =
    s.indexOf('festiv') >= 0 ||
    s.indexOf('feriado') >= 0 ||
    s.indexOf('dominical') >= 0 ||
    s.indexOf('domingo') >= 0;
  var esNoct =
    s.indexOf('nocturn') >= 0 ||
    s.indexOf('noche') >= 0 ||
    s.indexOf('madrugad') >= 0 ||
    s.indexOf('noct') >= 0;
  var esExtra =
    s.indexOf('extra') >= 0 || s.indexOf('sobretiemp') >= 0 || s.indexOf('adicional') >= 0;

  // Combinaciones primero (más específicas)
  if (esFest && esNoct && esExtra) return 'extraFestNoct';
  if (esFest && esNoct) return 'noctFest';
  if (esFest && esExtra) return 'extraFestDiur';
  if (esFest) return 'diurnaFest';
  if (esNoct && esExtra) return 'extraNoct';
  if (esNoct) return 'noctOrd';
  if (esExtra) return 'extraDiurna';
  return null;
}

// Factores de recargo por tipo (fuente: RC en globals.js)
function _aiFactor(tipo) {
  var factores = {
    diurnaOrd: 1.0,
    noctOrd: 1.35,
    diurnaFest: 1.75,
    noctFest: 2.1,
    extraDiurna: 1.25,
    extraNoct: 1.75,
    extraFestDiur: 2.0,
    extraFestNoct: 2.5
  };
  return factores[tipo] || 1.0;
}

// Etiquetas legibles por tipo. Los recargos festivos son date-aware (Ley
// 2466/2025): el % mostrado se deriva del vigente HOY para que coincida con
// los montos (calculados por doCalc según la fecha del turno).
function _aiLabelTipo(tipo) {
  var p = function (rk) {
    return Math.round((rcFactor(rk, new Date()) - 1) * 100);
  };
  var labels = {
    diurnaOrd: 'diurnas ordinarias',
    noctOrd: 'nocturnas (+35%)',
    diurnaFest: 'festivas diurnas (+' + p('diurnaFest') + '%)',
    noctFest: 'festivas nocturnas (+' + p('noctFest') + '%)',
    extraDiurna: 'extra diurnas (+25%)',
    extraNoct: 'extra nocturnas (+75%)',
    extraFestDiur: 'extra festivas diurnas (+' + p('extraFestDiur') + '%)',
    extraFestNoct: 'extra festivas nocturnas (+' + p('extraFestNoct') + '%)'
  };
  return labels[tipo] || tipo;
}

// ─── VARIACIÓN DE FRASES CONVERSACIONALES ────────────────────
var _aiPhraseVariants = {
  total: [
    'Te cuento cómo vas:',
    'Esto es lo que llevas:',
    'Aquí van tus números:',
    'Así vas este mes:',
    'Vamos a ver...',
    'Mira esto:'
  ],
  comparativa: [
    'Mira la comparativa:',
    'Te pongo los números lado a lado:',
    'Así se ve la diferencia:',
    'Comparando ambos periodos:'
  ],
  consejo: [
    'Un tip rápido:',
    'Te recomiendo:',
    'Mi sugerencia:',
    'Para mejorar:',
    'Algo que podrías hacer:'
  ]
};

function _aiPickPhrase(category) {
  var opts = _aiPhraseVariants[category] || [''];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ─── PREGUNTAS DE SEGUIMIENTO CONVERSACIONALES ─────────────────
var _aiFollowUps = {
  salario: [
    '¿Quieres saber cuánto te falta para la meta? 🤔',
    '¿Te gustaría ver cómo subir ese número con nocturnas o extras?'
  ],
  extra: [
    '¿Quieres el detalle de cuánto suman esas extras por tipo?',
    '¿Te gustaría saber cómo se comparan con el mes pasado?'
  ],
  nocturn: [
    '¿Sabías que con 20h nocturnas extra podrías sumar bastante más?',
    '¿Quieres ver cuánto ganarías si haces solo turnos nocturnos?'
  ],
  festiv: [
    '¿Quieres saber cuáles son los próximos festivos que se vienen?',
    '¿Te gustaría planear tus turnos para esos días?'
  ],
  proyecc: [
    '¿Quieres que calcule escenarios optimista y pesimista?',
    '¿Te gustaría saber cuánto necesitas trabajar para llegar a una meta específica?'
  ],
  resumen: [
    '¿Quieres comparar con el mes pasado?',
    '¿Necesitas algún detalle más específico?',
    '¿Te gustaría que envíe esto por correo?'
  ],
  hola: [
    '¿Qué quieres saber hoy?',
    '¿Te ayudo con tu mes, tus ingresos o algo más?',
    'Dime, ¿cómo van los turnos?'
  ],
  descanso: [
    '¿Te gustaría que te recuerde cuándo fue tu último día libre?',
    '¿Quieres calcular cuánto has descansado este mes?'
  ],
  default: [
    '¿Necesitas algo más?',
    '¿Quieres profundizar en algún dato?',
    'Dime si quieres que calcule algo más.',
    '¿Te sirve esa info o necesitas otra cosa?'
  ]
};

// Cada categoría de follow-up del chain clásico apunta a un intent real (y una
// query para reclasificar). Antes estas preguntas eran callejones sin salida:
// se ofrecían pero no quedaban registradas, así que un "sí" caía al fallback.
var _aiFollowUpTarget = {
  salario: { intent: 'ahorro', query: '¿cuánto me falta para la meta?' },
  extra: { intent: 'distribucion', query: 'detalle de horas extra por tipo' },
  nocturn: { intent: 'simulacion', query: '¿cuánto ganaría si hago solo nocturnas?' },
  festiv: { intent: 'festivos', query: '¿cuáles son los próximos festivos?' },
  proyecc: { intent: 'proyeccion', query: 'proyección al cierre del mes' },
  resumen: { intent: 'stats', query: 'mis estadísticas' },
  descanso: { intent: 'bienestar', query: '¿cuándo fue mi último descanso?' }
};

function _aiPickFollowUp(intent) {
  var opts = _aiFollowUps[intent] || _aiFollowUps['default'];
  var phrase = opts[Math.floor(Math.random() * opts.length)];
  // Registrar la sugerencia para que aiCheckFollowUp resuelva un "sí" posterior.
  var tgt = _aiFollowUpTarget[intent];
  if (tgt && typeof _aiMemory !== 'undefined' && _aiMemory) {
    _aiMemory.lastSuggestion = { intent: tgt.intent, query: tgt.query, text: phrase };
  }
  return phrase;
}

// ─── CONSTRUCCIÓN DE CONTEXTO ──────────────────────────────────

function buildContext(state) {
  var ahora = new Date();
  var iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  var diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  var diaActual = ahora.getDate();
  var vh = state.vh || 0;
  var salario = state.salario || SMIN;

  // Turnos del mes (state.turnos viene filtrado por mes)
  var turnosMes = (state.turnos || []).filter(function (t) {
    return new Date(t.inicio) >= iniMes && t.fin;
  });

  // Turnos absolutos (todos): usado para mes/semana pasados
  var turnosAll = state.turnosAll || state.turnos || [];

  // ── Mes actual ──
  var dias = calcPorDia(turnosMes, vh);
  var totalMins = state.calc.totalMins,
    totalCOP = state.calc.totalCOP;
  var diasTrab = dias.length;
  var prom = diasTrab > 0 ? totalCOP / diasTrab : 0;
  var promHoras = diasTrab > 0 ? totalMins / diasTrab / 60 : 0;
  var mejor =
    dias.length > 0
      ? dias.reduce(function (a, b) {
          return b.cop > a.cop ? b : a;
        }, dias[0])
      : null;
  var peor =
    dias.length > 0
      ? dias.reduce(function (a, b) {
          return b.cop < a.cop ? b : a;
        }, dias[0])
      : null;
  var festTrab = dias.filter(function (d) {
    return d.fest;
  });
  var bd = state.calc.bd;
  // Helper para acceso seguro a los recargos (evita TypeError)
  var _get = function (k, p) {
    return (bd[k] || {})[p] || 0;
  };

  var nocturnasMins =
    _get('noctOrd', 'mins') +
    _get('extraNoct', 'mins') +
    _get('noctFest', 'mins') +
    _get('extraFestNoct', 'mins');
  var nocturnasCOP =
    _get('noctOrd', 'cop') +
    _get('extraNoct', 'cop') +
    _get('noctFest', 'cop') +
    _get('extraFestNoct', 'cop');
  var festMins =
    _get('diurnaFest', 'mins') +
    _get('noctFest', 'mins') +
    _get('extraFestDiur', 'mins') +
    _get('extraFestNoct', 'mins');
  var festCOP =
    _get('diurnaFest', 'cop') +
    _get('noctFest', 'cop') +
    _get('extraFestDiur', 'cop') +
    _get('extraFestNoct', 'cop');
  var extraMins =
    _get('extraDiurna', 'mins') +
    _get('extraNoct', 'mins') +
    _get('extraFestDiur', 'mins') +
    _get('extraFestNoct', 'mins');
  var extraCOP =
    _get('extraDiurna', 'cop') +
    _get('extraNoct', 'cop') +
    _get('extraFestDiur', 'cop') +
    _get('extraFestNoct', 'cop');

  var diurnaOrdMins = _get('diurnaOrd', 'mins'),
    diurnaOrdCOP = _get('diurnaOrd', 'cop');

  var proy = diasTrab > 0 ? (totalCOP / diaActual) * diasMes : 0;
  var pctSalario = salario > 0 ? (totalCOP / salario) * 100 : 0;
  var falta = Math.max(0, salario - totalCOP);
  var horasParaMeta = vh > 0 ? falta / vh : 0;

  // ── Mes pasado ──
  var iniMesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  var finMesPasado = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
  finMesPasado.setHours(23, 59, 59, 999);
  var turnosMesPasado = turnosAll.filter(function (t) {
    var d = new Date(t.inicio);
    return d >= iniMesPasado && d <= finMesPasado && t.fin;
  });
  var calcMesPasado =
    turnosMesPasado.length > 0
      ? doCalc(turnosMesPasado, null, finMesPasado, vh)
      : { totalMins: 0, totalCOP: 0, bd: {} };
  var diasTrabMesPasado = calcPorDia(turnosMesPasado, vh).length;

  // ── Semana actual (Lun-Dom) ──
  var iniSemana = semLun(ahora);
  var turnosSemana = turnosMes.filter(function (t) {
    return new Date(t.inicio) >= iniSemana;
  });
  var diasSemana = calcPorDia(turnosSemana, vh);
  var totalCOPSemana = diasSemana.reduce(function (a, d) {
    return a + d.cop;
  }, 0);
  var totalMinsSemana = diasSemana.reduce(function (a, d) {
    return a + d.mins;
  }, 0);
  // Desglose de la semana: necesario para el aviso de límite legal de horas
  // extra (12h/semana). Antes el auditor usaba extraMins del MES y lo llamaba
  // "esta semana" → cifras absurdas (206h) cuando un turno largo contaminaba.
  var calcSemana = turnosSemana.length > 0 ? doCalc(turnosSemana, null, ahora, vh) : { bd: {} };
  var _getSem = function (k, p) {
    return ((calcSemana.bd || {})[k] || {})[p] || 0;
  };
  var extraMinsSemana =
    _getSem('extraDiurna', 'mins') +
    _getSem('extraNoct', 'mins') +
    _getSem('extraFestDiur', 'mins') +
    _getSem('extraFestNoct', 'mins');

  // ── Semana pasada ──
  var iniSemPas = new Date(iniSemana);
  iniSemPas.setDate(iniSemana.getDate() - 7);
  var finSemPas = new Date(iniSemana);
  finSemPas.setMilliseconds(-1);
  var turnosSemPas = turnosAll.filter(function (t) {
    var d = new Date(t.inicio);
    return d >= iniSemPas && d <= finSemPas && t.fin;
  });
  var diasSemPas = calcPorDia(turnosSemPas, vh);
  var totalCOPSemPas = diasSemPas.reduce(function (a, d) {
    return a + d.cop;
  }, 0);
  var totalMinsSemPas = diasSemPas.reduce(function (a, d) {
    return a + d.mins;
  }, 0);

  // ── Hoy / Ayer ──
  var hoyIni = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var ayerIni = new Date(hoyIni);
  ayerIni.setDate(hoyIni.getDate() - 1);
  var turnosHoy = turnosMes.filter(function (t) {
    return new Date(t.inicio) >= hoyIni;
  });
  var turnosAyer = turnosAll.filter(function (t) {
    var d = new Date(t.inicio);
    return d >= ayerIni && d < hoyIni && t.fin;
  });
  var diasHoy = calcPorDia(turnosHoy, vh);
  var diasAyer = calcPorDia(turnosAyer, vh);
  var copHoy = diasHoy.reduce(function (a, d) {
    return a + d.cop;
  }, 0);
  var minsHoy = diasHoy.reduce(function (a, d) {
    return a + d.mins;
  }, 0);
  var copAyer = diasAyer.reduce(function (a, d) {
    return a + d.cop;
  }, 0);
  var minsAyer = diasAyer.reduce(function (a, d) {
    return a + d.mins;
  }, 0);

  // ── Turno más largo / corto ──
  var tLargo = null,
    tCorto = null;
  turnosMes.forEach(function (t) {
    var dur = (new Date(t.fin) - new Date(t.inicio)) / 60000;
    if (dur <= 0) return;
    if (!tLargo || dur > tLargo.dur) tLargo = { t: t, dur: dur };
    if (!tCorto || dur < tCorto.dur) tCorto = { t: t, dur: dur };
  });

  // ── Patrón día de semana y horas valle ──
  var dowMins = [0, 0, 0, 0, 0, 0, 0],
    dowCOP = [0, 0, 0, 0, 0, 0, 0],
    dowCount = [0, 0, 0, 0, 0, 0, 0];
  dias.forEach(function (d) {
    var dt = new Date(d.fecha + 'T12:00:00');
    var dow = (dt.getDay() + 6) % 7;
    var dMins = d.mins || 0;
    dowMins[dow] += dMins;
    dowCOP[dow] += d.cop;
    dowCount[dow]++;
  });
  var bestDow = 0,
    worstDow = -1;
  for (var i = 1; i < 7; i++) {
    if (dowCOP[i] > dowCOP[bestDow]) bestDow = i;
    if (dowCOP[i] > 0 && (worstDow < 0 || dowCOP[i] < dowCOP[worstDow])) worstDow = i;
  }
  if (worstDow < 0) worstDow = 0;
  var bestDowInfo = {
    dia: bestDow,
    cop: dowCOP[bestDow],
    count: dowCount[bestDow]
  };

  // ── Próximos festivos del año ──
  var festSet = getColombianHolidays(ahora.getFullYear());
  var proxFests = [];
  var probe = new Date(ahora);
  probe.setHours(0, 0, 0, 0);
  probe.setDate(probe.getDate() + 1);
  for (var n = 0; n < 366 && proxFests.length < 5; n++) {
    var key =
      probe.getFullYear() +
      '-' +
      String(probe.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(probe.getDate()).padStart(2, '0');
    if (festSet.has(key) && probe.getDay() !== 0) proxFests.push(new Date(probe));
    probe.setDate(probe.getDate() + 1);
    if (probe.getFullYear() !== ahora.getFullYear()) break;
  }

  // ── Velocidad efectiva (COP por hora trabajada real) ──
  var copPorHoraReal = totalMins > 0 ? totalCOP / (totalMins / 60) : vh;

  // ── Racha actual (días consecutivos trabajando, contando hacia atrás) ──
  var rachaActual = 0;
  var probeR = new Date(ahora);

  for (var k = 0; k < diasMes; k++) {
    var keyR =
      probeR.getFullYear() +
      '-' +
      String(probeR.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(probeR.getDate()).padStart(2, '0');
    var trabajado = dias.some(function (d) {
      return d.fecha === keyR;
    });
    // La racha se rompe al primer día sin trabajo registrado
    if (!trabajado) break;
    rachaActual++;
    probeR.setDate(probeR.getDate() - 1);
  }

  // ── Estimación de Liquidación Proporcional (CST Colombia) ──
  var diasMesEfectivos = Math.max(1, diaActual);
  var estPrima = (salario * diasMesEfectivos) / 360;
  var estCesantias = (salario * diasMesEfectivos) / 360;
  var estIntereses = (estCesantias * diasMesEfectivos * 0.12) / 360;
  var estVacaciones = (salario * diasMesEfectivos) / 720;
  // Auxilio de transporte: usa la constante global definida en js/config/globals.js
  var estTransporte = totalCOP > SMIN * 2 ? 0 : (AUX_TRANSPORTE_2026 * diasMesEfectivos) / 30;
  var totalLiq = estPrima + estCesantias + estIntereses + estVacaciones + estTransporte;

  // Descuentos de ley (Salud 4% + Pensión 4% = 8%)
  var deducciones = totalCOP * 0.08;
  var sueldoNeto = totalCOP - deducciones + estTransporte;

  // ── Análisis de Bienestar ──
  // Alerta si el promedio semanal supera las 46h o si hay racha de 6+ días
  var hrsSemanales = diaActual > 0 ? totalMins / 60 / (diaActual / 7) : 0;
  var alertaFatiga = hrsSemanales > 48 || rachaActual >= 6;

  // ── Días hábiles restantes (no domingos ni festivos del calendario laboral, contando todos) ──
  var diasRestantes = diasMes - diaActual;

  // ── Campos para sistema de logros ──
  var festDiasCount = festTrab.length;
  var hoyEsRecord = false;
  if (mejor && dias.length > 0) {
    var hoyKey =
      ahora.getFullYear() +
      '-' +
      String(ahora.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(ahora.getDate()).padStart(2, '0');
    hoyEsRecord = mejor.fecha === hoyKey;
  }
  var totalTurnosVida =
    (state.turnosAll || state.turnos || []).length +
    (state.calc && state.calc.totalMins > 0 ? 1 : 0);

  // ── Contexto situacional ──────────────────────────────────────
  var horaDelDia = ahora.getHours();
  var periodoDelDia =
    horaDelDia >= 6 && horaDelDia < 12
      ? 'mañana'
      : horaDelDia >= 12 && horaDelDia < 18
        ? 'tarde'
        : horaDelDia >= 18 && horaDelDia < 22
          ? 'noche'
          : 'madrugada';
  var _diaSemNum = ahora.getDay();
  var _DOW_ES2 = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var diaSemana = _DOW_ES2[_diaSemNum];
  var esFinDeSemana = _diaSemNum === 0 || _diaSemNum === 6;
  var _hoyFestKey =
    ahora.getFullYear() +
    '-' +
    String(ahora.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(ahora.getDate()).padStart(2, '0');
  var esFestivo = festSet && typeof festSet.has === 'function' ? festSet.has(_hoyFestKey) : false;

  // Turno activo en curso
  var activoObj = state.activo || null;
  var tieneActivo = !!(activoObj && activoObj.inicio);
  var minutosEnTurnoActual = 0;
  if (tieneActivo) {
    minutosEnTurnoActual = Math.round((ahora - new Date(activoObj.inicio)) / 60000);
  }
  var alertaTurnoLargo = tieneActivo && minutosEnTurnoActual > 600; // >10h
  var alertaNocturnaActivo = tieneActivo && (horaDelDia >= 22 || horaDelDia < 6);

  // Indicadores de setup y historial.
  // El flag real de "salario configurado" es mt_sc_<uid> (lo marca el
  // usuario al guardar su salario). Usar `salario > SMIN` como proxy
  // trataba a quien gana EXACTAMENTE el mínimo (el grueso del público)
  // como si no lo hubiera configurado. Leemos el flag y dejamos el
  // proxy solo como respaldo para quien ya subió su salario.
  var _scFlag = false;
  try {
    if (state.session && state.session.uid && typeof leer === 'function') {
      _scFlag = leer(dk(state.session.uid, 'sc'), false) === true;
    }
  } catch (_e) {}
  var salarioConfigurado = _scFlag || salario > SMIN;
  var tieneHistorial = turnosAll.length > 0;

  // Bienestar compuesto
  var necesitaDescanso = rachaActual >= 6 || alertaTurnoLargo;
  var _wb = 'normal';
  if (alertaTurnoLargo || rachaActual >= 9 || hrsSemanales > 55) _wb = 'critico';
  else if (rachaActual >= 6 || hrsSemanales > 46) _wb = 'cansado';
  else if (rachaActual <= 3 && diasTrab >= 5 && hrsSemanales < 40) _wb = 'optimo';
  var estadoBienestar = _wb;

  return {
    // Tiempo
    // 📚 Diccionario para Programar (Base de Conocimiento Admin)
    _dictionary: {
      // Anatomía y Estructura
      html: 'HTML: Es el esqueleto. index.html es la puerta de entrada principal.',
      css: 'CSS: Es la ropa y estilos. Tu app usa 38 archivos CSS para ser modular.',
      js: 'JavaScript: El cerebro. 39 archivos JS manejan la lógica y Supabase.',
      'sw.js':
        'Service Worker: Asistente fantasma. Maneja el modo offline y el caché persistente. ¡Cuidado con el caché viejo!',
      'manifest.json': 'Configura la instalación como PWA (icono, nombre, colores de tema).',
      'package.json': 'Lista de "ingredientes" y librerías del proyecto.',
      'estructura.md': 'Tu mapa interno que explica la fragmentación en 77 archivos.',
      base: 'Carpeta css/base/: Reglas fundamentales (colores, reset, tipografía).',
      layout:
        'Carpeta css/layout/: Cómo se acomodan las cosas (header, scroll, botones de acción).',
      components: 'Carpeta css/components/: Bloques reutilizables (tarjetas, botones, inputs).',
      utils: 'Carpeta js/utils/: Funciones pequeñas (formato de moneda, haptic, red).',
      'sync-queue.js':
        'Cola de sincronización: Guarda cambios offline y los sube a Supabase cuando hay conexión.',
      services: 'Carpeta js/services/: Conexiones externas (Supabase, Calculadora, IA).',
      tabs: 'Carpeta js/tabs/: Las 5 pantallas principales de la interfaz.',
      app: 'Carpeta js/app/: Componentes de alto nivel (Root, Auth, AppMain).',

      // Conceptos Web
      pwa: 'Progressive Web App: Web que se siente como app (instalable + offline).',
      cache: 'Memoria temporal. El nivel de Service Worker es el más terco.',
      cdn: 'Red de servidores que sirven librerías como React o Chart.js rápidamente.',
      404: 'Error: No existe. El archivo no se encuentra en la ruta especificada.',
      500: 'Error de servidor: Algo falló en la nube o en la lógica de Vercel.',
      modular: 'Muchos archivos pequeños vs uno gigante. Facilita el mantenimiento.',
      frontend: 'Lo que el usuario ve y toca (HTML/CSS/JS).',
      backend: 'Lo que no se ve (Supabase: Base de datos y Auth).',
      react: 'Librería de UI. Describe los componentes y React los actualiza automáticamente.',

      // Git y Vercel
      git: 'Control de versiones. Commit (foto), Branch (rama), Push (subir), Pull (bajar).',
      commit: 'Un "punto de guardado" en la historia de tu código.',
      branch: 'Rama: Línea paralela de desarrollo (ej: ajustes, main).',
      revert: 'Deshacer un cambio creando un commit nuevo que anula el anterior.',
      reset: 'Mover la historia hacia atrás. Peligroso si ya hiciste Push.',
      vercel: 'Donde vive tu app. Despliega automáticamente desde GitHub.',
      deployment: 'Una versión publicada de tu app. Son inmutables.',
      rollback: 'Volver a una versión anterior que funcionaba bien.',

      // DevTools
      devtools:
        'F12: Herramienta detective. Console (errores), Network (peticiones), Application (SW/Storage).',
      console: 'Donde JavaScript grita sus errores. Mira aquí primero.',
      network: 'Muestra qué archivos cargan. Rojo = Fallo (404 o red).',
      application: 'Usa esta pestaña para borrar el Service Worker (Unregister) si nada actualiza.'
    },
    // Mapa Estructural para Consultas de Desarrollo
    _devMap: {
      emoji: 'Lógica visual: js/tabs/home.js (botones) o js/utils/icons.js (SVG de navegación).',
      luna: 'Modo oscuro: js/tabs/home.js (icono) y estilos en css/modals/dark-overrides.css.',
      color:
        'Modifica css/base/variables.css para temas globales o el CSS específico en css/components/.',
      boton: 'Estilos: css/layout/action-button.css. Lógica de inicio: js/tabs/home.js.',
      calculo: 'Toda la lógica matemática reside en js/services/calculator.js.',
      supabase: 'Configuración en js/config.js y helpers en js/services/supabase.js.',
      login:
        'Pantalla de acceso en js/app/auth-screen.js y estilos en css/components/auth-screen.css.',
      error: 'Logger en js/utils/error-logger.js y visor en js/modals/error-viewer.js.',
      pdf: 'Generación de documentos en js/services/export-files.js.',
      ia: 'Este motor reside en js/services/ai.js.',
      infra:
        'Verifica js/config.js. En Vercel, revisa las Env Variables. En Supabase, revisa las políticas RLS.',
      vercel:
        'Si la app no carga: 1. Revisa las "Environment Variables" en el dashboard de Vercel. 2. Verifica si el Service Worker (sw.js) está cacheando una versión vieja.',
      red: 'Usa navigator.onLine para detectar cortes. Errores de "Failed to fetch" suelen ser CORS o falta de internet.'
    },
    // Guía de resolución de problemas técnicos
    _troubleshooting: {
      supabase_auth:
        'Si falla el login: Revisa si el email está confirmado en Supabase Auth o si las políticas de la tabla "perfiles" permiten la lectura.',
      supabase_db:
        'Si no guarda datos: Revisa la consola de errores (🐞). Si ves "PGRST116", es que el registro no existe. Si es "403", es un problema de RLS.',
      vercel_deploy:
        'Si ves un error 500 en Vercel: Revisa los logs de las Edge Functions en el dashboard. Suele ser una variable de entorno faltante.',
      network_offline:
        'La app detecta estado offline. Los cambios se guardarán en localStorage (js/utils/storage.js) y se sincronizarán al volver la red.',
      cors: 'Si ves errores de CORS: Asegúrate de que el dominio de Vercel esté en la lista blanca de "Allowed Origins" en el dashboard de Supabase (API Settings).'
    },
    ahora: ahora,
    diasMes: diasMes,
    diaActual: diaActual,
    diasRestantes: diasRestantes,
    uid: state.session && state.session.uid ? state.session.uid : null,
    email: state.session && state.session.email ? state.session.email : '',
    online: typeof navigator !== 'undefined' ? !!navigator.onLine : !!state.online,
    // Configuración
    salario: salario,
    vh: vh,
    prefs:
      state.session && state.session.uid && typeof leer === 'function'
        ? leer(dk(state.session.uid, 'prefs'), {})
        : {},
    // Mes actual
    turnosAll: turnosAll,
    turnosMes: turnosMes,
    turnosMesPasado: turnosMesPasado,
    turnosSemana: turnosSemana,
    turnosSemPas: turnosSemPas,
    dias: dias,
    totalMins: totalMins,
    totalCOP: totalCOP,
    diasTrab: diasTrab,
    // turnosMesN = cantidad de TURNOS del mes (puede ser > diasTrab si hay días
    // con 2 turnos). El texto debe decir "N turnos" con este conteo, no con
    // diasTrab (días), para no contradecir el footer de evidencia.
    turnosMesN: turnosMes.length,
    promPorTurno: turnosMes.length > 0 ? totalCOP / turnosMes.length : 0,
    prom: prom,
    promHoras: promHoras,
    mejor: mejor,
    peor: peor,
    bd: bd,
    diurnaOrdMins: diurnaOrdMins,
    diurnaOrdCOP: diurnaOrdCOP,
    nocturnasMins: nocturnasMins,
    nocturnasCOP: nocturnasCOP,
    festMins: festMins,
    festCOP: festCOP,
    festTrab: festTrab,
    extraMins: extraMins,
    extraCOP: extraCOP,
    proy: proy,
    pctSalario: pctSalario,
    falta: falta,
    horasParaMeta: horasParaMeta,
    // Mes pasado
    totalCOPMesPasado: calcMesPasado.totalCOP || 0,
    totalMinsMesPasado: calcMesPasado.totalMins || 0,
    diasMesPasado: diasTrabMesPasado,
    // Semana actual
    totalCOPSemana: totalCOPSemana,
    totalMinsSemana: totalMinsSemana,
    extraMinsSemana: extraMinsSemana,
    diasSemanaCount: diasSemana.length,
    // Semana pasada
    totalCOPSemPas: totalCOPSemPas,
    totalMinsSemPas: totalMinsSemPas,
    diasSemPasCount: diasSemPas.length,
    // Hoy / ayer
    copHoy: copHoy,
    minsHoy: minsHoy,
    turnosHoy: turnosHoy.length,
    copAyer: copAyer,
    minsAyer: minsAyer,
    turnosAyer: turnosAyer.length,
    // Turnos extremo
    tLargo: tLargo,
    tCorto: tCorto,
    // Patrones
    dowMins: dowMins,
    dowCOP: dowCOP,
    dowCount: dowCount,
    bestDow: bestDow,
    bestDowInfo: bestDowInfo,
    worstDow: worstDow,
    // Festivos / extras
    proxFests: proxFests,
    copPorHoraReal: copPorHoraReal,
    // Rachas
    rachaActual: rachaActual,
    // Finanzas y Salud
    totalLiq: totalLiq,
    estPrima: estPrima,
    estCesantias: estCesantias,
    estVacaciones: estVacaciones,
    estTransporte: estTransporte,
    deducciones: deducciones,
    sueldoNeto: sueldoNeto,
    burnout: alertaFatiga,
    hrsSemanales: hrsSemanales,
    // Logros
    festDiasCount: festDiasCount,
    hoyEsRecord: hoyEsRecord,
    totalTurnosVida: totalTurnosVida,
    // ── Situacional ──
    horaDelDia: horaDelDia,
    periodoDelDia: periodoDelDia,
    diaSemana: diaSemana,
    esFinDeSemana: esFinDeSemana,
    esFestivo: esFestivo,
    // Turno activo
    activo: activoObj,
    tieneActivo: tieneActivo,
    minutosEnTurnoActual: minutosEnTurnoActual,
    alertaTurnoLargo: alertaTurnoLargo,
    alertaNocturnaActivo: alertaNocturnaActivo,
    // Setup
    salarioConfigurado: salarioConfigurado,
    tieneHistorial: tieneHistorial,
    gender: typeof _glGetGender === 'function' ? _glGetGender() : null,
    // Bienestar compuesto
    necesitaDescanso: necesitaDescanso,
    estadoBienestar: estadoBienestar
  };
}

// ─── HELPERS DE FORMATO ────────────────────────────────────────

var _DOW = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function _fechaLarga(fechaISO) {
  var d = new Date(fechaISO + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function _bdLines(bd) {
  return Object.keys(bd)
    .filter(function (k) {
      return bd[k].mins > 0;
    })
    .map(function (k) {
      return '• ' + RC[k].label + ': ' + fCOP(bd[k].cop) + ' (' + fDur(bd[k].mins) + ')';
    })
    .join('\n');
}

// Base legal por categoría (para la traza de explicabilidad).
var _AI_BASE_LEGAL = {
  diurnaOrd: '—',
  noctOrd: 'CST Art. 168',
  diurnaFest: 'CST Art. 179 · Ley 2466/25',
  noctFest: 'CST Art. 168+179 · Ley 2466/25',
  extraDiurna: 'CST Art. 159',
  extraNoct: 'CST Art. 159+168',
  extraFestDiur: 'CST Art. 159+179',
  extraFestNoct: 'CST Art. 159+168+179'
};

// Explainability (Tier 2): traza paso a paso de CÓMO se llegó al total del mes.
// Anclada a doCalc (el oráculo): el factor de cada franja se deriva del COP real
// (cop / horas / vh), no se recalcula, así nunca diverge de la cifra mostrada.
// Cada franja lleva su base legal. Progressive disclosure: solo bajo pedido.
function _aiExplicarCalculo(c) {
  if (!c || !c.vh || !c.bd || !c.diasTrab) {
    return (
      'Para mostrarte el paso a paso necesito tu **salario base** configurado y al ' +
      'menos un turno este mes. Con eso te desgloso de dónde sale cada peso.'
    );
  }
  var vh = c.vh;
  var bd = c.bd;
  var keys = Object.keys(bd).filter(function (k) {
    return bd[k] && bd[k].mins > 0;
  });
  // Filas del desglose para la tarjeta nativa (lista agrupada, no tabla).
  var rows = [];
  var suma = 0;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var hrs = bd[k].mins / 60;
    var cop = bd[k].cop;
    suma += cop;
    var factor = hrs > 0 && vh > 0 ? cop / (hrs * vh) : 1;
    rows.push({
      icon: RC[k] ? RC[k].icon : '',
      label: RC[k] ? RC[k].label : k,
      value: Math.round(cop),
      meta: fDur(bd[k].mins) + '  ·  ×' + factor.toFixed(2),
      legal: _AI_BASE_LEGAL[k] || ''
    });
  }
  var nd = getInicioNocturno(c.ahora || new Date()) === 19 ? '7 p.m.' : '9 p.m.';
  // Texto conciso (lleva la a11y/TTS); el detalle por franja vive en la tarjeta.
  var text =
    '🧮 **Cómo calculé tus ' +
    fCOP(c.totalCOP) +
    '** de este mes:\n\n' +
    'Tu **valor hora** = salario base ÷ 240 = **' +
    fCOP(vh) +
    '/h**. Clasifiqué tus ' +
    (c.turnosMesN || c.diasTrab) +
    ' turnos por franja (la ley paga distinto cada una) y sumé los subtotales:\n\n' +
    '💡 La noche corre desde las ' +
    nd +
    ' y el recargo dominical/festivo va al **' +
    Math.round(getRecargoFestivo(c.ahora || new Date()) * 100) +
    '%** hoy (Ley 2466/2025). Cada turno se calcula con la ley vigente a **su** fecha.';
  return {
    text: text,
    card: { kind: 'breakdown', rows: rows, total: Math.round(suma), totalLabel: '💰 Total' }
  };
}

function _trend(curr, prev) {
  if (prev <= 0) return curr > 0 ? '+∞%' : 'sin cambio';
  var pct = ((curr - prev) / prev) * 100;
  var sig = pct >= 0 ? '+' : '';
  return sig + pct.toFixed(1) + '%';
}

// ─── DESPACHADOR NLP (v76) ─────────────────────────────────────
// Mapea intents clasificados por ai-nlp.js a respuestas.
// Solo se invoca cuando la confianza del clasificador es ≥0.5.
// Si un intent no está mapeado, devuelve null → cae al sistema clásico.
function _aiDispatchNLP(intent, c, state, q, t) {
  // Modo quincena por defecto: en los intents de "período de pago en curso",
  // reencuadrar el contexto a la quincena vigente (v365). Solo si el pref está
  // activo y la pregunta no fuerza el mes; el resto de intents sigue en el mes.
  if (_AI_QUINCENA_AUTO_INTENTS[intent]) {
    var _cQuin = _aiScopeQuincenaAuto(c, state, t);
    if (_cQuin) c = _cQuin;
  }

  // ── Conversacionales ──
  if (intent === 'saludo') {
    var s = typeof _saludoHora === 'function' ? _saludoHora(c.ahora) : 'Hola';
    var nm = state.session && state.session.email ? state.session.email.split('@')[0] : '';
    var nombre = nm ? ', ' + nm.charAt(0).toUpperCase() + nm.slice(1) : '';
    // Resuelve el "lienzo en blanco": gancho personalizado con su dato real
    // (curiosity gap) + chips tappables (cero fricción, no hay que escribir).
    // Se adapta al estado: turno activo / usuario nuevo / usuario con datos.
    var _hook = '';
    var _chips = [];
    if (c.alertaTurnoLargo) {
      _hook =
        ' Llevás ' +
        Math.round(c.minutosEnTurnoActual / 60) +
        'h en este turno — ¿todo bien? Cuidate. 🤝';
      _chips = [
        { label: '¿Cuánto llevo en el turno?', query: 'cuánto llevo en este turno' },
        { label: 'Cerrar turno', query: 'cerrar turno' }
      ];
    } else if (c.tieneActivo) {
      _hook = ' Tenés un turno corriendo ahora mismo. 🟢';
      _chips = [
        { label: '¿Cuánto llevo en el turno?', query: 'cuánto llevo en este turno' },
        { label: '¿Cómo voy este mes?', query: 'cuánto llevo este mes' }
      ];
    } else if (!c.salarioConfigurado || c.diasTrab === 0) {
      // Usuario nuevo / sin datos → onboarding con valor claro y concreto.
      _hook =
        ' Soy tu calculadora de turnos y plata: en un minuto te muestro cuánto ganás **de verdad** — con recargos, festivos y proyección al cierre.';
      _chips = [
        { label: '⚙️ Configurar mi salario', query: 'quiero configurar mi salario' },
        { label: '¿Cómo registro un turno?', query: 'cómo registro un turno' },
        { label: '¿Qué sabés hacer?', query: 'qué podés hacer' }
      ];
    } else {
      // Usuario con datos → gancho personalizado + acciones de alto valor.
      // Si cobra por quincena, el gancho habla de la quincena vigente (v365).
      var _cH = (_aiQuincenaModoActivo(c) && _aiScopeQuincenaAuto(c, state, t)) || c;
      var _nH = _cH.turnosMesN || _cH.diasTrab;
      _hook =
        ' ' +
        _aiPeriodoCap(_cH) +
        ' llevás **' +
        fCOP(_cH.totalCOP) +
        '** en ' +
        _nH +
        ' turno' +
        (_nH !== 1 ? 's' : '') +
        '.';
      if (c.necesitaDescanso)
        _hook += ' Ojo, ' + c.rachaActual + ' días seguidos — date un respiro.';
      _chips = _cH.esQuincena
        ? [
            { label: '¿Cómo voy esta quincena?', query: 'cómo voy esta quincena' },
            { label: '📈 Mi proyección', query: 'proyección al corte' },
            { label: '¿Me pagan bien?', query: 'me están pagando bien' }
          ]
        : [
            { label: '¿Cómo voy este mes?', query: 'cómo voy este mes' },
            { label: '📈 Mi proyección', query: 'proyección al cierre' },
            { label: '¿Me pagan bien?', query: 'me están pagando bien' }
          ];
    }
    return {
      text: '¡' + s + nombre + '!' + _hook + '\n\nTocá una opción 👇 o escribime con tus palabras.',
      actions: _chips
    };
  }
  if (intent === 'despedida') {
    var despedidas =
      typeof _gl === 'function'
        ? _gl('goodbye')
        : [
            '¡Nos vemos! Cuidate y descansá cuando puedas. ✦',
            'Chao, parce. Acá estoy cuando me necesités. 💪',
            '¡Hasta luego! Que te rinda el día. 🌟'
          ];
    return despedidas[Math.floor(Math.random() * despedidas.length)];
  }
  if (intent === 'agradecimiento') {
    var gracias =
      typeof _gl === 'function'
        ? _gl('thanks')
        : [
            '¡Con gusto! Para eso estoy. 🙌',
            'De nada, parce. Lo que necesités. ✨',
            'A la orden. ¿Algo más en que te ayude?'
          ];
    return gracias[Math.floor(Math.random() * gracias.length)];
  }
  if (intent === 'identidad') {
    return 'Soy tu asistente de nómina 100% local. Vivo en tu dispositivo, no envío tus datos a ningún lado. Conozco la Ley 2101/2021, los recargos colombianos, los festivos y tu historial de turnos. 🇨🇴';
  }
  if (intent === 'capacidades') {
    // Si pregunta específicamente por guías, mostrar todas
    if (
      typeof aiHelpListAll === 'function' &&
      _aiHas(t, 'guia', 'guía', 'lista', 'todo', 'todas', 'sabes hacer', 'podes hacer')
    ) {
      return aiHelpListAll();
    }
    return 'Estas son mis capacidades:\n\n💰 **Finanzas:** sueldo neto, liquidación, proyección\n⚖️ **Legal:** Ley 2101, recargos, auxilio de transporte\n📊 **Estadísticas:** KPIs, comparativas, rachas\n🔮 **Simulaciones:** ¿cuánto si trabajo X horas más?\n📅 **Festivos:** próximos, cuántos este mes\n🧘 **Bienestar:** análisis de fatiga, recomendaciones\n📧 **Reportes:** envío de PDF/Excel por correo\n📖 **Guías:** preguntame "¿cómo exporto?" o "¿cómo cambio mi foto?" para ayuda paso a paso';
  }

  // ── Conversacionales emocionales ──
  if (intent === 'celebracion') {
    var logros = [];
    if (c.pctSalario >= 100) logros.push('superaste tu salario base');
    if (c.diasTrab >= 20) logros.push('trabajaste ' + c.diasTrab + ' turnos este mes');
    if (c.rachaActual >= 5) logros.push('llevas ' + c.rachaActual + ' días seguidos sin parar');
    var logroStr = logros.length ? ' Te puedo decir que ' + logros.join(', ') + '. ' : '';
    var enc =
      typeof _gl === 'function'
        ? _gl('enthusiasm')
        : ['¡Así se hace!', '¡Con toda!', '¡Sin miedo al éxito!'];
    return (
      '🎉 ¡' +
      enc[Math.floor(Math.random() * enc.length)] +
      ' ' +
      logroStr +
      'Los éxitos se celebran y también se analizan — así se repiten.\n\n¿Querés ver el detalle de lo que lograste este mes?'
    );
  }
  if (intent === 'motivacion') {
    var enc2 =
      typeof _gl === 'function' ? _gl('enthusiasm') : ['¡Vamos con todo!', '¡Sin miedo al éxito!'];
    var apoyos = [
      'Cada turno que hacés, cada hora que ponés, es un ladrillo más. No se ven de cerca, pero desde lejos se ve el edificio.',
      'Los días difíciles son los que más te fortalecen. Si fuera fácil, todos lo harían.',
      'No medís el progreso día a día. Medís el progreso mes a mes. Y ahí es donde se nota lo que valés.',
      'Tenés ' + c.diasTrab + ' turnos encima este mes. Eso no lo hace cualquiera.',
      'El cansancio de hoy es el resultado de mañana. Seguí.'
    ];
    var apoyo = apoyos[Math.floor(Math.random() * apoyos.length)];
    return (
      '💪 ' +
      enc2[Math.floor(Math.random() * enc2.length)] +
      '\n\n' +
      apoyo +
      '\n\n¿Querés ver cómo vas este mes para recordarte por qué vale la pena?'
    );
  }
  if (intent === 'queja_fatiga') {
    var empat =
      typeof _gl === 'function' ? _gl('consolation') : ['Tranqui, todo bien.', 'Así es la vuelta.'];
    var resp = empat[Math.floor(Math.random() * empat.length)];
    var rachaMsg =
      c.rachaActual >= 6
        ? ' Llevás ' +
          c.rachaActual +
          ' días seguidos — la ley te da derecho a un descanso cada 6 días trabajados. No es un lujo, es tu derecho.'
        : ' A veces el cuerpo manda señales. Escuchalo.';
    return '🤝 ' + resp + rachaMsg + '\n\n¿Querés que revisemos si tenés algún descanso pendiente?';
  }
  if (intent === 'estado_animo') {
    var respuestas = [
      'Yo bien, gracias por preguntar. 😄 Procesando números y listo para ayudarte. ¿Vos cómo andás?',
      'Todo en orden por acá. Sin fatiga, sin burnout — ventajas de ser digital. 🤖 ¿En qué te puedo ayudar hoy?',
      'Funcionando al 100%, como siempre. La pregunta es ¿cómo estás vos? Si querés, te cuento cómo vas este mes.'
    ];
    return respuestas[Math.floor(Math.random() * respuestas.length)];
  }

  // ── Conversacionales exploratorias ──
  if (intent === 'curiosidad_app') {
    var curiosidades = [
      'La hora extra nocturna en festivo es la tarifa más cara del mercado laboral colombiano: +' +
        Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
        '% de recargo sobre el valor hora. Si trabajás 8 horas así, es como cobrar ' +
        (8 * rcFactor('extraFestNoct', c.ahora || new Date())).toFixed(0) +
        ' horas diurnas.',
      'Esta app no envía nada a ningún servidor externo durante los cálculos. Todo el motor de nómina corre en tu dispositivo, sin internet. Podés usarla en el metro sin señal.',
      'El auxilio de transporte no es proporcional si trabajás menos de 15 días. Si ingresaste a mitad de mes, solo aplica desde la fecha de ingreso.',
      'Podés exportar todo tu historial como PDF o Excel desde la pestaña Historial. Útil si alguna vez tenés que demostrar tus ingresos o negociar un crédito.',
      'El simulador de escenarios puede calcular cuánto ganarías si solo hicieras turnos nocturnos, o si agregaras 2 horas extra por día. Preguntame "simular" y lo arrancamos.',
      'Tenés un backup de todos tus datos disponible en Ajustes. Exportá el archivo antes de cambiar de celular para no perder nada.',
      'En Colombia hay exactamente 18 festivos fijos por año. Si trabajaras todos, serían 31.5 días extra de ingresos. El rey de los festivos puede ganar más que alguien con 30% más de salario base.'
    ];
    var cur = curiosidades[Math.floor(Math.random() * curiosidades.length)];
    return '💡 ' + cur + '\n\n¿Querés que profundice en algo de esto?';
  }
  if (intent === 'reflexion') {
    var calificacion = '';
    if (c.pctSalario >= 100) calificacion = '⭐ Excelente mes — superaste tu salario base.';
    else if (c.pctSalario >= 80)
      calificacion = '👍 Buen mes — vas al ' + c.pctSalario.toFixed(0) + '% de tu meta.';
    else if (c.pctSalario >= 50)
      calificacion =
        '📊 Mes en progreso — llegas al ' + c.pctSalario.toFixed(0) + '% de tu salario base.';
    else if (c.diasTrab === 0) calificacion = '📋 No tengo datos de este mes todavía.';
    else
      calificacion =
        '💡 Mes arrancando — ' +
        c.diasTrab +
        ' turno' +
        (c.diasTrab !== 1 ? 's' : '') +
        ' registrado' +
        (c.diasTrab !== 1 ? 's' : '') +
        ' hasta ahora.';
    return (
      calificacion +
      '\n\nEn números: **' +
      fCOP(c.totalCOP) +
      '** brutos en ' +
      (c.turnosMesN || c.diasTrab) +
      ' turnos, promedio **' +
      fCOP(c.promPorTurno || c.prom) +
      '** por turno.\n\n¿Querés compararlo con el mes pasado o ver qué podría mejorar?'
    );
  }
  if (intent === 'planificacion_semana') {
    var faltaDinero =
      c.falta > 0
        ? 'Te faltan **' + fCOP(c.falta) + '** para llegar a tu salario base.'
        : 'Ya alcanzaste tu salario base este mes.';
    return (
      '📅 Para planear bien la semana necesito saber qué buscás:\n\n• Si querés **maximizar ingresos** → los turnos nocturnos y en festivo pagan hasta ' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '% más.\n• Si querés **descansar más** → un día libre cada 6 trabajados es tu derecho legal.\n• Si querés **alcanzar tu meta** → ' +
      faltaDinero +
      '\n\n¿Cuántos turnos estás pensando hacer esta semana?'
    );
  }

  // ── Dinero ──
  if (intent === 'total_ganado') {
    // Con desglose solo si el usuario lo pidió explícitamente
    var _quiereDesglose = _aiHas(
      t,
      'desglose',
      'detalle',
      'distribucion',
      'recargo',
      'desglosame',
      'distribucion',
      'como se divide'
    );
    if (_quiereDesglose) {
      return (
        _aiPeriodoCap(c) +
        ' llevás **' +
        fCOP(c.totalCOP) +
        '** brutos, en ' +
        c.diasTrab +
        ' turnos.\n\n' +
        _bdLines(c.bd) +
        '\n\n' +
        '📊 Vas al ' +
        c.pctSalario.toFixed(1) +
        '% de tu ' +
        (c.esQuincena ? 'quincena' : 'salario base') +
        '.\n' +
        '🔮 Proyección al ' +
        (c.esQuincena ? 'corte' : 'cierre') +
        ': **' +
        fCOP(c.proy) +
        '**'
      );
    }
    return (
      _aiPeriodoCap(c) +
      ' llevás **' +
      fCOP(c.totalCOP) +
      '** brutos en ' +
      (c.turnosMesN || c.diasTrab) +
      ' turnos — ' +
      c.pctSalario.toFixed(1) +
      '% de tu meta' +
      (c.esQuincena ? ' quincenal' : '') +
      '.\n' +
      'Proyección al ' +
      (c.esQuincena ? 'corte' : 'cierre') +
      ': **' +
      fCOP(c.proy) +
      '**'
    );
  }
  if (intent === 'hoy') {
    if (c.turnosHoy === 0) return 'Hoy no registraste turnos todavía. ¿Arrancamos? 🚀';
    return (
      'Hoy llevás **' +
      fCOP(c.copHoy) +
      '** en ' +
      fDur(c.minsHoy) +
      ' repartidos en ' +
      c.turnosHoy +
      ' turno' +
      (c.turnosHoy !== 1 ? 's' : '') +
      '.\n\n' +
      (typeof aiFollowUp === 'function' ? aiFollowUp('hoy') : '')
    );
  }
  if (intent === 'ayer') {
    if (c.turnosAyer === 0) return 'Ayer no tuviste turnos registrados.';
    return (
      'Ayer hiciste **' +
      fCOP(c.copAyer) +
      '** en ' +
      fDur(c.minsAyer) +
      ' con ' +
      c.turnosAyer +
      ' turno' +
      (c.turnosAyer !== 1 ? 's' : '') +
      '.'
    );
  }
  if (intent === 'proyeccion') {
    return (
      '🔮 Proyección al ' +
      (c.esQuincena ? 'corte de la quincena' : 'cierre del mes') +
      ': **' +
      fCOP(c.proy) +
      '** — ' +
      c.pctSalario.toFixed(1) +
      '% de tu meta' +
      (c.esQuincena ? ' quincenal' : '') +
      '.\n' +
      '• ' +
      c.diasTrab +
      ' días trabajados, ' +
      c.diasRestantes +
      ' restantes.'
    );
  }
  if (intent === 'horas_trabajadas') {
    var _quiereDetHoras = _aiHas(
      t,
      'detalle',
      'desglose',
      'nocturna',
      'festiva',
      'extra',
      'distribucion'
    );
    if (_quiereDetHoras) {
      return (
        '⏱ Llevás **' +
        fDur(c.totalMins) +
        '** este mes:\n' +
        '• Nocturnas: ' +
        fDur(c.nocturnasMins) +
        '\n' +
        '• Festivas: ' +
        fDur(c.festMins) +
        '\n' +
        '• Extra: ' +
        fDur(c.extraMins)
      );
    }
    return (
      '⏱ Llevás **' +
      fDur(c.totalMins) +
      '** este mes en ' +
      c.diasTrab +
      ' turnos — promedio ' +
      c.promHoras.toFixed(1) +
      'h por turno.'
    );
  }
  if (intent === 'promedio') {
    return (
      '📊 Tu promedio es de **' +
      fCOP(c.prom) +
      '** por turno (' +
      c.promHoras.toFixed(1) +
      'h).\n\n' +
      '• Mejor día: ' +
      (c.mejor ? fCOP(c.mejor.cop) + ' el ' + _fechaLarga(c.mejor.fecha) : '—') +
      '\n' +
      '• COP por hora real: ' +
      fCOP(c.copPorHoraReal)
    );
  }

  // ── Comparativas ──
  if (intent === 'comparativa_mes') {
    if (c.totalCOPMesPasado === 0) return 'No tengo datos del mes pasado para comparar.';
    return (
      '📊 **Este mes vs mes pasado:**\n\n' +
      '• Este mes: ' +
      fCOP(c.totalCOP) +
      ' en ' +
      fDur(c.totalMins) +
      '\n' +
      '• Mes pasado: ' +
      fCOP(c.totalCOPMesPasado) +
      ' en ' +
      fDur(c.totalMinsMesPasado) +
      '\n' +
      '• Tendencia: ' +
      _trend(c.totalCOP, c.totalCOPMesPasado)
    );
  }
  if (intent === 'comparativa_semana') {
    return (
      '📊 **Esta semana vs pasada:**\n\n' +
      '• Esta semana: ' +
      fCOP(c.totalCOPSemana) +
      ' en ' +
      fDur(c.totalMinsSemana) +
      '\n' +
      '• Semana pasada: ' +
      fCOP(c.totalCOPSemPas) +
      ' en ' +
      fDur(c.totalMinsSemPas) +
      '\n' +
      '• Tendencia: ' +
      _trend(c.totalCOPSemana, c.totalCOPSemPas)
    );
  }

  // ── Patrones ──
  if (intent === 'mejor_dia') {
    if (!c.mejor) return 'Aún no tengo datos para identificar tu mejor día.';
    return (
      '🏆 Tu mejor día fue el **' +
      _fechaLarga(c.mejor.fecha) +
      '** con **' +
      fCOP(c.mejor.cop) +
      '**. ¡Qué jornada!'
    );
  }
  if (intent === 'peor_dia') {
    if (!c.peor) return 'Aún no tengo datos para identificar tu peor día.';
    return (
      'Tu día más bajo fue el **' +
      _fechaLarga(c.peor.fecha) +
      '** con ' +
      fCOP(c.peor.cop) +
      '. Todos tenemos días así.'
    );
  }
  if (intent === 'turno_largo') {
    if (!c.tLargo) return 'No tengo turnos cerrados todavía.';
    return (
      'Tu turno más largo duró **' +
      fDur(c.tLargo.dur) +
      '** el ' +
      _fechaLarga(c.tLargo.t.inicio) +
      '.'
    );
  }
  if (intent === 'turno_corto') {
    if (!c.tCorto) return 'No tengo turnos cerrados todavía.';
    return (
      'Tu turno más corto duró **' +
      fDur(c.tCorto.dur) +
      '** el ' +
      _fechaLarga(c.tCorto.t.inicio) +
      '.'
    );
  }
  if (intent === 'racha') {
    if (c.rachaActual <= 1)
      return (
        'No tenés racha activa. Tu última jornada fue ' +
        (c.rachaActual === 1 ? 'hoy.' : 'hace más de un día.')
      );
    var rachaMsg = '🔥 Llevás **' + c.rachaActual + ' días consecutivos** trabajando. ';
    rachaMsg +=
      c.rachaActual >= 7 ? '⚠️ ¿Consideraste tomarte un día de descanso?' : '¡Buen ritmo!';
    return rachaMsg;
  }
  if (intent === 'distribucion') {
    var lines = Object.keys(c.bd)
      .filter(function (k) {
        return c.bd[k].mins > 0;
      })
      .map(function (k) {
        return '• ' + RC[k].label + ': ' + fCOP(c.bd[k].cop) + ' (' + fDur(c.bd[k].mins) + ')';
      })
      .join('\n');

    // Generar datos para el gráfico visual
    var chartData = [];
    var colors = {
      ord: '#5b86e5',
      noc: '#3a5cb5',
      ext_d: '#ff9f43',
      ext_n: '#ff7675',
      fest_d: '#1dd1a1',
      fest_n: '#10ac84',
      ext_fd: '#feca57',
      ext_fn: '#ff6b6b'
    };

    var totalMins = c.totalMins || 1;
    for (var k in c.bd) {
      if (c.bd[k].mins > 0) {
        chartData.push({
          label: RC[k].label,
          val: fDur(c.bd[k].mins),
          pct: (c.bd[k].mins / totalMins) * 100,
          color: colors[k] || 'var(--accent)'
        });
      }
    }

    // Ordenar de mayor a menor
    chartData.sort(function (a, b) {
      return b.pct - a.pct;
    });

    return {
      text: '📊 **Distribución de tus horas:**\n\n' + lines,
      chart: {
        title: 'Distribución de Tiempo',
        data: chartData
      }
    };
  }
  if (intent === 'velocidad') {
    return (
      '⚡ Tu velocidad es de **' +
      fCOP(c.copPorHoraReal) +
      ' por hora** trabajada.\n\n' +
      '• Valor hora base: ' +
      fCOP(c.vh) +
      '\n' +
      '• Efectiva (con recargos): ' +
      fCOP(c.copPorHoraReal)
    );
  }

  // ── Simulación ──
  if (intent === 'simulacion') {
    var hrs = _aiNum(t);
    if (hrs === null) hrs = 4;
    // Validación de magnitud: sin tope, "simulá 100000 horas" proyectaba una
    // fantasía de miles de millones; un negativo se leía como positivo.
    if (_aiEsNegativo(q) || hrs <= 0)
      return 'Sigamos con la simulación 🔮. ¿Cuántas **horas** querés probar? Por ejemplo: "simulá 4 horas nocturnas".';
    if (hrs > 400)
      return (
        'Uf, ' +
        Math.round(hrs) +
        ' horas no caben ni en el mes 😅 (un mes tiene ~730h). Probá un número realista — hasta ~400 — y te lo calculo.'
      );
    // Detectar tipo específico para dar respuesta focalizada
    var _simTipo = _aiDetectarTipoHora(t);
    if (_simTipo) {
      var _simFactor = _aiFactor(_simTipo);
      var _simLabel = _aiLabelTipo(_simTipo);
      var _simExtra = hrs * c.vh * _simFactor;
      var _simTotal = ((c && c.totalCOP) || 0) + _simExtra;
      var _simSal = (c && c.salario) || 1;
      return (
        '🔮 **Simulación: +' +
        hrs +
        'h ' +
        _simLabel +
        '**\n\n' +
        '• Valor hora base: ' +
        fCOP(c.vh) +
        '\n' +
        '• Factor: ' +
        (_simFactor * 100).toFixed(0) +
        '% → ' +
        fCOP(c.vh * _simFactor) +
        '/h\n' +
        '• Extra estimado: ≈ ' +
        fCOP(_simExtra) +
        '\n' +
        '• Nuevo total: ≈ ' +
        fCOP(_simTotal) +
        ' (' +
        ((_simTotal / _simSal) * 100).toFixed(1) +
        '% del salario)\n\n' +
        '💡 Probá **/meta ' +
        Math.round(_simTotal / 100000) * 100000 +
        '** para ver si llegás.'
      );
    }
    // Sin tipo específico → mostrar comparativa de todos los escenarios
    return (
      '🔮 Si trabajás **' +
      hrs +
      'h adicionales**:\n\n' +
      '• Diurna ordinaria: +' +
      fCOP(hrs * c.vh * 1.0) +
      '\n' +
      '• Nocturna (35%): +' +
      fCOP(hrs * c.vh * 1.35) +
      '\n' +
      '• Extra diurna (25%): +' +
      fCOP(hrs * c.vh * 1.25) +
      '\n' +
      '• Festiva diurna (' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '%): +' +
      fCOP(hrs * c.vh * rcFactor('diurnaFest', c.ahora || new Date())) +
      '\n' +
      '• Festiva nocturna (' +
      Math.round((rcFactor('noctFest', c.ahora || new Date()) - 1) * 100) +
      '%): +' +
      fCOP(hrs * c.vh * rcFactor('noctFest', c.ahora || new Date())) +
      '\n\n' +
      '💡 Decime el tipo (ej. "4 horas nocturnas") para un cálculo exacto.'
    );
  }

  // ── Festivos ──
  if (intent === 'festivos') {
    if (!c.proxFests || !c.proxFests.length) return 'No hay más festivos este año.';
    var flist = c.proxFests
      .map(function (d) {
        return (
          '• ' + d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
        );
      })
      .join('\n');
    return (
      '📅 **Próximos festivos:**\n\n' +
      flist +
      '\n\n⚠️ Recordá: los festivos pagan con recargo del ' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '% (sube por fases hasta 100% en 2027).'
    );
  }

  // ── Bienestar ──
  if (intent === 'bienestar') {
    if (c.alertaTurnoLargo) {
      return (
        '⚠️ Llevas **' +
        Math.round(c.minutosEnTurnoActual / 60) +
        'h** en turno.' +
        (c.alertaNocturnaActivo ? ' De noche.' : '') +
        ' El límite legal son 10h. Considerá cerrar y descansar.'
      );
    }
    if (c.estadoBienestar === 'critico' || c.burnout) {
      return (
        '⚠️ Ritmo alto: ' +
        c.hrsSemanales.toFixed(0) +
        'h/sem y ' +
        c.rachaActual +
        ' días seguidos. Necesitás descanso — es tu derecho legal cada 6 días.'
      );
    }
    if (c.estadoBienestar === 'cansado') {
      return (
        '🟡 ' +
        c.rachaActual +
        ' días seguidos (' +
        c.hrsSemanales.toFixed(0) +
        'h/sem). Cerca del límite — planificá un descanso pronto.'
      );
    }
    return (
      '✅ Carga saludable: ' +
      c.hrsSemanales.toFixed(0) +
      'h/sem, ' +
      c.rachaActual +
      ' días de racha. Vas bien.'
    );
  }

  // ── Liquidación ──
  if (intent === 'liquidacion') {
    // Foco si preguntó por un componente puntual ("cuánto de prima/cesantías/
    // vacaciones"): lo destacamos arriba y abajo va la liquidación completa.
    var _liqFoco = /\bprima\b/.test(t)
      ? '💰 Tu **prima** proporcional va en **' +
        fCOP(c.estPrima) +
        '** (1 mes de salario al año: mitad en junio, mitad en diciembre).\n\nAcá el panorama completo:\n\n'
      : /cesantia/.test(t)
        ? '💰 Tus **cesantías** proporcionales van en **' +
          fCOP(c.estCesantias) +
          '** (1 mes de salario al año, se consignan antes del 15 de febrero).\n\nAcá el panorama completo:\n\n'
        : /vacacion/.test(t)
          ? '💰 Tus **vacaciones** proporcionales valen **' +
            fCOP(c.estVacaciones) +
            '** (15 días hábiles al año).\n\nAcá el panorama completo:\n\n'
          : '';
    return (
      _liqFoco +
      '💰 **Tu liquidación estimada (día ' +
      c.diaActual +
      '):**\n\n' +
      '**Neto a recibir: ' +
      fCOP(c.sueldoNeto) +
      '**\n' +
      '• Bruto: ' +
      fCOP(c.totalCOP) +
      '\n' +
      '• Salud + Pensión (8%): -' +
      fCOP(c.deducciones) +
      '\n' +
      '• Auxilio transporte: +' +
      fCOP(c.estTransporte) +
      '\n\n' +
      '📋 **Prestaciones acumuladas:**\n' +
      '• Prima: ' +
      fCOP(c.estPrima) +
      '\n' +
      '• Cesantías: ' +
      fCOP(c.estCesantias) +
      '\n' +
      '• Vacaciones: ' +
      fCOP(c.estVacaciones)
    );
  }

  // ── Ley / Conocimiento laboral ──
  if (intent === 'ley' || intent === 'laboral') {
    // Preguntas conceptuales/definitorias ("qué es", "qué significa", "cómo funciona el recargo")
    // van siempre a la base de conocimiento, incluso si tenemos el salario del usuario.
    // El cálculo personalizado solo aplica cuando el usuario quiere saber su valor específico.
    var _esDefinitoria = _aiHas(
      t,
      'que es',
      'que son',
      'que significa',
      'como funciona',
      'como se calcula',
      'en que consiste',
      'explica',
      'explique',
      'cuanto es el recargo',
      'cual es el recargo',
      'cuanto recargo'
    );
    if (_esDefinitoria) {
      var kRespDef = _aiKnowledgeLookup(q);
      if (kRespDef) return kRespDef;
    }

    // Pregunta de DERECHOS ("¿me pueden obligar a trabajar el domingo?"): no es
    // una consulta de tarifa. La ley permite programarte pero obliga a compensar
    // (recargo o descanso), así que respondemos el derecho, no el valor hora.
    if (
      _aiHas(
        t,
        'obligar',
        'obligad',
        'obligatorio',
        'me pueden',
        'pueden obligarme',
        'negarme',
        'rehus',
        'me toca'
      ) &&
      _aiHas(t, 'domingo', 'dominical', 'festiv', 'feriado')
    ) {
      var _pctDom = Math.round(getRecargoFestivo(c.ahora || new Date()) * 100);
      return (
        '⚖️ **¿Te pueden obligar a trabajar el domingo o festivo?**\n\n' +
        'Tu empleador puede programarte, pero **nunca gratis**: la ley (CST Art. 179-180) obliga a compensarlo.\n\n' +
        '• Si es **ocasional** (hasta 2 domingos al mes): elegís entre el **recargo del ' +
        _pctDom +
        '%** o un **día compensatorio** de descanso.\n' +
        '• Si es **habitual** (3+ domingos al mes): te corresponde el recargo del ' +
        _pctDom +
        '% **y** el descanso compensatorio.\n\n' +
        'Ningún acuerdo te puede quitar ese derecho. 💪'
      );
    }

    // Si el usuario pregunta por el valor de una hora específica y tenemos su salario
    if (c.vh > 0) {
      if (_aiHas(t, 'domingo', 'dominical', 'festiv')) {
        if (_aiHas(t, 'extra', 'extras')) {
          if (_aiHas(t, 'noche', 'nocturno', 'nocturna')) {
            return (
              '🌙⛪ **Hora extra festiva nocturna:**\n\nTu hora base es ' +
              fCOP(c.vh) +
              '.\nCon el recargo del ' +
              Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
              '% (' +
              rcFactor('extraFestNoct', c.ahora || new Date()).toFixed(2) +
              'x), te pagan **' +
              fCOP(c.vh * rcFactor('extraFestNoct', c.ahora || new Date())) +
              '** por cada hora.'
            );
          }
          return (
            '☀️⛪ **Hora extra festiva diurna:**\n\nTu hora base es ' +
            fCOP(c.vh) +
            '.\nCon el recargo del ' +
            Math.round((rcFactor('extraFestDiur', c.ahora || new Date()) - 1) * 100) +
            '% (' +
            rcFactor('extraFestDiur', c.ahora || new Date()).toFixed(2) +
            'x), te pagan **' +
            fCOP(c.vh * rcFactor('extraFestDiur', c.ahora || new Date())) +
            '** por cada hora.'
          );
        }
        if (_aiHas(t, 'noche', 'nocturno', 'nocturna')) {
          return (
            '🌙⛪ **Hora festiva nocturna:**\n\nTu hora base es ' +
            fCOP(c.vh) +
            '.\nCon el recargo del ' +
            Math.round((rcFactor('noctFest', c.ahora || new Date()) - 1) * 100) +
            '% (' +
            rcFactor('noctFest', c.ahora || new Date()).toFixed(2) +
            'x), te pagan **' +
            fCOP(c.vh * rcFactor('noctFest', c.ahora || new Date())) +
            '** por cada hora.'
          );
        }
        return (
          '☀️⛪ **Hora dominical/festiva diurna:**\n\nTu hora base es ' +
          fCOP(c.vh) +
          '.\nCon el recargo del ' +
          Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
          '% (' +
          rcFactor('diurnaFest', c.ahora || new Date()).toFixed(2) +
          'x), te pagan **' +
          fCOP(c.vh * rcFactor('diurnaFest', c.ahora || new Date())) +
          '** por cada hora.'
        );
      }

      if (_aiHas(t, 'noche', 'nocturno', 'nocturna')) {
        if (_aiHas(t, 'extra', 'extras')) {
          return (
            '🌙 **Hora extra nocturna:**\n\nTu hora base es ' +
            fCOP(c.vh) +
            '.\nCon el recargo del 75% (1.75x), te pagan **' +
            fCOP(c.vh * 1.75) +
            '** por cada hora.'
          );
        }
        return (
          '🌙 **Hora nocturna ordinaria:**\n\nTu hora base es ' +
          fCOP(c.vh) +
          '.\nCon el recargo del 35% (1.35x), te pagan **' +
          fCOP(c.vh * 1.35) +
          '** por cada hora.'
        );
      }

      if (_aiHas(t, 'extra', 'extras')) {
        return (
          '☀️ **Hora extra diurna:**\n\nTu hora base es ' +
          fCOP(c.vh) +
          '.\nCon el recargo del 25% (1.25x), te pagan **' +
          fCOP(c.vh * 1.25) +
          '** por cada hora.'
        );
      }

      // "cuánto vale/pagan mi hora" → valor ordinario. Pero NO cuando la
      // pregunta es por el marco legal ("cuántas horas son legales/permitidas"):
      // ahí 'hora' no pide la tarifa sino el límite de jornada → cae al KB.
      if (_aiHas(t, 'hora', 'vale', 'pagan') && !_aiHas(t, 'ley', 'normativa', 'legal', 'permit')) {
        return (
          'Tu **valor hora ordinario** (sin recargos) es de **' +
          fCOP(c.vh) +
          '**, calculado en base a tu salario de ' +
          fCOP(c.salario) +
          '.'
        );
      }
    }

    // PRIORIDAD: buscar en la base de conocimiento para respuestas específicas
    // Primero keyword matching (rápido), luego semántico como fallback (v259)
    var kResp = _aiKnowledgeLookup(q);
    if (kResp) return kResp;
    var hsemActual = typeof getHSEM === 'function' ? getHSEM(c.ahora) : 44;
    var _Dn = c.ahora || new Date();
    var _ndn = getInicioNocturno(_Dn) === 19 ? '7pm' : '9pm';
    var _pn = function (rk) {
      return Math.round((rcFactor(rk, _Dn) - 1) * 100);
    };
    return (
      '⚖️ **Normativa laboral colombiana (Ley 2466/2025):**\n\n' +
      '| Concepto | Recargo |\n' +
      '|---|---|\n' +
      '| 🌙 Nocturno (' +
      _ndn +
      '–6am) | +35% |\n' +
      '| ⛪ Dominical/festivo | +' +
      _pn('diurnaFest') +
      '% |\n' +
      '| ⏱ Extra diurna | +25% |\n' +
      '| 🌙 Extra nocturna | +75% |\n' +
      '| ⛪ Extra festiva diurna | +' +
      _pn('extraFestDiur') +
      '% |\n' +
      '| 🌙 Extra festiva nocturna | +' +
      _pn('extraFestNoct') +
      '% |\n\n' +
      '• Jornada máxima: **' +
      hsemActual +
      'h/semana** (Ley 2101/2021)\n' +
      '• Máximo 2h extra/día y 12h/semana\n' +
      '• Descanso obligatorio tras 6 días de trabajo'
    );
  }

  // ── Ahorro ──
  if (intent === 'ahorro') {
    var meta = _aiNum(t);
    // Entrada inválida (negativa o $0): nos quedamos en el plan de ahorro y
    // pedimos monto + plazo, en vez de cortar con un error.
    if (_aiEsNegativo(q) || meta === 0)
      return 'Sigamos con tu plan de ahorro 🐷. Necesito un monto **positivo en pesos**: ¿cuánto querés juntar y en cuánto tiempo? Por ejemplo: "ahorrar 5 millones en 12 meses".';
    if (!meta || meta < 1000) meta = c.salario;
    var faltaMeta = Math.max(0, meta - c.totalCOP);
    if (faltaMeta === 0)
      return '🎉 ¡Ya alcanzaste la meta de ' + fCOP(meta) + '! Vas en ' + fCOP(c.totalCOP) + '.';
    var turnosNec = c.prom > 0 ? Math.ceil(faltaMeta / c.prom) : '—';
    return (
      '🎯 Para llegar a **' +
      fCOP(meta) +
      '** te faltan **' +
      fCOP(faltaMeta) +
      '**.\n\n' +
      '• A tu ritmo: ~' +
      turnosNec +
      ' turnos más\n' +
      '• En horas base: ' +
      (faltaMeta / (c.vh || 1)).toFixed(1) +
      'h'
    );
  }

  // ── Optimizador de Horarios ──
  if (intent === 'optimizador') {
    var metaExtra = _aiNum(t);
    if (!metaExtra || metaExtra < 1000) {
      return 'Para recomendarte turnos, necesito saber cuánto dinero extra quieres ganar. Por ejemplo: "Quiero ganar 150 lucas extra".';
    }
    if (typeof aiAdvisorOptimizador === 'function') {
      return aiAdvisorOptimizador(c, metaExtra);
    }
  }

  // ── Planificador de Vacaciones (State Machine) ──
  if (intent === 'planear_vacaciones') {
    var conv = typeof aiGetConversation === 'function' ? aiGetConversation() : null;
    if (conv && conv.stateMachine) {
      conv.stateMachine.active = true;
      conv.stateMachine.flow = 'vacaciones';
      conv.stateMachine.step = 1;
      return '🌴 ¡Qué bueno! Planear vacaciones es importante. ¿Cuántos días hábiles te quieres tomar?';
    }
    return '🌴 Para planear tus vacaciones, ve a la pestaña de Ajustes.';
  }

  // ── Stats ──
  if (intent === 'stats') {
    return (
      '⚡ ' +
      c.diasTrab +
      ' turnos · ' +
      fCOP(c.totalCOP) +
      ' · ' +
      c.pctSalario.toFixed(1) +
      '% meta · Proy: ' +
      fCOP(c.proy)
    );
  }

  // ── Valor hora ── (también atendido en la cascada clásica; acá para que
  // el dispatch por NLP no caiga a un handler genérico que lo intercepte)
  if (intent === 'valor_hora') {
    if (!c.vh) {
      return 'Configurá tu salario base en Ajustes para calcular tu valor hora.';
    }
    return (
      '⏱️ **Tu valor hora:** ' +
      fCOP(c.vh) +
      '\n• Fórmula: ' +
      fCOP(c.salario) +
      ' (salario) / 240 horas\n• Nocturna: ' +
      fCOP(c.vh * 1.35) +
      ' (+35%)\n• Dominical/festiva diurna: ' +
      fCOP(c.vh * rcFactor('diurnaFest', c.ahora || new Date())) +
      ' (+' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '%)\n• Extra nocturna: ' +
      fCOP(c.vh * 1.75) +
      ' (+75%)'
    );
  }

  // ── Configurar salario: acción SOLO si hay monto ──
  // La acción real (SET_SALARY) se crea en ai-enhanced solo con entities.money.
  // Sin monto NO es una acción: una pregunta ("qué incluye el sueldo base")
  // se explica; un comando sin monto ("cambiar salario") pide el dato. Antes
  // ambos caían al placeholder "Procesando acción..." y lo filtraban al chat.
  if (intent === 'configurar_salario') {
    if (_aiNum(t)) return 'Procesando acción...';
    if (
      _aiHas(
        t,
        'cambiar',
        'cambia',
        'configurar',
        'configura',
        'poner',
        'pon',
        'ajustar',
        'ajusta',
        'actualizar',
        'establecer',
        'modificar',
        'editar',
        'quiero cambiar'
      )
    ) {
      return 'Para actualizar tu salario base, decime el valor: por ejemplo *"mi salario es 2.000.000"*. También podés cambiarlo en **Ajustes › Salario base**.';
    }
    return (
      '💼 **Sueldo base**\n\n' +
      'Es tu salario mensual ordinario bruto — sin recargos, horas extra ni auxilios. Es la base de todos los cálculos:\n\n' +
      '• **Valor hora** = sueldo base ÷ 240\n' +
      '• Sobre él se aplican los recargos (nocturno +35%, dominical/festivo +' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '%, extras…)\n' +
      '• El auxilio de transporte y las prestaciones se suman aparte\n\n' +
      '💡 Para cambiarlo: **Ajustes › Salario base**.'
    );
  }

  // ── Otras acciones del Agente ──
  if (
    intent === 'iniciar_turno' ||
    intent === 'cerrar_turno' ||
    intent === 'navegar_ajustes' ||
    intent === 'navegar_historial'
  ) {
    // String temporal; aiEnhancedRespond lo reemplaza con el texto + la acción real.
    return 'Procesando acción...';
  }

  // ── Email ──
  if (intent === 'email') {
    // Usar el mismo builder que el sistema clásico para acción real
    if (typeof _aiBuildEmail === 'function') {
      var emailAction = _aiBuildEmail(q, t, c, state);
      if (emailAction && emailAction.preview) {
        return {
          text:
            emailAction.preview +
            '\n\n💡 **¿Sabías que...?** También podés **compartir por WhatsApp** desde la pestaña Análisis (es más rápido, solo un mensaje de texto), o **exportar PDF** desde Historial si necesitás un archivo.',
          action: emailAction.data ? { type: 'email_compose', data: emailAction.data } : undefined
        };
      }
    }
    return '📧 Claro, puedo ayudarte a enviar tu reporte por correo.\n\n💡 **Alternativas:**\n• **WhatsApp:** más rápido, sin archivo — decí "compartir por WhatsApp"\n• **PDF/Excel:** archivo descargable — decí "exportar PDF" o "exportar Excel"\n• **Email:** documento adjunto — decime "enviá mi reporte a [correo]"';
  }
  if (intent === 'correo_formal') {
    return (
      '📝 **Redacté este borrador para tu jefe:**\n\n' +
      '"Estimado/a,\n\nAdjunto el reporte de mis turnos del mes con el detalle de horas trabajadas, recargos aplicados y proyección al cierre. El total acumulado hasta hoy es de ' +
      fCOP(c.totalCOP) +
      '.\n\nQuedo atento/a a cualquier comentario.\nSaludos cordiales."\n\n¿Lo ajusto o así está bien?'
    );
  }

  // ── Ayuda ──
  if (intent === 'ayuda_app') {
    return (
      '📖 **¿Cómo usar Mi Turno?**\n\n' +
      '1. **Inicio:** tocá "Iniciar turno" al llegar y "Finalizar" al irte\n' +
      '2. **Análisis:** mirá tus KPIs, gráfico y proyección\n' +
      '3. **Asistente:** preguntame lo que quieras (¡estamos acá!)\n' +
      '4. **Historial:** revisá todos tus turnos pasados\n' +
      '5. **Ajustes:** configurá tu salario, PIN, modo quincena\n\n' +
      '💡 La app funciona sin internet. Tus datos se sincronizan cuando vuelve la conexión.\n\n' +
      '📚 ¿Necesitás ayuda con algo específico? Decime "cómo exportar", "cómo respaldar", "cómo cambiar mi foto"...'
    );
  }

  // ── Ayuda de navegación (ai-help.js) ──
  if (intent === 'ayuda_navegacion') {
    // Diagnóstico rápido de conexión: "estoy conectado", "hay conexion"
    if (
      _aiHas(
        t,
        'conectado',
        'conexion',
        'supabase',
        'nube',
        'online',
        'offline',
        'sincronizando',
        'sync',
        'hay internet',
        'funciona internet'
      )
    ) {
      return _aiConexionEstado(state);
    }

    var helpResp = _aiHelpLookup(q);
    if (helpResp) return helpResp;
    return '🤔 Contame qué querés hacer y te guío paso a paso. Por ejemplo:\n\n• "¿Cómo exporto mis turnos?"\n• "¿Cómo cambio mi foto?"\n• "¿Cómo configuro el PIN?"\n• "¿Cómo respaldo mis datos?"';
  }

  // ── WhatsApp Share ──
  if (intent === 'whatsapp_share') {
    return '📱 **Compartir por WhatsApp**\n\nPodés compartir tus números desde la pestaña **Análisis** (📊). Bajá hasta el final y tocá el botón verde **💬 WhatsApp**. Se abre directo con un mensaje pre-formateado.\n\nTambién podés usar **📤 Compartir** para enviarlo por Telegram, correo u otras apps.\n\n💡 **¿Sabías que...?** Esto es un mensaje de texto, no un archivo. Si necesitás un PDF o Excel descargable, decime **"exportar PDF"** o andá a **Historial > Exportar**.';
  }

  // Intent no mapeado → advertir en consola y delegar al sistema clásico
  if (intent) {
    try {
      console.warn(
        '[NLP] Intent sin handler en _aiDispatchNLP:',
        intent,
        '— delegando a sistema clásico'
      );
    } catch (_) {}
  }
  return null;
}

// ─── MOTOR PRINCIPAL ───────────────────────────────────────────

// ─── SUGERENCIAS PARA DESAMBIGUACIÓN ──────────────────────────
// Mapea un intent a un chip tocable. Solo intents con respuesta clara;
// si no está acá, la desambiguación cae al fallback genérico.
function _aiIntentSuggestion(intent) {
  var map = {
    total_ganado: { label: '💰 Cuánto llevo este mes', query: '¿cuánto llevo este mes?' },
    hoy: { label: '📅 Lo de hoy', query: '¿cuánto gané hoy?' },
    ayer: { label: '📅 Lo de ayer', query: '¿cuánto gané ayer?' },
    proyeccion: { label: '📈 Proyección al cierre', query: 'proyección' },
    horas_trabajadas: { label: '⏱ Horas trabajadas', query: '¿cuántas horas llevo?' },
    promedio: { label: '📊 Mi promedio', query: '¿cuál es mi promedio por turno?' },
    comparativa_mes: { label: '📊 Comparar con mes pasado', query: 'compara con el mes pasado' },
    comparativa_semana: {
      label: '📊 Comparar semanas',
      query: 'compara esta semana con la pasada'
    },
    mejor_dia: { label: '🏆 Mi mejor día', query: '¿cuál fue mi mejor día?' },
    racha: { label: '🔥 Mi racha', query: 'mi racha' },
    eficiencia: { label: '⚡ Mi valor por hora', query: '¿cuál es mi valor por hora real?' },
    stats: { label: '📋 Resumen del mes', query: 'resumen' },
    distribucion: { label: '🧾 Desglose de recargos', query: 'desglose de recargos' },
    liquidacion: { label: '🧮 Mi liquidación', query: 'calcula mi liquidación' },
    simulacion: { label: '🎯 Simular turnos', query: 'simular' },
    ahorro: { label: '🐷 Metas de ahorro', query: 'ahorro' },
    bienestar: { label: '😴 Mi descanso', query: '¿cuándo descanso?' },
    ley: { label: '⚖️ Recargos y derechos', query: '¿cuánto vale la hora nocturna?' },
    festivos: { label: '🎉 Próximos festivos', query: 'próximos festivos' },
    logros: { label: '🏅 Mis logros', query: '/logros' },
    email: { label: '✉️ Enviar mi reporte', query: 'envía mi reporte por correo' },
    auditoria: { label: '🔍 Revisar mis turnos', query: 'revisa mis turnos' }
  };
  return map[intent] || null;
}

// Última clasificación NLP del turno en curso. La usa el wrapper de
// aiAnswer para registrar el tema aunque responda la cascada clásica.
var _aiLastNlp = null;

// ════════════════════════════════════════════════════════════════
//  DETECCIÓN DE INTENTS FINANCIEROS/LABORALES (alta señal)
//  Calculadoras del asesor que el clasificador NLP no conoce.
//  Devuelve string con la respuesta o null si ninguna aplica.
//  q = query crudo en minúsculas · t = texto normalizado · c = contexto
//
//  Memoria de turno: si la respuesta anterior fue una de estas
//  calculadoras y el usuario contesta con un dato suelto (años, una
//  cifra), se re-ejecuta la misma calculadora con ese parámetro.
//  Sin esto, "llevo 4 años" tras una pregunta de despido caía al
//  fallback genérico (la IA pedía el dato y luego no lo entendía).
// ════════════════════════════════════════════════════════════════

// Contador de turnos y último intent financiero respondido. Permiten
// detectar un follow-up SOLO si llega en el turno inmediatamente
// siguiente (evita arrastrar contexto viejo).
var _aiTurnCounter = 0;
var _aiLastFin = null; // { intent: string, turn: number }
var _aiFinOffer = null; // { options: [intent...], turn } — próximos pasos ofrecidos

// ── Trazabilidad (v339, opt-in): por qué la IA respondió lo que respondió ──
// Solo se computa cuando window.MT_AI_DEBUG === true. Es ADITIVO: jamás altera
// la respuesta. v1 captura lo disponible en el límite de aiAnswer (clasificación,
// camino async/agente, duración). NO instrumenta cada guard de la cascada (eso
// tocaría el núcleo); el orquestador futuro poblará la ruta exacta. Ver
// AI_ROUTE_MAP.md §6 y §10.
var _aiLastTrace = null;
function aiLastTrace() {
  return _aiLastTrace;
}
if (typeof window !== 'undefined') window.aiLastTrace = aiLastTrace;

// ── INTERCONEXIÓN: qué próximos pasos ofrece cada cálculo ──────────
// Cuando una calculadora termina, deja "ofertas" encadenables. Si el
// usuario responde "sí/dale", nombra una ("la cuota") o pide "ambos",
// se enruta al módulo correcto. Antes esos ganchos no iban a ningún
// lado: el texto invitaba pero un "dale" caía al fallback.
var _AI_FIN_OFFERS = {
  presupuesto: ['emergencia', 'endeudamiento'],
  emergencia: ['presupuesto', 'endeudamiento'],
  endeudamiento: ['presupuesto', 'emergencia'],
  indemnizacion: ['liquidacion'],
  comparar_oferta: ['presupuesto']
};

// Palabras con que el usuario puede nombrar cada opción ofrecida.
var _AI_FIN_KW = {
  emergencia: ['emergencia', 'colchon', 'fondo'],
  endeudamiento: ['cuota', 'credito', 'deuda', 'endeuda', 'prestamo'],
  presupuesto: ['presupuesto', 'reparto', 'reparti', 'distribu'],
  liquidacion: ['liquidacion', 'prestacion', 'cesantia', 'prima']
};

// Routea un intent financiero a su calculadora (param opcional).
function _aiFinDispatch(intent, c, num) {
  num = num || 0;
  if (intent === 'presupuesto' && typeof aiAdvisorPresupuesto === 'function')
    return aiAdvisorPresupuesto(c, num > 100000 ? num : 0);
  if (intent === 'emergencia' && typeof aiAdvisorEmergencia === 'function')
    return aiAdvisorEmergencia(c);
  if (intent === 'endeudamiento' && typeof aiAdvisorEndeudamiento === 'function')
    return aiAdvisorEndeudamiento(c, num > 1000 ? num : 0);
  if (intent === 'indemnizacion' && typeof aiAdvisorIndemnizacion === 'function')
    return aiAdvisorIndemnizacion(c, num > 0 && num <= 50 ? num : 1);
  if (intent === 'liquidacion' && typeof aiAdvisorLiquidacion === 'function')
    return aiAdvisorLiquidacion(c);
  if (intent === 'comparar_oferta' && typeof aiAdvisorCompararOfertas === 'function')
    return num > 100000 ? aiAdvisorCompararOfertas(c, num, 0) : null;
  return null;
}

function _aiFinOfferActive() {
  return !!(
    _aiFinOffer &&
    _aiTurnCounter === _aiFinOffer.turn + 1 &&
    _aiFinOffer.options &&
    _aiFinOffer.options.length
  );
}

// Selección EXPLÍCITA de una opción ("la cuota", "el segundo"). null si no.
function _aiFinOfferPick(t) {
  if (!_aiFinOfferActive()) return null;
  var opts = _aiFinOffer.options;
  if (opts.length > 1 && /segund/.test(t)) return opts[1];
  if (/primer/.test(t)) return opts[0];
  for (var i = 0; i < opts.length; i++) {
    var ks = _AI_FIN_KW[opts[i]] || [];
    for (var j = 0; j < ks.length; j++) {
      if (t.indexOf(ks[j]) >= 0) return opts[i];
    }
  }
  return null;
}

// Afirmación corta y EXACTA (evita que "simular..." matchee por "si").
function _aiIsAffirmative(t) {
  if (!t || t.length > 18) return false;
  var aff = [
    'si',
    'sí',
    'dale',
    'bueno',
    'ok',
    'oka',
    'okey',
    'okay',
    'vale',
    'de una',
    'hagale',
    'hágale',
    'listo',
    'de once',
    'sip',
    'sisas',
    'va',
    'vamos',
    'claro',
    'obvio',
    'porfa',
    'porfi',
    'quiero',
    'si porfa',
    'si dale',
    'dale si',
    'calcula',
    'calculemos',
    'calculalo',
    'muestrame',
    'mostrame',
    'muestra',
    'el primero',
    'la primera',
    'el primer'
  ];
  for (var i = 0; i < aff.length; i++) {
    if (t === aff[i]) return true;
  }
  return false;
}

// Afirmación a una oferta → primera opción; "ambos/los dos" → todas.
function _aiFinOfferAffirm(t, c) {
  if (!_aiFinOfferActive()) return null;
  var opts = _aiFinOffer.options;
  if (/^(ambos|los dos|las dos|todo|todas)\b/.test(t)) {
    var parts = [];
    for (var k = 0; k < opts.length; k++) {
      var tx = _aiFinDispatch(opts[k], c, 0);
      if (tx) parts.push(tx);
    }
    if (parts.length) return { intent: opts[0], text: parts.join('\n\n──────────\n\n') };
  }
  if (_aiIsAffirmative(t)) {
    var txt = _aiFinDispatch(opts[0], c, 0);
    if (txt) return { intent: opts[0], text: txt };
  }
  return null;
}

function _aiFinFollowUp(t, c) {
  if (!_aiLastFin || _aiTurnCounter !== _aiLastFin.turn + 1) return null;
  var n = _aiNum(t);
  if (n === null || n === undefined) return null;

  if (_aiLastFin.intent === 'indemnizacion') {
    // Respuesta a "¿cuántos años llevás?": número plausible de años.
    var pareceAnios =
      n > 0 &&
      n <= 50 &&
      (_aiHas(t, 'ano', 'anos', 'llevo', 'tengo', 'cumplo', 'anti') || /^\D*\d+\D*$/.test(t));
    if (pareceAnios && typeof aiAdvisorIndemnizacion === 'function') {
      return { intent: 'indemnizacion', text: aiAdvisorIndemnizacion(c, n) };
    }
  } else if (_aiLastFin.intent === 'endeudamiento') {
    if (n > 1000 && typeof aiAdvisorEndeudamiento === 'function') {
      return { intent: 'endeudamiento', text: aiAdvisorEndeudamiento(c, n) };
    }
  } else if (_aiLastFin.intent === 'comparar_oferta') {
    if (n > 100000 && typeof aiAdvisorCompararOfertas === 'function') {
      return { intent: 'comparar_oferta', text: aiAdvisorCompararOfertas(c, n, 0) };
    }
  } else if (_aiLastFin.intent === 'presupuesto') {
    // "¿y si gano 2 millones?": recalcular el reparto con ese ingreso.
    if (n > 100000 && typeof aiAdvisorPresupuesto === 'function') {
      return { intent: 'presupuesto', text: aiAdvisorPresupuesto(c, n) };
    }
  }
  return null;
}

function _aiFinancieroIntent(q, t, c) {
  if (!c) return null;

  var _intent = null;
  var _resp = null;

  // ── Indemnización por despido sin justa causa ──
  if (
    q.indexOf('/indemnizacion') === 0 ||
    q.indexOf('/indemnizar') === 0 ||
    _aiHas(
      t,
      'indemnizacion',
      'despido',
      'me despiden',
      'me echan',
      'me echaron',
      'si me sacan',
      'sin justa causa'
    )
  ) {
    if (typeof aiAdvisorIndemnizacion === 'function') {
      var _antNum = _aiNum(t);
      var _anios = _antNum && _antNum > 0 && _antNum <= 50 ? _antNum : 1;
      _intent = 'indemnizacion';
      _resp = aiAdvisorIndemnizacion(c, _anios);
    }
  }

  // ── Fondo de emergencia (colchón) ──
  if (
    !_resp &&
    (q === '/emergencia' ||
      q === '/fondo' ||
      _aiHas(
        t,
        'fondo de emergencia',
        'fondo emergencia',
        'colchon',
        'colchón',
        'plata para imprevistos',
        'red de seguridad'
      ))
  ) {
    if (typeof aiAdvisorEmergencia === 'function') {
      _intent = 'emergencia';
      _resp = aiAdvisorEmergencia(c);
    }
  }

  // ── Capacidad de endeudamiento / cuota ──
  if (
    !_resp &&
    (q.indexOf('/cuota') === 0 ||
      q.indexOf('/endeudamiento') === 0 ||
      _aiHas(
        t,
        'cuanto puedo pagar',
        'capacidad de pago',
        'capacidad de endeudamiento',
        'puedo endeudarme',
        'sacar un credito',
        'pedir un prestamo',
        'cuota mensual',
        'cuanto de cuota'
      ))
  ) {
    if (typeof aiAdvisorEndeudamiento === 'function') {
      var _cuotaNum = _aiNum(t);
      var _cuota = _cuotaNum && _cuotaNum > 1000 ? _cuotaNum : 0;
      _intent = 'endeudamiento';
      _resp = aiAdvisorEndeudamiento(c, _cuota);
    }
  }

  // ── Comparar oferta laboral ──
  // Requiere "oferta/empleo nuevo" para no chocar con "comparar mes".
  if (
    !_resp &&
    (q.indexOf('/comparar') === 0 ||
      _aiHas(
        t,
        'oferta',
        'me ofrecen',
        'me ofrecieron',
        'nuevo trabajo',
        'otro empleo',
        'cambiar de trabajo',
        'me proponen'
      ))
  ) {
    var _ofNum = _aiNum(t);
    if (typeof aiAdvisorCompararOfertas === 'function' && _ofNum && _ofNum > 100000) {
      _intent = 'comparar_oferta';
      _resp = aiAdvisorCompararOfertas(c, _ofNum, 0);
    } else if (q.indexOf('/comparar') === 0) {
      _intent = 'comparar_oferta';
      _resp =
        'Para comparar una oferta, decime el salario que te ofrecen. Por ejemplo: "tengo una oferta de 2 millones" o "/comparar 2500000".';
    }
  }

  // ── Presupuesto / reparto del sueldo (regla 50/30/20) ──
  if (
    !_resp &&
    (q === '/presupuesto' ||
      q === '/reparto' ||
      _aiHas(
        t,
        'presupuesto',
        'como reparto',
        'como divido',
        'como distribuyo',
        'como administro',
        'en que deberia gastar',
        'reparto mi sueldo',
        'reparto mi plata',
        'organizar mi plata',
        'regla 50',
        '50 30 20'
      ))
  ) {
    if (typeof aiAdvisorPresupuesto === 'function') {
      var _presNum = _aiNum(t);
      var _presIng = _presNum && _presNum > 100000 ? _presNum : 0;
      _intent = 'presupuesto';
      _resp = aiAdvisorPresupuesto(c, _presIng);
    }
  }

  // ── Plan de ahorro (meta + plazo) ──
  // Distinto de "cuánto me falta para la meta": esto arma un plan para
  // juntar X en N meses. Va ANTES del follow-up numérico para que
  // "/ahorro 5000000" no se lea como ingreso de un presupuesto previo.
  if (
    !_resp &&
    (q.indexOf('/ahorro') === 0 ||
      _aiHas(
        t,
        'plan de ahorro',
        'plan de ahorros',
        'plan para ahorrar',
        'quiero ahorrar',
        'necesito ahorrar',
        'ayudame a ahorrar',
        'como ahorro',
        'como ahorrar',
        'como puedo ahorrar',
        'metas de ahorro',
        'planificar ahorro'
      ))
  ) {
    if (typeof aiAdvisorAhorro === 'function') {
      var _ahNum = _aiNum(t);
      if (!_ahNum && q.indexOf('/ahorro') === 0 && q.split(' ').length > 1)
        _ahNum = parseFloat(q.split(' ')[1].replace(/[^0-9]/g, ''));
      _intent = 'ahorro';
      if (!_ahNum || _ahNum < 1000) {
        _resp =
          '🐷 Con gusto armamos tu plan de ahorro. ¿Cuánto querés juntar y en cuánto tiempo? Por ejemplo: "quiero ahorrar 5 millones en 12 meses".';
      } else {
        var _ahPlazo = 12;
        var _ahMes = t.match(/en (\d+) mes/);
        var _ahAno = t.match(/en (\d+) ano/);
        if (_ahMes) _ahPlazo = parseInt(_ahMes[1], 10);
        else if (_ahAno) _ahPlazo = parseInt(_ahAno[1], 10) * 12;
        _resp = aiAdvisorAhorro(c, _ahNum, _ahPlazo);
      }
    }
  }

  // ── Análisis fiscal (renta, retención, deducciones) ──
  if (
    !_resp &&
    (q === '/fiscal' ||
      _aiHas(
        t,
        'declarar renta',
        'declaracion de renta',
        'declaracion renta',
        'impuesto',
        'impuestos',
        'retencion en la fuente',
        'retencion fuente',
        'analisis fiscal',
        'tema fiscal',
        'optimizacion fiscal',
        'cuanto me descuentan',
        'que me descuentan',
        'deduccion de impuestos'
      ))
  ) {
    if (typeof aiAdvisorFiscal === 'function') {
      _intent = 'fiscal';
      _resp =
        aiAdvisorFiscal(c) ||
        '📊 Para tu análisis fiscal necesito tu salario base. Configuralo en **Ajustes > Preferencias de pago**.';
    }
  }

  // ── Optimizador para una meta extra ("ganar 200 mil extra") ──
  // Requiere verbo de ganancia + marca de "extra" + cifra: NO pisa al
  // optimizador predictivo ("qué turno me conviene", sin cifra).
  if (
    !_resp &&
    (q.indexOf('/optimizador') === 0 ||
      (_aiHas(t, 'ganar', 'gano', 'sacar', 'generar') &&
        _aiHas(t, 'extra', 'adicional', 'aparte', 'de mas', 'mas plata')))
  ) {
    if (typeof aiAdvisorOptimizador === 'function') {
      var _opNum = _aiNum(t);
      if (!_opNum && q.indexOf('/optimizador') === 0 && q.split(' ').length > 1)
        _opNum = parseFloat(q.split(' ')[1].replace(/[^0-9]/g, ''));
      if (_opNum && _opNum >= 1000) {
        _intent = 'optimizador';
        _resp = aiAdvisorOptimizador(c, _opNum);
      } else if (q.indexOf('/optimizador') === 0) {
        _intent = 'optimizador';
        _resp =
          '💡 Usá **/optimizador 200000** para ver qué turnos te conviene tomar para ganar esa plata extra.';
      }
    }
  }

  // ── Informe financiero completo (NO es enviar un correo) ──
  if (
    !_resp &&
    (q === '/informe' ||
      (typeof _aiIsEmailIntent === 'function' &&
        !_aiIsEmailIntent(t) &&
        _aiHas(
          t,
          'informe financiero',
          'informe completo',
          'informe detallado',
          'reporte financiero',
          'reporte completo',
          'dame un informe',
          'quiero un informe',
          'generar informe',
          'informe de mis finanzas'
        )))
  ) {
    if (typeof aiAdvisorInforme === 'function') {
      _intent = 'stats';
      _resp = aiAdvisorInforme(c);
    }
  }

  // Un intent fresco (con sus propias keywords) gana siempre. Solo si
  // NINGUNO matcheó probamos las respuestas encadenadas.

  // 1) Selección explícita de una opción ofrecida ("la cuota", "el segundo").
  if (!_resp) {
    var _pick = _aiFinOfferPick(t);
    if (_pick) {
      _intent = _pick;
      _resp = _aiFinDispatch(_pick, c, _aiNum(t) || 0);
    }
  }

  // 2) Follow-up numérico sobre el MISMO cálculo previo (años, cuota, ingreso).
  //    Así "tengo una oferta de 3 millones" tras una pregunta de cuota se
  //    lee como oferta nueva, no como cuota de 3M.
  if (!_resp) {
    var _fu = _aiFinFollowUp(t, c);
    if (_fu) {
      _intent = _fu.intent;
      _resp = _fu.text;
    }
  }

  // 3) Afirmación simple a la oferta ("dale", "ambos") → primera/todas.
  if (!_resp) {
    var _aff = _aiFinOfferAffirm(t, c);
    if (_aff) {
      _intent = _aff.intent;
      _resp = _aff.text;
    }
  }

  if (_resp) {
    _aiLastFin = { intent: _intent, turn: _aiTurnCounter };
    // Dejar ofertas encadenables para el próximo turno (interconexión).
    _aiFinOffer = _AI_FIN_OFFERS[_intent]
      ? { options: _AI_FIN_OFFERS[_intent], turn: _aiTurnCounter }
      : null;
    return _resp;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  EDICIÓN DE TURNOS POR CHAT · agregar / borrar / corregir
//  Devuelve { text, execute: { type, payload } } o null. El asistente
//  (assistant.js) pide confirmación hablada antes de ejecutar, porque
//  toca datos reales. NUNCA modifica nada acá — solo arma la propuesta.
// ════════════════════════════════════════════════════════════════

// Resuelve la fecha de una frase de edición: hoy/ayer/antier, día de
// semana "pasado", o fecha puntual ("14 de junio"). Devuelve Date (a
// medianoche) o null.
function _aiShiftDate(t) {
  var ahora = new Date();
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (/\bhoy\b/.test(t)) return hoy;
  if (/\bantier\b|\banteayer\b/.test(t)) {
    var ant = new Date(hoy);
    ant.setDate(hoy.getDate() - 2);
    return ant;
  }
  if (/\bayer\b|\banoche\b/.test(t)) {
    var ay = new Date(hoy);
    ay.setDate(hoy.getDate() - 1);
    return ay;
  }
  // Día de semana ("el lunes [pasado]") → ocurrencia más reciente
  var dias = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
  };
  for (var d in dias) {
    if (Object.prototype.hasOwnProperty.call(dias, d) && new RegExp('\\b' + d + '\\b').test(t)) {
      var ref = new Date(hoy);
      do {
        ref.setDate(ref.getDate() - 1);
      } while (ref.getDay() !== dias[d]);
      return ref;
    }
  }
  // Fecha puntual ("14 de junio", "14/06", "el 14")
  if (typeof aiParseSpecificDate === 'function') {
    var sd = aiParseSpecificDate(t, ahora);
    if (sd) return sd;
  }
  return null;
}

// Parsea un rango horario: "de 8 a 4", "de 8am a 4pm", "de 22 a 6",
// "de 8:30 a 16:00". Devuelve { h1, m1, h2, m2, overnight } o null.
// Heurística: sin am/pm y fin<inicio con ambos <=12 → la salida es de
// tarde (8 a 4 = 08:00–16:00, el turno diurno típico). Si aun así
// fin<=inicio, se asume que cruza la medianoche (turno nocturno).
function _aiShiftTimeRange(t) {
  var re =
    /(?:de(?:sde)?\s+)?(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?\s*(?:a|hasta|al?)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/;
  var m = t.match(re);
  if (!m) return null;
  var h1 = parseInt(m[1], 10);
  var m1 = m[2] ? parseInt(m[2], 10) : 0;
  var ap1 = m[3] ? m[3].charAt(0) : '';
  var h2 = parseInt(m[4], 10);
  var m2 = m[5] ? parseInt(m[5], 10) : 0;
  var ap2 = m[6] ? m[6].charAt(0) : '';
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;

  function aplicaAP(h, ap) {
    if (ap === 'p' && h < 12) return h + 12;
    if (ap === 'a' && h === 12) return 0;
    return h;
  }
  h1 = aplicaAP(h1, ap1);
  h2 = aplicaAP(h2, ap2);

  // Sin am/pm explícito y fin antes que inicio con ambos en rango 1–12:
  // interpretamos la salida como PM (8 a 4 → 8:00–16:00).
  if (!ap1 && !ap2 && h2 <= 12 && h1 <= 12 && h2 < h1) h2 += 12;

  var overnight = false;
  if (h2 * 60 + m2 <= h1 * 60 + m1) overnight = true; // cruza medianoche

  return { h1: h1, m1: m1, h2: h2, m2: m2, overnight: overnight };
}

function _aiFmtHora(h, m) {
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function _aiShiftDateInputValue(date) {
  if (!date || isNaN(date.getTime())) return '';
  var mm = date.getMonth() + 1;
  var dd = date.getDate();
  return date.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
}

// Hora única etiquetada como entrada o salida, para correcciones parciales.
// "salí a las 6" → { kind:'fin', h:6, m:0, hadAP:false }
// "entré a las 7:30" → { kind:'inicio', h:7, m:30, hadAP:false }
// Devuelve null si no se puede determinar qué extremo cambia, o no hay hora.
// Exige marcador de hora ("las"/colon/am-pm) para NO confundir el número del
// día ("del 14, salí a las 6" → toma "6", nunca "14").
function _aiShiftHourLabeled(t) {
  var esFin = /\b(termin|sali|salid|finaliz|acab|cerr|hasta)\w*/.test(t);
  var esInicio = /\b(empez|empec|entr|inici|comenz|comienz|arranq|desde)\w*/.test(t);
  if (esFin === esInicio) return null; // ninguno o ambos → ambiguo

  var m =
    t.match(/(?:a\s+)?las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?/) ||
    t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|a\.?m\.?|p\.?m\.?)?/) ||
    t.match(/\b(\d{1,2})()\s*(am|pm|a\.?m\.?|p\.?m\.?)\b/);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var mm = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || mm > 59) return null;
  var ap = m[3] ? m[3].charAt(0) : '';
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return { kind: esFin ? 'fin' : 'inicio', h: h, m: mm, hadAP: !!ap };
}

// Edición de turno en curso (cuando pedimos la hora y esperamos la respuesta).
var _aiPendingShiftEdit = null;

function _aiShiftEditIntent(q, t, c, state) {
  // Verbos de edición. Sin un verbo claro + "turno", no reclamamos nada.
  // Evitamos "mete"/"carg" (ambiguos: "si metés un turno más" es hipotético,
  // no un comando) — exigimos verbos de registro inequívocos.
  var esAgregar = /\b(registr|anot|agreg|añad|anad|apunt)\w*/.test(t);
  var esBorrar = /\b(borr|elimin|quit|saca|remov)\w*/.test(t);
  var esEditar = /\b(correg|corrig|cambi|modific|ajust|actualiz|edit|arregl)\w*/.test(t);
  var mencionaTurno = /\bturno|jornada|trabaj\w*\b/.test(t);

  // ── RESUME de edición pendiente ──
  // Si recién pedimos la hora ("Decime qué cambia…") y el usuario responde solo
  // con un horario ("fue de 8 a 5", "salí a las 6"), retomamos esa edición. Sin
  // esto el mensaje no tenía verbo ni "turno" → caía al fallback.
  var _resumeFecha = null;
  if (_aiPendingShiftEdit && _aiPendingShiftEdit.fecha) {
    var _pendAge = Date.now() - (_aiPendingShiftEdit.ts || 0);
    var _soloHora = !esAgregar && !esBorrar && !esEditar;
    var _tieneHora = !!(_aiShiftTimeRange(t) || _aiShiftHourLabeled(t));
    if (_pendAge < 5 * 60 * 1000 && _soloHora && _tieneHora) {
      _resumeFecha = _aiPendingShiftEdit.fecha;
      esEditar = true;
      mencionaTurno = true;
      _aiPendingShiftEdit = null; // consumido
    } else if (_pendAge >= 5 * 60 * 1000) {
      _aiPendingShiftEdit = null; // expiró
    }
  }

  if (!mencionaTurno) return null;
  if (!esAgregar && !esBorrar && !esEditar) return null;
  // Hipotéticos no son comandos de alta ("si trabajara un turno de 8 a 4").
  if (/\b(si\s+trabaj|trabajara|ganaria|simul|cuanto\s+gano|cuanto\s+ganaria)\b/.test(t)) {
    return null;
  }

  var turnosAll = (state && (state.turnosAll || state.turnos)) || [];
  var fecha = _resumeFecha || _aiShiftDate(t);

  // ── BORRAR ──
  if (esBorrar) {
    if (!fecha) {
      return {
        text:
          'Decime de qué día querés borrar el turno (por ejemplo "borrá el turno del 14 de junio" ' +
          'o "borrá el turno de ayer") y lo busco.'
      };
    }
    var fKey = fecha.toDateString();
    var encontrados = [];
    for (var i = 0; i < turnosAll.length; i++) {
      var tn = turnosAll[i];
      if (!tn || !tn.fin) continue;
      var di = new Date(tn.inicio);
      if (!isNaN(di.getTime()) && di.toDateString() === fKey) encontrados.push(tn);
    }
    var fechaLbl = fecha.getDate() + ' de ' + AI_QUERY_DICT.monthLabels[fecha.getMonth()];
    if (encontrados.length === 0) {
      return {
        text:
          'No encontré ningún turno el ' + fechaLbl + '. Revisá la fecha o miralo en **Historial**.'
      };
    }
    if (encontrados.length > 1) {
      return {
        text:
          'Ese día (' +
          fechaLbl +
          ') tenés ' +
          encontrados.length +
          ' turnos registrados. Para no borrar el equivocado, mejor eliminalo desde **Historial**, ' +
          'donde los ves uno por uno con su horario.'
      };
    }
    var victima = encontrados[0];
    var vi = new Date(victima.inicio);
    var vf = new Date(victima.fin);
    var delPrompt =
      'Voy a borrar el turno del ' +
      fechaLbl +
      ' (' +
      _aiFmtHora(vi.getHours(), vi.getMinutes()) +
      '–' +
      _aiFmtHora(vf.getHours(), vf.getMinutes()) +
      '). ¿Confirmás?';
    return {
      text: delPrompt,
      execute: {
        type: 'DELETE_SHIFT',
        confirmText: delPrompt,
        payload: { id: victima.id, label: fechaLbl }
      }
    };
  }

  // ── CORREGIR / EDITAR ──
  if (esEditar) {
    var eRango = _aiShiftTimeRange(t);
    var eSingle = eRango ? null : _aiShiftHourLabeled(t);
    var payload = { date: fecha ? _aiShiftDateInputValue(fecha) : '' };
    if (eRango) {
      payload.range = {
        inicioTime: _aiFmtHora(eRango.h1, eRango.m1),
        finTime: _aiFmtHora(eRango.h2, eRango.m2),
        overnight: eRango.overnight
      };
    } else if (eSingle) {
      payload.single = {
        kind: eSingle.kind,
        h: eSingle.h,
        m: eSingle.m,
        hadAP: eSingle.hadAP
      };
    }

    return {
      text: 'Te abro el editor de turno. Ingresá la fecha, verifico el turno guardado y después actualizo el horario en tu historial y en Supabase.',
      execute: {
        type: 'OPEN_SHIFT_EDIT_FORM',
        payload: payload
      }
    };
  }

  // ── AGREGAR ──
  var horas = _aiShiftTimeRange(t);
  if (!fecha || !horas) {
    return {
      text:
        'Para registrar un turno necesito el día y el horario. Probá algo como ' +
        '"registrá un turno ayer de 8 a 4" o "anotá el turno del 14 de junio de 22 a 6".'
    };
  }
  var inicio = new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
    horas.h1,
    horas.m1,
    0
  );
  var fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), horas.h2, horas.m2, 0);
  if (horas.overnight) fin.setDate(fin.getDate() + 1);
  var durMin = Math.round((fin - inicio) / 60000);
  if (durMin <= 0 || durMin > 24 * 60) {
    return {
      text: 'Ese horario no me cuadra (la salida tiene que ser después de la entrada). ¿Lo repetís?'
    };
  }
  var fechaLbl2 = fecha.getDate() + ' de ' + AI_QUERY_DICT.monthLabels[fecha.getMonth()];
  var nuevoId = typeof generateUUID === 'function' ? generateUUID() : inicio.toISOString();
  var addPrompt =
    'Voy a registrar un turno el ' +
    fechaLbl2 +
    ' de ' +
    _aiFmtHora(horas.h1, horas.m1) +
    ' a ' +
    _aiFmtHora(horas.h2, horas.m2) +
    (horas.overnight ? ' (del día siguiente)' : '') +
    ' — ' +
    (typeof fDur === 'function' ? fDur(durMin) : durMin + ' min') +
    '. ¿Confirmás?';
  return {
    text: addPrompt,
    execute: {
      type: 'ADD_SHIFT',
      confirmText: addPrompt,
      payload: {
        turno: { id: nuevoId, inicio: inicio.toISOString(), fin: fin.toISOString() },
        label: fechaLbl2
      }
    }
  };
}

// Si la pregunta menciona una quincena, devuelve un contexto "scopeado"
// con los totales (debido + desglose) solo de esa quincena, usando los
// rangos oficiales de quincena.js (respeta los días q1/q2 configurados).
// Devuelve { c, label } o null si no aplica.
function _aiScopeQuincena(c, state, t) {
  if (!/quincena|quincenal/.test(t)) return null;
  if (typeof getQuincenaRange !== 'function' || typeof doCalc !== 'function') return null;

  var turnos = (state && (state.turnosAll || state.turnos)) || [];
  var ahora = new Date();
  var prefs = {};
  try {
    var uid = state && state.session && state.session.uid;
    if (uid && typeof leer === 'function' && typeof dk === 'function') {
      prefs = leer(dk(uid, 'prefs'), {}) || {};
    }
  } catch (_) {}

  var rango, label;
  if (/primera quincena|1ra quincena|1a quincena|quincena 1|primera|1ra/.test(t)) {
    rango = getQuincenasMes(ahora, prefs).q1;
    label = 'la primera quincena';
  } else if (/segunda quincena|2da quincena|2a quincena|quincena 2|segunda|2da/.test(t)) {
    rango = getQuincenasMes(ahora, prefs).q2;
    label = 'la segunda quincena';
  } else {
    rango = getQuincenaRange(ahora, prefs);
    label = 'esta quincena';
  }

  var enRango = typeof filterTurnosRango === 'function' ? filterTurnosRango(turnos, rango) : [];
  var calc = doCalc(enRango, null, ahora, c.vh || 0);
  var cQ = {};
  for (var k in c) {
    if (Object.prototype.hasOwnProperty.call(c, k)) cQ[k] = c[k];
  }
  cQ.totalCOP = calc.totalCOP;
  cQ.bd = calc.bd;
  cQ.diasTrab = enRango.length;
  return { c: cQ, label: label };
}

// Total de una quincena ("cuánto va de quincena", "cuánto llevo en la quincena").
// Enruta a la capa de DATOS (migración D1, v341): el NLP la malinterpretaba como
// celebración y respondía sin cifras. No reclama "quincena pasada/anterior" (eso
// lo resuelve la referencia contextual) ni configuración de modo quincena, ni
// simulación/auditoría (ya filtradas antes en la cascada).
function _aiQuincenaTotalIntent(q, t, c, state) {
  if (!/quincena/.test(t)) return null;
  if (/pasada|anterior|antepasada/.test(t)) return null;
  if (/modo quincena|configurar|ajuste|cambiar de quincena|cambio de quincena/.test(t)) return null;
  if (/simul|ganaria|si trabajo|si trabajara/.test(t)) return null;
  var dataWord =
    /(cuanto|cuanta|cuantos|cuantas|llevo|llevamos|va de|voy|gane|ganado|ganancia|saque|hice|plata|dinero|acumul)/.test(
      t
    );
  if (!dataWord) return null;
  var scoped = _aiScopeQuincena(c, state, t);
  if (!scoped) return null;
  var cQ = scoped.c;
  var total = Math.round(cQ.totalCOP || 0);
  var dias = cQ.diasTrab || 0;
  if (typeof aiUpdateConversation === 'function') aiUpdateConversation('total_ganado', 'dinero');
  if (dias === 0) {
    return (
      'En ' +
      scoped.label +
      ' todavía no registrás servicios. Apenas cierres uno, te llevo la cuenta. 💪'
    );
  }
  return (
    'En ' +
    scoped.label +
    ' llevás **' +
    fCOP(total) +
    '** en ' +
    dias +
    (dias === 1 ? ' servicio' : ' servicios') +
    '.'
  );
}

// ════════════════════════════════════════════════════════════════
//  MODO QUINCENA POR DEFECTO (v365)
//  Si el usuario COBRA por quincena (pref quincenaMode), su modelo mental
//  del "período de pago en curso" es la quincena, no el mes. En los intents
//  donde eso importa —cuánto llevo, proyección, KPIs, ¿me pagan bien?— el
//  asistente razona sobre la QUINCENA vigente por defecto, sin que tenga que
//  escribir "quincena". Lo legal/mensual/anual (ley, festivos del mes,
//  liquidación, comparativa_mes) se queda en el mes: ahí la quincena no aplica.
// ════════════════════════════════════════════════════════════════

// Intents "período de pago en curso" que siguen el modo quincena. La necesidad
// se decide en el call site; este set documenta el criterio.
var _AI_QUINCENA_AUTO_INTENTS = { total_ganado: 1, proyeccion: 1, stats: 1 };

function _aiQuincenaModoActivo(c) {
  return !!(c && c.prefs && c.prefs.quincenaMode);
}

// "Este mes" / "esta quincena" según el contexto (reencuadrado o no).
function _aiPeriodoCap(c) {
  return c && c.esQuincena ? 'Esta quincena' : 'Este mes';
}

// Reencuadra el contexto a la quincena vigente cuando el modo está activo y la
// pregunta no fuerza otro período. Devuelve un `c` nuevo con totales, proyección
// y meta de la QUINCENA, o null si no aplica. El gate por intent va en el caller.
function _aiScopeQuincenaAuto(c, state, t) {
  if (!_aiQuincenaModoActivo(c)) return null;
  // Si el usuario dice "quincena", lo maneja el path explícito; si dice "mes",
  // respetamos el override y no reencuadramos.
  if (/quincena|quincenal/.test(t)) return null;
  if (/\bmes\b|mensual|del mes|al mes|este mes/.test(t)) return null;
  if (
    typeof getQuincenaRange !== 'function' ||
    typeof doCalc !== 'function' ||
    typeof filterTurnosRango !== 'function'
  ) {
    return null;
  }

  var turnos = (state && (state.turnosAll || state.turnos)) || [];
  var ahora = c.ahora || new Date();
  var prefs = c.prefs || {};
  var rango = getQuincenaRange(ahora, prefs);
  var enRango = filterTurnosRango(turnos, rango);
  var calc = doCalc(enRango, null, ahora, c.vh || 0);

  var msDia = 86400000;
  var totalDias = Math.max(1, Math.round((rango.fin.getTime() - rango.ini.getTime()) / msDia));
  var diaEnQ = Math.max(
    1,
    Math.min(totalDias, Math.ceil((ahora.getTime() - rango.ini.getTime()) / msDia))
  );
  var diasRestantes = Math.max(0, totalDias - diaEnQ);

  var totalCOP = calc.totalCOP || 0;
  // Proyección al CORTE de la quincena: ritmo por día trabajado × días totales.
  var proy = diaEnQ > 0 ? Math.round((totalCOP / diaEnQ) * totalDias) : totalCOP;
  // Meta de la quincena = medio salario (el pago quincenal esperado).
  var metaQ = (c.salario || 0) / 2;
  var pctSalario = metaQ > 0 ? (totalCOP / metaQ) * 100 : 0;

  var cQ = {};
  for (var k in c) {
    if (Object.prototype.hasOwnProperty.call(c, k)) cQ[k] = c[k];
  }
  cQ.totalCOP = totalCOP;
  cQ.bd = calc.bd;
  cQ.diasTrab = enRango.length;
  cQ.turnosMesN = enRango.length;
  cQ.proy = proy;
  cQ.pctSalario = pctSalario;
  cQ.diasRestantes = diasRestantes;
  cQ.esQuincena = true;
  cQ.periodoCorto = typeof formatRangoCorto === 'function' ? formatRangoCorto(rango) : '';
  return cQ;
}

// Estado del turno en curso ("¿tengo un turno activo?", "¿hay un servicio abierto?").
// Pregunta de ESTADO, no comando: el trigger exige turno/servicio + activo/abierto,
// así no secuestra "iniciá/cerrá un turno" (acciones con su propio handler).
function _aiTurnoActivoIntent(q, t, c) {
  var asksStatus =
    /\b(tengo|hay|tenes|queda|sigo|estoy)\b/.test(t) &&
    /\b(turno|servicio|jornada|guardia)\b/.test(t) &&
    /\b(activo|abierto|en curso|corriendo|andando|sin cerrar|prendido|encendido)\b/.test(t);
  if (!asksStatus) return null;
  if (c.tieneActivo && c.activo && c.activo.inicio) {
    var ini = new Date(c.activo.inicio);
    var mins = Math.round((Date.now() - ini.getTime()) / 60000);
    var dur = typeof fDur === 'function' ? fDur(mins > 0 ? mins : 0) : mins + 'm';
    if (typeof aiUpdateConversation === 'function') aiUpdateConversation('stats', 'tiempo');
    return {
      text: 'Sí 🟢, tenés un servicio activo. Llevás **' + dur + '** en curso. ¿Lo cerramos?',
      actions: [{ label: '⏹ Cerrar turno', query: 'cerrá el turno' }]
    };
  }
  if (typeof aiUpdateConversation === 'function') aiUpdateConversation('stats', 'tiempo');
  return 'No, ahora mismo no tenés ningún servicio activo. Cuando arranques uno, te lo llevo. ✋';
}

// ¿La pregunta es de tendencia/evolución? Señales distintivas (no el "voy" suelto,
// que es ambiguo con "en cuánto voy"). La usa el guard pre-NLP y el slash.
function _aiTendenciaIntent(q, t) {
  return (
    /\b(tendencia|evolucion|historico)\b/.test(t) ||
    /subiendo o bajando|bajando o subiendo|voy subiendo|voy bajando|mejor o peor que|como voy vs|voy vs antes/.test(
      t
    )
  );
}

// Calcula la tendencia de los últimos 3 meses (texto). Extraído del handler del
// slash /tendencia para reusarlo desde el guard pre-NLP (migración v341).
function _aiTendenciaResponder(c, state) {
  try {
    var tvh = c.vh || 0;
    var _ahora = c && c.ahora ? c.ahora : new Date();
    var ahoraMes = _ahora.getMonth();
    var ahoraAno = _ahora.getFullYear();
    var mesesNombres = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic'
    ];
    var mesesData = [];
    var allTurnos = state.turnosAll || state.turnos || [];
    for (var mi = 0; mi < 3; mi++) {
      var mIdx = ahoraMes - mi;
      var aIdx = ahoraAno;
      if (mIdx < 0) {
        mIdx += 12;
        aIdx--;
      }
      var iniM = new Date(aIdx, mIdx, 1);
      var finM = new Date(aIdx, mIdx + 1, 0);
      var turnosM = [];
      for (var tj = 0; tj < allTurnos.length; tj++) {
        var tt = allTurnos[tj];
        if (!tt || !tt.inicio || !tt.fin) continue;
        var d = new Date(tt.inicio);
        if (d >= iniM && d <= finM) turnosM.push(tt);
        if (turnosM.length > 500) break;
      }
      if (turnosM.length === 0 && mi > 0) continue;
      var calcM, diasM;
      if (mi === 0) {
        calcM = { totalMins: c.totalMins || 0, totalCOP: c.totalCOP || 0 };
        diasM = c.diasTrab || 0;
      } else {
        calcM = doCalc(turnosM, null, finM, tvh);
        var diasArr = calcPorDia(turnosM, tvh);
        diasM = diasArr && diasArr.length ? diasArr.length : 0;
      }
      mesesData.push({
        label: mesesNombres[mIdx],
        cop: Math.round(calcM.totalCOP || 0),
        mins: Math.round(calcM.totalMins || 0),
        dias: diasM
      });
    }
    if (mesesData.length < 2) {
      return '📊 Necesito al menos 2 meses de datos para mostrar una tendencia. ¡Seguí trabajando! 💪';
    }
    var respTen = '📈 **Tendencia**\n\n';
    for (var ti = 0; ti < mesesData.length; ti++) {
      var flecha =
        ti === 0
          ? '📍 '
          : mesesData[ti].cop > (mesesData[ti - 1] || mesesData[ti]).cop
            ? '📈 '
            : '📉 ';
      respTen +=
        flecha +
        mesesData[ti].label +
        ': ' +
        fCOP(mesesData[ti].cop) +
        ' · ' +
        fDur(mesesData[ti].mins) +
        ' · ' +
        mesesData[ti].dias +
        ' días\n';
    }
    if (mesesData.length >= 2) {
      var dif = mesesData[0].cop - mesesData[1].cop;
      var pctCambio = mesesData[1].cop > 0 ? (dif / mesesData[1].cop) * 100 : 0;
      respTen +=
        '\n' +
        (dif >= 0 ? '📈 ' : '📉 ') +
        'vs mes pasado: ' +
        (dif >= 0 ? '+' : '') +
        fCOP(Math.abs(dif)) +
        ' (' +
        (pctCambio >= 0 ? '+' : '') +
        pctCambio.toFixed(1) +
        '%)';
    }
    return respTen;
  } catch (err) {
    console.error('[MT] tendencia error:', err);
    return '⚠️ No se pudo calcular la tendencia en este momento. Intentá de nuevo más tarde.';
  }
}

// ¿La pregunta es un problema/consulta de conexión o sincronización?
function _aiDiagnosticoConexionIntent(q, t) {
  if (
    /no sincroniz|no se sincroniz|no sube|no carga la nube|no conecta|sin conexion|estado de conexion|hay conexion|estoy conectado|conexion a la nube/.test(
      t
    )
  )
    return true;
  return /sincroniz/.test(t) && /(no|por que|porque|falla|problema|anda|funciona)/.test(t);
}

// Estado de conexión y sincronización (internet, Supabase, cola pendiente).
// Extraído del handler de ayuda_navegacion para reusarlo desde el guard pre-NLP.
function _aiConexionEstado(state) {
  var _onlineStatus = typeof navigator !== 'undefined' && navigator.onLine;
  var _cloudOK = typeof CLOUD_MODE !== 'undefined' && CLOUD_MODE;
  var _rtStatus = typeof getRealtimeStatus === 'function' ? getRealtimeStatus() : null;
  var _syncPending = 0;
  try {
    var _sq = leer('mt_sync_queue', {});
    var _uid = state && state.session && state.session.uid;
    if (_uid && _sq[_uid]) _syncPending = _sq[_uid].length;
  } catch (_) {}
  var _resp = '📡 **Estado de conexión**\n\n';
  _resp += _onlineStatus ? '✅ **Internet:** Conectado\n' : '❌ **Internet:** Sin conexión\n';
  _resp += _cloudOK
    ? '☁️ **Supabase:** Conectado' + (_rtStatus ? ' (' + _rtStatus + ')' : '') + '\n'
    : '⚠️ **Supabase:** No conectado\n';
  if (_syncPending > 0)
    _resp +=
      '🔄 **Pendiente:** ' +
      _syncPending +
      ' cambio' +
      (_syncPending !== 1 ? 's' : '') +
      ' por sincronizar\n';
  _resp +=
    '\n💡 La app funciona 100% sin internet. Tus datos se guardan localmente y se sincronizan cuando vuelve la conexión.';
  return _resp;
}

// Punto ÚNICO de búsqueda en la base de conocimiento (D2). Antes este patrón
// (aiBestSearch con fallback a aiKnowledgeSearch) estaba duplicado en 3 lugares
// de la cascada. Prefiere el semántico+keyword (aiBestSearch) y cae al keyword
// puro si no está. Devuelve el texto de la respuesta o null.
function _aiKnowledgeLookup(q) {
  if (typeof aiBestSearch === 'function') return aiBestSearch(q) || null;
  if (typeof aiKnowledgeSearch === 'function') return aiKnowledgeSearch(q) || null;
  return null;
}

// Punto ÚNICO de búsqueda de ayuda/guías (D3). aiHelpAnswer devuelve un fallback
// genérico ("No encontré una guía...") cuando no hay guía real; ese texto NO debe
// bloquear rutas mejores (ej. el atajo "cómo" pisaba a email). Devuelve la guía
// REAL o null para que el llamador caiga a una ruta más útil.
function _aiHelpLookup(q) {
  if (typeof aiHelpAnswer !== 'function') return null;
  var r = aiHelpAnswer(q);
  if (!r) return null;
  if (r.indexOf('No encontré una guía') >= 0) return null;
  return r;
}

// ════════════════════════════════════════════════════════════════
//  VERIFICADOR DE PAGO JUSTO · "¿me pagan bien?"
//  Detecta la intención de auditar el pago y delega en aiAuditarPago,
//  que compara lo pagado contra lo que la ley manda por los turnos.
//  Soporta período mes (default) o quincena ("esta/primera/segunda").
// ════════════════════════════════════════════════════════════════
function _aiAuditIntent(q, t, c, state) {
  var trig =
    /(pagan mal|pagaron mal|pagan poco|pagan menos|pagaron de menos|pago incomplet|pago incorrect|sueldo incomplet|me estan pagando mal|me estan robando|me roban|pago justo|me pagan lo justo|verificar.*pago|revisar.*pago|auditar.*pago|me deben|pagan bien|pagando bien|me pagan lo correcto|pago correcto|me pagan completo)/.test(
      t
    );
  var monto = _aiNum(t);
  var pagoConMonto =
    /(me pagaron|me dieron|me deposit|recibi|me consignaron|me cancelaron)/.test(t) &&
    monto &&
    monto >= 10000;
  if (!trig && !pagoConMonto) return null;

  // No secuestrar preguntas de conocimiento sobre tarifas/recargos
  // ("¿cuánto vale la hora nocturna?", "¿qué es el recargo dominical?"),
  // salvo que haya un monto pagado real o lenguaje claro de subpago.
  if (
    /\b(la hora|una hora|por hora|valor hora|cuanto vale|cuanto se paga|que es|como se calcula|recargo)\b/.test(
      t
    ) &&
    !pagoConMonto &&
    !/(mal|poco|menos|roban|incomplet|de menos)/.test(t)
  ) {
    return null;
  }

  if (typeof aiAuditarPago !== 'function') return null;
  // Escopear a una quincena si la pregunta lo pide; si el usuario cobra por
  // quincena (modo activo), auditar la quincena vigente por defecto (v365);
  // si no, el mes completo.
  var scoped = _aiScopeQuincena(c, state, t);
  if (!scoped) {
    var _cq = _aiScopeQuincenaAuto(c, state, t);
    if (_cq) scoped = { c: _cq, label: 'esta quincena' };
  }
  var cUse = scoped ? scoped.c : c;
  var perLabel = scoped ? scoped.label : 'este mes';
  var res = aiAuditarPago(cUse, monto && monto >= 10000 ? monto : 0, perLabel);
  if (!res || !res.text) return null;

  if (typeof aiUpdateConversation === 'function') {
    aiUpdateConversation('auditoria_pago', 'dinero');
  }

  var out = { text: res.text };
  if (res.card) out.card = res.card;
  // Subpago o pantalla explicativa → ofrecer armar el reclamo
  if (res.text.indexOf('de menos') >= 0 || res.text.indexOf('Verificador') >= 0) {
    out.actions = [
      {
        label: '✉️ Armar reclamo',
        query: 'redactá un correo formal de reclamo por pago incompleto de mis recargos'
      }
    ];
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
//  OPTIMIZADOR DE INGRESOS · "¿qué turno me conviene tomar?"
//  Recomendación predictiva: qué turno rinde más y cuál es la próxima
//  oportunidad concreta (festivo). Delega en aiOptimizarProximo.
// ════════════════════════════════════════════════════════════════
function _aiOptimizarIntent(q, t, c) {
  // Hipotéticos y consultas de monto no son pedidos de optimización.
  if (/(si trabajo|si hago|si trabajara|cuanto gano si)/.test(t)) return null;

  var trig =
    /(que turno me conviene|que turno tomar|que turno (agarro|agarrar|coger|cojo)|cuando me conviene trabajar|que dia me conviene|como gano mas|como ganar mas|ganar mas plata|que me rinde mas|que rinde mas|maximizar|optimizar.*(ingreso|turno|horario)|sacarle mas|me conviene trabajar|que me deja mas|donde gano mas)/.test(
      t
    );
  if (!trig) return null;
  if (typeof aiOptimizarProximo !== 'function') return null;

  if (typeof aiUpdateConversation === 'function') {
    aiUpdateConversation('optimizador', 'dinero');
  }
  var txt = aiOptimizarProximo(c);
  if (!txt) return null;
  return {
    text: txt,
    actions: [{ label: '🎉 Próximos festivos', query: 'próximos festivos' }]
  };
}

// ════════════════════════════════════════════════════════════════
//  EXPLICABILIDAD · "¿cómo lo calculaste?" / "de dónde sale ese número"
//  Transparencia = confianza. Devuelve la traza grounded de _aiExplicarCalculo.
//  Detecta el pedido de EXPLICAR el propio total (2ª persona: "calculaste",
//  "sacaste", "llegaste") sin secuestrar preguntas de concepto de la KB
//  ("¿cómo se calcula la hora nocturna?").
// ════════════════════════════════════════════════════════════════
function _aiExplainIntent(q, t, c) {
  var trig =
    /(como lo calculaste|como calculaste|como (lo )?sacaste|de donde (sale|salen|sacaste)|como llegaste|paso a paso|explica(me|s)? (la cuenta|el calculo|como|de donde|el total)|muestrame la cuenta|desglosa el total|como sale ese|por que me da ese|de donde sale ese)/.test(
      t
    );
  // Elípticos cortos de seguimiento: "¿por qué?", "y eso por qué?", "cómo así?",
  // "y de dónde sale?" — piden explicar el último cálculo. Anclados a ^...$ para
  // no atrapar "por qué me pagan poco" (legal) ni frases largas.
  if (!trig) {
    var _qe = (q || '').trim();
    trig =
      /^[¿¡\s]*(y\s+)?(eso\s+)?por\s*qu[eé]\s*\??[¿¡!.\s]*$/.test(_qe) ||
      /^[¿¡\s]*(y\s+)?(de\s+d[oó]nde\s+(sale|salen|sali[oó]))\s*\??[¿¡!.\s]*$/.test(_qe) ||
      /^[¿¡\s]*c[oó]mo\s+as[ií]\s*\??[¿¡!.\s]*$/.test(_qe);
  }
  if (!trig) return null;
  // No interceptar preguntas de concepto general (tarifas/definiciones).
  if (/\b(que es|una hora|la tarifa|el recargo nocturno|el recargo dominical)\b/.test(t)) {
    return null;
  }
  if (typeof aiUpdateConversation === 'function') {
    aiUpdateConversation('explicabilidad', 'dinero');
  }
  var res = _aiExplicarCalculo(c);
  if (!res) return null;
  // _aiExplicarCalculo devuelve string (sin datos) u objeto {text, card}.
  var out = typeof res === 'object' ? { text: res.text, card: res.card } : { text: res };
  out.actions = [{ label: '⚖️ ¿Me pagan bien?', query: 'me están pagando bien' }];
  return out;
}

// ════════════════════════════════════════════════════════════════
//  DESPRENDIBLE DE NÓMINA · comprobante de pago descargable (PDF)
//  Arma los datos con buildDesprendibleData y los entrega como acción
//  GENERATE_PAYSLIP para que el asistente renderice el PDF.
// ════════════════════════════════════════════════════════════════
function _aiDesprendibleIntent(q, t, c, state) {
  var trig =
    /(desprendible|colilla|comprobante de (pago|nomina|nómina)|comprobante de ingresos|constancia de ingresos|recibo de (pago|nomina|nómina)|volante de pago|soporte de ingresos)/.test(
      t
    );
  if (!trig) return null;
  if (typeof buildDesprendibleData !== 'function') return null;

  var nombre = '';
  try {
    if (typeof _aiNombrePersonal === 'function') {
      nombre = _aiNombrePersonal({ session: (state && state.session) || {} }) || '';
    }
  } catch (_) {}

  var data = buildDesprendibleData(c, nombre);
  if (!data || data.bruto <= 0) {
    return {
      text:
        'Para armar tu desprendible necesito turnos registrados este mes y tu salario base. ' +
        'Registrá tus turnos (o decime "registrá un turno...") y te lo genero al toque.'
    };
  }

  if (typeof aiUpdateConversation === 'function') {
    aiUpdateConversation('liquidacion', 'dinero');
  }
  return {
    text:
      '📄 Te armé tu desprendible de **' +
      data.periodo +
      '** con el desglose de recargos y el neto. Ya se está descargando — te sirve como soporte de ingresos.',
    execute: { type: 'GENERATE_PAYSLIP', payload: data }
  };
}

// Captador de señales: dado el texto normalizado (sin tildes) y las entidades
// ya extraídas, infiere el DOMINIO por señales sueltas y devuelve un intent
// que _aiDispatchNLP sabe responder, 'HELP' (para aiHelpAnswer) o null. Es
// PURO y testeable. Corre solo como último recurso (clasificación fallida).
// Prioridad: hipotético→skip · ayuda/app · plata/datos · legal · bienestar ·
// datos por tiempo. La idea: dejar de preguntar "¿reconozco esta frase?" y
// pasar a "¿qué señales trae y qué módulo mío las atiende?".
function _aiSignalRoute(t, ent) {
  if (!t) return null;
  ent = ent || {};

  // Hipotéticos: los maneja la simulación, no el salvataje.
  if (_aiHas(t, 'si trabajo', 'si hago', 'si meto', 'si trabajara', 'cuanto gano si', 'simul')) {
    return null;
  }

  // 1) Ayuda / cómo usar / errores de la app.
  if (
    _aiHas(
      t,
      'no funciona',
      'no guarda',
      'no carga',
      'no aparece',
      'no me deja',
      'error',
      'se traba',
      'se cierra',
      'bug'
    ) ||
    (_aiHas(t, 'como ', 'donde ', 'no se como', 'no encuentro', 'no se donde') &&
      _aiHas(
        t,
        'registr',
        'export',
        'cambi',
        'configur',
        'pin',
        'foto',
        'contrasen',
        'clave',
        'turno',
        'salario',
        'cuenta',
        'correo',
        'respald',
        'backup',
        'borr',
        'edit'
      ))
  ) {
    return 'HELP';
  }

  // Pago INJUSTO → legal, aunque mencione "pagar" (gana a la ruta de plata).
  if (
    _aiHas(
      t,
      'pagan mal',
      'pagando mal',
      'me pagan poco',
      'me roban',
      'me explota',
      'es justo',
      'no me pagan bien',
      'me estan pagando',
      'pagar mal'
    )
  ) {
    return 'ley';
  }

  var _money =
    _aiHas(
      t,
      'plata',
      'dinero',
      'lana',
      'gane',
      'gano',
      'ganar',
      'cobr',
      'sueld',
      'salari',
      'pag',
      'llev',
      'saqu',
      'junt',
      'ingreso',
      'factur',
      'embols',
      'cuanto me hice',
      'cuanto me queda',
      'platica',
      'lucas'
    ) || !!ent.money;
  var _pregunta = _aiHas(t, 'cuanto', 'cuanta', 'cuant');

  // 2) Plata / datos económicos (con anclaje temporal si existe).
  if (_money || _pregunta) {
    if (ent.timeRelative === 'ayer' || _aiHas(t, 'ayer', 'anoche', 'antier', 'anteayer'))
      return 'ayer';
    if (ent.timeRelative === 'hoy' || _aiHas(t, ' hoy ', 'hoy?', 'de hoy', 'llevo hoy'))
      return 'hoy';
    if (
      _aiHas(
        t,
        'van a pagar',
        'voy a ganar',
        'al cierre',
        'al final',
        'proyec',
        'terminar el mes',
        'fin de mes',
        'voy a terminar'
      )
    )
      return 'proyeccion';
    if (
      ent.timeRelative === 'mes_pasado' ||
      _aiHas(t, 'mes pasado', 'mes anterior', 'comparar mes', 'vs el mes')
    )
      return 'comparativa_mes';
    if (_aiHas(t, 'cuantas horas', 'horas trabaj', 'horas llevo', 'horas hice'))
      return 'horas_trabajadas';
    if (_money) return 'total_ganado';
  }

  // 3) Legal / pago justo / recargos.
  if (_aiHas(t, 'vale la hora', 'cuanto vale la hora', 'valor de la hora', 'valor hora'))
    return 'valor_hora';
  if (
    _aiHas(
      t,
      'recargo',
      'nocturn',
      'dominical',
      'hora extra',
      'horas extra',
      'ley',
      'derecho',
      'legal',
      'me explota',
      'me roban',
      'me pagan mal',
      'es justo',
      'normativa',
      'codigo sustantivo',
      'me estan pagando'
    )
  ) {
    return 'ley';
  }

  // 4) Bienestar / fatiga (emocional, sin pregunta de datos).
  if (
    _aiHas(
      t,
      'cansa',
      'agotad',
      'rendid',
      'revent',
      'quemad',
      'no doy mas',
      'no puedo mas',
      'harto',
      'estres',
      'dormir',
      'sueno',
      'descans',
      'fatiga',
      'burnout',
      'explotad',
      'muerto',
      'no aguanto'
    )
  ) {
    if (_aiHas(t, 'no doy mas', 'no puedo mas', 'no aguanto', 'explotad', 'harto'))
      return 'queja_fatiga';
    return 'bienestar';
  }

  // 5) Datos por tiempo / patrón (sin plata explícita).
  if (_aiHas(t, 'racha')) return 'racha';
  if (_aiHas(t, 'mejor dia')) return 'mejor_dia';
  if (_aiHas(t, 'peor dia')) return 'peor_dia';
  if (_aiHas(t, 'festiv')) return 'festivos';
  if (_aiHas(t, 'semana')) return 'comparativa_semana';

  return null;
}

// Detección Out-of-Scope (CLINC150): marcadores de ALTA PRECISIÓN de temas
// fuera del dominio (no nómina/turnos/app). Sin un umbral neuronal, un
// blocklist preciso es la forma robusta de evitar que el clasificador (o el
// salvataje) fabrique una respuesta de plata para "quién ganó el mundial".
// ¿Pide convertir SU plata a otra moneda? ("mi sueldo en euros", "cuánto gano
// en dólares"). Distinto de la cotización ("cuánto cuesta el dólar" → OOS). No
// convertimos: requeriría tasas en vivo (rompe el 100% local y queda viejo).
// Redirige con gracia a lo que sí hacemos, en pesos.
function _aiMonedaConversionIntent(t) {
  if (!/\b(dolar|dolares|dólar|euro|euros|usd|eur)\b/.test(t || '')) return false;
  // Cotización (precio de la divisa) → eso es OOS, no conversión de su pago.
  if (/cuanto (cuesta|vale|esta) (un |el )?(dolar|euro)|precio del|cotizacion/.test(t))
    return false;
  return true;
}

function _aiIsOutOfScope(t) {
  if (!t) return false;
  return _aiHas(
    t,
    'que hora es',
    'que hora son',
    'que horas son',
    'la hora exacta',
    'que dia es hoy',
    'que dia es manana',
    'que fecha es hoy',
    'cuanto cuesta un dolar',
    'cuanto vale el dolar',
    'precio del dolar',
    'cotizacion del dolar',
    'bitcoin',
    'quien gano',
    'quien es ',
    'quien fue',
    'quien invento',
    'quien gobierna',
    'capital de',
    'capital del',
    'pelicula',
    'serie de',
    'que ver',
    'cancion',
    'cantante',
    'clima',
    'va a llover',
    'que tiempo hace',
    'temperatura',
    'presidente',
    'futbol',
    'el partido',
    'mundial',
    'seleccion gano',
    'receta',
    'como cocinar',
    'noticia',
    'traduc',
    'horoscopo',
    'cuantos anos tiene',
    'edad de',
    'casa blanca',
    'planeta'
  );
}

function _aiAnswerCore(question, state) {
  var q = question.toLowerCase().trim();
  var t = _aiNorm(question);
  _aiLastNlp = null;
  _aiTurnCounter++;
  if (!q) return 'Pregúntame algo sobre tu mes.';

  // Construcción del contexto garantizada
  var c = buildContext(state);

  // ═══ EDICIÓN DE TURNOS POR CHAT (acción real, con confirmación) ═══
  // "registrá un turno ayer de 8 a 4", "borrá el turno del 14". Devuelve
  // un objeto {text, execute} que el asistente confirma antes de tocar datos.
  var _shiftEdit = _aiShiftEditIntent(q, t, c, state);
  if (_shiftEdit) return _shiftEdit;

  // ═══ VERIFICADOR DE PAGO JUSTO ("¿me pagan bien?") ═══
  // Alta prioridad: es el caso más sensible (alguien a quien le pagan mal).
  var _audit = _aiAuditIntent(q, t, c, state);
  if (_audit) return _audit;

  // ═══ OPTIMIZADOR DE INGRESOS ("¿qué turno me conviene?") ═══
  var _optim = _aiOptimizarIntent(q, t, c);
  if (_optim) return _optim;

  // ═══ EXPLICABILIDAD ("¿cómo lo calculaste?") ═══
  // Antes del atajo de "cómo" → ayuda, que si no lo secuestraría.
  var _explain = _aiExplainIntent(q, t, c);
  if (_explain) return _explain;

  // ═══ DESPRENDIBLE DE NÓMINA (comprobante PDF) ═══
  var _desp = _aiDesprendibleIntent(q, t, c, state);
  if (_desp) return _desp;

  // ═══ INTENTS FINANCIEROS/LABORALES DE ALTA SEÑAL ═══
  // Antes del atajo de ayuda: "cómo reparto mi sueldo" debe dar el
  // presupuesto, no la guía de configurar salario (que matchea "sueldo").
  var _finResp = _aiFinancieroIntent(q, t, c);
  if (_finResp) return _finResp;

  // ═══ FEATURES AGÉNTICAS VISUALES (simulador / vigía / meta-NL) ═══
  // Corre PRE-NLP: el clasificador mandaría "revisá mis turnos" a navegar.
  // Devuelve tarjeta/acción lista, o null para seguir el flujo normal.
  if (typeof aiAgentRoute === 'function') {
    var _agResp = aiAgentRoute(q, t, c, state);
    if (_agResp) return _agResp;
  }

  // ═══ ATAJO AYUDA: preguntas con "cómo" → aiHelpAnswer directo ═══
  // Quitar "¿" inicial antes de comparar para que "¿Cómo..." también dispare
  var _qSinInterro = q.replace(/^[¿¡]+/, '');
  if (_qSinInterro.indexOf('cómo ') === 0 || _qSinInterro.indexOf('como ') === 0) {
    // Solo una guía REAL corta acá; si no hay, dejar pasar a la mejor ruta
    // (ej. "cómo mando el reporte" → email, no el fallback genérico de ayuda).
    var ayudaDirecta = _aiHelpLookup(q);
    if (ayudaDirecta) return ayudaDirecta;
  }
  var isAdmin = state.session && state.session.isAdmin;

  // ── MÁQUINA DE ESTADOS (Flujos Multi-paso) ──
  var conv = typeof aiGetConversation === 'function' ? aiGetConversation() : null;
  if (conv && conv.stateMachine && conv.stateMachine.active) {
    var sm = conv.stateMachine;

    if (sm.flow === 'vacaciones') {
      if (sm.step === 1) {
        var dias = _aiNum(t);
        if (dias) {
          sm.data.dias = dias;
          sm.step = 2;
          return (
            'Perfecto, ' +
            dias +
            ' días hábiles. ¿A partir de qué fecha te los quieres tomar? (ej. "del 10 de agosto")'
          );
        }
        return 'No entendí cuántos días. Por favor dime un número, ej. "15 días".';
      }
      if (sm.step === 2) {
        // Simulación simple de fecha
        sm.data.fecha = question;
        sm.active = false; // Terminar flujo

        var valorVacaciones = (c.salario / 30) * sm.data.dias;
        return (
          '🌴 **Resumen de Vacaciones:**\n\n' +
          '• Días hábiles: ' +
          sm.data.dias +
          '\n' +
          '• Fecha de inicio: ' +
          sm.data.fecha +
          '\n' +
          '• Valor estimado a recibir: **' +
          fCOP(valorVacaciones) +
          '**\n\n' +
          '¡Que las disfrutes mucho! ¿Te ayudo con algo más?'
        );
      }
    }
  }

  // ── MODO DESARROLLADOR Y DIAGNÓSTICO ──
  if (
    isAdmin &&
    _aiHas(
      t,
      'donde',
      'archivo',
      'modulo',
      'cambio',
      'eliminar',
      'mover',
      'codigo',
      'error',
      'falla',
      'supabase',
      'vercel',
      'red',
      'conexion',
      'luna',
      'oscuro',
      'tema',
      'que es',
      'para que',
      'significa',
      'diccionario',
      'reglas'
    )
  ) {
    var map = c._devMap;
    var fix = c._troubleshooting;
    var dict = c._dictionary;

    // 1. Prioridad: Reglas de Oro
    if (_aiHas(t, 'reglas', 'oro', 'lecciones')) {
      return (
        '🌟 **Reglas de Oro del Proyecto:**\n\n' +
        [
          '1. Antes de borrar, haz backup manual de la carpeta.',
          '2. Si no ves cambios, sospecha del Service Worker (SW).',
          '3. F12 -> Console -> Network es tu primer paso.',
          '4. Vercel es una máquina del tiempo (Rollback).',
          '5. Los errores tienen mensajes: léelos, no los ignores.',
          '6. Modularizar temprano facilita la vida.'
        ].join('\n') +
        '\n\n💡 *Sigue estas pautas para un desarrollo profesional.*'
      );
    }

    // 2. Prioridad: Diccionario de conceptos
    for (var term in dict) {
      if (_aiHas(t, term)) {
        return (
          '📖 **Diccionario de Bolsillo:**\n\n' +
          dict[term] +
          '\n\n💡 *Esta definición es específica para tu proyecto Mi Turno.*'
        );
      }
    }

    var respuesta = '🛠 **Sugerencia de Arquitectura:**\n\n';

    // Priorizar diagnósticos de infraestructura
    if (_aiHas(t, 'supabase')) {
      return '🛡 **Diagnóstico Supabase:**\n' + map.supabase + '\n\n💡 ' + fix.supabase_db;
    }
    if (_aiHas(t, 'vercel', 'despliegue', 'hosting')) {
      return '🚀 **Diagnóstico Vercel:**\n' + map.vercel + '\n\n💡 ' + fix.vercel_deploy;
    }
    if (_aiHas(t, 'red', 'conexion', 'internet', 'offline')) {
      var status = navigator.onLine ? '✅ Actualmente en línea' : '❌ Actualmente sin conexión';
      return (
        '🌐 **Estado de Red:** ' +
        status +
        '\n\n' +
        fix.network_offline +
        '\n\nSi el servidor no responde: ' +
        fix.cors
      );
    }

    if (_aiHas(t, 'emoji', 'icono')) respuesta += '• ' + map.emoji + '\n';
    if (_aiHas(t, 'color', 'estilo', 'apariencia')) respuesta += '• ' + map.color + '\n';
    if (_aiHas(t, 'boton', 'click')) respuesta += '• ' + map.boton + '\n';
    if (_aiHas(t, 'calculo', 'nomina', 'plata', 'cuenta')) respuesta += '• ' + map.calculo + '\n';
    if (_aiHas(t, 'error', 'falla', 'bug')) respuesta += '• ' + map.error + '\n';

    respuesta +=
      '\nBasado en `ESTRUCTURA.md`, este cambio requiere editar el módulo mencionado y recargar la app.';
    return respuesta;
  }

  // ── MEMORIA EPISÓDICA: "¿de qué hablamos?" · "/recuerdos" ──
  if (typeof aiEpisodeAnswer === 'function' && state.session && state.session.uid) {
    var _epResp = aiEpisodeAnswer(q, state.session.uid);
    if (_epResp) return _epResp;
  }

  var _esSlash = q.charAt(0) === '/';

  // ── COMPARACIÓN DE PERÍODOS ARBITRARIOS ──
  // "compará junio con mayo", "junio vs mayo". Va ANTES de aiQueryParse:
  // si no, el parser de consulta agarraría solo el primer mes y respondería
  // por uno solo en vez de confrontar los dos.
  if (!_esSlash && typeof aiQueryCompare === 'function') {
    var _cmp = aiQueryCompare(q, state.turnosAll || state.turnos || [], c);
    if (_cmp) {
      var _cmpCard = typeof aiQueryLastCard === 'function' ? aiQueryLastCard() : null;
      if (typeof aiUpdateConversation === 'function') {
        aiUpdateConversation('comparativa_mes', 'comparativa');
      }
      if (typeof aiEnhancedRespond === 'function') {
        var _cmpEnriched = aiEnhancedRespond(
          _cmp,
          'comparativa_mes',
          'comparativa',
          q,
          c,
          null,
          state.turnosAll
        );
        if (_cmpEnriched && _cmpEnriched.text) {
          if (_cmpCard) _cmpEnriched.card = _cmpCard;
          return _cmpEnriched;
        }
      }
      return _cmpCard ? { text: _cmp, card: _cmpCard } : _cmp;
    }
  }

  // ── FECHA IMPOSIBLE: "31 de febrero" no existe ──
  // Antes del parser de datos: si no, hacía rollover y respondía por otra fecha.
  if (!_esSlash && _aiFechaImposible(t)) {
    return 'Esa fecha no existe 🙂. Revisá el día del mes y te lo calculo.';
  }

  // ── CONSULTA ESTRUCTURADA A TUS DATOS ──
  // Filtros que los intents clásicos no cubren (día de semana, festivos,
  // mes puntual por nombre). Va directo a la tabla de turnos con doCalc.
  // Los comandos slash nunca pasan por acá ni por el NLP: son explícitos.
  if (!_esSlash && typeof aiQueryParse === 'function' && typeof aiQueryRun === 'function') {
    var _temaActual = null;
    try {
      _temaActual = typeof aiGetConversation === 'function' ? aiGetConversation().lastTopic : null;
    } catch (_) {}
    var _dq = aiQueryParse(q, { topic: _temaActual });
    if (_dq) {
      var _dqText = aiQueryRun(_dq, state.turnosAll || state.turnos || [], c);
      if (_dqText) {
        var _dqCard = typeof aiQueryLastCard === 'function' ? aiQueryLastCard() : null;
        if (typeof aiUpdateConversation === 'function') {
          // 'dinero' es el vocabulario de topics del NLP (_aiIntentTopic):
          // así el tema queda disponible para topic bonus y follow-ups.
          aiUpdateConversation('consulta_datos', 'dinero');
        }
        if (typeof aiEnhancedRespond === 'function') {
          var _dqEnriched = aiEnhancedRespond(
            _dqText,
            'consulta_datos',
            'dinero',
            q,
            c,
            null,
            state.turnosAll
          );
          if (_dqEnriched && _dqEnriched.text) {
            if (_dqCard) _dqEnriched.card = _dqCard;
            return _dqEnriched;
          }
        }
        return _dqCard ? { text: _dqText, card: _dqCard } : _dqText;
      }
    }
  }

  // ── TOTAL DE QUINCENA (datos, no NLP) ──
  // "cuánto va de quincena" debe dar el total real de la quincena (capa de
  // datos), no caer en el NLP que la lee como celebración sin cifras.
  if (!_esSlash) {
    var _qTot = _aiQuincenaTotalIntent(q, t, c, state);
    if (_qTot) return _qTot;
  }

  // ── ESTADO DEL TURNO ACTIVO (datos, no NLP) ──
  // "¿tengo un turno activo?" caía en disambiguación; reporta el estado real.
  if (!_esSlash) {
    var _act = _aiTurnoActivoIntent(q, t, c);
    if (_act) return _act;
  }

  // ── TENDENCIA (datos, no NLP) ──
  // "muéstrame la tendencia" caía en proyeccion y "voy subiendo o bajando" en hoy;
  // el handler de tendencia vivía después del NLP y nunca se alcanzaba.
  if (!_esSlash && _aiTendenciaIntent(q, t)) {
    var _ten = _aiTendenciaResponder(c, state);
    if (_ten) return _ten;
  }

  // ── DIAGNÓSTICO DE CONEXIÓN/SYNC (no NLP) ──
  // "por qué no sincroniza" caía a fallback (conf baja); da el estado real.
  if (!_esSlash && _aiDiagnosticoConexionIntent(q, t)) {
    return _aiConexionEstado(state);
  }

  // ── SIMULACIÓN / HIPOTÉTICOS (no NLP) ──
  // "simulá X horas" caía en horas_trabajadas (por la palabra "horas") y
  // "si trabajo el domingo" en la tarifa legal genérica. Ambos son hipotéticos
  // → al simulador, que personaliza con _aiDetectarTipoHora (domingo/noche/extra).
  if (!_esSlash) {
    var _esSimul = /(^|\s)simul[aá]\b|(^|\s)simular\b|(^|\s)simulemos\b/.test(t);
    var _esHipo =
      (/\bsi (trabaj|met|hag|sac|pong|echo|hicier|hiciera|agarr|tomo)/.test(t) ||
        /\bganaria\b|\bcuanto saco con\b|\bcuanto seria con\b/.test(t)) &&
      /(domingo|dominical|festiv|noche|nocturn|madrugad|extra|hora|turno|jornada)/.test(t);
    if (_esSimul || _esHipo) {
      // "¿Qué pasa si trabajo un festivo?" es CONCEPTUAL (quiere la regla), no una
      // simulación cuantitativa: sin un número, explicá el recargo en vez de
      // proyectar un default de 4h que se siente prefabricado.
      var _conceptualHipo =
        /\bque pasa si\b|\bque pasaria si\b|\bque sucede si\b|\bque me pasa si\b/.test(t) &&
        _aiNum(t) === null;
      var _simResp = _aiDispatchNLP(_conceptualHipo ? 'ley' : 'simulacion', c, state, q, t);
      if (_simResp) return _simResp;
    }
  }

  // ── REFERENCIAS CONTEXTUALES: "¿y la quincena pasada?", "¿y eso por qué?" ──
  // Resuelve elipsis antes de clasificar, para que el NLP no las vea como
  // frases sin intent suficiente (confidence baja).
  if (!_esSlash && typeof aiResolveContextRef === 'function') {
    var _ctxRefIntent = aiResolveContextRef(
      q,
      typeof aiGetConversation === 'function' ? aiGetConversation() : null
    );
    if (_ctxRefIntent) {
      var _ctxResp = _aiDispatchNLP(_ctxRefIntent, c, state, q, t);
      if (_ctxResp) {
        if (typeof aiUpdateConversation === 'function')
          aiUpdateConversation(_ctxRefIntent, _aiIntentTopic(_ctxRefIntent));
        if (typeof aiEnhancedRespond === 'function') {
          var _ctxEnriched = aiEnhancedRespond(
            _ctxResp,
            _ctxRefIntent,
            _aiIntentTopic(_ctxRefIntent),
            q,
            c,
            null,
            state.turnosAll
          );
          if (_ctxEnriched && _ctxEnriched.text) return _ctxEnriched;
        }
        return _ctxResp;
      }
    }
  }

  // ── CONVERSIÓN DE MONEDA: redirect honesto (no convertimos, no es OOS) ──
  // "mi sueldo en euros" no es fuera de dominio (habla de SU plata) ni lo
  // fabricamos con una tasa que quedaría vieja. Lo decimos claro y ofrecemos
  // lo que sí hacemos, en pesos.
  if (!_esSlash && _aiMonedaConversionIntent(t)) {
    return {
      text: 'Por ahora manejo todo en **pesos colombianos** 🇨🇴. No hago conversión a otras monedas porque el cambio se mueve a diario y no quiero darte un número que quede viejo. Pero sí te digo tu sueldo, tu valor hora y cuánto llevás este mes. ¿Cuál querés?',
      actions: [
        { label: '💵 Mi valor hora', query: 'cuánto gano por hora' },
        { label: '📅 Cuánto llevo este mes', query: 'cuánto llevo este mes' }
      ]
    };
  }

  // ── OUT-OF-SCOPE: declinar con gracia (no fabricar) ──
  // Va ANTES del NLP para que "qué hora es" no se cuele como horas_trabajadas
  // ni "quién ganó el mundial" como total ganado. Redirige a lo que SÍ sabe.
  if (!_esSlash && _aiIsOutOfScope(t)) {
    return {
      text: '🤔 Eso se me escapa — soy tu asistente de **turnos y plata**. Te puedo decir cuánto llevás, tu proyección al cierre, recargos y festivos, liquidación, plan de ahorro y más. ¿Vemos algo de tu trabajo?',
      actions: [
        { label: '¿Cuánto llevo este mes?', query: 'cuánto llevo este mes' },
        { label: 'Mi proyección', query: 'proyección al cierre' },
        { label: 'Ver todo lo que sé', query: '/ayuda' }
      ]
    };
  }

  // ── NLP MEJORADO (v76): clasificación inteligente de intenciones ──
  // Usa el motor ai-nlp.js para entender lenguaje natural con:
  // · Tolerancia a typos y variaciones conversacionales
  // · Sinónimos colombianos (plata=lucas=dinero, camello=trabajo)
  // · Contexto multi-turno ("¿y ayer?" después de "¿cuánto gané?")
  // · Detección de tono emocional para respuestas empáticas
  // Solo se activa con confianza ≥0.5; si no, cae al sistema clásico.
  // Los comandos slash son explícitos: saltan el clasificador entero.
  // Sin este guard, "/meta 2000000" clasificaba como `celebracion` (0.6)
  // y respondía festejando los 2 millones como si fueran un logro.
  var _nlp =
    !_esSlash && typeof aiClassifyIntent === 'function'
      ? aiClassifyIntent(question, aiGetConversation(), c)
      : null;
  _aiLastNlp = _nlp;

  // "cómo voy" a secas es PROGRESO del período (acumulado), no lo de HOY: la capa
  // semántica lo mandaba a `hoy` ("Hoy llevás..." con el total del mes mal
  // etiquetado) o al fallback. Override determinista (no toca el corpus del
  // clasificador, así no hay ripple — lección v317). Anclado a la frase COMPLETA
  // para no secuestrar "cómo voy con el ahorro" (advisor) ni "cómo voy hoy/esta
  // semana" (que conservan su intent).
  var _esProgresoGeneral =
    /^[¿¡\s]*c[oó]mo\s+(voy|vamos|me\s+va)(\s+(en\s+general|este\s+mes|ahora|hasta\s+ahora|con\s+la\s+plata))?\s*[?¿!.\s]*$/.test(
      (q || '').trim()
    );
  if (_nlp && _esProgresoGeneral && !/\b(hoy|ayer|semana|semanal)\b/.test(t)) {
    _nlp.intent = 'total_ganado';
    _nlp.topic = 'dinero';
    _nlp.confidence = Math.max(_nlp.confidence || 0, 0.9);
    if (_nlp.margin == null || _nlp.margin < 1) _nlp.margin = 1;
  }

  // Extraer entidades (dinero, números, tiempo)
  var _entities = typeof aiExtractEntities === 'function' ? aiExtractEntities(question) : null;

  // ── DESAMBIGUACIÓN EN EMPATE FUERTE ──
  // Si el clasificador no puede decidir entre dos intents con señal real
  // (mismo puntaje, ≥4), preguntar en vez de adivinar. Antes esto caía a la
  // cascada clásica y algún _aiHas goloso elegía mal. Un tap del usuario
  // resuelve la ambigüedad y la respuesta sale correcta. Solo dispara con
  // dos lecturas distintas y "respondibles" (ambas en _aiIntentSuggestion).
  if (
    _nlp &&
    _nlp.score >= 4 &&
    _nlp.margin === 0 &&
    _nlp.secondIntent &&
    _nlp.secondIntent !== _nlp.intent
  ) {
    var _tieA = _aiIntentSuggestion(_nlp.intent);
    var _tieB = _aiIntentSuggestion(_nlp.secondIntent);
    if (_tieA && _tieB) {
      return {
        text: 'Lo puedo leer de dos formas. ¿Cuál buscás?',
        actions: [
          { label: _tieA.label, query: _tieA.query },
          { label: _tieB.label, query: _tieB.query },
          { label: 'Otra cosa', query: '/ayuda' }
        ]
      };
    }
  }

  // Segunda oportunidad: confianza media (>= 0.35) PERO con un ganador claro
  // (margin >= 1) también va por el pipeline moderno, no al chain clásico. Sube
  // la cobertura sin arriesgar: los casi-empates (margin chico) sí quedan para el
  // fallback. El guard de margin evita despachar clasificaciones ambiguas.
  var _midConfOk = _nlp && _nlp.confidence >= 0.35 && (_nlp.margin || 0) >= 1;
  if (_nlp && (_nlp.confidence >= 0.5 || _midConfOk)) {
    aiUpdateConversation(_nlp.intent, _nlp.topic);
    var _mood =
      typeof aiAnalyzeMood === 'function' ? aiAnalyzeMood(question, c) : { mood: 'neutral' };
    // La empatía verbal (prefijo/sufijo) solo se aplica si el usuario expresó una
    // emoción en SU texto. Para preguntas factuales ("¿cuánto gané?", "¿cuántas
    // horas?") se responde limpio — anteponer consuelo donde no hay dolor suena a
    // robot. El mood inferido por contexto (racha/burnout) ya no fuerza empatía.
    var _useEmp = !!(_mood && _mood.fromText);
    var _pref =
      _useEmp && typeof aiEmpatheticPrefix === 'function' ? aiEmpatheticPrefix(_mood.mood) : '';
    var _suff =
      _useEmp && typeof aiEmpatheticSuffix === 'function' ? aiEmpatheticSuffix(_mood.mood) : '';
    var _resp = _aiDispatchNLP(_nlp.intent, c, state, q, t);
    if (_resp) {
      // _resp puede ser string o {text, action} o {text, chart}
      var _isObj = _resp && typeof _resp === 'object';
      var _isAction = _isObj && _resp.action;
      var _text = _isObj ? _resp.text || '' : _resp;
      // Aplica la empatía sobre el enriquecido y preserva acción/gráfico.
      var _finishEnriched = function (en) {
        if (en && en.text) {
          en.text = _pref + en.text + _suff;
          if (_isAction) en.action = _resp.action;
          if (_isObj && _resp.chart) en.chart = _resp.chart;
          // Chips explícitos del handler (ej. starters del saludo) ganan:
          // si el handler los definió a propósito, no los pisa el enriquecedor.
          if (_isObj && _resp.actions && _resp.actions.length) en.actions = _resp.actions;
          return en;
        }
        return null;
      };
      if (typeof aiEnhancedRespond === 'function') {
        // Se pasa el texto BASE (sin empatía) al enriquecedor para que el
        // anti-repetición compare núcleos estables; la empatía se aplica después.
        var _enriched = aiEnhancedRespond(
          _text,
          _nlp.intent,
          _nlp.topic,
          q,
          c,
          _entities,
          state.turnosAll
        );
        // aiEnhancedRespond devuelve un objeto (síncrono) o una Promise (cuando
        // corre el pipeline del agente, para intents financieros). Antes el caso
        // Promise se ignoraba y se perdía TODA la capa conversacional —pregunta
        // de seguimiento y botones de tema relacionado—, dejando la respuesta
        // seca. Ahora se resuelven ambos casos.
        if (_enriched && typeof _enriched.then === 'function') {
          return _enriched.then(function (en) {
            return _finishEnriched(en) || _pref + _text + _suff;
          });
        }
        var _fin = _finishEnriched(_enriched);
        if (_fin) return _fin;
      }
      if (_isAction) {
        _resp.text = _pref + (_resp.text || '') + _suff;
        return _resp;
      }
      return _pref + _text + _suff;
    }
  }

  // ── FOLLOW-UP: ¿el usuario responde a una sugerencia de la IA? ──
  if (typeof aiCheckFollowUp === 'function') {
    var _fuIntent = aiCheckFollowUp(q);
    if (_fuIntent) {
      var _fuResp = _aiDispatchNLP(_fuIntent, c, state, q, t);
      if (_fuResp) {
        if (typeof aiEnhancedRespond === 'function') {
          var _fuEnriched = aiEnhancedRespond(
            _fuResp,
            _fuIntent,
            _aiIntentTopic(_fuIntent),
            q,
            c,
            null,
            state.turnosAll
          );
          // Igual que arriba: resolver tanto el objeto síncrono como la Promise
          // del agente para no perder la capa conversacional en el follow-up.
          if (_fuEnriched && typeof _fuEnriched.then === 'function') {
            return _fuEnriched.then(function (en) {
              return en && en.text ? en : _fuResp;
            });
          }
          if (_fuEnriched && _fuEnriched.text) return _fuEnriched;
        }
        return _fuResp;
      }
    }
  }

  // ── SLASH COMMANDS ──
  if (q === '/ayuda' || q === '/help' || q === '/?') {
    return (
      '⌨️ **Comandos rápidos**\n\n' +
      '📊 **/stats** — Resumen exprés de tu mes en 1 sola línea (plata, horas, proyección)\n' +
      '🏆 **/logros** — Todas tus insignias: rachas, récords, hitos desbloqueados\n' +
      '🎯 **/meta 2500000** — Calcula cuánto te falta y cuántos turnos necesitás para llegar a X pesos\n' +
      '🔮 **/simular 4h** — ¿Cuánto ganarías con X horas extra? Agregá "nocturnas" o "festivas" para precision\n' +
      '📈 **/tendencia** — Tus últimos 3 meses comparados: ¿vas subiendo o bajando?\n' +
      '📅 **/semana** — Balance completo de esta semana: ingresos, horas, días trabajados\n' +
      '📍 **/dia** — Lo que ganaste hoy con detalle de horas y turnos\n' +
      '🧠 **/recuerdos** — Lo que recuerdo de nuestras charlas (consultas, metas, hitos)\n' +
      '💰 **/liquidar** — Sueldo neto (con descuentos) + prestaciones acumuladas (prima, cesantías, vacaciones)\n' +
      '⚖️ **/ley** — Normativa laboral vigente: Ley 2101, jornada máxima, recargos, auxilio de transporte\n' +
      '🧘 **/salud** — Análisis de fatiga: ¿estás al límite o vas bien?\n\n' +
      '💡 **No necesitás escribir los comandos exactos.** Podés hablar natural:\n' +
      '"¿cuánto gané ayer?", "proyección al cierre", "¿cómo cambio mi foto?", "simulá 4 horas extra nocturnas"'
    );
  }
  if (q === '/capacidades' || q === '/skills') {
    return '**Capacidades Potenciadas:**\n\n💰 **Finanzas**\n• Presupuesto 50/30/20 (cómo repartir tu sueldo)\n• Sueldo Neto (menos salud/pensión)\n• Liquidación y prestaciones\n• Indemnización por despido (Art. 64)\n• Fondo de emergencia y plan de ahorro\n• Capacidad de cuota / endeudamiento\n• Comparador de ofertas laborales\n\n⚖️ **Legal**\n• Ley 2101 (Reducción de jornada)\n• Auxilio de Transporte y Recargos\n\n🧠 **Salud**\n• Análisis de burnout y descanso';
  }

  // ── INTENT: LIQUIDACIÓN ──
  if (
    q === '/liquidar' ||
    _aiHas(t, 'liquidacion', 'cuanto me deben', 'mis prestaciones', 'prima', 'cesantia')
  ) {
    return (
      '💰 **Proyección Financiera (Día ' +
      c.diaActual +
      '):**\n\n' +
      '**A recibir (Neto): ' +
      fCOP(c.sueldoNeto) +
      '**\n' +
      '• Bruto: ' +
      fCOP(c.totalCOP) +
      '\n' +
      '• Desc. Ley (8%): -' +
      fCOP(c.deducciones) +
      '\n' +
      '• Aux. Transp: +' +
      fCOP(c.estTransporte) +
      '\n\n' +
      '**Prestaciones Acumuladas:**\n' +
      '• Prima: ' +
      fCOP(c.estPrima) +
      '\n' +
      '• Cesantías: ' +
      fCOP(c.estCesantias) +
      '\n' +
      '• Vacaciones: ' +
      fCOP(c.estVacaciones) +
      '\n\n' +
      '*Nota: Cálculos informativos basados en el CST.*'
    );
  }

  // ── INTENT: NORMATIVA LABORAL ──
  if (
    q === '/ley' ||
    _aiHas(t, 'normativa', 'mis derechos', 'codigo sustantivo', 'cst', 'ley 2101', 'legal')
  ) {
    return (
      '⚖️ **Normativa Laboral Colombia 2026:**\n\n' +
      '• **Jornada Máxima:** 46 horas semanales (Ley 2101 de 2021).\n' +
      '• **Recargo Nocturno:** +35% (9:00 PM a 6:00 AM).\n' +
      '• **Auxilio Transporte:** Tienes derecho si ganas menos de 2 SMMLV ($' +
      fCOP(SMIN * 2) +
      ').\n' +
      '• **Día de Descanso:** Es obligatorio tras 6 días de trabajo.\n' +
      '• **Extras:** Máximo 2 horas diarias y 12 semanales.\n\n' +
      '¿Tienes dudas sobre algún recargo específico?'
    );
  }

  // ── INTENT: AUXILIO DE TRANSPORTE ──
  if (_aiHas(t, 'auxilio', 'transporte', 'subsidio transporte')) {
    var tieneDerecho = c.totalCOP <= SMIN * 2;
    return (
      '🚌 **Auxilio de Transporte 2026:**\n\n' +
      '• Valor mensual: **' +
      fCOP(AUX_TRANSPORTE_2026) +
      '**.\n' +
      '• Requisito: Ganar hasta 2 SMMLV.\n' +
      (tieneDerecho
        ? '✅ Según tus ingresos actuales, **tenés derecho** a percibirlo.'
        : '⚠️ Tus ingresos superan los 2 SMMLV, por lo cual **no aplica** este auxilio.')
    );
  }

  // ── INTENT: AHORRO / METAS ──
  // Los comandos "/meta N" siguen de largo hacia su handler dedicado
  // (que guarda la meta con aiSetGoal y registra el episodio).
  if (q.charAt(0) !== '/' && _aiHas(t, 'ahorro', 'meta', 'quiero ganar', 'para llegar a')) {
    // Validación: una meta negativa no tiene sentido (antes "-5M" se leía como +5M).
    var meta = _aiNum(t);
    // Entrada inválida (negativa o $0): seguimos en el tema (meta) y pedimos el
    // dato concreto, en vez de un rechazo seco. _aiNum ignora el signo, así que
    // el negativo se detecta en el texto crudo (q).
    if (_aiEsNegativo(q) || meta === 0)
      return 'Sigamos con tu meta 🎯. Necesito un monto **positivo en pesos**: ¿a cuánto querés llegar? Por ejemplo: "meta 3 millones".';
    var metaExplicita = !!(meta && meta >= 1000);
    if (!metaExplicita) meta = c.salario;
    var faltaMeta = Math.max(0, meta - c.totalCOP);
    if (faltaMeta === 0)
      return (
        '¡Felicidades! Ya superaste la meta de ' + fCOP(meta) + '. Llevas ' + fCOP(c.totalCOP) + '.'
      );
    var turnosNec = c.prom > 0 ? Math.ceil(faltaMeta / c.prom) : '—';
    if (metaExplicita) {
      try {
        if (typeof aiSetGoal === 'function') aiSetGoal(meta);
        if (typeof aiEpisodeRecord === 'function' && state.session && state.session.uid) {
          aiEpisodeRecord(state.session.uid, 'meta', 'Te propusiste llegar a ' + fCOP(meta), {
            meta: meta
          });
        }
      } catch (_) {}
    }
    return (
      '🎯 **Análisis de Meta:**\n\n' +
      '• Para alcanzar ' +
      fCOP(meta) +
      ' te faltan **' +
      fCOP(faltaMeta) +
      '**.\n' +
      '• A tu ritmo actual, necesitas **' +
      turnosNec +
      ' turnos** adicionales.\n' +
      '• Eso equivale a ' +
      (faltaMeta / c.vh).toFixed(1) +
      ' horas base.'
    );
  }

  // ── /STATS ──
  if (q === '/stats') {
    return (
      '⚡ **Stats exprés**\n• ' +
      c.diasTrab +
      ' turnos · ' +
      fDur(c.totalMins) +
      '\n• ' +
      fCOP(c.totalCOP) +
      ' (' +
      c.pctSalario.toFixed(1) +
      '% meta)\n• Mejor día: ' +
      (c.mejor ? _fechaLarga(c.mejor.fecha) : '—') +
      '\n• Proyección: ' +
      fCOP(c.proy)
    );
  }

  // ── /LOGROS ──
  if (q === '/logros') {
    if (typeof aiListAllAchievements === 'function') {
      return aiListAllAchievements(c);
    }
    return '🏅 Sistema de logros no disponible.';
  }

  // ── /INFORME ──
  if (q === '/informe') {
    if (typeof aiAdvisorInforme === 'function') {
      return aiAdvisorInforme(c);
    }
    return '📊 Informe no disponible.';
  }

  // ── /HISTORIAL ──
  if (q === '/historial') {
    if (typeof aiAdvisorHistorico === 'function') {
      var histText = aiAdvisorHistorico(state.turnosAll || state.turnos || [], c.vh, c.salario);
      if (histText) return histText;
    }
    return '📈 Necesito al menos 5 turnos en meses distintos para generar un análisis histórico. ¡Seguí registrando!';
  }

  // ── /AHORRO ──
  if (q.indexOf('/ahorro') === 0) {
    var ahorroNum = _aiNum(t);
    if (!ahorroNum && q.split(' ').length > 1)
      ahorroNum = parseFloat(q.split(' ')[1].replace(/[^0-9]/g, ''));
    if (!ahorroNum || ahorroNum <= 0) {
      return '💡 Usá **/ahorro 5000000** para calcular un plan de ahorro. También podés decir "quiero ahorrar 5 millones en 12 meses".';
    }
    if (typeof aiAdvisorAhorro === 'function') {
      return aiAdvisorAhorro(c, ahorroNum, 12);
    }
    return 'Calculadora de ahorro no disponible.';
  }

  // ── /METAS ──
  if (q === '/metas') {
    var goalsText = '';
    if (typeof aiCheckGoals === 'function') {
      goalsText = aiCheckGoals(c);
    }
    if (goalsText) return '🎯 **Tus metas guardadas**\n' + goalsText;
    return '🎯 No tenés metas guardadas todavía.\n\nUsá **/meta 2000000** para calcular y guardar tu primera meta. La app va a seguir tu progreso automáticamente.';
  }

  // ── /META ──
  if (
    q.indexOf('/meta') === 0 ||
    _aiHas(t, 'meta', 'cuanto necesito para', 'cuanto debo trabajar para')
  ) {
    var metaVal = _aiNum(t);
    if (!metaVal && q.indexOf('/meta') === 0) {
      var metaParts = q.split(' ');
      if (metaParts.length > 1) metaVal = parseFloat(metaParts[1].replace(/[^0-9]/g, ''));
    }
    if (!metaVal || metaVal <= 0) {
      return '💡 Usá **/meta 2500000** para calcular cuánto te falta. También podés escribir "¿cuánto necesito para llegar a 2 millones?"';
    }
    var _copHora = c && c.copPorHoraReal ? c.copPorHoraReal : c.vh || 0;
    var _promDia = c && c.prom ? c.prom : 0;
    var falta = Math.max(0, metaVal - ((c && c.totalCOP) || 0));
    var horasFaltan = _copHora > 0 ? falta / _copHora : 0;
    var diasFaltan = _promDia > 0 ? Math.ceil(falta / _promDia) : 0;
    var resp = '🎯 **Meta: ' + fCOP(metaVal) + '**\n\n';
    resp +=
      '• Llevás: ' +
      fCOP((c && c.totalCOP) || 0) +
      ' (' +
      ((c && c.pctSalario) || 0).toFixed(1) +
      '% de tu salario base)\n';
    resp += '• Te faltan: ' + fCOP(falta) + '\n';
    resp += '• Necesitás ≈ ' + horasFaltan.toFixed(1) + ' horas más (≈ ' + fCOP(_copHora) + '/h)\n';
    if (_promDia > 0)
      resp +=
        '• A tu ritmo actual (' +
        fCOP(_promDia) +
        '/día), te tomaría unos **' +
        diasFaltan +
        ' días**\n';
    if ((c && c.diasRestantes) > 0) {
      var diarioNecesario = falta / c.diasRestantes;
      resp +=
        '• Quedan ' +
        c.diasRestantes +
        ' días del mes → necesitás ' +
        fCOP(diarioNecesario) +
        '/día para llegar\n';
    }
    resp += '\n💡 Tocá **Simular el plan** abajo para probar escenarios.';
    // Guardar meta para seguimiento
    if (metaVal > 0) {
      try {
        if (typeof aiEpisodeRecord === 'function' && state.session && state.session.uid) {
          aiEpisodeRecord(state.session.uid, 'meta', 'Te propusiste llegar a ' + fCOP(metaVal), {
            meta: metaVal
          });
        }
      } catch (_) {}
      if (typeof aiSetGoal === 'function') {
        try {
          aiSetGoal(metaVal);
        } catch (_) {}
        resp += '\n📌 Meta guardada. Escribí **/metas** para ver tu progreso.';
      }
    }
    // Anillo de progreso + chips (Agente de Meta). El texto queda como
    // respaldo accesible; la tarjeta lo muestra visual. Degrada a string si
    // el builder no está cargado (smoke / vm parcial).
    var _goal = typeof aiBuildGoalCard === 'function' ? aiBuildGoalCard(metaVal, c) : null;
    if (_goal) return { text: resp, card: _goal.card, actions: _goal.actions };
    return resp;
  }

  // ── /SIMULAR ──
  if (q.indexOf('/simular') === 0 || (_aiHas(t, 'simular') && _aiNum(t) !== null)) {
    var numHoras = _aiNum(t);
    if (!numHoras && q.indexOf('/simular') === 0) {
      var simParts = q.split(' ');
      for (var si = 0; si < simParts.length; si++) {
        var n = parseFloat(simParts[si].replace(/[^0-9.]/g, ''));
        if (!isNaN(n) && n > 0) {
          numHoras = n;
          break;
        }
      }
    }
    if (!numHoras || numHoras <= 0) {
      return '💡 Usá **/simular 4h** o **/simular 4h nocturnas** para calcular un escenario.\n\nEjemplos:\n• "/simular 4h" → 4 horas diurnas extra\n• "/simular 4h nocturnas" → 4 horas extra de noche';
    }
    var _simTipoSlash = _aiDetectarTipoHora(t);
    var _vh = c.vh || 0;
    var factor = _simTipoSlash ? _aiFactor(_simTipoSlash) : 1.25;
    var labelSlash = _simTipoSlash ? _aiLabelTipo(_simTipoSlash) : 'diurnas extra';
    var extraEstimado = numHoras * _vh * factor;
    var nuevoTotal = ((c && c.totalCOP) || 0) + extraEstimado;
    var _sal = (c && c.salario) || 1;
    var respSim = '🔮 **Simulación: +' + numHoras + 'h ' + labelSlash + '**\n\n';
    respSim += '• Valor hora base: ' + fCOP(_vh) + '\n';
    respSim += '• Factor: ' + (factor * 100).toFixed(0) + '% → ' + fCOP(_vh * factor) + '/h\n';
    respSim += '• Extra estimado: ≈ ' + fCOP(extraEstimado) + '\n';
    respSim +=
      '• Nuevo total: ≈ ' +
      fCOP(nuevoTotal) +
      ' (' +
      ((nuevoTotal / _sal) * 100).toFixed(1) +
      '% del salario)\n';
    respSim +=
      '\n💡 Probá también **/meta ' +
      Math.round(nuevoTotal / 100000) * 100000 +
      '** para ver si llegás.';
    return respSim;
  }

  // ── /TENDENCIA ──
  if (q === '/tendencia' || _aiTendenciaIntent(q, t)) {
    return _aiTendenciaResponder(c, state);
  }

  // ── /SEMANA ──
  if (q === '/semana') {
    return (
      '📅 **Esta semana:** ' +
      fCOP(c.totalCOPSemana) +
      ' en ' +
      fDur(c.totalMinsSemana) +
      ' · ' +
      c.diasSemanaCount +
      ' días.\n\n' +
      '💡 **/tendencia** para ver la evolución de los últimos meses.'
    );
  }

  // ── /DIA ──
  if (q === '/dia') {
    if (c.turnosHoy === 0) return 'Hoy no registraste turnos todavía. ¿Arrancamos? 🚀';
    return (
      '📅 **Hoy:** ' +
      fCOP(c.copHoy) +
      ' en ' +
      fDur(c.minsHoy) +
      ' · ' +
      c.turnosHoy +
      ' turno' +
      (c.turnosHoy !== 1 ? 's' : '') +
      '.'
    );
  }

  // ── INTENT: SALUD / FATIGA ──
  if (q === '/salud' || _aiHas(t, 'cansado', 'fatiga', 'descanso', 'bienestar', 'salud')) {
    var saludMsg = c.burnout
      ? '⚠️ **Alerta de Fatiga:** Tu ritmo actual (' +
        c.hrsSemanales.toFixed(1) +
        'h/sem) o tu racha de ' +
        c.rachaActual +
        ' días sugieren que necesitas un descanso urgente para evitar el agotamiento.'
      : '✅ **Estado de Bienestar:** Tu carga laboral está dentro de los límites saludables. Mantenés un promedio de ' +
        c.hrsSemanales.toFixed(1) +
        'h semanales.';

    return (
      saludMsg +
      '\n\n**Recomendación:**\n' +
      (c.nocturnasMins > c.totalMins * 0.4
        ? '• Tienes mucha carga nocturna. Prioriza el sueño en total oscuridad.'
        : '• Intenta mantener al menos un día de desconexión total a la semana.')
    );
  }

  // ── INTERACCIÓN HUMANA ──
  if (_aiHas(t, 'hola', 'buenas', 'hey', 'que tal', 'saludos', 'que hubo', 'holi', 'ola')) {
    var saludo = (typeof _saludoHora === 'function' ? _saludoHora(c.ahora) : 'Hola') + '!';
    var _saludoOpts = [
      '¡' + saludo + ' ¿En qué te ayudo hoy?',
      '¡' + saludo + ' Tus números me esperaban. ¿Qué querés ver?',
      '¡' + saludo + ' ¿Arrancamos?'
    ];
    return _saludoOpts[Math.floor(Math.random() * _saludoOpts.length)];
  }
  if (_aiHas(t, 'gracias', 'thanks', 'thx', 'genial', 'perfecto', 'excelente')) {
    var _gracOpts = [
      'Con gusto 💪',
      'Para eso estoy. ¿Algo más?',
      'Dale. Acá estoy si necesitás algo más.'
    ];
    return _gracOpts[Math.floor(Math.random() * _gracOpts.length)];
  }
  // Acknowledgments cortos — "ok", "dale", "listo", "perfecto", "si" solos.
  // "si" y "sí" (normalizado a "si") se incluyen aquí: sin lastSuggestion activa
  // no son confirmaciones a nada concreto — son acknowledgments conversacionales.
  // El regex ancla inicio y fin para no atrapar "si trabajara" ni "si me pagaran".
  if (
    /^(si|ok|dale|listo|bueno|va|vamos|sisas|claro|entendido|perfecto|genial|excelente|sip|obvio|porfa|porfi)\.?!?$/.test(
      t
    )
  ) {
    var _ackOpts = ['Con gusto 💪', 'Acá estoy si necesitás algo más.', '¿En qué más te ayudo?'];
    return _ackOpts[Math.floor(Math.random() * _ackOpts.length)];
  }
  if (_aiHas(t, 'adios', 'chao', 'hasta luego', 'nos vemos', 'bye')) {
    return '¡Hasta luego! Trabaja con pilas y descansa cuando puedas. ✦';
  }
  if (
    _aiHas(
      t,
      'quien eres',
      'que eres',
      'de donde',
      'funcionas con internet',
      'offline',
      'online',
      'sin internet'
    )
  ) {
    return 'Soy un motor analítico 100% local. **No envío tus datos a ningún servidor**, todo se procesa en tu dispositivo. Conozco la Ley 2101/2021, los recargos colombianos, los festivos del año y tu historial completo.';
  }
  if (_aiHas(t, 'broma', 'chiste', 'divierteme')) {
    var chistes = [
      '¿Cómo se llama un turno nocturno que nunca termina? Hipotecario. 😅',
      '¿Por qué los recargos son tan honestos? Porque siempre te dan más de lo que pides.',
      'Mi jefe dice que no soy nada raro... aunque a las 3am, hasta los relojes lo dudan. ⏰'
    ];
    return chistes[Math.floor(Math.random() * chistes.length)];
  }

  // ── DATOS BASE: SIN TURNOS ──
  if (
    c.diasTrab === 0 &&
    !_aiHas(
      t,
      'recarg',
      'ley',
      'jornada',
      'festiv',
      'noctur',
      'extra',
      'salario',
      'meta',
      'ayuda',
      'funcion',
      'capacid',
      '/'
    )
  ) {
    return (
      'Aún no tenés turnos registrados este mes. ¡Pero no pasa nada! 💪 En la pestaña **Inicio** podés empezar tu primer turno y yo me encargo del resto.\n\nMientras tanto ¿te explico sobre **recargos legales**, **jornada nocturna**, **horas extras** o **próximos festivos**?\n\n' +
      _aiPickFollowUp('default')
    );
  }

  // ════════════════════════════════════════════════════════════
  //  PERIODOS ESPECÍFICOS
  // ════════════════════════════════════════════════════════════

  // Hoy
  if (_aiHas(t, 'hoy') && !_aiHas(t, 'mes', 'semana', 'ayer', 'llev')) {
    if (c.minsHoy === 0) return 'Hoy aún no has registrado turnos.';
    return (
      'Hoy llevas ' +
      fDur(c.minsHoy) +
      ' trabajados · ' +
      fCOP(c.copHoy) +
      '.' +
      (c.turnosHoy > 1 ? ' En ' + c.turnosHoy + ' turnos.' : '')
    );
  }
  // Ayer
  if (_aiHas(t, 'ayer', 'antier')) {
    if (c.minsAyer === 0) return 'No hay registros de ayer.';
    return 'Ayer trabajaste ' + fDur(c.minsAyer) + ' y ganaste ' + fCOP(c.copAyer) + '.';
  }
  // Esta semana
  if (
    _aiHas(t, 'esta semana', 'semana actual') ||
    (_aiHas(t, 'semana') && !_aiHas(t, 'pasad', 'anterior', 'que viene', 'sigui'))
  ) {
    if (c.diasSemanaCount === 0) return 'Esta semana aún no has trabajado.';
    return (
      'Esta semana llevas ' +
      c.diasSemanaCount +
      ' día' +
      (c.diasSemanaCount !== 1 ? 's' : '') +
      ' · ' +
      fDur(c.totalMinsSemana) +
      ' · ' +
      fCOP(c.totalCOPSemana) +
      '.'
    );
  }
  // Semana pasada
  if (_aiHas(t, 'semana pasad', 'semana anterior', 'semana previa')) {
    if (c.diasSemPasCount === 0) return 'No hay registros de la semana pasada.';
    return (
      'La semana pasada: ' +
      c.diasSemPasCount +
      ' día' +
      (c.diasSemPasCount !== 1 ? 's' : '') +
      ' · ' +
      fDur(c.totalMinsSemPas) +
      ' · ' +
      fCOP(c.totalCOPSemPas) +
      '.'
    );
  }
  // Mes pasado
  if (_aiHas(t, 'mes pasad', 'mes anterior', 'mes previo')) {
    if (c.diasMesPasado === 0) return 'No hay registros del mes pasado.';
    return (
      'El mes pasado: ' +
      c.diasMesPasado +
      ' día' +
      (c.diasMesPasado !== 1 ? 's' : '') +
      ' · ' +
      fDur(c.totalMinsMesPasado) +
      ' · ' +
      fCOP(c.totalCOPMesPasado) +
      '.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  COMPARATIVAS
  // ════════════════════════════════════════════════════════════

  // Mes actual vs mes pasado
  if (
    _aiHas(t, 'compar', 'vs', 'versus', 'contra') &&
    (_aiHas(t, 'mes pasad', 'anterior', 'mes previo') || _aiHas(t, 'mes'))
  ) {
    if (c.totalCOPMesPasado === 0) return 'No tengo datos del mes pasado para comparar.';
    var difCOP = c.totalCOP - c.totalCOPMesPasado;
    var tr = _trend(c.totalCOP, c.totalCOPMesPasado);
    var emoji = difCOP >= 0 ? '📈' : '📉';
    return (
      emoji +
      ' **Mes actual vs anterior:**\n• Ingresos: ' +
      fCOP(c.totalCOP) +
      ' vs ' +
      fCOP(c.totalCOPMesPasado) +
      ' (' +
      tr +
      ')\n• Horas: ' +
      fDur(c.totalMins) +
      ' vs ' +
      fDur(c.totalMinsMesPasado) +
      '\n• Días: ' +
      c.diasTrab +
      ' vs ' +
      c.diasMesPasado +
      '\n\n' +
      (difCOP >= 0
        ? 'Vas ' + fCOP(Math.abs(difCOP)) + ' por delante.'
        : 'Vas ' + fCOP(Math.abs(difCOP)) + ' por debajo, aún hay ' + c.diasRestantes + ' días.')
    );
  }

  // Esta semana vs semana pasada
  if (_aiHas(t, 'compar', 'vs') && _aiHas(t, 'semana')) {
    if (c.totalCOPSemPas === 0 && c.totalCOPSemana === 0)
      return 'No tengo registros recientes para comparar semanas.';
    var trS = _trend(c.totalCOPSemana, c.totalCOPSemPas);
    return (
      '📊 **Esta semana vs pasada:**\n• ' +
      fCOP(c.totalCOPSemana) +
      ' vs ' +
      fCOP(c.totalCOPSemPas) +
      ' (' +
      trS +
      ')\n• ' +
      fDur(c.totalMinsSemana) +
      ' vs ' +
      fDur(c.totalMinsSemPas)
    );
  }

  // Mejor que mes pasado?
  if (
    _aiHas(t, 'mejor que', 'peor que', 'superado', 'superar') &&
    _aiHas(t, 'mes pasad', 'anterior')
  ) {
    if (c.totalCOPMesPasado === 0) return 'No hay con qué comparar el mes pasado.';
    if (c.totalCOP > c.totalCOPMesPasado)
      return (
        '✅ Sí, ya vas ' + fCOP(c.totalCOP - c.totalCOPMesPasado) + ' por encima del mes pasado.'
      );
    var lf = c.totalCOPMesPasado - c.totalCOP;
    return (
      '⏳ Te faltan ' +
      fCOP(lf) +
      ' (' +
      (lf / c.vh).toFixed(1) +
      'h aprox.) para igualar el mes pasado. Aún tenés ' +
      c.diasRestantes +
      ' días.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  PREDICCIONES Y SIMULACIONES
  // ════════════════════════════════════════════════════════════

  // Simulación: "si trabajo X horas más"
  if (
    _aiHas(t, 'si trabaj', 'si hago', 'si meto', 'cuanto si', 'cuanto ganaria', 'cuanto gano si') ||
    (_aiNum(t) !== null && _aiHas(t, 'mas', 'adicional', 'sumo', 'agreg'))
  ) {
    var hrs = _aiNum(t);
    if (hrs === null) hrs = 4;
    var addCOP = hrs * c.vh * 1.0; // diurna ord por defecto
    var addNoct = hrs * c.vh * 1.35;
    var addExtra = hrs * c.vh * 1.25;
    var _Da = c.ahora || new Date();
    var addFest = hrs * c.vh * rcFactor('diurnaFest', _Da);
    return (
      'Si trabajas **' +
      hrs +
      'h adicionales** te suman:\n• Diurna ordinaria: ' +
      fCOP(addCOP) +
      '\n• Nocturna ordinaria: ' +
      fCOP(addNoct) +
      '\n• Extra diurna: ' +
      fCOP(addExtra) +
      '\n• Festiva diurna: ' +
      fCOP(addFest) +
      '\n• Festiva nocturna: ' +
      fCOP(hrs * c.vh * rcFactor('noctFest', _Da)) +
      '\n\nTotal mes proyectado con extras diurnas: ' +
      fCOP(c.totalCOP + addExtra)
    );
  }

  // Cuándo llego a la meta. Si la pregunta trae una cifra explícita
  // ("¿cuánto falta para dos millones?") esa es la meta, no el salario.
  if (
    _aiHas(t, 'cuando', 'cuando llego', 'cuanto falt', 'cuantas horas para', 'cuanto para llegar')
  ) {
    var metaPedida = _aiNum(t);
    var metaObj = metaPedida && metaPedida >= 1000 ? metaPedida : c.salario;
    var esSalario = metaObj === c.salario;
    if (c.totalCOP >= metaObj)
      return (
        '✅ Ya superaste ' +
        (esSalario ? 'tu salario base' : 'la meta de ' + fCOP(metaObj)) +
        ' este mes en ' +
        fCOP(c.totalCOP - metaObj) +
        '.'
      );
    if (c.prom <= 0) return 'Aún no tengo suficiente data para estimar cuándo llegas a la meta.';
    var faltaObj = metaObj - c.totalCOP;
    var diasFaltan = Math.ceil(faltaObj / c.prom);
    return (
      'A tu ritmo actual (' +
      fCOP(c.prom) +
      '/turno) necesitas **aproximadamente ' +
      diasFaltan +
      ' turnos más** para llegar a ' +
      fCOP(metaObj) +
      '.\n\nEso equivale a unas ' +
      (c.vh > 0 ? faltaObj / c.vh : 0).toFixed(1) +
      'h al valor hora base (' +
      fCOP(c.vh) +
      '/h).'
    );
  }

  // Mejor caso / peor caso
  if (
    _aiHas(t, 'mejor caso', 'peor caso', 'escenario', 'si todo sale bien', 'optimista', 'pesimista')
  ) {
    var optimista = c.totalCOP + c.diasRestantes * ((c.mejor || {}).cop || 0);
    var pesimista = c.totalCOP + c.diasRestantes * ((c.peor || {}).cop || 0);
    return (
      '🔮 **Escenarios al cierre del mes** (' +
      c.diasRestantes +
      ' días por delante):\n• Optimista (trabajas como tu mejor día): ' +
      fCOP(optimista) +
      '\n• Conservador (ritmo actual): ' +
      fCOP(c.proy) +
      '\n• Mínimo (solo turnos como el peor): ' +
      fCOP(pesimista)
    );
  }

  // Días hábiles / días que faltan
  if (
    _aiHas(
      t,
      'dias restant',
      'dias falta',
      'dias del mes',
      'cuantos dias quedan',
      'dias por delante'
    )
  ) {
    return (
      'Quedan **' +
      c.diasRestantes +
      ' días** del mes (' +
      c.diaActual +
      '/' +
      c.diasMes +
      '). Trabajaste ' +
      c.diasTrab +
      '.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  CORE INTENTS (mejorados)
  // ════════════════════════════════════════════════════════════

  // Total ganado
  if (
    _aiHas(
      t,
      'cuanto gan',
      'cuanto cobr',
      'cuanto llev',
      'cuanto ingr',
      'total ingres',
      'ingreso mes',
      'total mes'
    ) ||
    (_aiHas(t, 'total') && _aiHas(t, 'gan', 'cop', 'plata', 'dinero')) ||
    _aiAll(t, ['cuanto', 'mes'])
  ) {
    return (
      _aiPickPhrase('total') +
      '\n\nEste mes llevas **' +
      fCOP(c.totalCOP) +
      '** brutos, distribuidos así:\n\n' +
      _bdLines(c.bd) +
      '\n\nEso representa el ' +
      c.pctSalario.toFixed(1) +
      '% de tu salario base.\n\n' +
      _aiPickFollowUp('salario')
    );
  }

  // Horas trabajadas
  if (
    _aiHas(
      t,
      'cuantas horas',
      'horas mes',
      'horas llev',
      'tiempo trabajad',
      'tiempo regist',
      'cuanto trabaj'
    ) &&
    !_aiHas(t, 'extra', 'nocturn', 'festiv')
  ) {
    return (
      'Llevas **' +
      fDur(c.totalMins) +
      '** en ' +
      c.diasTrab +
      ' turno' +
      (c.diasTrab !== 1 ? 's' : '') +
      '. Promedio de ' +
      c.promHoras.toFixed(1) +
      'h por turno. La velocidad efectiva real es ' +
      fCOP(c.copPorHoraReal) +
      '/h (vs valor hora base ' +
      fCOP(c.vh) +
      ').'
    );
  }

  // Horas extras
  if (_aiHas(t, 'extra', 'sobretiempo', 'adicional', 'sobrejornad')) {
    if (c.extraMins === 0)
      return (
        'No tenés horas extras este mes. Las extras se generan al superar las **44h semanales** (Ley 2101/2021). Llevás ' +
        fDur(c.totalMinsSemana) +
        ' esta semana.'
      );
    var pctExtra = ((c.extraMins / c.totalMins) * 100).toFixed(0);
    return (
      'Tienes **' +
      fDur(c.extraMins) +
      '** en extras que suman **' +
      fCOP(c.extraCOP) +
      '** (' +
      pctExtra +
      '% de tu tiempo total).\n\nLas extras se reparten así:\n• Extra diurna (+25%): ' +
      fDur(c.bd.extraDiurna.mins) +
      ' · ' +
      fCOP(c.bd.extraDiurna.cop) +
      '\n• Extra nocturna (+75%): ' +
      fDur(c.bd.extraNoct.mins) +
      ' · ' +
      fCOP(c.bd.extraNoct.cop) +
      '\n• Extra fest. diurna (+' +
      Math.round((rcFactor('extraFestDiur', c.ahora || new Date()) - 1) * 100) +
      '%): ' +
      fDur(c.bd.extraFestDiur.mins) +
      ' · ' +
      fCOP(c.bd.extraFestDiur.cop) +
      '\n• Extra fest. nocturna (+' +
      Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
      '%): ' +
      fDur(c.bd.extraFestNoct.mins) +
      ' · ' +
      fCOP(c.bd.extraFestNoct.cop)
    );
  }

  // Preguntas conceptuales sobre recargos dominicales/nocturnos en el sistema clásico.
  // Deben evaluarse antes del bloque "Festivos" que responde con el historial del mes,
  // para evitar que "qué es una hora dominical" caiga en la rama de estadísticas.
  if (
    _aiHas(t, 'dominical', 'domingo', 'nocturn', 'recargo') &&
    _aiHas(
      t,
      'que es',
      'que son',
      'que significa',
      'como funciona',
      'cuanto es',
      'cuanto vale',
      'cuanto pagan',
      'cuanto se paga',
      'cuanto recargo',
      'cual es el recargo',
      'que recargo'
    )
  ) {
    var kRespClas = _aiKnowledgeLookup(q);
    if (kRespClas) return kRespClas;
  }

  // Festivos
  if (_aiHas(t, 'festiv', 'domingo', 'fest') && !_aiHas(t, 'proxim', 'siguient', 'que viene')) {
    if (c.festMins === 0)
      return (
        'Aún no has trabajado en domingos ni festivos este mes.\n\n' +
        (c.proxFests.length > 0
          ? 'Próximo festivo: **' +
            c.proxFests[0].toLocaleDateString('es-CO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            }) +
            '**.'
          : '')
      );
    return (
      'Has trabajado **' +
      fDur(c.festMins) +
      '** en ' +
      c.festTrab.length +
      ' día' +
      (c.festTrab.length !== 1 ? 's' : '') +
      ' festivos · **' +
      fCOP(c.festCOP) +
      '**.\n\nEsos pagan +' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '% (diurna) o +' +
      Math.round((rcFactor('noctFest', c.ahora || new Date()) - 1) * 100) +
      '% (nocturna). Si fueran extras, +' +
      Math.round((rcFactor('extraFestDiur', c.ahora || new Date()) - 1) * 100) +
      '% / +' +
      Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
      '%.'
    );
  }

  // Nocturnas
  if (_aiHas(t, 'nocturn', 'noche', 'noct', 'madrugad', '21', '3am', 'de noche')) {
    if (c.nocturnasMins === 0)
      return (
        'No has trabajado horas nocturnas este mes. El recargo nocturno aplica de **' +
        (getInicioNocturno(c.ahora || new Date()) === 19 ? '7pm' : '9pm') +
        ' a 6am**.'
      );
    var pctN = ((c.nocturnasMins / c.totalMins) * 100).toFixed(0);
    return (
      'Tienes **' +
      fDur(c.nocturnasMins) +
      '** nocturnas (' +
      pctN +
      '% de tu tiempo) · **' +
      fCOP(c.nocturnasCOP) +
      '**.\n\nEstas horas tienen recargo del **+35% mínimo** (ordinaria) hasta **+' +
      Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
      '%** (extra festiva nocturna).'
    );
  }

  // Mejor día
  if (_aiHas(t, 'mejor dia', 'mejor día', 'dia max', 'mas gane', 'top dia') && c.mejor) {
    return (
      '🏆 Tu mejor día fue el **' +
      _fechaLarga(c.mejor.fecha) +
      '** con **' +
      fCOP(c.mejor.cop) +
      '** en ' +
      fDur(c.mejor.mins) +
      '.' +
      (c.mejor.fest ? ' (Fue festivo, por eso pagó tan bien)' : '')
    );
  }

  // Peor día
  if (
    _aiHas(
      t,
      'peor dia',
      'peor día',
      'dia min',
      'menos gane',
      'dia mas bajo',
      'dia mas corto productiv'
    ) &&
    c.peor
  ) {
    return (
      'Tu día más bajo fue el **' +
      _fechaLarga(c.peor.fecha) +
      '** con ' +
      fCOP(c.peor.cop) +
      ' en ' +
      fDur(c.peor.mins) +
      '. Cada día cuenta. 💪'
    );
  }

  // Promedio
  if (_aiHas(t, 'promedio', 'media', 'promedi', 'prom diario', 'prom turno')) {
    return (
      'Promedio por turno: **' +
      fCOP(c.prom) +
      '** · **' +
      c.promHoras.toFixed(1) +
      'h**.\nVelocidad efectiva (COP/hora real): **' +
      fCOP(c.copPorHoraReal) +
      '/h**.'
    );
  }

  // Proyección
  if (
    _aiHas(
      t,
      'proyecc',
      'ritmo',
      'al cierr',
      'fin de mes',
      'fin mes',
      'cuanto llegar',
      'cuanto cierr',
      'estim',
      'prono'
    )
  ) {
    return (
      'A tu ritmo actual (' +
      fCOP(c.prom) +
      '/turno · ' +
      c.diasTrab +
      ' turnos en ' +
      c.diaActual +
      ' días) podrías cerrar el mes en **' +
      fCOP(c.proy) +
      '**.\n\n' +
      (c.proy >= c.salario
        ? '✅ Eso superaría tu salario base en ' + fCOP(c.proy - c.salario)
        : '⏳ Te faltarían ' + fCOP(c.salario - c.proy) + ' para llegar al salario base.')
    );
  }

  // Salario / Meta
  if (_aiHas(t, 'salario', 'meta', 'base', 'sueldo', 'objetivo')) {
    return (
      'Salario base: **' +
      fCOP(c.salario) +
      '** · valor hora **' +
      fCOP(c.vh) +
      '**.\nLlevas ' +
      fCOP(c.totalCOP) +
      ' (' +
      c.pctSalario.toFixed(1) +
      '%) · te faltan **' +
      fCOP(c.falta) +
      '** (' +
      c.horasParaMeta.toFixed(1) +
      'h al valor base).'
    );
  }

  // Días trabajados
  if (_aiHas(t, 'cuantos dias', 'cuantos turn', 'dias trab', 'turnos llev')) {
    return (
      'Has trabajado **' +
      c.diasTrab +
      ' día' +
      (c.diasTrab !== 1 ? 's' : '') +
      '** (' +
      c.turnosMes.length +
      ' turnos) este mes. Quedan **' +
      c.diasRestantes +
      ' días** por delante.\n\nRacha actual: **' +
      c.rachaActual +
      ' día' +
      (c.rachaActual !== 1 ? 's' : '') +
      ' consecutivo' +
      (c.rachaActual !== 1 ? 's' : '') +
      '**.'
    );
  }

  // Recargos legales
  if (
    _aiHas(
      t,
      'recarg',
      'porcentaje',
      'por que paga',
      'como calcul',
      'ley',
      'ley 2101',
      'jornada legal'
    ) &&
    !_aiHas(t, 'extra', 'noctur', 'jornada nocturn')
  ) {
    var _Dt = c.ahora || new Date();
    var _nd = getInicioNocturno(_Dt) === 19 ? '7pm' : '9pm';
    var _pf = function (rk) {
      return Math.round((rcFactor(rk, _Dt) - 1) * 100);
    };
    var _ff = function (rk) {
      return rcFactor(rk, _Dt).toFixed(2);
    };
    return (
      '⚖️ **Recargos vigentes (Colombia, Ley 2466/2025)** · factores sobre valor hora base (' +
      fCOP(c.vh) +
      '):\n\n• Diurna ord. (6am-' +
      _nd +
      ') = ×1.00\n• Nocturna ord. (' +
      _nd +
      '-6am) = ×1.35 (+35%)\n• Festiva diurna = ×' +
      _ff('diurnaFest') +
      ' (+' +
      _pf('diurnaFest') +
      '%)\n• Festiva nocturna = ×' +
      _ff('noctFest') +
      ' (+' +
      _pf('noctFest') +
      '%)\n• Extra diurna = ×1.25 (+25%)\n• Extra nocturna = ×1.75 (+75%)\n• Extra fest. diurna = ×' +
      _ff('extraFestDiur') +
      ' (+' +
      _pf('extraFestDiur') +
      '%)\n• Extra fest. nocturna = ×' +
      _ff('extraFestNoct') +
      ' (+' +
      _pf('extraFestNoct') +
      '%)\n\nEl recargo dominical/festivo sube por fases (80→90→100% entre 2025 y 2027).\n\n**Las extras** arrancan al superar ' +
      getHSEM(_Dt) +
      'h semanales (jornada máxima legal, Ley 2101/2021).'
    );
  }

  // Jornada nocturna legal
  if (_aiHas(t, 'jornada nocturn', 'que es nocturn', 'horario nocturn', 'desde que hora nocturn')) {
    var _ndh = getInicioNocturno(c.ahora || new Date()) === 19 ? '7:00pm' : '9:00pm';
    return (
      'La **jornada nocturna** en Colombia va de **' +
      _ndh +
      ' a 6:00am**. Cualquier minuto trabajado en esa franja recibe recargo del **+35%** sobre el valor hora base. La Ley 2466/2025 (Art. 5) movió el inicio de las 9 PM a las 7 PM desde el 25-dic-2025.'
    );
  }

  // Qué cuenta como hora extra
  if (_aiHas(t, 'que es extra', 'cuando es extra', 'desde cuando extra', 'que cuenta como extra')) {
    var _hsem = getHSEM(c.ahora || new Date());
    var _Dx = c.ahora || new Date();
    var _exd = Math.round((rcFactor('extraFestDiur', _Dx) - 1) * 100);
    var _exn = Math.round((rcFactor('extraFestNoct', _Dx) - 1) * 100);
    return (
      'Las **horas extras** son las que superan la **jornada máxima legal de ' +
      _hsem +
      'h semanales** (Ley 2101/2021, que la reduce por fases). Mi motor las suma por semana (lunes a domingo) y todo lo que pase de ' +
      _hsem +
      'h se cuenta como extra. El recargo varía: +25% diurna, +75% nocturna, +' +
      _exd +
      '% festiva diurna, +' +
      _exn +
      '% festiva nocturna.'
    );
  }

  // Máximo legal de horas
  if (
    _aiHas(
      t,
      'maximo legal',
      'jornada maxima',
      'horas maxim',
      'cuantas horas semana',
      'cuanto puedo trabaj'
    )
  ) {
    return (
      'Jornada máxima legal: **46h semanales** (Ley 2101/2021). Esta semana llevas ' +
      fDur(c.totalMinsSemana) +
      ' de ' +
      fDur(46 * 60) +
      '.\n\nTodo lo que pase de 46h se paga como **hora extra** con sus respectivos recargos.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  PATRONES / ESTADÍSTICAS
  // ════════════════════════════════════════════════════════════

  // Día de la semana más rentable
  if (
    _aiHas(
      t,
      'dia de la semana',
      'que dia gano mas',
      'que dia mejor',
      'dia mas product',
      'dia mas rent'
    )
  ) {
    if (c.dowCount[c.bestDow] === 0) return 'Aún no tengo datos suficientes por día de semana.';
    var best = _DOW[c.bestDow],
      worst = _DOW[c.worstDow];
    return (
      '📅 **Patrón semanal:**\n• Mejor día: **' +
      best +
      '** (' +
      fCOP(c.dowCOP[c.bestDow]) +
      ' acumulado · ' +
      c.dowCount[c.bestDow] +
      ' veces)\n• Día más bajo: ' +
      worst +
      ' (' +
      fCOP(c.dowCOP[c.worstDow]) +
      ')\n\nDistribución:\n' +
      _DOW
        .map(function (d, i) {
          return (
            '• ' +
            d +
            ': ' +
            (c.dowCount[i] > 0 ? fCOP(c.dowCOP[i]) + ' · ' + c.dowCount[i] + '×' : 'sin registros')
          );
        })
        .join('\n')
    );
  }

  // Turno más largo
  if (_aiHas(t, 'turno mas largo', 'jornada larga', 'turno mas extens', 'dia mas largo')) {
    if (!c.tLargo) return 'Aún no tenés turnos cerrados este mes.';
    var dt = new Date(c.tLargo.t.inicio);
    return (
      'Tu turno más largo del mes fue el **' +
      dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) +
      '** con **' +
      fDur(c.tLargo.dur) +
      '**. ' +
      (c.tLargo.dur > 720 ? '⚠️ Más de 12h: cuídate y respeta los descansos.' : '')
    );
  }

  // Turno más corto
  if (_aiHas(t, 'turno mas corto', 'turno mas breve', 'jornada corta')) {
    if (!c.tCorto) return 'Aún no tenés turnos cerrados.';
    var dtc = new Date(c.tCorto.t.inicio);
    return (
      'Tu turno más corto fue el **' +
      dtc.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) +
      '** con ' +
      fDur(c.tCorto.dur) +
      '.'
    );
  }

  // Velocidad / COP por hora
  if (_aiHas(t, 'velocid', 'cop por hora', 'copporhora', 'cop/h', 'valor real', 'plata por hora')) {
    return (
      'Velocidad efectiva: **' +
      fCOP(c.copPorHoraReal) +
      '/h** (vs valor hora base ' +
      fCOP(c.vh) +
      ').\n\nDiferencia: ' +
      (c.copPorHoraReal > c.vh
        ? '+' +
          fCOP(c.copPorHoraReal - c.vh) +
          ' por encima del base — los recargos están sumando bien.'
        : 'aún por debajo del base, normal si llevas pocas horas con recargo.')
    );
  }

  // Racha
  if (_aiHas(t, 'racha', 'dias seguidos', 'dias consecut', 'sin descansar')) {
    if (c.rachaActual <= 1)
      return (
        'No tenés racha activa. Tu última jornada fue ' +
        (c.rachaActual === 1 ? 'hoy.' : 'hace más de un día.')
      );
    return (
      '🔥 Llevas **' +
      c.rachaActual +
      ' días consecutivos** trabajando. ' +
      (c.rachaActual >= 6 ? '⚠️ Considera un día de descanso pronto.' : '¡Muy buen ritmo!')
    );
  }

  // Distribución porcentual / "donde se va mi tiempo"
  if (
    _aiHas(
      t,
      'distribuci',
      'porcentaje recarg',
      'donde va',
      'desglose',
      'porcent tiempo',
      'por categ'
    )
  ) {
    var lines = Object.keys(c.bd)
      .filter(function (k) {
        return c.bd[k].mins > 0;
      })
      .map(function (k) {
        var pctM = ((c.bd[k].mins / c.totalMins) * 100).toFixed(1);
        var pctC = ((c.bd[k].cop / c.totalCOP) * 100).toFixed(1);
        return '• ' + RC[k].label + ': ' + pctM + '% tiempo · ' + pctC + '% ingreso';
      })
      .join('\n');
    return (
      '📊 **Distribución porcentual:**\n\n' +
      lines +
      '\n\nNocturnas + festivas + extras representan el ' +
      (
        ((c.nocturnasMins +
          c.festMins +
          c.extraMins -
          c.bd.noctFest.mins -
          c.bd.extraNoct.mins -
          c.bd.extraFestNoct.mins) /
          c.totalMins) *
        100
      ).toFixed(0) +
      '% del tiempo pero pagan mucho más por su recargo.'
    );
  }

  // Diurna vs nocturna comparativa
  if (_aiAll(t, ['diurn', 'noctur']) || _aiHas(t, 'gano mas de dia', 'gano mas de noche')) {
    var copDia =
      c.diurnaOrdCOP + c.bd.diurnaFest.cop + c.bd.extraDiurna.cop + c.bd.extraFestDiur.cop;
    var copNoche = c.nocturnasCOP;
    return (
      '☀ Diurnas: ' +
      fCOP(copDia) +
      '\n☾ Nocturnas: ' +
      fCOP(copNoche) +
      '\n\n' +
      (copNoche > copDia
        ? 'Estás ganando más en la **noche** este mes. El recargo +35% pega fuerte.'
        : 'Las diurnas dominan tus ingresos. Pero un par de turnos nocturnos suben rápido por el +35%.')
    );
  }

  // ════════════════════════════════════════════════════════════
  //  PRÓXIMOS FESTIVOS
  // ════════════════════════════════════════════════════════════

  if (_aiHas(t, 'proxim', 'siguient', 'que viene', 'prox') && _aiHas(t, 'festiv', 'fest')) {
    if (c.proxFests.length === 0) return 'No quedan festivos en lo que resta del año.';
    var lf = c.proxFests
      .slice(0, 3)
      .map(function (d) {
        var dias = Math.ceil((d - c.ahora) / (1000 * 60 * 60 * 24));
        return (
          '• **' +
          d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) +
          '** (en ' +
          dias +
          ' día' +
          (dias !== 1 ? 's' : '') +
          ')'
        );
      })
      .join('\n');
    return (
      '📅 **Próximos festivos:**\n\n' +
      lf +
      '\n\nEn festivos el recargo arranca en +' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '% (diurna). Si además son nocturnos o extras, puede llegar a +' +
      Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
      '%.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  OPTIMIZACIÓN / RECOMENDACIONES
  // ════════════════════════════════════════════════════════════

  // Qué jornada me conviene
  if (
    _aiHas(
      t,
      'que jornada conviene',
      'jornada mas rent',
      'jornada paga mas',
      'cual paga mas',
      'mas rentable'
    )
  ) {
    var _Dr = c.ahora || new Date();
    var _rf = function (rk) {
      return rcFactor(rk, _Dr);
    };
    var _rp = function (rk) {
      return Math.round((rcFactor(rk, _Dr) - 1) * 100);
    };
    return (
      '💰 **Ranking de rentabilidad** (sobre tu valor hora ' +
      fCOP(c.vh) +
      '):\n\n1️⃣ Extra fest. nocturna: ' +
      fCOP(c.vh * _rf('extraFestNoct')) +
      '/h (+' +
      _rp('extraFestNoct') +
      '%)\n2️⃣ Festiva nocturna: ' +
      fCOP(c.vh * _rf('noctFest')) +
      '/h (+' +
      _rp('noctFest') +
      '%)\n3️⃣ Extra fest. diurna: ' +
      fCOP(c.vh * _rf('extraFestDiur')) +
      '/h (+' +
      _rp('extraFestDiur') +
      '%)\n4️⃣ Festiva diurna: ' +
      fCOP(c.vh * _rf('diurnaFest')) +
      '/h (+' +
      _rp('diurnaFest') +
      '%)\n5️⃣ Extra nocturna: ' +
      fCOP(c.vh * 1.75) +
      '/h (+75%)\n6️⃣ Nocturna ordinaria: ' +
      fCOP(c.vh * 1.35) +
      '/h (+35%)\n7️⃣ Extra diurna: ' +
      fCOP(c.vh * 1.25) +
      '/h (+25%)\n8️⃣ Diurna ordinaria: ' +
      fCOP(c.vh) +
      '/h\n\n👉 Un turno **nocturno en festivo** paga **' +
      _rf('noctFest').toFixed(2) +
      '×** un turno diurno normal.'
    );
  }

  // ¿Debería tomar extras?
  if (_aiHas(t, 'debo tomar extra', 'conviene extra', 'vale la pena extra', 'hago extras')) {
    if (c.totalMinsSemana < 46 * 60) {
      var faltaPara46 = 46 * 60 - c.totalMinsSemana;
      return (
        'Esta semana llevas ' +
        fDur(c.totalMinsSemana) +
        '. Te faltan **' +
        fDur(faltaPara46) +
        '** para llegar al límite de 46h. Hasta ese punto trabajas como ordinaria. Después, **toda hora vale +25% mínimo**.'
      );
    }
    return 'Esta semana ya superaste las 46h, así que cada hora extra se está pagando con recargo (+25% mín). Cuídate del cansancio igual.';
  }

  // Descanso / fatiga. Validar SIEMPRE lo que siente la persona antes
  // de dar el dato — decir "vas bien" a alguien que dice "estoy agotado"
  // es tono-sordo. Usar racha, horas semanales y estado de bienestar.
  if (
    _aiHas(
      t,
      'descanso',
      'descansar',
      'cuanto descanso',
      'necesito descans',
      'fatig',
      'cansad',
      'agotad'
    )
  ) {
    var _hrsSem = Math.round(c.hrsSemanales || 0);
    if (c.rachaActual >= 6) {
      return (
        '🤝 Te entiendo, y los números te dan la razón: llevás **' +
        c.rachaActual +
        ' días seguidos** trabajando. La ley te respalda — tenés derecho a un día de descanso cada 6 días. Tomate **un día completo** esta semana; no es un lujo, es tu derecho.'
      );
    }
    if (c.estadoBienestar === 'critico') {
      return (
        '🤝 Paremos un segundo. Venís fuerte (' +
        _hrsSem +
        'h esta semana' +
        (c.alertaTurnoLargo ? ' y un turno largo en curso' : '') +
        ') y eso pasa factura. Asegurá un descanso real antes de seguir — rendís más descansado que al límite.'
      );
    }
    if (c.estadoBienestar === 'cansado') {
      return (
        '🤝 Te escucho. Vas en **' +
        _hrsSem +
        'h esta semana**, por encima del ritmo cómodo. Un día libre o un par de turnos más cortos te van a caer bien.'
      );
    }
    if (c.tLargo && c.tLargo.dur >= 720) {
      return (
        '🤝 Te entiendo. Tu jornada más larga del mes fue de ' +
        fDur(c.tLargo.dur) +
        '. Después de un turno así, el descanso no se negocia. Asegurá al menos 8h antes del próximo.'
      );
    }
    return (
      '🤝 Te escucho — el cansancio es real aunque los números muestren margen (' +
      (c.rachaActual || 0) +
      ' días de racha, ' +
      _hrsSem +
      'h esta semana). Cuidate: mínimo 8h entre turnos y al menos 1 día libre por semana. Si querés, miramos tu carga.'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  AYUDA APP
  // ════════════════════════════════════════════════════════════

  if (
    _aiHas(
      t,
      'como registr',
      'como iniciar turno',
      'como uso',
      'como funciona',
      'como inicio',
      'iniciar turno'
    )
  ) {
    return '✦ **Cómo usar Mi Turno:**\n1. Tab **Inicio** → toca el botón **Iniciar** para arrancar un turno.\n2. El cronómetro corre en tiempo real con cálculo de recargos.\n3. Toca **Parar** al terminar — se guarda en tu historial.\n4. Tab **Análisis** ve tu desempeño · Tab **Historial** exporta a PDF/Excel.';
  }
  if (_aiHas(t, 'como export', 'exportar pdf', 'exportar excel', 'generar reporte')) {
    return 'Tab **Historial** (icono reloj) → en la parte superior tenés **Exportar PDF** y **Exportar Excel**. Generan reportes mensuales con desglose por recargo, firmados con tu cuenta.';
  }
  if (_aiHas(t, 'como cambio salario', 'cambiar salario', 'editar salario', 'configur salario')) {
    return 'Tab **Ajustes** (engranaje) → toca el campo de **Salario base** y escribe el nuevo valor. Se aplica al instante a todos los cálculos.';
  }

  // ════════════════════════════════════════════════════════════
  //  RESUMEN EJECUTIVO
  // ════════════════════════════════════════════════════════════

  if (_aiHas(t, 'resumen', 'analisis', 'como voy', 'panorama', 'estado', 'dame todo', 'reporte')) {
    var tip = '';
    if (c.pctSalario >= 100) tip = '\n\n💪 Ya superaste tu salario base este mes.';
    else if (c.pctSalario >= 80) tip = '\n\n📈 Vas muy bien, cerca de la meta mensual.';
    else if (c.pctSalario >= 50) tip = '\n\n⚖️ Vas a buen ritmo, mitad de mes ideal.';
    else if (c.diaActual > 15) tip = '\n\n⚡ Vas un poco atrás, aprovecha festivos y nocturnas.';
    else tip = '\n\n📅 Aún estás en la primera mitad del mes.';
    var rachaLine =
      c.rachaActual > 0
        ? '\n• Racha: ' +
          c.rachaActual +
          ' día' +
          (c.rachaActual !== 1 ? 's' : '') +
          ' seguido' +
          (c.rachaActual !== 1 ? 's' : '')
        : '';
    var compLine = '';
    if (c.totalCOPMesPasado > 0) {
      compLine = '\n• vs mes pasado: ' + _trend(c.totalCOP, c.totalCOPMesPasado);
    }
    return (
      _aiPickPhrase('total') +
      '\n\n📋 **Resumen ejecutivo:**\n\n• ' +
      c.diasTrab +
      ' turnos · ' +
      fDur(c.totalMins) +
      '\n• Ingreso bruto: ' +
      fCOP(c.totalCOP) +
      '\n• Promedio por turno: ' +
      fCOP(c.prom) +
      '\n• Proyección al cierre: ' +
      fCOP(c.proy) +
      '\n• Avance vs salario base: ' +
      c.pctSalario.toFixed(1) +
      '%' +
      rachaLine +
      compLine +
      tip +
      '\n\n' +
      _aiPickFollowUp('resumen')
    );
  }

  // ════════════════════════════════════════════════════════════
  //  COMPOSICIÓN DE CORREO (acción real, no solo texto)
  // ════════════════════════════════════════════════════════════

  if (_aiIsEmailIntent(t)) {
    var emailAction = _aiBuildEmail(question, t, c, state);
    return {
      text: emailAction.preview,
      action: { type: 'email_compose', data: emailAction.data }
    };
  }

  // ════════════════════════════════════════════════════════════
  //  CAPTADOR DE SEÑALES MULTI-DOMINIO (pensar con lo que ya hay)
  // ════════════════════════════════════════════════════════════
  // El colombiano habla rarísimo: no alcanza con cargar frase por frase.
  // Cuando el clasificador no se decidió, _aiSignalRoute infiere el DOMINIO
  // por señales (plata, legal, bienestar, ayuda, tiempo) — no por frases
  // exactas — y devuelve un intent que un handler EXISTENTE ya sabe
  // responder (o 'HELP' para aiHelpAnswer). No agrega conocimiento: orquesta
  // los 28 módulos que ya hay antes de rendirse al fallback genérico.
  if (!_esSlash) {
    var _sig = _aiSignalRoute(t, _entities);
    if (_sig === 'HELP') {
      var _helpResp = _aiHelpLookup(q);
      if (_helpResp) return _helpResp;
      _sig = 'capacidades';
    }
    if (_sig) {
      var _sigTopic = typeof _aiIntentTopic === 'function' ? _aiIntentTopic(_sig) : 'general';
      var _sigResp = _aiDispatchNLP(_sig, c, state, q, t);
      if (_sigResp) {
        if (typeof aiUpdateConversation === 'function') aiUpdateConversation(_sig, _sigTopic);
        if (typeof aiEnhancedRespond === 'function') {
          var _sigEnriched = aiEnhancedRespond(
            _sigResp,
            _sig,
            _sigTopic,
            q,
            c,
            null,
            state.turnosAll
          );
          if (_sigEnriched && _sigEnriched.text) return _sigEnriched;
        }
        return _sigResp;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  DESAMBIGUACIÓN: confianza media → proponer interpretaciones
  // ════════════════════════════════════════════════════════════
  // En vez del fallback genérico, ofrecer las 2 lecturas más probables
  // del clasificador como chips tocables. El usuario confirma con un tap.

  if (
    _nlp &&
    _nlp.intent &&
    _nlp.intent !== 'contexto' &&
    _nlp.confidence >= 0.2 &&
    _nlp.confidence < 0.5
  ) {
    var _sug1 = _aiIntentSuggestion(_nlp.intent);
    var _sug2 =
      _nlp.secondIntent && _nlp.secondIntent !== _nlp.intent
        ? _aiIntentSuggestion(_nlp.secondIntent)
        : null;
    if (_sug1) {
      var _disActions = [{ label: _sug1.label, query: _sug1.query }];
      if (_sug2) _disActions.push({ label: _sug2.label, query: _sug2.query });
      _disActions.push({ label: 'Ver todo lo que sé hacer', query: '/ayuda' });
      return {
        text: 'No estoy 100% seguro de qué necesitás, pero creo que vas por acá. ¿Cuál se acerca más?',
        actions: _disActions
      };
    }
  }

  // ════════════════════════════════════════════════════════════
  //  FALLBACK
  // ════════════════════════════════════════════════════════════

  var _fallbackText =
    '🤔 No estoy seguro de qué buscas. Algunas cosas que puedo responder:\n\n• "¿Cuánto gané hoy?" · "¿Y ayer?"\n• "Compara con mes pasado"\n• "¿Cuándo llego a la meta?"\n• "¿Cuánto si trabajo 4h más?"\n• "Mejor día de la semana"\n• "Próximos festivos"\n• "Mi racha"\n• **"Envía mi reporte por correo a juan@empresa.com"**\n• **"Redacta un correo formal para mi jefe"**\n\n💡 O simplemente pregúntame algo con tus palabras, ¡soy más conversacional ahora!\n\n' +
    _aiPickFollowUp('default');

  // Envolver con aiEnhancedRespond para que el fallback tenga chips funcionales
  if (typeof aiEnhancedRespond === 'function') {
    var _fallbackEnriched = aiEnhancedRespond(
      _fallbackText,
      'default',
      'general',
      q,
      c,
      null,
      state.turnosAll
    );
    if (_fallbackEnriched && _fallbackEnriched.text) return _fallbackEnriched;
  }
  return _fallbackText;
}

// ─── MEMORIA DE TEMA ──────────────────────────────────────────
// La cascada clásica responde sin pasar por aiUpdateConversation, así
// que el tema actual quedaba congelado en el último intent del NLP.
// Este wrapper garantiza que CADA respuesta deje registrado de qué se
// habló: si el turno terminó sin actualizar la conversación, usa la
// mejor clasificación disponible (aunque no haya alcanzado el umbral).
function aiAnswer(question, state) {
  var _turnosAntes = null;
  try {
    if (typeof aiGetConversation === 'function') {
      _turnosAntes = aiGetConversation().turnCount;
    }
  } catch (_) {}

  var _dbg = typeof window !== 'undefined' && window.MT_AI_DEBUG === true;
  var _t0 = _dbg
    ? typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()
    : 0;

  var resp = _aiAnswerCore(question, state);

  try {
    var _conv = typeof aiGetConversation === 'function' ? aiGetConversation() : null;
    if (
      _conv &&
      _turnosAntes !== null &&
      _conv.turnCount === _turnosAntes &&
      _aiLastNlp &&
      _aiLastNlp.intent &&
      _aiLastNlp.intent !== 'contexto' &&
      _aiLastNlp.confidence >= 0.25 &&
      typeof aiUpdateConversation === 'function'
    ) {
      aiUpdateConversation(_aiLastNlp.intent, _aiLastNlp.topic);
    }
  } catch (_) {}

  // Pulido final de la voz: varía léxico y calibra el tono (no empalagoso).
  // Se aplica una sola vez, acá, para cubrir todas las rutas de respuesta.
  // _aiAnswerCore puede devolver una Promise (pipeline del agente): en ese caso
  // se resuelve antes de pulir para no aplicar aiHumanizar sobre el objeto Promise.
  var _truth = state && state.calc ? state.calc : null;
  // Guard defensivo: "Procesando acción..." es un placeholder INTERNO de las
  // acciones del agente — jamás debe llegar al chat. Si una acción no adjuntó
  // su texto final (execute), lo limpiamos antes de pulir.
  var _stripPlaceholder = function (s) {
    if (typeof s !== 'string') return s;
    var out = s.replace(/Procesando acci[oó]n\.\.\.\s*/gi, '').trim();
    return out || 'Decime con tus palabras qué necesitás y lo resuelvo. 🙂';
  };
  var _polish = function (r) {
    try {
      if (r) {
        if (typeof r === 'string') {
          r = _stripPlaceholder(r);
          if (typeof aiHumanizar === 'function') r = aiHumanizar(r);
          if (typeof aiReferring === 'function') r = aiReferring(r);
          if (typeof aiFocusClose === 'function') r = aiFocusClose(r);
          if (typeof aiVerifyNumbers === 'function') r = aiVerifyNumbers(r, _truth);
        } else if (r.text && !r.execute) {
          // Si trae execute, el placeholder es legítimo (la UI ejecuta la acción).
          r.text = _stripPlaceholder(r.text);
          if (typeof aiHumanizar === 'function') r.text = aiHumanizar(r.text);
          if (typeof aiReferring === 'function') r.text = aiReferring(r.text);
          if (typeof aiFocusClose === 'function') r.text = aiFocusClose(r.text);
          if (typeof aiVerifyNumbers === 'function') r.text = aiVerifyNumbers(r.text, _truth);
        } else if (r.text) {
          if (typeof aiHumanizar === 'function') r.text = aiHumanizar(r.text);
          if (typeof aiReferring === 'function') r.text = aiReferring(r.text);
          if (typeof aiFocusClose === 'function') r.text = aiFocusClose(r.text);
          if (typeof aiVerifyNumbers === 'function') r.text = aiVerifyNumbers(r.text, _truth);
        }
      }
    } catch (_) {}
    return r;
  };

  // Trazabilidad opt-in: registra el "porqué" sin tocar la respuesta.
  var _recordTrace = function (finalResp, isAsync) {
    if (!_dbg) return finalResp;
    try {
      var _now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      var _kind = finalResp && typeof finalResp === 'object' ? 'object' : 'string';
      var _txt = _kind === 'object' ? finalResp.text || '' : finalResp || '';
      var _nlp = _aiLastNlp || {};
      var _ent = null;
      try {
        _ent = typeof aiExtractEntities === 'function' ? aiExtractEntities(question) : null;
      } catch (_e) {}
      var _spec = typeof aiIntentSpec === 'function' ? aiIntentSpec(_nlp.intent) : null;
      _aiLastTrace = {
        question: question,
        normalized: typeof _aiNorm === 'function' ? _aiNorm(question) : null,
        intent: _nlp.intent || null,
        confidence: typeof _nlp.confidence === 'number' ? _nlp.confidence : null,
        candidates: [
          { intent: _nlp.intent || null, score: _nlp.score || null },
          { intent: _nlp.secondIntent || null, score: null }
        ],
        margin: typeof _nlp.margin === 'number' ? _nlp.margin : null,
        // Ruta declarada en el registry para el intent clasificado (referencia;
        // NO necesariamente el guard de la cascada que respondió — ver §6 del mapa).
        registryRoute: _spec ? _spec.route : null,
        domain: _spec ? _spec.domain : null,
        agentPath: !!isAsync,
        durationMs: Math.round((_now - _t0) * 100) / 100,
        responseKind: _kind,
        hasCard: !!(finalResp && finalResp.card),
        hasActions: !!(finalResp && finalResp.actions && finalResp.actions.length),
        entities: _ent,
        usedRealData: /\$\s?\d/.test(_txt),
        turn: _aiTurnCounter
      };
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[MT_AI_DEBUG]', _aiLastTrace);
      }
    } catch (_) {}
    return finalResp;
  };

  if (resp && typeof resp.then === 'function') {
    return resp.then(function (r) {
      return _recordTrace(_polish(r), true);
    });
  }
  return _recordTrace(_polish(resp), false);
}

// ════════════════════════════════════════════════════════════════
//  COMPOSICIÓN DE EMAIL · detección y plantillas
// ════════════════════════════════════════════════════════════════

function _aiIsEmailIntent(t) {
  // Verbo de envío
  var hasVerbo = _aiHas(
    t,
    'enviar',
    'envia',
    'envía',
    'manda',
    'mandar',
    'mandame',
    'envíame',
    'enviame',
    'redacta',
    'redactar',
    'compon',
    'componer',
    'escribe un',
    'escribir un'
  );
  // Sustantivo
  var hasSust = _aiHas(
    t,
    'correo',
    'email',
    'mail',
    'mensaje',
    'reporte por correo',
    'reporte al mail'
  );
  return hasVerbo && hasSust;
}

function _aiBuildEmail(raw, t, c, state) {
  // ── Destinatario ──
  var emailMatch = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  var to = emailMatch ? emailMatch[0].toLowerCase() : '';
  if (!to && state.session && state.session.email) to = state.session.email;
  if (!to && _aiHas(t, 'mi correo', 'mi email', 'a mi', 'para mi', 'mi propio')) {
    to = (state.session && state.session.email) || '';
  }

  // ── Formato ──
  var format = _aiHas(t, 'excel', 'xlsx', 'xls', 'hoja', 'spreadsheet', 'planilla')
    ? 'xlsx'
    : 'pdf';

  // ── Adjuntar reporte ──
  var attach = !_aiHas(
    t,
    'sin adjunto',
    'sin archivo',
    'sin pdf',
    'sin reporte',
    'solo texto',
    'sin anex'
  );

  // ── Tipo de email (define plantilla) ──
  var tipo = 'resumen';
  if (
    _aiHas(
      t,
      'jefe',
      'supervisor',
      'rrhh',
      'empleador',
      'patron',
      'recursos humanos',
      'gerente',
      'jefa',
      'contador'
    )
  )
    tipo = 'formal';
  if (_aiHas(t, 'extra', 'sobretiempo')) tipo = 'extras';
  if (_aiHas(t, 'festiv', 'domingo')) tipo = 'festivos';
  if (_aiHas(t, 'nocturn', 'noche')) tipo = 'nocturnas';
  if (_aiHas(t, 'reporte', 'informe', 'completo', 'detallad')) tipo = 'reporte';
  if (_aiHas(t, 'justific', 'explic')) tipo = 'justificacion';

  var mesNombre = c.ahora.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  var mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  var subject = '',
    body = '';

  if (tipo === 'formal') {
    subject = 'Reporte de turnos · ' + mesCap;
    body =
      'Buenos días,\n\n' +
      'Adjunto mi reporte oficial de turnos correspondiente a ' +
      mesNombre +
      '.\n\n' +
      'Resumen ejecutivo:\n' +
      '• Días trabajados: ' +
      c.diasTrab +
      ' (' +
      c.turnosMes.length +
      ' turnos)\n' +
      '• Total de horas: ' +
      fDur(c.totalMins) +
      '\n' +
      '• Horas extras: ' +
      fDur(c.extraMins) +
      (c.extraMins > 0 ? ' · ' + fCOP(c.extraCOP) : '') +
      '\n' +
      '• Horas festivas: ' +
      fDur(c.festMins) +
      (c.festMins > 0 ? ' · ' + fCOP(c.festCOP) : '') +
      '\n' +
      '• Horas nocturnas: ' +
      fDur(c.nocturnasMins) +
      (c.nocturnasMins > 0 ? ' · ' + fCOP(c.nocturnasCOP) : '') +
      '\n\n' +
      'El detalle completo día por día, con los recargos calculados según la Ley 2101 de 2021 y el CST (Arts. 168-171), ' +
      'se encuentra en el archivo adjunto.\n\n' +
      'Quedo atento a cualquier consulta o ajuste.\n\n' +
      'Cordialmente.';
  } else if (tipo === 'extras') {
    var lineasExt =
      Object.keys(c.bd)
        .filter(function (k) {
          return c.bd[k].mins > 0 && k.indexOf('extra') === 0;
        })
        .map(function (k) {
          return '• ' + RC[k].label + ': ' + fDur(c.bd[k].mins) + ' · ' + fCOP(c.bd[k].cop);
        })
        .join('\n') || '• Sin horas extras en este período.';
    subject = 'Detalle de horas extras · ' + mesCap;
    body =
      'Buenas tardes,\n\n' +
      'Comparto el detalle de mis horas extras del mes de ' +
      mesNombre +
      ':\n\n' +
      lineasExt +
      '\n\n' +
      'Total extras: ' +
      fDur(c.extraMins) +
      ' · ' +
      fCOP(c.extraCOP) +
      '\n\n' +
      'Recuerdo que las horas extras se generan al superar las ' +
      getHSEM(c.ahora || new Date()) +
      ' horas semanales (jornada máxima legal, Ley 2101/2021). ' +
      'Los recargos aplicados son: +25% diurna, +75% nocturna, +' +
      Math.round((rcFactor('extraFestDiur', c.ahora || new Date()) - 1) * 100) +
      '% festiva diurna y +' +
      Math.round((rcFactor('extraFestNoct', c.ahora || new Date()) - 1) * 100) +
      '% festiva nocturna sobre el valor hora base.\n\n' +
      'Adjunto el reporte completo con la trazabilidad por turno.\n\n' +
      'Quedo atento.\n\nSaludos.';
  } else if (tipo === 'festivos') {
    var lineasFest =
      c.festTrab
        .map(function (d) {
          return '• ' + _fechaLarga(d.fecha) + ' · ' + fDur(d.mins) + ' · ' + fCOP(d.cop);
        })
        .join('\n') || '• Sin días festivos trabajados en este período.';
    subject = 'Turnos en festivos · ' + mesCap;
    body =
      'Hola,\n\n' +
      'Detalle de turnos trabajados en días festivos / dominicales durante ' +
      mesNombre +
      ':\n\n' +
      lineasFest +
      '\n\n' +
      'Total festivos: ' +
      c.festTrab.length +
      ' día' +
      (c.festTrab.length !== 1 ? 's' : '') +
      ' · ' +
      fDur(c.festMins) +
      ' · ' +
      fCOP(c.festCOP) +
      '\n\n' +
      'Recargos aplicados: +' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '% (diurna festiva), +' +
      Math.round((rcFactor('noctFest', c.ahora || new Date()) - 1) * 100) +
      '% (nocturna festiva), ' +
      'según la Ley 2466 de 2025.\n\n' +
      'Adjunto el reporte completo.\n\n' +
      'Saludos.';
  } else if (tipo === 'nocturnas') {
    subject = 'Detalle de jornada nocturna · ' + mesCap;
    body =
      'Hola,\n\n' +
      'Comparto el detalle de mis horas nocturnas (' +
      (getInicioNocturno(c && c.ahora ? c.ahora : new Date()) === 19 ? '7pm' : '9pm') +
      '-6am) trabajadas en ' +
      mesNombre +
      ':\n\n' +
      '• Nocturna ordinaria: ' +
      fDur(c.bd.noctOrd.mins) +
      ' · ' +
      fCOP(c.bd.noctOrd.cop) +
      '\n' +
      '• Nocturna festiva: ' +
      fDur(c.bd.noctFest.mins) +
      ' · ' +
      fCOP(c.bd.noctFest.cop) +
      '\n' +
      '• Extra nocturna: ' +
      fDur(c.bd.extraNoct.mins) +
      ' · ' +
      fCOP(c.bd.extraNoct.cop) +
      '\n' +
      '• Extra fest. nocturna: ' +
      fDur(c.bd.extraFestNoct.mins) +
      ' · ' +
      fCOP(c.bd.extraFestNoct.cop) +
      '\n\n' +
      'Total: ' +
      fDur(c.nocturnasMins) +
      ' · ' +
      fCOP(c.nocturnasCOP) +
      '\n\n' +
      'El recargo nocturno mínimo es del +35% sobre el valor hora base (Ley 2101/2021).\n\n' +
      'Adjunto el reporte detallado.\n\n' +
      'Saludos.';
  } else if (tipo === 'justificacion') {
    subject = 'Justificación de turnos · ' + mesCap;
    body =
      'Buen día,\n\n' +
      'Adjunto la justificación de mis turnos trabajados durante ' +
      mesNombre +
      ':\n\n' +
      '• ' +
      c.diasTrab +
      ' días con turno · ' +
      fDur(c.totalMins) +
      '\n' +
      '• Distribución por jornada:\n' +
      _bdLines(c.bd).replace(/\n/g, '\n  ') +
      '\n\n' +
      'Cada turno está registrado con hora de inicio, hora de fin y duración exacta. Los recargos se aplican según la legislación laboral colombiana (Ley 2101/2021, CST Arts. 168-171).\n\n' +
      'El documento adjunto contiene la trazabilidad completa.\n\n' +
      'Atento a cualquier comentario.\n\nCordialmente.';
  } else if (tipo === 'reporte') {
    subject = 'Mi reporte de turnos · ' + mesCap;
    body =
      'Hola,\n\n' +
      'Adjunto mi reporte de turnos de ' +
      mesNombre +
      '.\n\n' +
      'Resumen rápido:\n' +
      '• ' +
      c.diasTrab +
      ' turnos · ' +
      fDur(c.totalMins) +
      '\n' +
      '• Ingreso bruto: ' +
      fCOP(c.totalCOP) +
      ' (' +
      c.pctSalario.toFixed(1) +
      '% del salario base)\n' +
      '• Promedio: ' +
      fCOP(c.prom) +
      ' por turno\n' +
      (c.proy > 0 ? '• Proyección al cierre: ' + fCOP(c.proy) + '\n' : '') +
      '\nEl detalle completo está en el archivo adjunto.\n\nSaludos.';
  } else {
    // resumen (default)
    var mejorLine = c.mejor
      ? '🏆 Mejor día: ' + _fechaLarga(c.mejor.fecha) + ' · ' + fCOP(c.mejor.cop) + '\n'
      : '';
    subject = 'Resumen del mes · ' + mesCap;
    body =
      'Hola,\n\n' +
      'Este es mi resumen de turnos del mes:\n\n' +
      '📊 ' +
      c.diasTrab +
      ' turnos · ' +
      fDur(c.totalMins) +
      '\n' +
      '💰 Ingresos: ' +
      fCOP(c.totalCOP) +
      ' (' +
      c.pctSalario.toFixed(1) +
      '% del salario base)\n' +
      (c.extraMins > 0 ? '⚡ Extras: ' + fDur(c.extraMins) + ' · ' + fCOP(c.extraCOP) + '\n' : '') +
      (c.nocturnasMins > 0 ? '☾ Nocturnas: ' + fDur(c.nocturnasMins) + '\n' : '') +
      (c.festMins > 0 ? '✦ Festivas: ' + fDur(c.festMins) + '\n' : '') +
      (c.proy > 0 ? '📈 Proyección: ' + fCOP(c.proy) + '\n' : '') +
      '\n' +
      mejorLine +
      '\nReporte completo en el adjunto.\n\nSaludos.';
  }

  // Sin destinatario detectado → IA pide que el usuario complete
  var preview;
  if (!to) {
    preview =
      'Preparé un correo. Solo me falta a quién enviarlo — completa el destinatario en la tarjeta:';
  } else {
    preview =
      'He redactado este correo para **' +
      to +
      '**. Revísalo, edítalo si quieres y pulsa **Enviar**:';
  }

  return {
    preview: preview,
    data: {
      to: to,
      subject: subject,
      body: body,
      format: format,
      attach: attach
    }
  };
}

// ════════════════════════════════════════════════════════════════
//  DESPACHADOR DE CALCULADORAS PARA EL PIPELINE GEMINI EXTRACTOR
//  Recibe {intent, params} del extractor y llama a la calculadora
//  local correcta. Retorna string de respuesta o null.
// ════════════════════════════════════════════════════════════════
function _aiDispatchCalc(intent, params, state) {
  var c = buildContext(state);
  if (!c) return null;

  if (intent === 'simular') {
    var horas = (params && params.horas) || 4;
    var tipo = (params && params.tipo) || null;
    if (!c.vh) {
      return 'Para simular necesito tu salario base. Configurálo en Ajustes > Preferencias de pago.';
    }
    if (tipo && tipo !== 'diurnaOrd') {
      var factor = _aiFactor(tipo);
      var label = _aiLabelTipo(tipo);
      var extra = horas * c.vh * factor;
      var nuevo = (c.totalCOP || 0) + extra;
      var sal = c.salario || 1;
      return (
        '🔮 **Simulación: +' +
        horas +
        'h ' +
        label +
        '**\n\n' +
        '• Valor hora base: ' +
        fCOP(c.vh) +
        '\n' +
        '• Factor: ' +
        (factor * 100).toFixed(0) +
        '% → ' +
        fCOP(c.vh * factor) +
        '/h\n' +
        '• Extra estimado: ≈ ' +
        fCOP(extra) +
        '\n' +
        '• Nuevo total: ≈ ' +
        fCOP(nuevo) +
        ' (' +
        ((nuevo / sal) * 100).toFixed(1) +
        '% del salario)\n\n' +
        '💡 Probá **/meta ' +
        Math.round(nuevo / 100000) * 100000 +
        '** para ver si llegás.'
      );
    }
    // Sin tipo → mostrar todos los escenarios (ya manejado por aiAdvisorSimular)
    if (typeof aiAdvisorSimular === 'function') {
      return aiAdvisorSimular(c, horas, 'completo');
    }
  }

  if (intent === 'total_ganado') {
    var periodo = (params && params.periodo) || 'mes';
    if (periodo === 'hoy') {
      var hoy = new Date();
      var hoyStr = hoy.toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      return (
        '📅 **Hoy (' + hoyStr + '):**\n\n' + fCOP(c.totalCOP) + ' ganados en ' + fDur(c.totalMins)
      );
    }
    return (
      '💰 **Total acumulado (' +
      periodo +
      '):** ' +
      fCOP(c.totalCOP) +
      '\n' +
      '• Horas: ' +
      fDur(c.totalMins) +
      '\n' +
      '• Proyección al cierre: ' +
      fCOP(c.proy)
    );
  }

  if (intent === 'proyeccion') {
    if (!c.proy) return 'Sin datos suficientes para proyectar.';
    return (
      '📈 **Proyección al cierre del mes:** ' +
      fCOP(c.proy) +
      '\n' +
      '• Llevas: ' +
      fCOP(c.totalCOP) +
      ' (' +
      c.diaActual +
      'º día)\n' +
      '• Días restantes: ~' +
      (c.diasMes - c.diaActual) +
      '\n' +
      '💡 Basado en tu ritmo actual de ' +
      fCOP(c.copDiario || c.totalCOP / Math.max(1, c.diasTrab)) +
      '/día.'
    );
  }

  if (intent === 'liquidacion') {
    if (typeof aiAdvisorLiquidacion === 'function') {
      return aiAdvisorLiquidacion(c);
    }
    return null;
  }

  if (intent === 'valor_hora') {
    if (!c.vh) {
      return 'Configurá tu salario base en Ajustes para calcular tu valor hora.';
    }
    return (
      '⏱️ **Tu valor hora:** ' +
      fCOP(c.vh) +
      '\n' +
      '• Fórmula: ' +
      fCOP(c.salario) +
      ' (salario) / 240 horas\n' +
      '• Nocturna: ' +
      fCOP(c.vh * 1.35) +
      ' (+35%)\n' +
      '• Dominical diurna: ' +
      fCOP(c.vh * rcFactor('diurnaFest', c.ahora || new Date())) +
      ' (+' +
      Math.round((rcFactor('diurnaFest', c.ahora || new Date()) - 1) * 100) +
      '%)\n' +
      '• Extra nocturna: ' +
      fCOP(c.vh * 1.75) +
      ' (+75%)'
    );
  }

  if (intent === 'ahorro') {
    var meta = (params && params.meta) || (c.salario || 0) * 3;
    if (typeof aiAdvisorAhorro === 'function') {
      return aiAdvisorAhorro(c, meta, 12);
    }
    return null;
  }

  if (intent === 'optimizador') {
    var metaExtra = (params && params.meta_extra) || 0;
    if (typeof aiAdvisorOptimizador === 'function' && metaExtra > 0) {
      return aiAdvisorOptimizador(c, metaExtra);
    }
    return null;
  }

  return null;
}
