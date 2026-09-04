import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedDemoData } from '../../src/data/seed.js';
import { dataPath, readJson } from '../../src/data/filesystem.js';
import { getMandant, listMandanten, saveMandant } from '../../src/data/mandanten.js';
import { listNotizen } from '../../src/data/notizen.js';
import { listTermine } from '../../src/data/termine.js';
import { listEntscheidungen } from '../../src/data/entscheidungen.js';
import type { ErnaIndex } from '../../src/app/types.js';
let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'erna-seed-')); vi.stubEnv('ERNA_DATA_PATH', directory); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
async function snapshot(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(root: string): Promise<void> { for (const entry of await readdir(root, { withFileTypes: true })) { const file = path.join(root, entry.name); if (entry.isDirectory()) await walk(file); else result[path.relative(directory, file)] = await readFile(file, 'utf8'); } }
  await walk(dataPath('mandanten')); return result;
}
it('lädt die statischen Demoakten mit 3 Profilen, 7 Notizen, 6 Terminen und 3 Entscheidungen', async () => {
  expect(await seedDemoData(new Date(2026, 8, 4, 12))).toEqual({ created: 3, skipped: 0 });
  const clients = await listMandanten(); expect(clients).toHaveLength(3);
  const stats = await Promise.all(clients.map(async client => ({ id: client.id, notes: await listNotizen(client.id), terms: await listTermine(client.id), decisions: await listEntscheidungen(client.id) })));
  expect(stats.reduce((n, s) => n + s.notes.length, 0)).toBe(7);
  expect(stats.reduce((n, s) => n + s.terms.length, 0)).toBe(6);
  expect(stats.reduce((n, s) => n + s.decisions.length, 0)).toBe(3);
  const huber = stats.find(s => s.id === 'M-2024-0001');
  expect(huber?.notes).toHaveLength(3); expect(huber?.terms.map(t => t.datum)).toEqual(['2026-09-02', '2026-09-04']);
  expect(huber?.notes.every(n => n.inhalt.includes('Fiktive Demodaten') && n.inhalt.includes('[PRÜFEN]'))).toBe(true);
  expect(huber?.terms.every(t => /[+-]\d{2}:\d{2}$/.test(t.erstellt))).toBe(true);
  expect((await readJson<ErnaIndex>(dataPath('erna-index.json'))).mandanten).toHaveLength(3);
});
it('überspringt vorhandene Akten bytegenau und dupliziert auch bei anderem Referenzdatum keine Dokumente', async () => {
  await seedDemoData(new Date(2026, 8, 4, 12));
  await saveMandant({ ...await getMandant('M-2024-0001'), name: 'Manuell bearbeitete echte Akte' });
  const before = await snapshot();
  expect(await seedDemoData(new Date(2027, 0, 12, 12))).toEqual({ created: 0, skipped: 3 });
  expect(await snapshot()).toEqual(before);
  expect((await getMandant('M-2024-0001')).name).toBe('Manuell bearbeitete echte Akte');
});
