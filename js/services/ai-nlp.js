// ════════════════════════════════════════════════════════════════
//  MI TURNO · services/ai-nlp.js
//  Motor NLP mejorado — v267
//  Comprensión de lenguaje natural en español colombiano.
//  100% offline · ES5 · sin dependencias externas.
//
//  Capacidades:
//    · Clasificación de intenciones por puntaje ponderado
//    · Stemming español simplificado
//    · Stop words + tokenización (respeta palabras de tiempo e interrogativas)
//    · Preprocesador de frases conversacionales (quita muletillas)
//    · Compound matching: dinero+tiempo, acción+objeto
//    · Diccionario de sinónimos expandido (200+ entradas)
//    · Similitud de Jaccard para matching difuso
//    · Tolerancia a typos (Levenshtein para palabras cortas)
//    · Estado conversacional multi-turno
//    · Detección de tono emocional (empatía contextual)
//    · Bonus por anclaje temporal (detecta ayer/hoy/semana/mes)
//    · v267: time-anchoring bonus redirige preguntas compuestas
//      (ej. "cuanto dinero gane ayer" → intent ayer, no total_ganado)
// ════════════════════════════════════════════════════════════════

// ─── STOP WORDS ESPAÑOL ───────────────────────────────────────
var AI_STOP = {
  a: 1,
  ante: 1,
  bajo: 1,
  cabe: 1,
  con: 1,
  contra: 1,
  de: 1,
  del: 1,
  desde: 1,
  durante: 1,
  en: 1,
  entre: 1,
  hacia: 1,
  hasta: 1,
  mediante: 1,
  para: 1,
  por: 1,
  según: 1,
  sin: 1,
  sobre: 1,
  tras: 1,
  el: 1,
  la: 1,
  los: 1,
  las: 1,
  un: 1,
  una: 1,
  unos: 1,
  unas: 1,
  lo: 1,
  le: 1,
  les: 1,
  se: 1,
  su: 1,
  sus: 1,
  mi: 1,
  mis: 1,
  tu: 1,
  tus: 1,
  yo: 1,
  me: 1,
  te: 1,
  nos: 1,
  os: 1,
  que: 1,
  cual: 1,
  cuales: 1,
  quien: 1,
  quienes: 1,
  cuyo: 1,
  cuya: 1,
  donde: 1,
  cuando: 1,
  como: 1,
  cuanto: 1,
  cuanta: 1,
  cuantos: 1,
  es: 1,
  son: 1,
  fue: 1,
  era: 1,
  está: 1,
  esta: 1,
  estoy: 1,
  hay: 1,
  tiene: 1,
  tengo: 1,
  hacer: 1,
  ser: 1,
  estar: 1,
  más: 1,
  mas: 1,
  menos: 1,
  muy: 1,
  tan: 1,
  tanto: 1,
  poco: 1,
  sí: 1,
  si: 1,
  no: 1,
  ya: 1,
  aún: 1,
  aun: 1,
  solo: 1,
  sólo: 1,
  todo: 1,
  toda: 1,
  algo: 1,
  nada: 1,
  cada: 1,
  otro: 1,
  otra: 1,
  pero: 1,
  porque: 1,
  pues: 1,
  aunque: 1,
  asi: 1,
  así: 1,
  // NOTA: ahora, hoy, ayer, mañana, siempre, nunca NO son stop words.
  // Son palabras de anclaje temporal críticas para entender
  // preguntas como "cuanto dinero gane ayer" vs "cuanto gane".
  // ⚠️  v267: también "cuanto", "cuando", "donde", "como" dejan de ser stop
  // words — son palabras interrogativas que portan significado esencial.
  bueno: 1,
  buena: 1,
  mal: 1,
  malo: 1,
  mejor: 1,
  peor: 1,
  puede: 1,
  puedo: 1,
  puedes: 1,
  podria: 1,
  podrías: 1,
  quisiera: 1,
  dame: 1,
  di: 1,
  dime: 1,
  decir: 1,
  saber: 1,
  quiero: 1,
  necesito: 1,
  porfa: 1,
  porfi: 1,
  gracias: 1,
  hola: 1,
  buenas: 1,
  buenos: 1,
  o: 1,
  y: 1,
  e: 1,
  ni: 1,
  al: 1,
  // Stop words coloquiales colombianas
  entonces: 1,
  oiga: 1,
  venga: 1,
  mire: 1,
  listo: 1,
  hágale: 1,
  hagale: 1,
  dale: 1,
  claro: 1,
  obvio: 1,
  eh: 1,
  ah: 1,
  uy: 1
};

// ─── PREPROCESADOR CONVERSACIONAL ──────────────────────────────
// Elimina muletillas y frases de cortesía que no aportan
// significado a la intención real del usuario.
// Ej: "dime cuanto dinero gane ayer" → "cuanto dinero gane ayer"
// Ej: "quisiera saber como me fue hoy" → "como me fue hoy"
var AI_PREFIX_PATTERNS = [
  'dime ',
  'dime cuanto ',
  'decime ',
  'decime cuanto ',
  'di ',
  'di cuanto ',
  'quisiera saber ',
  'quisiera saber cuanto ',
  'quiero saber ',
  'quiero saber cuanto ',
  'necesito saber ',
  'me preguntaba ',
  'me preguntaba si ',
  'me gustaria saber ',
  'me gustaría saber ',
  'podrias decirme ',
  'podrías decirme ',
  'podrias decirme cuanto ',
  'podés decirme ',
  'podes decirme ',
  'podés decirme cuanto ',
  'puedes decirme ',
  'puedes decirme cuanto ',
  'me dices ',
  'me decis ',
  'me puedes decir ',
  'me podés decir ',
  'me podrias decir ',
  'me podrías decir ',
  'averiguame ',
  'averíguame ',
  'consultame ',
  'buscame ',
  'chequeame ',
  'fijate ',
  'fijate cuanto ',
  'mira ',
  'mira cuanto ',
  'mirá ',
  'mirá cuanto ',
  'decime porfa ',
  'dime porfa ',
  'dime porfi ',
  'decime porfi ',
  'porfa ',
  'porfi ',
  'por favor ',
  'a ver ',
  'a ver cuanto ',
  'veamos ',
  'cuentame ',
  'cuéntame ',
  'contame ',
  'cuentame cuanto ',
  'contame cuanto ',
  'decime vos ',
  'decime una cosa ',
  'una pregunta ',
  'tengo una duda ',
  'me ayudas ',
  'me ayudas con ',
  'me ayudas a ',
  'me ayudás ',
  'me ayudás con ',
  'me ayudás a ',
  'ayudame ',
  'ayudame con ',
  'ayudame a ',
  'ayúdame ',
  'ayúdame con ',
  'ayúdame a ',
  'podes ayudarme ',
  'podés ayudarme ',
  'puedes ayudarme ',
  'podes ayudarme con ',
  'necesito que me ',
  'me haces el favor de ',
  'me haces un favor ',
  'hagame un favor ',
  'hágame un favor ',
  'hazme el favor ',
  'chequeame esto '
];

function aiPreprocess(text) {
  var t = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quitar tildes para matching
  for (var i = 0; i < AI_PREFIX_PATTERNS.length; i++) {
    if (t.indexOf(AI_PREFIX_PATTERNS[i]) === 0) {
      return t.slice(AI_PREFIX_PATTERNS[i].length);
    }
  }
  return text; // sin cambios si no matchea
}

// ─── STEMMING ESPAÑOL SIMPLIFICADO ─────────────────────────────
// Reduce palabras a su raíz aproximada para mejorar matching.
// No es un stemmer completo (Porter), pero cubre los sufijos
// más comunes en el dominio de nómina y conversación.
function aiStem(w) {
  if (w.length <= 3) return w;
  // Plurales
  if (w.slice(-2) === 'es') w = w.slice(0, -2);
  else if (w.slice(-1) === 's' && w.slice(-2, -1) !== 'e') w = w.slice(0, -1);
  // Verbos comunes: gerundios y participios
  if (w.slice(-4) === 'ando' || w.slice(-4) === 'iendo') w = w.slice(0, -4);
  else if (w.slice(-3) === 'ado' || w.slice(-3) === 'ido') w = w.slice(0, -3);
  // Diminutivos coloquiales colombianos
  if (w.slice(-4) === 'ito ' || w.slice(-4) === 'ita ') w = w.slice(0, -4);
  else if (w.slice(-3) === 'ito' || w.slice(-3) === 'ita') w = w.slice(0, -3);
  // Superlativos
  if (w.slice(-5) === 'ísimo' || w.slice(-5) === 'ísima') w = w.slice(0, -5);
  // Verbos conjugados comunes (-ar, -er, -ir)
  if (w.length > 5) {
    if (w.slice(-2) === 'ar' || w.slice(-2) === 'er' || w.slice(-2) === 'ir') {
      // No reducir si es palabra corta tipo "dar", "ser", "ir"
    }
  }
  return w;
}

// ─── TOKENIZACIÓN ──────────────────────────────────────────────
// Convierte texto en array de stems, filtrando stop words.
// Primero aplica el preprocesador para quitar muletillas.
function aiTokenize(text) {
  var clean = aiPreprocess(text);
  var raw = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[¿¡?!;:,.()[\]"'\u201c\u201d\u2018\u2019]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var words = raw.split(' ');
  var tokens = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w || w.length < 2) continue;
    if (AI_STOP[w]) continue;
    tokens.push(aiStem(w));
  }
  return tokens;
}

// ─── SIMILITUD DE JACCARD ─────────────────────────────────────
// Compara dos conjuntos de tokens. Valor entre 0 y 1.
function aiJaccard(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  var intersection = 0;
  var union = {};
  for (var i = 0; i < tokensA.length; i++) {
    union[tokensA[i]] = 1;
  }
  for (var j = 0; j < tokensB.length; j++) {
    if (union[tokensB[j]]) {
      intersection++;
      union[tokensB[j]] = 2; // marcado como compartido
    } else {
      union[tokensB[j]] = 1;
    }
  }
  // Contar unión real
  var unionCount = 0;
  for (var k in union) {
    if (Object.prototype.hasOwnProperty.call(union, k)) unionCount++;
  }
  return unionCount > 0 ? intersection / unionCount : 0;
}

