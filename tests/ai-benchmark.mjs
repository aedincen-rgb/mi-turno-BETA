// ════════════════════════════════════════════════════════════════
//  MI TURNO · tests/ai-benchmark.mjs
//  Benchmark FORMAL de la IA local, con metodología profesional de NLU:
//   · CheckList (Ribeiro et al., ACL 2020): MFT / INV / DIR
//       https://aclanthology.org/2020.acl-main.442/
//   · CLINC150: accuracy de intents + manejo Out-of-Scope (OOS)
//       https://aclanthology.org/D19-1131/
//
//  Mide la IA real en Chromium (pipeline completo, modo invitado) y emite
//  un scorecard con métricas por capacidad y un puntaje compuesto 0-100.
//
//    node tests/ai-benchmark.mjs   (informativo; exit 0 salvo error fatal)
// ════════════════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

var PORT = 8000;
var BASE = 'http://127.0.0.1:' + PORT + '/app.html';
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }
var REACT = readIf('node_modules/react/umd/react.production.min.js');
var REACTDOM = readIf('node_modules/react-dom/umd/react-dom.production.min.js');
var CHART = readIf('node_modules/chart.js/dist/chart.umd.js');
function findChrome() {
  var base = process.env.HOME + '/.cache/ms-playwright';
  try {
    var dirs = fs.readdirSync(base).filter(function (d) {
      return d.indexOf('chromium-') === 0 && d.indexOf('headless') < 0;
    });
    for (var i = 0; i < dirs.length; i++) {
      var p = base + '/' + dirs[i] + '/chrome-linux64/chrome';
      if (fs.existsSync(p)) return p;
      var p2 = base + '/' + dirs[i] + '/chrome-linux/chrome';
      if (fs.existsSync(p2)) return p2;
    }
  } catch (_) {}
  return undefined;
}
async function waitForServer(url, tries) {
  for (var i = 0; i < tries; i++) {
    try { var r = await fetch(url); if (r.ok) return true; } catch (_) {}
    await new Promise(function (res) { setTimeout(res, 300); });
  }
  return false;
}

var server = null;
var alreadyUp = await waitForServer(BASE, 1);
if (!alreadyUp) server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });

