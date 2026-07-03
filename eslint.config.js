// eslint.config.js — ESLint v9 flat config for Mi Turno (vanilla JS + React CDN)
import js from '@eslint/js';

// External CDN/browser globals only (not defined by this project)
const externalGlobals = {
  // Browser
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  fetch: 'readonly',
  caches: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  FormData: 'readonly',
  FileReader: 'readonly',
  Image: 'readonly',
  Promise: 'readonly',
  Array: 'readonly',
  Object: 'readonly',
  Math: 'readonly',
  Date: 'readonly',
  JSON: 'readonly',
  String: 'readonly',
  Number: 'readonly',
  Boolean: 'readonly',
  RegExp: 'readonly',
  Error: 'readonly',
  Intl: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Uint8Array: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  location: 'readonly',
  history: 'readonly',
  screen: 'readonly',
  // CDN libraries
  React: 'readonly',
  ReactDOM: 'readonly',
  supabase: 'readonly',
  XLSX: 'readonly',
  jspdf: 'readonly',
  jsPDF: 'readonly',
  // Browser speech APIs
  SpeechRecognition: 'readonly',
  webkitSpeechRecognition: 'readonly',
  SpeechSynthesisUtterance: 'readonly',
  speechSynthesis: 'readonly',
  // Browser Notifications API
  Notification: 'readonly',
};

