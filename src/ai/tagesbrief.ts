import type { AiOptions } from '../app/types.js';
import { listMandanten } from '../data/mandanten.js';
import { listTermine } from '../data/termine.js';
import { displayDate, today } from '../utils/dates.js';
import { assertAiActive, assertAiAllowed, callClaude, withAiDeadline } from './client.js';
import { PROMPTS } from './prompts.js';

export async function erstelleTagesbrief(onUpdate?: (text: string) => void, options: AiOptions = {}): Promise<string> {
  return withAiDeadline(async signal => {
    const datum = displayDate(today());
    const local = (hinweis: string): string => {
      assertAiActive(signal);
      const text = PROMPTS.TAGESBRIEF_LOKAL(datum, hinweis);
      onUpdate?.(text);
      return text;
    };
    const active = (await listMandanten()).filter(mandant => mandant.aktiv);
    if (!active.length) return local('Es sind keine aktiven Mandanten vorhanden.');
    const allowed = active.filter(mandant => mandant.ai_features_aktiv);
    if (!allowed.length) return local('Für keinen aktiven Mandanten sind KI-Features freigegeben.');
    const records = (await Promise.all(allowed.map(async mandant =>
      (await listTermine(mandant.id)).filter(termin => !termin.erledigt).map(termin => ({ ...termin, mandant_name: mandant.name })),
    ))).flat().sort((a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit ?? '').localeCompare(b.uhrzeit ?? ''));
    if (!records.length) return local('Es sind keine offenen Termine oder Fristen für die freigegebenen aktiven Mandanten erfasst.');
    const mandantIds = [...new Set(records.map(termin => termin.mandant_id))];
    await assertAiAllowed(mandantIds);
    assertAiActive(signal);
    const termine = JSON.stringify(records.filter(termin => termin.typ !== 'frist'), null, 2);
    const fristen = JSON.stringify(records.filter(termin => termin.typ === 'frist'), null, 2);
    const update = (text: string): void => { if (!signal.aborted) onUpdate?.(text); };
    const result = await callClaude(PROMPTS.TAGESBRIEF_SYSTEM, PROMPTS.TAGESBRIEF_USER(datum, termine, fristen), update, { ...options, timeoutMs: options.timeoutMs ?? 60_000, signal, mandantIds });
    assertAiActive(signal);
    return result;
  }, options);
}
