import type { AiOptions, Entscheidung, ErkannteFrist, Notiz } from '../app/types.js';
import { validateNotiz } from '../data/notizen.js';
import { validateEntscheidung } from '../data/entscheidungen.js';
import { commitAiAnalysis } from '../data/termine.js';
import { isIsoDate } from '../utils/dates.js';
import { errorMessage, record, stringField } from '../utils/format.js';
import { AiResponseError, assertAiActive, callClaude, withAiDeadline } from './client.js';
import { PROMPTS } from './prompts.js';

export function parseFristen(raw: string): ErkannteFrist[] {
  try {
    const object = record(JSON.parse(raw) as unknown);
    if (!Array.isArray(object.fristen)) throw new Error('Eine Fristenliste wird erwartet.');
    return object.fristen.map((value: unknown) => {
      const frist = record(value), titel = stringField(frist, 'titel').trim();
      if (!titel || !(frist.datum === null || typeof frist.datum === 'string' && isIsoDate(frist.datum)) || typeof frist.unsicher !== 'boolean' || !['hoch', 'mittel', 'niedrig'].includes(String(frist.prioritaet)) || !['frist', 'termin', 'erinnerung'].includes(String(frist.typ))) throw new Error('Eine Frist enthält einen ungültigen Titel, ein ungültiges Datum oder ungültige Pflichtfelder.');
      return { titel, datum: frist.datum, unsicher: frist.unsicher, prioritaet: frist.prioritaet as ErkannteFrist['prioritaet'], typ: frist.typ as ErkannteFrist['typ'], original_text: stringField(frist, 'original_text'), begruendung: stringField(frist, 'begruendung') };
    });
  } catch (error) { throw new AiResponseError(`Claude-Antwort zu Fristen ist ungültig: ${errorMessage(error)}`, raw, { cause: error }); }
}

/** Berechnet und validiert das Ergebnis ohne Schreibzugriff, auch für kombinierte Analysen. */
export async function analyseFristen(snapshot: Notiz | Entscheidung, options: AiOptions = {}): Promise<ErkannteFrist[]> {
  const expected = snapshot.typ === 'notiz' ? validateNotiz(snapshot) : validateEntscheidung(snapshot);
  const raw = await callClaude(PROMPTS.FRISTEN_ERKENNEN_SYSTEM, PROMPTS.FRISTEN_ERKENNEN_USER(expected.inhalt, expected.erstellt.slice(0, 10)), undefined, { ...options, mandantIds: [expected.mandant_id] });
  return parseFristen(raw);
}

export async function erkenneFristen(snapshot: Notiz | Entscheidung, options: AiOptions = {}): Promise<Awaited<ReturnType<typeof commitAiAnalysis>>> {
  const expected = structuredClone(snapshot.typ === 'notiz' ? validateNotiz(snapshot) : validateEntscheidung(snapshot));
  const fristen = await withAiDeadline(signal => analyseFristen(expected, { ...options, signal }), options);
  assertAiActive(options.signal);
  return commitAiAnalysis(expected, null, fristen, options.signal);
}