// All project-defined globals available across script tags
const projectGlobals = {
  // react-init.js
  h: 'readonly',
  useState: 'readonly',
  useEffect: 'readonly',
  useRef: 'readonly',
  useCallback: 'readonly',
  useMemo: 'readonly',

  // config/globals.js
  SUPA: 'writable',
  CLOUD_MODE: 'writable',
  CLOUD_ERROR: 'writable',
  SMIN: 'readonly',
  HSEM: 'readonly',
  SKEY: 'readonly',
  U12H: 'readonly',
  RC: 'readonly',
  AUX_TRANSPORTE_2026: 'readonly',
  PRESTACIONES_PCT: 'readonly',
  FEST_CACHE: 'writable',
  getEaster: 'readonly',

  // config/env.js
  IS_IOS: 'readonly',
  IS_SAFARI: 'readonly',
  IS_IOS_SAFARI: 'readonly',
  IS_STANDALONE: 'readonly',

  // utils/storage.js
  safeStorage: 'readonly',
  leer: 'readonly',
  grabar: 'readonly',
  borrarKey: 'readonly',
  dk: 'readonly',

  // utils/haptic.js
  haptic: 'readonly',
  hapticSuccess: 'readonly',
  hapticError: 'readonly',
  hapticWarning: 'readonly',

  // services/audio-sfx.js
  sfxDing: 'readonly',
  sfxError: 'readonly',
  sfxWhoosh: 'readonly',
  sfxSwitch: 'readonly',
  sfxClick: 'readonly',
  sfxPageTurn: 'readonly',
  sfxShutter: 'readonly',
  sfxWow: 'readonly',
  sfxYippee: 'readonly',
  sfxBruh: 'readonly',
  sfxPlay: 'readonly',
  sfxPreload: 'readonly',
  SFX: 'readonly',
  Audio: 'readonly',

  // utils/network.js
  traducirError: 'readonly',
  withTimeout: 'readonly',

  // utils/validation.js
  validarSesion: 'readonly',
  validarTurnoActivo: 'readonly',
  validarTurnos: 'readonly',

  // utils/uuid.js
  generateUUID: 'readonly',

  // utils/storage.js / network.js
  hashP: 'readonly',

  // utils/format.js
  fCOP: 'readonly',
  fDur: 'readonly',
  fDurShort: 'readonly',

  // utils/animated-amount.js
  AnimatedCOP: 'readonly',

  // utils/time.js
  semLun: 'readonly',
  esNoct: 'readonly',

  // utils/festivos.js
  esFest: 'readonly',
  getColombianHolidays: 'readonly',

  // utils/otp.js
  otpGenerar: 'readonly',
  otpVerificar: 'readonly',
  otpLimpiar: 'readonly',
  generarPINUnico: 'readonly',
  guardarPINEnNube: 'readonly',

  // services/*.js
  cargarDatos: 'readonly',
  insertTurno: 'readonly',
  supaDeleteTurno: 'readonly',
  supaDeleteAllTurnos: 'readonly',
  supaInsertTurno: 'readonly',
  supaUpdateTurno: 'readonly',
  supaSetActivo: 'readonly',
  supaSetSalario: 'readonly',
  supaSyncDown: 'readonly',
  buildContext: 'readonly',
  supaUpsertPerfil: 'readonly', // New
  supaSubscribeUser: 'readonly', // v39 realtime
  getRealtimeStatus: 'readonly', // v74 estado conexión Supabase
  supaUpdatePinLookup: 'readonly', // v38 sync cola
  supaPropagateEmail: 'readonly', // v38 sync cola

  // services/quincena.js
  QUINCENA_PREFS_DEFAULT: 'readonly',
  normalizePrefs: 'readonly',
  getQuincenaRange: 'readonly',
  getQuincenasMes: 'readonly',
  filterTurnosRango: 'readonly',
  calcularExtras: 'readonly',
  formatRangoCorto: 'readonly',

  // utils/network.js
  isOnline: 'readonly',
  onOnline: 'readonly',
  removeOnlineListener: 'readonly',

  // utils/icons.js
  tabIcon: 'readonly',

  // app/fast-pin-screen.js + modals/forgot-pin.js
  FastPinScreen: 'readonly',
  ForgotPinModal: 'readonly',

  // utils/error-logger.js
  logError: 'readonly',
  getErrors: 'readonly',
  addErrorListener: 'readonly',
  removeErrorListener: 'readonly',
  clearErrors: 'readonly',

  // tabs/sync-queue.js
  queueAction: 'readonly',
  processQueue: 'readonly',
  clearSyncQueue: 'readonly',

  // services/session-sync.js
  startSessionSync: 'readonly',
  stopSessionSync: 'readonly',
  verificarSesion: 'readonly',

  // services/ai-history.js + services/ai-greeting.js
  // + modals/email-compose-card.js (extraídos de assistant.js en v48)
  _aiClearHistory: 'readonly',
  _aiLoadHistory: 'readonly',
  _aiSaveHistory: 'readonly',
  _aiFormat: 'readonly',
  _saludoHora: 'readonly',
  _aiNombrePersonal: 'readonly',
  _aiHeroPhrases: 'readonly',
  EmailComposeCard: 'readonly',

  // config/globals.js
  getHSEM: 'readonly',
  getRecargoFestivo: 'readonly',
  getInicioNocturno: 'readonly',
  rcFactor: 'readonly',
  UVT_2026: 'readonly',
  MT_APP_VERSION: 'readonly',

  // utils/password-hash.js (v49)
  hashPassword: 'readonly',
  verifyPassword: 'readonly',

  // services/backup.js (v96)
  backupExport: 'readonly',
  backupImport: 'readonly',
  backupMarkExported: 'readonly',

  // services/push-notifications.js (v352)
  notifEstado: 'readonly',
  notifPedir: 'readonly',
  notifEnviar: 'readonly',
  notifOnVisible: 'readonly',

  // services/geofence.js (v368)
  GEO_DEFAULTS: 'readonly',
  geoConfig: 'readonly',
  geoPatch: 'readonly',
  geoDist: 'readonly',
  geoEval: 'readonly',
  geoHora: 'readonly',
  geoIsTwa: 'readonly',
  geoSyncNative: 'readonly',
  geoConsumeDeepLink: 'readonly',
  geoInit: 'readonly',
  geoStop: 'readonly',
  geoCheckNow: 'readonly',
  geoStartWatch: 'readonly',
  geoStopWatch: 'readonly',

  // services/ai-help.js (v107)
  aiHelpAnswer: 'readonly',
  aiHelpListAll: 'readonly',

  // modals/onboarding.js (v98)
  OnboardingModal: 'readonly',
  onboardingDone: 'readonly',

  // v362: error boundary, skeleton, novedades, borrado de cuenta (GDPR)
  ErrorBoundary: 'readonly',
  SkeletonScreen: 'readonly',
  WhatsNewModal: 'readonly',
  WHATS_NEW: 'readonly',
  whatsNewShouldShow: 'readonly',
  whatsNewMarkSeen: 'readonly',
  DeleteAccountModal: 'readonly',
  wipeLocalAccount: 'readonly',
  supaDeleteAccount: 'readonly',

  // app-main.js (toast global de UI)
  showToast: 'readonly',

  deleteError: 'readonly',
  aiAnswer: 'readonly',
  AI_INTENT_REGISTRY: 'readonly',
  aiIntentSpec: 'readonly',
  aiIntentsByDomain: 'readonly',
  aiResolveByPriority: 'readonly',
  aiRegistrySourceOf: 'readonly',
  aiRegistryValidate: 'readonly',
  aiLastTrace: 'readonly',
  MT_AI_DEBUG: 'writable',
  aiClassifyIntent: 'readonly',
  aiGetConversation: 'readonly',
  aiUpdateConversation: 'readonly',
  aiResetConv: 'readonly',
  aiMemoryReset: 'readonly',
  aiAnalyzeMood: 'readonly',
  aiEmpatheticPrefix: 'readonly',
  aiEmpatheticSuffix: 'readonly',
  aiFallbackResponse: 'readonly',
  aiFollowUp: 'readonly',
  aiDebugTokens: 'readonly',
  // services/ai-enhanced.js
  aiEnhancedRespond: 'readonly',
  aiResolveContextRef: 'readonly',
  aiCheckFollowUp: 'readonly',
  aiClearMemory: 'readonly',
  aiGetMemorySnapshot: 'readonly',
  aiRestoreHistory: 'readonly',
  aiGetRecentMessages: 'readonly',
  AI_MEM_MSGS: 'readonly',
  AI_MEM_PREGUNTAS: 'readonly',
  aiSeedMessages: 'readonly',
  aiSyncStateLabel: 'readonly',
  aiThink: 'readonly',
  aiHumanizar: 'readonly',
  // services/ai-query.js
  aiQueryParse: 'readonly',
  aiQueryRun: 'readonly',
  aiQueryCompare: 'readonly',
  aiQueryLastCard: 'readonly',
  aiParseSpecificDate: 'readonly',
  AI_QUERY_DICT: 'readonly',
  // services/ai-episodes.js
  aiEpisodesLoad: 'readonly',
  aiEpisodeRecord: 'readonly',
  aiEpisodeFromInteraction: 'readonly',
  aiEpisodesRecent: 'readonly',
  aiEpisodeLast: 'readonly',
  aiEpisodeAnswer: 'readonly',
  // services/ai-engage.js
  aiEngageQuestion: 'readonly',
  aiEngageActions: 'readonly',
  aiEngageCuriosidad: 'readonly',
  aiEngageTrivia: 'readonly',
  aiEngageCheckTrivia: 'readonly',
  aiEngageReset: 'readonly',
  _aiMemory: 'readonly',
  // services/ai-memory.js
  aiMemoryLoad: 'readonly',
  aiMemorySave: 'readonly',
  aiMemoryRestore: 'readonly',
  aiMemoryOnFirstMessage: 'readonly',
  aiMemoryResetSession: 'readonly',
  // services/ai-conversation.js
  aiConvLevel: 'readonly',
  aiConvReset: 'readonly',
  aiConvAdvance: 'readonly',
  aiConvOrchestrate: 'readonly',
  aiConvNextStep: 'readonly',
  aiNextChips: 'readonly',
  aiConvGetState: 'readonly',
  aiConvRestore: 'readonly',
  // services/ai-nlp.js
  aiExtractEntities: 'readonly',
  _aiIntentTopic: 'readonly',
  aiTokenize: 'readonly',
  aiStem: 'readonly',
  // services/ai-synonyms.js
  AI_SYNONYMS_DICT: 'readonly',
  AI_SYN_MAP: 'readonly',
  aiSynExpand: 'readonly',
  aiSynExpandPhrase: 'readonly',

  // services/ai-knowledge.js
  aiKnowledgeSearch: 'readonly',
  // services/ai-insights.js
  aiInsightFull: 'readonly',
  // services/ai-proactive.js
  aiProactive: 'readonly',
  aiBriefing: 'readonly',
  aiAlerts: 'readonly',
  aiCheckGoals: 'readonly',
  aiSetGoal: 'readonly',
  aiGoalStatusLine: 'readonly',
  aiDataHygiene: 'readonly',
  // services/ai-achievements.js
  aiListAllAchievements: 'readonly',
  aiCheckAchievements: 'readonly',
  aiFormatAchievements: 'readonly',
  // services/ai-gemini.js
  aiGeminiAsk: 'readonly',
  aiGeminiExtract: 'readonly',
  // services/ai.js (helpers internos usados en assistant.js)
  _aiDispatchCalc: 'readonly',
  // services/ai-advisor.js
  aiAdvisorOptimizador: 'readonly',
  aiAdvisorInforme: 'readonly',
  aiAdvisorHistorico: 'readonly',
  aiAdvisorAhorro: 'readonly',
  aiAdvisorRespond: 'readonly',
  aiAdvisorSimular: 'readonly',
  aiAuditarPago: 'readonly',
  aiOptimizarProximo: 'readonly',
  aiAdvisorLiquidacion: 'readonly',
  aiAdvisorIndemnizacion: 'readonly',
  aiAdvisorEmergencia: 'readonly',
  aiAdvisorEndeudamiento: 'readonly',
  aiAdvisorCompararOfertas: 'readonly',
  aiAdvisorPresupuesto: 'readonly',
  // services/ai-calendar.js
  syncWithCalendar: 'readonly',
  processCalendarEvents: 'readonly',
  aiExportCalendar: 'readonly',
  aiGenerateICS: 'readonly',
  // services/ai-psychology.js
  aiPsychRespond: 'readonly',
  // services/ai-auditor.js
  aiAuditShifts: 'readonly',
  // services/ai-agent-cards.js
  aiBuildGoalCard: 'readonly',
  aiBuildSimData: 'readonly',
  aiBuildWatchdog: 'readonly',
  aiParseMonto: 'readonly',
  aiAgentRoute: 'readonly',
  // services/ai-router.js
  aiRouteTools: 'readonly',
  aiCacheToolResult: 'readonly',
  aiInvalidateToolCache: 'readonly',
  aiRouterStats: 'readonly',
  AI_TOOLS: 'readonly',
  AI_INTENT_TOOLS: 'readonly',
  // services/ai-collector.js
  aiCollectData: 'readonly',
  aiMergeData: 'readonly',
  // services/ai-reasoning.js
  aiReason: 'readonly',
  aiVarPct: 'readonly',
  aiIsOutlier: 'readonly',
  AI_FINDING_TYPES: 'readonly',
  // services/ai-responder.js
  aiGenerateResponse: 'readonly',
  aiValidateResponse: 'readonly',
  aiVerifyNumbers: 'readonly',
  aiDeliberate: 'readonly',
  aiFocusClose: 'readonly',
  aiReferring: 'readonly',
  aiRankFindings: 'readonly',
  aiPolishResponse: 'readonly',
  aiResponderReset: 'readonly',
  // services/ai-insights.js (todas las funciones exportadas)
  aiInsightBreakdown: 'readonly',
  aiInsightScenarios: 'readonly',
  aiInsightEfficiency: 'readonly',
  aiInsightLegal: 'readonly',
  // services/ai-advisor.js (todas las funciones exportadas)
  aiAdvisorFiscal: 'readonly',
  aiAdvisorOferta: 'readonly',
  aiAdvisorDescanso: 'readonly',
  aiAdvisorAnual: 'readonly',
  // services/gender-lang.js
  _gl: 'readonly',
  _glTerm: 'readonly',
  _glPick: 'readonly',
  _glGetGender: 'readonly',
  // services/voice-agent.js
  voiceDetect: 'readonly',
  voiceExecute: 'readonly',
  calcCats: 'readonly',
  calcPorDia: 'readonly',
  doCalc: 'readonly',
  doCalcPerTurno: 'readonly',
  exportPDF: 'readonly',
  exportExcel: 'readonly',
  exportDesprendiblePDF: 'readonly',
  buildDesprendibleData: 'readonly',
  aiMiniRazonamiento: 'readonly',
  exportPDFBase64: 'readonly',
  exportExcelBase64: 'readonly',
  enviarReportePorEmail: 'readonly',
  enviarPINPorEmail: 'readonly',

  // React components
  Root: 'readonly',
  App: 'readonly',
  SplashScreen: 'readonly',
  AuthScreen: 'readonly',
  AnimatedWaveDots: 'readonly',
  ManageAccountModal: 'readonly',
  ModalOlvidado: 'readonly',
  AsignarPINsModal: 'readonly',
  UsuariosModal: 'readonly',
  ExportReportModal: 'readonly',
  PinSetup: 'readonly',
  DiagnosticoModal: 'readonly',
  ErrorViewerModal: 'readonly',

  // Tab components
  HomeTab: 'readonly',
  DashboardTab: 'readonly',
  AsistenteTab: 'readonly',
  HistoryTab: 'readonly',
  ConfigTab: 'readonly',
};

