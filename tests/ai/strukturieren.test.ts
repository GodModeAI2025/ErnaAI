import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Mandant, Notiz } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { saveConfig } from '../../src/data/filesystem.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { getNotiz, saveNotiz } from '../../src/data/notizen.js';
import { listTermine, saveTermin } from '../../src/data/termine.js';
import * as client from '../../src/ai/client.js';
import { parseStrukturierteNotiz, strukturierenNotiz, verarbeiteDokument } from '../../src/ai/strukturieren.js';

const analysis = { zusammenfassung: 'Mandant benötigt Belege. Rückruf vereinbart.', tags: ['belege'], erkannte_fristen: [{ titel: 'Neue Prüffrist', datum: '2026-09-10', original_text: 'Bis 10.09.2026' }], folgeaktionen: ['Belege prüfen'], prioritaet: 'hoch', kategorie: 'aufgabe' };
const mandant: Mandant = { id: 'M-2024-0001', name: 'Testmandant', rechtsform: '', ansprechpartner: '', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: 'Test', kategorie: '', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '' };
const note = (): Notiz => ({ id: uuid(), mandant_id: 'M-2024-0001', typ: 'notiz', titel: 'Prüfanfrage', erstellt: '2026-09-04T12:00:00+02:00', geaendert: '2026-09-04T12:00:00+02:00', autor: 'Test', tags: [], ai_zusammenfassung: '', ai_folgeaktionen: [], ai_verarbeitet: false, inhalt: 'Belege bis 10.09.2026 prüfen.' });

describe('Notizantwort validieren', () => {
  it('liest vollständige strukturierte Informationen und JSON-null', () => {
    expect(parseStrukturierteNotiz(JSON.stringify(analysis))).toEqual(analysis);
    const nullable = { ...analysis, erkannte_fristen: [{ ...analysis.erkannte_fristen[0], datum: null }] };
    expect(parseStrukturierteNotiz(JSON.stringify(nullable)).erkannte_fristen[0]?.datum).toBeNull();
  });
  it.each(['kein JSON', '```json\n{}\n```', '{}', JSON.stringify({ ...analysis, prioritaet: 'sofort' }), JSON.stringify({ ...analysis, erkannte_fristen: [{ ...analysis.erkannte_fristen[0], datum: '2026-02-30' }] })])('verwirft ungültige Antworten mit unverändertem Rohtext', raw => {
    try { parseStrukturierteNotiz(raw); throw new Error('Fehler erwartet.'); }
    catch (error) { expect(error).toBeInstanceOf(client.AiResponseError); expect(error).toMatchObject({ rawText: raw }); }
  });
});

