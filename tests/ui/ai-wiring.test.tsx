import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AiOptions, Entscheidung, ErnaConfig, Mandant, Notiz, Termin } from '../../src/app/types.js';
import { App } from '../../src/app/App.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { saveConfig } from '../../src/data/filesystem.js';
import { deleteMandant, saveMandant } from '../../src/data/mandanten.js';
import { listNotizen } from '../../src/data/notizen.js';
import { listEntscheidungen } from '../../src/data/entscheidungen.js';
// Ein Schreiblock allein wartet weder auf readRecords noch auf den loadAkte-Aufruf,
// den refresh erst nach dem Indexaufbau startet. Daher komplette FS-Promises erfassen.
const io=vi.hoisted(()=>({pending:new Set<Promise<unknown>>(),started:0,onStart:new Set<()=>void>()}));
vi.mock('../../src/data/filesystem.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../src/data/filesystem.js')>();
  const operations=['ensureDataDirectory','readJson','writeJson','readText','writeText','exists','listFiles','listDirectories','removeFile','removeEmptyMandantDirectory','loadConfig','saveConfig','readBundledFile','readBundledDirectory','withDataLock'] as const;
  return {...actual,...Object.fromEntries(operations.map(name=>[name,(...args:never[])=>{
    const result=(actual[name] as (...parameters:never[])=>Promise<unknown>)(...args);
    io.pending.add(result);io.started++;
    for(const notify of io.onStart)notify();io.onStart.clear();
    void result.then(()=>io.pending.delete(result),()=>io.pending.delete(result));return result;
  }]))};
});
const nextTurn=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function drainFileJobs():Promise<void>{
  // Zwei unveränderte Eventloop-Checkpoints schließen Promise-Fortsetzungen ein,
  // die nach Ende eines gelesenen Verzeichnisses weitere Dateien öffnen.
  await vi.waitFor(async()=>{
    const observed=io.started;await nextTurn();
    expect(io.pending.size,'Noch laufende Dateioperationen').toBe(0);
    await nextTurn();
    expect(io.pending.size,'Neu gestartete Dateioperationen').toBe(0);
    expect(io.started,'Weitere Dateioperationen nach Promise-Fortsetzung').toBe(observed);
  },{timeout:5000,interval:20});
}

