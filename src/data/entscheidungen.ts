import type { AuditEintrag, Entscheidung } from '../app/types.js';
import { timestamp } from '../utils/dates.js';
import { record, stringArray, stringField } from '../utils/format.js';
import { removeFile, withDataLock, writeText } from './filesystem.js';
import { assertMandantId, getMandant } from './mandanten.js';
import { assertDocumentId, markdownText, newRecordPath, readRecords, timestampField } from './notizen.js';
export function validateEntscheidung(input: unknown): Entscheidung {
  const object = record(input), id = stringField(object, 'id'), mandant_id = stringField(object, 'mandant_id'), titel = stringField(object, 'titel');
  assertDocumentId(id); assertMandantId(mandant_id);
  if (object.typ !== 'entscheidung' || !titel.trim() || !['entwurf', 'final', 'widerrufen'].includes(String(object.status)) || !stringArray(object.tags) || !Array.isArray(object.audit_trail)) throw new Error('Ungültige Entscheidung: Pflichtfelder und Status prüfen.');
  const audit_trail: AuditEintrag[] = object.audit_trail.map((item: unknown) => { const entry = record(item); return { datum: timestampField(entry, 'datum'), aktion: stringField(entry, 'aktion'), benutzer: stringField(entry, 'benutzer') }; });
  return { id, mandant_id, titel, typ: 'entscheidung', erstellt: timestampField(object, 'erstellt'), geaendert: timestampField(object, 'geaendert'), entschieden_von: stringField(object, 'entschieden_von'), status: object.status as Entscheidung['status'], tags: object.tags, audit_trail, inhalt: stringField(object, 'inhalt') };
}
const records = (mandantId: string) => readRecords(mandantId, 'entscheidungen', '.md', validateEntscheidung);
export async function listEntscheidungen(mandantId: string): Promise<Entscheidung[]> { return (await records(mandantId)).map(item => item.value).sort((a, b) => b.erstellt.localeCompare(a.erstellt)); }
export async function getEntscheidung(mandantId: string, id: string): Promise<Entscheidung> { assertDocumentId(id); const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Entscheidung nicht gefunden.'); return found.value; }
export async function saveEntscheidung(entscheidung: Entscheidung): Promise<Entscheidung> {
  return withDataLock(async () => {
    const value = validateEntscheidung(entscheidung); await getMandant(value.mandant_id);
    const existing = (await records(value.mandant_id)).find(item => item.value.id === value.id), now = timestamp();
    const audit_trail = existing ? [...existing.value.audit_trail] : [...value.audit_trail];
    if (!existing && audit_trail.length === 0) audit_trail.push({ datum: value.erstellt, aktion: 'Erstellt', benutzer: value.entschieden_von });
    if (existing) audit_trail.push({ datum: now, aktion: existing.value.status === value.status ? 'Bearbeitet' : `Status auf ${value.status} gesetzt`, benutzer: value.entschieden_von });
    const saved = { ...value, erstellt: existing?.value.erstellt ?? value.erstellt, geaendert: existing ? now : value.geaendert, audit_trail };
    const file = existing?.file ?? await newRecordPath(value.mandant_id, 'entscheidungen', saved.erstellt.slice(0, 10), saved.titel, saved.id, '.md');
    await writeText(file, markdownText(saved)); return saved;
  });
}
export async function deleteEntscheidung(mandantId: string, id: string): Promise<void> { assertDocumentId(id); await withDataLock(async () => { const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Entscheidung nicht gefunden.'); await removeFile(found.file); }); }
