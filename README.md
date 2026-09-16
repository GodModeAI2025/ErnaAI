# ERNA-AI

Elektronische Recherche- und Notiz-Anwendung für Steuerberatungskanzleien. ERNA-AI verwaltet Mandanten, Notizen, Termine, Fristen und Entscheidungen vollständig per Tastatur im Terminal. Optionale Claude-Funktionen strukturieren Notizen, erkennen Fristen, helfen bei Entscheidungsentwürfen und durchsuchen eine Mandantenakte.

Die Akten liegen lokal als Markdown- und JSON-Dateien. Es gibt keinen Backend-Server, keinen Datenbankserver, keinen Vektorspeicher und kein RAG-System. Die lokale Arbeit funktioniert auch ohne API-Schlüssel und ohne Internetverbindung.

## Voraussetzungen

- macOS oder Linux mit einem interaktiven Terminal.
- **Node.js ab 22.13.0** mit npm. `node --version` zeigt die installierte Version.
- Optional: ein Anthropic-API-Schlüssel für die KI-Funktionen und eine Internetverbindung für deren Aufrufe.

Die ursprüngliche Bauspezifikation nennt Node.js 20+. Die eingesetzten aktuellen Ink- und Entwicklungsabhängigkeiten benötigen eine neuere Laufzeit; das Projekt setzt deshalb Node.js 22.13.0 als Mindestversion voraus. ESLint verwendet die aktuelle Konfiguration in `eslint.config.js`; `.eslintrc.json` bleibt als Referenz zur Bauspezifikation erhalten.

## Installation in drei Schritten

1. Das Repository von GitHub klonen und in den Projektordner wechseln:

   ```bash
   git clone https://github.com/GodModeAI2025/ErnaAI.git erna-ai
   cd erna-ai
   ```

   Alternativ das Repository als ZIP herunterladen, entpacken und den Ordner mit `package.json` öffnen.
2. Die festgeschriebenen Abhängigkeiten installieren:

   ```bash
   npm ci
   ```

3. Die Anwendung bauen:

   ```bash
   npm run build
   ```

Anschließend aus diesem Projektordner starten:

```bash
npm start
```

## Erster Start und Einrichtung

ERNA-AI legt standardmäßig `~/erna-data` an. Solange dort noch keine `erna-config.json` gespeichert wurde, führt die Anwendung durch die Einrichtung:

1. Kanzleiname eingeben.
2. Den Standardbearbeiter eingeben oder das Feld leer lassen.
3. Optional einen API-Schlüssel eingeben. Ein bereits über die Umgebung oder `.env` gesetzter Schlüssel kann mit Enter übernommen werden.
4. Den Datenschutzhinweis mit **J** bestätigen oder mit **N** die KI-Funktionen deaktiviert lassen.
5. Mit **J/N** entscheiden, ob Demodaten geladen werden sollen.

Ein im Einrichtungsdialog eingegebener API-Schlüssel gilt **nur für die laufende Sitzung**. Er wird weder in `erna-config.json` noch automatisch in `.env` geschrieben. Ein Abbruch vor der abschließenden J/N-Auswahl speichert keine Konfiguration.

Ohne Mandanten zeigt die Anwendung einen Hinweis auf die Demodaten. Einen eigenen Mandanten können Sie unter **F7 → F3** anlegen. **F2** öffnet die Mandantenauswahl; die Suche filtert nach Name und ID.

### Einen API-Schlüssel dauerhaft hinterlegen

Im Projektordner eine lokale Konfigurationsdatei anlegen:

```bash
cp .env.example .env
```

In `.env` den Wert von `ANTHROPIC_API_KEY` durch den eigenen Schlüssel ersetzen. Der Vorlagenwert `sk-ant-...` aktiviert keine KI-Funktion. `.env` wird von Git ausgeschlossen; echte Schlüssel dürfen nicht in das Repository gelangen.

Optionale Einstellungen in `.env`:

| Variable | Bedeutung |
| --- | --- |
| `ANTHROPIC_API_KEY` | Schlüssel für die Claude API; nur für KI-Funktionen erforderlich. |
| `ERNA_DATA_PATH` | Abweichendes Datenverzeichnis; Standard ist `~/erna-data`. |
| `ERNA_AI_MODEL` | Modellvorgabe; überschreibt die Einstellung in der Anwendung. Standard ist `claude-opus-4-5`. |
| `ERNA_DEBUG` | `true` aktiviert die Debug-Darstellung der Terminaloberfläche. |

