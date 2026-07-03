// ════════════════════════════════════════════════════════════════
//  MI TURNO · services/ai-knowledge.js
//  Base de conocimiento laboral — responde preguntas generales
//  sobre recargos, leyes y valores sin necesitar datos del usuario.
//  100% offline · ES5 · sin dependencias externas.
// ════════════════════════════════════════════════════════════════

// ─── BASE DE CONOCIMIENTO ─────────────────────────────────────

// Valores legales VIGENTES HOY, derivados del motor date-aware (globals.js).
// La reforma laboral (Ley 2466/2025) subió el recargo dominical/festivo de
// forma gradual (75→80→90→100%) y movió el inicio nocturno a las 7 PM. Estos
// textos describen la situación actual; la plata histórica la calcula doCalc
// por la fecha de cada turno. Recalcular al cargar mantiene el texto al día sin
// tocar código en cada fase.
var _LEY = (function () {
  var D = new Date();
  var fe = typeof getRecargoFestivo === 'function' ? getRecargoFestivo(D) : 0.8;
  var noc = typeof getInicioNocturno === 'function' ? getInicioNocturno(D) : 19;
  function f(x) {
    return x.toFixed(2);
  }
  function p(x) {
    return Math.round(x * 100);
  }
  return {
    domPct: p(fe), // 80 hoy
    domF: f(1 + fe), // 1.80
    noctFestPct: p(fe + 0.35), // 115
    noctFestF: f(1 + fe + 0.35), // 2.15
    exDiurPct: p(fe + 0.25), // 105
    exDiurF: f(1 + fe + 0.25), // 2.05
    exNoctPct: p(fe + 0.75), // 155
    exNoctF: f(1 + fe + 0.75), // 2.55
    nocDesde: noc === 19 ? '7:00 PM' : '9:00 PM'
  };
})();

var AI_KNOWLEDGE = {
  domingo:
    '⛪ **Trabajar un domingo o festivo paga con recargo del ' +
    _LEY.domPct +
    '%** sobre tu valor hora ordinario.\n\n' +
    '• Hora diurna dominical: **' +
    _LEY.domF +
    'x** (' +
    _LEY.domPct +
    '% extra)\n' +
    '• Hora nocturna dominical: **' +
    _LEY.noctFestF +
    'x** (' +
    _LEY.noctFestPct +
    '% extra)\n' +
    '• Extra diurna dominical: **' +
    _LEY.exDiurF +
    'x** (' +
    _LEY.exDiurPct +
    '% extra)\n' +
    '• Extra nocturna dominical: **' +
    _LEY.exNoctF +
    'x** (' +
    _LEY.exNoctPct +
    '% extra)\n\n' +
    '📈 **Sube por fases (Ley 2466/2025, Art. 6):** 80% (jul-2025) → 90% (jul-2026) → 100% (jul-2027).\n\n' +
    '💡 También tenés derecho a un descanso compensatorio si trabajás domingo.\n\n' +
    '📌 **Sábado:** NO es festivo. Se paga como día ordinario, salvo que sea festivo por ley (ej. Sábado Santo).',
  nocturno:
    '🌙 **El recargo nocturno es del 35%** sobre el valor hora ordinario.\n\n' +
    'Aplica entre las **' +
    _LEY.nocDesde +
    ' y las 6:00 AM** (la Ley 2466/2025, Art. 5, movió el inicio de las 9 PM a las 7 PM desde el 25-dic-2025).\n\n' +
    '• Hora nocturna ordinaria: **1.35x** (35% extra)\n' +
    '• Hora extra nocturna: **1.75x** (75% extra)\n\n' +
    '📐 Si tu hora vale $10,000, una hora nocturna vale $13,500.\n\n' +
    '💡 El recargo nocturno se acumula con el dominical/festivo si aplica.',
  extra:
    '➕ **Horas extra en Colombia:**\n\n' +
    '• Extra diurna: **+25%** (1.25x)\n' +
    '• Extra nocturna: **+75%** (1.75x)\n' +
    '• Extra dominical/festiva diurna: **+' +
    _LEY.exDiurPct +
    '%** (' +
    _LEY.exDiurF +
    'x)\n' +
    '• Extra dominical/festiva nocturna: **+' +
    _LEY.exNoctPct +
    '%** (' +
    _LEY.exNoctF +
    'x)\n\n' +
    '⚖️ **Límites legales:** máximo 2 horas extra por día y 12 por semana (CST Art. 159).\n\n' +
    '💡 Las horas extra se calculan cuando superás la jornada ordinaria (8h/día o el límite semanal).',
  festivo:
    '⛪ **Recargos en días festivos y domingos (Ley 2466/2025):**\n\n' +
    '• Diurno festivo: **+' +
    _LEY.domPct +
    '%** (' +
    _LEY.domF +
    'x)\n' +
    '• Nocturno festivo: **+' +
    _LEY.noctFestPct +
    '%** (' +
    _LEY.noctFestF +
    'x)\n' +
    '• Extra festivo diurno: **+' +
    _LEY.exDiurPct +
    '%** (' +
    _LEY.exDiurF +
    'x)\n' +
    '• Extra festivo nocturno: **+' +
    _LEY.exNoctPct +
    '%** (' +
    _LEY.exNoctF +
    'x)\n\n' +
    '💡 La app detecta automáticamente si un día es festivo y aplica el recargo vigente a esa fecha. Todos los festivos colombianos están precargados.',
  salario:
    '💰 **Salario mínimo 2026:** $1,750,905 (Decreto 1470/2025).\n\n' +
    '**Auxilio de transporte 2026:** $249,095 mensuales.\n\n' +
    '• Aplica si ganás hasta 2 SMMLV ($3,501,810).\n' +
    '• Activá esta opción en Ajustes > Preferencias de pago.\n\n' +
    '**Cómo calcular tu valor hora:** salario_base / 240 horas.',
  ley:
    '⚖️ **Ley 2101 de 2021** — Reducción gradual de la jornada laboral:\n\n' +
    '• 2023: 47h/semana\n' +
    '• 2024: 46h/semana\n' +
    '• 2025: 45h/semana\n' +
    '• 2026: 44h/semana\n' +
    '• 2027 en adelante: 42h/semana\n\n' +
    'La app ajusta automáticamente el cálculo según la fecha del turno.\n\n' +
    '📐 **CST Art. 159:** jornada máxima diaria 8h.\n' +
    '📐 **CST Art. 168-171:** recargos nocturnos, extras, dominicales.',
  licencia:
    '👶 **Licencias legales en Colombia:**\n\n' +
    '• **Maternidad:** 18 semanas remuneradas al 100%.\n' +
    '• **Paternidad:** 2 semanas remuneradas al 100%.\n' +
    '• **Luto:** 5 días hábiles remunerados por fallecimiento de familiar hasta 2° grado de consanguinidad.\n' +
    '• **Calamidad doméstica:** Tiempo razonable según reglamento interno.',
  incapacidad:
    '🏥 **Incapacidades médicas:**\n\n' +
    '• **Días 1 y 2:** Los paga el empleador al 100% del salario.\n' +
    '• **Día 3 al 90:** Los paga la EPS al 66.66% del salario.\n' +
    '• **Día 91 al 180:** Los paga la EPS al 50% del salario.\n\n' +
    '💡 *Nota:* El pago nunca puede ser inferior a 1 Salario Mínimo Legal Vigente.',
  dotacion:
    '👕 **Dotación (Calzado y vestido de labor):**\n\n' +
    '• Tenés derecho si ganás hasta 2 Salarios Mínimos.\n' +
    '• Se entrega 3 veces al año: 30 de abril, 31 de agosto y 20 de diciembre.\n' +
    '• Requisito: Llevar más de 3 meses trabajando en la empresa.'
};