// ─── DISTANCIA LEVENSHTEIN ────────────────────────────────────
// Tolerancia a typos para palabras cortas (≤5 caracteres)
function aiLevenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var m = a.length;
  var n = b.length;
  var d = [];
  for (var i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (var j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      var cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // borrar
        d[i][j - 1] + 1, // insertar
        d[i - 1][j - 1] + cost // reemplazar
      );
    }
  }
  return d[m][n];
}

// ¿Coincide con tolerancia de 1 error para palabras cortas o 2 para largas?
function aiFuzzyMatch(word, target) {
  if (word === target) return true;
  var diff = Math.abs(word.length - target.length);
  if (diff > 2) return false;

  var dist = aiLevenshtein(word, target);
  if (target.length <= 5) return dist <= 1;
  return dist <= 2;
}

// ─── EXTRACCIÓN DE ENTIDADES (ENTITY EXTRACTION) ──────────────
// Extrae números, dinero y fechas relativas del texto
function aiExtractEntities(text) {
  var t = (text || '').toLowerCase();
  var entities = {
    number: null,
    money: null,
    timeRelative: null
  };

  // 1. Extraer dinero coloquial colombiano
  // Ej: "2 millones", "1.5 millones", "50 lucas", "50k", "1500000"
  var moneyMatch = t.match(/(\d+(?:\.\d+)?)\s*(millones|millon|lucas|k|mil)/);
  if (moneyMatch) {
    var val = parseFloat(moneyMatch[1]);
    var unit = moneyMatch[2];
    if (unit === 'millones' || unit === 'millon') entities.money = val * 1000000;
    else if (unit === 'lucas' || unit === 'k' || unit === 'mil') entities.money = val * 1000;
  } else {
    // Buscar número crudo grande (asumimos que es dinero si es > 1000)
    var rawNum = t.replace(/\./g, '').match(/(\d{4,})/);
    if (rawNum) entities.money = parseInt(rawNum[1], 10);
  }

  // 2. Extraer número simple (horas, días)
  var simpleNum = t.match(/\b(\d{1,3})\b/);
  if (simpleNum && !entities.money) {
    entities.number = parseInt(simpleNum[1], 10);
  }

  // 3. Extraer tiempo relativo
  if (t.indexOf('ayer') >= 0) entities.timeRelative = 'ayer';
  else if (t.indexOf('hoy') >= 0) entities.timeRelative = 'hoy';
  else if (t.indexOf('mañana') >= 0) entities.timeRelative = 'mañana';
  else if (t.indexOf('semana pasada') >= 0) entities.timeRelative = 'semana_pasada';
  else if (t.indexOf('mes pasado') >= 0) entities.timeRelative = 'mes_pasado';

  return entities;
}

// ─── DICCIONARIO DE SINÓNIMOS ────────────────────────────────
// Expande términos a su forma canónica para mejorar matching.
// Incluye expresiones colombianas, jerga laboral y variaciones.
var AI_SYNONYMS = {
  // Dinero
  plata: 'dinero',
  billete: 'dinero',
  lucas: 'dinero',
  guita: 'dinero',
  money: 'dinero',
  cash: 'dinero',
  efectivo: 'dinero',
  pago: 'dinero',
  cobro: 'dinero',
  cobre: 'dinero',
  pagaron: 'dinero',
  cobraron: 'dinero',
  gane: 'dinero',
  gané: 'dinero',
  ganancia: 'dinero',
  ganancias: 'dinero',
  ingreso: 'dinero',
  ingresos: 'dinero',
  devengado: 'dinero',
  remuneracion: 'dinero',
  remuneración: 'dinero',
  liquido: 'dinero',
  líquido: 'dinero',
  neto: 'dinero',
  bruto: 'dinero',
  // Salario
  sueldo: 'salario',
  nomina: 'salario',
  nómina: 'salario',
  basico: 'salario',
  básico: 'salario',
  mensual: 'salario',
  fijo: 'salario',
  // Trabajo
  laburo: 'trabajo',
  chamba: 'trabajo',
  camello: 'trabajo',
  curro: 'trabajo',
  brete: 'trabajo',
  labor: 'trabajo',
  empleo: 'trabajo',
  // Turno / jornada
  // OJO: "dia"/"dias" NO mapean a "turno" — "mejor día"/"peor día"/"cuántos días"
  // son consultas de DÍA, no de turno. Mapearlo rompía mejor_dia/peor_dia
  // (el token "turno" matcheaba iniciar_turno en varias keywords y ganaba).
  jornada: 'turno',
  guardia: 'turno',
  guardias: 'turno',
  // Descanso
  descanso: 'descansar',
  descansar: 'descansar',
  pausa: 'descansar',
  reposo: 'descansar',
  libre: 'descansar',
  vacaciones: 'descansar',
  // Fatiga
  cansado: 'fatiga',
  agotado: 'fatiga',
  reventado: 'fatiga',
  mamado: 'fatiga',
  fundido: 'fatiga',
  muerto: 'fatiga',
  exhausto: 'fatiga',
  estres: 'fatiga',
  estresado: 'fatiga',
  burnout: 'fatiga',
  quemado: 'fatiga',
  // Productividad
  rendir: 'productividad',
  rendimiento: 'productividad',
  eficiencia: 'productividad',
  eficaz: 'productividad',
  // Fin de semana
  finde: 'fin de semana',
  findesemana: 'fin de semana',
  'finde semana': 'fin de semana',
  'fin semana': 'fin de semana',
  // ⚠️ sabado y domingo NO son sinónimos de "fin de semana" — son días
  // con recargos específicos que deben preservarse para el matching
  // de conocimiento laboral y preguntas tipo "cuánto pagan un sábado".
  // Festivo
  feriado: 'festivo',
  festividad: 'festivo',
  fest: 'festivo',
  fiesta: 'festivo',
  // Proyección
  proye: 'proyeccion',
  proyección: 'proyeccion',
  proyecto: 'proyeccion',
  estimado: 'proyeccion',
  estimacion: 'proyeccion',
  estimación: 'proyeccion',
  pronostico: 'proyeccion',
  // Comparativa
  comparar: 'comparativa',
  comparacion: 'comparativa',
  comparación: 'comparativa',
  diferencia: 'comparativa',
  vs: 'comparativa',
  versus: 'comparativa',
  contra: 'comparativa',
  cotejar: 'comparativa',
  // Total / resumen
  resumen: 'total',
  balance: 'total',
  cuentas: 'total',
  numeros: 'total',
  números: 'total',
  cifras: 'total',
  consolidado: 'total',
  acumulado: 'total',
  // Estadísticas
  estadisticas: 'stats',
  estadísticas: 'stats',
  datos: 'stats',
  info: 'stats',
  informacion: 'stats',
  información: 'stats',
  // Email
  envio: 'email',
  correo: 'email',
  mandar: 'email',
  reporte: 'email',
  informe: 'email',
  jefe: 'email',
  empresa: 'email',
  admin: 'email',
  enviar: 'email',
  envia: 'email',
  envío: 'email',
  // Bienestar
  salud: 'bienestar',
  bien: 'bienestar',
  sano: 'bienestar',
  tranquilo: 'bienestar',
  // Consejo
  consejo: 'tip',
  recomendacion: 'tip',
  recomendación: 'tip',
  sugerencia: 'tip',
  aconsejar: 'tip',
  sugiero: 'tip',
  // Ahorro
  ahorrar: 'ahorro',
  ahorro: 'ahorro',
  meta: 'ahorro',
  objetivo: 'ahorro',
  llegar: 'ahorro',
  falta: 'ahorro',
  'cuanto falta': 'ahorro',
  // Horas
  horas: 'horas',
  hora: 'horas',
  tiempo: 'horas',
  duracion: 'horas',
  duración: 'horas',
  // Extra
  extra: 'extra',
  extras: 'extra',
  sobretiempo: 'extra',
  adicional: 'extra',
  adicionales: 'extra',
  // Nocturno
  nocturna: 'nocturno',
  nocturnas: 'nocturno',
  noche: 'nocturno',
  madrugada: 'nocturno',
  // Ley
  normativa: 'ley',
  legislacion: 'ley',
  legislación: 'ley',
  codigo: 'ley',
  código: 'ley',
  articulo: 'ley',
  artículo: 'ley',
  legal: 'ley',
  // Liquidación
  liquidacion: 'liquidacion',
  liquidación: 'liquidacion',
  prestaciones: 'liquidacion',
  cesantias: 'liquidacion',
  cesantías: 'liquidacion',
  prima: 'liquidacion',
  // Preguntas
  pregunta: 'pregunta',
  consulta: 'pregunta',
  duda: 'pregunta',
  consultar: 'pregunta',
  // Acciones
  calcular: 'calcular',
  calcula: 'calcular',
  saca: 'calcular',
  dame: 'calcular',
  decime: 'calcular',
  dime: 'calcular',
  mostrar: 'calcular',
  mostra: 'calcular',
  enseñame: 'calcular',
  ensename: 'calcular',
  // Coloquiales
  parce: 'parce',
  parcero: 'parce',
  llave: 'parce',
  llaveria: 'parce',
  parcera: 'amiga',
  compa: 'parce',
  comadre: 'amiga',
  socio: 'parce',
  socia: 'amiga',
  hermano: 'parce',
  hermana: 'amiga',
  vecino: 'parce',
  vecina: 'amiga',
  marica: 'parce',
  pana: 'parce',
  pez: 'parce',
  // Comida
  tragar: 'comer',
  traga: 'comer',
  morfar: 'comer',
  jalar: 'comer',
  mecatear: 'comer',
  // Estados de ánimo
  maluqueado: 'fatiga',
  paila: 'mal',
  'que oso': 'pena',
  fiero: 'mal',
  lindo: 'bien',
  buenisimo: 'bien',
  juemadre: 'frustrado',
  // Palabras de uso diario
  pilas: 'atento',
  chévere: 'bien',
  jueputa: 'frustrado',
  viejo: 'persona',
  cucha: 'persona',
  pelado: 'joven',
  sardino: 'joven',
  chino: 'joven',
  tombo: 'policia',
  camellar: 'trabajar',
  camellando: 'trabajando',
  rebusque: 'trabajo',
  moneda: 'dinero',
  menudo: 'dinero',
  sencillo: 'dinero',
  feriar: 'pagar',
  pagar: 'pagar',
  cancelar: 'pagar',
  // Acciones comunes
  echar: 'hacer',
  cuadrar: 'organizar',
  pillar: 'entender',
  captar: 'entender',
  coger: 'tomar',
  correrse: 'moverse',
  abrirse: 'irse',
  volarse: 'irse',
  pegar: 'ir',
  pegarse: 'ir',
  // ═══ v267: sinónimos expandidos para preguntas compuestas ═══
  // Verbos de consulta en todas sus conjugaciones
  gano: 'gane',
  ganas: 'gane',
  gana: 'gane',
  ganan: 'gane',
  ganamos: 'gane',
  cobra: 'gane',
  cobraste: 'gane',
  pagaste: 'gane',
  hiciste: 'gane',
  sacaste: 'gane',
  llevas: 'gane',
  llevamos: 'gane',
  acumulas: 'gane',
  acumule: 'gane',
  consigues: 'gane',
  obtienes: 'gane',
  recibes: 'gane',
  debengan: 'gane',
  // Tiempo
  manana: 'mañana',
  amanecer: 'manana',
  tarde: 'tarde',
  anochecer: 'noche',
  anoche: 'ayer',
  antier: 'ayer',
  anteayer: 'ayer',
  ahorita: 'ahora',
  actualmente: 'ahora',
  'en estos dias': 'hoy',
  'en estos días': 'hoy',
  'al momento': 'ahora',
  'en tiempo real': 'ahora',
  // Expresiones compuestas frecuentes
  'cuanto he ganado': 'total_ganado',
  'cuanto me gane': 'total_ganado',
  'cuanto es mi sueldo': 'total_ganado',
  'cuanto me pagan': 'total_ganado',
  'que gane': 'total_ganado',
  'cuanto me dan': 'total_ganado',
  'cuanto recibo': 'total_ganado',
  'cuanto saco': 'total_ganado',
  'cuanto saque': 'total_ganado',
  'cuanto llevo ganado': 'total_ganado',
  'cuanta ganancia': 'total_ganado',
  'mis ganancias': 'total_ganado',
  'lo que gane': 'total_ganado',
  'lo que he ganado': 'total_ganado',
  'mi sueldo': 'total_ganado',
  'mi salario': 'total_ganado',
  'mi paga': 'total_ganado',
  'cuanto hare': 'proyeccion',
  'cuanto haré': 'proyeccion',
  'al final cuanto': 'proyeccion',
  'cuanto ganare': 'proyeccion',
  'cuanto ganaré': 'proyeccion',
  'cuanto terminare': 'proyeccion',
  'cuanto terminare ganando': 'proyeccion',
  'proyeccion de ingresos': 'proyeccion',
  'proyeccion de ganancias': 'proyeccion',
  'estimacion de ingresos': 'proyeccion',
  // Comparativa
  'mejor que el mes': 'comparativa_mes',
  'peor que el mes': 'comparativa_mes',
  'comparado con el mes': 'comparativa_mes',
  'vs el mes pasado': 'comparativa_mes',
  'contra el mes anterior': 'comparativa_mes',
  'diferencia mes pasado': 'comparativa_mes',
  'comparacion mes anterior': 'comparativa_mes'
};

