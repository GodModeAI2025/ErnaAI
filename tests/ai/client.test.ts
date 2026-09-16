import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mandant } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import * as filesystem from '../../src/data/filesystem.js';
import * as mandanten from '../../src/data/mandanten.js';
import { AiResponseError, assertAiAllowed, callClaude, hasApiKey, MODEL } from '../../src/ai/client.js';

const sdk = vi.hoisted(() => ({ stream: vi.fn(), construct: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  messages = { stream: sdk.stream };
  constructor(options: unknown) { sdk.construct(options); }
} }));
type Listener = (delta: string, snapshot: string) => void;
class FakeStream {
  listeners = new Set<Listener>();
  abort = vi.fn();
  on(_event: string, listener: Listener): this { this.listeners.add(listener); return this; }
  off(_event: string, listener: Listener): this { this.listeners.delete(listener); return this; }
  emit(delta: string, snapshot = delta): void { for (const listener of this.listeners) listener(delta, snapshot); }
  finalMessage = vi.fn(async (): Promise<{ stop_reason: string | null; content: { type: string; text: string }[] }> => {
    this.emit('Erster Text', 'Erster Text');
    this.emit(' und zweiter Text', ' und zweiter Text');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Erster Text und zweiter Text' }] };
  });
}
const profile: Mandant = { id: 'M-2024-0001', name: 'Test', rechtsform: '', ansprechpartner: '', telefon: '', email: '', steuer_id: '', finanzamt: '', wirtschaftsjahr_ende: '12-31', mandant_seit: '2024-01-01', bearbeiter: '', kategorie: '', branchen_code: '', aktiv: true, ai_features_aktiv: true, notizen: '' };
const options = { mandantIds: [profile.id] };
beforeEach(() => {
  sdk.stream.mockReset().mockImplementation(() => new FakeStream());
  sdk.construct.mockReset();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-kein-echter-schluessel');
  vi.stubEnv('ERNA_AI_MODEL', '');
  vi.spyOn(filesystem, 'loadConfig').mockResolvedValue({ ...structuredClone(DEFAULT_CONFIG), ai: { ...DEFAULT_CONFIG.ai, datenschutzAkzeptiert: true } });
  vi.spyOn(mandanten, 'getMandant').mockResolvedValue({ ...profile });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('Datenschutz vor jedem Versand', () => {
  it('meldet einen fehlenden Schlüssel exakt und initialisiert kein SDK', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(callClaude('System', 'Text', undefined, options)).rejects.toThrow('ANTHROPIC_API_KEY nicht gesetzt');
    expect(sdk.construct).not.toHaveBeenCalled();
  });
  it('behandelt den exakten Vorlagenschlüssel wie einen fehlenden Schlüssel', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '  sk-ant-...  ');
    expect(hasApiKey()).toBe(false);
    await expect(callClaude('System', 'Text', undefined, options)).rejects.toThrow('ANTHROPIC_API_KEY nicht gesetzt');
    expect(sdk.construct).not.toHaveBeenCalled();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-kein-echter-schluessel');
    expect(hasApiKey()).toBe(true);
  });
  it('verweigert unbestimmte Mandantenbereiche', async () => {
    await expect(callClaude('System', 'Text')).rejects.toThrow('Mandant ausdrücklich');
    expect(sdk.stream).not.toHaveBeenCalled();
  });
  it('verweigert fehlende Konfiguration und fehlende Zustimmung', async () => {
    vi.mocked(filesystem.loadConfig).mockResolvedValueOnce(null).mockResolvedValueOnce(structuredClone(DEFAULT_CONFIG));
    await expect(assertAiAllowed(options.mandantIds)).rejects.toThrow('Datenschutzzustimmung');
    await expect(callClaude('System', 'Text', undefined, options)).rejects.toThrow('Datenschutzzustimmung');
    expect(sdk.stream).not.toHaveBeenCalled();
  });
  it('verweigert eine Anfrage mit einem nicht freigegebenen Mandanten', async () => {
    vi.mocked(mandanten.getMandant).mockResolvedValueOnce({ ...profile }).mockResolvedValueOnce({ ...profile, id: 'M-2024-0002', ai_features_aktiv: false });
    await expect(callClaude('System', 'Text', undefined, { mandantIds: [profile.id, 'M-2024-0002'] })).rejects.toThrow('M-2024-0002');
    expect(sdk.stream).not.toHaveBeenCalled();
  });
  it('prüft die Zustimmung erneut nach dem ersten fehlgeschlagenen Versuch', async () => {
    vi.useFakeTimers();
    sdk.stream.mockImplementation(() => { throw new Error('Verbindungsfehler'); });
    const result = callClaude('System', 'Text', undefined, options);
    const rejected = expect(result).rejects.toThrow('Datenschutzzustimmung');
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(filesystem.loadConfig).mockResolvedValue(structuredClone(DEFAULT_CONFIG));
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(sdk.stream).toHaveBeenCalledTimes(1);
  });
});

