# CLAUDE.md – ERNA-AI Bauspezifikation

> Diese Datei ist die vollständige Bauanleitung für Claude Code.
> Lies sie vollständig, bevor du eine einzige Zeile Code schreibst.
> Halte dich exakt an die hier beschriebene Architektur, Dateistruktur und Designprinzipien.

---

## 0. Projektübersicht

**Name**: ERNA-AI – Elektronische Recherche- und Notiz-Anwendung (AI Edition)  
**Zweck**: Keyboard-first Kanzleisoftware für Steuerberater zum Erfassen von Notizen, Terminen und Entscheidungen – ergänzt um Claude AI für automatische Strukturierung, Fristerkennung und semantische Suche.  
**Inspiration**: MS-DOS-Kanzleisoftware ERNA der 1980er/90er Jahre.  
**Zielgruppe**: Steuerberatungskanzleien im DACH-Raum.

---

## 1. Technischer Stack – exakt einzuhalten

| Komponente | Technologie | Version |
|---|---|---|
| Runtime | Node.js | ≥ 20 LTS |
| Sprache | TypeScript | ≥ 5.3 |
| TUI Framework | `ink` + `ink-select-input` + `ink-text-input` | latest stable |
| AI | Anthropic Claude API | `@anthropic-ai/sdk` latest |
| Markdown Parsing | `gray-matter` (YAML Frontmatter) | latest |
| UUID | `uuid` | latest |
| Datum | `date-fns` mit `de` Locale | latest |
| Konfiguration | `.env` via `dotenv` | latest |
| Testing | `vitest` | latest |
| Linting | `eslint` + `@typescript-eslint` | latest |

**Kein Datenbankserver. Kein Vektorspeicher. Kein RAG. Kein Backend-Server.**  
Alles läuft lokal, dateibasiert, im Terminal.

---

## 2. Projektstruktur – exakt so anlegen

```
erna-ai/
├── CLAUDE.md                    # Diese Datei
├── README.md                    # Kurzanleitung für Endbenutzer
├── package.json
├── tsconfig.json
├── .env.example                 # Template, NIEMALS echten Key committen
├── .gitignore
├── .eslintrc.json
│
├── src/
│   ├── index.tsx                # Einstiegspunkt, startet die TUI
│   │
│   ├── app/
│   │   ├── App.tsx              # Root-Komponente, State-Management, Navigation
│   │   ├── types.ts             # Alle gemeinsamen TypeScript-Typen
│   │   └── constants.ts         # Farben, Tastenkürzel, Konfigurationswerte
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── StatusBar.tsx    # Obere Leiste: App-Name, Mandant, Datum
│   │   │   ├── ActionBar.tsx    # Untere Leiste: F-Tasten Hinweise
│   │   │   ├── Sidebar.tsx      # Linke Navigation (Notizen/Termine/etc.)
│   │   │   └── ContentPane.tsx  # Rechter Hauptbereich
│   │   │
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx         # Startbildschirm / Dashboard
│   │   │   ├── NotizenScreen.tsx      # Notizenübersicht + Editor
│   │   │   ├── TermineScreen.tsx      # Terminübersicht
│   │   │   ├── EntscheidungenScreen.tsx
│   │   │   ├── FristenScreen.tsx      # Fristen-Dashboard
│   │   │   ├── SucheScreen.tsx        # Volltext + AI-Suche
│   │   │   ├── MandantScreen.tsx      # Mandantenakte
│   │   │   └── EinstellungenScreen.tsx
│   │   │
│   │   └── shared/
│   │       ├── TextEditor.tsx         # Mehrzeiliger Texteditor (keyboard)
│   │       ├── MandantPicker.tsx      # F2: Mandant wechseln (Typehead)
│   │       ├── ConfirmDialog.tsx      # Ja/Nein Bestätigungen
│   │       ├── AiLoadingSpinner.tsx   # Anzeige während AI arbeitet
│   │       ├── ErrorBanner.tsx        # Fehlermeldungen
│   │       └── KeyHint.tsx            # Einzelner F-Tasten Hinweis
│   │
│   ├── data/
│   │   ├── filesystem.ts        # Alle Datei-Lese/Schreib-Operationen
│   │   ├── mandanten.ts         # Mandanten CRUD
│   │   ├── notizen.ts           # Notizen CRUD
│   │   ├── termine.ts           # Termine CRUD
│   │   ├── entscheidungen.ts    # Entscheidungen CRUD
│   │   ├── index.ts             # erna-index.json Management
│   │   └── seed.ts              # Demodaten anlegen (--seed Flag)
│   │
│   ├── ai/
│   │   ├── client.ts            # Anthropic API Client, Retry-Logik
│   │   ├── context.ts           # Mandantenkontext-Loader (Dateien → String)
│   │   ├── prompts.ts           # Alle Prompt-Templates als Konstanten
│   │   ├── strukturieren.ts     # Feature: Notiz strukturieren
│   │   ├── fristen.ts           # Feature: Fristen erkennen
│   │   ├── entscheidung.ts      # Feature: Entscheidung dokumentieren
│   │   ├── suche.ts             # Feature: Semantische Suche
│   │   └── tagesbrief.ts        # Feature: Tagesübersicht
│   │
│   └── utils/
│       ├── dates.ts             # Datums-Hilfsfunktionen (de Locale)
│       ├── format.ts            # Text-Formatierung
│       └── keyboard.ts          # Tastatur-Event-Handling Helpers
│
├── demo-data/                   # Wird mit --seed in ~/erna-data/ kopiert
│   ├── mandanten/
│   │   ├── M-2024-0001/         # Huber GmbH
│   │   ├── M-2024-0002/         # Schmidt & Partner KG
│   │   └── M-2024-0003/         # Dr. Berger Einzelunternehmen
│   └── erna-index.json
│
└── tests/
    ├── data/filesystem.test.ts
    ├── ai/fristen.test.ts
    └── utils/dates.test.ts
```

