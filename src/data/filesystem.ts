import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ErnaConfig } from '../app/types.js';
import { errorMessage, record, stringField } from '../utils/format.js';

export function getDataPath(): string {
  const configured = process.env.ERNA_DATA_PATH?.trim();
  return path.resolve(configured ? (configured === '~' ? os.homedir() : configured.startsWith('~/') ? path.join(os.homedir(), configured.slice(2)) : configured) : path.join(os.homedir(), 'erna-data'));
}
function confined(file: string): string {
  const root = getDataPath(), resolved = path.resolve(file), relative = path.relative(root, resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative) || file.includes('\0')) throw new Error('Dateipfad liegt außerhalb des ERNA-Datenverzeichnisses.');
  return resolved;
}
export function dataPath(...segments: string[]): string {
  if (segments.some(segment => path.isAbsolute(segment) || segment.includes('\\') || segment.split('/').includes('..') || segment.includes('\0'))) throw new Error('Unsicherer Dateipfad.');
  return confined(path.join(getDataPath(), ...segments));
}
function missing(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'; }
async function checked(file: string): Promise<string> {
  const resolved = confined(file), root = getDataPath();
  const components = [root];
  const relative = path.relative(root, resolved);
  if (relative) { let current = root; for (const segment of relative.split(path.sep)) { current = path.join(current, segment); components.push(current); } }
  for (const component of components) {
    try { if ((await lstat(component)).isSymbolicLink()) throw new Error(`Symbolische Verknüpfungen sind im Datenpfad nicht erlaubt: ${component}`); }
    catch (error) { if (!missing(error)) throw error; }
  }
  return resolved;
}
async function ensureDirectory(directory: string): Promise<void> {
  const resolved = await checked(directory), root = getDataPath();
  if (resolved !== root) await ensureDirectory(path.dirname(resolved));
  try { await mkdir(resolved, { recursive: resolved === root, mode: 0o700 }); } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  await checked(resolved);
  if (!(await lstat(resolved)).isDirectory()) throw new Error(`Verzeichnis erwartet: ${resolved}`);
  await chmod(resolved, 0o700);
}
export async function ensureDataDirectory(): Promise<void> { await ensureDirectory(dataPath()); await ensureDirectory(dataPath('mandanten')); }

// Die Sperre umfasst auch das Lesen vor einem CRUD-Schreibvorgang.
const dataQueues = new Map<string, Promise<unknown>>();
export async function withDataLock<T>(operation: () => Promise<T>): Promise<T> {
  const key = getDataPath(), previous = dataQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  dataQueues.set(key, current);
  try { return await current; } finally { if (dataQueues.get(key) === current) dataQueues.delete(key); }
}
const writeQueues = new Map<string, Promise<unknown>>();
export async function writeText(file: string, text: string): Promise<void> {
  const destination = confined(file), previous = writeQueues.get(destination) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    await checked(destination); await ensureDirectory(path.dirname(destination));
    const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await checked(destination); await rename(temporary, destination);
    }
    finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
  });
  writeQueues.set(destination, current);
  try { await current; } catch (error) { throw new Error(`Datei konnte nicht gespeichert werden: ${errorMessage(error)}`, { cause: error }); }
  finally { if (writeQueues.get(destination) === current) writeQueues.delete(destination); }
}
export async function readText(file: string): Promise<string> {
  try {
    const safe = await checked(file);
    const handle = await open(safe, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { if (!(await handle.stat()).isFile()) throw new Error(`Reguläre Datei erwartet: ${safe}`); return await handle.readFile('utf8'); }
    finally { await handle.close(); }
  } catch (error) { throw new Error(`Datei konnte nicht gelesen werden: ${file}: ${errorMessage(error)}`, { cause: error }); }
}
export async function readJson<T>(file: string, validator?: (value: unknown) => T): Promise<T> {
  const text = await readText(file);
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch (error) { throw new Error(`Ungültige JSON-Datei: ${file}`, { cause: error }); }
  return validator ? validator(value) : value as T;
}
export async function writeJson(file: string, value: unknown): Promise<void> { await writeText(file, JSON.stringify(value, null, 2) + '\n'); }
export async function exists(file: string): Promise<boolean> { try { await lstat(await checked(file)); return true; } catch (error) { if (missing(error)) return false; throw error; } }
async function listEntries(directory: string, folders: boolean, extension?: string): Promise<string[]> {
  const safe = await checked(directory);
  try { return (await readdir(safe, { withFileTypes: true })).filter(entry => (folders ? entry.isDirectory() : entry.isFile()) && (!extension || entry.name.endsWith(extension))).map(entry => path.join(safe, entry.name)).sort(); }
  catch (error) { if (missing(error)) return []; throw error; }
}
export async function listFiles(directory: string, extension?: string): Promise<string[]> { return listEntries(directory, false, extension); }
export async function listDirectories(directory: string): Promise<string[]> { return listEntries(directory, true); }
export async function removeFile(file: string): Promise<void> { try { await unlink(await checked(file)); } catch (error) { if (!missing(error)) throw error; } }
export async function removeEmptyMandantDirectory(directory: string): Promise<void> {
  const safe = await checked(directory), profile = path.join(safe, 'profil.json'), directories: string[] = [];
  async function scan(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Eine Akte mit symbolischen Verknüpfungen kann nicht gelöscht werden.');
      if (entry.isDirectory()) await scan(child);
      else if (child !== profile) throw new Error('Mandant kann nur gelöscht werden, wenn seine Akte leer ist.');
    }
    directories.push(current);
  }
  await scan(safe); await removeFile(profile);
  for (const child of directories) await rmdir(child);
}
export function validateConfig(value: unknown): ErnaConfig {
  const object = record(value), kanzlei = record(object.kanzlei), ai = record(object.ai), ui = record(object.ui);
  if (object.version !== '1' || kanzlei.typ !== 'Steuerberatung' || ai.sprache !== 'de' || ui.theme !== 'dark' || ui.datumsformat !== 'DD.MM.YYYY' || ui.zeitformat !== 'HH:mm') throw new Error('Ungültige ERNA-Konfiguration.');
  for (const key of ['aktiviert', 'autoStrukturierungBeiSave', 'autoFristenerkennung', 'datenschutzAkzeptiert']) if (typeof ai[key] !== 'boolean') throw new Error(`Ungültige KI-Einstellung: ${key}`);
  return { version: '1', kanzlei: { name: stringField(kanzlei, 'name'), typ: 'Steuerberatung', standardBearbeiter: stringField(kanzlei, 'standardBearbeiter') }, ai: { aktiviert: ai.aktiviert as boolean, autoStrukturierungBeiSave: ai.autoStrukturierungBeiSave as boolean, autoFristenerkennung: ai.autoFristenerkennung as boolean, datenschutzAkzeptiert: ai.datenschutzAkzeptiert as boolean, model: stringField(ai, 'model'), sprache: 'de' }, ui: { theme: 'dark', datumsformat: 'DD.MM.YYYY', zeitformat: 'HH:mm' } };
}
export async function loadConfig(): Promise<ErnaConfig | null> { const file = dataPath('erna-config.json'); return await exists(file) ? readJson(file, validateConfig) : null; }
export async function saveConfig(config: ErnaConfig): Promise<void> {
  await withDataLock(async () => { await loadConfig(); await writeJson(dataPath('erna-config.json'), validateConfig(config)); });
}

// Ausschließlich lesender Zugriff auf die mit der Anwendung gelieferten Demodateien.
async function bundledPath(relative: string): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo-data');
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..') || relative.includes('\0')) throw new Error('Unsicherer Pfad einer Demodatei.');
  let current = root;
  for (const segment of ['', ...relative.split('/').filter(Boolean)]) {
    current = path.join(current, segment);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolische Verknüpfungen in Demodaten sind nicht erlaubt.');
  }
  return current;
}
export async function readBundledFile(relative: string): Promise<string> {
  const file = await bundledPath(relative), handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!(await handle.stat()).isFile()) throw new Error('Reguläre Demodatei erwartet.'); return await handle.readFile('utf8'); }
  finally { await handle.close(); }
}
export async function readBundledDirectory(relative: string): Promise<{ name: string; directory: boolean }[]> {
  return (await readdir(await bundledPath(relative), { withFileTypes: true })).filter(entry => entry.isFile() || entry.isDirectory()).map(entry => ({ name: entry.name, directory: entry.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