const ai=vi.hoisted(()=>({
  process:vi.fn<(document:Notiz|Entscheidung,features:{strukturieren:boolean;fristen:boolean},options?:AiOptions)=>Promise<{termine:Termin[];skipped:number}>>(),
  structure:vi.fn(),deadlines:vi.fn(),
  decision:vi.fn<(id:string,text:string,options?:AiOptions)=>Promise<string>>(),
  brief:vi.fn<(onUpdate?:(text:string)=>void,options?:AiOptions)=>Promise<string>>(),
  sdk:vi.fn(),
}));
vi.mock('../../src/ai/strukturieren.js',()=>({verarbeiteDokument:ai.process,strukturierenNotiz:ai.structure}));
vi.mock('../../src/ai/fristen.js',()=>({erkenneFristen:ai.deadlines}));
vi.mock('../../src/ai/entscheidung.js',()=>({dokumentiereEntscheidung:ai.decision}));
vi.mock('../../src/ai/tagesbrief.js',()=>({erstelleTagesbrief:ai.brief}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{constructor(){ai.sdk();throw new Error('Echte API-Aufrufe sind in UI-Tests gesperrt.');}}}));
vi.setConfig({testTimeout:15000,hookTimeout:10000});
const waitFor=<T,>(operation:()=>T|Promise<T>):Promise<T>=>vi.waitFor(operation,{timeout:5000,interval:30});
const profile:Mandant={id:'M-2024-0001',name:'Testkanzlei-Mandant',rechtsform:'GmbH',ansprechpartner:'Test',telefon:'',email:'',steuer_id:'',finanzamt:'',wirtschaftsjahr_ende:'12-31',mandant_seit:'2024-01-01',bearbeiter:'Test',kategorie:'GmbH',branchen_code:'',aktiv:true,ai_features_aktiv:true,notizen:''};
const DRAFT='## Sachverhalt\nGenerierter Sachverhalt.\n\n## Relevante Rechtsgrundlagen\n[PRÜFEN]\n\n## Entscheidung\nVorgeschlagene Entscheidung.\n\n## Begründung\nBegründung des Vorschlags.\n\n## Offene Punkte\n- [ ] Fachlich prüfen.';
let directory:string;
beforeEach(async()=>{directory=await mkdtemp(path.join(os.tmpdir(),'erna-ai-ui-'));vi.stubEnv('ERNA_DATA_PATH',directory);vi.stubEnv('ANTHROPIC_API_KEY','test-kein-echter-schluessel');await saveMandant(profile);ai.process.mockReset().mockResolvedValue({termine:[],skipped:0});ai.structure.mockReset().mockResolvedValue({termine:[],skipped:0});ai.deadlines.mockReset().mockResolvedValue({termine:[],skipped:0});ai.decision.mockReset().mockResolvedValue(DRAFT);ai.brief.mockReset().mockResolvedValue('Tagesbrief ohne offene Aufgaben.');ai.sdk.mockReset();});
afterEach(async()=>{cleanup();await drainFileJobs();expect(io.pending.size).toBe(0);io.onStart.clear();expect(ai.sdk).not.toHaveBeenCalled();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
const settle=()=>new Promise(resolve=>setTimeout(resolve,45));
async function press(ui:ReturnType<typeof render>,...keys:string[]):Promise<void>{await settle();for(const key of keys){ui.stdin.write(key);await settle();}}
async function start(overrides:Partial<ErnaConfig['ai']>={},hasMandant=true):Promise<ReturnType<typeof render>>{
  const config=structuredClone(DEFAULT_CONFIG);Object.assign(config.ai,{datenschutzAkzeptiert:true},overrides);await saveConfig(config);
  const startup=new Promise<void>(resolve=>io.onStart.add(resolve));
  const ui=render(<App initialConfig={config}/>);await startup;await drainFileJobs();await waitFor(()=>expect(ui.lastFrame()).toContain(hasMandant?'NÄCHSTE FRISTEN':'Dein lokaler Kanzleiarbeitsplatz ist bereit.'));return ui;
}
async function saveNewNote(ui:ReturnType<typeof render>,title='Neue Testnotiz'):Promise<void>{
  await press(ui,'\t','\x1b[B','\ue102');await waitFor(()=>expect(ui.lastFrame()).toContain('NEUE NOTIZ'));
  await press(ui,title,'\t','Persistierter Inhalt','\x13');await drainFileJobs();await waitFor(async()=>expect((await listNotizen(profile.id)).some(note=>note.titel===title)).toBe(true));
}

it('speichert lokal vor der asynchronen Analyse und erlaubt weitere Erfassung während Claude arbeitet',async()=>{
  let finish:()=>void=()=>undefined;
  ai.process.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({termine:[],skipped:0});}));
  const ui=await start();await saveNewNote(ui);
  await waitFor(()=>expect(ai.process).toHaveBeenCalledOnce());
  expect(ai.process).toHaveBeenCalledWith(expect.objectContaining({typ:'notiz',titel:'Neue Testnotiz',inhalt:'Persistierter Inhalt'}),{strukturieren:true,fristen:true},{signal:expect.any(AbortSignal)});
  await waitFor(()=>expect(ui.lastFrame()).toContain('lokale Erfassung bleibt verfügbar'));
  expect(ui.lastFrame()).not.toContain('NEUE NOTIZ');
  await press(ui,'\ue102');await waitFor(()=>expect(ui.lastFrame()).toContain('NEUE NOTIZ'));
  await press(ui,'\x1b');finish();
  await waitFor(()=>expect(ui.lastFrame()).toContain('automatische KI-Verarbeitung abgeschlossen'));
  expect(await listNotizen(profile.id)).toHaveLength(1);
});

