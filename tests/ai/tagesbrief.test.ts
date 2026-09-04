import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Mandant, Termin } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { ensureDataDirectory, saveConfig } from '../../src/data/filesystem.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { saveTermin } from '../../src/data/termine.js';
import { displayDate, today } from '../../src/utils/dates.js';
import * as client from '../../src/ai/client.js';
import { erstelleTagesbrief } from '../../src/ai/tagesbrief.js';

let root: string;
const profile = (id = 'M-2024-0001', overrides: Partial<Mandant> = {}): Mandant => ({ id, name: id, rechtsform: '', ansprechpartner: '', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: '', kategorie: '', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '', ...overrides });
const appointment = (mandantId = 'M-2024-0001', overrides: Partial<Termin> = {}): Termin => ({ id: uuid(), mandant_id: mandantId, typ: 'termin', titel: 'Besprechung', datum: '2026-09-10', uhrzeit: '10:00', prioritaet: 'mittel', erledigt: false, erstellt: '2026-09-04T12:00:00+02:00', quelle_notiz_id: null, ai_erkannt: false, notiz: '', ...overrides });
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'erna-brief-'));
  vi.stubEnv('ERNA_DATA_PATH', root); vi.stubEnv('ANTHROPIC_API_KEY', 'test-kein-echter-schluessel');
  await ensureDataDirectory();
  const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true; await saveConfig(config);
  vi.spyOn(client, 'callClaude').mockImplementation(async (_system, _user, onUpdate) => { onUpdate?.('Heute'); onUpdate?.('Heute: Besprechung vorbereiten.'); return 'Heute: Besprechung vorbereiten.'; });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });

describe('Lokale Leerübersichten', () => {
  it('liefert ohne Mandanten und ohne Schlüssel eine lokale Information', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const update = vi.fn(), result = await erstelleTagesbrief(update);
    expect(result).toContain('keine aktiven Mandanten'); expect(result).toContain(displayDate(today()));
    expect(update).toHaveBeenCalledWith(result); expect(client.callClaude).not.toHaveBeenCalled();
  });
  it('meldet fehlende Profilfreigaben und leere Terminlisten ohne API', async () => {
    await saveMandant(profile('M-2024-0001', { ai_features_aktiv: false }));
    expect(await erstelleTagesbrief()).toContain('keinen aktiven Mandanten');
    await saveMandant(profile());
    await saveTermin(appointment(undefined, { erledigt: true }));
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await erstelleTagesbrief()).toContain('keine offenen Termine');
    expect(client.callClaude).not.toHaveBeenCalled();
  });
});

describe('Globaler Tagesbrief', () => {
  it('berücksichtigt nur offene Termine aktiver freigegebener Mandanten', async () => {
    await saveMandant(profile('M-2024-0001', { ai_features_aktiv: false, name: 'Nicht freigegeben' }));
    await saveMandant(profile('M-2024-0002', { name: 'Freigegebener Mandant' }));
    await saveMandant(profile('M-2024-0003', { aktiv: false, name: 'Inaktiver Mandant' }));
    await saveTermin(appointment('M-2024-0001', { titel: 'GEHEIMTITEL GESPERRT' }));
    await saveTermin(appointment('M-2024-0003', { titel: 'GEHEIMTITEL INAKTIV' }));
    await saveTermin(appointment('M-2024-0002', { titel: 'ERLEDIGTER TITEL', erledigt: true }));
    await saveTermin(appointment('M-2024-0002', { titel: 'OFFENE BESPRECHUNG' }));
    await saveTermin(appointment('M-2024-0002', { titel: 'UNSICHERE FRIST', typ: 'frist', unsicher: true }));
    const update = vi.fn();
    expect(await erstelleTagesbrief(update)).toBe('Heute: Besprechung vorbereiten.');
    expect(update.mock.calls.map(call => call[0])).toEqual(['Heute', 'Heute: Besprechung vorbereiten.']);
    const prompt = String(vi.mocked(client.callClaude).mock.calls[0]?.[1]);
    expect(prompt).toContain('OFFENE BESPRECHUNG'); expect(prompt).toContain('UNSICHERE FRIST'); expect(prompt).toContain('"unsicher": true');
    expect(prompt).not.toContain('GEHEIMTITEL'); expect(prompt).not.toContain('ERLEDIGTER TITEL');
    expect(prompt).toContain(displayDate(today()));
    expect(vi.mocked(client.callClaude).mock.calls[0]?.[3]).toMatchObject({ timeoutMs: 60_000, mandantIds: ['M-2024-0002'] });
  });
  it('prüft globale Zustimmung und Schlüssel vor jedem tatsächlichen Versand', async () => {
    await saveMandant(profile()); await saveTermin(appointment());
    await saveConfig(structuredClone(DEFAULT_CONFIG));
    await expect(erstelleTagesbrief()).rejects.toThrow('Datenschutzzustimmung');
    const config = structuredClone(DEFAULT_CONFIG); config.ai.datenschutzAkzeptiert = true; await saveConfig(config);
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-...');
    await expect(erstelleTagesbrief()).rejects.toThrow('ANTHROPIC_API_KEY nicht gesetzt');
    expect(client.callClaude).not.toHaveBeenCalled();
  });
  it('gibt API-Fehler sichtbar an den Aufrufer weiter', async () => {
    await saveMandant(profile()); await saveTermin(appointment());
    vi.mocked(client.callClaude).mockRejectedValue(new Error('Claude API nicht erreichbar.'));
    await expect(erstelleTagesbrief()).rejects.toThrow('nicht erreichbar');
  });
  it('respektiert einen bereits erfolgten Benutzerabbruch', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(erstelleTagesbrief(undefined, { signal: controller.signal })).rejects.toThrow('abgebrochen');
    expect(client.callClaude).not.toHaveBeenCalled();
  });
});
