// ════════════════════════════════════════════════════════════════
//  MI TURNO · SERVICE WORKER
//  Split cache: SHELL_CACHE (archivos de la app, se invalida en cada release)
//               CDN_CACHE   (librerías externas, sobrevive entre releases)
const SHELL_CACHE = 'mt-shell-v367'; // bump con scripts/bump.sh
const CDN_CACHE = 'mt-cdn-v2'; // solo bump cuando cambien URLs de CDN

// Supabase SDK y Chart.js son self-hosted → van en appResources (SHELL_CACHE).
// React, jsPDF y XLSX siguen desde cdnjs (CDN_CACHE, sobrevive entre releases).
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

const appResources = [
  './',
  './index.html',
  './app.html',
  './js/lib/supabase.min.js',
  './js/lib/chart.min.js',
  './manifest.json',
  './sw.js',
  './version.json',
  './privacy.html',
  './sitemap.xml',
  './robots.txt',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './img/logo-mark.svg',
  // CSS (39 archivos)
  './css/base/variables.css',
  './css/base/reset.css',
  './css/base/typography.css',
  './css/base/background.css',
  './css/base/media-queries.css',
  './css/base/blur-fix.css',
  './css/layout/header.css',
  './css/layout/scroll.css',
  './css/layout/hero-card.css',
  './css/layout/progress-bar.css',
  './css/layout/action-button.css',
  './css/layout/shapes.css',
  './css/layout/fade-animations.css',
  './css/layout/misc-animations.css',
  './css/layout/misc.css',
  './css/components/cards.css',
  './css/components/buttons.css',
  './css/components/buttons-glass.css',
  './css/components/inputs.css',
  './css/components/switches.css',
  './css/components/config-rows.css',
  './css/components/dashboard-hero.css',
  './css/components/dashboard-kpis.css',
  './css/components/dashboard-chart.css',
  './css/components/dashboard-enhance.css',
  './css/components/dashboard-gauges.css',
  './css/components/dashboard-tip.css',
  './css/components/assistant-chat.css',
  './css/components/history-list.css',
  './css/components/fast-pin.css',
  './css/components/auth-screen.css',
  './css/components/misc.css',
  './css/components/skeleton.css',
  './css/components/error-boundary.css',
  './css/components/dark-mode-overrides.css',
  './css/components/liquid-glass.css',
  './css/modals/overlay.css',
  './css/modals/modal-card.css',
  './css/modals/bottom-sheets.css',
  './css/modals/auth-screen.css',
  './css/modals/assistant-chat.css',
  './css/modals/time-picker.css',
  './css/modals/splash.css',
  './css/modals/misc.css',
  './css/modals/manage-account.css',
  './css/modals/onboarding.css',
  './css/modals/whats-new.css',
  './css/modals/delete-account.css',
  './css/modals/dark-overrides.css',
  './css/animations/keyframes.css',
  // JS (39 archivos)
  './js/config.js',
  './js/theme-boot.js',
  './js/config/react-init.js',
  './js/config/env.js',
  './js/config/viewport-fix.js',
  './js/config/globals.js',
  './js/utils/storage.js',
  './js/utils/format.js',
  './js/utils/animated-amount.js',
  './js/utils/haptic.js',
  './js/utils/error-logger.js',
  './js/utils/network.js',
  './js/utils/uuid.js',
  './js/utils/icons.js',
  './js/utils/festivos.js',
  './js/utils/time.js',
  './js/utils/validation.js',
  './js/utils/otp.js',
  './js/utils/password-hash.js',
  './js/services/supabase.js',
  './js/services/supabase-init.js',
  './js/services/calculator.js',
  './js/services/quincena.js',
  './js/services/data.js',
  './js/services/session-sync.js',
  './js/services/backup.js',
  './js/services/ai-synonyms.js',
  './js/services/ai-semantic.js',
  './js/services/ai-query.js',
  './js/services/ai-episodes.js',
  './js/services/ai-nlp.js',
  './js/services/ai-intents-registry.js',
  './js/services/ai.js',
  './js/services/gender-lang.js',
  './js/services/ai-enhanced.js',
  './js/services/ai-engage.js',
  './js/services/ai-calendar.js',
  './js/services/push-notifications.js',
  './js/services/export-files.js',
  './js/services/export-email.js',
  './js/services/ai-help.js',
  './js/services/ai-app-kb.js',
  './js/services/voice-agent.js',
  './js/services/ai-achievements.js',
  './js/services/audio-sfx.js',
  './js/services/ai-history.js',
  './js/services/ai-memory.js',
  './js/services/ai-greeting.js',
  './js/services/ai-insights.js',
  './js/services/ai-proactive.js',
  './js/services/ai-psychology.js',
  './js/services/ai-knowledge.js',
  './js/services/ai-auditor.js',
  './js/services/ai-agent-cards.js',
  './js/services/ai-conversation.js',
  './js/services/ai-advisor.js',
  './js/services/ai-router.js',
  './js/services/ai-collector.js',
  './js/services/ai-reasoning.js',
  './js/services/ai-responder.js',
  './js/tabs/home.js',
  './js/tabs/dashboard.js',
  './js/tabs/assistant.js',
  './js/tabs/history.js',
  './js/tabs/config.js',
  './js/tabs/sync-queue.js',
  './js/modals/error-viewer.js',
  './js/modals/splash.js',
  './js/modals/email-compose-card.js',
  './js/modals/forgot-password.js',
  './js/modals/forgot-pin.js',
  './js/modals/pin-setup.js',
  './js/modals/manage-account.js',
  './js/modals/diagnostico.js',
  './js/modals/asignar-pins.js',
  './js/modals/usuarios.js',
  './js/modals/export-report.js',
  './js/modals/onboarding.js',
  './js/modals/whats-new.js',
  './js/modals/delete-account.js',
  './js/app/auth-screen.js',
  './js/app/fast-pin-screen.js',
  './js/app/skeleton.js',
  './js/app/app-main.js',
  './js/app/root.js',
  './js/app/error-boundary.js',
  './js/app/sw-register.js',
  './js/app/init.js',
  './js/app/install-prompt.js'
];

