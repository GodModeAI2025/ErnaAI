import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { seedDemoData } from '../../src/data/seed.js';
import { markdownText, saveNotiz } from '../../src/data/notizen.js';
import { dataPath, writeText } from '../../src/data/filesystem.js';
import { loadMandantContext, loadMandantContextBundle } from '../../src/ai/context.js';
let root:string;
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'erna-context-'));vi.stubEnv('ERNA_DATA_PATH',root);await seedDemoData(new Date(2026,8,4,12));});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
it('lädt die neueste Datei zuerst und benennt ausgelassene Dateien',async()=>{await saveNotiz({id:uuid(),mandant_id:'M-2024-0001',typ:'notiz',titel:'Neueste Notiz',erstellt:'2026-09-05T12:00:00+02:00',geaendert:'2026-09-05T12:00:00+02:00',autor:'Test',tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false,inhalt:'NEUESTE QUELLE'});const text=await loadMandantContext('M-2024-0001',{maxFiles:1});expect(text).toContain('NEUESTE QUELLE');expect(text).toContain('=== DATEI:');expect(text).toMatch(/\[\d+ Dateien ausgelassen\]/);expect(text).not.toContain(root);});
it('begrenzt große UTF-8-Dateien und das gesamte Kontextbudget',async()=>{await saveNotiz({id:uuid(),mandant_id:'M-2024-0001',typ:'notiz',titel:'Große Notiz',erstellt:'2026-09-05T12:00:00+02:00',geaendert:'2026-09-05T12:00:00+02:00',autor:'Test',tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false,inhalt:'ä😀'.repeat(15000)});const text=await loadMandantContext('M-2024-0001');expect(text).toContain('[GEKÜRZT]');expect(text).not.toContain('\ufffd');expect(Buffer.byteLength(text)).toBeLessThanOrEqual(600000);const small=await loadMandantContext('M-2024-0001',{maxTokensEstimate:64});expect(Buffer.byteLength(small)).toBeLessThanOrEqual(256);expect(small).toContain('ausgelassen');});
it('beachtet ausgeschlossene Dokumentarten',async()=>{const text=await loadMandantContext('M-2024-0001',{includeNotizen:false,includeTermine:false,includeEntscheidungen:false});expect(text).toContain('profil.json');expect(text).not.toContain('/notizen/');expect(text).not.toContain('/termine/');expect(text).not.toContain('/entscheidungen/');});
it('sortiert Zeitpunkte über unterschiedliche UTC-Offsets korrekt',async()=>{
  for(const [zeit,inhalt] of [['2026-10-25T02:50:00+02:00','ÄLTERE SOMMERZEIT'],['2026-10-25T02:10:00+01:00','NEUERE WINTERZEIT']] as const) await saveNotiz({id:uuid(),mandant_id:'M-2024-0001',typ:'notiz',titel:inhalt,erstellt:zeit,geaendert:zeit,autor:'Test',tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false,inhalt});
  const text=await loadMandantContext('M-2024-0001',{maxFiles:1});expect(text).toContain('NEUERE WINTERZEIT');expect(text).not.toContain('ÄLTERE SOMMERZEIT');
});
it('überträgt weder fremde Mandanten-IDs noch Symlink-Ziele oder kaputte Dateien',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>undefined);
  const foreign={id:uuid(),mandant_id:'M-2024-0002',typ:'notiz' as const,titel:'Fremde Akte',erstellt:'2026-09-05T12:00:00+02:00',geaendert:'2026-09-05T12:00:00+02:00',autor:'Test',tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false,inhalt:'FREMDER GEHEIMTEXT'};
  const target=dataPath('mandanten','M-2024-0002','notizen','fremd.md');await writeText(target,markdownText(foreign));
  await writeText(dataPath('mandanten','M-2024-0001','notizen','falsch-zugeordnet.md'),markdownText(foreign));
  await writeText(dataPath('mandanten','M-2024-0001','notizen','kaputt.md'),'---\n[kaputt\n---\n');
  await symlink(target,dataPath('mandanten','M-2024-0001','notizen','verknuepfung.md'));
  const text=await loadMandantContext('M-2024-0001');expect(text).not.toContain('FREMDER GEHEIMTEXT');expect(text).not.toContain('M-2024-0002');expect(text).toContain('Huber GmbH');
});
it('nennt nur tatsächlich enthaltene Quellen und begrenzt jede UTF-8-Datei',async()=>{
  await saveNotiz({id:uuid(),mandant_id:'M-2024-0001',typ:'notiz',titel:'Große Quelle',erstellt:'2026-09-05T12:00:00+02:00',geaendert:'2026-09-05T12:00:00+02:00',autor:'Test',tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false,inhalt:'ä😀'.repeat(15000)});
  const bundle=await loadMandantContextBundle('M-2024-0001',{maxFiles:1});expect(bundle.quellen).toHaveLength(1);expect(Buffer.byteLength(bundle.quellen[0]?.inhalt??'')).toBeLessThanOrEqual(50000);expect(bundle.quellen[0]?.inhalt).toContain('[GEKÜRZT]');expect(bundle.quellen[0]?.inhalt).not.toContain('\ufffd');expect(bundle.ausgelassen).toBeGreaterThan(0);
});
it('verweigert ungültige Kontextgrenzen',async()=>{
  for(const maxFiles of [-1,NaN,1.5,Infinity]) await expect(loadMandantContext('M-2024-0001',{maxFiles})).rejects.toThrow('Dateianzahl');
  for(const maxTokensEstimate of [0,-1,NaN,1.5,Infinity]) await expect(loadMandantContext('M-2024-0001',{maxTokensEstimate})).rejects.toThrow('Kontextbudget');
});
