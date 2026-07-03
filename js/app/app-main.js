// ════════════════════════════════════════════════════════════════
//  MI TURNO · app/app-main.js
//  Componente principal App con tabs y lógica de sincronización
// ════════════════════════════════════════════════════════════════

function App(props) {
  var session = props.session;
  var onSessionPatch = props.onSessionPatch;
  var uid = session.uid;
  var loadedRef = useRef(false);

  var th = useState(leer('mt_theme', 'light'));
  var theme = th[0],
    setTheme = th[1];
  useEffect(
    function () {
      var root = document.documentElement;
      root.classList.add('theme-transitioning');
      root.setAttribute('data-theme', theme);
      grabar('mt_theme', theme);
      var m = document.getElementById('metaThemeColor');
      if (m) m.setAttribute('content', theme === 'dark' ? '#0a0c12' : '#f5f7fb');
      var tid = setTimeout(function () {
        root.classList.remove('theme-transitioning');
      }, 400);
      return function () {
        clearTimeout(tid);
      };
    },
    [theme]
  );

  var s1 = useState([]);
  var turnos = s1[0],
    setTurnos = s1[1];
  var s2 = useState(null);
  var activo = s2[0],
    setActivo = s2[1];
  var s3 = useState(SMIN);
  var salario = s3[0],
    setSalario = s3[1];
  // Flag explícito: el usuario confirmó su salario en Ajustes al menos una vez
  var sc = useState(false);
  var salarioConfigured = sc[0],
    setSalarioConfigured = sc[1];
  var s4 = useState(Date.now());
  var ahora = s4[0],
    setAhora = s4[1];
  var s6 = useState('home');
  var tab = s6[0],
    setTab = s6[1];
  var s7 = useState(false);
  var showOlv = s7[0],
    setShowOlv = s7[1];
  // Prompt de geovalla: llegada/salida del trabajo detectada (modo "preguntar")
  var sg = useState(null);
  var geoPrompt = sg[0],
    setGeoPrompt = sg[1];
  var s9 = useState(true);
  var loading = s9[0],
    setLoading = s9[1];
  var sx = useState(false);
  var splashExit = sx[0],
    setSplashExit = sx[1];
  var s10 = useState(null);
  var toast = s10[0],
    setToast = s10[1];
  var pss = useState(false);
  var showPinSetup = pss[0],
    setShowPinSetup = pss[1];

  // Preferencias avanzadas (auxilio, prestaciones, quincena manual)
  var pf = useState(normalizePrefs(null));
  var prefs = pf[0],
    setPrefs = pf[1];

  // Detección de estado de internet
  var on = useState(isOnline());
  var isOnlineStatus = on[0],
    setIsOnline = on[1];

  useEffect(function () {
    function updateNet() {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    return function () {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
    };
  }, []);

  // Efecto para procesar la cola de sincronización cuando el estado online cambia
  useEffect(
    function () {
      if (isOnlineStatus && uid) {
        processQueue(uid);
      }
      // Suscribirse a cambios de estado online para reintentar la cola.
      // IMPORTANTE: guardamos la misma referencia para el remove. Antes
      // se creaban dos funciones distintas (add vs remove) y el listener
      // nunca se desregistraba → leak + duplicados al reabrir el efecto.
      var onlineListener = function () {
        processQueue(uid);
      };
      onOnline(onlineListener);
      return function () {
        removeOnlineListener(onlineListener);
      };
    },
    [isOnlineStatus, uid]
  );

  var cp = useState(false);
  var compact = cp[0],
    setCompact = cp[1];
  var compactRef = useRef(false);
  compactRef.current = compact;

  // Ref para leer el tab actual dentro del popstate handler sin stale closure
  var tabRef = useRef('home');
  tabRef.current = tab;

  // Dirección de animación al cambiar tab por swipe ('from-right' | 'from-left' | null)
  var sadd = useState(null);
  var swipeAnimDir = sadd[0],
    setSwipeAnimDir = sadd[1];

  function changeTabSwipe(newTab, dir) {
    setSwipeAnimDir(dir);
    setTab(newTab);
    setTimeout(function () {
      setSwipeAnimDir(null);
    }, 300);
  }

  // ── Lazy tabs: solo la activa y la previa se mantienen en DOM ──
  var mountedRef = useRef({ home: true });
  useEffect(
    function () {
      mountedRef.current[tab] = true;
    },
    [tab]
  );
  function _lazy(id, el) {
    return mountedRef.current[id]
      ? h('div', { style: { display: tab === id ? 'block' : 'none' }, key: id }, el)
      : null;
  }

  // Cuántas acciones quedan en la cola de sync (para el indicador del header).
  // Event-driven: solo actualiza cuando la cola cambia, no polling continuo.
  var spd = useState(0);
  var syncPending = spd[0],
    setSyncPending = spd[1];
  useEffect(
    function () {
      if (!uid) return;
      function updateQueueCount() {
        try {
          var all = leer('mt_sync_queue', {});
          var q = all && all[uid] ? all[uid] : [];
          setSyncPending(q.length);
        } catch (_) {}
      }
      updateQueueCount();
      window.__updateQueueCount = updateQueueCount;
      return function () {
        if (window.__updateQueueCount === updateQueueCount) window.__updateQueueCount = null;
      };
    },
    [uid]
  );

  // ── Badge API: muestra sync pendiente en el ícono de la PWA ──
  useEffect(
    function () {
      if (typeof navigator === 'undefined') return;
      if (navigator.setAppBadge) {
        if (syncPending > 0) {
          navigator.setAppBadge(syncPending).catch(function () {});
        } else {
          navigator.clearAppBadge().catch(function () {});
        }
      }
    },
    [syncPending]
  );

  // ── Gesto "volver" en Android (PWA): atrapar para no cerrar la app ──
  useEffect(
    function () {
      // Crea la primera entrada de historial. Sin ella el primer gesto sale de la app.
      history.pushState({ mt: 'app' }, '');

      function onPopState() {
        // Reinsertar la entrada de inmediato para que el siguiente gesto tampoco cierre.
        history.pushState({ mt: 'app' }, '');
        // Si hay un handler de modal registrado (bottom sheet abierto), invocarlo.
        if (typeof window._mtHandleBack === 'function') {
          window._mtHandleBack();
          return;
        }
        // Si no estamos en home, volver a home.
        if (tabRef.current !== 'home') {
          setTab('home');
        }
        // Si ya estamos en home: el pushState de arriba absorbe el gesto, la app sigue abierta.
      }

      window.addEventListener('popstate', onPopState);
      return function () {
        window.removeEventListener('popstate', onPopState);
      };
    },
    [] // solo al montar — el ref lee el tab fresco en cada evento
  );

  // ── Swipe horizontal entre tabs ──
  useEffect(
    function () {
      var el = scrRef.current;
      if (!el) return;
      var x0 = 0,
        y0 = 0,
        isHoriz = null,
        active = false;
      var TAB_IDS = ['home', 'dashboard', 'ai', 'history', 'config'];
      var THRESH = window.innerWidth * 0.25;

      function onSwipeStart(ev) {
        x0 = ev.touches[0].clientX;
        y0 = ev.touches[0].clientY;
        isHoriz = null;
        active = true;
      }
      function onSwipeMove(ev) {
        if (!active || isHoriz === false) return;
        var dx = ev.touches[0].clientX - x0;
        var dy = ev.touches[0].clientY - y0;
        if (isHoriz === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          isHoriz = Math.abs(dx) > Math.abs(dy);
        }
      }
      function onSwipeEnd(ev) {
        if (!active || !isHoriz) {
          active = false;
          isHoriz = null;
          return;
        }
        active = false;
        isHoriz = null;
        var dx = ev.changedTouches[0].clientX - x0;
        if (Math.abs(dx) < THRESH) return;
        var idx = TAB_IDS.indexOf(tabRef.current);
        if (idx < 0) return;
        if (dx < 0) {
          if (idx < TAB_IDS.length - 1) {
            haptic && haptic();
            changeTabSwipe(TAB_IDS[idx + 1], 'from-right');
          }
        } else {
          if (tabRef.current === 'ai') {
            if (typeof window._mtOpenAiMenu === 'function') {
              haptic && haptic();
              window._mtOpenAiMenu();
            }
          } else if (idx > 0) {
            haptic && haptic();
            changeTabSwipe(TAB_IDS[idx - 1], 'from-left');
          }
        }
      }
      function onSwipeCancel() {
        active = false;
        isHoriz = null;
      }
      el.addEventListener('touchstart', onSwipeStart, { passive: true });
      el.addEventListener('touchmove', onSwipeMove, { passive: true });
      el.addEventListener('touchend', onSwipeEnd, { passive: true });
      el.addEventListener('touchcancel', onSwipeCancel, { passive: true });
      return function () {
        el.removeEventListener('touchstart', onSwipeStart);
        el.removeEventListener('touchmove', onSwipeMove);
        el.removeEventListener('touchend', onSwipeEnd);
        el.removeEventListener('touchcancel', onSwipeCancel);
      };
    },
    [] // refs son estables — el handler lee tabRef.current fresco en cada evento
  );

  // ── BANNER DE CONEXIÓN · DOM directo (seguro, sin React) ──
  // Inyecta/remueve un elemento en document.body.
  // Cero riesgo de congelar la app o romper scroll.
  var _connBannerEl = null;
  var _connBannerT = null;

  function _connState() {
    var esLocal = !session || session.guest || session.pinOnly;
    if (!navigator.onLine) return { k: 'off', t: 'Sin conexión a internet' };
    if (!esLocal && syncPending > 0 && typeof CLOUD_MODE !== 'undefined' && CLOUD_MODE) {
      return {
        k: 'connecting',
        t: 'Sincronizando ' + syncPending + ' cambio' + (syncPending !== 1 ? 's' : '') + '…'
      };
    }
    if (esLocal) return { k: 'on', t: 'Conectado (modo local)' };
    if (typeof CLOUD_MODE === 'undefined' || !CLOUD_MODE)
      return { k: 'off', t: 'Sin conexión a la nube' };
    // guard intencional: getRealtimeStatus lo define supabase.js; puede no estar listo en el primer render
    var rt = typeof getRealtimeStatus === 'function' ? getRealtimeStatus() : null;
    if (rt === 'SUBSCRIBED') return { k: 'on', t: 'Conectado a Supabase' };
    if (rt === 'CHANNEL_ERROR' || rt === 'TIMED_OUT' || rt === 'CLOSED')
      return { k: 'off', t: 'Sin conexión a Supabase' };
    return { k: 'connecting', t: 'Conectando a Supabase…' };
  }

  function _dismissBanner() {
    if (_connBannerT) {
      clearTimeout(_connBannerT);
      _connBannerT = null;
    }
    if (_connBannerEl && _connBannerEl.parentNode) {
      _connBannerEl.parentNode.removeChild(_connBannerEl);
    }
    _connBannerEl = null;
  }

  function revealConn() {
    try {
      haptic && haptic();
    } catch (_) {}
    // Toggle: si ya está visible, cerrar
    if (_connBannerEl) {
      _dismissBanner();
      return;
    }

    var st = _connState();
    var title = st.k === 'on' ? 'Conectado' : st.k === 'off' ? 'Sin conexión' : 'Conectando';
    var dotColor = st.k === 'on' ? '#34c759' : st.k === 'off' ? '#ff3b30' : '#ff9500';

    // Banner con estilos inline — garantizado, con prefijos iOS
    var wrap = document.createElement('div');
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    wrap.style.cssText =
      'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 16px);left:50%;transform:translateX(-50%);z-index:99999;display:flex;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.35s ease;';

    var card = document.createElement('div');
    card.style.cssText =
      'display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:18px;' +
      'background:rgba(255,255,255,0.72);' +
      '-webkit-backdrop-filter:blur(28px);backdrop-filter:blur(28px);' +
      'border:1px solid rgba(0,0,0,0.06);box-shadow:0 8px 32px rgba(0,0,0,0.12);max-width:380px;';

    var dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText =
      'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' +
      dotColor +
      ';box-shadow:0 0 10px ' +
      dotColor +
      ';';

    var txt = document.createElement('div');
    txt.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    var ttl = document.createElement('span');
    ttl.style.cssText = 'font-size:14px;font-weight:700;color:#1c1c1e;letter-spacing:-0.2px;';
    ttl.textContent = title;

    var sub = document.createElement('span');
    sub.style.cssText = 'font-size:12px;font-weight:500;color:#6e6e73;';
    sub.textContent = st.t;

    txt.appendChild(ttl);
    txt.appendChild(sub);
    card.appendChild(dot);
    card.appendChild(txt);
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    // Fade-in via RAF (funciona en iOS, a diferencia de CSS animation inline)
    requestAnimationFrame(function () {
      wrap.style.opacity = '1';
    });

    _connBannerEl = wrap;
    _connBannerT = setTimeout(_dismissBanner, 4500);
  }

  // Limpiar banner al desmontar el componente
  useEffect(function () {
    return function () {
      _dismissBanner();
    };
  }, []);

  var scrRef = useRef(null);

  useEffect(function () {
    var el = scrRef.current;
    if (!el) return;
    function handleScroll() {
      var shouldBeCompact = el.scrollTop > 20;
      if (shouldBeCompact !== compactRef.current) setCompact(shouldBeCompact);
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return function () {
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // ── Pull-to-refresh ──────────────────────────────────────────────
  // Distancia de arrastre (px) para el indicador y flag de refresco.
  var ptr = useState(0);
  var pullDist = ptr[0],
    setPullDist = ptr[1];
  var rfs = useState(false);
  var refreshing = rfs[0],
    setRefreshing = rfs[1];
  var refreshingRef = useRef(false);
  var pullRef = useRef(0);

  // Re-fetch de datos + flush de la cola. Devuelve promesa.
  function doRefresh() {
    if (refreshingRef.current) return Promise.resolve();
    refreshingRef.current = true;
    // ⚠️ Si hay acciones locales sin subir, NO traemos el remoto encima:
    // cargarDatos toma `activo` literal del servidor (y borra la clave
    // local si viene null), así que un refresh durante la ventana en que
    // un turno recién iniciado aún no se subió borraría ese turno activo.
    // En ese caso solo empujamos la cola; el realtime/boot reconcilia.
    var pending = 0;
    try {
      var all = leer('mt_sync_queue', {});
      pending = all && all[uid] ? all[uid].length : 0;
    } catch (_) {}
    if (uid) processQueue(uid);
    if (pending > 0) {
      return Promise.resolve().then(function () {
        refreshingRef.current = false;
      });
    }
    return cargarDatos(uid, session.pinOnly)
      .then(function (data) {
        if (data && data.turnos) {
          setTurnos(data.turnos || []);
          setActivo(data.activo || null);
          if (data.salario) setSalario(data.salario);
        }
      })
      .catch(function () {})
      .then(function () {
        refreshingRef.current = false;
      });
  }
  // Ref a la última doRefresh para que los handlers táctiles (efecto con
  // deps [uid]) no capturen una versión vieja con session.pinOnly stale.
  var doRefreshRef = useRef(null);
  doRefreshRef.current = doRefresh;

  useEffect(
    function () {
      var el = scrRef.current;
      if (!el) return;
      var startY = 0;
      var pulling = false;
      var THRESH = 70;
      var MAX = 110;
      function onStart(e) {
        if (el.scrollTop > 0 || refreshingRef.current) {
          pulling = false;
          return;
        }
        startY = e.touches[0].clientY;
        pulling = true;
      }
      function onMove(e) {
        if (!pulling) return;
        if (el.scrollTop > 0) {
          pulling = false;
          pullRef.current = 0;
          setPullDist(0);
          return;
        }
        var dy = e.touches[0].clientY - startY;
        if (dy <= 0) {
          pullRef.current = 0;
          setPullDist(0);
          return;
        }
        // Resistencia: el arrastre se siente "pesado" hacia el final
        var d = Math.min(MAX, dy * 0.5);
        pullRef.current = d;
        setPullDist(d);
      }
      function onEnd() {
        if (!pulling) return;
        pulling = false;
        if (pullRef.current >= THRESH) {
          setRefreshing(true);
          setPullDist(THRESH);
          doRefreshRef.current().then(function () {
            setRefreshing(false);
            pullRef.current = 0;
            setPullDist(0);
          });
        } else {
          pullRef.current = 0;
          setPullDist(0);
        }
      }
      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: true });
      el.addEventListener('touchend', onEnd, { passive: true });
      el.addEventListener('touchcancel', onEnd, { passive: true });
      return function () {
        el.removeEventListener('touchstart', onStart);
        el.removeEventListener('touchmove', onMove);
        el.removeEventListener('touchend', onEnd);
        el.removeEventListener('touchcancel', onEnd);
      };
    },
    [uid]
  );

  var toastRef = useRef(null);
  function showToast(m, type) {
    var t = type || 'info';
    setToast({ msg: m, type: t });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(function () {
      setToast(null);
    }, 2400);
    try {
      if (t === 'success' && typeof hapticSuccess === 'function') hapticSuccess();
      else if (t === 'error' && typeof hapticError === 'function') hapticError();
      else if (t === 'warning' && typeof hapticWarning === 'function') hapticWarning();
    } catch (_) {}
    // 🎵 SFX Remotion: sonido al mostrar toast
    if (t === 'success' && typeof sfxDing === 'function') sfxDing();
    else if (t === 'error' && typeof sfxError === 'function') sfxError();
  }
  // Exponemos showToast a la cola de sync para que pueda avisar
  // errores permanentes (ej. PIN duplicado al sincronizar offline).
  useEffect(function () {
    window.showToast = showToast;
    return function () {
      if (window.showToast === showToast) window.showToast = null;
    };
  }, []);

  useEffect(function () {
    var rafId = null;
    var lastTick = 0;
    var visible = true;
    function loop(ts) {
      if (!visible) {
        return;
      }
      if (ts - lastTick >= 500) {
        lastTick = ts;
        setAhora(Date.now());
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    function onVis() {
      visible = document.visibilityState === 'visible';
      if (visible) {
        setAhora(Date.now());
        if (!rafId) rafId = requestAnimationFrame(loop);
      }
    }
    document.addEventListener('visibilitychange', onVis, { passive: true });
    return function () {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ── Convergencia forzada: flush de cola + re-fetch del remoto. Se dispara
  // al restaurar la auth (root.js), al resucitar realtime (supabase.js, cierra
  // el hueco de eventos perdidos) y al volver la app a primer plano / recuperar
  // red. Expuesto como window.__mtResync. Es la pieza que hace converger los
  // dos devices tras una desconexión.
  useEffect(
    function () {
      if (!uid) return;
      function resync() {
        // Si CLOUD_MODE está apagado pero hay red y SUPA existe, intentamos
        // reconectar. Usamos __cloudRecheck (re-ejecutable) en vez del viejo
        // __cloudReady (Promise de una sola vez que devolvía siempre el
        // resultado fallido) — así una caída transitoria de red se recupera
        // sola sin recargar la app.
        if (
          !CLOUD_MODE &&
          isOnline() &&
          typeof SUPA !== 'undefined' &&
          SUPA &&
          typeof window.__cloudRecheck === 'function'
        ) {
          window.__cloudRecheck().then(function (ok) {
            if (ok) {
              try {
                processQueue(uid);
              } catch (_) {}
              // La nube volvió → resucitar el canal realtime de inmediato.
              try {
                if (typeof window.__mtResubscribe === 'function') window.__mtResubscribe();
              } catch (_) {}
            }
          });
        } else if (CLOUD_MODE && isOnline()) {
          // La nube está OK pero el canal pudo haberse caído en background.
          // Forzar resuscripción si no está SUBSCRIBED (recupera el LED).
          try {
            var _rt = typeof getRealtimeStatus === 'function' ? getRealtimeStatus() : null;
            if (_rt !== 'SUBSCRIBED' && typeof window.__mtResubscribe === 'function') {
              window.__mtResubscribe();
            }
          } catch (_) {}
        }
        var pending = 0;
        try {
          var all = leer('mt_sync_queue', {});
          pending = all && all[uid] ? all[uid].length : 0;
        } catch (_) {}
        try {
          processQueue(uid);
        } catch (_) {}
        // Si hay cambios locales sin subir, NO traemos el remoto encima
        // (borraría un turno recién iniciado aquí); primero se vacía la cola
        // y el realtime / próximo resync reconcilia.
        if (pending > 0) return;
        cargarDatos(uid, session.pinOnly)
          .then(function (data) {
            if (data && data.turnos) {
              setTurnos(data.turnos || []);
              setActivo(data.activo || null);
              if (data.salario) setSalario(data.salario);
            }
          })
          .catch(function () {});
      }
      window.__mtResync = resync;
      function onVis() {
        if (document.visibilityState === 'visible') resync();
      }
      document.addEventListener('visibilitychange', onVis, { passive: true });
      if (typeof onOnline === 'function') onOnline(resync);
      return function () {
        if (window.__mtResync === resync) window.__mtResync = null;
        document.removeEventListener('visibilitychange', onVis);
        if (typeof removeOnlineListener === 'function') removeOnlineListener(resync);
      };
    },
    [uid, session.pinOnly]
  );

  useEffect(
    function () {
      var cancelled = false;
      loadedRef.current = false;
      setLoading(true);
      var splashStart = Date.now();
      cargarDatos(uid, session.pinOnly)
        .then(function (data) {
          if (cancelled) return;
          if (!data || !data.turnos) {
            data = { turnos: [], activo: null, salario: SMIN };
          }
          setTurnos(data.turnos || []);
          setActivo(data.activo || null);
          var salCarga = data.salario || SMIN;
          setSalario(salCarga);
          // Inferencia del flag "salario configurado":
          //   1. Flag local explícito (mt_sc_<uid>) si fue tocado en este device
          //   2. Flag remoto (v52): si en Supabase perfiles.salario_base no es
          //      null, el usuario lo configuró desde algún device antes
          //   3. Heurístico legacy: si salario > SMIN, asumir configurado
          //      (cubre usuarios pre-v24 que nunca tuvieron flag)
          // Cualquiera de las 3 condiciones marca el flag → no banner.
          var savedFlag = leer(dk(uid, 'sc'), null);
          var remoteFlag = data && data.salarioConfigured === true;
          var inferred =
            savedFlag === true || remoteFlag || (savedFlag === null && salCarga > SMIN);
          setSalarioConfigured(inferred);
          setPrefs(normalizePrefs(leer(dk(uid, 'prefs'), null)));
          loadedRef.current = true;
          function finishSplash() {
            if (cancelled) return;
            setSplashExit(true);
            setTimeout(function () {
              if (!cancelled) {
                setLoading(false);
                var hasPin =
                  leer('mt_pin_' + uid, null) || leer('mt_pin_app_' + uid, null) || session.pin;
                var isRealCloudUser =
                  !session.pinOnly && !session.guest && CLOUD_MODE && !!session.email;
                if (isRealCloudUser && !hasPin) {
                  setShowPinSetup(true);
                }
              }
            }, 330);
          }
          if (props.introPlayed) {
            finishSplash();
          } else {
            setTimeout(function () {
              if (!cancelled) {
                var elapsed = Date.now() - splashStart;
                setTimeout(finishSplash, Math.max(0, 1080 - elapsed));
              }
            }, 350);
          }
        })
        .catch(function (e) {
          if (!cancelled) {
            setTurnos([]);
            setActivo(null);
            setSalario(SMIN);
            loadedRef.current = true;
            setSplashExit(true);
            setTimeout(function () {
              if (!cancelled) setLoading(false);
            }, 330);
          }
        });
      return function () {
        cancelled = true;
      };
    },
    [uid, session.pinOnly]
  );

  // ── Sync entre dispositivos (Realtime) ────────────────────────
  // Cuando otro device del mismo usuario inicia/para un turno o
  // edita el historial, recibimos un evento de Postgres-Realtime y
  // refrescamos el estado local. Debounced 400 ms para coalescer
  // ráfagas (ej. parar turno = DELETE en turno_activo + INSERT en
  // turnos casi simultáneos).
  useEffect(
    function () {
      if (!CLOUD_MODE || !SUPA || !uid || session.pinOnly || session.guest) return;
      if (typeof supaSubscribeUser !== 'function') return;

      var pendingT = null;
      var disposed = false;
      function resyncDebounced() {
        if (pendingT) clearTimeout(pendingT);
        pendingT = setTimeout(function () {
          pendingT = null;
          if (disposed) return;
          cargarDatos(uid, session.pinOnly)
            .then(function (data) {
              if (disposed || !data) return;
              setTurnos(data.turnos || []);
              setActivo(data.activo || null);
            })
            .catch(function () {});
        }, 400);
      }

      var unsub = supaSubscribeUser(uid, function () {
        resyncDebounced();
      });

      return function () {
        disposed = true;
        if (pendingT) clearTimeout(pendingT);
        if (unsub) unsub();
      };
    },
    [uid, session.pinOnly, session.guest]
  );

  useEffect(
    function () {
      if (!loadedRef.current) return;
      grabar(dk(uid, 't'), turnos);
    },
    [turnos, uid]
  );
  useEffect(
    function () {
      if (!loadedRef.current) return;
      if (activo === null) borrarKey(dk(uid, 'a'));
      else grabar(dk(uid, 'a'), activo);
    },
    [activo, uid]
  );
  useEffect(
    function () {
      if (!loadedRef.current) return;
      grabar(dk(uid, 's'), salario);
    },
    [salario, uid]
  );
  useEffect(
    function () {
      if (!loadedRef.current) return;
      grabar(dk(uid, 'sc'), salarioConfigured);
    },
    [salarioConfigured, uid]
  );
  useEffect(
    function () {
      if (!loadedRef.current) return;
      grabar(dk(uid, 'prefs'), prefs);
    },
    [prefs, uid]
  );

  function onPrefsChange(patch) {
    setPrefs(function (p) {
      return normalizePrefs(Object.assign({}, p, patch));
    });
  }

  var activoRef = useRef(activo);
  activoRef.current = activo;
  var showOlvRef = useRef(showOlv);
  showOlvRef.current = showOlv;
  var salarioOkRef = useRef(salarioConfigured);
  salarioOkRef.current = salarioConfigured;
  // Ref para recordar qué turno ya fue notificado, así si el usuario
  // descarta con "Sigue activo" no se vuelve a mostrar el modal para el mismo turno
  var notificadoRef = useRef(null);

  useEffect(
    function () {
      var to = null;
      function schedule() {
        if (!activoRef.current || showOlvRef.current) {
          return;
        }
        // Si ya notificamos para este turno (mismo ID), no insistir
        if (notificadoRef.current === activoRef.current.id) {
          return;
        }
        var inicio = new Date(activoRef.current.inicio).getTime();
        var elapsed = Date.now() - inicio;
        if (elapsed >= U12H) {
          notificadoRef.current = activoRef.current.id;
          setShowOlv(true);
          return;
        }
        var remaining = U12H - elapsed;
        to = setTimeout(function () {
          if (activoRef.current && !showOlvRef.current) {
            if (notificadoRef.current !== activoRef.current.id) {
              notificadoRef.current = activoRef.current.id;
              setShowOlv(true);
            }
          }
        }, remaining);
      }
      schedule();
      function onVis() {
        if (document.visibilityState === 'visible') {
          if (to) {
            clearTimeout(to);
            to = null;
          }
          schedule();
        }
      }
      document.addEventListener('visibilitychange', onVis, { passive: true });
      return function () {
        if (to) clearTimeout(to);
        document.removeEventListener('visibilitychange', onVis);
      };
    },
    [activo]
  );

  useEffect(function () {
    if (!navigator.getBattery) return;
    var bat = null;
    function applyState() {
      if (!bat) return;
      var lowPower = bat.level < 0.2 && !bat.charging;
      document.documentElement.classList.toggle('low-power', lowPower);
    }
    navigator
      .getBattery()
      .then(function (b) {
        bat = b;
        applyState();
        bat.addEventListener('levelchange', applyState);
        bat.addEventListener('chargingchange', applyState);
      })
      .catch(function () {});
    return function () {
      if (bat) {
        bat.removeEventListener('levelchange', applyState);
        bat.removeEventListener('chargingchange', applyState);
      }
    };
  }, []);

  useEffect(function () {
    function onVis() {
      if (document.visibilityState === 'visible') {
        setAhora(Date.now());
      }
    }
    document.addEventListener('visibilitychange', onVis, { passive: true });
    return function () {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(
    function () {
      window.__mtTurnoActivo = !!activo;
    },
    [activo]
  );

  // ── Geovalla del trabajo: arranca cuando los datos ya cargaron ──
  // Espera a loading=false para que tieneActivo() vea el turno real (si el
  // deep link nativo llega antes de cargar, se duplicaría el inicio).
  // Las funciones del bridge solo usan refs y setters estables: sin staleness.
  useEffect(
    function () {
      if (loading || !uid || typeof geoInit !== 'function') return;
      geoInit(uid, {
        tieneActivo: function () {
          return !!activoRef.current;
        },
        salarioOk: function () {
          return !!salarioOkRef.current;
        },
        iniciarDesde: geoIniciarDesde,
        cerrarEn: geoCerrarEn,
        prompt: function (p) {
          setGeoPrompt(p);
          // Si la app está en background, además notificar (el prompt espera).
          if (document.visibilityState !== 'visible' && typeof notifEnviar === 'function') {
            notifEnviar(p.title, p.body, 'mt-geo');
          }
        }
      });
      return function () {
        if (typeof geoStop === 'function') geoStop();
      };
    },
    [loading, uid]
  );

  // ── Iniciar/detener rotación Mood Bar según pestaña ──
  useEffect(
    function () {
      if (tab === 'home') {
        if (window._startMoodRotation) window._startMoodRotation();
      } else {
        if (window._stopMoodRotation) window._stopMoodRotation();
      }
    },
    [tab]
  );

  var vh = useMemo(
    function () {
      return salario / 240;
    },
    [salario]
  );
  var ahoraDate = useMemo(
    function () {
      return new Date(ahora);
    },
    [ahora]
  );
  var ahoraMin = useMemo(
    function () {
      return Math.floor(ahora / 60000) * 60000;
    },
    [ahora]
  );
  var ahoraDateCalc = useMemo(
    function () {
      return new Date(ahoraMin);
    },
    [ahoraMin]
  );

  var mesKey = ahoraDate.getFullYear() * 100 + ahoraDate.getMonth();
  var turnosMes = useMemo(
    function () {
      var ini = new Date(ahoraDate.getFullYear(), ahoraDate.getMonth(), 1);
      return turnos.filter(function (t) {
        return new Date(t.inicio) >= ini;
      });
    },
    [turnos, mesKey]
  );

  var calc = useMemo(
    function () {
      return doCalc(turnosMes, activo, ahoraDateCalc, vh);
    },
    [turnosMes, activo, ahoraMin, vh]
  );

  // ── Cálculo por quincena (solo si el modo está activo) ───────
  var quincena = useMemo(
    function () {
      if (!prefs.quincenaMode) return null;
      var rango = getQuincenaRange(ahoraDate, prefs);
      var tQ = filterTurnosRango(turnos, rango);
      // El activo se incluye en la quincena si su inicio cae dentro
      var activoEnRango =
        activo && new Date(activo.inicio) >= rango.ini && new Date(activo.inicio) < rango.fin
          ? activo
          : null;
      var calcQ = doCalc(tQ, activoEnRango, ahoraDateCalc, vh);
      return { rango: rango, turnos: tQ, calc: calcQ };
    },
    [prefs, turnos, activo, ahoraMin, vh, ahoraDate.getDate(), ahoraDate.getMonth()]
  );

  var quincenasMes = useMemo(
    function () {
      if (!prefs.quincenaMode) return null;
      var qs = getQuincenasMes(ahoraDate, prefs);
      var t1 = filterTurnosRango(turnos, qs.q1);
      var t2 = filterTurnosRango(turnos, qs.q2);
      var aEnQ1 =
        activo && new Date(activo.inicio) >= qs.q1.ini && new Date(activo.inicio) < qs.q1.fin
          ? activo
          : null;
      var aEnQ2 =
        activo && new Date(activo.inicio) >= qs.q2.ini && new Date(activo.inicio) < qs.q2.fin
          ? activo
          : null;
      return {
        q1: {
          rango: qs.q1,
          turnos: t1,
          calc: doCalc(t1, aEnQ1, ahoraDateCalc, vh)
        },
        q2: {
          rango: qs.q2,
          turnos: t2,
          calc: doCalc(t2, aEnQ2, ahoraDateCalc, vh)
        }
      };
    },
    [prefs, turnos, activo, ahoraMin, vh, ahoraDate.getMonth()]
  );

  var durActual = activo ? Math.round((ahora - new Date(activo.inicio)) / 60000) : 0;
  var festHoy = esFest(ahoraDate);

  function onIni() {
    // Guarda: no iniciar turno sin salario configurado
    if (!salarioConfigured) {
      haptic();
      showToast('⚠️ Configurá tu salario en Ajustes primero', 'warning');
      setTab('config');
      return;
    }
    haptic();
    var ini = new Date().toISOString();
    insertTurno(uid, ini).then(function (row) {
      var nuevo = { id: row.id, inicio: row.inicio, userId: uid };
      setActivo(nuevo);
      setShowOlv(false);
      showToast('Turno iniciado', 'success');
      queueAction(uid, 'setActivo', nuevo);
    });
  }

  function onFin() {
    if (!activo) return;
    haptic();
    var fin = new Date();
    var durSeg = (fin - new Date(activo.inicio)) / 1000;
    // Descartar turnos menores a 60 s — evita basura por doble-toque accidental
    if (durSeg < 60) {
      setActivo(null);
      setShowOlv(false);
      queueAction(uid, 'setActivo', null);
      showToast('Turno muy corto — no registrado', 'warning');
      return;
    }
    var finISO = fin.toISOString();
    var turnoCerrado = { id: activo.id, inicio: activo.inicio, fin: finISO, userId: uid };
    setTurnos(function (p) {
      return [turnoCerrado].concat(p);
    });
    setActivo(null);
    setShowOlv(false);
    showToast('Turno cerrado', 'success');
    queueAction(uid, 'insertTurno', turnoCerrado);
    queueAction(uid, 'setActivo', null);
  }

  function onOlv(finISO) {
    if (!activo) return;
    haptic();
    var turnoCerrado = { id: activo.id, inicio: activo.inicio, fin: finISO, userId: uid };
    setTurnos(function (p) {
      return [turnoCerrado].concat(p);
    });
    setActivo(null);
    setShowOlv(false);
    showToast('Turno guardado', 'success');
    queueAction(uid, 'insertTurno', turnoCerrado);
    queueAction(uid, 'setActivo', null);
  }

  // ── Geovalla: iniciar/cerrar con la hora REAL del evento (backdate) ──
  // Mismo contrato de sync que onIni/onOlv, pero el ISO viene de la detección
  // (llegada/salida al trabajo), no del momento del tap. Usa refs para no
  // arrastrar estado viejo: el motor las invoca desde fuera del render.
  function geoIniciarDesde(iso) {
    if (activoRef.current) return;
    insertTurno(uid, iso).then(function (row) {
      var nuevo = { id: row.id, inicio: row.inicio, userId: uid };
      setActivo(nuevo);
      queueAction(uid, 'setActivo', nuevo);
      showToast('📍 Turno iniciado desde las ' + geoHora(new Date(iso).getTime()), 'success');
    });
  }
  function geoCerrarEn(finISO) {
    var act = activoRef.current;
    if (!act) return;
    var durSeg = (new Date(finISO) - new Date(act.inicio)) / 1000;
    if (durSeg < 60) return; // mismo guard anti doble-toque que onFin
    var turnoCerrado = { id: act.id, inicio: act.inicio, fin: finISO, userId: uid };
    setTurnos(function (p) {
      return [turnoCerrado].concat(p);
    });
    setActivo(null);
    setShowOlv(false);
    queueAction(uid, 'insertTurno', turnoCerrado);
    queueAction(uid, 'setActivo', null);
    showToast('📍 Turno cerrado a las ' + geoHora(new Date(finISO).getTime()), 'success');
  }

  function onSalario(v) {
    haptic();
    setSalario(v);
    // Cualquier guardado explícito marca el salario como configurado,
    // incluso si coincide con el mínimo legal (caso válido).
    setSalarioConfigured(true);
    showToast('Salario actualizado', 'success');
    queueAction(uid, 'setSalario', { salario: v });
  }
  function onBorrar() {
    haptic();
    setTurnos([]);
    showToast('Historial borrado', 'warning');
    queueAction(uid, 'deleteAllTurnos', {});
  }
  function onBorrarUno(id) {
    haptic();
    setTurnos(function (p) {
      return p.filter(function (t) {
        return t.id !== id;
      });
    });
    showToast('Turno eliminado', 'warning');
    queueAction(uid, 'deleteTurno', { id: id });
  }
  // Alta manual de un turno cerrado (desde el asistente por chat/voz).
  // Mismo contrato de sync que onFin: estado local + insertTurno en cola.
  function onAddTurno(turno) {
    if (!turno || !turno.inicio || !turno.fin) return;
    haptic();
    var nuevo = { id: turno.id, inicio: turno.inicio, fin: turno.fin, userId: uid };
    setTurnos(function (p) {
      for (var i = 0; i < p.length; i++) {
        if (p[i].id === nuevo.id) return p; // ya existe, no duplicar
      }
      return [nuevo].concat(p);
    });
    showToast('Turno registrado', 'success');
    queueAction(uid, 'insertTurno', nuevo);
  }
  // Edición de un turno existente (desde el asistente). Preserva el id;
  // reemplaza inicio/fin local y sincroniza con updateTurno. Si el turno no
  // existe localmente, no creamos uno nuevo: editar exige verificación previa.
  function onEditarTurno(turno) {
    if (!turno || !turno.id || !turno.inicio || !turno.fin) return false;
    haptic();
    var existe = false;
    for (var i = 0; i < turnos.length; i++) {
      if (turnos[i].id === turno.id) {
        existe = true;
        break;
      }
    }
    var editado = { id: turno.id, inicio: turno.inicio, fin: turno.fin, userId: uid };
    if (!existe) {
      showToast('No encontré ese turno para corregir', 'warning');
      return false;
    }
    setTurnos(function (p) {
      return p.map(function (t) {
        return t.id === turno.id ? editado : t;
      });
    });
    showToast('Turno corregido', 'success');
    queueAction(uid, 'updateTurno', { id: turno.id, inicio: turno.inicio, fin: turno.fin });
    return true;
  }
  // Estado para modal de exportar (PDF o Excel)
  var ex = useState(null);
  var exportMode = ex[0],
    setExportMode = ex[1]; // null | 'pdf' | 'xlsx'
  function onExportPDF() {
    haptic();
    setExportMode('pdf');
  }
  function onExportExcel() {
    haptic();
    setExportMode('xlsx');
  }

  if (loading) {
    // El splash de marca ya se mostró en Root (intro). Durante la carga de
    // datos mostramos un skeleton que preserva el layout (sensación de
    // velocidad). Fallback al splash si el componente no estuviera cargado.
    if (props.introPlayed && typeof SkeletonScreen === 'function') {
      return h(SkeletonScreen, { compact: compact });
    }
    return h(SplashScreen, { exit: splashExit, plain: props.introPlayed });
  }

  var tStr = ahoraDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  var TABS = [
    { id: 'home', icon: 'home', lbl: 'Inicio' },
    { id: 'dashboard', icon: 'chart', lbl: 'Análisis' },
    { id: 'ai', icon: 'sparkle', lbl: 'Asistente' },
    { id: 'history', icon: 'history', lbl: 'Historial' },
    { id: 'config', icon: 'settings', lbl: 'Ajustes' }
  ];
  var activeIdx = TABS.findIndex(function (t) {
    return t.id === tab;
  });
  if (activeIdx < 0) activeIdx = 0;

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
    showPinSetup
      ? h(PinSetup, {
          session: session,
          onDone: function (newPin) {
            haptic();
            var cur = leer(SKEY, {});
            if (cur) {
              cur.pin = newPin;
              grabar(SKEY, cur);
            }
            if (onSessionPatch) onSessionPatch({ pin: newPin });
            setShowPinSetup(false);
            showToast('PIN creado correctamente', 'success');
          },
          onSkip: function () {
            haptic();
            setShowPinSetup(false);
          }
        })
      : null,
    showOlv && activo
      ? h(ModalOlvidado, {
          inicio: activo.inicio,
          onGuardar: onOlv,
          onContinuar: function () {
            setShowOlv(false);
          }
        })
      : null,
    // Prompt de geovalla (modo "preguntar"): confirma inicio/cierre con la
    // hora real de llegada/salida. Mismo patrón visual que ModalOlvidado.
    geoPrompt
      ? h(
          'div',
          {
            className: 'mol-ov',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': geoPrompt.title
          },
          h(
            'div',
            { className: 'mol-sh' },
            h('div', { className: 'mol-hdl' }),
            h(
              'div',
              { style: { textAlign: 'center' } },
              h(
                'div',
                { style: { fontSize: 38, marginBottom: 10, opacity: 0.85 }, 'aria-hidden': 'true' },
                geoPrompt.kind === 'enter' ? '📍' : '🏠'
              ),
              h(
                'div',
                {
                  style: {
                    fontSize: 19,
                    fontWeight: 800,
                    letterSpacing: '-0.5px',
                    color: 'var(--text)',
                    marginBottom: 6
                  }
                },
                geoPrompt.title
              ),
              h(
                'div',
                { style: { fontSize: 13, color: 'var(--muted)', fontWeight: 500 } },
                geoPrompt.body
              )
            ),
            h(
              'button',
              {
                className: 'btn btn-accent btn-block',
                style: { marginTop: 18, marginBottom: 8 },
                onClick: function () {
                  haptic();
                  var p = geoPrompt;
                  setGeoPrompt(null);
                  if (p.kind === 'enter') geoIniciarDesde(p.iso);
                  else geoCerrarEn(p.iso);
                }
              },
              geoPrompt.actionLabel
            ),
            h(
              'button',
              {
                className: 'btn btn-ghost btn-block',
                onClick: function () {
                  haptic();
                  setGeoPrompt(null);
                }
              },
              'Ahora no'
            )
          )
        )
      : null,
    toast
      ? h(
          'div',
          {
            className: 'toast toast--' + toast.type,
            role: 'alert',
            'aria-live': 'assertive',
            'aria-atomic': 'true'
          },
          h(
            'span',
            { className: 'toast-ico', 'aria-hidden': 'true' },
            toast.type === 'success'
              ? '✓'
              : toast.type === 'error'
                ? '✕'
                : toast.type === 'warning'
                  ? '!'
                  : 'i'
          ),
          h('span', { className: 'toast-msg' }, toast.msg)
        )
      : null,

    tab !== 'ai'
      ? h(
          'header',
          { className: 'hdr' + (compact ? ' hdr--compact' : ''), role: 'banner' },
          h(
            'div',
            { className: 'hdr-l' },
            (function () {
              // LED unificado: refleja el estado REAL de Supabase (no solo internet).
              // Misma fuente que el popover (_connState), para que dot y texto coincidan.
              var st = _connState();
              // 'on' = verde · 'off' = rojo · 'connecting' = ámbar pulsante
              var ledCls = st.k;
              return h(
                'button',
                {
                  className: 'hdr-led-btn',
                  type: 'button',
                  onClick: revealConn,
                  title: st.t,
                  'aria-label': st.t + '. Tocá para ver el estado de conexión.'
                },
                h('span', { className: 'hdr-led ' + ledCls, 'aria-hidden': 'true' })
              );
            })(),
            h('img', {
              src: 'img/logo-mark.svg',
              width: 24,
              height: 24,
              alt: '',
              draggable: false,
              style: { borderRadius: '6px', flexShrink: 0, display: 'block' }
            }),
            h(
              'div',
              { className: 'hdr-info' },
              h('div', { className: 'hdr-brand' }, 'Mi Turno'),
              h(
                'div',
                { className: 'hdr-meta' },
                h(
                  'span',
                  { className: 'hdr-date' },
                  ahoraDate.toLocaleDateString('es-CO', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                  }) + (festHoy ? ' · Fest' : '')
                ),
                h('span', { className: 'hdr-clock' }, tStr)
              )
            )
          ),
          h(
            'div',
            { className: 'hdr-r' },
            h(
              'button',
              {
                className: 'icon-btn',
                'aria-label': theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
                title: theme === 'dark' ? 'Modo claro' : 'Modo oscuro',
                onClick: function () {
                  haptic();
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                }
              },
              theme === 'dark'
                ? h(
                    'svg',
                    {
                      viewBox: '0 0 24 24',
                      width: 18,
                      height: 18,
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round'
                    },
                    h('circle', { cx: 12, cy: 12, r: 5 }),
                    h('line', { x1: 12, y1: 1, x2: 12, y2: 3 }),
                    h('line', { x1: 12, y1: 21, x2: 12, y2: 23 }),
                    h('line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }),
                    h('line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }),
                    h('line', { x1: 1, y1: 12, x2: 3, y2: 12 }),
                    h('line', { x1: 21, y1: 12, x2: 23, y2: 12 }),
                    h('line', { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 }),
                    h('line', { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 })
                  )
                : h(
                    'svg',
                    {
                      viewBox: '0 0 24 24',
                      width: 18,
                      height: 18,
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round'
                    },
                    h('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' })
                  )
            )
          )
        )
      : null,

    h(
      'div',
      { className: 'scr' + (tab === 'ai' ? ' scr--assistant' : ''), ref: scrRef },
      h(
        'div',
        {
          className: 'ptr' + (refreshing ? ' ptr--refreshing' : ''),
          style: {
            height: (refreshing ? 44 : pullDist) + 'px',
            opacity: refreshing || pullDist > 4 ? 1 : 0
          }
        },
        h('div', {
          className: 'ptr-spin' + (refreshing || pullDist >= 70 ? ' ready' : '')
        })
      ),
      h(
        'main',
        {
          className: 'tab-view' + (swipeAnimDir ? ' swipe-' + swipeAnimDir : ''),
          role: 'main'
        },
        _lazy(
          'home',
          h(HomeTab, {
            calc: calc,
            activo: activo,
            ahora: ahoraDate,
            salario: salario,
            salarioConfigured: salarioConfigured,
            vh: vh,
            turnos: turnos,
            prefs: prefs,
            quincena: quincena,
            session: session,
            onIni: onIni,
            onFin: onFin,
            onOpenAssistant: function () {
              haptic();
              setTab('ai');
            },
            onOpenConfig: function () {
              haptic();
              setTab('config');
            }
          })
        ),
        _lazy(
          'dashboard',
          h(DashboardTab, {
            calc: calc,
            turnos: turnosMes,
            salario: salario,
            vh: vh,
            ahora: ahoraDate,
            themeKey: theme,
            prefs: prefs,
            quincenasMes: quincenasMes
          })
        ),
        _lazy(
          'ai',
          h(AsistenteTab, {
            turnos: turnosMes,
            turnosAll: turnos,
            calc: calc,
            salario: salario,
            vh: vh,
            session: session,
            activo: activo,
            // Acciones reales del agente: se ejecutan in-place (sin reload),
            // preservando el loop de manos libres.
            onIniTurno: onIni,
            onFinTurno: onFin,
            onSetSalario: onSalario,
            onAddTurno: onAddTurno,
            onBorrarUno: onBorrarUno,
            onEditarTurno: onEditarTurno,
            onNavigate: function (tabId, subAction) {
              haptic();
              setTab(tabId);
              // subAction: 'start' o 'stop' para iniciar/finalizar turno
              if (subAction === 'start' && typeof onIni === 'function') onIni();
              if (subAction === 'stop' && typeof onFin === 'function') onFin();
            }
          })
        ),
        _lazy(
          'history',
          h(HistoryTab, {
            turnos: turnos,
            activo: activo,
            durActual: durActual,
            session: session,
            calc: calc,
            vh: vh,
            ahora: ahoraDate,
            onBorrar: onBorrar,
            onBorrarUno: onBorrarUno,
            onExportPDF: onExportPDF,
            onExportExcel: onExportExcel
          })
        ),
        _lazy(
          'config',
          h(ConfigTab, {
            salario: salario,
            valorHora: vh,
            session: session,
            onSalario: onSalario,
            onSignOut: props.onSignOut,
            onSessionPatch: onSessionPatch,
            theme: theme,
            onThemeChange: setTheme,
            prefs: prefs,
            onPrefsChange: onPrefsChange,
            onRevealConn: revealConn
          })
        )
      )
    ),

    tab !== 'ai'
      ? h(
          'nav',
          { className: 'tabs', role: 'tablist', 'aria-label': 'Navegación principal' },
          h('div', {
            className: 'tab-indicator',
            style: { transform: 'translateX(' + activeIdx * 100 + '%)' },
            'aria-hidden': 'true'
          }),
          TABS.map(function (item) {
            return h(
              'button',
              {
                key: item.id,
                className: 'tab-btn ' + (tab === item.id ? 'on' : ''),
                role: 'tab',
                'aria-selected': tab === item.id ? 'true' : 'false',
                'aria-label': item.lbl,
                onClick: function () {
                  haptic();
                  setTab(item.id);
                }
              },
              tabIcon(item.icon),
              h('div', { className: 'tab-label' }, item.lbl)
            );
          })
        )
      : null,

    // ── Modal Exportar Reporte (PDF/Excel) ──
    exportMode
      ? h(
          'div',
          {
            className: 'ovl',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Exportar reporte',
            onClick: function (ev) {
              if (ev.target === ev.currentTarget) setExportMode(null);
            }
          },
          h(ExportReportModal, {
            format: exportMode,
            turnos: turnos,
            calc: calc,
            salario: salario,
            session: session,
            onClose: function () {
              setExportMode(null);
            }
          })
        )
      : null
  );
}
