import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import matter from 'gray-matter';
import { validate as validateUuid, version as uuidVersion } from 'uuid';
import { isValid, parseISO } from 'date-fns';
import type { Notiz } from '../app/types.js';
import { isIsoDate, timestamp } from '../utils/dates.js';
import { errorMessage, record, slugify, stringArray, stringField } from '../utils/format.js';
import { dataPath, exists, listFiles, readJson, readText, removeFile, withDataLock, writeText } from './filesystem.js';
import { assertMandantId, getMandant } from './mandanten.js';

export function assertDocumentId(id: string): void { if (!validateUuid(id) || uuidVersion(id) !== 4) throw new Error('Ungültige Dokument-ID: UUID-v4 erwartet.'); }
export function timestampField(object: Record<string, unknown>, key: string): string {
  const value = stringField(object, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/.test(value) || !isIsoDate(value.slice(0, 10)) || !isValid(parseISO(value))) throw new Error(`Ungültiger ISO-Zeitstempel mit Zeitzonenoffset: ${key}`);
  return value;
}
export function validateNotiz(value: unknown): Notiz {
  const object = record(value), id = stringField(object, 'id'), mandant_id = stringField(object, 'mandant_id'), titel = stringField(object, 'titel');
  assertDocumentId(id); assertMandantId(mandant_id);
  if (object.typ !== 'notiz' || !titel.trim() || !stringArray(object.tags) || !stringArray(object.ai_folgeaktionen) || typeof object.ai_verarbeitet !== 'boolean') throw new Error('Ungültige Notiz: Pflichtfelder prüfen.');
  return { id, mandant_id, typ: 'notiz', titel, erstellt: timestampField(object, 'erstellt'), geaendert: timestampField(object, 'geaendert'), autor: stringField(object, 'autor'), tags: object.tags, ai_zusammenfassung: stringField(object, 'ai_zusammenfassung'), ai_folgeaktionen: object.ai_folgeaktionen, ai_verarbeitet: object.ai_verarbeitet, inhalt: stringField(object, 'inhalt') };
}
export interface FileRecord<T> { file: string; value: T }
export async function readRecords<T extends { id: string; mandant_id: string }>(mandantId: string, folder: string, extension: '.md' | '.json', validate: (value: unknown) => T): Promise<FileRecord<T>[]> {
  assertMandantId(mandantId); const results: FileRecord<T>[] = [], seen = new Set<string>();
  for (const file of await listFiles(dataPath('mandanten', mandantId, folder), extension)) {
    try {
      let value: T;
      if (extension === '.md') {
        const text = await readText(file);
        if (!/^---\r?\n/.test(text)) throw new Error('YAML-Frontmatter fehlt.');
        const parsed = matter(text); value = validate({ ...parsed.data, inhalt: parsed.content });
      } else value = await readJson(file, validate);
      if (value.mandant_id !== mandantId) throw new Error('Mandanten-ID stimmt nicht mit dem Aktenverzeichnis überein.');
      if (seen.has(value.id)) throw new Error('Dokument-ID kommt mehrfach vor.');
      seen.add(value.id); results.push({ file, value });
    } catch (error) { console.error(`Datei übersprungen: ${file}: ${errorMessage(error)}`); }
  }
  return results;
}
export async function newRecordPath(mandantId: string, folder: string, datum: string, titel: string, id: string, extension: '.md' | '.json'): Promise<string> {
  const directory = dataPath('mandanten', mandantId, folder), base = path.join(directory, `${datum}_${slugify(titel)}`);
  const candidate = `${base}${extension}`;
  if (!await exists(candidate)) return candidate;
  const unique = `${base}_${id}${extension}`;
  if (await exists(unique)) throw new Error('Eine Datei mit dieser Dokument-ID existiert bereits und kann nicht überschrieben werden.');
  return unique;
}
export function markdownText(value: { inhalt: string }): string { const { inhalt, ...frontmatter } = value; return matter.stringify('', frontmatter).replace(/\n$/, '') + inhalt; }
async function records(mandantId: string): Promise<FileRecord<Notiz>[]> { return readRecords(mandantId, 'notizen', '.md', validateNotiz); }
export async function listNotizen(mandantId: string): Promise<Notiz[]> { return (await records(mandantId)).map(item => item.value).sort((a, b) => b.erstellt.localeCompare(a.erstellt)); }
export async function getNotiz(mandantId: string, id: string): Promise<Notiz> { assertDocumentId(id); const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Notiz nicht gefunden.'); return found.value; }
export async function saveNotiz(notiz: Notiz): Promise<Notiz> {
  return withDataLock(async () => {
    const value = validateNotiz(notiz); await getMandant(value.mandant_id);
    const existing = (await records(value.mandant_id)).find(item => item.value.id === value.id);
    const saved = { ...value, erstellt: existing?.value.erstellt ?? value.erstellt, geaendert: existing ? timestamp() : value.geaendert };
    const file = existing?.file ?? await newRecordPath(value.mandant_id, 'notizen', saved.erstellt.slice(0, 10), saved.titel, saved.id, '.md');
    await writeText(file, markdownText(saved)); return saved;
  });
}
export async function deleteNotiz(mandantId: string, id: string): Promise<void> { assertDocumentId(id); await withDataLock(async () => { const found = (await records(mandantId)).find(item => item.value.id === id); if (!found) throw new Error('Notiz nicht gefunden.'); await removeFile(found.file); }); }
export async function updateNotizIfUnchanged(expected: Notiz, update: Partial<Pick<Notiz, 'tags' | 'ai_zusammenfassung' | 'ai_folgeaktionen' | 'ai_verarbeitet'>>): Promise<Notiz> {
  const snapshot = structuredClone(expected);
  return withDataLock(async () => {
    const normalizedExpected = validateNotiz(snapshot);
    const existing = (await records(snapshot.mandant_id)).find(item => item.value.id === snapshot.id);
    if (!existing || !isDeepStrictEqual(validateNotiz(existing.value), normalizedExpected)) throw new Error('Notiz wurde inzwischen geändert; KI-Ergebnis wurde nicht übernommen.');
    const saved = validateNotiz({ ...existing.value, ...update, geaendert: timestamp() });
    await writeText(existing.file, markdownText(saved)); return saved;
  });
}