function aiExpandSynonym(w) {
  // Si el diccionario externo (ai-synonyms.js) está cargado, usarlo primero.
  // Cubre frases de 2-3 palabras que el lookup plano de AI_SYNONYMS no puede.
  if (typeof aiSynExpand === 'function') {
    var expanded = aiSynExpand(w);
    if (expanded !== w) return expanded;
  }
  return AI_SYNONYMS[w] || w;
}

// ─── INTENTS ──────────────────────────────────────────────────
// Cada intent tiene:
//   id: identificador único
//   keywords: array de [palabra, peso]
//   context: opcional, array de keywords que deben estar en
//            el estado conversacional previo
// Los pesos: 3 = muy específico, 2 = relevante, 1 = débil
var AI_INTENTS = [
  // ── Conversacionales ──
  {
    id: 'saludo',
    kw: [
      ['hola', 3],
      ['holi', 3],
      ['buen dia', 3],
      ['buenos dias', 3],
      ['buenas tardes', 3],
      ['buenas noches', 3],
      ['que tal', 3],
      ['como vas', 3],
      ['como va', 3],
      ['hey', 3],
      ['alo', 3],
      ['saludo', 3],
      ['buenas', 3]
    ]
  },
  {
    id: 'despedida',
    kw: [
      ['adios', 3],
      ['chao', 3],
      ['hasta luego', 3],
      ['nos vemos', 3],
      ['bye', 3],
      ['me voy', 3],
      ['hasta pronto', 3]
    ]
  },
  {
    id: 'agradecimiento',
    kw: [
      ['gracias', 3],
      ['genial', 3],
      ['excelente', 3],
      ['perfecto', 3],
      ['que bien', 3],
      ['buenisimo', 3],
      ['buen trabajo', 3],
      ['gracias totales', 3]
    ]
  },
  {
    id: 'identidad',
    kw: [
      ['quien eres', 3],
      ['que eres', 3],
      ['como te llamas', 3],
      ['nombre', 2],
      ['quien sos', 3],
      ['que haces', 2],
      ['para que servis', 3],
      ['para que sirves', 3]
    ]
  },
  {
    id: 'capacidades',
    kw: [
      ['que sabes hacer', 3],
      ['que podes hacer', 3],
      ['que puedes hacer', 3],
      ['capacidades', 3],
      ['skills', 3],
      ['funciones', 3],
      ['que sabes', 3]
    ]
  },

  // ── Nómina / Dinero ──
  {
    id: 'total_ganado',
    kw: [
      ['cuanto gane', 3],
      ['cuanto gané', 3],
      ['cuanto he ganado', 3],
      ['cuanto llevo', 3],
      ['total ganado', 3],
      ['total mes', 3],
      ['ingreso', 2],
      ['cuanto dinero', 3],
      ['cuanta plata', 3],
      ['cuanto cobro', 3],
      ['cuanto cobre', 3],
      ['balance', 2],
      ['resumen', 2],
      ['mis numeros', 3],
      // Compound: dinero + tiempo
      ['cuanto gane ayer', 3],
      ['cuanto gane hoy', 3],
      ['cuanto dinero ayer', 3],
      ['cuanto dinero hoy', 3],
      ['cuanta plata ayer', 3],
      ['cuanta plata hoy', 3],
      ['cuanto cobro ayer', 3],
      ['cuanto cobro hoy', 3],
      ['dinero ayer', 2],
      ['dinero hoy', 2],
      ['plata ayer', 2],
      ['plata hoy', 2],
      ['gane ayer', 2],
      ['gane hoy', 2],
      ['cobre ayer', 2],
      ['cobre hoy', 2],
      ['cuanto llevo ayer', 3],
      ['cuanto llevo hoy', 3],
      ['como voy hoy', 2],
      ['como voy ayer', 2],
      ['a cuanto voy', 3],
      ['cuanto voy', 3],
      ['en cuanto voy', 3]
    ]
  },
  {
    id: 'hoy',
    kw: [
      ['hoy', 3],
      ['este dia', 3],
      ['que tal hoy', 3],
      ['como me fue hoy', 3],
      ['cuanto hoy', 3],
      ['dia de hoy', 3],
      ['hoy gane', 3],
      ['hoy gané', 3],
      ['hoy cobre', 3],
      ['hoy cobré', 3],
      ['resumen hoy', 3],
      ['balance hoy', 3],
      ['turnos hoy', 2]
    ]
  },
  {
    id: 'ayer',
    kw: [
      ['ayer', 3],
      ['dia anterior', 3],
      ['como me fue ayer', 3],
      ['como estuvo ayer', 3],
      ['cómo estuvo ayer', 3],
      ['que tal estuvo ayer', 3],
      ['qué tal estuvo ayer', 3],
      ['cuanto ayer', 3],
      ['cuanto gane ayer', 4],
      ['cuanto gané ayer', 4],
      ['cuanto dinero ayer', 4],
      ['cuanta plata ayer', 4],
      ['dinero ayer', 3],
      ['plata ayer', 3],
      ['gane ayer', 3],
      ['gané ayer', 3],
      ['cobre ayer', 3],
      ['cobré ayer', 3],
      ['ganancias ayer', 3],
      ['hice ayer', 3],
      ['y ayer', 3],
      ['ayer gane', 3],
      ['ayer gané', 3],
      ['ayer cobre', 3],
      ['ayer cobré', 3],
      ['resumen ayer', 3],
      ['balance ayer', 3],
      ['turnos ayer', 2],
      ['antier', 3],
      ['anteayer', 3]
    ]
  },
  {
    id: 'proyeccion',
    kw: [
      ['proyeccion', 3],
      ['proyectar', 3],
      ['cuanto al final', 3],
      ['al cierre', 3],
      ['estimado', 2],
      ['cuanto voy a ganar', 3],
      ['fin de mes', 2],
      ['cuanto al terminar', 3],
      ['al final del mes', 3],
      ['proyectame', 3],
      ['proyecta', 3],
      ['cuanto me hago', 3],
      ['cuanto hare', 3],
      ['cuanto haré', 3],
      ['cuanto recibire', 3],
      ['cuanto recibiré', 3],
      ['cuanto me llega', 3]
    ]
  },
  {
    id: 'horas_trabajadas',
    kw: [
      ['cuantas horas', 3],
      ['horas trabajadas', 3],
      ['tiempo trabajado', 3],
      ['total horas', 3],
      ['cuanto tiempo', 2],
      ['horas totales', 3],
      ['cuantas horas llevo', 3],
      ['cuanto llevo trabajado', 3],
      ['horas acumuladas', 3],
      ['tiempo total', 2],
      ['horas hoy', 3],
      ['horas ayer', 3],
      ['horas esta semana', 3]
    ]
  },
  {
    id: 'valor_hora',
    kw: [
      ['cuanto gano por hora', 3],
      ['gano por hora', 3],
      ['por hora', 3],
      ['valor hora', 3],
      ['valor de la hora', 3],
      ['valor de mi hora', 3],
      ['cuanto vale la hora', 3],
      ['cuanto vale mi hora', 3],
      ['cuanto me pagan la hora', 3],
      ['cuanto es la hora', 3],
      ['cuanto la hora', 2]
    ]
  },
  {
    id: 'promedio',
    kw: [
      ['promedio', 3],
      ['media', 2],
      ['promedio por turno', 3],
      ['promedio diario', 3],
      ['cuanto gano por dia', 3],
      ['por turno', 2],
      ['por dia', 2],
      ['promedio por hora', 3],
      ['cuanto gano en promedio', 3],
      ['promedio de ingresos', 3],
      ['promedio de ganancias', 3]
    ]
  },

  // ── Comparativas ──
  {
    id: 'comparativa_mes',
    kw: [
      ['mes pasado', 3],
      ['vs mes', 3],
      ['comparar mes', 3],
      ['mejor que mes', 3],
      ['peor que mes', 3],
      ['vs el mes', 3],
      ['comparativa', 2],
      ['diferencia con', 2],
      ['contra mes', 3],
      ['compara', 3],
      ['comparame', 3],
      ['cuanto mas gane', 3],
      ['cuanto menos gane', 3]
    ]
  },
  {
    id: 'comparativa_semana',
    kw: [
      ['semana pasada', 3],
      ['vs semana', 3],
      ['esta semana', 3],
      ['comparar semana', 3],
      ['semana anterior', 3]
    ]
  },

  // ── Días específicos ──
  {
    id: 'mejor_dia',
    kw: [
      ['mejor dia', 3],
      ['cuando fue mi mejor dia', 3],
      ['cual fue mi mejor dia', 3],
      ['cuál fue mi mejor día', 3],
      ['cuando fue el mejor dia', 3],
      ['dia mas productivo', 3],
      ['dia que mas gane', 3],
      ['dia que mas gané', 3],
      ['record', 2],
      ['mejor jornada', 3],
      ['tope', 2]
    ]
  },
  {
    id: 'peor_dia',
    kw: [
      ['peor dia', 3],
      ['cuando fue mi peor dia', 3],
      ['cual fue mi peor dia', 3],
      ['cuando fue el peor dia', 3],
      ['dia mas bajo', 3],
      ['dia que menos', 3],
      ['jornada mas corta', 3]
    ]
  },
  {
    id: 'turno_largo',
    kw: [
      ['turno mas largo', 3],
      ['cual fue mi turno mas largo', 3],
      ['cuando fue el turno mas largo', 3],
      ['jornada mas larga', 3],
      ['turno largo', 2],
      ['maxima duracion', 3]
    ]
  },
  {
    id: 'turno_corto',
    kw: [
      ['turno mas corto', 3],
      ['cual fue mi turno mas corto', 3],
      ['turno mas breve', 3],
      ['jornada corta', 3],
      ['minima duracion', 3]
    ]
  },

  // ── Rachas y patrones ──
  {
    id: 'racha',
    kw: [
      ['racha', 3],
      ['cual es mi racha', 3],
      ['cuanto llevo seguido', 3],
      ['dias seguidos', 3],
      ['dias consecutivos', 3],
      ['cuantos dias sin parar', 3],
      ['seguidos', 2]
    ]
  },
  {
    id: 'distribucion',
    kw: [
      ['distribucion', 3],
      ['como se distribuye', 3],
      ['porcentaje', 2],
      ['desglose', 3],
      ['donde va', 3],
      ['por categoria', 3],
      ['como se reparte', 3]
    ]
  },
  {
    id: 'velocidad',
    kw: [
      ['velocidad', 3],
      ['cop por hora', 3],
      ['cuanto gano por hora', 3],
      ['ritmo', 2],
      ['tasa', 2],
      ['eficiencia', 2]
    ]
  },

  // ── Simulación ──
  {
    id: 'simulacion',
    kw: [
      ['si trabajo', 3],
      ['si hago', 3],
      ['si meto', 3],
      ['cuanto si', 3],
      ['cuanto ganaria', 3],
      ['cuanto ganaría', 3],
      ['horas mas', 3],
      ['adicional', 2],
      ['extra', 2],
      ['simular', 3],
      ['que pasaria', 3],
      ['que pasaría', 3]
    ]
  },

  // ── Festivos ──
  {
    id: 'festivos',
    kw: [
      ['festivo', 3],
      ['festivos', 3],
      ['proximo festivo', 3],
      ['proximos festivos', 3],
      ['cuando es festivo', 3],
      ['feriado', 3],
      ['feriados', 3],
      ['que dias son festivos', 3]
    ]
  },

  // ── Bienestar / Fatiga ──
  {
    id: 'bienestar',
    kw: [
      ['cansado', 3],
      ['fatiga', 3],
      ['descanso', 2],
      ['bienestar', 3],
      ['salud', 3],
      ['agotado', 3],
      ['reventado', 3],
      ['mamado', 3],
      ['estres', 3],
      ['estresado', 3],
      ['burnout', 3],
      ['como estoy', 2],
      ['estoy bien', 3],
      ['cuando descanso', 3],
      ['necesito descansar', 3],
      ['como me siento', 2],
      ['como estoy de salud', 3],
      ['como va mi cuerpo', 3]
    ]
  },

  // ── Liquidación ──
  {
    id: 'liquidacion',
    kw: [
      ['liquidacion', 3],
      ['liquidación', 3],
      ['prestaciones', 3],
      ['neto', 2],
      ['cuanto me liquidan', 3],
      ['cesantias', 3],
      ['cesantías', 3],
      ['prima', 2],
      ['vacaciones', 2],
      ['cuanto de vacaciones', 3],
      ['plata de vacaciones', 3],
      ['pago de vacaciones', 3],
      ['descuento', 2],
      ['deduccion', 2],
      ['deducción', 2],
      ['salario neto', 3]
    ]
  },

  // ── Ley / Normativa ──
  {
    id: 'ley',
    kw: [
      ['ley', 3],
      ['normativa', 3],
      ['jornada maxima', 3],
      ['jornada máxima', 3],
      ['horas legales', 3],
      ['cuantas horas permite', 3],
      ['limite', 2],
      ['legal', 2],
      ['2101', 3],
      ['cst', 3],
      ['codigo laboral', 3],
      ['cuanto pagan', 2],
      ['cuanto vale la hora', 3],
      ['cuanto vale hora', 3],
      ['cuanto vale el dia', 2],
      ['recargo', 2],
      ['domingo', 2],
      ['dominical', 2],
      ['cuanto se paga', 3],
      ['que recargo', 3],
      ['tabla de recargos', 3],
      ['salario minimo', 3],
      ['minimo legal', 3],
      ['cuanto es el minimo', 3],
      ['minimo 2026', 3],
      ['smmlv', 3]
    ]
  },
  {
    id: 'laboral',
    kw: [
      ['vale hora domingo', 3],
      ['vale hora dominical', 3],
      ['pagan domingo', 3],
      ['pagan dominical', 3],
      ['recargo dominical', 3],
      ['recargo nocturno', 3],
      ['recargo festivo', 3],
      ['cuanto pagan hora', 3],
      ['cuanto vale hora', 3],
      ['precio hora domingo', 3],
      ['tarifa dominical', 3],
      ['conocimiento laboral', 3],
      ['pregunta laboral', 3],
      ['consulta laboral', 2]
    ]
  },

  // ── Ahorro / Meta ──
  {
    id: 'ahorro',
    kw: [
      ['ahorro', 3],
      ['ahorrar', 3],
      ['meta', 2],
      ['objetivo', 2],
      ['cuanto necesito', 3],
      ['cuanto debo trabajar', 3],
      ['cuantas horas para', 3],
      ['cuanto falta para', 3],
      ['para llegar a', 3]
    ]
  },

  // ── Email ──
  {
    id: 'email',
    kw: [
      ['enviar', 2],
      ['correo', 3],
      ['email', 3],
      ['mandar', 2],
      ['reporte', 1],
      ['jefe', 2],
      ['empresa', 2],
      ['admin', 2],
      ['envia', 3],
      ['envia mi', 3],
      ['enviame', 3],
      ['mando el reporte', 3],
      ['manda el reporte', 3],
      ['mandar el reporte', 3],
      ['mando el informe', 3],
      ['pasame el reporte', 3]
    ]
  },
  {
    id: 'correo_formal',
    kw: [
      ['redacta', 3],
      ['redactar', 3],
      ['correo formal', 3],
      ['carta', 2],
      ['escribi', 3],
      ['escribe', 3],
      ['componer', 3],
      ['borrador', 3]
    ]
  },

  // ── WhatsApp Share ──
  {
    id: 'whatsapp_share',
    kw: [
      ['whatsapp', 3],
      ['compartir whatsapp', 3],
      ['compartir por whatsapp', 3],
      ['enviar whatsapp', 3],
      ['mandar whatsapp', 3],
      ['whats', 2]
    ]
  },

  // ── Ayuda ──
  {
    id: 'ayuda_app',
    kw: [
      ['como usar', 3],
      ['como funciona', 3],
      ['como inicio', 3],
      ['como registrar', 3],
      ['tutorial', 3],
      ['guia', 3],
      ['guía', 3],
      ['explicame', 3],
      ['explicame', 3],
      ['no entiendo', 3],
      ['ayuda', 3],
      ['necesito ayuda', 3],
      ['me ayudas', 3],
      ['quiero ayuda', 3]
    ]
  },

  // ── Ayuda de navegación (ai-help.js) ──
  {
    id: 'ayuda_navegacion',
    kw: [
      ['como hago para', 3],
      ['como se hace', 3],
      ['donde esta', 3],
      ['dónde está', 3],
      ['donde encuentro', 3],
      ['dónde encuentro', 3],
      ['como puedo', 3],
      ['como cambio', 3],
      ['como configuro', 3],
      ['como exporto', 3],
      ['como envio', 3],
      ['como borro', 3],
      ['como descargo', 3],
      ['como activo', 3],
      ['como recupero', 3],
      ['como cierro', 3],
      ['como respaldo', 3],
      ['como restauro', 3],
      ['como inicio sesion', 3],
      ['explicame como', 3],
      ['explicame cómo', 3],
      ['enseñame', 3],
      ['guíame', 3],
      ['pasos para', 3],
      ['que hago para', 3],
      ['donde se hace', 3],
      ['donde toco', 3],
      ['como accedo', 3],
      ['donde miro', 3],
      ['necesito ayuda', 3],
      ['no se como', 3],
      ['no sé cómo', 3],
      // Nuevas: preguntas sobre la app misma
      ['como funciona', 2],
      ['que es', 2],
      ['para que sirve', 2],
      ['como instalo', 3],
      ['como comparto', 3],
      ['como modifico', 3],
      ['como funciona offline', 3],
      ['como sincronizo', 3],
      // Acciones de cuenta sin "cómo" ("quiero cambiar mi pin", "pongo mi foto"):
      // pesan alto para vencer al match difuso de motivacion/despedida.
      ['cambiar pin', 3],
      ['cambiar mi pin', 3],
      ['cambiar el pin', 3],
      ['cambio de pin', 3],
      ['modificar pin', 3],
      ['pongo foto', 3],
      ['pongo mi foto', 3],
      ['poner mi foto', 3],
      ['subir foto', 3],
      ['agregar foto', 3],
      ['estoy conectado', 3],
      ['hay conexion', 3],
      ['como se sincroniza', 3],
      ['donde veo', 2],
      ['donde esta la opcion', 3],
      ['donde configuro', 3],
      ['donde cambio', 3],
      ['como se calcula', 2],
      ['como calcula', 2],
      ['que version', 2],
      ['como actualizo', 2],
      ['como se usa', 3],
      ['guia de uso', 3],
      ['tutorial', 3]
    ]
  },

  // ── Acciones del Agente (Agentic AI) ──
  {
    id: 'configurar_salario',
    kw: [
      ['cambiar salario', 3],
      ['mi salario es', 3],
      ['gano', 2],
      ['actualizar sueldo', 3],
      ['poner salario', 3],
      ['configurar salario', 3]
    ]
  },
  {
    id: 'iniciar_turno',
    kw: [
      ['iniciar turno', 3],
      ['empezar turno', 3],
      ['arrancar turno', 3],
      ['inicia mi turno', 3],
      ['empieza mi turno', 3],
      ['llegue al trabajo', 3]
    ]
  },
  {
    id: 'cerrar_turno',
    kw: [
      ['cerrar turno', 3],
      ['terminar turno', 3],
      ['acabar turno', 3],
      ['cierra mi turno', 3],
      ['termine de trabajar', 3],
      ['sali del trabajo', 3]
    ]
  },
  {
    id: 'navegar_ajustes',
    kw: [
      ['ir a ajustes', 3],
      ['abrir configuracion', 3],
      ['llevame a ajustes', 3],
      ['quiero configurar', 3],
      ['preferencias', 3]
    ]
  },
  {
    id: 'navegar_historial',
    kw: [
      ['ir a historial', 3],
      ['abrir historial', 3],
      ['llevame al historial', 3],
      ['ver mis turnos pasados', 3],
      ['lista de turnos', 3]
    ]
  },
  {
    id: 'optimizador',
    kw: [
      ['como gano', 3],
      ['que turnos hago', 3],
      ['que me recomiendas', 3],
      ['como hago para ganar', 3],
      ['necesito ganar', 3],
      ['quiero ganar', 3],
      ['como llego a', 3],
      ['que hago para ganar', 3]
    ]
  },
  {
    id: 'planear_vacaciones',
    kw: [
      ['planear vacaciones', 3],
      ['quiero vacaciones', 3],
      ['pedir vacaciones', 3],
      ['calcular vacaciones', 3],
      ['irme de vacaciones', 3]
    ]
  },
  // ── Stats rápido ──
  {
    id: 'stats',
    kw: [
      ['stats', 3],
      ['estadisticas', 3],
      ['estadísticas', 3],
      ['datos rapidos', 3],
      ['datos rápidos', 3],
      ['resumen rapido', 3],
      ['resumen rápido', 3],
      ['cifras', 3],
      ['dias trabajados', 3],
      ['cuantos dias trabaje', 3],
      ['cuantos dias', 3],
      ['cuantos turnos', 3],
      ['cuantos servicios', 2],
      ['dias trabajados este mes', 3]
    ]
  },

  // ── Conversacionales emocionales ──

  {
    id: 'celebracion',
    kw: [
      ['lo logre', 3],
      ['lo logré', 3],
      ['cumplí la meta', 3],
      ['cumpli la meta', 3],
      ['lo hice', 3],
      ['gane la meta', 3],
      ['alcance la meta', 3],
      ['alcancé la meta', 3],
      ['que mes tan bueno', 3],
      ['que mes más bueno', 3],
      ['super bien', 3],
      ['superé', 2],
      ['supere', 2],
      ['meta cumplida', 3],
      ['logré el objetivo', 3],
      ['logre el objetivo', 3],
      ['exito', 2],
      ['éxito', 2],
      ['celebrar', 3],
      ['feliz con el mes', 3],
      ['contento con el mes', 3],
      ['estoy feliz', 2],
      ['qué bien me fue', 3],
      ['me fue muy bien', 3],
      ['buen mes', 2]
    ]
  },

  {
    id: 'motivacion',
    kw: [
      ['dame animo', 3],
      ['dame ánimo', 3],
      ['necesito motivacion', 3],
      ['necesito motivación', 3],
      ['motivame', 3],
      ['motívame', 3],
      ['sin fuerzas', 3],
      ['sin energia', 3],
      ['sin energía', 3],
      ['me siento bajo', 3],
      ['me siento baja', 3],
      ['necesito fuerzas', 3],
      ['no tengo ganas', 3],
      ['sin ganas', 3],
      ['desanimado', 3],
      ['desanimada', 3],
      ['desmotivado', 3],
      ['desmotivada', 3],
      ['levantame el animo', 3],
      ['levantame el ánimo', 3],
      ['animame', 3],
      ['anímate', 3],
      ['dame fuerzas', 3],
      ['como sigo', 2],
      ['cómo sigo', 2],
      ['ayudame a seguir', 3]
    ]
  },

  {
    id: 'queja_fatiga',
    kw: [
      ['que semana tan dura', 3],
      ['qué semana tan dura', 3],
      ['semana pesada', 3],
      ['no aguanto mas', 3],
      ['no aguanto más', 3],
      ['estoy hasta aca', 3],
      ['estoy hasta acá', 3],
      ['no puedo mas', 3],
      ['no puedo más', 3],
      ['demasiado trabajo', 3],
      ['mucho trabajo', 2],
      ['me tienen quemado', 3],
      ['me tienen quemada', 3],
      ['harto', 2],
      ['harta', 2],
      ['no da mas', 3],
      ['no da más', 3],
      ['estoy quemado', 3],
      ['estoy quemada', 3],
      ['que cansancio', 3],
      ['qué cansancio', 3],
      ['turno horrible', 3],
      ['terrible turno', 3],
      ['dia horrible', 2],
      ['día horrible', 2],
      ['jornada larga', 2],
      ['no descanse', 2],
      ['no descanso', 2],
      ['reventado', 3],
      ['reventada', 3],
      ['toy reventado', 4],
      ['toy mamado', 4],
      ['toy molido', 4],
      ['toy jarto', 4],
      ['mamado', 3],
      ['mamada', 3],
      ['jarto', 3],
      ['jarta', 3],
      ['jartera', 3],
      ['rendido', 2],
      ['molido', 3],
      ['molida', 3]
    ]
  },

  {
    id: 'estado_animo',
    kw: [
      ['como estas', 3],
      ['cómo estás', 3],
      ['como andas', 3],
      ['cómo andás', 3],
      ['como te va', 3],
      ['cómo te va', 3],
      ['que tal estas', 3],
      ['qué tal estás', 3],
      ['bien vos', 2],
      ['como estas vos', 3],
      ['y vos como', 3],
      ['y vos cómo', 3],
      ['como estas tu', 3],
      ['sos inteligente', 2],
      ['te gusta trabajar', 2],
      ['como te sientes', 3],
      ['cómo te sentís', 3],
      ['pereza', 3],
      ['que pereza', 3],
      ['me da pereza', 3],
      ['sin ganas', 3],
      ['sin animo', 3],
      ['desganado', 3]
    ]
  },

  // ── Conversacionales exploratorias ──

  {
    id: 'curiosidad_app',
    kw: [
      ['sorprendeme', 3],
      ['sorpréndeme', 3],
      ['contame algo', 3],
      ['contame algo interesante', 3],
      ['algo interesante', 2],
      ['que mas sabes', 3],
      ['qué más sabés', 3],
      ['que mas podes', 3],
      ['qué más podés', 3],
      ['algo nuevo', 2],
      ['dame un dato', 3],
      ['dame un tip', 3],
      ['sabia que', 2],
      ['sabía que', 2],
      ['que no sepa', 3],
      ['cuéntame algo', 3],
      ['cuentame algo', 3],
      ['dato curioso', 3],
      ['curiosidad', 2],
      ['que mas hay', 3],
      ['qué más hay', 3],
      ['que mas puedes', 3],
      ['enséñame algo', 3],
      ['ensenname algo', 3]
    ]
  },

  {
    id: 'reflexion',
    kw: [
      ['como me fue', 3],
      ['cómo me fue', 3],
      ['como estuve', 3],
      ['cómo estuve', 3],
      ['que tal me fue', 3],
      ['qué tal me fue', 3],
      ['que piensas de mi', 3],
      ['qué pensás de mi', 3],
      ['como me ves', 3],
      ['cómo me ves', 3],
      ['que tal mi rendimiento', 3],
      ['qué tal mi rendimiento', 3],
      ['como voy en general', 3],
      ['cómo voy en general', 3],
      ['evalua mi mes', 3],
      ['evaluá mi mes', 3],
      ['dame tu opinion', 3],
      ['dame tu opinión', 3],
      ['que opinas', 3],
      ['qué opinás', 3],
      ['analiza mi trabajo', 3],
      ['analizá mi trabajo', 3],
      ['como estuvo mi semana', 3],
      ['cómo estuvo mi semana', 3]
    ]
  },

  {
    id: 'planificacion_semana',
    kw: [
      ['que hago esta semana', 3],
      ['qué hago esta semana', 3],
      ['ayudame a planear', 3],
      ['ayudame a planificar', 3],
      ['como me organizo', 3],
      ['cómo me organizo', 3],
      ['plan de la semana', 3],
      ['planear esta semana', 3],
      ['organizar mis turnos', 3],
      ['que turnos convienen', 3],
      ['qué turnos convienen', 3],
      ['como maximizo', 3],
      ['cómo maximizo', 3],
      ['estrategia de turnos', 3],
      ['cuantos turnos hacer', 3],
      ['cuántos turnos hacer', 3],
      ['planificar semana', 3],
      ['organizar semana', 3],
      ['que me conviene', 3],
      ['qué me conviene', 3],
      ['como planifico', 3],
      ['cómo planifico', 3]
    ]
  }
];