Ein eigenes Datenverzeichnis lässt sich auch nur für einen Start auswählen:

```bash
ERNA_DATA_PATH="$HOME/erna-testdaten" npm start
```

## Bedienung und Tastenkürzel

Die obere Leiste zeigt den aktuellen Mandanten sowie Datum und Uhrzeit. Links steht die Navigation, rechts die aktive Ansicht. Die untere Leiste und Hinweise in der Ansicht zeigen die jeweils verfügbaren Aktionen. Ein Ausrufezeichen hinter einer Terminanzahl weist auf dringende offene Einträge hin.

Mit **Tab** wechseln Sie zwischen Navigation und Inhalt. In der Navigation wählen **↑/↓** eine Ansicht; **Enter** oder **→** wechseln in deren Inhalt. In der Suche wechselt Tab stattdessen zwischen Volltext- und KI-Suche; **Shift+Tab** führt dort zur Navigation zurück.

| Taste | Aktion |
| --- | --- |
| **F1** | Hilfe öffnen. |
| **F2** | Mandant wechseln; Suchtext eingeben, mit ↑/↓ wählen und mit Enter öffnen. |
| **F3** | Neue Notiz, neuen Termin, neue Entscheidung oder neuen Mandanten in der jeweiligen Ansicht anlegen. |
| **F4** | Ausgewählten Eintrag bzw. das Mandantenprofil bearbeiten; in den Einstellungen die Konfiguration öffnen. |
| **F5** | Suche für den aktuellen Mandanten öffnen. |
| **F6** | Fristenübersicht aller aktiven Mandanten öffnen. |
| **F7** | Mandantenakte öffnen. |
| **F8** | In der Terminansicht zwischen offenen und erledigten Einträgen wechseln. In Notizen und Entscheidungen einen Eintrag nach Bestätigung löschen; in der Mandantenakte nur eine leere Akte löschen. |
| **F9** | Menü der KI-Aktionen öffnen. Den Tagesbrief über dessen Eintrag **5** auswählen. |
| **F10** | Anwendung beenden; bei ungespeicherten Eingaben oder laufenden Hintergrundanalysen erscheint eine Bestätigung. Eine laufende Suche wird beim Beenden direkt abgebrochen. |
| **Ctrl+C** | Wie F10 beenden. |
| **ESC** | Dialog schließen, Bearbeitung abbrechen oder zur Startansicht zurückkehren. Ungespeicherte Änderungen benötigen eine Bestätigung zum Verwerfen. |
| **Ctrl+S** | Formular oder Dokument speichern. |
| **↑ / ↓** | In Listen navigieren; im Editor den Cursor bewegen. |
| **← / →** | Im Editor den Cursor bewegen; bei Auswahlfeldern den Wert ändern. |
| **Enter** | Auswahl bestätigen oder ausgewählten Eintrag bearbeiten. Im Textkörper eine neue Zeile einfügen; im Titel zum nächsten Feld wechseln. |
| **Leertaste** | In der Terminansicht erledigt/offen umschalten; in der Fristenübersicht als erledigt markieren. |
| **Tab / Shift+Tab** | Zwischen Navigation und Inhalt bzw. zwischen Formularfeldern wechseln. In der Suche wechselt Tab den Suchmodus. |
| **Bild↑ / Bild↓** | Längere Vorschauen, Suchergebnisse und KI-Antworten durchblättern; in der Fristenübersicht seitenweise navigieren. Im Texteditor den Cursor seitenweise bewegen. |
| **Pos1 / Ende** oder **Ctrl+A / Ctrl+E** | Im Texteditor zum Zeilenanfang bzw. Zeilenende springen. |
| **Ctrl+Pos1 / Ctrl+Ende** | Im Texteditor zum Dokumentanfang bzw. Dokumentende springen. |
| **Rücktaste / Entf** | Im Editor Zeichen vor bzw. hinter dem Cursor löschen. |