const sharedRules = {
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-constant-condition': 'warn',
  'eqeqeq': ['warn', 'always', { null: 'ignore' }],
  // Empty catch blocks are intentional in many fallback/cleanup paths
  'no-empty': ['error', { allowEmptyCatch: true }],
  // Let Prettier handle all formatting
  'semi': 'off',
  'indent': 'off',
  'quotes': 'off',
  'no-trailing-spaces': 'off',
};

export default [
  js.configs.recommended,

  // ── Definition files (config, utils, services, tabs, app)
  // These files declare the globals — no-redeclare and no-unused-vars are
  // suppressed since usage happens cross-file in the browser.
  {
    files: [
      'js/*.js',
      'js/config/*.js',
      'js/utils/*.js',
      'js/services/*.js',
      'js/tabs/*.js',
      'js/app/*.js',
      'js/modals/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...externalGlobals, ...projectGlobals },
    },
    rules: {
      ...sharedRules,
      'no-undef': 'error',
      // vars:'local' skips top-level declarations (cross-file globals in this multi-script app);
      // caughtErrors:'none' skips catch bindings (almost always unused intentionally)
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      // Definition files re-declare globals that are listed in the config —
      // suppress the false positive for those files.
      'no-redeclare': 'off',
    },
  },

  // ── Supabase Edge Functions (Deno / TypeScript)
  {
    files: ['supabase/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { Deno: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-undef': 'off', // TypeScript handles this
    },
  },

  {
    ignores: ['node_modules/**', 'dist/**', '*.min.js', 'js/lib/**'],
  },
];
