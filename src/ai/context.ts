import path from 'node:path';
import matter from 'gray-matter';
import type { KontextOptions, Quelldatei } from '../app/types.js';
import { dataPath, getDataPath, readText } from '../data/filesystem.js';
import { getMandant, validateMandant } from '../data/mandanten.js';
import { readRecords, validateNotiz } from '../data/notizen.js';
import { validateTermin } from '../data/termine.js';
import { validateEntscheidung } from '../data/entscheidungen.js';
import { errorMessage } from '../utils/format.js';

const MAX_FILE_BYTES = 50_000;
const MAX_CONTEXT_BYTES = 600_000;

/** Liest ausschließlich validierte Quellen aus der ausgewählten Mandantenakte.
 * Lokal verwendbar, auch wenn KI deaktiviert ist. */
export async function readMandantFiles(mandantId: string, options: KontextOptions = {}): Promise<Quelldatei[]> {
  await getMandant(mandantId);
  const files: { file: string; id: string; typ: Quelldatei['typ'] }[] = [
    { file: dataPath('mandanten', mandantId, 'profil.json'), id: mandantId, typ: 'profil' },
  ];
  if (options.includeNotizen !== false) files.push(...(await readRecords(mandantId, 'notizen', '.md', validateNotiz)).map(item => ({ file: item.file, id: item.value.id, typ: 'notiz' as const })));
  if (options.includeTermine !== false) files.push(...(await readRecords(mandantId, 'termine', '.json', validateTermin)).map(item => ({ file: item.file, id: item.value.id, typ: 'termin' as const })));
  if (options.includeEntscheidungen !== false) files.push(...(await readRecords(mandantId, 'entscheidungen', '.md', validateEntscheidung)).map(item => ({ file: item.file, id: item.value.id, typ: 'entscheidung' as const })));
  const result: Quelldatei[] = [];
  for (const file of files) {
    try {
      const inhalt = await readText(file.file);
      let datum: string;
      if (file.typ === 'profil') {
        const profile = validateMandant(JSON.parse(inhalt) as unknown);
        if (profile.id !== mandantId) throw new Error('Mandanten-ID stimmt nicht mit der Akte überein.');
        datum = profile.mandant_seit;
      } else {
        const parsed = file.typ === 'termin' ? undefined : matter(inhalt);
        const value: unknown = parsed ? { ...parsed.data, inhalt: parsed.content } : JSON.parse(inhalt) as unknown;
        const document = file.typ === 'notiz' ? validateNotiz(value) : file.typ === 'entscheidung' ? validateEntscheidung(value) : validateTermin(value);
        if (document.mandant_id !== mandantId || document.id !== file.id) throw new Error('Dokumentzuordnung wurde während des Lesens geändert.');
        datum = 'geaendert' in document ? document.geaendert : document.erstellt;
      }
      result.push({ pfad: path.relative(getDataPath(), file.file).split(path.sep).join('/'), datum, inhalt, id: file.id, typ: file.typ });
    } catch (error) { console.error(`Kontextdatei übersprungen: ${file.file}: ${errorMessage(error)}`); }
  }
  return result.sort((a, b) => Date.parse(b.datum) - Date.parse(a.datum) || a.pfad.localeCompare(b.pfad, 'de'));
}

function boundedFile(text: string): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= MAX_FILE_BYTES) return text;
  const marker = '\n[GEKÜRZT]';
  let end = MAX_FILE_BYTES - Buffer.byteLength(marker);
  // Eine UTF-8-Fortsetzung darf nicht das erste ausgelassene Byte sein.
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end--;
  return buffer.toString('utf8', 0, end) + marker;
}

export async function loadMandantContextBundle(mandantId: string, options: KontextOptions = {}): Promise<{ text: string; quellen: Quelldatei[]; ausgelassen: number }> {
  const maxFiles = options.maxFiles ?? 100;
  const maxTokensEstimate = options.maxTokensEstimate ?? 150_000;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 0) throw new Error('Die maximale Dateianzahl muss eine nicht negative ganze Zahl sein.');
  if (!Number.isSafeInteger(maxTokensEstimate) || maxTokensEstimate <= 0) throw new Error('Das Kontextbudget muss eine positive ganze Tokenanzahl sein.');
  const budget = Math.min(maxTokensEstimate * 4, MAX_CONTEXT_BYTES);
  const files = await readMandantFiles(mandantId, options);
  const quellen: Quelldatei[] = [];
  let text = '';
  const omittedMarker = (count: number): string => count ? `[${count} Dateien ausgelassen]` : '';
  for (const file of files.slice(0, maxFiles)) {
    const inhalt = boundedFile(file.inhalt);
    const entry = `=== DATEI: ${file.pfad} (${file.datum}) ===\n${inhalt}\n\n`;
    const reserve = omittedMarker(files.length - quellen.length - 1);
    if (Buffer.byteLength(text) + Buffer.byteLength(entry) + Buffer.byteLength(reserve) > budget) break;
    text += entry;
    quellen.push({ ...file, inhalt });
  }
  const ausgelassen = files.length - quellen.length;
  const marker = omittedMarker(ausgelassen);
  if (Buffer.byteLength(text) + Buffer.byteLength(marker) > budget) throw new Error('Das Kontextbudget ist zu klein für den Auslassungshinweis.');
  return { text: text + marker, quellen, ausgelassen };
}

export async function loadMandantContext(mandantId: string, options: KontextOptions = {}): Promise<string> {
  return (await loadMandantContextBundle(mandantId, options)).text;
}