---

## 3. Dateiformat-Spezifikation

### 3.1 Notiz (Markdown mit YAML Frontmatter)

Pfad: `~/erna-data/mandanten/{mandant-id}/notizen/{YYYY-MM-DD}_{slug}.md`

```markdown
---
id: "uuid-v4"
mandant_id: "M-2024-0001"
typ: "notiz"
titel: "Rückfrage Bilanzkorrekturen 2023"
erstellt: "2024-11-15T14:32:00+01:00"
geaendert: "2024-11-15T14:45:00+01:00"
autor: "Dr. Müller"
tags: ["jahresabschluss", "rückfrage", "dringend"]
ai_zusammenfassung: "Mandant fragt wegen GWG-Abschreibungen 2023. Frist für Antwort: 20.11.2024."
ai_folgeaktionen: ["Steuerakte 2023 prüfen", "BMF-Schreiben zu §6 EStG recherchieren"]
ai_verarbeitet: true
---

Mandant rief um 14:30 Uhr an. Frage zu Abschreibungen auf geringwertige Wirtschaftsgüter im Jahr 2023. Er hat 3 Laptops im Februar 2023 für je 850€ gekauft und fragt, ob er diese sofort abschreiben kann oder über 3 Jahre abschreiben muss.

Habe ihm erklärt, dass seit 2021 die GWG-Grenze bei 800€ netto liegt, seine Laptops also darüber liegen. Wir klären bis 20.11.2024.
```

### 3.2 Termin (JSON)

Pfad: `~/erna-data/mandanten/{mandant-id}/termine/{YYYY-MM-DD}_{slug}.json`

```json
{
  "id": "uuid-v4",
  "mandant_id": "M-2024-0001",
  "typ": "frist",
  "titel": "Antwort GWG-Abschreibung",
  "datum": "2024-11-20",
  "uhrzeit": null,
  "prioritaet": "hoch",
  "erledigt": false,
  "erstellt": "2024-11-15T14:32:00+01:00",
  "quelle_notiz_id": "uuid-der-ursprungsnotiz",
  "ai_erkannt": true,
  "notiz": "Aus Telefonat vom 15.11. – Mandant wartet auf Klärung GWG-Behandlung."
}
```

### 3.3 Entscheidung (Markdown mit YAML Frontmatter)

Pfad: `~/erna-data/mandanten/{mandant-id}/entscheidungen/{YYYY-MM-DD}_{slug}.md`