Falls das Terminal Funktionstasten nicht weitergibt, können **Alt+1 bis Alt+9** F1 bis F9 ersetzen; **Alt+0** ersetzt F10. Auf macOS kann dafür die Terminaloption nötig sein, die Wahltaste als Meta-Taste zu verwenden. Je nach Tastatureinstellung erreichen Sie Funktionstasten auch über **Fn+F1** usw.

### Notizen, Termine und Entscheidungen

**Notizen:** Die Liste ist nach Erstellungsdatum absteigend sortiert. Die Vorschau zeigt Inhalt, Tags und gegebenenfalls eine KI-Zusammenfassung. F3 öffnet einen mehrzeiligen Editor; Titel und Inhalt sind erforderlich. Ctrl+S speichert zuerst die lokale Datei. Beim Bearbeiten einer Notiz werden bisherige KI-Zusammenfassung und Folgeaktionen zurückgesetzt, damit sie nicht als Auswertung des geänderten Textes erscheinen.

**Termine:** Einträge können den Typ Frist, Termin oder Erinnerung haben. Überfällige Einträge sind rot, heutige gelb. Die Liste gruppiert nach Datum; F8 zeigt erledigte Einträge, die sich mit der Leertaste wieder öffnen lassen. Datumseingaben erfolgen als `TT.MM.JJJJ`. Ein **[?]** kennzeichnet eine von der KI als unsicher erkannte Frist und sollte fachlich geprüft werden.

**Fristenübersicht:** F6 zeigt offene Fristen, Termine und Erinnerungen der aktiven Mandanten, gruppiert nach überfällig, heute, diese Woche, nächste Woche und später. F4 bearbeitet den ausgewählten Eintrag in seiner zugehörigen Akte. Ein KI-Tagesbrief lässt sich über F9 und den Eintrag 5 erstellen.

**Entscheidungen:** Neue Dokumente können manuell mit F3 oder als KI-Entwurf über F9 erstellt werden. Die Statuswerte sind Entwurf, Final und Widerrufen. Änderungen werden im Audit-Trail festgehalten und unter dem Dokument angezeigt. Ein KI-Entwurf wird erst nach Ihrer Bearbeitung und Ctrl+S als Entscheidung gespeichert. Der Audit-Trail gehört zur lokalen Datei; das Löschen einer Entscheidung entfernt auch diesen Verlauf.

### Mandantenakte und Einstellungen

In der Mandantenakte öffnet F4 das Profilformular. Neue Mandanten erhalten beim Speichern eine freie ID im Format `M-JJJJ-0001`. Dort können Sie die KI je Mandant deaktivieren und einen Mandanten über **Mandant aktiv → nein** archivieren. Die vorhandenen Dateien bleiben dabei erhalten; archivierte Mandanten sind weiterhin in der F2-Auswahl erreichbar. F8 löscht nur leere Akten nach Bestätigung. Akten mit Dokumenten lassen sich auf diesem Weg nicht löschen.

In den **Einstellungen** stehen folgende Aktionen zur Verfügung; für die Buchstabenkürzel muss der Inhaltsbereich aktiv sein:

| Taste | Aktion |
| --- | --- |
| **F4 / Enter** | Kanzleiname, Bearbeiter, KI-Aktivierung, Automatik und Modell bearbeiten. |
| **D** | Datenschutzfreigabe erteilen oder widerrufen. Ein Widerruf deaktiviert die KI und bricht laufende KI-Aufträge ab. |
| **K** | API-Schlüssel für diese Sitzung setzen. Ein leer gespeichertes Feld entfernt den Sitzungsschlüssel; `.env` bleibt unverändert. |
| **S** | Fehlende Demoakten laden; vorhandene Demoakten werden übersprungen. |

## KI-Funktionen

KI-Aufrufe benötigen einen verfügbaren API-Schlüssel, eine aktivierte globale KI-Einstellung, die bestätigte Datenschutzfreigabe und eine KI-Freigabe für jeden betroffenen Mandanten. Diese Voraussetzungen werden vor jedem Versand neu geprüft. Ohne Freigabe werden keine Mandantendaten an die API gesendet.

### Automatische Verarbeitung

Nach dem lokalen Speichern kann die KI im Hintergrund weiterarbeiten:

