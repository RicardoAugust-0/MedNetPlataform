# Graph Report - .  (2026-06-25)

## Corpus Check
- 220 files · ~163,525 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 750 nodes · 1437 edges · 62 communities (41 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Monitoring Platform Parsers|Monitoring Platform Parsers]]
- [[_COMMUNITY_Fatigue Analytics & Routes|Fatigue Analytics & Routes]]
- [[_COMMUNITY_Monitor Dashboard UI & Operations|Monitor Dashboard UI & Operations]]
- [[_COMMUNITY_Package Dependencies & Scripts|Package Dependencies & Scripts]]
- [[_COMMUNITY_Productivity & Agenda Modules|Productivity & Agenda Modules]]
- [[_COMMUNITY_Database RPC & Parity Verification|Database RPC & Parity Verification]]
- [[_COMMUNITY_Analytics Charts & Visualizations|Analytics Charts & Visualizations]]
- [[_COMMUNITY_Dashboard Shared Widgets|Dashboard Shared Widgets]]
- [[_COMMUNITY_Drivers Queue & Supabase Config|Drivers Queue & Supabase Config]]
- [[_COMMUNITY_Automation Hooks UI|Automation Hooks UI]]
- [[_COMMUNITY_Data Crosscheck & Carrier Stats|Data Crosscheck & Carrier Stats]]
- [[_COMMUNITY_State Providers & Contexts|State Providers & Contexts]]
- [[_COMMUNITY_App Shell & Auto Sync|App Shell & Auto Sync]]
- [[_COMMUNITY_Admin Settings & Credentials|Admin Settings & Credentials]]
- [[_COMMUNITY_React App Routes|React App Routes]]
- [[_COMMUNITY_Project Documentation & Guides|Project Documentation & Guides]]
- [[_COMMUNITY_KPI Drilldowns & Filters|KPI Drilldowns & Filters]]
- [[_COMMUNITY_Workspace & Document Editor|Workspace & Document Editor]]
- [[_COMMUNITY_AI Reports & Dossiers|AI Reports & Dossiers]]
- [[_COMMUNITY_Profile & Avatar Settings|Profile & Avatar Settings]]
- [[_COMMUNITY_Express Server Package|Express Server Package]]
- [[_COMMUNITY_Authentication & Login UI|Authentication & Login UI]]
- [[_COMMUNITY_Sascar Ingestion Functions|Sascar Ingestion Functions]]
- [[_COMMUNITY_Google Sheets Reading API|Google Sheets Reading API]]
- [[_COMMUNITY_Mock Data Definitions|Mock Data Definitions]]
- [[_COMMUNITY_PWA Hooks & Sidebar Layout|PWA Hooks & Sidebar Layout]]
- [[_COMMUNITY_Dashboard Mock Builders|Dashboard Mock Builders]]
- [[_COMMUNITY_AI Reports Generation API|AI Reports Generation API]]
- [[_COMMUNITY_Google Sheets Appending API|Google Sheets Appending API]]
- [[_COMMUNITY_Dashboard Time Helpers|Dashboard Time Helpers]]
- [[_COMMUNITY_AI Dossier Generation API|AI Dossier Generation API]]
- [[_COMMUNITY_MedNet Features & Spec Plans|MedNet Features & Spec Plans]]
- [[_COMMUNITY_WhatsApp Dispatches UI|WhatsApp Dispatches UI]]
- [[_COMMUNITY_Platform Badges & Critical SLA|Platform Badges & Critical SLA]]
- [[_COMMUNITY_Carrier Stats Layout|Carrier Stats Layout]]
- [[_COMMUNITY_Notes Hook & Context|Notes Hook & Context]]
- [[_COMMUNITY_CSV Headers Checker|CSV Headers Checker]]
- [[_COMMUNITY_Maintenance Screen|Maintenance Screen]]
- [[_COMMUNITY_Google Apps Script Webhooks|Google Apps Script Webhooks]]
- [[_COMMUNITY_Image Upload Library|Image Upload Library]]
- [[_COMMUNITY_Vite & PWA Build Configuration|Vite & PWA Build Configuration]]
- [[_COMMUNITY_Template Inspection CLI|Template Inspection CLI]]
- [[_COMMUNITY_TipTap Workspace Specs|TipTap Workspace Specs]]
- [[_COMMUNITY_Server Template Inspection|Server Template Inspection]]
- [[_COMMUNITY_Postgres RPC Progress Docs|Postgres RPC Progress Docs]]
- [[_COMMUNITY_Invite User Endpoint|Invite User Endpoint]]
- [[_COMMUNITY_Apple Touch Brand Icon|Apple Touch Brand Icon]]
- [[_COMMUNITY_Favicon Design Concepts|Favicon Design Concepts]]
- [[_COMMUNITY_Maskable Brand Logo Design|Maskable Brand Logo Design]]
- [[_COMMUNITY_PWA Launcher Brand Icon|PWA Launcher Brand Icon]]
- [[_COMMUNITY_PWA Icon Branding Concepts|PWA Icon Branding Concepts]]
- [[_COMMUNITY_Template Adapter Functions|Template Adapter Functions]]
- [[_COMMUNITY_Vercel Deploy Settings|Vercel Deploy Settings]]
- [[_COMMUNITY_Bluesky Icon Symbol|Bluesky Icon Symbol]]
- [[_COMMUNITY_Discord Icon Symbol|Discord Icon Symbol]]
- [[_COMMUNITY_Documentation Icon Symbol|Documentation Icon Symbol]]
- [[_COMMUNITY_GitHub Icon Symbol|GitHub Icon Symbol]]
- [[_COMMUNITY_Social Icon Symbol|Social Icon Symbol]]
- [[_COMMUNITY_X Icon Symbol|X Icon Symbol]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 48 edges
2. `useToast()` - 45 edges
3. `supabase` - 31 edges
4. `useConfirm()` - 18 edges
5. `parse()` - 14 edges
6. `useApp()` - 13 edges
7. `normalize()` - 13 edges
8. `aggregate()` - 13 edges
9. `normClf()` - 12 edges
10. `runParityTests()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `n8n and FastAPI RPA Workflow` --semantically_similar_to--> `Google Sheets Bidirectional Integration`  [INFERRED] [semantically similar]
  supabase/n8n_integration_guide.md → docs/PROJECT.md
- `runParityTests()` --calls--> `aggregate()`  [EXTRACTED]
  server/analytics-parity.js → src/utils/fatigueParser.js
- `filterRows()` --calls--> `normClf()`  [EXTRACTED]
  server/analytics-routes.js → src/utils/fatigueParser.js
- `MedNet Web App Entry Point` --conceptually_related_to--> `MedNet README`  [INFERRED]
  index.html → README.md
- `Profile()` --calls--> `useAuth()`  [EXTRACTED]
  src/modules/Profile.jsx → src/auth/AuthContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Daily-Use Productivity Features Group** — specs_2026_05_08_mednet_features_design_templates_vars, specs_2026_05_08_mednet_features_design_agenda_notifications, specs_2026_05_08_mednet_features_design_history_filters, specs_2026_05_08_mednet_features_design_pwa [EXTRACTED 1.00]
- **Workspace Editor TipTap Redesign Specifications and Plans** — plans_2026_05_09_workspace_editor_tiptap, specs_2026_05_09_workspace_editor_design, specs_2026_05_09_workspace_editor_design_tiptap_editor [EXTRACTED 1.00]
- **UI Icon Symbols** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_documentation_icon, public_icons_github_icon, public_icons_social_icon, public_icons_x_icon [EXTRACTED 1.00]

## Communities (62 total, 21 thin omitted)

### Community 0 - "Monitoring Platform Parsers"
Cohesion: 0.05
Nodes (54): COLUMNS, FINALIZADO_STATUS, INTERVENCAO_EVENTOS, SEV_MAP, TAXONOMY, TECNICO_EVENTOS, maxtrack, detect() (+46 more)

### Community 1 - "Fatigue Analytics & Routes"
Cohesion: 0.06
Nodes (39): FadigaCharts(), FadigaKPIs(), buildImportRows(), ImportModal(), AnalyticsHeader(), ComparisonModal(), FadigaKPIsDrill(), SourceChips() (+31 more)

### Community 2 - "Monitor Dashboard UI & Operations"
Cohesion: 0.06
Nodes (33): AuthProvider(), ErrorBoundary, ConfirmProvider(), SheetHistoryContext, SheetHistoryProvider(), useSheetHistory(), useTemplates(), ToastProvider() (+25 more)

### Community 3 - "Package Dependencies & Scripts"
Cohesion: 0.05
Nodes (41): dependencies, chart.js, react, react-dom, react-router-dom, recharts, @supabase/supabase-js, @tiptap/extension-color (+33 more)

### Community 4 - "Productivity & Agenda Modules"
Cohesion: 0.09
Nodes (23): ConfirmContext, useConfirm(), AVAILABLE_ICONS, LinksContext, LinksProvider(), PALETTE, useLinks(), useNotes() (+15 more)

### Community 5 - "Database RPC & Parity Verification"
Cohesion: 0.14
Nodes (27): assertDeepEqual(), excludeLeve(), filterRows(), formatDataRows(), getCarrierAliases(), HEADERS, main(), MAPPING (+19 more)

### Community 6 - "Analytics Charts & Visualizations"
Cohesion: 0.18
Nodes (20): ComparisonView(), ClassificacaoAlertasCard(), TaxaFalsoPositivoCard(), TipoDeteccaoCard(), AlertasCategoriaCard(), EvidenciaVideoCard(), _ax(), C (+12 more)

### Community 7 - "Dashboard Shared Widgets"
Cohesion: 0.14
Nodes (13): Banner(), ClassificationBreakdown(), FilterBar(), HourlyActivity(), KPI(), ProductivityRanking(), Section(), AnimatedNumber() (+5 more)

### Community 8 - "Drivers Queue & Supabase Config"
Cohesion: 0.15
Nodes (9): AuthCtx, RPA_CONFIG_DEFAULT, RpaCard(), DEFAULT, RemindersContext, RemindersProvider(), today(), toLocal() (+1 more)

### Community 9 - "Automation Hooks UI"
Cohesion: 0.15
Nodes (13): ChatTab(), EVENT_OPTIONS, HookCard(), HookDrawer(), HooksTab(), ICON_OPTIONS, triggerLabelFor(), VncModal() (+5 more)

### Community 10 - "Data Crosscheck & Carrier Stats"
Cohesion: 0.18
Nodes (13): SideUploadCard(), buildCarrierStats(), buildDuplicateStats(), buildStats(), formatLoadedAt(), isCriticalLabel(), normalizeKeyLabel(), normalizePlate() (+5 more)

### Community 11 - "State Providers & Contexts"
Cohesion: 0.16
Nodes (9): DataProvider(), CarrierAliasesContext, CarrierAliasesProvider(), ProfilesContext, ProfilesProvider(), TemplatesContext, TemplatesProvider(), WsPagesContext (+1 more)

### Community 12 - "App Shell & Auto Sync"
Cohesion: 0.18
Nodes (11): Topbar(), useAutoSync(), useDriversQueue(), Dashboard(), AppShell(), AppProvider(), Ctx, useApp() (+3 more)

### Community 13 - "Admin Settings & Credentials"
Cohesion: 0.20
Nodes (13): AtendimentosContext, AtendimentosProvider(), useMaintenance(), useProfiles(), useToast(), Admin(), AI_CONFIG_DEFAULT, AI_PROVIDERS (+5 more)

### Community 14 - "React App Routes"
Cohesion: 0.12
Nodes (15): Admin, Agenda, Analytics, Automacoes, CrossCheck, Dashboard, DossiesPage, EmbeddedSheet (+7 more)

### Community 15 - "Project Documentation & Guides"
Cohesion: 0.16
Nodes (15): Technical Audit (2026-05-29), Monitoring Platforms Integration Guide, Maxtrack Platform Adapter, Sascar Platform Adapter, MedNet Project Documentation, Dashboard Gestão à Vista, Realtime Drivers Queue (drivers_queue), Google Sheets Bidirectional Integration (+7 more)

### Community 16 - "KPI Drilldowns & Filters"
Cohesion: 0.22
Nodes (7): EmAbertoDrill(), FechadosDrill(), VolumeDrill(), FILTERS_DEFAULT, useDashboardFilters(), useDashboardSettings(), PERIODOS

### Community 17 - "Workspace & Document Editor"
Cohesion: 0.21
Nodes (8): useWsPages(), Workspace(), ALLOWED_PASTE_TYPES, COLORS, FONT_SIZES, PageEditor(), WS_CATEGORIES, WS_ICONS

### Community 18 - "AI Reports & Dossiers"
Cohesion: 0.27
Nodes (10): useAtendimentos(), useCarrierAliases(), DossiesPage(), renderMarkdown(), Monitor(), AI_PROVIDERS, PERIOD_OPTS, renderMarkdown() (+2 more)

### Community 19 - "Profile & Avatar Settings"
Cohesion: 0.23
Nodes (6): ALLOWED_TYPES, EXT_MAP, removeAvatar(), uploadAvatar(), AvatarSection(), Profile()

### Community 20 - "Express Server Package"
Cohesion: 0.17
Nodes (11): dependencies, cors, dotenv, express, @supabase/supabase-js, main, name, scripts (+3 more)

### Community 21 - "Authentication & Login UI"
Cohesion: 0.22
Nodes (7): useAuth(), LoginPage(), s, SetPasswordPage(), styles, AdminGuard(), SascarTokenHandler()

### Community 22 - "Sascar Ingestion Functions"
Cohesion: 0.24
Nodes (8): ALARM_BUCKET, ALARM_NAMES, buildHeaders(), CATEGORY_BUCKET, CORS, fetchAllAlarms(), getTodayRange(), tryRefresh()

### Community 23 - "Google Sheets Reading API"
Cohesion: 0.18
Nodes (5): CORS, FORMULA_ERRORS, MES_NUM, MESES, SheetRow

### Community 24 - "Mock Data Definitions"
Cohesion: 0.18
Nodes (10): APP_CONFIG, LINKS_DEFAULT, MOCK_DRIVERS, MOCK_HISTORY, MOCK_HOURLY, NAV_ITEMS, NOTES_DEFAULT, REMINDERS_DEFAULT (+2 more)

### Community 25 - "PWA Hooks & Sidebar Layout"
Cohesion: 0.29
Nodes (6): Sidebar(), usePWA(), ACCENT_VARIANTS, iniciais(), MONTHS, WEEKDAYS

### Community 26 - "Dashboard Mock Builders"
Cohesion: 0.22
Nodes (5): _MOTS, _now, _OP_DIST, _TIPOS_A, _TRANSP

### Community 27 - "AI Reports Generation API"
Cohesion: 0.22
Nodes (4): CORS, DriverMetrics, MonthBucket, RequestBody

### Community 29 - "Dashboard Time Helpers"
Cohesion: 0.32
Nodes (5): buildMesesLookback(), MES_LABELS, parseSheetRowDate(), parseTimeStrToMin(), useDashboardMetrics()

### Community 30 - "AI Dossier Generation API"
Cohesion: 0.25
Nodes (4): Atendimento, CORS, RequestBody, TelemetryEvent

### Community 31 - "MedNet Features & Spec Plans"
Cohesion: 0.25
Nodes (8): Daily-Use Features Implementation Plan, Daily-Use Features Design Specification, Agenda Notifications, History Filtering & CSV Export, Installable PWA, Templates with Dynamic Variables, Agenda Edit Button & Category Icons Design Specification, Agenda Category Icons & Edit Modal

### Community 32 - "WhatsApp Dispatches UI"
Cohesion: 0.38
Nodes (3): DisparosTab(), DispatchesTable(), MetricsGrid()

### Community 33 - "Platform Badges & Critical SLA"
Cohesion: 0.40
Nodes (4): CriticalSLA(), BASE_STYLE, CONFIG, PlatformBadge()

### Community 35 - "Notes Hook & Context"
Cohesion: 0.50
Nodes (4): fmtDate(), NotesContext, NotesProvider(), toLocal()

### Community 36 - "CSV Headers Checker"
Cohesion: 0.40
Nodes (4): content, csvPath, headers, lines

### Community 38 - "Google Apps Script Webhooks"
Cohesion: 0.83
Nodes (3): doGet(), doPost(), getMesAtual()

### Community 39 - "Image Upload Library"
Cohesion: 0.50
Nodes (3): ALLOWED_TYPES, EXT_MAP, uploadImage()

### Community 43 - "TipTap Workspace Specs"
Cohesion: 1.00
Nodes (3): Workspace Editor TipTap Refactor Implementation Plan, Workspace Editor TipTap Redesign Specification, TipTap Editor Integration

## Knowledge Gaps
- **208 isolated node(s):** `supabase`, `name`, `private`, `version`, `type` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Drivers Queue & Supabase Config` to `WhatsApp Dispatches UI`, `Fatigue Analytics & Routes`, `Monitor Dashboard UI & Operations`, `Notes Hook & Context`, `Productivity & Agenda Modules`, `Monitoring Platform Parsers`, `Image Upload Library`, `Automation Hooks UI`, `State Providers & Contexts`, `Admin Settings & Credentials`, `React App Routes`, `KPI Drilldowns & Filters`, `AI Reports & Dossiers`, `Profile & Avatar Settings`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `useToast()` connect `Admin Settings & Credentials` to `Fatigue Analytics & Routes`, `Monitor Dashboard UI & Operations`, `Notes Hook & Context`, `Productivity & Agenda Modules`, `Drivers Queue & Supabase Config`, `Automation Hooks UI`, `Data Crosscheck & Carrier Stats`, `State Providers & Contexts`, `React App Routes`, `Workspace & Document Editor`, `AI Reports & Dossiers`, `Authentication & Login UI`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Authentication & Login UI` to `WhatsApp Dispatches UI`, `Monitor Dashboard UI & Operations`, `Notes Hook & Context`, `Productivity & Agenda Modules`, `Maintenance Screen`, `Drivers Queue & Supabase Config`, `Automation Hooks UI`, `App Shell & Auto Sync`, `Admin Settings & Credentials`, `React App Routes`, `KPI Drilldowns & Filters`, `Workspace & Document Editor`, `AI Reports & Dossiers`, `Profile & Avatar Settings`, `PWA Hooks & Sidebar Layout`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `supabase`, `name`, `private` to the rest of the system?**
  _208 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Monitoring Platform Parsers` be split into smaller, more focused modules?**
  _Cohesion score 0.05006839945280438 - nodes in this community are weakly interconnected._
- **Should `Fatigue Analytics & Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.05711263881544157 - nodes in this community are weakly interconnected._
- **Should `Monitor Dashboard UI & Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.05656565656565657 - nodes in this community are weakly interconnected._