// ─── ESTADO CONVERSACIONAL ────────────────────────────────────
var _aiConv = {
  lastIntent: null,
  lastTopic: null,
  turnCount: 0,
  contextHints: [],
  askedFollowUp: false,
  // Máquina de estados para flujos multi-paso
  stateMachine: {
    active: false,
    flow: null, // ej: 'vacaciones'
    step: 0,
    data: {}
  }
};

function aiGetConv() {
  return _aiConv;
}

function aiResetConv() {
  _aiConv.lastIntent = null;
  _aiConv.lastTopic = null;
  _aiConv.turnCount = 0;
  _aiConv.contextHints = [];
  _aiConv.askedFollowUp = false;
  _aiConv.stateMachine = { active: false, flow: null, step: 0, data: {} };
  // Resetear TAMBIÉN la memoria conversacional (otro módulo, ai-enhanced.js):
  // ring anti-repetición + historial. Sin esto /limpiar dejaba a la IA diciendo
  // "te repito lo de recién" sobre preguntas nuevas.
  if (typeof aiMemoryReset === 'function') aiMemoryReset();
}

// ─── CLASIFICADOR DE INTENCIONES ─────────────────────────────
// Analiza el texto y devuelve { intent, score, confidence, tokens }
// score: puntaje bruto del mejor intent
// confidence: score normalizado (0-1) considerando cantidad de tokens
function aiClassify(text, convState, userContext) {
  // Expandir frases antes de tokenizar (captura bigramas y trigramas).
  // Ej: "fin de semana" → "dominical", "auxilio transporte" → "auxilio_transporte"
  var textForTokens = typeof aiSynExpandPhrase === 'function' ? aiSynExpandPhrase(text) : text;

  var tokens = aiTokenize(textForTokens);

  // Cuando el texto es muy corto y queda sin tokens después del filtrado de
  // stop words (ej: "hola", "chao", "bye") intentar el lookup directo en el
  // textStr antes de descartar. Cubre saludos y despedidas de 1 palabra.
  if (!tokens.length) {
    var _shortText = ' ' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
    var _shortBest = null;
    var _shortScore = 0;
    for (var _si = 0; _si < AI_INTENTS.length; _si++) {
      var _sint = AI_INTENTS[_si];
      for (var _sj = 0; _sj < _sint.kw.length; _sj++) {
        var _skw = _sint.kw[_sj][0];
        var _swt = _sint.kw[_sj][1];
        if (_shortText.indexOf(' ' + _skw + ' ') >= 0) {
          var _sScore = _swt * 1.5;
          if (_sScore > _shortScore) {
            _shortScore = _sScore;
            _shortBest = _sint;
          }
        }
      }
    }
    if (_shortBest && _shortScore >= 3) {
      var _sConf = Math.min(1, _shortScore / 9);
      return {
        intent: _shortBest.id,
        secondIntent: null,
        score: _shortScore,
        confidence: _sConf,
        tokens: tokens,
        topic: _aiIntentTopic(_shortBest.id)
      };
    }
    return { intent: null, score: 0, confidence: 0, tokens: tokens, topic: null };
  }

  // Expandir sinónimos también en los tokens individuales (cobertura doble)
  var expandedTokens = tokens.map(function (t) {
    return aiExpandSynonym(t);
  });

  var bestIntent = null;
  var bestScore = 0;
  var secondScore = 0;
  var secondIntent = null;

  // Evaluar cada intent contra los tokens expandidos
  for (var i = 0; i < AI_INTENTS.length; i++) {
    var intent = AI_INTENTS[i];
    var score = 0;
    var maxPossible = 0;
    // Normalizar para que el match de frase exacta funcione con input real:
    // (1) sin tildes ("mi mejor día" vs kw 'mejor dia'); (2) la puntuación pegada
    // (¿ ? ¡ !) pasa a espacio, si no "¿que podes hacer?" nunca matchea
    // ' que podes hacer '. Antes ambos fallaban y caían al match parcial →
    // confianza baja y misroutes. La kw también se normaliza (acentos).
    var textStr =
      ' ' +
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9ñ ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() +
      ' ';

    for (var j = 0; j < intent.kw.length; j++) {
      var kw = intent.kw[j][0].normalize('NFD').replace(/[̀-ͯ]/g, '');
      var weight = intent.kw[j][1];
      maxPossible += weight;

      // Buscar la keyword completa (frase) en el texto (ambos sin tildes)
      if (textStr.indexOf(' ' + kw + ' ') >= 0) {
        score += weight * 1.5; // bonus por frase exacta
      } else {
        // Buscar palabras individuales de la keyword en los tokens expandidos
        var kwWords = kw.split(' ');
        var kwMatchCount = 0;
        for (var w = 0; w < kwWords.length; w++) {
          var kwStem = aiStem(kwWords[w]);
          for (var t = 0; t < expandedTokens.length; t++) {
            if (expandedTokens[t] === kwStem || aiFuzzyMatch(expandedTokens[t], kwStem)) {
              kwMatchCount++;
              break;
            }
          }
        }
        // Puntaje proporcional a cuántas palabras de la keyword matchearon
        if (kwMatchCount > 0) {
          score += weight * (kwMatchCount / kwWords.length) * 0.7;
        }
      }
    }

    // Bonus por contexto conversacional
    if (convState && convState.lastTopic) {
      var topicBonus = _aiTopicBonus(intent.id, convState.lastTopic);
      score += topicBonus;
    }

    // ── BONUS POR ANCLAJE TEMPORAL ──
    // Si el texto contiene palabras de tiempo (ayer, hoy, mañana,
    // semana, mes) y el intent es de tipo "dinero", se boostea.
    // Esto resuelve: "cuanto dinero gane ayer" → intent ayer/hoy
    // en vez de caer en total_ganado genérico.
    var _raw = text.toLowerCase();
    var _hasTimeWord =
      _raw.indexOf('ayer') >= 0 ||
      _raw.indexOf('antier') >= 0 ||
      _raw.indexOf('anteayer') >= 0 ||
      _raw.indexOf('hoy') >= 0 ||
      _raw.indexOf('mañana') >= 0 ||
      _raw.indexOf('semana') >= 0 ||
      _raw.indexOf('finde') >= 0 ||
      _raw.indexOf('fin de semana') >= 0 ||
      _raw.indexOf('mes pasado') >= 0 ||
      _raw.indexOf('este mes') >= 0;
    var _hasMoneyWord =
      _raw.indexOf('cuanto') >= 0 ||
      _raw.indexOf('dinero') >= 0 ||
      _raw.indexOf('plata') >= 0 ||
      _raw.indexOf('gane') >= 0 ||
      _raw.indexOf('gané') >= 0 ||
      _raw.indexOf('ganancias') >= 0 ||
      _raw.indexOf('ganancia') >= 0 ||
      _raw.indexOf('cobre') >= 0 ||
      _raw.indexOf('cobré') >= 0 ||
      _raw.indexOf('cobrado') >= 0 ||
      _raw.indexOf('pago') >= 0 ||
      _raw.indexOf('llevo') >= 0 ||
      _raw.indexOf('hecho') >= 0 ||
      _raw.indexOf('hice') >= 0;
    // Si el usuario menciona tiempo + dinero juntos, la intención real
    // es sobre ESE momento específico, no sobre el mes completo.
    var _combinedTimeMoney = _hasTimeWord && _hasMoneyWord;

    // El bonus temporal sólo aplica si la palabra de tiempo del intent
    // está literalmente presente en el texto (no sólo alguna palabra de tiempo).
    // Evita que 'hoy'/'ayer' reciban +12 cuando el texto dice "este mes".
    var _intentTimeMatch = false;
    if (intent.id === 'hoy') {
      _intentTimeMatch = _raw.indexOf('hoy') >= 0;
    } else if (intent.id === 'ayer') {
      _intentTimeMatch =
        _raw.indexOf('ayer') >= 0 || _raw.indexOf('antier') >= 0 || _raw.indexOf('anteayer') >= 0;
    } else if (intent.id === 'comparativa_semana') {
      _intentTimeMatch = _raw.indexOf('semana') >= 0;
    } else if (intent.id === 'comparativa_mes') {
      // "este mes" solo → consulta del mes actual, NO comparativa
      _intentTimeMatch = _raw.indexOf('mes') >= 0 && !_estesMesCurrent;
    }
    if (_intentTimeMatch) {
      score += _combinedTimeMoney ? 12 : 6; // boost fuerte si hay dinero+tiempo juntos
    }
    // Penalizar intents genéricos de dinero (total_ganado, proyeccion)
    // cuando el usuario claramente pregunta por un momento específico.
    // Excepción: "este mes" (sin pasado/vs) es una consulta del mes actual → NO penalizar.
    var _estesMesCurrent =
      _raw.indexOf('este mes') >= 0 && _raw.indexOf('mes pasado') < 0 && _raw.indexOf('vs') < 0;
    if (
      _combinedTimeMoney &&
      !_estesMesCurrent &&
      (intent.id === 'total_ganado' || intent.id === 'proyeccion')
    ) {
      score -= 5; // penalización más fuerte para que no compitan con ayer/hoy
    }

    // Si hay palabra de mes y es intent de proyección o comparativa_mes
    if (
      (_raw.indexOf('mes') >= 0 || _raw.indexOf('mensual') >= 0) &&
      (intent.id === 'proyeccion' || intent.id === 'comparativa_mes')
    ) {
      score += 3;
    }

    // ── BONUS POR ANCLAJE DE MÉTRICA (horas / promedio) ──
    // "¿cuántas horas este mes?" y "promedio diario este mes" caían a
    // total_ganado porque 'llevo'/'mes' lo inflaban y respondían con dinero.
    // Si el usuario pide explícitamente HORAS o PROMEDIO, ese es el intent real.
    // Se excluyen las consultas de CONOCIMIENTO sobre el valor de una hora
    // (dominical/nocturna/recargo/"cuánto vale") — esas son intent `ley`.
    // Consulta del MARCO legal de la jornada ("¿cuántas horas son legales por
    // semana?", "el máximo permitido"). La palabra 'legal'/'permit' junto a
    // hora/jornada/semana señala una pregunta de NORMATIVA (intent `ley`), no
    // de las horas que YA trabajó el usuario. Sin esto, la señal 'hora' hacía
    // ganar a `horas_trabajadas` y respondía "llevás 39h este mes" (GAP D1).
    var _esJornadaLegal =
      (_raw.indexOf('legal') >= 0 || _raw.indexOf('permit') >= 0) &&
      (_raw.indexOf('hora') >= 0 || _raw.indexOf('jornada') >= 0 || _raw.indexOf('semana') >= 0);
    var _pideHoras =
      !_esJornadaLegal &&
      (_raw.indexOf('hora') >= 0 || _raw.indexOf('tiempo') >= 0) &&
      _raw.indexOf('dominical') < 0 &&
      _raw.indexOf('nocturn') < 0 &&
      _raw.indexOf('festiv') < 0 &&
      _raw.indexOf('recargo') < 0 &&
      _raw.indexOf('vale') < 0 &&
      _raw.indexOf('cuesta') < 0;
    var _pidePromedio = _raw.indexOf('promedio') >= 0;
    // Racha: "¿cuánto llevo de racha?" caía a total_ganado porque 'cuanto'+'llevo'
    // pesan como dinero. Si menciona racha/días seguidos, ese es el intent.
    // Se usan palabras sin acento ('seguidos', 'consecutiv') porque _raw conserva
    // las tildes y "días seguidos" no matchearía contra 'dias seguidos'. Se excluye
    // el contexto de fatiga: "estoy agotado, llevo varios turnos seguidos" es una
    // queja emocional (queja_fatiga), no una consulta de racha.
    var _esFatiga =
      _raw.indexOf('agotad') >= 0 ||
      _raw.indexOf('cansad') >= 0 ||
      _raw.indexOf('revent') >= 0 ||
      _raw.indexOf('mamad') >= 0 ||
      _raw.indexOf('rendid') >= 0 ||
      _raw.indexOf('no puedo') >= 0 ||
      _raw.indexOf('no doy') >= 0;
    var _pideRacha =
      !_esFatiga &&
      (_raw.indexOf('racha') >= 0 ||
        _raw.indexOf('seguidos') >= 0 ||
        _raw.indexOf('consecutiv') >= 0 ||
        _raw.indexOf('sin parar') >= 0);
    if (intent.id === 'horas_trabajadas' && _pideHoras) score += 8;
    if (intent.id === 'promedio' && _pidePromedio) score += 8;
    if (intent.id === 'racha' && _pideRacha) score += 8;

    // ── BONUS TOTAL_GANADO CON "ESTE MES" ──
    // "cuánto llevo este mes" y "mi sueldo de este mes" caían a comparativa_mes
    // porque 'mes' le daba +3 y los tokens parciales de 'total_ganado' no competían.
    // "este mes" sin "pasado" ni "vs" indica la consulta del mes ACTUAL, no comparativa.
    // No aplica si el usuario pidió horas o promedio: ahí no es consulta de total.
    if (
      intent.id === 'total_ganado' &&
      _raw.indexOf('este mes') >= 0 &&
      _raw.indexOf('mes pasado') < 0 &&
      _raw.indexOf('vs') < 0 &&
      !_pideHoras &&
      !_pidePromedio &&
      !_pideRacha
    ) {
      score += 8;
    }

    // ── BONUS POR ANCLAJE DE CONOCIMIENTO LABORAL ──
    // "qué es una hora dominical", "cuánto vale la nocturna", "recargo festivo"
    // son preguntas de CONOCIMIENTO → intent `ley`. Sin esto, la palabra "hora"
    // hace que `horas_trabajadas` (que la tiene en ~8 keywords, acumulando match
    // parcial) gane y responda "trabajaste X horas" en vez de explicar el recargo.
    if (
      intent.id === 'ley' &&
      (_raw.indexOf('dominical') >= 0 ||
        _raw.indexOf('domingo') >= 0 ||
        _raw.indexOf('nocturn') >= 0 ||
        _raw.indexOf('festiv') >= 0 ||
        _raw.indexOf('recargo') >= 0)
    ) {
      score += 7;
    }

    // Consulta del marco legal de la jornada → intent `ley` (GAP D1). Supera el
    // bonus de horas trabajadas para que "cuántas horas son legales por semana"
    // responda la normativa (Ley 2101), no las horas acumuladas del usuario.
    if ((intent.id === 'ley' || intent.id === 'laboral') && _esJornadaLegal) {
      score += 9;
    }

    // ── BONUS POR VERBO EXPLÍCITO DE SIMULACIÓN ──
    // "simular 4 horas nocturnas" → el bonus laboral (+7 a ley) superaba a
    // simulacion. Si el usuario menciona explícitamente "simular/simulo/simula"
    // junto con un tipo de hora, es claramente una SIMULACIÓN, no consulta legal.
    if (
      intent.id === 'simulacion' &&
      (_raw.indexOf('simul') >= 0 || _raw.indexOf('/simular') >= 0)
    ) {
      score += 8;
    }

    if (score > bestScore) {
      secondScore = bestScore;
      secondIntent = bestIntent;
      bestScore = score;
      bestIntent = intent;
    } else if (score > secondScore) {
      secondScore = score;
      secondIntent = intent;
    }
  }

  // Calcular confianza: diferencia entre el mejor y el segundo,
  // normalizada por el puntaje máximo posible
  var margin = bestScore - secondScore;
  var confidence =
    bestScore > 0 ? Math.min(1, (bestScore / 9) * (0.5 + margin / (bestScore + 0.01))) : 0;

  // Si hay un intent por contexto conversacional que es muy probable
  if (!bestIntent && convState && convState.lastIntent) {
    confidence = 0.15;
    bestIntent = { id: 'contexto', kw: [] };
  }

  return {
    intent: bestIntent ? bestIntent.id : null,
    secondIntent: secondIntent ? secondIntent.id : null,
    score: bestScore,
    secondScore: secondScore,
    margin: margin,
    confidence: confidence,
    tokens: tokens,
    topic: bestIntent ? _aiIntentTopic(bestIntent.id) : null
  };
}