```markdown
---
id: "uuid-v4"
mandant_id: "M-2024-0001"
typ: "entscheidung"
titel: "Behandlung Laptop-Kauf 2023 (GWG-Abschreibung)"
erstellt: "2024-11-18T10:00:00+01:00"
geaendert: "2024-11-18T10:30:00+01:00"
entschieden_von: "Dr. Müller"
status: "final"
tags: ["gwg", "abschreibung", "§6-estg"]
audit_trail:
  - datum: "2024-11-18T10:00:00+01:00"
    aktion: "Erstellt"
    benutzer: "Dr. Müller"
  - datum: "2024-11-18T10:30:00+01:00"
    aktion: "Status auf final gesetzt"
    benutzer: "Dr. Müller"
---

## Sachverhalt

Mandant Huber GmbH erwarb im Februar 2023 drei Laptops zu je 850€ netto. Mandant fragt nach steuerlicher Behandlung.

## Relevante Rechtsgrundlagen

- § 6 Abs. 2 EStG (GWG-Grenze 800€ netto seit 01.01.2021)
- § 7 EStG (Regelabschreibung)
- BMF-Schreiben vom 30.09.2010 (GWG-Sammelposten, weiterhin anwendbar)

## Entscheidung

Die drei Laptops zu je 850€ netto überschreiten die GWG-Grenze von 800€ netto. Eine Sofortabschreibung nach § 6 Abs. 2 EStG ist nicht möglich. Regelabschreibung über die betriebsgewöhnliche Nutzungsdauer von 3 Jahren (AfA-Tabelle).

Alternativ: Sammelposten nach § 6 Abs. 2a EStG über 5 Jahre (hier wirtschaftlich ungünstiger).

## Begründung

Empfehlung der Regelabschreibung über 3 Jahre, da Nutzungsdauer für Laptops laut BMF-Schreiben vom 26.02.2021 auf 1 Jahr reduziert wurde. Daher de facto Vollabschreibung im Jahr 2023 möglich.

**Hinweis**: BMF-Schreiben 26.02.2021 zur Nutzungsdauer von Computerhardware prüfen – danach gilt 1 Jahr als betriebsgewöhnliche Nutzungsdauer.

## Offene Punkte

- [ ] Kaufbelege anfordern und prüfen
- [ ] Prüfen ob Laptops ausschließlich betrieblich genutzt werden
```

### 3.4 Mandantenprofil (JSON)

Pfad: `~/erna-data/mandanten/{mandant-id}/profil.json`

```json
{
  "id": "M-2024-0001",
  "name": "Huber GmbH",
  "rechtsform": "GmbH",
  "ansprechpartner": "Max Huber",
  "telefon": "+49 89 12345678",
  "email": "m.huber@huber-gmbh.de",
  "steuer_id": "DE123456789",
  "finanzamt": "München für Körperschaften",
  "wirtschaftsjahr_ende": "12-31",
  "mandant_seit": "2018-03-01",
  "bearbeiter": "Dr. Müller",
  "kategorie": "GmbH",
  "branchen_code": "62",
  "aktiv": true,
  "ai_features_aktiv": true,
  "notizen": "Familienunternehmen, Inhaber sehr detailorientiert. Bevorzugt schriftliche Kommunikation."
}
```

### 3.5 Zentraler Index (`~/erna-data/erna-index.json`)

```json
{
  "version": "1",
  "erstellt": "2024-11-01T00:00:00+01:00",
  "aktualisiert": "2024-11-15T14:45:00+01:00",
  "mandanten": [
    {
      "id": "M-2024-0001",
      "name": "Huber GmbH",
      "aktiv": true,
      "letzte_aktivitaet": "2024-11-15T14:45:00+01:00",
      "statistik": {
        "notizen": 12,
        "termine_offen": 3,
        "entscheidungen": 5
      }
    }
  ]
}
```

---

## 4. Benutzeroberfläche – exakte Spezifikation

### 4.1 Designsystem (VS Code Dark-Style)

Alle Farben als Konstanten in `src/app/constants.ts` definieren:

```typescript
export const THEME = {
  // Hintergründe
  bg: '#1E1E1E',           // Haupthintergrund (VS Code Background)
  bgPanel: '#252526',      // Panel-Hintergrund
  bgSidebar: '#333333',    // Sidebar
  bgSelected: '#094771',   // Ausgewähltes Element (VS Code Selection Blue)
  bgHover: '#2A2D2E',      // Hover-State
  bgInput: '#3C3C3C',      // Eingabefelder

  // Text
  fgPrimary: '#D4D4D4',    // Haupttext (VS Code Foreground)
  fgSecondary: '#9D9D9D',  // Sekundärtext
  fgDimmed: '#6A6A6A',     // Gedimmter Text
  fgSelected: '#FFFFFF',   // Text bei Auswahl

  // Akzentfarben
  accent: '#007ACC',       // VS Code Blau
  accentGreen: '#6A9955',  // Erfolg / OK
  accentYellow: '#DCDCAA', // Warnung / Frist bald
  accentRed: '#F44747',    // Fehler / Überfällig
  accentOrange: '#CE9178', // Wichtig

  // UI-Elemente
  border: '#454545',       // Rahmen
  borderActive: '#007ACC', // Aktiver Rahmen
  statusBar: '#007ACC',    // Statusleiste (VS Code blauer Balken)
  statusBarFg: '#FFFFFF',  // Statusleisten-Text
};
```

### 4.2 Layout-Struktur

