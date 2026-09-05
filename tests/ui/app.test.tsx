import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { cp, mkdtemp, rm, mkdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { App } from '../../src/app/App.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { seedDemoData } from '../../src/data/seed.js';
import { listNotizen } from '../../src/data/notizen.js';

vi.setConfig({testTimeout:15000,hookTimeout:10000});

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
let root:string,fixture:string;
beforeAll(async()=>{
  fixture=await mkdtemp(path.join(os.tmpdir(),'erna-ui-fixture-'));vi.stubEnv('ERNA_DATA_PATH',fixture);
  try{await seedDemoData();await drainFileJobs();}finally{vi.unstubAllEnvs();}
});
afterAll(async()=>{await drainFileJobs();await rm(fixture,{recursive:true,force:true});});
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'erna-ui-'));vi.stubEnv('ERNA_DATA_PATH',root);vi.stubEnv('ANTHROPIC_API_KEY','');});
afterEach(async()=>{cleanup();await drainFileJobs();expect(io.pending.size).toBe(0);io.onStart.clear();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
const demo=()=>cp(fixture,root,{recursive:true});
const frameReady=(app:ReturnType<typeof render>,text:string)=>vi.waitFor(()=>expect(app.lastFrame()).toContain(text),{timeout:5000,interval:20});
async function startApp(withDemo=false):Promise<ReturnType<typeof render>>{
  const startup=new Promise<void>(resolve=>io.onStart.add(resolve));
  const app=render(<App initialConfig={structuredClone(DEFAULT_CONFIG)}/>);
  await startup;await drainFileJobs();
  await frameReady(app,withDemo?'NÄCHSTE FRISTEN':'ANTHROPIC_API_KEY nicht gesetzt');
  expect(app.lastFrame()).not.toContain('Dateien werden verarbeitet');return app;
}
async function press(app:ReturnType<typeof render>,...keys:string[]):Promise<void>{
  // Ink meldet useInput in passiven React-Effekten an; vor und nach jeder Eingabe
  // den Eventloop abgeben, statt bereits sichtbare Frames mit Inputbereitschaft gleichzusetzen.
  await nextTurn();
  for(const key of keys){app.stdin.write(key);await nextTurn();await nextTurn();}
}

it('startet lokal ohne API-Key und öffnet die Tastaturhilfe',async()=>{
  const app=await startApp();await press(app,'\ue100');await frameReady(app,'HILFE');
  expect(app.lastFrame()).toContain('F2 Mandant wechseln');await press(app,'\x1b');
  await vi.waitFor(()=>expect(app.lastFrame()).not.toContain('HILFE'),{timeout:5000,interval:20});
});
it('zeigt Demoakte, offene Termine und Aktivitäten auf dem Startbildschirm',async()=>{
  await demo();const app=await startApp(true);expect(app.lastFrame()).toContain('LETZTE AKTIVITÄTEN');
  expect(app.lastFrame()).toContain('offene Termine');expect(app.lastFrame()).not.toContain('undefined');
});
it('wechselt mit F2 und Typeahead zur gewünschten Mandantenakte',async()=>{
  await demo();const app=await startApp(true);await press(app,'\ue101');await frameReady(app,'MANDANT WECHSELN');
  await press(app,'Huber');await frameReady(app,'Huber GmbH');await press(app,'\r');await drainFileJobs();
  await vi.waitFor(()=>expect(app.lastFrame()).not.toContain('MANDANT WECHSELN'),{timeout:5000,interval:20});
  expect(app.lastFrame()).toContain('Huber GmbH');expect(app.lastFrame()).toContain('3 Notizen');
});
it('speichert eine mehrzeilige Notiz über die Tastatur',async()=>{
  await demo();const app=await startApp(true);await press(app,'\t','\x1b[B');await frameReady(app,'NOTIZEN');
  await press(app,'\ue102');await frameReady(app,'NEUE NOTIZ');await press(app,'Prüfnotiz','\t','Erste Zeile\nZweite Zeile');
  await press(app,'\ue109');await frameReady(app,'BEENDEN');await press(app,'n');await frameReady(app,'Zweite Zeile');
  await press(app,'\x13');await drainFileJobs();await frameReady(app,'Notiz gespeichert.');
  const notes=await listNotizen('M-2024-0003');expect(notes.find(n=>n.titel==='Prüfnotiz')?.inhalt).toContain('Erste Zeile\nZweite Zeile');
});
it('öffnet das globale Fristendashboard mit F6 und das KI-Menü mit F9',async()=>{
  await demo();const app=await startApp(true);await press(app,'\ue105');await frameReady(app,'FRISTEN · ALLE MANDANTEN');
  expect(app.lastFrame()).toContain('Huber');await press(app,'\ue108');await frameReady(app,'KI-AKTIONEN');expect(app.lastFrame()).toContain('Alle Notizen re-analysieren');
});
it('lädt lesbare Akten auch bei einem nicht schreibbaren Indexcache',async()=>{
  await demo();await unlink(path.join(root,'erna-index.json'));await mkdir(path.join(root,'erna-index.json'));
  const app=await startApp(true);expect(app.lastFrame()).toContain('Dr. Ingrid Berger');expect(app.lastFrame()).toContain('Indexcache');
});
it('durchsucht die Akte mit F5 lokal und zeigt konkrete Quellen',async()=>{
  await demo();const app=await startApp(true);await press(app,'\ue104');await frameReady(app,'[1 Volltext]');
  await press(app,'Fahrzeug','\r');await drainFileJobs();await frameReady(app,'Treffer');
  expect(app.lastFrame()).toContain('Quelle: mandanten/M-2024-0003/');expect(app.lastFrame()).toContain('.md');
  await press(app,'\t');await frameReady(app,'KI-Suche');await press(app,'\r');await frameReady(app,'KI-Suche ist deaktiviert');
});