var browser, exitCode = 0;
try {
  var up = alreadyUp || (await waitForServer(BASE, 30));
  if (!up) throw new Error('servidor no respondió en :' + PORT);
  browser = await chromium.launch({ executablePath: findChrome(), args: ['--headless=old', '--no-sandbox'] });
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  var page = await ctx.newPage();
  await page.route('**/*', function (route) {
    var u = route.request().url();
    var H = { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' };
    if (REACTDOM && u.indexOf('/react-dom/') !== -1) return route.fulfill({ body: REACTDOM, headers: H });
    if (REACT && u.indexOf('/react/') !== -1) return route.fulfill({ body: REACT, headers: H });
    if (CHART && u.indexOf('chart.js') !== -1) return route.fulfill({ body: CHART, headers: H });
    return route.continue();
  });
  await page.addInitScript(function () {
    try {
      var uid = 'g';
      localStorage.setItem('mt_session', JSON.stringify({ uid: uid, email: 'i@l', guest: true, cloud: false }));
      localStorage.setItem('mt_onboarding_done', '1');
      localStorage.setItem('mt_sc_' + uid, JSON.stringify(true));
      localStorage.setItem('mt_s_' + uid, JSON.stringify(2000000));
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () { return typeof window.aiAnswer === 'function'; }, null, { timeout: 20000 });

  var R = await page.evaluate(async function () {
    // ── Estado con datos realistas (mes actual + mes pasado para comparar) ──
    function mk(monthsAgo, day, hStart, durH) {
      var d = new Date(); d.setMonth(d.getMonth() - monthsAgo); d.setDate(day);
      var ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hStart, 0, 0);
      return { id: 'b' + monthsAgo + '-' + day + '-' + hStart, inicio: ini.toISOString(), fin: new Date(ini.getTime() + durH * 3600000).toISOString() };
    }
    var vh = Math.round(2000000 / 240);
    var turnos = [];
    for (var mo = 0; mo < 2; mo++) { turnos.push(mk(mo, 3, 14, 8)); turnos.push(mk(mo, 6, 22, 8)); turnos.push(mk(mo, 9, 6, 9)); turnos.push(mk(mo, 12, 14, 8)); }
    var n = new Date();
    var mes = turnos.filter(function (t) { var d = new Date(t.inicio); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); });
    var calc = window.doCalc(mes, null, new Date(), vh);
    var st = { turnos: mes, turnosAll: turnos, activo: null, calc: calc, vh: vh, salario: 2000000, session: { uid: 'g', email: 'i@l' } };
    var truthTotal = Math.round(calc.totalCOP);

    function intentOf(q) { var r = window.aiClassifyIntent(q) || {}; return r.intent || null; }
    async function answer(q) {
      window.aiResetConv && window.aiResetConv();
      var r = await Promise.resolve(window.aiAnswer(q, st));
      return (r && typeof r === 'object' ? (r.text || '') : (r || ''));
    }

    var report = { mft: [], inv: [], dir: [], oos: [], quality: [] };

    // ── A. MFT — accuracy de intent (in-scope) ──
    var mftIntent = [
      ['cuánto gané hoy', ['hoy', 'total_ganado']],
      ['cuánto llevo este mes', ['total_ganado']],
      ['cuánto gané ayer', ['ayer']],
      ['cuánto voy a ganar este mes', ['proyeccion', 'total_ganado']],
      ['cuántas horas trabajé', ['horas_trabajadas']],
      ['cuánto gano por hora', ['valor_hora']],
      ['cuántos festivos trabajé este mes', ['festivos']],
      ['cómo va mi racha', ['racha']],
      ['cuál es mi mejor día', ['mejor_dia']],
      ['compara con el mes pasado', ['comparativa_mes']],
      ['días trabajados este mes', ['stats']],
      ['estoy agotado', ['queja_fatiga', 'bienestar', 'estado_animo']],
      ['hola', ['saludo']],
      ['chao', ['despedida']],
      ['qué podés hacer', ['capacidades', 'curiosidad_app']],
      ['mi salario es 2 millones', ['configurar_salario']],
      ['cuánto vale la hora nocturna', ['ley', 'valor_hora']],
      ['simular 4 horas nocturnas', ['simulacion', 'simular']]
    ];
    for (var i = 0; i < mftIntent.length; i++) {
      var got = intentOf(mftIntent[i][0]);
      report.mft.push({ q: mftIntent[i][0], exp: mftIntent[i][1], got: got, ok: mftIntent[i][1].indexOf(got) >= 0 });
    }

    // ── MFT-respuesta (asesor/acción/concepto, vía respuesta real) ──
    var mftResp = [
      ['cómo reparto mi sueldo', ['50/30/20']],
      ['cuánto me dan si me despiden', ['Indemnización', 'indemnización']],
      ['calculá mi liquidación', ['Liquidación', 'liquidación', 'prestaciones', 'cesantías']],
      ['quiero ahorrar 5 millones en un año', ['Plan de ahorro', 'ahorro']],
      ['tengo una oferta de 3 millones', ['Comparador', 'oferta']],
      ['qué incluye el sueldo base', ['Sueldo base', 'valor hora', 'Valor hora']],
      ['quiero ganar 200 mil extra', ['Optimizador', 'turnos nocturnos']]
    ];
    for (var j = 0; j < mftResp.length; j++) {
      var t = (await answer(mftResp[j][0])).toLowerCase();
      var hit = false;
      for (var k = 0; k < mftResp[j][1].length; k++) { if (t.indexOf(mftResp[j][1][k].toLowerCase()) >= 0) { hit = true; break; } }
      report.mft.push({ q: mftResp[j][0], exp: mftResp[j][1], got: hit ? 'OK' : '(otro)', ok: hit });
    }

    // ── B. INV — invarianza (paráfrasis/typos/jerga → mismo intent) ──
    var invGroups = [
      { base: ['hoy', 'total_ganado'], variants: ['cuánto gané hoy', 'kuanto gane hoy', 'oye cuánto saqué hoy', 'me podrías decir cuánto llevo hoy', 'cuanta plata hice hoy'] },
      { base: ['total_ganado'], variants: ['cuánto llevo este mes', 'cuanta lana llevo este mes', 'en cuánto voy este mes', 'cuánto he ganado este mes'] },
      { base: ['queja_fatiga', 'bienestar', 'estado_animo'], variants: ['estoy cansado', 'uf qué cansancio', 'estoy reventado', 'no doy más del cansancio'] },
      { base: ['ayer'], variants: ['cuánto gané ayer', 'kuanto saque ayer', 'cuánta lana hice ayer'] },
      { base: ['total_ganado', 'hoy', 'proyeccion'], variants: ['parce en cuánto voy', 'q tal la plata este mes', 'oe cuánta plata he hecho'] },
      { base: ['horas_trabajadas', 'total_ganado', 'stats'], variants: ['cuánto camello llevo', 'cuánto he camellado este mes'] }
    ];
    invGroups.forEach(function (g) {
      var results = g.variants.map(function (v) { var gi = intentOf(v); return { v: v, got: gi, ok: g.base.indexOf(gi) >= 0 }; });
      var okCount = results.filter(function (r) { return r.ok; }).length;
      report.inv.push({ base: g.base.join('|'), total: g.variants.length, ok: okCount, results: results });
    });

    // ── C. DIR — direccional (perturbar SÍ debe cambiar el intent) ──
    var dirPairs = [
      ['cuánto gané hoy', 'cuánto gané ayer'],
      ['cuánto llevo este mes', 'cuánto gano por hora'],
      ['cuánto gané este mes', 'quiero ganar 200 mil extra'],
      ['cuántas horas trabajé', 'cuánto vale la hora']
    ];
    dirPairs.forEach(function (p) {
      var a = intentOf(p[0]), b = intentOf(p[1]);
      report.dir.push({ a: p[0], b: p[1], ia: a, ib: b, ok: a !== b });
    });

    // ── D. OOS — fuera de dominio (debe declinar con gracia, no fabricar) ──
    var oosList = ['qué hora es', 'qué temperatura hace hoy', 'cómo está el clima', 'quién ganó el mundial', 'cuál es la capital de francia', 'recomiéndame una película', 'quién es el presidente', 'cuántos años tiene messi'];
    // OOS false-positives: in-scope que SE PARECE a OOS y NO debe declinarse.
    var oosFalsePos = ['cuánto vale mi hora', 'cuántas horas hice', 'cuál es mi mejor día'];
    var declineMarks = ['no estoy seguro', 'no encontré', 'no entend', 'puedo ayudarte', 'puedo responder', 'cuál se acerca', 'algunas cosas que puedo', 'tus turnos', 'no sé', 'no tengo', 'se me escapa', 'asistente de', 'algo de tu trabajo'];
    for (var o = 0; o < oosList.length; o++) {
      var rt = (await answer(oosList[o])).toLowerCase();
      var declines = false;
      for (var d2 = 0; d2 < declineMarks.length; d2++) { if (rt.indexOf(declineMarks[d2]) >= 0) { declines = true; break; } }
      // Fabricación: afirma un total del mes en pesos como si respondiera
      var fabricates = /llev[áa]s\s+\$/.test(rt) || /ganaste\s+\$/.test(rt);
      report.oos.push({ q: oosList[o], ok: declines && !fabricates, snippet: rt.slice(0, 50) });
    }
    // OOS false-positives: NO deben declinar (deben responder de verdad)
    for (var fp = 0; fp < oosFalsePos.length; fp++) {
      var ft = (await answer(oosFalsePos[fp])).toLowerCase();
      var wronglyDeclined = ft.indexOf('se me escapa') >= 0;
      report.oos.push({ q: '[in-scope] ' + oosFalsePos[fp], ok: !wronglyDeclined, snippet: ft.slice(0, 50) });
    }

    // ── E. Calidad de respuesta (sobre todas las in-scope) ──
    var qualityQ = mftIntent.map(function (m) { return m[0]; }).concat(mftResp.map(function (m) { return m[0]; }));
    for (var c = 0; c < qualityQ.length; c++) {
      var txt = await answer(qualityQ[c]);
      var leak = /Procesando acci|undefined|NaN|\[object|\$\s*NaN/.test(txt);
      var gender = /jornada nocturno|guardia nocturno|la lucas|la billete|el jornada/.test(txt);
      var empty = !txt || txt.trim().length === 0;
      // Groundedness: si afirma "llevás $X" debe coincidir con doCalc
      var grounded = true;
      var mm = txt.match(/llev[áa]s\s+\*{0,2}\$\s*([\d.]+)/i);
      if (mm) {
        var stated = parseInt(mm[1].replace(/[^\d]/g, ''), 10);
        if (stated && truthTotal && Math.abs(stated - truthTotal) / truthTotal > 0.02) grounded = false;
      }
      report.quality.push({ q: qualityQ[c], leak: leak, gender: gender, empty: empty, grounded: grounded, ok: !leak && !gender && !empty && grounded });
    }

    // ── F. LEG — exactitud legal VIGENTE (protege Tier 0/1, Ley 2466/2025) ──
    // Atrapa regresiones si alguien revierte un valor date-aware: la app debe
    // afirmar el recargo dominical VIGENTE (sube por fases 80→90→100), la
    // noche desde 7pm y el UVT 2026. El % dominical NO se hardcodea: se deriva
    // de getRecargoFestivo(hoy) para no romperse en cada fase de la reforma.
    var domVigente = (typeof getRecargoFestivo === 'function'
      ? Math.round(getRecargoFestivo(new Date()) * 100)
      : 80) + '%';
    var legChecks = [
      { q: 'cuál es la tabla de recargos', must: [domVigente] },
      { q: 'cuánto pagan un domingo trabajado', must: [domVigente] },
      { q: 'cuánto vale mi hora dominical diurna', must: [domVigente] },
      { q: 'tengo que declarar renta este año', must: ['1.400'] }
    ];
    report.legal = [];
    for (var L = 0; L < legChecks.length; L++) {
      var lt = (await answer(legChecks[L].q)).toLowerCase();
      var allHit = true;
      for (var lm = 0; lm < legChecks[L].must.length; lm++) {
        if (lt.indexOf(legChecks[L].must[lm].toLowerCase()) < 0) { allHit = false; break; }
      }
      report.legal.push({ q: legChecks[L].q, must: legChecks[L].must, ok: allHit, snippet: lt.slice(0, 70) });
    }

    return { report: report, truthTotal: truthTotal };
  });

  // ── Cómputo de métricas ──
  var rep = R.report;
  function pct(ok, total) { return total ? Math.round((ok / total) * 1000) / 10 : 0; }
  var mftOk = rep.mft.filter(function (x) { return x.ok; }).length;
  var mftAcc = pct(mftOk, rep.mft.length);
  var invOk = 0, invTotal = 0;
  rep.inv.forEach(function (g) { invOk += g.ok; invTotal += g.total; });
  var invRate = pct(invOk, invTotal);
  var dirOk = rep.dir.filter(function (x) { return x.ok; }).length;
  var dirRate = pct(dirOk, rep.dir.length);
  var oosOk = rep.oos.filter(function (x) { return x.ok; }).length;
  var oosRate = pct(oosOk, rep.oos.length);
  var qOk = rep.quality.filter(function (x) { return x.ok; }).length;
  var qRate = pct(qOk, rep.quality.length);
  var legArr = rep.legal || [];
  var legOk = legArr.filter(function (x) { return x.ok; }).length;
  var legRate = pct(legOk, legArr.length);

  var composite = Math.round(mftAcc * 0.25 + invRate * 0.15 + dirRate * 0.15 + oosRate * 0.15 + qRate * 0.15 + legRate * 0.15);

  function bar(p) { var n = Math.round(p / 5); return '█'.repeat(n) + '░'.repeat(20 - n); }
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   BENCHMARK IA LOCAL · Mi Turno   (CheckList + CLINC150)      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('  MFT  Intent accuracy   ' + bar(mftAcc) + ' ' + mftAcc + '%  (' + mftOk + '/' + rep.mft.length + ')');
  console.log('  INV  Invarianza/robust ' + bar(invRate) + ' ' + invRate + '%  (' + invOk + '/' + invTotal + ')');
  console.log('  DIR  Direccional       ' + bar(dirRate) + ' ' + dirRate + '%  (' + dirOk + '/' + rep.dir.length + ')');
  console.log('  OOS  Fuera de dominio  ' + bar(oosRate) + ' ' + oosRate + '%  (' + oosOk + '/' + rep.oos.length + ')');
  console.log('  QLT  Calidad respuesta ' + bar(qRate) + ' ' + qRate + '%  (' + qOk + '/' + rep.quality.length + ')');
  console.log('  LEG  Exactitud legal   ' + bar(legRate) + ' ' + legRate + '%  (' + legOk + '/' + legArr.length + ')');
  console.log('  ──────────────────────────────────────────────────────────');
  console.log('  ★ PUNTAJE COMPUESTO    ' + bar(composite) + ' ' + composite + '/100');
  console.log('  ──────────────────────────────────────────────────────────');

  // Detalle de fallos (para pulir)
  function fails(arr, fmt) { arr.filter(function (x) { return !x.ok; }).forEach(function (x) { console.log('    ✗ ' + fmt(x)); }); }
  console.log('\n  Fallos a pulir:');
  fails(rep.mft, function (x) { return '[MFT] "' + x.q + '" → ' + x.got + ' (esperado ' + (x.exp.join ? x.exp.join('/') : x.exp) + ')'; });
  rep.inv.forEach(function (g) { g.results.filter(function (r) { return !r.ok; }).forEach(function (r) { console.log('    ✗ [INV] "' + r.v + '" → ' + r.got + ' (esperaba ' + g.base + ')'); }); });
  fails(rep.dir, function (x) { return '[DIR] "' + x.a + '"=' + x.ia + ' vs "' + x.b + '"=' + x.ib + ' (no difieren)'; });
  fails(rep.oos, function (x) { return '[OOS] "' + x.q + '" → ' + x.snippet; });
  fails(rep.quality, function (x) { return '[QLT] "' + x.q + '"' + (x.leak ? ' LEAK' : '') + (x.gender ? ' GÉNERO' : '') + (x.empty ? ' VACÍO' : '') + (!x.grounded ? ' NO-GROUNDED' : ''); });
  fails(legArr, function (x) { return '[LEG] "' + x.q + '" → falta ' + x.must.join('+') + ' · ' + x.snippet; });
  console.log('');
} catch (err) {
  console.error('Error en el benchmark:', err && err.message ? err.message : err);
  exitCode = 2;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
process.exit(exitCode);