```
┌─ StatusBar (1 Zeile) ──────────────────────────────────────┐
│ ERNA-AI 1.0  │  Mandant: Huber GmbH (M-2024-0001)  │ Mi, 15.11.2024 │ 14:32 │
├─ Sidebar (20 Zeichen breit) ──┬─ ContentPane ─────────────┤
│                               │                            │
│  NAVIGATION                   │                            │
│  ─────────                    │                            │
│  ▸ Notizen           (12)     │    [Aktiver Screen-        │
│    Termine            (3!)    │     Inhalt hier]           │
│    Entscheidungen     (5)     │                            │
│    Fristen           ──       │                            │
│    Suche             ──       │                            │
│    ─────────                  │                            │
│    Mandant           ──       │                            │
│    Einstellungen     ──       │                            │
│                               │                            │
├───────────────────────────────┴────────────────────────────┤
│ ActionBar (1-2 Zeilen)                                      │
│ F1 Hilfe  F2 Mandant  F3 Neu  F5 Suche  F9 KI  F10 Beenden│
└────────────────────────────────────────────────────────────┘
```

- **Sidebar**: `(3!)` bedeutet 3 offene Elemente mit mind. einem dringenden
- **ContentPane**: füllt den gesamten restlichen Platz
- **ActionBar**: zeigt kontextsensitiv nur relevante F-Tasten

### 4.3 Globale Tastenkürzel

```typescript
export const KEYBINDINGS = {
  HELP:       { key: 'f1',  label: 'F1',  hint: 'Hilfe' },
  MANDANT:    { key: 'f2',  label: 'F2',  hint: 'Mandant' },
  NEU:        { key: 'f3',  label: 'F3',  hint: 'Neu' },
  BEARBEITEN: { key: 'f4',  label: 'F4',  hint: 'Bearbeiten' },
  SUCHE:      { key: 'f5',  label: 'F5',  hint: 'Suche' },
  HEUTE:      { key: 'f6',  label: 'F6',  hint: 'Heute' },
  AKTE:       { key: 'f7',  label: 'F7',  hint: 'Mandantenakte' },
  ARCHIV:     { key: 'f8',  label: 'F8',  hint: 'Archiv' },
  AI:         { key: 'f9',  label: 'F9',  hint: 'KI-Aktionen' },
  BEENDEN:    { key: 'f10', label: 'F10', hint: 'Beenden' },
  LOESCHEN:   { key: 'f8',  label: 'F8',  hint: 'Löschen' },  // kontextabhängig
  ZURUECK:    { key: 'escape', label: 'ESC', hint: 'Zurück' },
  SPEICHERN:  { key: 'ctrl+s', label: 'Ctrl+S', hint: 'Speichern' },
  NAV_UP:     { key: 'up' },
  NAV_DOWN:   { key: 'down' },
  NAV_LEFT:   { key: 'left' },
  NAV_RIGHT:  { key: 'right' },
  CONFIRM:    { key: 'return' },
  TAB_NEXT:   { key: 'tab' },
  TAB_PREV:   { key: 'shift+tab' },
};
```

**Wichtig**: `useInput` von `ink` für alle Tastaturevents verwenden. Kein Maus-Handling implementieren.

### 4.4 Screens im Detail

#### HomeScreen (Startbildschirm)

Zeigt:
- Heutiges Datum und Uhrzeit groß
- Aktueller Mandant (Name + ID)
- Kurzzusammenfassung: X Notizen, Y offene Termine, Z überfällige Fristen
- Die 3 nächsten Fristen als Liste
- Letzten 5 Aktivitäten (Zeitstempel + Titel)
- Willkommenstext bei erstem Start

#### NotizenScreen

Links: Liste aller Notizen des aktuellen Mandanten (nach Datum sortiert, neueste oben)  
Rechts: Vorschau des ausgewählten Eintrags  
Mit F3: Neuer Editor öffnet sich (Vollbild, mehrzeilig)  
Mit Enter/F4: Bearbeitungsmodus  
AI-Zusammenfassung wird unter dem Titel angezeigt (grau, gedimmt)  
Tags werden als `[tag1] [tag2]` Badges angezeigt

#### TermineScreen

Gruppiert nach: Überfällig / Heute / Diese Woche / Später  
Farbcodierung: Rot = überfällig, Gelb = heute, Standard = zukünftig  
Mit Leertaste: Termin als erledigt markieren  
Mit F3: Neuer Termin (manuell)

#### EntscheidungenScreen

Liste links, Vollansicht rechts  
Status-Badge: `[ENTWURF]` oder `[FINAL]` oder `[WIDERRUFEN]`  
Audit-Trail am Ende des Dokuments als Tabelle  
Mit F9: AI-gestützte Dokumentation starten

#### FristenScreen (F6)

