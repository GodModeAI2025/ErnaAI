import type { Akte, ErnaIndex, Termin } from '../app/types.js';
import { timestamp } from '../utils/dates.js';
import { errorMessage, record } from '../utils/format.js';
import { dataPath, exists, readJson, withDataLock, writeJson } from './filesystem.js';
import { getMandant, listMandanten } from './mandanten.js';
import { listNotizen } from './notizen.js';
import { listTermine } from './termine.js';
import { listEntscheidungen } from './entscheidungen.js';
export async function loadAkte(mandantId: string): Promise<Akte> {
  const [mandant, notizen, termine, entscheidungen] = await Promise.all([getMandant(mandantId), listNotizen(mandantId), listTermine(mandantId), listEntscheidungen(mandantId)]);
  return { mandant, notizen, termine, entscheidungen };
}
export async function loadAllTermine(): Promise<(Termin & { mandant_name: string })[]> {
  const mandanten = await listMandanten();
  return (await Promise.all(mandanten.filter(m => m.aktiv).map(async m => (await listTermine(m.id)).map(t => ({ ...t, mandant_name: m.name }))))).flat().sort((a, b) => a.datum.localeCompare(b.datum));
}
// Der Index ist ein rekonstruierbarer Cache; die Akten bleiben die maßgebliche Quelle.
export async function rebuildIndex(): Promise<ErnaIndex> {
  return withDataLock(async () => {
    const now = timestamp(), file = dataPath('erna-index.json');
    let erstellt = now;
    if (await exists(file)) {
      try { const previous = record(await readJson<unknown>(file)); if (previous.version === '1' && typeof previous.erstellt === 'string') erstellt = previous.erstellt; }
      catch (error) { console.error(`Index wird aus Akten neu aufgebaut: ${errorMessage(error)}`); }
    }
    const mandanten: ErnaIndex['mandanten'] = [];
    for (const mandant of await listMandanten()) {
      const akte = await loadAkte(mandant.id);
      const aktivitaeten = [...akte.notizen.map(n => n.geaendert), ...akte.entscheidungen.map(e => e.geaendert), ...akte.termine.map(t => t.erstellt)].sort().reverse();
      mandanten.push({ id: mandant.id, name: mandant.name, aktiv: mandant.aktiv, letzte_aktivitaet: aktivitaeten[0] ?? `${mandant.mandant_seit}T00:00:00+01:00`, statistik: { notizen: akte.notizen.length, termine_offen: akte.termine.filter(t => !t.erledigt).length, entscheidungen: akte.entscheidungen.length } });
    }
    const index: ErnaIndex = { version: '1', erstellt, aktualisiert: now, mandanten };
    await writeJson(file, index); return index;
  });
}
export const loadIndex = rebuildIndex;