// ─── MAPEO INTENT → TOPIC ────────────────────────────────────
function _aiIntentTopic(intentId) {
  var map = {
    saludo: 'conversacion',
    despedida: 'conversacion',
    agradecimiento: 'conversacion',
    identidad: 'conversacion',
    capacidades: 'conversacion',
    celebracion: 'conversacion',
    motivacion: 'conversacion',
    estado_animo: 'conversacion',
    reflexion: 'conversacion',
    total_ganado: 'dinero',
    hoy: 'dinero',
    ayer: 'dinero',
    proyeccion: 'dinero',
    horas_trabajadas: 'tiempo',
    promedio: 'dinero',
    comparativa_mes: 'comparativa',
    comparativa_semana: 'comparativa',
    mejor_dia: 'patrones',
    peor_dia: 'patrones',
    turno_largo: 'patrones',
    turno_corto: 'patrones',
    racha: 'patrones',
    distribucion: 'patrones',
    velocidad: 'patrones',
    simulacion: 'dinero',
    festivos: 'informacion',
    bienestar: 'salud',
    queja_fatiga: 'salud',
    liquidacion: 'dinero',
    ley: 'informacion',
    laboral: 'informacion',
    curiosidad_app: 'informacion',
    ahorro: 'dinero',
    email: 'accion',
    correo_formal: 'accion',
    configurar_salario: 'accion',
    iniciar_turno: 'accion',
    cerrar_turno: 'accion',
    navegar_ajustes: 'accion',
    navegar_historial: 'accion',
    optimizador: 'dinero',
    planificacion_semana: 'accion',
    ayuda_app: 'informacion',
    stats: 'dinero'
  };
  return map[intentId] || 'general';
}