```
FRISTEN-ÜBERSICHT                                    Mi, 15.11.2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ⚠ ÜBERFÄLLIG (1)
 ──────────────────────────────────────────────────────────────────
   Huber GmbH           Antwort GWG-Abschreibung      10.11. (+5d)

 → HEUTE (0)

 ● DIESE WOCHE (2)
 ──────────────────────────────────────────────────────────────────
   Schmidt & Partner    Jahresabschluss-Besprechung    18.11.
   Huber GmbH           Belege Laptop-Kauf              20.11.

 · NÄCHSTE WOCHE (3)
   ...

[F9 KI-Priorisierung]  [F4 Bearbeiten]  [Leer Erledigt]  [ESC Zurück]
```

#### SucheScreen (F5)

Tab 1: Volltext-Suche (Dateisystem)  
Tab 2: KI-Suche (semantisch, Claude)  
Sucheingabe oben, Ergebnisse unten mit Quellenangabe (Dateiname + Datum)  
Bei KI-Suche: Ladeindikator, dann Antwort mit Zitaten

#### MandantPicker (F2 – Modal)

```
┌─ Mandant wechseln ─────────────────────────────────────────┐
│ Suche: [hube_________________________________________]      │
│                                                             │
│  ▸ Huber GmbH               M-2024-0001   aktiv  15.11.   │
│    Huber & Söhne OHG        M-2022-0003   aktiv  10.10.   │
│                                                             │
│  Letzte Mandanten:                                          │
│    Schmidt & Partner KG     M-2024-0002   aktiv  14.11.   │
│    Dr. Berger               M-2024-0003   aktiv  08.11.   │
│                                                             │
│  [Enter] Auswählen   [ESC] Abbrechen                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. AI-Integration – vollständige Spezifikation

### 5.1 Client (`src/ai/client.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = 'claude-opus-4-5';
export const MAX_TOKENS = 4096;

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  onUpdate?: (text: string) => void  // für Streaming
): Promise<string> {
  // Implementiere Retry-Logik: 3 Versuche, exponentieller Backoff
  // Bei Fehler: klare Fehlermeldung, kein App-Crash
  // Timeout nach 60 Sekunden
  // Bei fehlender API-Key: sofort klarer Fehler "ANTHROPIC_API_KEY nicht gesetzt"
}
```

### 5.2 Kontext-Loader (`src/ai/context.ts`)

```typescript
export async function loadMandantContext(
  mandantId: string,
  options: {
    includeNotizen?: boolean;       // default: true
    includeTermine?: boolean;       // default: true
    includeEntscheidungen?: boolean; // default: true
    maxFiles?: number;              // default: 100
    maxTokensEstimate?: number;     // default: 150000
  }
): Promise<string>

