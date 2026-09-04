import type { AiOptions, Entscheidung, ErkannteFrist, Notiz, StrukturierteNotiz } from '../app/types.js';
import { validateNotiz } from '../data/notizen.js';
import { validateEntscheidung } from '../data/entscheidungen.js';
import { commitAiAnalysis } from '../data/termine.js';
import { isIsoDate } from '../utils/dates.js';
import { errorMessage, record, stringArray, stringField } from '../utils/format.js';
import { AiResponseError, assertAiActive, callClaude, withAiDeadline } from './client.js';
import { PROMPTS } from './prompts.js';
import { analyseFristen } from './fristen.js';

export function parseStrukturierteNotiz(raw: string): StrukturierteNotiz {
  try {
    const object = record(JSON.parse(raw) as unknown);
    const zusammenfassung = stringField(object, 'zusammenfassung');
    if (!zusammenfassung.trim() || !stringArray(object.tags) || !stringArray(object.folgeaktionen) || !Array.isArray(object.erkannte_fristen) || !['hoch', 'mittel', 'niedrig'].includes(String(object.prioritaet)) || !['rückfrage', 'information', 'aufgabe', 'besprechung', 'sonstiges'].includes(String(object.kategorie))) throw new Error('Zusammenfassung, Listen oder Kategorien fehlen beziehungsweise sind ungültig.');
    const erkannte_fristen = object.erkannte_fristen.map((value: unknown) => {
      const frist = record(value), titel = stringField(frist, 'titel').trim();
      if (!titel || !(frist.datum === null || typeof frist.datum === 'string' && isIsoDate(frist.datum))) throw new Error('Eine erkannte Frist hat keinen gültigen Titel oder kein gültiges Datum.');
      return { titel, datum: frist.datum, original_text: stringField(frist, 'original_text') };
    });
    return { zusammenfassung, tags: object.tags, erkannte_fristen, folgeaktionen: object.folgeaktionen, prioritaet: object.prioritaet as StrukturierteNotiz['prioritaet'], kategorie: object.kategorie as StrukturierteNotiz['kategorie'] };
  } catch (error) { throw new AiResponseError(`Claude-Antwort zur Notiz ist ungültig: ${errorMessage(error)}`, raw, { cause: error }); }
}

function structureDeadlines(analysis: StrukturierteNotiz): ErkannteFrist[] {
  return analysis.erkannte_fristen.map(frist => ({ ...frist, unsicher: true, prioritaet: analysis.prioritaet, typ: 'frist', begruendung: 'Aus der KI-Strukturierung abgeleitet; Datum fachlich prüfen.' }));
}

async function analyseNotiz(snapshot: Notiz, options: AiOptions): Promise<StrukturierteNotiz> {
  const raw = await callClaude(PROMPTS.NOTIZ_STRUKTURIEREN_SYSTEM, PROMPTS.NOTIZ_STRUKTURIEREN_USER(snapshot.inhalt, snapshot.erstellt.slice(0, 10), snapshot.titel), undefined, { ...options, mandantIds: [snapshot.mandant_id] });
  return parseStrukturierteNotiz(raw);
}

export async function strukturierenNotiz(snapshot: Notiz, options: AiOptions = {}): Promise<Awaited<ReturnType<typeof commitAiAnalysis>>> {
  const expected = structuredClone(validateNotiz(snapshot));
  const analysis = await withAiDeadline(signal => analyseNotiz(expected, { ...options, signal }), options);
  assertAiActive(options.signal);
  return commitAiAnalysis(expected, { tags: analysis.tags, ai_zusammenfassung: analysis.zusammenfassung, ai_folgeaktionen: analysis.folgeaktionen, ai_verarbeitet: true }, structureDeadlines(analysis), options.signal);
}

/** Alle angeforderten Antworten werden zuerst berechnet und validiert. Erst danach
 * erfolgt eine gemeinsame Übernahme gegen den ursprünglichen Dokument-Snapshot. */
export async function verarbeiteDokument(
  snapshot: Notiz | Entscheidung,
  features: { strukturieren: boolean; fristen: boolean },
  options: AiOptions = {},
): Promise<Awaited<ReturnType<typeof commitAiAnalysis>>> {
  const expected = structuredClone(snapshot.typ === 'notiz' ? validateNotiz(snapshot) : validateEntscheidung(snapshot));
  if ((!features.strukturieren || expected.typ !== 'notiz') && !features.fristen) return { termine: [], skipped: 0 };
  const { structure, fristen } = await withAiDeadline(async signal => {
    const scoped = { ...options, signal };
    const structure = features.strukturieren && expected.typ === 'notiz' ? await analyseNotiz(expected, scoped) : null;
    const recognized = features.fristen ? await analyseFristen(expected, scoped) : [];
    // Der spezialisierte Erkenner liefert genauere Typen und Unsicherheitsangaben.
    const fristen = [...recognized, ...(features.fristen && structure ? structureDeadlines(structure) : [])];
    return { structure, fristen };
  }, options);
  assertAiActive(options.signal);
  const metadata = structure ? { tags: structure.tags, ai_zusammenfassung: structure.zusammenfassung, ai_folgeaktionen: structure.folgeaktionen, ai_verarbeitet: true } : null;
  return commitAiAnalysis(expected, metadata, fristen, options.signal);
}