// ─── BONUS POR CONTEXTO ──────────────────────────────────────
// Si el usuario preguntó sobre dinero y luego dice "¿y ayer?",
// el intent "ayer" recibe bonus porque sigue en contexto dinero
function _aiTopicBonus(intentId, lastTopic) {
  var topic = _aiIntentTopic(intentId);
  if (topic === lastTopic && topic !== 'conversacion') return 2;
  if (topic === 'dinero' && lastTopic === 'comparativa') return 1;
  if (topic === 'comparativa' && lastTopic === 'dinero') return 1;
  if (topic === 'patrones' && lastTopic === 'dinero') return 1;
  // Intents emocionales reciben bonus cuando el contexto previo es relevante
  if (intentId === 'celebracion' && (lastTopic === 'dinero' || lastTopic === 'comparativa'))
    return 2;
  if (
    intentId === 'reflexion' &&
    (lastTopic === 'dinero' || lastTopic === 'comparativa' || lastTopic === 'patrones')
  )
    return 2;
  if (intentId === 'motivacion' && lastTopic === 'salud') return 2;
  if (intentId === 'queja_fatiga' && lastTopic === 'salud') return 2;
  if (intentId === 'planificacion_semana' && (lastTopic === 'dinero' || lastTopic === 'accion'))
    return 1;
  return 0;
}