describe('Streaming, Wiederholungen und Gesamtzeitlimit', () => {
  it('liefert vollständige Streaming-Zwischenstände und verwendet die Modellkonfiguration', async () => {
    const update = vi.fn();
    expect(await callClaude('System', 'Text', update, options)).toBe('Erster Text und zweiter Text');
    expect(update.mock.calls.map(call => call[0])).toEqual(['Erster Text', 'Erster Text und zweiter Text']);
    expect(sdk.stream.mock.calls[0]?.[0]).toMatchObject({ model: MODEL, max_tokens: 4096 });
    expect(sdk.construct.mock.calls[0]?.[0]).toMatchObject({ maxRetries: 0 });
  });
  it('reicht Inhaltsblöcke mit Cache-Markierung unverändert an die API weiter', async () => {
    const content = [{ type: 'text' as const, text: 'Akte', cache_control: { type: 'ephemeral' as const } }, { type: 'text' as const, text: 'Frage' }];
    await callClaude('System', content, undefined, options);
    expect(sdk.stream.mock.calls[0]?.[0]).toMatchObject({ messages: [{ role: 'user', content }] });
  });
  it('gibt einer Umgebungsvariablen Vorrang vor dem konfigurierten Modell', async () => {
    vi.stubEnv('ERNA_AI_MODEL', 'claude-sonnet-4-5');
    await callClaude('System', 'Text', undefined, options);
    expect(sdk.stream.mock.calls[0]?.[0]).toMatchObject({ model: 'claude-sonnet-4-5' });
  });
  it('versucht einen API-Fehler insgesamt dreimal mit exponentiellem Backoff', async () => {
    vi.useFakeTimers();
    sdk.stream.mockImplementation(() => { throw Object.assign(new Error('Serverfehler'), { status: 503 }); });
    const rejected = expect(callClaude('System', 'Text', undefined, options)).rejects.toThrow('3 Versuchen nicht abschließen (HTTP 503)');
    await vi.advanceTimersByTimeAsync(2999);
    expect(sdk.stream).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(sdk.stream).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bricht einen nach Teilantwort hängenden Stream nach insgesamt 60 Sekunden ab', async () => {
    vi.useFakeTimers();
    const stream = new FakeStream();
    stream.finalMessage.mockImplementation(async () => { stream.emit('Teilantwort'); return new Promise(() => undefined); });
    sdk.stream.mockReturnValue(stream);
    const update = vi.fn();
    const rejected = expect(callClaude('System', 'Text', update, options)).rejects.toThrow('Zeitüberschreitung');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(stream.abort).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('Teilantwort');
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(stream.abort).toHaveBeenCalledOnce();
    expect(sdk.stream.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(sdk.stream).toHaveBeenCalledOnce();
    stream.emit('verspätet');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('rechnet Retry-Wartezeit auf dieselbe Deadline an', async () => {
    vi.useFakeTimers();
    sdk.stream.mockImplementation(() => { throw new Error('Serverfehler'); });
    const rejected = expect(callClaude('System', 'Text', undefined, { ...options, timeoutMs: 1500 })).rejects.toThrow('Zeitüberschreitung');
    await vi.advanceTimersByTimeAsync(1500);
    await rejected;
    expect(sdk.stream).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('erlaubt das 90-Sekunden-Zeitlimit für spätere Suche', async () => {
    vi.useFakeTimers();
    const stream = new FakeStream();
    stream.finalMessage.mockImplementation(() => new Promise(() => undefined));
    sdk.stream.mockReturnValue(stream);
    const rejected = expect(callClaude('System', 'Text', undefined, { ...options, timeoutMs: 90_000 })).rejects.toThrow('90 Sekunden');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stream.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(stream.abort).toHaveBeenCalledOnce();
  });
  it('bricht bei Benutzersignal ab und sendet bei vorherigem Abbruch nichts', async () => {
    const controller = new AbortController(), stream = new FakeStream();
    stream.finalMessage.mockImplementation(() => new Promise(() => undefined));
    sdk.stream.mockReturnValue(stream);
    const rejected = expect(callClaude('System', 'Text', undefined, { ...options, signal: controller.signal })).rejects.toThrow('abgebrochen');
    await vi.waitFor(() => expect(sdk.stream).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(stream.abort).toHaveBeenCalledOnce();
    await expect(callClaude('System', 'Text', undefined, { ...options, signal: controller.signal })).rejects.toThrow('abgebrochen');
    expect(sdk.stream).toHaveBeenCalledOnce();
  });
  it('verwirft abgeschnittene Antworten mit zugänglichem Rohtext ohne Retry', async () => {
    const stream = new FakeStream();
    stream.finalMessage.mockResolvedValue({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Unvollständig' }] });
    sdk.stream.mockReturnValue(stream);
    const result = callClaude('System', 'Text', undefined, options);
    await expect(result).rejects.toBeInstanceOf(AiResponseError);
    await expect(result).rejects.toMatchObject({ rawText: 'Unvollständig' });
    expect(sdk.stream).toHaveBeenCalledOnce();
  });
  it.each(['model_context_window_exceeded', 'pause_turn', 'tool_use', 'stop_sequence', null])('akzeptiert den unvollständigen Endzustand %s nicht als Antwort', async stop_reason => {
    const stream = new FakeStream();
    stream.finalMessage.mockResolvedValue({ stop_reason, content: [{ type: 'text', text: 'Nur eine Teilantwort' }] });
    sdk.stream.mockReturnValue(stream);
    const result = callClaude('System', 'Text', undefined, options);
    await expect(result).rejects.toBeInstanceOf(AiResponseError);
    await expect(result).rejects.toMatchObject({ rawText: 'Nur eine Teilantwort' });
    expect(sdk.stream).toHaveBeenCalledOnce();
  });
});
