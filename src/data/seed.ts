import 'dotenv/config';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { addDays, differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import type { Entscheidung, Mandant, Notiz, Termin } from '../app/types.js';
import { displayDate, parseGermanDate, timestamp, today } from '../utils/dates.js';
import { errorMessage, record, stringField } from '../utils/format.js';
import { dataPath, ensureDataDirectory, exists, getDataPath, readBundledDirectory, readBundledFile, withDataLock, writeJson, writeText } from './filesystem.js';
import { validateMandant } from './mandanten.js';
import { markdownText, validateNotiz } from './notizen.js';
import { validateTermin } from './termine.js';
import { validateEntscheidung } from './entscheidungen.js';
import { rebuildIndex } from './index.js';

interface DemoAkte {
  profil: Mandant;
  notizen: { filename: string; value: Notiz }[];
  termine: { filename: string; value: Termin }[];
  entscheidungen: { filename: string; value: Entscheidung }[];
}
function parseJson(text: string): unknown { try { return JSON.parse(text) as unknown; } catch (error) { throw new Error('Eine mitgelieferte Demodatei enthält ungültiges JSON.', { cause: error }); } }
function shiftText(text: string, offset: number): string {
  return text.replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, date => { const iso = parseGermanDate(date); return iso ? displayDate(addDays(parseISO(iso), offset)) : date; });
}
function shiftFilename(filename: string, offset: number): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}/, date => today(addDays(parseISO(date), offset)));
}
function parseMarkdown(text: string): Record<string, unknown> {
  if (!/^---\r?\n/.test(text)) throw new Error('Eine Demodatei besitzt keine YAML-Frontmatter.');
  const parsed = matter(text); return { ...parsed.data, inhalt: parsed.content };
}
async function loadDemoAkte(id: string, offset: number): Promise<DemoAkte> {
  const base = `mandanten/${id}`, profil = validateMandant(parseJson(await readBundledFile(`${base}/profil.json`)));
  if (profil.id !== id) throw new Error('Demoprofil und Aktenverzeichnis stimmen nicht überein.');
  const result: DemoAkte = { profil, notizen: [], termine: [], entscheidungen: [] };
  const shiftedStamp = (value: string): string => timestamp(addDays(parseISO(value), offset));
  for (const folder of ['notizen', 'termine', 'entscheidungen'] as const) {
    for (const entry of await readBundledDirectory(`${base}/${folder}`)) {
      if (entry.directory) continue;
      const filename = shiftFilename(entry.name, offset), text = await readBundledFile(`${base}/${folder}/${entry.name}`);
      if (folder === 'termine') {
        const original = validateTermin(parseJson(text));
        result.termine.push({ filename, value: validateTermin({ ...original, datum: today(addDays(parseISO(original.datum), offset)), erstellt: shiftedStamp(original.erstellt), notiz: shiftText(original.notiz, offset) }) });
      } else if (folder === 'notizen') {
        const original = validateNotiz(parseMarkdown(text));
        result.notizen.push({ filename, value: validateNotiz({ ...original, erstellt: shiftedStamp(original.erstellt), geaendert: shiftedStamp(original.geaendert), inhalt: shiftText(original.inhalt, offset) }) });
      } else {
        const original = validateEntscheidung(parseMarkdown(text));
        result.entscheidungen.push({ filename, value: validateEntscheidung({ ...original, erstellt: shiftedStamp(original.erstellt), geaendert: shiftedStamp(original.geaendert), audit_trail: original.audit_trail.map(item => ({ ...item, datum: shiftedStamp(item.datum) })), inhalt: shiftText(original.inhalt, offset) }) });
      }
    }
  }
  if ([...result.notizen, ...result.termine, ...result.entscheidungen].some(item => item.value.mandant_id !== id)) throw new Error('Eine Demodatei gehört nicht zum angegebenen Mandanten.');
  return result;
}

/** Erstellt ausschließlich fehlende Demoakten. Vorhandene Akten bleiben vollständig erhalten. */
export async function seedDemoData(referenceDate = new Date()): Promise<{ created: number; skipped: number }> {
  if (!isValid(referenceDate)) throw new Error('Ungültiges Referenzdatum für Demodaten.');
  const sourceIndex = record(parseJson(await readBundledFile('erna-index.json'))), basis = parseISO(stringField(sourceIndex, 'erstellt').slice(0, 10));
  if (!isValid(basis)) throw new Error('Das Basisdatum der Demodaten ist ungültig.');
  const offset = differenceInCalendarDays(referenceDate, basis);
  const sources = await Promise.all((await readBundledDirectory('mandanten')).filter(entry => entry.directory).map(entry => loadDemoAkte(entry.name, offset)));
  await ensureDataDirectory();
  const result = await withDataLock(async () => {
    let created = 0, skipped = 0;
    for (const source of sources) {
      const directory = dataPath('mandanten', source.profil.id);
      if (await exists(directory)) { skipped++; continue; }
      await writeJson(path.join(directory, 'profil.json'), source.profil);
      for (const item of source.notizen) await writeText(path.join(directory, 'notizen', item.filename), markdownText(item.value));
      for (const item of source.termine) await writeJson(path.join(directory, 'termine', item.filename), item.value);
      for (const item of source.entscheidungen) await writeText(path.join(directory, 'entscheidungen', item.filename), markdownText(item.value));
      created++;
    }
    return { created, skipped };
  });
  await rebuildIndex();
  return result;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  seedDemoData().then(result => { console.log(`Demodaten: ${result.created} Mandanten angelegt, ${result.skipped} vorhandene Akten unverändert übersprungen.\nDatenverzeichnis: ${getDataPath()}`); }).catch((error: unknown) => { console.error(`Demodaten konnten nicht geladen werden: ${errorMessage(error)}`); process.exitCode = 1; });
}