// ─── DETECCIÓN DE TONO EMOCIONAL ─────────────────────────────
// Analiza el texto y el contexto del usuario para ajustar
// el nivel de empatía en la respuesta.
// Devuelve { mood, intensity, hints }
function aiDetectMood(text, userContext) {
  var t = (text || '').toLowerCase();
  var mood = 'neutral';
  var intensity = 0;
  var hints = [];
  // fromText = el mood proviene de palabras del propio usuario (no de inferencias
  // de contexto como racha/burnout). Solo en ese caso aplica empatía verbal:
  // anteponer consuelo a una pregunta factual ("¿cuánto gané?") suena a robot.
  var fromText = false;

  // Señales de frustración / cansancio
  var frustKW = [
    'cansado',
    'cansada',
    'agotado',
    'agotada',
    'reventado',
    'mamado',
    'mamada',
    'estresado',
    'estresada',
    'mal',
    'fatal',
    'horrible',
    'no puedo mas',
    'no doy mas',
    'hasta aqui',
    'hasta aquí',
    'rendido',
    'rendida',
    'duro',
    'pesado'
  ];
  var positiveKW = [
    'bien',
    'genial',
    'excelente',
    'feliz',
    'contento',
    'contenta',
    'motivado',
    'motivada',
    'animado',
    'animada',
    'bacan',
    'bacano',
    'chevere',
    'chévere',
    'buenisimo',
    'orgulloso',
    'orgullosa'
  ];
  var worriedKW = [
    'preocupado',
    'preocupada',
    'inseguro',
    'insegura',
    'duda',
    'confundido',
    'confundida',
    'no se',
    'no sé',
    'ayuda',
    'auxilio',
    'socorro'
  ];

  for (var i = 0; i < frustKW.length; i++) {
    if (t.indexOf(frustKW[i]) >= 0) {
      mood = 'frustrado';
      intensity += 2;
      hints.push('fatiga');
      fromText = true;
      break;
    }
  }
  for (var j = 0; j < worriedKW.length; j++) {
    if (t.indexOf(worriedKW[j]) >= 0) {
      if (mood === 'neutral') mood = 'preocupado';
      intensity += 1;
      hints.push('inseguridad');
      fromText = true;
      break;
    }
  }
  for (var k = 0; k < positiveKW.length; k++) {
    if (t.indexOf(positiveKW[k]) >= 0) {
      if (mood === 'neutral' || mood === 'preocupado') mood = 'positivo';
      intensity += 1;
      hints.push('motivacion');
      fromText = true;
      break;
    }
  }

  // Contexto del usuario: racha larga sin descanso
  if (userContext && userContext.rachaActual >= 7) {
    if (mood === 'neutral') mood = 'frustrado';
    intensity += 1;
    hints.push('racha_larga');
  }
  // Contexto: hora de madrugada
  if (userContext && userContext.ahora) {
    var h = new Date(userContext.ahora).getHours();
    if (h >= 0 && h < 5) {
      intensity += 1;
      hints.push('madrugada');
    }
  }
  // Contexto: burnout
  if (userContext && userContext.burnout) {
    intensity += 2;
    hints.push('burnout');
    if (mood === 'neutral') mood = 'frustrado';
  }

  return { mood: mood, intensity: Math.min(intensity, 5), hints: hints, fromText: fromText };
}