- **Neue Notizen strukturieren:** Wenn diese Einstellung aktiv ist, werden neu angelegte Notizen zusammengefasst und um Tags sowie Folgeaktionen ergänzt. Das erneute Speichern einer vorhandenen Notiz startet diese Strukturierung nicht automatisch.
- **Fristen beim Speichern erkennen:** Wenn diese Einstellung aktiv ist, werden bei jeder gespeicherten Notiz und Entscheidung Fristen erkannt und als Termine angelegt. Das gilt auch für bearbeitete Dokumente.

Beide Schalter können unabhängig geändert werden. Ist die automatische Fristenerkennung deaktiviert, legt die automatische Strukturierung auch keine Fristen aus ihren eigenen Hinweisen an. Wenn beide Analysen benötigt werden, werden ihre Ergebnisse gemeinsam übernommen: Ein Fehler der zweiten Analyse hinterlässt keine teilweise aktualisierte KI-Auswertung.

Der manuell gespeicherte Text bleibt bei einem KI-Fehler erhalten. Wird das Dokument während der Analyse geändert oder gelöscht, wird das veraltete Ergebnis verworfen. Bereits vorhandene Termine mit gleichem normalisierten Titel und einem Datum innerhalb von **± einem Tag** werden nicht erneut angelegt. Erkennt die KI kein konkretes Datum, entsteht kein Termin.

### Menü F9

Das Menü wird mit ↑/↓ und Enter bedient. Alternativ führen die Ziffern **1 bis 6** den entsprechenden Eintrag direkt aus:

| Eintrag | Ergebnis |
| --- | --- |
| **1 – Aktuelle Notiz strukturieren** | Zusammenfassung, Tags und Folgeaktionen der ausgewählten Notiz aktualisieren; enthaltene datierte Fristen können als unsichere Termine entstehen. |
| **2 – Fristen aus aktueller Notiz erkennen** | Fristenanalyse für die ausgewählte Notiz durchführen und neue Termine anlegen. |
| **3 – Neue Entscheidung dokumentieren** | Freitext in Sachverhalt, Rechtsgrundlagen, Entscheidung, Begründung und offene Punkte gliedern. Danach den Entwurf prüfen und selbst speichern. |
| **4 – Mandantenakte durchsuchen** | Zur KI-Suche des aktuellen Mandanten wechseln. |
| **5 – Tagesbrief erstellen** | Offene Termine der aktiven und für KI freigegebenen Mandanten nach Dringlichkeit zusammenfassen. Funktioniert unabhängig vom aktuell ausgewählten Mandanten. |
| **6 – Alle Notizen re-analysieren** | Alle Notizen des aktuellen Mandanten erneut strukturieren und auf Fristen prüfen. Diese ausdrücklich ausgelöste Aktion führt beide Analysen aus. |

Der Tagesbrief verarbeitet bereits erfasste Aufgaben und soll keine neuen Rechtsfristen erfinden. Gibt es keine passenden Mandanten oder offenen Termine, erscheint eine lokale Information ohne API-Aufruf.

### Volltext- und KI-Suche

F5 öffnet die Suche. Die **Volltext-Suche** sucht lokal im Text der aktuellen Mandantenakte, einschließlich Profil und Metadaten. Groß- und Kleinschreibung spielen keine Rolle. Sie benötigt keine KI-Freigabe und keinen API-Schlüssel.

Mit Tab wechseln Sie zur **KI-Suche**, geben eine Frage ein und starten sie mit Enter. Die Antwort erscheint fortlaufend. Sie soll ausschließlich die mitgegebenen Dokumente verwenden und Quellen mit Pfad und Datum zitieren. Zusätzlich zeigt die Anwendung die tatsächlich übergebenen Quelldateien; diese Liste ist keine automatische Prüfung der von Claude formulierten Zitate.

Für Dateikontexte gelten folgende Grenzen:

- Dateien werden nach Datum geladen, die neuesten zuerst. Der allgemeine Kontext-Loader berücksichtigt standardmäßig höchstens 100 Dateien.
- Eine einzelne Datei wird ab ungefähr **50 KB** gekürzt und mit `[GEKÜRZT]` gekennzeichnet.
- Der gesamte Kontext bleibt bei höchstens **600 KB** Text, entsprechend einer groben Schätzung von 150.000 Tokens. Das ist keine exakte Tokenzählung.
- Die KI-Suche hebt die 100-Dateien-Grenze auf und berücksichtigt alle Dateien, soweit sie in das Textbudget passen. Ältere ausgelassene Dateien werden durch `[X Dateien ausgelassen]` kenntlich gemacht.

