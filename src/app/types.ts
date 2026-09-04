export type Prioritaet = 'hoch' | 'mittel' | 'niedrig';
export type TerminTyp = 'frist' | 'termin' | 'erinnerung';
export type EntscheidungsStatus = 'entwurf' | 'final' | 'widerrufen';
export type Screen = 'home' | 'notizen' | 'termine' | 'entscheidungen' | 'fristen' | 'suche' | 'mandant' | 'einstellungen';
export interface Mandant {
  id: string; name: string; rechtsform: string; ansprechpartner: string; telefon: string;
  email: string; steuer_id: string; finanzamt: string; wirtschaftsjahr_ende: string;
  mandant_seit: string; bearbeiter: string; kategorie: string; branchen_code: string;
  aktiv: boolean; ai_features_aktiv: boolean; notizen: string;
}
export interface Notiz {
  id: string; mandant_id: string; typ: 'notiz'; titel: string; erstellt: string; geaendert: string;
  autor: string; tags: string[]; ai_zusammenfassung: string; ai_folgeaktionen: string[];
  ai_verarbeitet: boolean; inhalt: string;
}
export interface Termin {
  id: string; mandant_id: string; typ: TerminTyp; titel: string; datum: string; uhrzeit: string | null;
  prioritaet: Prioritaet; erledigt: boolean; erstellt: string; quelle_notiz_id: string | null;
  ai_erkannt: boolean; notiz: string; unsicher?: boolean;
}
export interface AuditEintrag { datum: string; aktion: string; benutzer: string }
export interface Entscheidung {
  id: string; mandant_id: string; typ: 'entscheidung'; titel: string; erstellt: string; geaendert: string;
  entschieden_von: string; status: EntscheidungsStatus; tags: string[]; audit_trail: AuditEintrag[]; inhalt: string;
}
export interface IndexMandant {
  id: string; name: string; aktiv: boolean; letzte_aktivitaet: string;
  statistik: { notizen: number; termine_offen: number; entscheidungen: number };
}
export interface ErnaIndex { version: '1'; erstellt: string; aktualisiert: string; mandanten: IndexMandant[] }
export interface ErnaConfig {
  version: '1';
  kanzlei: { name: string; typ: 'Steuerberatung'; standardBearbeiter: string };
  ai: { aktiviert: boolean; autoStrukturierungBeiSave: boolean; autoFristenerkennung: boolean; model: string; sprache: 'de'; datenschutzAkzeptiert: boolean };
  ui: { theme: 'dark'; datumsformat: 'DD.MM.YYYY'; zeitformat: 'HH:mm' };
}
export interface Akte { mandant: Mandant; notizen: Notiz[]; termine: Termin[]; entscheidungen: Entscheidung[] }
export interface Quelldatei { pfad: string; datum: string; inhalt: string; id: string; typ: 'notiz' | 'entscheidung' | 'termin' | 'profil' }
export interface SuchTreffer { pfad: string; datum: string; titel: string; auszug: string; id: string; typ: Quelldatei['typ'] }
export interface ErkannteFrist {
  titel: string; datum: string | null; unsicher: boolean; prioritaet: Prioritaet;
  typ: TerminTyp; original_text: string; begruendung: string;
}
export interface StrukturierteNotiz {
  zusammenfassung: string; tags: string[]; erkannte_fristen: { titel: string; datum: string | null; original_text: string }[];
  folgeaktionen: string[]; prioritaet: Prioritaet; kategorie: 'rückfrage' | 'information' | 'aufgabe' | 'besprechung' | 'sonstiges';
}
export interface AiOptions { timeoutMs?: number; signal?: AbortSignal; model?: string; mandantIds?: readonly string[] }
export interface KontextOptions { includeNotizen?: boolean; includeTermine?: boolean; includeEntscheidungen?: boolean; maxFiles?: number; maxTokensEstimate?: number }
export type AiAction = 'strukturieren' | 'fristen' | 'entscheidung' | 'suche' | 'tagesbrief' | 'alle';
export interface AppContextValue {
  config: ErnaConfig; mandanten: Mandant[]; recentMandantIds: string[]; mandant: Mandant | null; akte: Akte | null;
  allTermine: (Termin & { mandant_name: string })[]; index: ErnaIndex | null;
  screen: Screen; focus: 'navigation' | 'content'; overlayOpen: boolean; editorOpen: boolean;
  width: number; height: number; busy: boolean; aiBusy: boolean; aiAvailable: boolean;
  selectedNotiz: Notiz | null; decisionDraft: string | null; decisionDraftTitle: string; searchMode: 'volltext' | 'ki';
  navigate(screen: Screen): void; setFocus(focus: 'navigation' | 'content'): void;
  selectMandant(id: string): Promise<void>; setEditorOpen(open: boolean): void;
  setSelectedNotiz(notiz: Notiz | null): void; setDecisionDraft(draft: string | null): void; setDecisionDraftTitle(title: string): void;
  setSearchMode(mode: 'volltext' | 'ki'): void; setMessage(message: string, error?: boolean): void;
  updateConfig(config: ErnaConfig): Promise<void>; refresh(): Promise<void>;
  setSessionApiKey(key: string): void;
  run(operation: () => Promise<void>): Promise<boolean>;
  runAi(action: AiAction): Promise<void>;
  afterSave(document: Notiz | Entscheidung, isNew: boolean): void;
}
export interface FormField { key: string; label: string; kind?: 'text' | 'choice' | 'secret'; options?: string[]; required?: boolean }
