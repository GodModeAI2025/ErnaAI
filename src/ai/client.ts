import Anthropic from '@anthropic-ai/sdk';
import type { AiOptions, ErnaConfig } from '../app/types.js';
import { loadConfig } from '../data/filesystem.js';
import { getMandant } from '../data/mandanten.js';

export const MODEL = 'claude-opus-4-5';
export const MAX_TOKENS = 4096;

export function hasApiKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return Boolean(key && key !== 'sk-ant-...');
}

export class AiResponseError extends Error {
  constructor(message: string, public readonly rawText: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiResponseError';
  }
}

export async function assertAiAllowed(mandantIds: readonly string[]): Promise<ErnaConfig> {
  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');
  if (!Array.isArray(mandantIds) || !mandantIds.length) throw new Error('Für die KI-Anfrage muss mindestens ein Mandant ausdrücklich angegeben werden.');
  const config = await loadConfig();
  if (!config?.ai.aktiviert || !config.ai.datenschutzAkzeptiert) throw new Error('KI-Features sind deaktiviert oder die Datenschutzzustimmung fehlt.');
  for (const id of new Set(mandantIds)) {
    const mandant = await getMandant(id);
    if (!mandant.ai_features_aktiv) throw new Error(`KI-Features sind für Mandant ${id} deaktiviert.`);
  }
  return config;
}

export function assertAiActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('KI-Anfrage wurde abgebrochen.');
}

/** Eine Deadline umfasst Vorbereitung, sämtliche Versuche und den gesamten SSE-Stream.
 * Der SDK-eigene Timeout allein begrenzt nicht die Dauer eines bereits offenen Streams. */
export async function withAiDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, options: AiOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Das KI-Zeitlimit muss eine positive Anzahl Millisekunden sein.');
  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort(new Error('KI-Anfrage wurde abgebrochen.'));
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`Zeitüberschreitung: Claude hat innerhalb von ${timeoutMs / 1000} Sekunden nicht vollständig geantwortet.`)), timeoutMs);
  let rejectInterrupted: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectInterrupted, { once: true });
    if (controller.signal.aborted) rejectInterrupted();
  });
  try {
    return await Promise.race([Promise.resolve().then(() => { assertAiActive(controller.signal); return operation(controller.signal); }), interrupted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
    if (rejectInterrupted) controller.signal.removeEventListener('abort', rejectInterrupted);
  }
}

async function backoff(milliseconds: number, signal: AbortSignal): Promise<void> {
  assertAiActive(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    const abort = (): void => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string | Anthropic.TextBlockParam[],
  onUpdate?: (text: string) => void,
  options: AiOptions = {},
): Promise<string> {
  const mandantIds = [...(options.mandantIds ?? [])];
  return withAiDeadline(async signal => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Frisch vor jedem tatsächlichen Versand prüfen, auch nach einem Backoff.
      const config = await assertAiAllowed(mandantIds);
      assertAiActive(signal);
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 0 });
      const model = options.model?.trim() || process.env.ERNA_AI_MODEL?.trim() || config.ai.model.trim() || MODEL;
      let accumulated = '';
      if (attempt > 1) onUpdate?.('');
      try {
        const stream = client.messages.stream({ model, max_tokens: MAX_TOKENS, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }, { signal, maxRetries: 0 });
        const update = (delta: string): void => {
          if (signal.aborted) return;
          accumulated += delta;
          onUpdate?.(accumulated);
        };
        const abort = (): void => { stream.off('text', update); stream.abort(); };
        stream.on('text', update);
        signal.addEventListener('abort', abort, { once: true });
        try {
          const message = await stream.finalMessage();
          assertAiActive(signal);
          const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
          if (message.stop_reason === 'max_tokens') throw new AiResponseError('Claude-Antwort wurde wegen des Ausgabelimits abgeschnitten.', text);
          if (message.stop_reason === 'model_context_window_exceeded') throw new AiResponseError('Claude-Antwort wurde wegen des Kontextlimits nicht vollständig abgeschlossen.', text);
          if (message.stop_reason !== 'end_turn' || !text.trim()) throw new AiResponseError('Claude hat keine vollständig abgeschlossene Textantwort geliefert.', text);
          if (text !== accumulated) onUpdate?.(text);
          return text;
        } finally {
          signal.removeEventListener('abort', abort);
          stream.off('text', update);
        }
      } catch (error) {
        assertAiActive(signal);
        if (error instanceof AiResponseError) throw error;
        if (attempt === 3) {
          const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? ` (HTTP ${error.status})` : '';
          throw new Error(`Claude API konnte die Anfrage nach 3 Versuchen nicht abschließen${status}.`, { cause: error });
        }
        await backoff(1000 * 2 ** (attempt - 1), signal);
      }
    }
    throw new Error('Claude API konnte die Anfrage nicht abschließen.');
  }, options);
}