// ─── MOTOR DE BÚSQUEDA ────────────────────────────────────────

/**
 * Busca en la base de conocimiento y devuelve la respuesta.
 * @param {string} text - pregunta del usuario
 * @returns {string|null}
 */
function aiKnowledgeSearch(text) {
  if (!text) return null;
  var t = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Buscar palabras clave en orden de especificidad
  var keywords = [
    {
      words: [
        'domingo',
        'dominical',
        'sabado',
        'sábado',
        'festivo vale',
        'cuanto pagan domingo',
        'recargo dominical',
        'trabajar domingo',
        'pagan domingo',
        'pagan sabado',
        'cuanto pagan sabado'
      ],
      key: 'domingo'
    },
    {
      words: [
        'nocturno',
        'noche',
        'recargo noche',
        'horario nocturno',
        'pagan noche',
        'cuanto pagan nocturno',
        'vale hora noche'
      ],
      key: 'nocturno'
    },
    {
      words: [
        'extra',
        'extras',
        'hora extra',
        'sobretiempo',
        'recargo extra',
        'pagan extra',
        'cuanto extra'
      ],
      key: 'extra'
    },
    {
      words: ['festivo', 'feriado', 'fest', 'festividad', 'recargo festivo', 'cuanto festivo'],
      key: 'festivo'
    },
    {
      words: ['salario', 'sueldo', 'minimo', 'mínimo', 'base', 'cuanto es salario', 'cuanto pagan'],
      key: 'salario'
    },
    {
      words: [
        'ley',
        '2101',
        'jornada',
        'cst',
        'codigo',
        'código',
        'legal',
        'permit',
        'horas por semana',
        'horas semanales',
        'maximo de horas',
        'máximo de horas',
        'normativa',
        'legislacion',
        'derechos'
      ],
      key: 'ley'
    },
    { words: ['licencia', 'maternidad', 'paternidad', 'luto', 'calamidad'], key: 'licencia' },
    {
      words: ['incapacidad', 'enfermedad', 'eps', 'medica', 'médica', 'enfermo'],
      key: 'incapacidad'
    },
    { words: ['dotacion', 'dotación', 'uniforme', 'ropa', 'zapatos', 'calzado'], key: 'dotacion' }
  ];

  for (var i = 0; i < keywords.length; i++) {
    var kw = keywords[i];
    for (var j = 0; j < kw.words.length; j++) {
      if (t.indexOf(kw.words[j]) >= 0) {
        return AI_KNOWLEDGE[kw.key] || null;
      }
    }
  }

  // Búsqueda combinada
  if (
    t.indexOf('hora') >= 0 ||
    t.indexOf('vale') >= 0 ||
    t.indexOf('pagan') >= 0 ||
    t.indexOf('cuanto') >= 0
  ) {
    if (t.indexOf('domingo') >= 0) return AI_KNOWLEDGE['domingo'];
    if (t.indexOf('noche') >= 0 || t.indexOf('nocturn') >= 0) return AI_KNOWLEDGE['nocturno'];
    if (t.indexOf('extra') >= 0) return AI_KNOWLEDGE['extra'];
  }

  return null;
}

// ─── EXPORT ──────────────────────────────────────────────────
window.AI_KNOWLEDGE = AI_KNOWLEDGE;
window.aiKnowledgeSearch = aiKnowledgeSearch;

console.log('[MT] ai-knowledge.js cargado — base de conocimiento laboral ✓');