**Prompt-Caching bei Folgefragen:** Die KI-Suche sendet zuerst die Akte und danach die Suchanfrage. Die Akte ist für das Prompt-Caching der Claude API markiert. Stellen Sie innerhalb von etwa fünf Minuten eine weitere Frage zur selben, unveränderten Akte, liest die API diesen Teil aus dem Cache: Das geht schneller und wird deutlich günstiger abgerechnet. Die erste Anfrage kostet für den Aktenteil etwas mehr als ohne Cache. Jede Änderung an der Akte, am Mandantennamen oder am Modell erzeugt einen neuen Cache-Eintrag. Kleine Akten liegen unter der Mindestgröße des Modells und werden ohne Fehlermeldung einfach nicht gecacht. Übertragen werden dieselben Daten wie ohne Caching.

## Datenschutz und Datenhaltung

Vor der Freigabe zeigt ERNA-AI diesen Hinweis:

> Für die KI-Features werden Mandantendaten an die Anthropic Claude API übertragen. Bitte stelle sicher, dass du hierzu berechtigt bist (Datenschutzrecht, Berufsrecht).

Bis zur Bestätigung bleiben KI-Aufrufe gesperrt. Bei Notiz- und Fristenanalysen werden die jeweiligen Dokumentinhalte übertragen; bei der KI-Suche die passende Mandantenakte innerhalb der Kontextgrenzen. Der Tagesbrief überträgt offene Termine der dafür freigegebenen aktiven Mandanten. Die Dateien bleiben lokal gespeichert; das schließt ihre Übertragung im Rahmen aktivierter KI-Funktionen nicht aus.

Unter dem Datenverzeichnis befinden sich:

```text
erna-data/
├── erna-config.json
├── erna-index.json
└── mandanten/
    └── M-JJJJ-0001/
        ├── profil.json
        ├── notizen/          # Markdown mit YAML-Frontmatter
        ├── termine/          # JSON
        └── entscheidungen/   # Markdown mit YAML-Frontmatter und Audit-Trail
```

Die App schreibt Dateien über temporäre Dateien und anschließendes Umbenennen. Der Index wird aus den vorhandenen Akten aufgebaut. Die Dateien sind nicht an einen Datenbankdienst gebunden, werden von ERNA-AI aber auch nicht verschlüsselt.

**Sicherung:** ERNA-AI beenden und das gesamte Datenverzeichnis einschließlich Konfiguration, Index und Mandantenordnern auf ein geeignetes Sicherungsziel kopieren. Vor einer Wiederherstellung die vorhandenen Daten separat sichern. Eine automatische Backup-Funktion ist nicht enthalten.

Pro Datenverzeichnis darf **nur eine ERNA-AI-Instanz** gleichzeitig schreiben. Die Schreibsperre koordiniert Vorgänge innerhalb einer laufenden Anwendung; sie ist keine Sperre zwischen mehreren Prozessen. Für externe Bearbeitung der Dateien die Anwendung ebenfalls vorher beenden und anschließend neu starten.

## Demodaten

Demodaten lassen sich während der Einrichtung, mit S in den Einstellungen oder über die Kommandozeile laden:

```bash
npm run seed
```

Alternativ laden und sofort starten:

```bash
npm start -- --seed
```

Enthalten sind Huber GmbH, Schmidt & Partner Steuerberatungs-KG und Dr. Ingrid Berger mit insgesamt sieben Notizen, sechs Terminen und drei Entscheidungen. Beispieldaten werden relativ zum Tag des Ladens verschoben, damit überfällige und kommende Termine sichtbar bleiben. Bereits vorhandene Demoakten werden vollständig übersprungen und nicht überschrieben.

Die Akten sind fiktiv. Fachliche Angaben sind mit **[PRÜFEN]** gekennzeichnet; auch ein demonstrierter Status **FINAL** bedeutet keine fachlich geprüfte steuerrechtliche Aussage.

## Häufige Probleme

