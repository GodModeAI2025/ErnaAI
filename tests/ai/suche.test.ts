import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Mandant, Notiz } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { dataPath, ensureDataDirectory, saveConfig, writeText } from '../../src/data/filesystem.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { markdownText, saveNotiz } from '../../src/data/notizen.js';
import * as client from '../../src/ai/client.js';
import * as context from '../../src/ai/context.js';
import { sucheMitAi, volltextSuche } from '../../src/ai/suche.js';

let root: string;
const profile: Mandant = { id: 'M-2024-0001', name: 'Huber GmbH', rechtsform: 'GmbH', ansprechpartner: 'Test', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: '', kategorie: 'GmbH', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '' };
const note = (mandantId = profile.id, inhalt = 'Rückfrage zu Belegen.'): Notiz => ({ id: uuid(), mandant_id: mandantId, typ: 'notiz', titel: 'Notiztitel', erstellt: '2026-09-04T12:00:00+02:00', geaendert: '2026-09-04T12:00:00+02:00', autor: 'Test', tags: [], ai_zusammenfassung: '', ai_folgeaktionen: [], ai_verarbeitet: false, inhalt });
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'erna-search-'));
  vi.stubEnv('ERNA_DATA_PATH', root);
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-kein-echter-schluessel');
  await ensureDataDirectory();
  await saveMandant({ ...profile });
  await saveMandant({ ...profile, id: 'M-2024-0002', name: 'Andere Akte' });
  const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true; await saveConfig(config);
  vi.spyOn(client, 'callClaude').mockImplementation(async (_system, _user, onUpdate) => { onUpdate?.('Antwort'); onUpdate?.('Antwort mit Quelle'); return 'Antwort mit Quelle'; });
});
const userText = (call = 0): string => {
  const user = vi.mocked(client.callClaude).mock.calls[call]?.[1];
  return typeof user === 'string' ? user : (user ?? []).map(block => block.text).join('\n');
};
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });

describe('Lokale Volltextsuche', () => {
  it('arbeitet ohne API-Key und ohne KI-Freigabe mit vollständigen Quellenangaben', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await saveConfig(structuredClone(DEFAULT_CONFIG));
    await saveMandant({ ...profile, ai_features_aktiv: false });
    const original = await saveNotiz(note());
    const results = await volltextSuche(profile.id, 'RÜCKFRAGE');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: original.id, typ: 'notiz', titel: original.titel, datum: original.geaendert });
    expect(results[0]?.pfad).toMatch(/^mandanten\/M-2024-0001\/notizen\/.+\.md$/u);
    expect(results[0]?.pfad).not.toContain(root);
    expect(results[0]?.auszug).toContain('Rückfrage');
    expect(client.callClaude).not.toHaveBeenCalled();
  });
  it('sucht ausschließlich in der ausgewählten Mandantenakte', async () => {
    await saveNotiz(note('M-2024-0002', 'Fremder Geheimtext'));
    expect(await volltextSuche(profile.id, 'Geheimtext')).toEqual([]);
    expect(await volltextSuche('M-2024-0002', 'Geheimtext')).toHaveLength(1);
    expect(await volltextSuche(profile.id, '  ')).toEqual([]);
  });
  it('erkennt Profile und behandelt Suchzeichen wörtlich', async () => {
    await saveNotiz(note(profile.id, 'Prüfung [A+B] ist offen.'));
    expect((await volltextSuche(profile.id, 'hUbEr'))[0]).toMatchObject({ typ: 'profil', titel: 'Huber GmbH', id: profile.id });
    expect(await volltextSuche(profile.id, '[A+B]')).toHaveLength(1);
  });
});

