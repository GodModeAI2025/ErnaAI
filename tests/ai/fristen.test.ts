import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Mandant, Notiz } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { saveConfig } from '../../src/data/filesystem.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { deleteNotiz, getNotiz, saveNotiz } from '../../src/data/notizen.js';
import { listTermine, saveTermin } from '../../src/data/termine.js';
import * as client from '../../src/ai/client.js';
import { erkenneFristen, parseFristen } from '../../src/ai/fristen.js';

const frist = { titel: 'Neue Prüffrist', datum: '2026-09-10', unsicher: false, prioritaet: 'hoch', typ: 'termin', original_text: 'Bis 10.09.2026', begruendung: 'Explizites Datum' };
const mandant: Mandant = { id: 'M-2024-0001', name: 'Testmandant', rechtsform: '', ansprechpartner: '', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: 'Test', kategorie: '', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '' };
const note = (): Notiz => ({ id: uuid(), mandant_id: 'M-2024-0001', typ: 'notiz', titel: 'Prüfanfrage', erstellt: '2024-11-15T12:00:00+01:00', geaendert: '2026-09-04T12:00:00+02:00', autor: 'Test', tags: [], ai_zusammenfassung: '', ai_folgeaktionen: [], ai_verarbeitet: false, inhalt: 'Bitte morgen prüfen.' });

describe('Fristenparser', () => {
  it('erhält gültige Datumswerte, echte Booleans und null', () => {
    const list = [frist, { ...frist, titel: 'Offen', datum: null, unsicher: true }];
    expect(parseFristen(JSON.stringify({ fristen: list }))).toEqual(list);
    expect(parseFristen('{"fristen":[]}')).toEqual([]);
  });
  it.each(['Ungültig', '[]', '{}', JSON.stringify({ fristen: [{ ...frist, datum: '2026-02-30' }] }), JSON.stringify({ fristen: [{ ...frist, datum: 'null' }] }), JSON.stringify({ fristen: [{ ...frist, unsicher: 'false' }] }), JSON.stringify({ fristen: [{ ...frist, typ: 'pflicht' }] })])('verwirft ungültige Antworten und bewahrt ihren Rohtext', raw => {
    try { parseFristen(raw); throw new Error('Fehler erwartet.'); }
    catch (error) { expect(error).toBeInstanceOf(client.AiResponseError); expect(error).toMatchObject({ rawText: raw }); }
  });
});

describe('Fristenerkennung', () => {
  let root: string | undefined;
  beforeEach(async () => {
    root = undefined;
    root = await mkdtemp(path.join(os.tmpdir(), 'erna-fristen-'));
    vi.stubEnv('ERNA_DATA_PATH', root);
    const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true;
    await saveConfig(config);
    await saveMandant(mandant);
    await saveTermin({ id: uuid(), mandant_id: mandant.id, typ: 'termin', titel: 'Vorhandener Termin', datum: '2026-10-01', uhrzeit: null, prioritaet: 'mittel', erledigt: false, erstellt: '2026-09-04T12:00:00+02:00', quelle_notiz_id: null, ai_erkannt: false, notiz: 'Unabhängiger Bestand bleibt erhalten.' });
    vi.spyOn(client, 'callClaude').mockResolvedValue(JSON.stringify({ fristen: [frist] }));
  });
  afterEach(async () => {
    // Sämtliche Analyse- und Mock-Schreibvorgänge werden in den Tests erwartet.
    try { if (root) await rm(root, { recursive: true, force: true }); }
    finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); root = undefined; }
  });

  it('verwendet das Ursprungsdatum alter Notizen als Referenzdatum', async () => {
    const original = await saveNotiz(note());
    await erkenneFristen(original);
    expect(vi.mocked(client.callClaude).mock.calls[0]?.[1]).toContain('Referenzdatum: 2024-11-15');
    expect(await getNotiz(original.mandant_id, original.id)).toEqual(original);
  });
  it('erzeugt keine null-Datumsdateien und keine Duplikate bei Wiederholung', async () => {
    const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
    vi.mocked(client.callClaude).mockResolvedValue(JSON.stringify({ fristen: [frist, { ...frist, datum: null }] }));
    const first = await erkenneFristen(original), second = await erkenneFristen(original);
    expect(first.termine).toHaveLength(1); expect(first.skipped).toBe(1);
    expect(second.termine).toEqual([]); expect(second.skipped).toBe(2);
    expect(await listTermine(original.mandant_id)).toHaveLength(before.length + 1);
  });
  it('übernimmt keine Frist, wenn die Quelle während der Anfrage gelöscht wurde', async () => {
    const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
    vi.mocked(client.callClaude).mockImplementation(async () => { await deleteNotiz(original.mandant_id, original.id); return JSON.stringify({ fristen: [frist] }); });
    await expect(erkenneFristen(original)).rejects.toThrow('gelöscht');
    expect(await listTermine(original.mandant_id)).toEqual(before);
  });
});