describe('Dateibasierte Notizanalyse', () => {
  let root: string | undefined;
  beforeEach(async () => {
    root = undefined;
    root = await mkdtemp(path.join(os.tmpdir(), 'erna-structure-'));
    vi.stubEnv('ERNA_DATA_PATH', root);
    const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true;
    await saveConfig(config);
    await saveMandant(mandant);
    await saveTermin({ id: uuid(), mandant_id: mandant.id, typ: 'termin', titel: 'Vorhandener Termin', datum: '2026-10-01', uhrzeit: null, prioritaet: 'mittel', erledigt: false, erstellt: '2026-09-04T12:00:00+02:00', quelle_notiz_id: null, ai_erkannt: false, notiz: 'Unabhängiger Bestand bleibt erhalten.' });
    vi.spyOn(client, 'callClaude').mockResolvedValue(JSON.stringify(analysis));
  });
  afterEach(async () => {
    // Keine losgelösten Jobs: Auch absichtlich fehlschlagende Analysen werden erwartet.
    try { if (root) await rm(root, { recursive: true, force: true }); }
    finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); root = undefined; }
  });

  describe('Sichere Strukturierung', () => {
    it('übernimmt Metadaten und markiert abgeleitete Fristen als unsicher', async () => {
      const original = await saveNotiz(note());
      const result = await strukturierenNotiz(original);
      expect(result.notiz).toMatchObject({ inhalt: original.inhalt, ai_zusammenfassung: analysis.zusammenfassung, ai_folgeaktionen: analysis.folgeaktionen, ai_verarbeitet: true });
      expect(result.termine).toHaveLength(1);
      expect(result.termine[0]?.unsicher).toBe(true);
      expect(vi.mocked(client.callClaude).mock.calls[0]?.[3]).toMatchObject({ mandantIds: [original.mandant_id] });
    });
    it('lässt bei ungültiger API-Antwort Notiz und vorhandene Termine unverändert', async () => {
      const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
      vi.mocked(client.callClaude).mockResolvedValue('Ungültig');
      await expect(strukturierenNotiz(original)).rejects.toBeInstanceOf(client.AiResponseError);
      expect(await getNotiz(original.mandant_id, original.id)).toEqual(original);
      expect(await listTermine(original.mandant_id)).toEqual(before);
    });
    it('verwirft ein verspätetes Ergebnis nach manueller Bearbeitung', async () => {
      const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
      vi.mocked(client.callClaude).mockImplementation(async () => {
        await saveNotiz({ ...original, inhalt: 'Manuelle Korrektur' });
        return JSON.stringify(analysis);
      });
      await expect(strukturierenNotiz(original)).rejects.toThrow('inzwischen geändert');
      expect((await getNotiz(original.mandant_id, original.id)).inhalt).toBe('Manuelle Korrektur');
      expect(await listTermine(original.mandant_id)).toEqual(before);
    });
  });

  describe('Gemeinsame automatische Analyse', () => {
    it('übernimmt beim zweiten API-Fehler weder Metadaten noch Fristen', async () => {
      const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
      vi.mocked(client.callClaude).mockResolvedValueOnce(JSON.stringify(analysis)).mockRejectedValueOnce(new Error('Zweite Anfrage fehlgeschlagen'));
      await expect(verarbeiteDokument(original, { strukturieren: true, fristen: true })).rejects.toThrow('Zweite Anfrage');
      expect(await getNotiz(original.mandant_id, original.id)).toEqual(original);
      expect(await listTermine(original.mandant_id)).toEqual(before);
    });
    it('gibt bei Duplikaten den genaueren Fristenangaben Vorrang', async () => {
      const original = await saveNotiz(note());
      const recognized = { ...analysis.erkannte_fristen[0], typ: 'termin', prioritaet: 'niedrig', unsicher: false, begruendung: 'Fachlich bestimmtes Datum' };
      vi.mocked(client.callClaude).mockResolvedValueOnce(JSON.stringify(analysis)).mockResolvedValueOnce(JSON.stringify({ fristen: [recognized] }));
      const result = await verarbeiteDokument(original, { strukturieren: true, fristen: true });
      expect(result.notiz?.ai_verarbeitet).toBe(true);
      expect(result.termine).toHaveLength(1);
      expect(result.termine[0]).toMatchObject({ unsicher: false, typ: 'termin', prioritaet: 'niedrig' });
      expect(result.skipped).toBe(1);
    });
    it('legt bei deaktivierter automatischer Fristenerkennung keine Strukturierungsfristen an', async () => {
      const original = await saveNotiz(note()), before = await listTermine(original.mandant_id);
      const result = await verarbeiteDokument(original, { strukturieren: true, fristen: false });
      expect(result.notiz?.ai_verarbeitet).toBe(true);
      expect(result.termine).toEqual([]);
      expect(await listTermine(original.mandant_id)).toEqual(before);
      expect(client.callClaude).toHaveBeenCalledOnce();
    });
    it('führt bei deaktivierten Automatikfunktionen weder API-Aufruf noch Schreibzugriff aus', async () => {
      const original = await saveNotiz(note());
      expect(await verarbeiteDokument(original, { strukturieren: false, fristen: false })).toEqual({ termine: [], skipped: 0 });
      expect(client.callClaude).not.toHaveBeenCalled();
      expect(await getNotiz(original.mandant_id, original.id)).toEqual(original);
    });
  });
});
