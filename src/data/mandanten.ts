import path from 'node:path';
import type { Mandant } from '../app/types.js';
import { isIsoDate } from '../utils/dates.js';
import { errorMessage, record, stringField } from '../utils/format.js';
import { dataPath, exists, listDirectories, readJson, removeEmptyMandantDirectory, withDataLock, writeJson } from './filesystem.js';

export function assertMandantId(id: string): void { if (!/^M-\d{4}-\d{4,}$/.test(id)) throw new Error('Ungültige Mandanten-ID.'); }
export function validateMandant(value: unknown): Mandant {
  const object = record(value), id = stringField(object, 'id'); assertMandantId(id);
  const name = stringField(object, 'name'), seit = stringField(object, 'mandant_seit'), ende = stringField(object, 'wirtschaftsjahr_ende');
  if (!name.trim() || !isIsoDate(seit) || !isIsoDate(`2000-${ende}`) || typeof object.aktiv !== 'boolean' || typeof object.ai_features_aktiv !== 'boolean') throw new Error('Ungültiges Mandantenprofil: Name, Datum oder Aktivierungsstatus prüfen.');
  return { id, name, rechtsform: stringField(object, 'rechtsform'), ansprechpartner: stringField(object, 'ansprechpartner'), telefon: stringField(object, 'telefon'), email: stringField(object, 'email'), steuer_id: stringField(object, 'steuer_id'), finanzamt: stringField(object, 'finanzamt'), wirtschaftsjahr_ende: ende, mandant_seit: seit, bearbeiter: stringField(object, 'bearbeiter'), kategorie: stringField(object, 'kategorie'), branchen_code: stringField(object, 'branchen_code'), aktiv: object.aktiv, ai_features_aktiv: object.ai_features_aktiv, notizen: stringField(object, 'notizen') };
}
export async function listMandanten(): Promise<Mandant[]> {
  const values: Mandant[] = [];
  for (const directory of await listDirectories(dataPath('mandanten'))) {
    try { values.push(await getMandant(path.basename(directory))); }
    catch (error) { console.error(`Mandantenprofil übersprungen: ${directory}: ${errorMessage(error)}`); }
  }
  return values.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
export async function getMandant(id: string): Promise<Mandant> {
  assertMandantId(id); const value = await readJson(dataPath('mandanten', id, 'profil.json'), validateMandant);
  if (value.id !== id) throw new Error('Mandanten-ID stimmt nicht mit dem Aktenverzeichnis überein.');
  return value;
}
export async function saveMandant(mandant: Mandant): Promise<Mandant> {
  return withDataLock(async () => {
    const value = validateMandant(mandant), file = dataPath('mandanten', value.id, 'profil.json');
    if (await exists(file)) await getMandant(value.id);
    await writeJson(file, value); return value;
  });
}
export async function deleteMandant(id: string): Promise<void> { assertMandantId(id); await withDataLock(async () => { await getMandant(id); await removeEmptyMandantDirectory(dataPath('mandanten', id)); }); }