it('strukturiert nur neue Notizen automatisch und erkennt beim späteren Bearbeiten weiter Fristen',async()=>{
  const ui=await start();await saveNewNote(ui);await waitFor(()=>expect(ui.lastFrame()).toContain('automatische KI-Verarbeitung abgeschlossen'));
  await press(ui,'\ue103');await waitFor(()=>expect(ui.lastFrame()).toContain('NOTIZ BEARBEITEN'));await press(ui,' ergänzt','\x13');
  await waitFor(()=>expect(ai.process).toHaveBeenCalledTimes(2));
  expect(ai.process.mock.calls[1]?.[1]).toEqual({strukturieren:false,fristen:true});
  await waitFor(()=>expect(ui.lastFrame()).toContain('automatische KI-Verarbeitung abgeschlossen'));
});

it.each([
  {label:'fehlende Datenschutzzustimmung',settings:{datenschutzAkzeptiert:false},key:true,client:true,error:'Datenschutzzustimmung fehlt'},
  {label:'global deaktivierte KI',settings:{aktiviert:false},key:true,client:true,error:'KI-Features sind deaktiviert'},
  {label:'fehlender API-Schlüssel',settings:{},key:false,client:true,error:'ANTHROPIC_API_KEY nicht gesetzt'},
  {label:'Mandant ohne KI-Freigabe',settings:{},key:true,client:false,error:'KI-Features sind für Mandant'},
])('blockiert automatische und manuelle Aufrufe bei $label',async({settings,key,client,error})=>{
  if(!key)vi.stubEnv('ANTHROPIC_API_KEY','');if(!client)await saveMandant({...profile,ai_features_aktiv:false});
  const ui=await start(settings);await saveNewNote(ui);await waitFor(()=>expect(ui.lastFrame()).toContain('Notiz gespeichert.'));
  expect(ai.process).not.toHaveBeenCalled();
  await press(ui,'\ue108');await waitFor(()=>expect(ui.lastFrame()).toContain('KI-AKTIONEN'));await press(ui,'3');
  await waitFor(()=>expect(ui.lastFrame()).toContain(error));
  expect(ai.decision).not.toHaveBeenCalled();expect(ai.process).not.toHaveBeenCalled();
});

it('unterlässt automatische Verarbeitung, wenn beide Automatiken ausgeschaltet sind',async()=>{
  const ui=await start({autoStrukturierungBeiSave:false,autoFristenerkennung:false});await saveNewNote(ui);await waitFor(()=>expect(ui.lastFrame()).toContain('Notiz gespeichert.'));
  expect(ai.process).not.toHaveBeenCalled();
});

