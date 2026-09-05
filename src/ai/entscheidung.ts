import type { AiOptions } from '../app/types.js';
import { getMandant } from '../data/mandanten.js';
import { AiResponseError, callClaude, withAiDeadline } from './client.js';
import { PROMPTS } from './prompts.js';

const SECTIONS = ['Sachverhalt', 'Relevante Rechtsgrundlagen', 'Entscheidung', 'Begründung', 'Offene Punkte'];

function validateMarkdown(raw: string): string {
  const text = raw.trim();
  const headings = [...text.matchAll(/^## ([^\r\n]+)\r?$/gm)];
  if (!text.startsWith('## Sachverhalt\n') && !text.startsWith('## Sachverhalt\r\n') || headings.length !== SECTIONS.length || headings.some((heading, index) => heading[1]?.trim() !== SECTIONS[index])) {
    throw new AiResponseError('Claude hat nicht die vorgeschriebene Entscheidungsgliederung geliefert.', raw);
  }
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (!heading) continue;
    const from = (heading.index ?? 0) + heading[0].length;
    const to = headings[index + 1]?.index ?? text.length;
    if (!text.slice(from, to).trim()) throw new AiResponseError('Die KI-Entscheidungsdokumentation enthält einen leeren Abschnitt.', raw);
  }
  return text;
}

/** Liefert ausschließlich einen Entwurf für den Editor. Speicherung und Statuswahl
 * erfolgen nach fachlicher Prüfung durch den Benutzer. */
export async function dokumentiereEntscheidung(mandantId: string, freitext: string, options: AiOptions = {}): Promise<string> {
  if (!freitext.trim()) throw new Error('Bitte zuerst den Sachverhalt und die Entscheidung als Freitext eingeben.');
  return withAiDeadline(async signal => {
    const mandant = await getMandant(mandantId);
    const raw = await callClaude(PROMPTS.ENTSCHEIDUNG_STRUKTURIEREN_SYSTEM, PROMPTS.ENTSCHEIDUNG_STRUKTURIEREN_USER(freitext, mandant.name), undefined, { ...options, signal, mandantIds: [mandantId] });
    return validateMarkdown(raw);
  }, options);
}
