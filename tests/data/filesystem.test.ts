import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Mandant, Notiz, Entscheidung } from '../../src/app/types.js';
import { dataPath, writeJson, readJson, ensureDataDirectory, loadConfig, saveConfig } from '../../src/data/filesystem.js';
import { saveMandant, listMandanten } from '../../src/data/mandanten.js';
import { saveNotiz, listNotizen, getNotiz, deleteNotiz } from '../../src/data/notizen.js';
import { saveEntscheidung, getEntscheidung } from '../../src/data/entscheidungen.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { timestamp } from '../../src/utils/dates.js';
let root: string;
const mandant: Mandant = { id: 'M-2024-0001', name: 'Test GmbH', rechtsform: 'GmbH', ansprechpartner: 'Test', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: 'Test', kategorie: 'GmbH', branchen_code: '', aktiv: true, ai_features_aktiv: false, notizen: '' };
const note = (titel = 'Gleicher Titel'): Notiz => ({ id: uuid(), mandant_id: mandant.id, typ: 'notiz', titel, erstellt: timestamp(), geaendert: timestamp(), autor: 'Test', tags: ['prüfung'], ai_zusammenfassung: '', ai_folgeaktionen: [], ai_verarbeitet: false, inhalt: 'Mehrzeilig\nmit Umlauten: äöü und § 6.\n' });
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'erna-test-')); vi.stubEnv('ERNA_DATA_PATH', root); await ensureDataDirectory(); });
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
describe('Atomarer Datei-Layer', () => {
  it('schreibt gültiges JSON ohne temporäre Reste', async () => { const file = dataPath('test.json'); await writeJson(file, { a: 1 }); expect(await readJson(file)).toEqual({ a: 1 }); expect((await readdir(root)).filter(f => f.endsWith('.tmp'))).toEqual([]); });
  it('schließt Pfadtraversierung aus', () => { expect(() => dataPath('..', 'fremd')).toThrow(); expect(() => dataPath('/etc/passwd')).toThrow(); });
  it('verweigert Schreibzugriff über einen Symlink aus dem Datenordner', async () => { const outside = await mkdtemp(path.join(os.tmpdir(), 'erna-outside-')); try { await symlink(outside, path.join(root, 'flucht')); await expect(writeJson(path.join(root, 'flucht', 'test.json'), {})).rejects.toThrow(); expect(await readdir(outside)).toEqual([]); } finally { await rm(outside, { recursive: true, force: true }); } });
  it('liest und speichert Konfiguration ohne Schlüssel', async () => { expect(await loadConfig()).toBeNull(); await saveConfig(structuredClone(DEFAULT_CONFIG)); expect(await loadConfig()).toEqual(DEFAULT_CONFIG); expect(await readFile(dataPath('erna-config.json'), 'utf8')).not.toContain('sk-ant'); });
  it('überschreibt beschädigte Konfiguration nicht stillschweigend', async () => { await writeFile(dataPath('erna-config.json'), '{kaputt'); await expect(loadConfig()).rejects.toThrow(); expect(await readFile(dataPath('erna-config.json'), 'utf8')).toBe('{kaputt'); });
});
describe('Mandanten, Notizen und Entscheidungen', () => {
  it('speichert Profile und Markdown verlustfrei', async () => { await saveMandant(mandant); expect(await listMandanten()).toEqual([mandant]); const n = note(); await saveNotiz(n); expect((await getNotiz(mandant.id, n.id)).inhalt.trim()).toBe(n.inhalt.trim()); });
  it('bewahrt identische Titel und stabile IDs beim Bearbeiten', async () => { await saveMandant(mandant); const a = note(), b = note(); await Promise.all([saveNotiz(a), saveNotiz(b)]); expect(await listNotizen(mandant.id)).toHaveLength(2); await saveNotiz({ ...a, titel: 'Neuer Titel', inhalt: 'Bearbeitet' }); expect((await getNotiz(mandant.id, b.id)).inhalt.trim()).toBe(b.inhalt.trim()); expect(await listNotizen(mandant.id)).toHaveLength(2); await deleteNotiz(mandant.id, a.id); expect(await listNotizen(mandant.id)).toHaveLength(1); });
  it('überspringt eine defekte Datei, bewahrt lesbare Einträge', async () => { await saveMandant(mandant); await saveNotiz(note()); const dir = dataPath('mandanten', mandant.id, 'notizen'); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'kaputt.md'), '---\n[ungültig YAML\n---\n'); vi.spyOn(console, 'error').mockImplementation(() => undefined); vi.spyOn(console, 'warn').mockImplementation(() => undefined); expect(await listNotizen(mandant.id)).toHaveLength(1); });
  it('hängt einen Audit-Trail bei Statusänderung an', async () => { await saveMandant(mandant); const e: Entscheidung = { id: uuid(), mandant_id: mandant.id, typ: 'entscheidung', titel: 'Entscheidung', erstellt: timestamp(), geaendert: timestamp(), entschieden_von: 'Test', status: 'entwurf', tags: [], audit_trail: [], inhalt: '## Sachverhalt\nTest' }; const created = await saveEntscheidung(e); expect(created.audit_trail.length).toBeGreaterThan(0); await saveEntscheidung({ ...created, status: 'final', audit_trail: [] }); const updated = await getEntscheidung(mandant.id, e.id); expect(updated.audit_trail.length).toBeGreaterThan(created.audit_trail.length); expect(updated.audit_trail[0]).toEqual(created.audit_trail[0]); });
});
describe('Validierung und Datenwahrung', () => {
  it('verweigert Dokumente mit manipulierten IDs', async () => { await saveMandant(mandant); await expect(saveNotiz({ ...note(), mandant_id: '../fremd' })).rejects.toThrow(); await expect(saveNotiz({ ...note(), id: '../fremd' })).rejects.toThrow(); });
  it('verweigert unmögliche Termine', async () => { const { saveTermin } = await import('../../src/data/termine.js'); await saveMandant(mandant); await expect(saveTermin({ id: uuid(), mandant_id: mandant.id, typ: 'frist', titel: 'Frist', datum: '2026-02-30', uhrzeit: null, prioritaet: 'hoch', erledigt: false, erstellt: timestamp(), quelle_notiz_id: null, ai_erkannt: false, notiz: '' })).rejects.toThrow(); });
  it('löscht keinen Mandanten mit bestehenden Dokumenten', async () => { const { deleteMandant } = await import('../../src/data/mandanten.js'); await saveMandant(mandant); const n = note(); await saveNotiz(n); await expect(deleteMandant(mandant.id)).rejects.toThrow(); expect((await getNotiz(mandant.id, n.id)).id).toBe(n.id); expect(await listMandanten()).toHaveLength(1); });
});
it('verhindert, dass eine verspätete KI-Antwort neue Bearbeitungen überschreibt', async () => {
  const { updateNotizIfUnchanged } = await import('../../src/data/notizen.js');
  await saveMandant(mandant);
  const original = await saveNotiz(note());
  await saveNotiz({ ...original, inhalt: 'Inzwischen manuell korrigiert' });
  await expect(updateNotizIfUnchanged(original, { ai_zusammenfassung: 'Veraltet', ai_verarbeitet: true })).rejects.toThrow();
  const current = await getNotiz(mandant.id, original.id);
  expect(current.inhalt.trim()).toBe('Inzwischen manuell korrigiert');
  expect(current.ai_verarbeitet).toBe(false);
});
