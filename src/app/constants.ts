import type { ErnaConfig, Screen } from './types.js';
export const THEME = {
  bg: '#1E1E1E', bgPanel: '#252526', bgSidebar: '#333333', bgSelected: '#094771', bgHover: '#2A2D2E', bgInput: '#3C3C3C',
  fgPrimary: '#D4D4D4', fgSecondary: '#9D9D9D', fgDimmed: '#6A6A6A', fgSelected: '#FFFFFF',
  accent: '#007ACC', accentGreen: '#6A9955', accentYellow: '#DCDCAA', accentRed: '#F44747', accentOrange: '#CE9178',
  border: '#454545', borderActive: '#007ACC', statusBar: '#007ACC', statusBarFg: '#FFFFFF',
} as const;
export const KEYBINDINGS = {
  HELP: { key: 'f1', label: 'F1', hint: 'Hilfe' }, MANDANT: { key: 'f2', label: 'F2', hint: 'Mandant' },
  NEU: { key: 'f3', label: 'F3', hint: 'Neu' }, BEARBEITEN: { key: 'f4', label: 'F4', hint: 'Bearbeiten' },
  SUCHE: { key: 'f5', label: 'F5', hint: 'Suche' }, HEUTE: { key: 'f6', label: 'F6', hint: 'Heute' },
  AKTE: { key: 'f7', label: 'F7', hint: 'Mandantenakte' }, ARCHIV: { key: 'f8', label: 'F8', hint: 'Archiv' },
  AI: { key: 'f9', label: 'F9', hint: 'KI-Aktionen' }, BEENDEN: { key: 'f10', label: 'F10', hint: 'Beenden' },
  LOESCHEN: { key: 'f8', label: 'F8', hint: 'Löschen' }, ZURUECK: { key: 'escape', label: 'ESC', hint: 'Zurück' },
  SPEICHERN: { key: 'ctrl+s', label: 'Ctrl+S', hint: 'Speichern' }, NAV_UP: { key: 'up' }, NAV_DOWN: { key: 'down' },
  NAV_LEFT: { key: 'left' }, NAV_RIGHT: { key: 'right' }, CONFIRM: { key: 'return' }, TAB_NEXT: { key: 'tab' }, TAB_PREV: { key: 'shift+tab' },
} as const;
export const NAVIGATION: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Start' }, { screen: 'notizen', label: 'Notizen' }, { screen: 'termine', label: 'Termine' },
  { screen: 'entscheidungen', label: 'Entscheidungen' }, { screen: 'fristen', label: 'Fristen' }, { screen: 'suche', label: 'Suche' },
  { screen: 'mandant', label: 'Mandant' }, { screen: 'einstellungen', label: 'Einstellungen' },
];
export const DEFAULT_CONFIG: ErnaConfig = {
  version: '1', kanzlei: { name: 'Meine Kanzlei', typ: 'Steuerberatung', standardBearbeiter: '' },
  ai: { aktiviert: true, autoStrukturierungBeiSave: true, autoFristenerkennung: true, model: 'claude-opus-4-5', sprache: 'de', datenschutzAkzeptiert: false },
  ui: { theme: 'dark', datumsformat: 'DD.MM.YYYY', zeitformat: 'HH:mm' },
};
export const PRIVACY_NOTICE = 'Für die KI-Features werden Mandantendaten an die Anthropic Claude API übertragen.\nBitte stelle sicher, dass du hierzu berechtigt bist (Datenschutzrecht, Berufsrecht).';
