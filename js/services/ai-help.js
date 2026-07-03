// ════════════════════════════════════════════════════════════════
//  MI TURNO · services/ai-help.js
//  Asistente de navegación — sabe guiar al usuario por cada rincón
//  de la app. Responde preguntas tipo "¿cómo hago para...?"
//  con instrucciones paso a paso.
//  100% offline · complementa al asistente de nómina (ai.js).
// ════════════════════════════════════════════════════════════════

// ─── BASE DE CONOCIMIENTO ──────────────────────────────────────
// Cada entrada: { id, title, keywords, steps, related }
// steps: array de strings con instrucciones numeradas
// keywords: array de frases que disparan esta guía
// related: IDs de guías relacionadas

// Recargo dominical/festivo vigente al cargar (Ley 2466/2025, date-aware).
var _HELP_FEST =
  typeof getRecargoFestivo === 'function' ? Math.round(getRecargoFestivo(new Date()) * 100) : 80;

var AI_HELP_GUIDES = [
  // ═══ TURNOS ═══
  {
    id: 'iniciar_turno',
    title: 'Iniciar un turno',
    keywords: [
      'iniciar turno',
      'como inicio',
      'inicio turno',
      'inicio un turno',
      'como arranco',
      'empezar turno',
      'comenzar turno',
      'arrancar',
      'empezar a trabajar',
      'marcar entrada',
      'fichar'
    ],
    steps: [
      'Abrí la app — ya estás en la pestaña **Inicio**.',
      'Tocá el botón grande que dice **Iniciar**.',
      'Tu turno empieza a contar. El reloj corre en tiempo real.',
      'Podés ver tus ganancias estimadas mientras trabajás.',
      'Cuando termines, tocá **Finalizar** en el mismo botón.'
    ],
    related: ['finalizar_turno', 'configurar_salario']
  },
  {
    id: 'finalizar_turno',
    title: 'Finalizar un turno',
    keywords: [
      'finalizar turno',
      'terminar turno',
      'cierro turno',
      'cerrar turno',
      'termino turno',
      'paro turno',
      'acabar',
      'salir del trabajo',
      'marcar salida'
    ],
    steps: [
      'En la pestaña **Inicio**, tocá el botón **Finalizar**.',
      'Si tu turno duró menos de 1 minuto, no se registra (evita toques accidentales).',
      'Tu turno se guarda automáticamente y aparece en **Historial**.',
      'Los recargos (nocturno, festivo, extra) se calculan solos.'
    ],
    related: ['iniciar_turno', 'ver_historial']
  },

  // ═══ SALARIO ═══
  {
    id: 'configurar_salario',
    title: 'Configurar tu salario',
    keywords: [
      'configurar salario',
      'poner salario',
      'cambiar salario',
      'ajustar salario',
      'cuanto gano',
      'cambio salario',
      'ingreso salario',
      'pongo salario',
      'salario base',
      'sueldo'
    ],
    steps: [
      'Andá a la pestaña **Ajustes** (última de la barra inferior).',
      'Tocá donde dice **Salario base** — se abre un campo para editar.',
      'Ingresá tu salario mensual bruto (sin puntos ni comas, ej: 1750905).',
      'Tocá el botón ✓ para guardar.',
      'Listo. Todos los cálculos de la app usan este valor.'
    ],
    related: ['iniciar_turno', 'modo_quincena']
  },

  // ═══ HISTORIAL ═══
  {
    id: 'ver_historial',
    title: 'Ver tu historial de turnos',
    keywords: [
      'ver historial',
      'veo historial',
      'mis turnos',
      'turnos pasados',
      'historial de turnos',
      'lista de turnos',
      'todos mis turnos',
      'donde veo mis turnos'
    ],
    steps: [
      'Tocá la pestaña **Historial** (ícono de reloj).',
      'Ahí ves todos tus turnos cerrados, ordenados del más reciente al más viejo.',
      'Cada turno muestra: fecha, hora de entrada/salida, duración e ingreso.',
      'Tocá cualquier turno para ver el detalle con recargos aplicados.'
    ],
    related: ['exportar_datos', 'enviar_reporte']
  },
  {
    id: 'exportar_datos',
    title: 'Exportar tus datos',
    keywords: [
      'exportar',
      'exporto',
      'exportar datos',
      'exporto mis datos',
      'exportar mis datos',
      'descargar',
      'pdf',
      'excel',
      'bajar datos',
      'guardar informe',
      'descargar turnos'
    ],
    steps: [
      'Andá a la pestaña **Historial**.',
      'Tocá el botón **Exportar** (ícono de descarga ⬇).',
      'Elegí entre **PDF** o **Excel**.',
      'El archivo se descarga automáticamente en tu dispositivo.',
      '**Tip:** si querés un respaldo completo (no solo el PDF), andá a **Ajustes > Respaldar datos**.'
    ],
    related: ['enviar_reporte', 'respaldar_datos']
  },
  {
    id: 'enviar_reporte',
    title: 'Enviar reporte por correo',
    keywords: [
      'enviar correo',
      'mandar reporte',
      'email',
      'correo electronico',
      'enviar a jefe',
      'enviar a empresa'
    ],
    steps: [
      'Andá a la pestaña **Historial**.',
      'Tocá **Exportar** y elegí el formato (PDF o Excel).',
      'En la ventana que aparece, tocá **Enviar por correo**.',
      'Ingresá el correo de destino y tocá enviar.',
      'El reporte llega con tu nombre, turnos, recargos y totales.'
    ],
    related: ['exportar_datos']
  },
  {
    id: 'borrar_turno',
    title: 'Borrar un turno',
    keywords: [
      'borrar turno',
      'borro turno',
      'eliminar turno',
      'elimino turno',
      'quitar turno',
      'borrar historial'
    ],
    steps: [
      'Andá a la pestaña **Historial**.',
      'Deslizá el turno hacia la izquierda o tocá el ícono de basurero.',
      'Confirmá que querés eliminarlo.',
      'El turno se borra de tu dispositivo y de la nube.'
    ],
    related: ['ver_historial']
  },

  // ═══ PERFIL ═══
  {
    id: 'cambiar_foto',
    title: 'Cambiar tu foto de perfil',
    keywords: [
      'cambiar foto',
      'poner foto',
      'pongo foto',
      'pongo mi foto',
      'poner mi foto',
      'subir foto',
      'agregar foto',
      'foto perfil',
      'imagen perfil',
      'avatar',
      'fotografia',
      'cambio foto',
      'cambio mi foto',
      'cambiar mi foto',
      'cambiar imagen',
      'cambiar avatar',
      'editar foto',
      'modificar foto'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Tocá el círculo de la foto (o el ícono 📷).',
      'Seleccioná **Cambiar foto** para elegir una de tu galería.',
      'O tocá **Eliminar foto** para quitarla.',
      'La foto se guarda solo en tu dispositivo, no se sube a la nube.'
    ],
    related: ['cambiar_nombre']
  },
  {
    id: 'cambiar_nombre',
    title: 'Cambiar tu nombre en la app',
    keywords: [
      'cambiar nombre',
      'poner nombre',
      'editar nombre',
      'apodo',
      'alias',
      'como me llamo',
      'cambio nombre',
      'cambio mi nombre',
      'cambiar mi nombre',
      'modificar nombre',
      'nombre perfil',
      'nombre usuario'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Tocá tu nombre (al lado del lápiz ✎).',
      'Escribí el nombre o apodo que quieras.',
      'Tocá ✓ para guardar.'
    ],
    related: ['cambiar_foto']
  },

  // ═══ SEGURIDAD ═══
  {
    id: 'configurar_pin',
    title: 'Configurar tu PIN de acceso',
    keywords: [
      'configurar pin',
      'poner pin',
      'crear pin',
      'cambiar pin',
      'cambiar mi pin',
      'cambiar el pin',
      'modificar pin',
      'actualizar pin',
      'codigo acceso',
      'pin acceso',
      'bloquear app'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Buscá la sección **Seguridad** y tocá **PIN de acceso**.',
      'Ingresá un PIN de 4 a 6 dígitos.',
      'Confirmalo una segunda vez.',
      'La próxima vez que entrés, podés usar el PIN en vez de la contraseña.'
    ],
    related: ['cambiar_password', 'recuperar_pin']
  },
  {
    id: 'cambiar_password',
    title: 'Cambiar tu contraseña',
    keywords: [
      'cambiar contraseña',
      'cambiar password',
      'nueva contraseña',
      'olvide contraseña',
      'resetear password'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Tocá **Gestionar cuenta**.',
      'Seleccioná **Cambiar contraseña**.',
      'Ingresá tu contraseña actual y la nueva.',
      'La nueva contraseña se sincroniza con la nube.'
    ],
    related: ['configurar_pin', 'cerrar_sesion']
  },
  {
    id: 'recuperar_pin',
    title: 'Recuperar tu PIN',
    keywords: [
      'recuperar pin',
      'olvide pin',
      'olvido pin',
      'perdi pin',
      'no recuerdo pin',
      'pin olvidado',
      'no se mi pin'
    ],
    steps: [
      'En la pantalla de acceso rápido, tocá **¿Olvidaste tu PIN?**.',
      'Seguí los pasos: confirmar identidad → esperar → código → nuevo PIN.',
      'El código de verificación nunca sale de tu dispositivo.',
      'Creá un PIN nuevo y confirmalo.'
    ],
    related: ['configurar_pin']
  },
  {
    id: 'cerrar_sesion',
    title: 'Cerrar sesión',
    keywords: [
      'cerrar sesion',
      'cierro sesion',
      'salir',
      'logout',
      'desconectar',
      'cambiar cuenta'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Bajá hasta el final y tocá **Cerrar sesión**.',
      'Tus datos locales se conservan (turnos, salario, preferencias).',
      'Volvés a la pantalla de inicio de sesión.'
    ],
    related: ['respaldar_datos']
  },

  // ═══ DATOS ═══
  {
    id: 'respaldar_datos',
    title: 'Respaldar tus datos',
    keywords: [
      'respaldar',
      'backup',
      'copia seguridad',
      'guardar datos',
      'no perder datos',
      'salvar datos',
      'respaldo',
      'hacer backup',
      'exportar datos',
      'descargar datos',
      'guardo mis datos',
      'como guardo',
      'respaldo mis datos',
      'respaldar datos',
      'copia de seguridad'
    ],
    steps: [
      'Andá a la pestaña **Ajustes** > sección **Datos**.',
      'Tocá **📦 Respaldar datos**.',
      'Se descarga un archivo .json con todos tus turnos, salario y ajustes.',
      'Guardá ese archivo en un lugar seguro (Drive, correo, etc.).',
      'Si cambiás de celular, usá **📂 Restaurar datos** para recuperar todo.'
    ],
    related: ['restaurar_datos']
  },
  {
    id: 'restaurar_datos',
    title: 'Restaurar un respaldo',
    keywords: ['restaurar', 'recuperar datos', 'importar', 'cargar backup', 'recuperar backup'],
    steps: [
      'Andá a la pestaña **Ajustes** > sección **Datos**.',
      'Tocá **📂 Restaurar datos**.',
      'Seleccioná el archivo .json de tu respaldo.',
      'Confirmá la restauración — esto reemplazará tus datos actuales.',
      'La app se recarga con todos tus datos recuperados.'
    ],
    related: ['respaldar_datos']
  },

  // ═══ ANÁLISIS ═══
  {
    id: 'entender_dashboard',
    title: 'Entender la pestaña Análisis',
    keywords: [
      'analisis',
      'dashboard',
      'grafico',
      'kpi',
      'estadisticas',
      'proyeccion',
      'metricas',
      'como voy'
    ],
    steps: [
      'Tocá la pestaña **Análisis** (ícono de gráfico).',
      '**Proyección al cierre:** cuánto ganarías este mes a tu ritmo actual.',
      '**KPIs:** días trabajados, horas totales, promedio por turno, mejor día.',
      '**Gráfico de barras:** ingreso por cada día trabajado.',
      '**Gráfico circular:** distribución por tipo de recargo (diurno, nocturno, festivo, extra).',
      '**Tip:** consejo personalizado según tus datos.'
    ],
    related: ['configurar_salario', 'ver_historial']
  },
  {
    id: 'modo_quincena',
    title: 'Activar el modo quincena',
    keywords: ['quincena', 'pago quincenal', 'cada 15 dias', 'q1', 'q2', 'periodo pago'],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Activá el switch **Calcular por quincena**.',
      'Configurá los días de inicio de cada quincena (ej: Q1 día 1, Q2 día 16).',
      'En el Dashboard verás tus ingresos separados por Q1 y Q2.',
      'Ideal si te pagan cada 15 días en vez de una vez al mes.'
    ],
    related: ['configurar_salario', 'entender_dashboard']
  },

  // ═══ ASISTENTE ═══
  {
    id: 'usar_asistente',
    title: 'Usar el asistente IA',
    keywords: [
      'usar asistente',
      'como pregunto',
      'chat',
      'ia',
      'inteligencia artificial',
      'consultar'
    ],
    steps: [
      'Tocá la pestaña **Asistente** (ícono ✦).',
      'Escribí tu pregunta en lenguaje natural. Ejemplos:',
      '• "¿Cuánto gané este mes?"',
      '• "¿Cómo voy vs el mes pasado?"',
      '• "¿Cuándo es el próximo festivo?"',
      '• "Enviá mi reporte por correo"',
      'También podés tocar las categorías precargadas abajo.'
    ],
    related: ['iniciar_turno', 'entender_dashboard']
  },

  // ═══ APARIENCIA ═══
  {
    id: 'modo_oscuro',
    title: 'Activar el modo oscuro',
    keywords: ['modo oscuro', 'dark mode', 'tema oscuro', 'noche', 'cambiar tema', 'fondo negro'],
    steps: [
      'Tocá el ícono de luna 🌙 en la esquina superior derecha.',
      'La app cambia a modo oscuro al instante.',
      'Tocá el sol ☀️ para volver a modo claro.',
      'Tu preferencia se guarda automáticamente.'
    ],
    related: []
  },

  // ═══ ACCESIBILIDAD ═══
  {
    id: 'accesibilidad',
    title: 'Usar la app con lector de pantalla',
    keywords: [
      'accesibilidad',
      'lector pantalla',
      'voiceover',
      'talkback',
      'ciego',
      'discapacidad visual',
      'accesible'
    ],
    steps: [
      'Mi Turno es compatible con VoiceOver (iOS) y TalkBack (Android).',
      'Cada botón, pestaña y tarjeta tiene una etiqueta que el lector lee en voz alta.',
      'Los modales se anuncian como ventanas emergentes.',
      'El chat del asistente se lee automáticamente cuando hay respuesta.',
      'Podés navegar por regiones: Inicio, Análisis, Asistente, Historial, Ajustes.',
      'La app pasa auditoría WCAG 2.1 AA con 0 violaciones.'
    ],
    related: ['usar_asistente']
  },

  // ═══ CONEXIÓN Y SINCRONIZACIÓN ═══
  {
    id: 'estado_conexion',
    title: 'Verificar el estado de conexión',
    keywords: [
      'conexion',
      'conectado',
      'supabase',
      'nube',
      'online',
      'offline',
      'sin conexion',
      'estoy conectado',
      'hay conexion',
      'funciona internet',
      'sincronizando',
      'sync'
    ],
    steps: [
      'En la pestaña **Ajustes**, arriba de todo, ves tu estado de conexión.',
      '🟢 **Verde:** conectado a Supabase, todo sincronizado.',
      '🟡 **Ámbar:** sincronizando cambios pendientes.',
      '⚪ **Gris:** modo local (invitado) o sin conexión a nube.',
      'La app funciona 100% sin internet. Tus datos se guardan localmente y se sincronizan cuando vuelve la conexión.'
    ],
    related: ['sincronizacion', 'modo_offline']
  },
  {
    id: 'sincronizacion',
    title: 'Cómo funciona la sincronización',
    keywords: [
      'sincronizar',
      'sincronizacion',
      'nube',
      'varios dispositivos',
      'multi dispositivo',
      'sync',
      'datos en la nube',
      'respaldo automatico'
    ],
    steps: [
      'Cuando creás una cuenta con email y contraseña, tus datos se sincronizan con Supabase.',
      '**Offline-first:** primero se guarda en tu dispositivo, luego se sube a la nube.',
      'Si no hay internet, los cambios quedan en cola y se envían cuando vuelve la conexión.',
      '**Multi-dispositivo:** iniciá sesión en otro celular con la misma cuenta y ves todo igual.',
      'Los cambios de un dispositivo se reflejan en el otro en menos de 1 segundo (tiempo real).'
    ],
    related: ['estado_conexion', 'modo_offline', 'configurar_pin']
  },
  {
    id: 'modo_offline',
    title: 'Usar la app sin internet',
    keywords: [
      'offline',
      'sin internet',
      'modo avion',
      'funciona sin datos',
      'no tengo internet',
      'sin red',
      'desconectado'
    ],
    steps: [
      '**Sí, Mi Turno funciona completamente sin internet.**',
      'Todos los cálculos son locales: no necesitás conexión para iniciar o finalizar turnos.',
      'El asistente IA también es 100% offline — no depende de servidores externos.',
      'Si tenés cuenta, los cambios se encolan y se suben cuando vuelva la conexión.',
      'El ícono de conexión en Ajustes te muestra el estado en tiempo real.'
    ],
    related: ['estado_conexion', 'sincronizacion']
  },

  // ═══ INSTALACIÓN ═══
  {
    id: 'instalar_pwa',
    title: 'Instalar la app en tu celular',
    keywords: [
      'instalar',
      'pwa',
      'pantalla inicio',
      'icono',
      'aplicacion',
      'descargar app',
      'play store',
      'app store',
      'instalar app',
      'instalo app',
      'instalo la app',
      'como instalo',
      'como descargar',
      'instalar aplicacion',
      'añadir inicio',
      'anadir inicio'
    ],
    steps: [
      '**Android (Chrome):** Tocá los 3 puntitos ⋮ > "Añadir a pantalla de inicio".',
      '**iPhone (Safari):** Tocá el botón Compartir (cuadro con flecha) > "Añadir a inicio".',
      'La app se instala como cualquier otra, con su ícono y nombre.',
      'La PWA se actualiza automáticamente cuando abrís la app.'
    ],
    related: ['exportar_datos', 'respaldar_datos']
  },

  // ═══ COMPARTIR ═══
  {
    id: 'compartir_whatsapp',
    title: 'Compartir por WhatsApp (desde Análisis)',
    keywords: [
      'compartir whatsapp',
      'whatsapp',
      'compartir analisis',
      'compartir mis numeros',
      'mandar whatsapp',
      'enviar por whatsapp',
      'compartir desde analisis',
      'compartir numeros',
      'boton whatsapp',
      'compartir informe',
      'comparto analisis',
      'comparto mis numeros',
      'compartir resumen',
      'compartir dashboard'
    ],
    steps: [
      'Tocá la pestaña **Análisis** (ícono de gráfico 📊).',
      'Bajá hasta el final donde dice "💬 WhatsApp".',
      'Se abre WhatsApp con un mensaje pre-formateado con tus números.',
      'También podés tocar "📤 Compartir" para enviarlo por Telegram, correo u otras apps.',
      '**Importante:** esto NO genera un archivo PDF. Es solo un mensaje de texto.',
      'Si querés un archivo descargable, andá a **Historial > Exportar** y elegí PDF o Excel.',
      'El mensaje incluye: total ganado, turnos, horas, proyección, promedio y desglose de recargos.'
    ],
    related: ['entender_dashboard', 'exportar_datos', 'enviar_reporte']
  },

  // ═══ CONFIGURACIÓN AVANZADA ═══
  {
    id: 'configurar_quincena',
    title: 'Configurar los días de la quincena',
    keywords: [
      'dias quincena',
      'cambiar quincena',
      'configurar quincena',
      'periodo quincena',
      'q1 q2',
      'cuando empieza quincena',
      'modificar quincena',
      'cambio quincena',
      'modifico quincena',
      'modifico dias quincena',
      'cambio dias quincena',
      'editar quincena',
      'ajustar quincena',
      'cambiar fechas quincena',
      'configuro quincena'
    ],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'Buscá la sección **Preferencias de pago**.',
      'Activá el switch **Calcular por quincena**.',
      'Se desplegarán dos campos: **Día de inicio Q1** y **Día de inicio Q2**.',
      'Por defecto: Q1 arranca el día 1 y Q2 el día 16.',
      'Podés cambiarlos. Ejemplo: Q1 día 10, Q2 día 25.',
      'Los totales en Inicio y Dashboard se separan por cada quincena configurada.'
    ],
    related: ['configurar_salario', 'modo_quincena', 'entender_dashboard']
  },
  {
    id: 'configurar_genero',
    title: 'Seleccionar tu género en la app',
    keywords: ['genero', 'hombre', 'mujer', 'sexo', 'masculino', 'femenino', 'cambiar genero'],
    steps: [
      'Andá a la pestaña **Ajustes**.',
      'En la parte superior, debajo de tu email, verás dos botones: ♂ Hombre y ♀ Mujer.',
      'Tocá el que corresponda. Se ilumina en azul.',
      'La IA adapta su lenguaje: usa "parce" para hombres, "amiga" para mujeres.',
      'Podés cambiar la selección en cualquier momento.'
    ],
    related: ['cambiar_nombre', 'cambiar_foto']
  },

  // ═══ CÁLCULOS ═══
  {
    id: 'como_calcula_recargos',
    title: 'Cómo calcula los recargos la app',
    keywords: [
      'como calcula',
      'recargos',
      'formula',
      'calculo',
      'metodo',
      'como se calcula',
      'logica calculo'
    ],
    steps: [
      'La app usa la legislación colombiana vigente (Código Sustantivo del Trabajo + Ley 2101 de 2021).',
      '**Valor hora:** salario base ÷ 240 horas (jornada máxima legal).',
      '**Recargos:** nocturno 35%, extra diurno 25%, extra nocturno 75%, dominical/festivo ' +
        _HELP_FEST +
        '%, extra dominical ' +
        (_HELP_FEST + 25) +
        '%.',
      'Los minutos se clasifican en 8 categorías según el momento del día y tipo de día.',
      'El límite ordinario es 8h/día o la jornada semanal (44h en 2026), lo que se agote primero determina las extras.',
      'El cálculo es 100% local — no depende de internet ni de servidores externos.'
    ],
    related: ['ley_2101', 'configurar_salario']
  },
  {
    id: 'ley_2101',
    title: 'Ley 2101 de 2021 — Jornada laboral',
    keywords: [
      'ley',
      '2101',
      'jornada maxima',
      'horas semanales',
      'cst',
      'codigo laboral',
      'legislacion',
      'ley laboral',
      'derechos'
    ],
    steps: [
      'La Ley 2101 de 2021 reduce gradualmente la jornada laboral en Colombia.',
      '**2023:** 47h/semana | **2024:** 46h | **2025:** 45h | **2026:** 44h | **2027:** 42h (meta final).',
      'La app ajusta automáticamente el límite según la fecha del turno.',
      'El auxilio de transporte es de $249,095 para 2026 (Decreto 1470 de 2025).',
      'El salario mínimo 2026 es de $1,750,905.',
      'Estos valores se actualizan automáticamente en la app cada año.'
    ],
    related: ['como_calcula_recargos', 'configurar_salario']
  },
  {
    id: 'auxilio_transporte',
    title: 'Auxilio de transporte',
    keywords: ['auxilio', 'transporte', 'subsidio', 'auxilio transporte', 'cuanto es auxilio'],
    steps: [
      'El auxilio de transporte para 2026 es de **$249,095** mensuales.',
      'Para activarlo: Ajustes > Preferencias de pago > activá el switch **Auxilio de transporte**.',
      'Si usás modo quincena, se prorratea automáticamente a la mitad.',
      'Este valor se suma a tus ingresos proyectados en Inicio y Dashboard.',
      'Fuente: Decreto 1470 del 29 de diciembre de 2025.'
    ],
    related: ['configurar_salario', 'modo_quincena', 'ley_2101']
  },
  {
    id: 'prestaciones',
    title: 'Prestaciones sociales',
    keywords: [
      'prestaciones',
      'prima',
      'cesantias',
      'vacaciones',
      'liquidacion',
      'cuanto me liquidan'
    ],
    steps: [
      'La app estima tus prestaciones con un ~21.8% sobre tu salario.',
      'Incluye: cesantías (8.33%), prima (8.33%), vacaciones (4.17%), intereses de cesantías (~1%).',
      'Para activarlo: Ajustes > Preferencias de pago > activá el switch **Prestaciones**.',
      'Este es un estimado — los valores exactos dependen de tu contrato y antigüedad.',
      'Para una liquidación completa, consultá con un contador o usá la calculadora del Ministerio de Trabajo.'
    ],
    related: ['configurar_salario', 'auxilio_transporte']
  },

  // ═══ GESTIÓN DE CUENTA ═══
  {
    id: 'gestionar_cuenta',
    title: 'Gestionar tu cuenta (PIN, email, contraseña)',
    keywords: [
      'gestionar cuenta',
      'cambiar email',
      'cambiar contraseña',
      'cambiar password',
      'cuenta',
      'administrar cuenta'
    ],
    steps: [
      'Andá a la pestaña **Ajustes** > sección **Cuenta**.',
      'Tocá **Gestionar cuenta** > se abre un panel con 3 pestañas.',
      '**PIN:** cambiá tu código de acceso de 4 dígitos.',
      '**Email:** cambiá tu correo. Se enviará una verificación.',
      '**Contraseña:** cambiá tu clave (mínimo 6 caracteres).',
      'Cada cambio requiere confirmación con un código de seguridad.'
    ],
    related: ['configurar_pin', 'cambiar_password', 'recuperar_pin']
  },

  // ═══ DIAGNÓSTICO ═══
  {
    id: 'diagnostico',
    title: 'Diagnóstico de la app',
    keywords: [
      'diagnostico',
      'solucionar',
      'arreglar',
      'no funciona',
      'error',
      'falla',
      'bug',
      'problema'
    ],
    steps: [
      'Si algo no funciona, primero verificá tu conexión en Ajustes.',
      '**Recargá la app:** arrastrá hacia abajo para refrescar.',
      'Si el problema persiste, andá a Ajustes > Administrador (solo admin) > **Diagnóstico**.',
      'Ahí ves el estado de sesiones, base de datos local y cola de sincronización.',
      'También podés usar el comando **/reset** en el chat del asistente.',
      'Como último recurso, cerrá sesión y volvé a entrar.'
    ],
    related: ['estado_conexion', 'sincronizacion']
  },

  // ═══ VERSIONES ═══
  {
    id: 'version_app',
    title: 'Versión de la app y actualizaciones',
    keywords: ['version', 'actualizar', 'update', 'nueva version', 'que version', 'cambios'],
    steps: [
      'Tu versión actual aparece al final de la pestaña **Ajustes** (ej: "Colombia · Nómina inteligente · v175").',
      'La PWA se actualiza automáticamente: al abrir la app, descarga la última versión.',
      'Si tenés la app de Play Store, actualizala desde allí.',
      'No es necesario hacer nada: tus datos se conservan entre versiones.'
    ],
    related: ['instalar_pwa', 'diagnostico']
  },

  // ═══ RECARGOS ESPECÍFICOS ═══
  {
    id: 'recargo_nocturno',
    title: 'Recargo nocturno',
    keywords: [
      'nocturno',
      'noche',
      'recargo noche',
      'horario nocturno',
      'desde que hora nocturno',
      'cuanto pagan nocturno'
    ],
    steps: [
      'El recargo nocturno en Colombia es del **35%** sobre el valor hora ordinario.',
      'Aplica entre las **9:00 PM y las 6:00 AM**.',
      'Si trabajás de noche, cada hora vale 1.35 veces más.',
      'Si además es festivo o domingo, se acumula con el recargo festivo (' + _HELP_FEST + '%).',
      'Total nocturno + festivo: ' + (_HELP_FEST + 35) + '% del valor hora.',
      'La app detecta automáticamente las horas nocturnas de cada turno.'
    ],
    related: ['como_calcula_recargos', 'ley_2101']
  },
  {
    id: 'recargo_festivo',
    title: 'Recargo dominical y festivo',
    keywords: [
      'festivo',
      'festivos',
      'domingo',
      'dominical',
      'recargo festivo',
      'cuentan festivos',
      'cuanto pagan festivo',
      'cuanto pagan domingo'
    ],
    steps: [
      'El recargo dominical/festivo es del **' +
        _HELP_FEST +
        '%** sobre el valor hora ordinario (Ley 2466/2025, sube hasta 100% en 2027).',
      'Aplica todo el día (24h) del domingo o festivo.',
      'Si el turno empieza un día hábil y termina en festivo, la parte festiva se calcula aparte.',
      'Los festivos colombianos se determinan por la ley Emiliani (algunos se trasladan al lunes).',
      'La app tiene todos los festivos precargados hasta 2030.'
    ],
    related: ['recargo_nocturno', 'como_calcula_recargos']
  },
  {
    id: 'horas_extras',
    title: 'Horas extras',
    keywords: [
      'extra',
      'extras',
      'hora extra',
      'sobretiempo',
      'como funcionan extras',
      'cuando son extras'
    ],
    steps: [
      'Las horas extra se disparan cuando superás la jornada ordinaria.',
      'Límite diario: 8 horas. Límite semanal: 44h (2026, desde jun 15). Antes del 15 de junio de 2026 rige 45h.',
      '**Extra diurna:** 25% adicional (1.25x).',
      '**Extra nocturna:** 75% adicional (1.75x).',
      '**Extra festiva diurna:** 100% adicional (2.0x).',
      '**Extra festiva nocturna:** 150% adicional (2.5x).',
      'El que se agote primero (diario o semanal) determina el inicio de las extras.'
    ],
    related: ['como_calcula_recargos', 'recargo_nocturno', 'ley_2101']
  }
];