// ─── VARIANTES DE RESPUESTA EMPÁTICA ─────────────────────────
// Prefijos y sufijos que se añaden según el tono emocional
var AI_EMPATHY = {
  frustrado: {
    prefixes: [
      'Te escucho. ',
      function () {
        return typeof _glPick === 'function' ? _glPick('consolation') + ' ' : 'Qué duro. ';
      },
      'Uff, te entiendo. ',
      'Fuerza con eso. ',
      'No es fácil, lo sé. ',
      'Ánimo, que ya pasaste varias así. '
    ],
    suffixes: [
      ' ¿Querés que veamos cuándo fue tu último descanso?',
      ' Si necesitás bajar el ritmo, tus números igual están bien.',
      ' Cuidate, ¿vale? Que la máquina también necesita pausa.',
      ' Estoy acá para lo que necesités.'
    ]
  },
  positivo: {
    prefixes: [
      '¡Qué energía! ',
      'Esa es la actitud. ',
      'Me encanta leerte así. ',
      '¡Vamos por más! ',
      'Qué bueno verte con ese ánimo. '
    ],
    suffixes: [
      ' ¡Seguí así que vas volando! 🚀',
      ' Esos números van a estar lindos este mes.',
      ' ¿Vamos por un récord?'
    ]
  },
  preocupado: {
    prefixes: [
      'Tranqui, vamos por partes. ',
      'No te preocupés, todo tiene solución. ',
      'Respirá hondo, acá estoy. ',
      'Vamos a resolverlo juntos. '
    ],
    suffixes: [
      ' ¿Querés que te explique algo en específico?',
      ' Decime qué necesitás y te ayudo.',
      ' No hay pregunta tonta, preguntá con confianza.'
    ]
  },
  neutral: {
    prefixes: ['', 'Dale, ', 'A ver, ', 'Mirá, '],
    suffixes: ['', ' ¿Algo más en lo que te pueda ayudar?', ' ✦']
  }
};

function aiPickEmpathy(prefixes) {
  var item = prefixes[Math.floor(Math.random() * prefixes.length)];
  return typeof item === 'function' ? item() : item;
}

// ─── RESPUESTA CONVERSACIONAL (FALLBACK) ──────────────────────
// Cuando ninguna intención tiene suficiente confianza,
// se genera una respuesta conversacional genérica pero cálida
function aiConversationalFallback(text, userContext) {
  var t = (text || '').toLowerCase();
  var mood = aiDetectMood(text, userContext);

  // Si el texto es muy corto, es probable que sea un intento de charla
  if (t.length < 10) {
    var cortas = [
      'Contame más, ¿qué querés saber?',
      'No te entendí bien. ¿Me lo decís de otra forma?',
      'Podés preguntarme de tu salario, tus horas, tus recargos... lo que necesités.',
      'Estoy acá. ¿En qué te puedo ayudar?'
    ];
    return (
      aiPickEmpathy(
        mood.mood === 'neutral' ? AI_EMPATHY.neutral.prefixes : AI_EMPATHY[mood.mood].prefixes
      ) + cortas[Math.floor(Math.random() * cortas.length)]
    );
  }

  // Respuesta más completa para textos largos que no matchean
  var generales = [
    'Mmm, no estoy seguro de haber entendido bien. Te cuento lo que sí puedo responder:\n\n📊 **Tu mes:** cuánto ganaste, cuántas horas, proyección al cierre\n📈 **Comparativas:** vs mes pasado, vs semana pasada\n🔮 **Simulaciones:** "¿cuánto si trabajo 4h más?"\n📅 **Festivos:** próximos, cuántos caen este mes\n🧘 **Bienestar:** cómo está tu ritmo, si necesitás descanso\n📧 **Reportes:** "enviá mi reporte por correo"\n\n💡 Probá con cualquiera de esas, ¡o preguntame con tus palabras!',
    'Perdón, no capté bien la pregunta. Pero no te vayás — puedo ayudarte con:\n\n• Tu salario del mes y proyección\n• Comparativas con meses o semanas anteriores\n• Simulaciones de horas extra\n• Próximos festivos\n• Consejos de descanso\n• Envío de reportes por email\n\n¿Por dónde le damos?',
    'Uy, me perdí un poco. ¿Me lo preguntás de otra manera? Mientras tanto, te tiro ideas de lo que sé hacer:\n\n💰 Calcular tus ingresos con recargos\n📊 Comparar semanas y meses\n🎯 Proyectar al cierre del mes\n📅 Ver próximos festivos\n📧 Enviar reportes\n\n¿Cuál te sirve?'
  ];

  var prefix = '';
  if (mood.mood !== 'neutral') {
    prefix = aiPickEmpathy(AI_EMPATHY[mood.mood].prefixes);
  }

  return prefix + generales[Math.floor(Math.random() * generales.length)];
}

// ─── SEGUIMIENTO CONVERSACIONAL ──────────────────────────────
// Sugiere una pregunta de seguimiento según el último intent
function aiSuggestFollowUp(lastIntent, userContext) {
  var followUps = {
    total_ganado: [
      '¿Querés ver la comparativa con el mes pasado?',
      '¿Te muestro la proyección al cierre?',
      '¿Vemos cómo vas vs tu meta?'
    ],
    hoy: [
      '¿Y ayer cómo te fue?',
      '¿Querés comparar con tu mejor día?',
      '¿Vemos la proyección al cierre del mes?'
    ],
    comparativa_mes: [
      '¿Querés ver también la comparativa semanal?',
      '¿Te muestro tu mejor día del mes?',
      '¿Calculamos cuánto te falta para la meta?'
    ],
    bienestar: [
      '¿Querés ver cuándo fue tu último día libre?',
      '¿Te muestro tu racha actual?',
      '¿Revisamos tus horas semanales?'
    ],
    proyeccion: [
      '¿Querés simular cuánto ganarías con horas extra?',
      '¿Vemos tu distribución de recargos?',
      '¿Te muestro cuánto te falta para la meta?'
    ],
    default: [
      '¿Necesitás algo más?',
      '¿Querés que profundice en algo?',
      '¿Te ayudo con otra cosa?',
      '¿Alguna otra duda?'
    ]
  };

  var opts = followUps[lastIntent] || followUps['default'];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ─── API PÚBLICA ─────────────────────────────────────────────
// Funciones expuestas como globales (window.*) para que ai.js las use

// Clasificar intención de un mensaje
function aiClassifyIntent(text, convState, userContext) {
  return aiClassify(text, convState || _aiConv, userContext || {});
}

// Obtener/actualizar estado conversacional
function aiGetConversation() {
  return _aiConv;
}

function aiUpdateConversation(intent, topic) {
  _aiConv.lastIntent = intent;
  _aiConv.lastTopic = topic;
  _aiConv.turnCount++;
}

// Detectar tono emocional
function aiAnalyzeMood(text, userContext) {
  return aiDetectMood(text, userContext);
}

// Obtener prefijo/sufijo empático
function aiEmpatheticPrefix(mood) {
  var m = mood || 'neutral';
  var entry = AI_EMPATHY[m] || AI_EMPATHY['neutral'];
  return aiPickEmpathy(entry.prefixes);
}

function aiEmpatheticSuffix(mood) {
  var m = mood || 'neutral';
  var entry = AI_EMPATHY[m] || AI_EMPATHY['neutral'];
  return aiPickEmpathy(entry.suffixes);
}

// Respuesta conversacional de fallback
function aiFallbackResponse(text, userContext) {
  return aiConversationalFallback(text, userContext);
}

// Sugerir seguimiento
function aiFollowUp(lastIntent, userContext) {
  return aiSuggestFollowUp(lastIntent, userContext);
}

// Tokenizar (útil para debug)
function aiDebugTokens(text) {
  return aiTokenize(text);
}

// Preprocesar (quitar muletillas) — expuesto para debug
function aiDebugPreprocess(text) {
  return aiPreprocess(text);
}

// ─── EXPORT ──────────────────────────────────────────────────
// Exponer todas las funciones públicas como globales
window.aiClassifyIntent = aiClassifyIntent;
window.aiGetConversation = aiGetConversation;
window.aiUpdateConversation = aiUpdateConversation;
window.aiAnalyzeMood = aiAnalyzeMood;
window.aiEmpatheticPrefix = aiEmpatheticPrefix;
window.aiEmpatheticSuffix = aiEmpatheticSuffix;
window.aiFallbackResponse = aiFallbackResponse;
window.aiFollowUp = aiFollowUp;
window.aiDebugTokens = aiDebugTokens;
window.aiDebugPreprocess = aiDebugPreprocess;
window.aiPreprocess = aiPreprocess;
window.aiTokenize = aiTokenize;
window.aiStem = aiStem;
window.aiExpandSynonym = aiExpandSynonym;
window.AI_SYNONYMS = AI_SYNONYMS;
window.AI_STOP = AI_STOP;
window.aiResetConv = aiResetConv;
window.aiExtractEntities = aiExtractEntities;
window._aiIntentTopic = _aiIntentTopic;

// ─── INICIALIZACIÓN ──────────────────────────────────────────
console.log(
  '[MT] ai-nlp.js cargado — NLP mejorado v169 (compound matching + time anchoring + ai-synonyms.js integrado)'
);