// ── Install: shell siempre fresco, CDN solo si el cache no existe ──
self.addEventListener('install', function (e) {
  e.waitUntil(
    Promise.all([
      // Shell: siempre re-fetch con cache:'reload' para invalidar el HTTP cache de Vercel
      // (los assets tienen headers immutable/1yr, sin esto se sirve la versión vieja)
      caches.open(SHELL_CACHE).then(function (c) {
        return Promise.allSettled(
          appResources.map(function (u) {
            return fetch(u, { cache: 'reload' }).then(function (r) {
              if (r && r.ok) return c.put(u, r);
            });
          })
        );
      }),
      // CDN: solo descargar si el cache no existe — evita re-fetch de ~1MB en cada deploy
      caches.has(CDN_CACHE).then(function (exists) {
        if (exists) return;
        return caches.open(CDN_CACHE).then(function (c) {
          return Promise.allSettled(
            CDN.map(function (u) {
              return fetch(u, { mode: 'cors', cache: 'reload' }).then(function (r) {
                if (r && r.ok) return c.put(u, r);
              });
            })
          );
        });
      })
    ]).then(function () {
      return self.skipWaiting();
    })
  );
});

// ── Activate: limpiar caches viejos, habilitar Navigation Preload ──
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              // Conservar el SHELL_CACHE actual y el CDN_CACHE; borrar todo lo demás
              return k !== SHELL_CACHE && k !== CDN_CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        // Navigation Preload: el browser lanza el fetch de navegación en paralelo
        // al boot del SW, eliminando ~50-100ms de latencia en cargas de shell.
        if (self.registration.navigationPreload) {
          return self.registration.navigationPreload.enable();
        }
      })
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        // Avisar a todos los tabs que el SW se activó (para debug / diagnóstico)
        return self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (c) {
            c.postMessage({ type: 'SW_ACTIVATED', version: SHELL_CACHE });
          });
        });
      })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && (e.data === 'skipWaiting' || e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.indexOf('supabase') >= 0) return;

  var sameHost = u.hostname === self.location.hostname;
  var isCDN =
    u.hostname.indexOf('cdnjs') >= 0 ||
    u.hostname.indexOf('jsdelivr') >= 0 ||
    u.hostname.indexOf('fonts.g') >= 0;
  var isStatic = sameHost || isCDN;
  if (!isStatic) return;

  var path = u.pathname;
  var isShell =
    sameHost &&
    (path === '/' ||
      path.endsWith('/index.html') ||
      path.endsWith('/sw.js') ||
      path.endsWith('/version.json') ||
      path.endsWith('/manifest.json'));

  // ── Shell crítico → network-first con Navigation Preload ──
  if (isShell) {
    e.respondWith(
      (function () {
        // e.preloadResponse es la respuesta prefetched en paralelo al boot del SW
        var networkPromise = Promise.resolve(e.preloadResponse).then(function (preloaded) {
          return preloaded || fetch(e.request, { cache: 'no-store' });
        });
        return networkPromise
          .then(function (r) {
            if (r && r.ok) {
              var clone = r.clone();
              caches.open(SHELL_CACHE).then(function (c) {
                c.put(e.request, clone);
              });
            }
            return r;
          })
          .catch(function () {
            return caches.match(e.request);
          });
      })()
    );
    return;
  }

  // ── Assets (JS/CSS/img/CDN) → cache-first, busca en ambos caches ──
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request)
        .then(function (r) {
          if (r && r.ok) {
            var clone = r.clone();
            var target = isCDN ? CDN_CACHE : SHELL_CACHE;
            caches.open(target).then(function (c) {
              c.put(e.request, clone);
            });
          }
          return r;
        })
        .catch(function () {
          return cached;
        });
    })
  );
});
