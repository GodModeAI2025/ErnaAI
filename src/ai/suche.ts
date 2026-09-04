import matter from 'gray-matter';
import type { AiOptions, Quelldatei, SuchTreffer } from '../app/types.js';
import { getMandant } from '../data/mandanten.js';
import { record, stringField } from '../utils/format.js';
import { assertAiActive, assertAiAllowed, callClaude, withAiDeadline } from './client.js';
import { loadMandantContextBundle, readMandantFiles } from './context.js';
import { PROMPTS } from './prompts.js';

const comparable = (text: string): string => text.normalize('NFKC').toLocaleLowerCase('de');

function sourceTitle(source: Quelldatei): string {
  const data = source.typ === 'notiz' || source.typ === 'entscheidung'
    ? record(matter(source.inhalt).data)
    : record(JSON.parse(source.inhalt) as unknown);
  return stringField(data, source.typ === 'profil' ? 'name' : 'titel');
}

export async function volltextSuche(mandantId: string, anfrage: string): Promise<SuchTreffer[]> {
  const query = comparable(anfrage.trim());
  if (!query) return [];
  const results: SuchTreffer[] = [];
  for (const source of await readMandantFiles(mandantId)) {
    const plainText = source.inhalt.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const index = comparable(plainText).indexOf(query);
    if (index < 0) continue;
    const from = Math.max(0, index - 60), to = Math.min(plainText.length, Math.max(index + query.length + 60, from + 180));
    const auszug = `${from > 0 ? '…' : ''}${plainText.slice(from, to)}${to < plainText.length ? '…' : ''}`;
    results.push({ pfad: source.pfad, datum: source.datum, titel: sourceTitle(source), auszug, id: source.id, typ: source.typ });
  }
  return results;
}

export async function sucheMitAi(
  mandantId: string,
  anfrage: string,
  onUpdate?: (text: string) => void,
  options: AiOptions = {},
): Promise<{ antwort: string; quellen: Quelldatei[]; ausgelassen: number }> {
  if (!anfrage.trim()) throw new Error('Bitte eine Suchanfrage eingeben.');
  const scopedOptions = { ...options, timeoutMs: options.timeoutMs ?? 90_000, mandantIds: [mandantId] };
  return withAiDeadline(async signal => {
    await assertAiAllowed([mandantId]);
    const [mandant, context] = await Promise.all([
      getMandant(mandantId),
      loadMandantContextBundle(mandantId, { maxFiles: Number.MAX_SAFE_INTEGER }),
    ]);
    assertAiActive(signal);
    const update = (text: string): void => { if (!signal.aborted) onUpdate?.(text); };
    const antwort = await callClaude(PROMPTS.SUCHE_SYSTEM(mandant.name), PROMPTS.SUCHE_USER(anfrage.trim(), context.text), update, { ...scopedOptions, signal });
    assertAiActive(signal);
    return { antwort, quellen: context.quellen, ausgelassen: context.ausgelassen };
  }, scopedOptions);
}