| Problem | Vorgehen |
| --- | --- |
| Node-Version wird abgelehnt oder Installation meldet inkompatible Abhängigkeiten | Node.js ab 22.13.0 verwenden, `node --version` prüfen und danach `npm ci` erneut ausführen. |
| `dist/index.js` fehlt | Zuerst `npm run build` ausführen. |
| Statt der Oberfläche erscheint nur „ERNA-AI ist bereit“ | `npm start` direkt in einem interaktiven Terminal ausführen. Umgeleitete Ein- oder Ausgabe startet keine TUI. |
| Funktionstasten bewirken nichts | Fn-Taste oder Alt+1 … Alt+0 verwenden; gegebenenfalls die Meta-Tasten-Einstellung des Terminals prüfen. |
| Keine Mandanten sichtbar | Mit F7 → F3 einen Mandanten anlegen oder `npm run seed` ausführen. Den konfigurierten Datenpfad in den Einstellungen prüfen. |
| „ANTHROPIC_API_KEY nicht gesetzt“ | Einen eigenen Schlüssel in `.env` oder über K in den Einstellungen setzen. Der Vorlagenwert zählt als fehlender Schlüssel. Die lokale Arbeit bleibt verfügbar. |
| KI bleibt trotz Schlüssel deaktiviert | Globale KI-Aktivierung und Datenschutzfreigabe in den Einstellungen sowie „KI für Mandant“ im Profil prüfen. |
| KI-Aufruf läuft in einen Fehler oder Timeout | Fehlermeldung in der Oberfläche beachten; Schlüssel, Modellvorgabe und Verbindung prüfen. Es gibt höchstens drei Versuche mit Wartezeiten. Die Gesamtfrist beträgt gewöhnlich 60 Sekunden, bei der KI-Suche 90 Sekunden. Ein bereits manuell gespeichertes Dokument bleibt gespeichert. |
| KI-Auswertung wird abgelehnt | Bei Format- und Validierungsfehlern wird der verfügbare Rohtext zur Prüfung angezeigt. Ungültige strukturierte Ergebnisse werden nicht gespeichert. Die Aktion kann erneut ausgelöst werden. |
| Dokument wurde während der Analyse verändert | Die KI-Auswertung des alten Standes wird nicht übernommen. Die aktuelle Notiz auswählen und die gewünschte Aktion erneut ausführen. |
| Suchantwort berücksichtigt eine ältere Datei nicht | Hinweise auf gekürzte oder ausgelassene Dateien und die Quellenliste prüfen; für einen direkten Texttreffer die lokale Volltext-Suche verwenden. |
| `erna-config.json` ist beschädigt | Die Anwendung meldet den Fehler beim Start. Konfiguration aus einer Sicherung wiederherstellen oder nach Sicherung der beschädigten Datei korrigieren. Sie wird nicht still überschrieben. |
| Eine Datei lässt sich nicht lesen | Fehlermeldung prüfen. Ungültige einzelne Datensätze werden protokolliert und übersprungen. Vor einer manuellen Korrektur die App beenden und die Datei sichern. |
| API-Schlüssel ist nach Neustart weg | Im Dialog eingegebene Schlüssel gelten nur für die Sitzung. Für dauerhafte Nutzung den Schlüssel selbst in `.env` hinterlegen. |

## Entwicklung und Prüfung

```bash
npm run dev                            # Entwicklung mit Neustart bei Quelltextänderungen
npm run build                          # TypeScript kompilieren
npm run lint                           # Quelltext mit ESLint prüfen
npm test -- --run --maxWorkers=1 --pool=threads  # Tests einmalig ausführen
npm start -- --help                     # Startoptionen anzeigen
```

Die Tests prüfen unter anderem Dateischreibvorgänge, Datenschutzfreigaben, Fristenduplikate, Datumserkennung, Kontextgrenzen, Wiederholungen, Abbruch und Tastaturbedienung. Die Claude-Aufrufe werden in Tests durch Mocks ersetzt. **Ein erfolgreicher Testlauf bestätigt keinen Live-Aufruf gegen die Anthropic API; solche Aufrufe wurden für die Implementierungsprüfung nicht ausgeführt.**

Die vollständige Bauspezifikation steht in [CLAUDE.md](CLAUDE.md).
