import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedDemoData } from '../../src/data/seed.js';
import { listEntscheidungen } from '../../src/data/entscheidungen.js';
import * as client from '../../src/ai/client.js';
import { dokumentiereEntscheidung } from '../../src/ai/entscheidung.js';

let root: string;
const markdown = '## Sachverhalt\nBelege fehlen.\n\n## Relevante Rechtsgrundlagen\n[PRÜFEN]\n\n## Entscheidung\nBelege anfordern.\n\n## Begründung\nVollständige Unterlagen benötigt.\n\n## Offene Punkte\n- [ ] Eingang prüfen';
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'erna-decision-'));
  vi.stubEnv('ERNA_DATA_PATH', root);
  await seedDemoData(new Date(2026, 8, 4, 12));
  vi.spyOn(client, 'callClaude').mockResolvedValue(markdown);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

it('liefert einen Entwurf mit Mandantenkontext und speichert keine Entscheidung', async () => {
  const before = await listEntscheidungen('M-2024-0001');
  expect(await dokumentiereEntscheidung('M-2024-0001', 'Belege anfordern.')).toBe(markdown);
  expect(await listEntscheidungen('M-2024-0001')).toEqual(before);
  expect(vi.mocked(client.callClaude).mock.calls[0]?.[1]).toContain('Huber GmbH');
  expect(vi.mocked(client.callClaude).mock.calls[0]?.[3]).toMatchObject({ mandantIds: ['M-2024-0001'] });
});
it.each(['{}', '```markdown\n' + markdown + '\n```', '## Sachverhalt\nUnvollständig', markdown.replace('Belege anfordern.', '')])('verwirft unvollständige oder falsch formatierte Entwürfe mit Rohtext', async raw => {
  vi.mocked(client.callClaude).mockResolvedValue(raw);
  const result = dokumentiereEntscheidung('M-2024-0001', 'Belege anfordern.');
  await expect(result).rejects.toBeInstanceOf(client.AiResponseError);
  await expect(result).rejects.toMatchObject({ rawText: raw });
});
it('verweigert leeren Freitext oder einen fehlenden Mandanten vor der Anfrage', async () => {
  await expect(dokumentiereEntscheidung('M-2024-0001', '  ')).rejects.toThrow('Freitext');
  await expect(dokumentiereEntscheidung('M-2024-9999', 'Belege anfordern.')).rejects.toThrow();
  expect(client.callClaude).not.toHaveBeenCalled();
});