it('übernimmt die F9-Entscheidung zuerst als prüfbaren Entwurf und schreibt erst beim zweiten Ctrl+S',async()=>{
  const ui=await start({autoStrukturierungBeiSave:false,autoFristenerkennung:false});
  await press(ui,'\ue108','3');await waitFor(()=>expect(ui.lastFrame()).toContain('Freitext des Beraters'));
  expect(ui.lastFrame()).toContain('KI-Entwurf erstellen');await settle();
  await press(ui,'Dokumentierter Titel','\t','Sachverhalt aus dem Beratungsgespräch');
  expect(ui.lastFrame()).toContain('Dokumentierter Titel');expect(ui.lastFrame()).toContain('Sachverhalt aus dem Beratungsgespräch');
  await press(ui,'\x13');
  await waitFor(()=>expect(ai.decision).toHaveBeenCalledWith(profile.id,'Dokumentierter Titel\n\nSachverhalt aus dem Beratungsgespräch',{signal:expect.any(AbortSignal)}));
  await waitFor(()=>expect(ui.lastFrame()).toContain('NEUE ENTSCHEIDUNG'));
  expect(ui.lastFrame()).toContain('Dokumentierter Titel');
  expect(await listEntscheidungen(profile.id)).toHaveLength(0);
  await press(ui,'\x1b');await waitFor(()=>expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  await press(ui,'n','\x13');
  await waitFor(async()=>expect(await listEntscheidungen(profile.id)).toHaveLength(1));
  const saved=(await listEntscheidungen(profile.id))[0];expect(saved?.titel).toBe('Dokumentierter Titel');expect(saved?.inhalt).toBe(DRAFT);expect(saved?.status).toBe('entwurf');
  expect(ai.decision).toHaveBeenCalledOnce();expect(ai.process).not.toHaveBeenCalled();
});

it('erhält die gespeicherte Notiz und die lokale Navigation bei einem automatischen KI-Fehler',async()=>{
  ai.process.mockRejectedValueOnce(new Error('Simulierter API-Ausfall'));
  const ui=await start();await saveNewNote(ui);await waitFor(()=>expect(ui.lastFrame()).toContain('Simulierter API-Ausfall'));
  expect((await listNotizen(profile.id))[0]?.inhalt).toBe('Persistierter Inhalt');
  await press(ui,'\ue105');await waitFor(()=>expect(ui.lastFrame()).toContain('FRISTEN · ALLE MANDANTEN'));
});

it('zeigt F9→5 global für mehrere Mandanten und übernimmt auch die gestreamte Ausgabe',async()=>{
  await saveMandant({...profile,id:'M-2024-0002',name:'Zweiter Mandant'});
  let finish:()=>void=()=>undefined;
  ai.brief.mockImplementationOnce(onUpdate=>new Promise(resolve=>{onUpdate?.('Testkanzlei-Mandant: heute prüfen.');finish=()=>resolve('Testkanzlei-Mandant: heute prüfen.\nZweiter Mandant: Belege anfordern.');}));
  const ui=await start();await press(ui,'\ue108','5');
  await waitFor(()=>expect(ui.lastFrame()).toContain('TAGESBRIEF · ALLE FREIGEGEBENEN MANDANTEN'));
  await waitFor(()=>expect(ui.lastFrame()).toContain('Testkanzlei-Mandant: heute prüfen.'));
  expect(ai.brief).toHaveBeenCalledWith(expect.any(Function),{signal:expect.any(AbortSignal)});
  finish();await waitFor(()=>expect(ui.lastFrame()).toContain('Zweiter Mandant: Belege anfordern.'));
});

it('lässt F9→5 auch ohne ausgewählten Mandanten bis zum globalen Tagesbrief-Backend durch',async()=>{
  await deleteMandant(profile.id);
  const ui=await start({},false);await press(ui,'\ue108','5');
  await waitFor(()=>expect(ai.brief).toHaveBeenCalledOnce());
  await waitFor(()=>expect(ui.lastFrame()).toContain('Tagesbrief ohne offene Aufgaben.'));
  expect(ui.lastFrame()).not.toContain('Bitte zuerst Mandant auswählen');
});

it('meldet einen Tagesbrief-Fehler und gibt die Navigation nach ESC wieder frei',async()=>{
  ai.brief.mockRejectedValueOnce(new Error('Simulierter Tagesbrief-Ausfall'));
  const ui=await start();await press(ui,'\ue108','5');
  await waitFor(()=>expect(ui.lastFrame()).toContain('Simulierter Tagesbrief-Ausfall'));
  await press(ui,'\x1b','\ue105');await waitFor(()=>expect(ui.lastFrame()).toContain('FRISTEN · ALLE MANDANTEN'));
});

it('führt eine einzelne manuelle F9→1-Analyse für die ausgewählte Notiz genau einmal aus',async()=>{
  const ui=await start({autoStrukturierungBeiSave:false,autoFristenerkennung:false});await saveNewNote(ui);await waitFor(()=>expect(ui.lastFrame()).toContain('Notiz gespeichert.'));
  await press(ui,'\ue108','1');await waitFor(()=>expect(ui.lastFrame()).toContain('KI-Ergebnis übernommen'));
  expect(ai.structure).toHaveBeenCalledOnce();expect(ai.structure).toHaveBeenCalledWith(expect.objectContaining({mandant_id:profile.id,titel:'Neue Testnotiz'}),{signal:expect.any(AbortSignal)});
});
