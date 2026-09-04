import { isDeepStrictEqual } from 'node:util';
import { v4 as uuid } from 'uuid';
import type { Entscheidung, ErkannteFrist, Notiz, Termin } from '../app/types.js';
import { daysBetween, isIsoDate, timestamp } from '../utils/dates.js';
import { errorMessage, record, stringField } from '../utils/format.js';
import { exists, loadConfig, readText, removeFile, withDataLock, writeJson, writeText } from './filesystem.js';
import { assertMandantId, getMandant } from './mandanten.js';
import { assertDocumentId, markdownText, newRecordPath, readRecords, timestampField, validateNotiz } from './notizen.js';
import { validateEntscheidung } from './entscheidungen.js';
export function validateTermin(input: unknown): Termin {
  const object = record(input), id = stringField(object, 'id'), mandant_id = stringField(object, 'mandant_id'), titel = stringField(object, 'titel'), datum = stringField(object, 'datum');
  assertDocumentId(id); assertMandantId(mandant_id);
  if (!titel.trim() || !isIsoDate(datum) || !['frist', 'termin', 'erinnerung'].includes(String(object.typ)) || !['hoch', 'mittel', 'niedrig'].includes(String(object.prioritaet)) || typeof object.erledigt !== 'boolean' || typeof object.ai_erkannt !== 'boolean' || !(object.uhrzeit === null || typeof object.uhrzeit === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(object.uhrzeit)) || !(object.quelle_notiz_id === null || typeof object.quelle_notiz_id === 'string') || !(object.unsicher === undefined || typeof object.unsicher === 'boolean')) throw new Error('Ungültiger Termin: Pflichtfelder, Datum oder Uhrzeit prüfen.');
  if (typeof object.quelle_notiz_id === 'string') assertDocumentId(object.quelle_notiz_id);
  return { id, mandant_id, titel, datum, typ: object.typ as Termin['typ'], prioritaet: object.prioritaet as Termin['prioritaet'], erledigt: object.erledigt, ai_erkannt: object.ai_erkannt, uhrzeit: object.uhrzeit, quelle_notiz_id: object.quelle_notiz_id, erstellt: timestampField(object, 'erstellt'), notiz: stringField(object, 'notiz'), ...(object.unsicher === undefined ? {} : { unsicher: object.unsicher }) };
}
const records = (mandantId: string) => readRecords(mandantId, 'termine', '.json', validateTermin);
export async function listTermine(mandantId: string): Promise<Termin[]> { return (await records(mandantId)).map(item => item.value).sort((a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit ?? '').localeCompare(b.uhrzeit ?? '')); }
export async function getTermin(mandantId: string, id: string): Promise<Termin> { assertDocumentId(id); const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Termin nicht gefunden.'); return found.value; }
export async function saveTermin(termin: Termin): Promise<Termin> {
  return withDataLock(async () => {
    const value = validateTermin(termin); await getMandant(value.mandant_id);
    const existing = (await records(value.mandant_id)).find(item => item.value.id === value.id), saved = { ...value, erstellt: existing?.value.erstellt ?? value.erstellt };
    const file = existing?.file ?? await newRecordPath(value.mandant_id, 'termine', value.datum, value.titel, value.id, '.json');
    await writeJson(file, saved); return saved;
  });
}
export async function deleteTermin(mandantId: string, id: string): Promise<void> { assertDocumentId(id); await withDataLock(async () => { const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Termin nicht gefunden.'); await removeFile(found.file); }); }

function validateErkannteFrist(value: unknown): ErkannteFrist {
  const object = record(value), titel = stringField(object, 'titel').trim();
  if (!titel || !(object.datum === null || typeof object.datum === 'string' && isIsoDate(object.datum)) || typeof object.unsicher !== 'boolean' || !['hoch', 'mittel', 'niedrig'].includes(String(object.prioritaet)) || !['frist', 'termin', 'erinnerung'].includes(String(object.typ))) throw new Error('Ungültige erkannte Frist: Titel, Datum, Typ oder Priorität prüfen.');
  return { titel, datum: object.datum, unsicher: object.unsicher, prioritaet: object.prioritaet as ErkannteFrist['prioritaet'], typ: object.typ as ErkannteFrist['typ'], original_text: stringField(object, 'original_text'), begruendung: stringField(object, 'begruendung') };
}
const normalizedTitle = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de');

/** Übernimmt zusammengehörige KI-Ergebnisse unter genau einer Prozesssperre.
 * Verschachtelte CRUD-Aufrufe sind hier unzulässig, da deren Sperre nicht reentrant ist. */
export async function commitAiAnalysis(
  expected: Notiz | Entscheidung,
  metadata: Partial<Pick<Notiz, 'tags' | 'ai_zusammenfassung' | 'ai_folgeaktionen' | 'ai_verarbeitet'>> | null,
  fristen: ErkannteFrist[],
  signal?: AbortSignal,
): Promise<{ notiz?: Notiz; termine: Termin[]; skipped: number }> {
  const snapshot = structuredClone(expected);
  const requestedMetadata = structuredClone(metadata);
  const requestedFristen = structuredClone(fristen);
  const assertActive = (): void => { if (signal?.aborted) throw new Error('KI-Verarbeitung wurde abgebrochen; Ergebnis wurde nicht übernommen.'); };
  return withDataLock(async () => {
    assertActive();
    const normalized = snapshot.typ === 'notiz' ? validateNotiz(snapshot) : validateEntscheidung(snapshot);
    const documents = normalized.typ === 'notiz'
      ? await readRecords(normalized.mandant_id, 'notizen', '.md', validateNotiz)
      : await readRecords(normalized.mandant_id, 'entscheidungen', '.md', validateEntscheidung);
    const current = documents.find(item => item.value.id === normalized.id);
    if (!current || !isDeepStrictEqual(current.value, normalized)) throw new Error('Dokument wurde inzwischen geändert oder gelöscht; KI-Ergebnis wurde nicht übernommen.');

    const config = await loadConfig(), mandant = await getMandant(normalized.mandant_id);
    if (!config?.ai.aktiviert || !config.ai.datenschutzAkzeptiert || !mandant.ai_features_aktiv) throw new Error('KI-Ergebnis wurde nicht übernommen: KI ist deaktiviert oder die Datenschutzzustimmung fehlt.');
    if (!Array.isArray(requestedFristen)) throw new Error('Ungültige Fristenliste.');
    const validatedFristen = requestedFristen.map(validateErkannteFrist);
    let notiz: Notiz | undefined;
    if (requestedMetadata !== null) {
      if (normalized.typ !== 'notiz') throw new Error('KI-Notizmetadaten können keiner Entscheidung zugewiesen werden.');
      const fields = record(requestedMetadata);
      if (Object.keys(fields).some(key => !['tags', 'ai_zusammenfassung', 'ai_folgeaktionen', 'ai_verarbeitet'].includes(key))) throw new Error('KI darf ausschließlich die vorgesehenen Notizmetadaten ändern.');
      notiz = validateNotiz({ ...normalized, ...fields, geaendert: timestamp() });
    }

    const known = (await records(normalized.mandant_id)).map(item => item.value);
    const termine: Termin[] = [];
    let skipped = 0;
    for (const frist of validatedFristen) {
      const datum = frist.datum;
      if (datum === null || known.some(termin => normalizedTitle(termin.titel) === normalizedTitle(frist.titel) && Math.abs(daysBetween(termin.datum, datum)) <= 1)) {
        skipped++;
        continue;
      }
      const termin = validateTermin({
        id: uuid(), mandant_id: normalized.mandant_id, typ: frist.typ, titel: frist.titel,
        datum, uhrzeit: null, prioritaet: frist.prioritaet, erledigt: false,
        erstellt: timestamp(), quelle_notiz_id: normalized.typ === 'notiz' ? normalized.id : null,
        ai_erkannt: true, unsicher: frist.unsicher,
        notiz: `Quelle: ${normalized.typ === 'notiz' ? 'Notiz' : 'Entscheidung'} „${normalized.titel}“ (${normalized.id})\nOriginaltext: ${frist.original_text}\nBegründung: ${frist.begruendung}`,
      });
      known.push(termin);
      termine.push(termin);
    }

    const originalText = notiz ? await readText(current.file) : undefined;
    const updatedText = notiz ? markdownText(notiz) : undefined;
    const createdFiles: { file: string; text: string }[] = [];
    let noteWriteAttempted = false;
    let started = false;
    try {
      assertActive();
      for (const termin of termine) {
        // Erst nach dem vorherigen Schreiben den Pfad wählen: Auch verschiedene
        // Titel können denselben Slug und damit denselben Basisnamen ergeben.
        const file = await newRecordPath(termin.mandant_id, 'termine', termin.datum, termin.titel, termin.id, '.json');
        if (!started) assertActive();
        createdFiles.push({ file, text: JSON.stringify(termin, null, 2) + '\n' });
        started = true;
        await writeJson(file, termin);
      }
      if (updatedText !== undefined) {
        if (!started) assertActive();
        noteWriteAttempted = true;
        await writeText(current.file, updatedText);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      if (noteWriteAttempted && originalText !== undefined) {
        try {
          const currentText = await exists(current.file) ? await readText(current.file) : undefined;
          if (currentText !== originalText) {
            if (currentText !== undefined && currentText !== updatedText) throw new Error(`Quelldatei wurde außerhalb der Anwendung geändert und bleibt erhalten: ${current.file}`);
            await writeText(current.file, originalText);
          }
        } catch (rollbackError) { rollbackErrors.push(errorMessage(rollbackError)); }
      }
      for (const created of createdFiles.reverse()) {
        try {
          if (!await exists(created.file)) continue;
          if (await readText(created.file) !== created.text) throw new Error(`Neu angelegte Datei wurde inzwischen geändert und bleibt erhalten: ${created.file}`);
          await removeFile(created.file);
        } catch (rollbackError) { rollbackErrors.push(errorMessage(rollbackError)); }
      }
      const detail = rollbackErrors.length ? ` Rücknahme unvollständig: ${rollbackErrors.join('; ')}` : ' Alle bereits geschriebenen KI-Änderungen wurden zurückgenommen.';
      throw new Error(`KI-Ergebnis konnte nicht übernommen werden: ${errorMessage(error)}${detail}`, { cause: error });
    }
    return { ...(notiz ? { notiz } : {}), termine, skipped };
  });
}
