import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entscheidung, ErkannteFrist, Mandant, Notiz, Termin } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import * as filesystem from '../../src/data/filesystem.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { getNotiz, markdownText, readRecords, saveNotiz, updateNotizIfUnchanged, validateNotiz } from '../../src/data/notizen.js';
import { getEntscheidung, saveEntscheidung } from '../../src/data/entscheidungen.js';
import { commitAiAnalysis, listTermine, saveTermin } from '../../src/data/termine.js';
import { timestamp } from '../../src/utils/dates.js';

let root: string;
const mandant: Mandant = {
  id: 'M-2024-0001', name: 'Test GmbH', rechtsform: 'GmbH', ansprechpartner: 'Test', telefon: '', email: '',
  steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: 'Test',
  kategorie: 'GmbH', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '',
};
const metadata = { tags: ['ki'], ai_zusammenfassung: 'Geprüfte Zusammenfassung', ai_folgeaktionen: ['Belege prüfen'], ai_verarbeitet: true };
const deadline = (overrides: Partial<ErkannteFrist> = {}): ErkannteFrist => ({
  titel: 'Belege prüfen', datum: '2026-09-10', unsicher: true, prioritaet: 'hoch', typ: 'frist',
  original_text: 'Belege bis 10.09.2026 prüfen.', begruendung: 'Datum ausdrücklich im Text genannt.', ...overrides,
});
const note = (): Notiz => ({
  id: uuid(), mandant_id: mandant.id, typ: 'notiz', titel: 'Telefonat', erstellt: timestamp(), geaendert: timestamp(),
  autor: 'Test', tags: ['original'], ai_zusammenfassung: '', ai_folgeaktionen: [], ai_verarbeitet: false,
  inhalt: '\nOriginaltext bleibt erhalten.\nZweite Zeile mit äöü.\n',
});
async function noteFile(n: Notiz): Promise<string> {
  const entry = (await readRecords(mandant.id, 'notizen', '.md', validateNotiz)).find(item => item.value.id === n.id);
  if (!entry) throw new Error('Testnotiz fehlt.');
  return entry.file;
}
async function manualTermin(overrides: Partial<Termin> = {}): Promise<Termin> {
  return saveTermin({ id: uuid(), mandant_id: mandant.id, typ: 'frist', titel: 'Belege prüfen', datum: '2026-09-10',
    uhrzeit: null, prioritaet: 'mittel', erledigt: false, erstellt: timestamp(), quelle_notiz_id: null,
    ai_erkannt: false, notiz: 'Manuell angelegt; unverändert erhalten.', ...overrides });
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'erna-ai-commit-'));
  vi.stubEnv('ERNA_DATA_PATH', root);
  await filesystem.ensureDataDirectory();
  await saveMandant({ ...mandant });
  const config = structuredClone(DEFAULT_CONFIG);
  config.ai.datenschutzAkzeptiert = true;
  await filesystem.saveConfig(config);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('Gemeinsame Übernahme von KI-Notiz und Fristen', () => {
  it('erhält den Notiztext und schreibt Metadaten sowie nachvollziehbare Fristen', async () => {
    const original = await saveNotiz(note());
    const result = await commitAiAnalysis(original, metadata, [deadline()]);
    expect(result.skipped).toBe(0);
    expect(result.notiz).toMatchObject({ ...metadata, inhalt: original.inhalt, id: original.id, autor: original.autor });
    expect(result.termine).toHaveLength(1);
    expect(result.termine[0]).toMatchObject({ mandant_id: mandant.id, quelle_notiz_id: original.id, unsicher: true, ai_erkannt: true, datum: '2026-09-10' });
    expect(result.termine[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(result.termine[0]?.notiz).toContain(deadline().original_text);
    expect(result.termine[0]?.notiz).toContain(deadline().begruendung);
    expect(await getNotiz(mandant.id, original.id)).toEqual(result.notiz);
    expect(await listTermine(mandant.id)).toEqual(result.termine);
  });

  it('überspringt Fristen ohne auflösbares Datum', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original), before = await readFile(file);
    const result = await commitAiAnalysis(original, null, [deadline({ datum: null })]);
    expect(result).toEqual({ termine: [], skipped: 1 });
    expect(await listTermine(mandant.id)).toEqual([]);
    expect(await readFile(file)).toEqual(before);
  });

  it.each(['2026-09-09', '2026-09-10', '2026-09-11'])('überspringt einen gleichen Titel am %s innerhalb ±1 Tag', async datum => {
    const original = await saveNotiz(note()), existing = await manualTermin({ erledigt: true });
    const result = await commitAiAnalysis(original, null, [deadline({ titel: '  BELEGE   PRÜFEN  ', datum })]);
    expect(result).toEqual({ termine: [], skipped: 1 });
    expect(await listTermine(mandant.id)).toEqual([existing]);
  });

  it('erlaubt gleiche Titel bei zwei Tagen Abstand und andere Titel am selben Tag', async () => {
    const original = await saveNotiz(note());
    await manualTermin();
    const result = await commitAiAnalysis(original, null, [deadline({ datum: '2026-09-12' }), deadline({ titel: 'Mandant anrufen' })]);
    expect(result.termine).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it('verhindert Duplikate innerhalb derselben Antwort und paralleler Übernahmen', async () => {
    const original = await saveNotiz(note());
    const results = await Promise.all([
      commitAiAnalysis(original, null, [deadline(), deadline({ datum: '2026-09-11' })]),
      commitAiAnalysis(original, null, [deadline()]),
    ]);
    expect(results.flatMap(result => result.termine)).toHaveLength(1);
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(2);
    expect(await listTermine(mandant.id)).toHaveLength(1);
  });

  it('bewahrt verschiedene Titel mit identischem Dateinamen-Slug', async () => {
    const original = await saveNotiz(note());
    const result = await commitAiAnalysis(original, null, [deadline({ titel: 'Rückfrage!' }), deadline({ titel: 'Rückfrage?' })]);
    expect(result.termine).toHaveLength(2);
    expect(await listTermine(mandant.id)).toHaveLength(2);
    expect(await readdir(filesystem.dataPath('mandanten', mandant.id, 'termine'))).toHaveLength(2);
  });

  it('prüft alle Fristen und Metadaten vor dem ersten Schreibvorgang', async () => {
    const original = await saveNotiz(note());
    await expect(commitAiAnalysis(original, metadata, [deadline(), deadline({ datum: '2026-02-30' })])).rejects.toThrow('Ungültige erkannte Frist');
    await expect(commitAiAnalysis(original, { ...metadata, inhalt: 'Manipuliert' } as typeof metadata, [deadline()])).rejects.toThrow('ausschließlich');
    expect(await getNotiz(mandant.id, original.id)).toEqual(original);
    expect(await listTermine(mandant.id)).toEqual([]);
  });

  it('verwendet für eine Entscheidung eine Quellenangabe ohne falsche Notiz-ID', async () => {
    const e: Entscheidung = { id: uuid(), mandant_id: mandant.id, typ: 'entscheidung', titel: 'Dokumentation', erstellt: timestamp(), geaendert: timestamp(), entschieden_von: 'Test', status: 'entwurf', tags: [], audit_trail: [], inhalt: '## Entscheidung\nPrüfung vereinbart.\n' };
    const original = await saveEntscheidung(e);
    const result = await commitAiAnalysis(original, null, [deadline()]);
    expect(result.notiz).toBeUndefined();
    expect(result.termine[0]?.quelle_notiz_id).toBeNull();
    expect(result.termine[0]?.notiz).toContain(`Entscheidung „${original.titel}“ (${original.id})`);
    expect(await getEntscheidung(mandant.id, original.id)).toEqual(original);
    await expect(commitAiAnalysis(original, metadata, [])).rejects.toThrow('keiner Entscheidung');
  });
});

describe('Konflikte und Datenschutz', () => {
  it('schreibt nach einem Abbruch während der Sperrwartezeit keine Ergebnisse', async () => {
    const original = await saveNotiz(note()), controller = new AbortController();
    let entered: () => void = () => undefined, release: () => void = () => undefined;
    const lockEntered = new Promise<void>(resolve => { entered = resolve; });
    const blocker = filesystem.withDataLock(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await lockEntered;
    const rejected = expect(commitAiAnalysis(original, metadata, [deadline()], controller.signal)).rejects.toThrow('abgebrochen');
    controller.abort();
    release();
    await blocker;
    await rejected;
    expect(await getNotiz(mandant.id, original.id)).toEqual(original);
    expect(await listTermine(mandant.id)).toEqual([]);
  });
  it('verwirft eine Antwort nach einer manuellen Textänderung', async () => {
    const original = await saveNotiz(note());
    const changed = await saveNotiz({ ...original, inhalt: 'Manuell korrigiert.' });
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('inzwischen geändert');
    expect(await getNotiz(mandant.id, original.id)).toEqual(changed);
    expect(await listTermine(mandant.id)).toEqual([]);
  });

  it('erkennt auch geänderte Tags bei identischem Sekunden-Zeitstempel', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original);
    const changed = { ...original, tags: ['manuell geändert'] };
    await filesystem.writeText(file, markdownText(changed));
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('inzwischen geändert');
    await expect(updateNotizIfUnchanged(original, metadata)).rejects.toThrow('inzwischen geändert');
    expect(await getNotiz(mandant.id, original.id)).toEqual(changed);
    expect(await listTermine(mandant.id)).toEqual([]);
  });

  it.each(['zustimmung', 'global', 'mandant', 'konfiguration'] as const)('übernimmt nach Entzug der Freigabe (%s) keine Änderungen', async scope => {
    const original = await saveNotiz(note());
    if (scope === 'mandant') await saveMandant({ ...mandant, ai_features_aktiv: false });
    else if (scope === 'konfiguration') await filesystem.removeFile(filesystem.dataPath('erna-config.json'));
    else {
      const config = await filesystem.loadConfig();
      if (!config) throw new Error('Testkonfiguration fehlt.');
      if (scope === 'zustimmung') config.ai.datenschutzAkzeptiert = false;
      else config.ai.aktiviert = false;
      await filesystem.saveConfig(config);
    }
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('Datenschutzzustimmung');
    expect(await getNotiz(mandant.id, original.id)).toEqual(original);
    expect(await listTermine(mandant.id)).toEqual([]);
  });
});

describe('Rücknahme bei Schreibfehlern', () => {
  it('entfernt nach einem Termin-Schreibfehler nur neue Dateien', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original), before = await readFile(file);
    const existing = await manualTermin({ titel: 'Bestandsfrist' });
    const write = filesystem.writeJson;
    let attempts = 0;
    vi.spyOn(filesystem, 'writeJson').mockImplementation(async (target, value) => {
      if (++attempts === 2) throw new Error('Simulierter Schreibfehler');
      await write(target, value);
    });
    await expect(commitAiAnalysis(original, metadata, [deadline(), deadline({ titel: 'Andere Frist' })])).rejects.toThrow('zurückgenommen');
    expect(await readFile(file)).toEqual(before);
    expect(await listTermine(mandant.id)).toEqual([existing]);
    expect(await readdir(filesystem.dataPath('mandanten', mandant.id, 'termine'))).toHaveLength(1);
  });

  it('entfernt auch eine neue Termindatei, wenn der Fehler erst nach dem Schreiben gemeldet wird', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original), before = await readFile(file);
    const write = filesystem.writeJson;
    vi.spyOn(filesystem, 'writeJson').mockImplementation(async (target, value) => {
      await write(target, value);
      throw new Error('Fehler nach Terminübernahme');
    });
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('zurückgenommen');
    expect(await readFile(file)).toEqual(before);
    expect(await listTermine(mandant.id)).toEqual([]);
  });

  it('stellt die ursprüngliche Notiz bytegenau wieder her und bewahrt Bestandstermine', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original), before = await readFile(file);
    const existing = await manualTermin({ titel: 'Bestandsfrist' });
    const write = filesystem.writeText;
    let failed = false;
    vi.spyOn(filesystem, 'writeText').mockImplementation(async (target, value) => {
      await write(target, value);
      if (target === file && !failed) { failed = true; throw new Error('Fehler nach Notizübernahme'); }
    });
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('zurückgenommen');
    expect(failed).toBe(true);
    expect(await readFile(file)).toEqual(before);
    expect(await listTermine(mandant.id)).toEqual([existing]);
  });

  it('meldet eine unvollständige Rücknahme, wenn auch das Wiederherstellen scheitert', async () => {
    const original = await saveNotiz(note()), file = await noteFile(original);
    const write = filesystem.writeText;
    let attempts = 0;
    vi.spyOn(filesystem, 'writeText').mockImplementation(async (target, value) => {
      if (target !== file) return write(target, value);
      if (++attempts === 1) await write(target, value);
      throw new Error('Dateisystem nicht mehr beschreibbar');
    });
    await expect(commitAiAnalysis(original, metadata, [deadline()])).rejects.toThrow('Rücknahme unvollständig');
    expect(await listTermine(mandant.id)).toEqual([]);
  });
});