// ─── MOTOR DE BÚSQUEDA MEJORADO ──────────────────────────────
// Usa tokenización con stemming (igual que ai-nlp.js) para que
// "cambio" coincida con "cambiar", "instalo" con "instalar", etc.
// También aplica el preprocesador para quitar muletillas.

function aiHelpSearch(question) {
  // Usar el tokenizador del NLP si está disponible (más robusto)
  var tokens = [];
  if (typeof aiTokenize === 'function') {
    tokens = aiTokenize(question);
  } else {
    // Fallback simple
    var q = (question || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿¡?!,.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    tokens = q.split(' ').filter(function (w) {
      return w.length >= 2;
    });
  }

  if (!tokens.length) return null;

  var best = null;
  var bestScore = 0;

  for (var i = 0; i < AI_HELP_GUIDES.length; i++) {
    var guide = AI_HELP_GUIDES[i];
    var score = 0;

    for (var j = 0; j < guide.keywords.length; j++) {
      var kw = guide.keywords[j].toLowerCase();
      // También tokenizar la keyword para comparación por tokens
      var kwTokens = kw.split(' ').filter(function (w) {
        return w.length >= 2;
      });
      // Stem cada token de la keyword (usando la misma lógica del NLP)
      var kwStems = [];
      for (var k = 0; k < kwTokens.length; k++) {
        var stemmed = typeof aiStem === 'function' ? aiStem(kwTokens[k]) : kwTokens[k];
        kwStems.push(stemmed);
      }
      // Verificar cuántos tokens de la keyword aparecen en los tokens de la pregunta
      var matchCount = 0;
      for (var k = 0; k < kwStems.length; k++) {
        for (var t = 0; t < tokens.length; t++) {
          if (tokens[t] === kwStems[k]) {
            matchCount++;
            break;
          }
        }
      }
      // Puntaje: todas las palabras de la keyword deben estar presentes
      if (matchCount === kwStems.length && kwStems.length > 0) {
        score += kwStems.length * 3; // keywords más largas pesan más
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = guide;
    }
  }

  return bestScore > 0 ? best : null;
}

// ─── FORMATEAR RESPUESTA ──────────────────────────────────────
// Convierte una guía en texto formateado con pasos numerados
// y guías relacionadas.

function aiHelpFormat(guide) {
  if (!guide) return null;

  var resp = '📖 **' + guide.title + '**\n\n';
  for (var i = 0; i < guide.steps.length; i++) {
    resp += i + 1 + '. ' + guide.steps[i] + '\n';
  }

  if (guide.related && guide.related.length > 0) {
    resp += '\n🔗 **Relacionado:**\n';
    for (var r = 0; r < guide.related.length; r++) {
      var rel = aiHelpGetById(guide.related[r]);
      if (rel) {
        resp += '• ' + rel.title + '\n';
      }
    }
  }

  return resp;
}

// ─── BUSCAR POR ID ────────────────────────────────────────────
function aiHelpGetById(id) {
  for (var i = 0; i < AI_HELP_GUIDES.length; i++) {
    if (AI_HELP_GUIDES[i].id === id) return AI_HELP_GUIDES[i];
  }
  return null;
}

// ─── LISTAR TODAS LAS GUÍAS ───────────────────────────────────
function aiHelpListAll() {
  var resp = '📚 **Guías disponibles**\n\n';
  var cats = {
    Turnos: ['iniciar_turno', 'finalizar_turno'],
    Salario: ['configurar_salario', 'modo_quincena', 'configurar_quincena'],
    Historial: ['ver_historial', 'exportar_datos', 'enviar_reporte', 'borrar_turno'],
    Perfil: ['cambiar_foto', 'cambiar_nombre', 'configurar_genero'],
    Seguridad: [
      'configurar_pin',
      'cambiar_password',
      'recuperar_pin',
      'cerrar_sesion',
      'gestionar_cuenta'
    ],
    Datos: ['respaldar_datos', 'restaurar_datos'],
    Conexión: ['estado_conexion', 'sincronizacion', 'modo_offline'],
    Análisis: ['entender_dashboard', 'compartir_whatsapp'],
    Asistente: ['usar_asistente'],
    'Cálculos y Leyes': [
      'como_calcula_recargos',
      'ley_2101',
      'auxilio_transporte',
      'prestaciones',
      'recargo_nocturno',
      'recargo_festivo',
      'horas_extras'
    ],
    Apariencia: ['modo_oscuro'],
    Instalación: ['instalar_pwa', 'version_app'],
    Soporte: ['diagnostico'],
    Accesibilidad: ['accesibilidad']
  };

  for (var cat in cats) {
    if (Object.prototype.hasOwnProperty.call(cats, cat)) {
      resp += '**' + cat + ':**\n';
      for (var i = 0; i < cats[cat].length; i++) {
        var g = aiHelpGetById(cats[cat][i]);
        if (g) resp += '  • ' + g.title + '\n';
      }
      resp += '\n';
    }
  }

  return resp;
}

// ─── API PÚBLICA ──────────────────────────────────────────────
function aiHelpAnswer(question) {
  var guide = aiHelpSearch(question);
  if (guide) return aiHelpFormat(guide);

  // Si no encuentra, sugiere preguntar de otra forma
  return '🤔 No encontré una guía específica para eso. Probá preguntando con otras palabras, o decime **"¿qué sabés hacer?"** para ver todas las guías disponibles.';
}

// ─── EXPORT ──────────────────────────────────────────────────
window.aiHelpAnswer = aiHelpAnswer;
window.aiHelpListAll = aiHelpListAll;
window.aiHelpSearch = aiHelpSearch;
window.aiHelpFormat = aiHelpFormat;
window.aiHelpGetById = aiHelpGetById;
window.AI_HELP_GUIDES = AI_HELP_GUIDES;

// ─── INICIALIZACIÓN ──────────────────────────────────────────
console.log('[MT] ai-help.js cargado — ' + AI_HELP_GUIDES.length + ' guías');