// Wichtig:
// - Dateien nach Datum sortiert laden (neueste zuerst)
// - Sehr große Dateien (>50KB) kürzen mit Hinweis [GEKÜRZT]
// - Gesamtkontext unter 150.000 Token halten (ca. 600KB Text)
// - Format: "=== DATEI: {pfad} ({datum}) ===\n{inhalt}\n\n"
```

### 5.3 Prompts (`src/ai/prompts.ts`)

Alle Prompts als exportierte Konstanten, NICHT inline im Code:

```typescript
export const PROMPTS = {

  NOTIZ_STRUKTURIEREN_SYSTEM: `
Du bist ein erfahrener Kanzleiassistent für eine deutsche Steuerberatungskanzlei.
Deine Aufgabe: Analysiere eine unstrukturierte Notiz und extrahiere strukturierte Informationen.
Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown-Codeblöcke, ohne Erklärungen.
Sprache: Deutsch.
`,

  NOTIZ_STRUKTURIEREN_USER: (notizinhalt: string) => `
Analysiere diese Notiz und antworte mit folgendem JSON:
{
  "zusammenfassung": "Präzise 2-Satz-Zusammenfassung",
  "tags": ["tag1", "tag2"],
  "erkannte_fristen": [
    { "titel": "", "datum": "YYYY-MM-DD oder null", "original_text": "" }
  ],
  "folgeaktionen": ["Aktion 1", "Aktion 2"],
  "prioritaet": "hoch|mittel|niedrig",
  "kategorie": "rückfrage|information|aufgabe|besprechung|sonstiges"
}

NOTIZ:
${notizinhalt}
`,

  FRISTEN_ERKENNEN_SYSTEM: `
Du bist ein Experte für deutsches Steuerrecht und erkennst Fristen und Termine in Texten.
Berücksichtige explizite und implizite Fristen, sowie typische steuerrechtliche Standardfristen.
Antworte AUSSCHLIESSLICH mit gültigem JSON.
Aktuelles Jahr: ${new Date().getFullYear()}
`,

  FRISTEN_ERKENNEN_USER: (text: string, datum: string) => `
Erkenne alle Fristen und Termine in diesem Text. 
Referenzdatum: ${datum}

Antworte mit:
{
  "fristen": [
    {
      "titel": "Kurzer, klarer Titel",
      "datum": "YYYY-MM-DD",
      "unsicher": true/false,
      "prioritaet": "hoch|mittel|niedrig",
      "typ": "frist|termin|erinnerung",
      "original_text": "Der erkannte Originaltext aus dem Dokument",
      "begruendung": "Warum wurde dieses Datum erkannt"
    }
  ]
}

TEXT:
${text}
`,

  ENTSCHEIDUNG_STRUKTURIEREN_SYSTEM: `
Du bist ein Kanzleiassistent der beim professionellen Dokumentieren von steuerrechtlichen 
und betriebswirtschaftlichen Entscheidungen hilft.
Strukturiere den Sachverhalt in das Kanzlei-Entscheidungsformat.
Antworte mit sauberem Markdown (kein JSON).
Sprache: Deutsch. Tonalität: sachlich, juristisch präzise.
`,

  ENTSCHEIDUNG_STRUKTURIEREN_USER: (freitext: string, mandantName: string) => `
Erstelle eine strukturierte Entscheidungsdokumentation für Mandant: ${mandantName}

Verwende exakt diese Gliederung:
## Sachverhalt
[Neutral und faktisch]

## Relevante Rechtsgrundlagen
[Gesetze, BMF-Schreiben, Urteile – wenn unklar: [PRÜFEN] markieren]

## Entscheidung
[Klar und eindeutig]

## Begründung
[Juristisch nachvollziehbar]

## Offene Punkte
- [ ] [Falls vorhanden]

FREITEXT DES BERATERS:
${freitext}
`,

  SUCHE_SYSTEM: (mandantName: string) => `
Du durchsuchst die vollständige Kanzleiakte des Mandanten "${mandantName}".
Beantworte die Suchanfrage des Steuerberaters basierend NUR auf den bereitgestellten Dokumenten.
Zitiere immer die Quelldatei (Pfad und Datum).
Wenn keine relevante Information vorhanden: sage das klar.
Sprache: Deutsch. Sei präzise, keine Vermutungen.
`,

  // Akte zuerst (stabiler, cachebarer Präfix), Suchanfrage zuletzt – siehe README „Volltext- und KI-Suche“
  SUCHE_USER: (anfrage: string, kontext: string): Anthropic.TextBlockParam[] => [
    { type: 'text', text: `KANZLEIAKTE:\n${kontext}\n`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Suchanfrage: "${anfrage}"\n\nBeantworte die Suchanfrage anhand der obigen Kanzleiakte.\n` },
  ],

  TAGESBRIEF_SYSTEM: `
Du bist der morgendliche Kanzleiassistent. Erstelle eine klare, priorisierte Tagesübersicht.
Sei knapp und handlungsorientiert. Keine unnötigen Erklärungen.
Sprache: Deutsch.
`,

  TAGESBRIEF_USER: (datum: string, alleTermine: string, alleFristen: string) => `
Erstelle die Tagesübersicht für ${datum}.

Strukturiere wie folgt:
## 🔴 Sofort handeln (überfällig)
## 🟡 Heute
## 🟢 Diese Woche
## 💡 Empfehlungen

TERMINE UND FRISTEN:
${alleTermine}
${alleFristen}
`,
};
```

### 5.4 Feature: Notiz strukturieren (`src/ai/strukturieren.ts`)

- Wird automatisch nach dem Speichern einer neuen Notiz aufgerufen (async, non-blocking)
- Schreibt `ai_zusammenfassung`, `tags`, `folgeaktionen` zurück in die Frontmatter der Markdown-Datei
- Erkannte Fristen werden als neue Termin-Dateien angelegt
- Bei Fehler: Datei bleibt unverändert, Fehlermeldung in StatusBar

### 5.5 Feature: Fristen erkennen (`src/ai/fristen.ts`)

- Läuft bei jeder gespeicherten Notiz und Entscheidung
- Erzeugt Termin-Dateien nur wenn `datum` kein `null` ist
- Duplicate-Erkennung: Termin mit gleichem Titel + Datum ± 1 Tag wird übersprungen
- Unsichere Fristen (unsicher: true) werden als `[?]` in der Terminliste markiert

### 5.6 Feature: AI-Suche (`src/ai/suche.ts`)

- Lädt ALLE Dateien des aktuellen Mandanten
- Streamt die Antwort (Zeichen für Zeichen im ContentPane)
- Quellen werden am Ende aufgelistet
- Timeout: 90 Sekunden (lange Kontexte brauchen Zeit)

### 5.7 F9 KI-Aktionen Menü

```
┌─ KI-Aktionen ─────────────────────────────────────────┐
│                                                         │
│  1  Aktuelle Notiz strukturieren                       │
│  2  Fristen aus aktueller Notiz erkennen               │
│  3  Neue Entscheidung dokumentieren (KI-gestützt)      │
│  4  Mandantenakte durchsuchen                          │
│  5  Tagesbrief erstellen                               │
│  6  Alle Notizen re-analysieren (Mandant)              │
│                                                         │
│  [↑↓ Navigieren]  [Enter Ausführen]  [ESC Abbrechen]  │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Konfiguration

### `.env.example`

```bash
# Anthropic API Key (erforderlich für KI-Features)
ANTHROPIC_API_KEY=sk-ant-...

# Datenpfad (optional, default: ~/erna-data)
# ERNA_DATA_PATH=/custom/path/to/erna-data

# KI-Modell (optional, default: claude-opus-4-5)
# ERNA_AI_MODEL=claude-sonnet-4-5

# Debug-Modus (optional)
# ERNA_DEBUG=false
```

### `erna-config.json` (wird in `~/erna-data/` angelegt)

```json
{
  "version": "1",
  "kanzlei": {
    "name": "Meine Kanzlei",
    "typ": "Steuerberatung",
    "standardBearbeiter": ""
  },
  "ai": {
    "aktiviert": true,
    "autoStrukturierungBeiSave": true,
    "autoFristenerkennung": true,
    "model": "claude-opus-4-5",
    "sprache": "de",
    "datenschutzAkzeptiert": false
  },
  "ui": {
    "theme": "dark",
    "datumsformat": "DD.MM.YYYY",
    "zeitformat": "HH:mm"
  }
}
```

**Wichtig**: Beim ersten Start prüfen ob `datenschutzAkzeptiert: false` – dann Hinweis anzeigen:

```
Für die KI-Features werden Mandantendaten an die Anthropic Claude API übertragen.
Bitte stelle sicher, dass du hierzu berechtigt bist (Datenschutzrecht, Berufsrecht).
[J] Ich bestätige und aktiviere KI-Features   [N] KI-Features deaktiviert lassen
```

---

## 7. Demodaten (`demo-data/`)

### Mandant 1: Huber GmbH (M-2024-0001)

**profil.json**: GmbH, Geschäftsführer Max Huber, München, seit 2018  
**Notizen**: 3 Notizen (GWG-Abschreibung, Jahresabschluss 2023, Gesellschafterversammlung)  
**Termine**: 2 offene Termine (eine davon überfällig)  
**Entscheidungen**: 1 finale Entscheidung (GWG-Behandlung)

### Mandant 2: Schmidt & Partner Steuerberatungs-KG (M-2024-0002)

**profil.json**: KG, Ansprechpartner Klaus Schmidt, Hamburg, seit 2015  
**Notizen**: 2 Notizen (Jahresabschluss 2022 nachgeliefert, Betriebsprüfung angekündigt)  
**Termine**: 3 Termine (Betriebsprüfungstermin nächste Woche)  
**Entscheidungen**: 1 Entwurf

### Mandant 3: Dr. Ingrid Berger (M-2024-0003)

**profil.json**: Einzelunternehmen (Ärztin), Frankfurt, seit 2020  
**Notizen**: 2 Notizen (Praxisumbau steuerlich, Fahrzeug Privatnutzung)  
**Termine**: 1 Termin  
**Entscheidungen**: 1 Entscheidung (1%-Regelung vs. Fahrtenbuch)

---

## 8. Startup & Setup

### `package.json` Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.tsx",
    "start": "node dist/index.js",
    "build": "tsc",
    "seed": "tsx src/data/seed.ts",
    "test": "vitest",
    "lint": "eslint src/**/*.ts src/**/*.tsx"
  }
}
```

### Erster Start (`src/index.tsx`)

```
1. Prüfe Node.js Version (≥ 20)
2. Prüfe ob ~/erna-data/ existiert → wenn nicht: anlegen
3. Prüfe ob erna-config.json existiert → wenn nicht: Setup-Wizard starten
4. Prüfe ANTHROPIC_API_KEY → wenn nicht gesetzt: Warnung, KI deaktiviert
5. Prüfe ob Mandanten vorhanden → wenn nicht: Hinweis "--seed für Demodaten"
6. TUI starten
```

### Setup-Wizard (beim ersten Start)

Interaktiver Dialog in der TUI:
1. Kanzleiname eingeben
2. Name des Bearbeiters
3. API Key eingeben (oder später in .env setzen)
4. Datenschutzhinweis bestätigen
5. Demodaten laden? (J/N)

---

## 9. Fehlerbehandlung – vollständige Regeln

| Situation | Verhalten |
|---|---|
| ANTHROPIC_API_KEY fehlt | Warnung in StatusBar, alle AI-Features deaktiviert, Rest funktioniert |
| Claude API Timeout | Fehlermeldung in ErrorBanner, Notiz wurde bereits gespeichert |
| Claude API Fehler (4xx/5xx) | Retry 3x mit Backoff, dann Fehlermeldung |
| Datei nicht lesbar | Log in Konsole, Eintrag überspringen, kein App-Crash |
| Ungültige JSON-Antwort von Claude | Parsing-Fehler abfangen, Rohtext anzeigen |
| Kein Mandant ausgewählt | Hinweis: "Bitte zuerst Mandant auswählen (F2)" |
| Kontextfenster zu groß | Älteste Dateien weglassen, Hinweis "[X Dateien ausgelassen]" |

---

## 10. README.md (für Endbenutzer)

Claude Code soll auch eine klare `README.md` erstellen mit:

1. **Voraussetzungen** (Node.js 20+, Anthropic API Key)
2. **Installation** (3 Schritte)
3. **Erster Start & Setup**
4. **Tastenkürzel-Referenz** (komplette Tabelle)
5. **KI-Features erklären** (was passiert automatisch, was muss ich auslösen)
6. **Datenschutz-Hinweis** (Mandantendaten gehen an Anthropic)
7. **Troubleshooting** (häufige Probleme)

---

## 11. Implementierungsreihenfolge für Claude Code

Baue in genau dieser Reihenfolge – teste nach jedem Schritt:

1. **Projektgrundgerüst** – `package.json`, `tsconfig.json`, `.env.example`, Ordnerstruktur
2. **Typen & Konstanten** – `types.ts`, `constants.ts` (THEME, KEYBINDINGS)
3. **Datei-Layer** – `filesystem.ts`, `mandanten.ts`, `notizen.ts`, `termine.ts`, `entscheidungen.ts`
4. **Index-Management** – `index.ts` für `erna-index.json`
5. **Demodaten-Seed** – `seed.ts` mit allen 3 Mustermandanten
6. **TUI Grundgerüst** – `App.tsx`, `StatusBar.tsx`, `ActionBar.tsx`, `Sidebar.tsx`, `ContentPane.tsx`
7. **HomeScreen** – Startbildschirm mit Übersicht
8. **MandantPicker** – F2-Modal mit Typeahead
9. **NotizenScreen** – Liste + Vorschau + Editor
10. **TermineScreen** – Liste mit Farbcodierung
11. **EntscheidungenScreen** – Liste + Vollansicht
12. **FristenScreen** – Dashboard mit Gruppierung
13. **AI Client** – `client.ts` mit Retry-Logik
14. **Kontext-Loader** – `context.ts`
15. **AI: Notiz strukturieren** – automatisch nach Save
16. **AI: Fristen erkennen** – automatisch nach Save
17. **AI: Entscheidung dokumentieren** – F9-Aktion
18. **SucheScreen** – Volltext + AI-Suche
19. **AI: Tagesbrief** – F6 / F9-Aktion
20. **Setup-Wizard** – erster Start
21. **Einstellungen-Screen** – Konfiguration in TUI
22. **README.md** – vollständige Endbenutzer-Dokumentation
23. **Tests** – kritische Funktionen: Datei-Layer, Fristen-Parser, Kontext-Loader

---

## 12. Qualitätsvorgaben

- **Kein `any`** in TypeScript – vollständige Typisierung
- **Alle Strings auf Deutsch** – UI-Text, Fehlermeldungen, Prompt-Antworten
- **Keine hardcodierten Pfade** – immer `path.join(os.homedir(), 'erna-data', ...)` 
- **Graceful Degradation** – App startet auch ohne API Key, ohne Demodaten
- **Kein globaler State** – State-Management über React Context in `App.tsx`
- **Atomic File Writes** – zuerst in Temp-Datei schreiben, dann umbenennen (keine korrupten Dateien)
- **ISO 8601 Timestamps** – intern immer mit Timezone-Offset (`+01:00` / `+02:00`)
- **Datumsanzeige** – immer `DD.MM.YYYY` für den Benutzer

---

*ERNA-AI Spezifikation v2.0 – finale Version für Claude Code*  
*Stack: TypeScript + ink + Anthropic Claude API | Plattform: macOS/Linux | Sprache: Deutsch*