describe('KI-Suche', () => {
  it('streamt kumulative Antworten und übergibt 90 Sekunden sowie den tatsächlichen Mandantenbereich', async () => {
    const original = await saveNotiz(note()), update = vi.fn();
    const result = await sucheMitAi(profile.id, 'Welche Belege fehlen?', update);
    expect(update.mock.calls.map(call => call[0])).toEqual(['Antwort', 'Antwort mit Quelle']);
    expect(result.antwort).toBe('Antwort mit Quelle');
    expect(result.ausgelassen).toBe(0);
    expect(result.quellen.map(source => source.id)).toContain(original.id);
    expect(vi.mocked(client.callClaude).mock.calls[0]?.[3]).toMatchObject({ timeoutMs: 90_000, mandantIds: [profile.id] });
    for (const source of result.quellen) expect(userText()).toContain(`=== DATEI: ${source.pfad} (${source.datum}) ===`);
  });
  it('stellt die Akte als cachebaren Block vor die wechselnde Suchanfrage', async () => {
    await saveNotiz(note());
    await sucheMitAi(profile.id, 'Erste Frage');
    await sucheMitAi(profile.id, 'Zweite Frage');
    const [first, second] = vi.mocked(client.callClaude).mock.calls.map(call => call[1]);
    if (typeof first === 'string' || typeof second === 'string' || !first || !second) throw new Error('Suchanfrage muss als Inhaltsblöcke übergeben werden.');
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    expect(first[0]?.text).toContain('KANZLEIAKTE:');
    expect(first[0]?.text).not.toContain('Erste Frage');
    expect(first[1]?.text).toContain('Suchanfrage: "Erste Frage"');
    expect(first[1]).not.toHaveProperty('cache_control');
    // Byte-identischer Präfix ist Voraussetzung für einen Cache-Treffer bei der Folgefrage.
    expect(second[0]).toEqual(first[0]);
    expect(second[1]?.text).toContain('Zweite Frage');
  });
  it('lädt mehr als 100 Dateien, solange das Textbudget ausreicht', async () => {
    await Promise.all(Array.from({ length: 105 }, async (_, index) => {
      const document = { ...note(), titel: `Quelle ${index}`, inhalt: `Information aus Quelle ${index}.` };
      await writeText(dataPath('mandanten', profile.id, 'notizen', `2026-09-04_quelle-${index}.md`), markdownText(document));
    }));
    const result = await sucheMitAi(profile.id, 'Alle Quellen');
    expect(result.quellen).toHaveLength(106);
    expect(result.ausgelassen).toBe(0);
    expect(userText()).toContain('quelle-104.md');
  });
  it('nennt bei Budgetüberschreitung ausschließlich tatsächlich übermittelte Dateien', async () => {
    const paths: string[] = [];
    await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const document = { ...note(), titel: `Große Quelle ${index}`, inhalt: 'Quelleninhalt ä😀 '.repeat(6000) };
      const relative = `mandanten/${profile.id}/notizen/2026-09-04_gross-${index}.md`;
      paths.push(relative);
      await writeText(dataPath(relative), markdownText(document));
    }));
    const result = await sucheMitAi(profile.id, 'Überblick');
    const prompt = userText();
    expect(result.ausgelassen).toBeGreaterThan(0);
    expect(prompt).toContain(`[${result.ausgelassen} Dateien ausgelassen]`);
    expect(prompt.match(/=== DATEI:/gu)).toHaveLength(result.quellen.length);
    for (const source of result.quellen) {
      expect(prompt).toContain(source.pfad);
      expect(Buffer.byteLength(source.inhalt)).toBeLessThanOrEqual(50000);
    }
    for (const omitted of paths.filter(file => !result.quellen.some(source => source.pfad === file))) expect(prompt).not.toContain(omitted);
  });
  it('sendet bei fehlender Zustimmung oder gesperrtem Mandanten keine Anfrage', async () => {
    await saveConfig(structuredClone(DEFAULT_CONFIG));
    await expect(sucheMitAi(profile.id, 'Frage')).rejects.toThrow('Datenschutzzustimmung');
    const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true; await saveConfig(config);
    await saveMandant({ ...profile, ai_features_aktiv: false });
    await expect(sucheMitAi(profile.id, 'Frage')).rejects.toThrow('deaktiviert');
    expect(client.callClaude).not.toHaveBeenCalled();
  });
  it('rechnet die Kontextvorbereitung auf das gesamte Zeitlimit an', async () => {
    vi.useFakeTimers();
    vi.spyOn(client, 'assertAiAllowed').mockResolvedValue({ ...structuredClone(DEFAULT_CONFIG), ai: { ...DEFAULT_CONFIG.ai, datenschutzAkzeptiert: true } });
    vi.spyOn(context, 'loadMandantContextBundle').mockImplementation(() => new Promise(() => undefined));
    const rejected = expect(sucheMitAi(profile.id, 'Frage', undefined, { timeoutMs: 100 })).rejects.toThrow('Zeitüberschreitung');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(client.callClaude).not.toHaveBeenCalled();
  });
});
