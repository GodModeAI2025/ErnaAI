import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { App } from '../../src/app/App.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { loadConfig, saveConfig } from '../../src/data/filesystem.js';
import { listMandanten } from '../../src/data/mandanten.js';
const api=vi.hoisted(()=>vi.fn(()=>{throw new Error('Keine API-Anfragen aus diesen UI-Tests.');}));
vi.mock('@anthropic-ai/sdk',()=>({default:api}));

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
let root:string;
const config=()=>({...structuredClone(DEFAULT_CONFIG),ai:{...DEFAULT_CONFIG.ai,aktiviert:false}});
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'erna-settings-'));vi.stubEnv('ERNA_DATA_PATH',root);vi.stubEnv('ANTHROPIC_API_KEY','');await saveConfig(config());api.mockClear();},10000);
afterEach(async()=>{cleanup();await drainFileJobs();expect(io.pending.size).toBe(0);io.onStart.clear();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});},10000);
const frameReady=(app:ReturnType<typeof render>,text:string)=>vi.waitFor(()=>expect(app.lastFrame()).toContain(text),{timeout:5000,interval:20});
// Ink-Eingaben brauchen einen UI-Takt für passive Effekte; Dateiabschlüsse werden separat verfolgt.
async function key(app:ReturnType<typeof render>,value:string){await nextTurn();app.stdin.write(value);await new Promise(resolve=>setTimeout(resolve,35));}
async function fileAction(app:ReturnType<typeof render>,value:string){
  const started=io.started;await key(app,value);
  await vi.waitFor(()=>expect(io.started).toBeGreaterThan(started),{timeout:5000,interval:20});
  await drainFileJobs();
}
async function settings(){
  // WorkspaceApp startet beim Mount tatsächlich refresh; auf dessen Dateizugriffe warten.
  const startup=new Promise<void>(resolve=>io.onStart.add(resolve));
  const app=render(<App initialConfig={config()}/>);
  await startup;await drainFileJobs();
  expect(await readFile(path.join(root,'erna-index.json'),'utf8')).toContain('"version"');
  await frameReady(app,'ANTHROPIC_API_KEY nicht gesetzt');
  await key(app,'\ue106');await key(app,'\t');await key(app,'\x1b[B');await key(app,'\r');
  await frameReady(app,'D Datenschutzfreigabe');return app;
}
it('speichert Einstellungen nach expliziter Datenschutzfreigabe und gibt die Navigation wieder frei',async()=>{
  const app=await settings();await key(app,'\ue103');
  await frameReady(app,'EINSTELLUNGEN BEARBEITEN');
  await key(app,' Test');await key(app,'\t');await key(app,'Dr. Neu');await key(app,'\t');await key(app,' ');await key(app,'\x13');
  await drainFileJobs();await frameReady(app,'Mandantendaten an die Anthropic Claude API');
  expect((await loadConfig())?.ai.datenschutzAkzeptiert).toBe(false);
  await fileAction(app,'j');await frameReady(app,'Einstellungen gespeichert.');
  expect(await loadConfig()).toMatchObject({kanzlei:{name:'Meine Kanzlei Test',standardBearbeiter:'Dr. Neu'},ai:{aktiviert:true,datenschutzAkzeptiert:true}});
  await key(app,'\ue101');await frameReady(app,'MANDANT WECHSELN');
  await key(app,'\x1b');await frameReady(app,'D Datenschutzfreigabe');
  await key(app,'d');await frameReady(app,'Datenschutzfreigabe widerrufen');
  await fileAction(app,'j');await vi.waitFor(async()=>expect((await loadConfig())?.ai.datenschutzAkzeptiert).toBe(false),{timeout:5000,interval:20});
  expect((await loadConfig())?.ai.aktiviert).toBe(false);expect(api).not.toHaveBeenCalled();
},15000);
it('setzt und entfernt einen maskierten Sitzungsschlüssel ohne Speicherung auf der Festplatte',async()=>{
  const app=await settings();await key(app,'k');await frameReady(app,'API-SCHLÜSSEL · NUR DIESE SITZUNG');await key(app,'settings-test-key');
  await frameReady(app,'••••');
  expect(app.lastFrame()).not.toContain('settings-test-key');await key(app,'\x13');await drainFileJobs();
  await frameReady(app,'für diese Sitzung gesetzt');
  expect(process.env.ANTHROPIC_API_KEY).toBe('settings-test-key');
  expect(await readFile(path.join(root,'erna-config.json'),'utf8')).not.toContain('settings-test-key');
  await key(app,'k');await frameReady(app,'API-SCHLÜSSEL · NUR DIESE SITZUNG');await key(app,'\x13');await drainFileJobs();
  await frameReady(app,'aus dieser Sitzung entfernt');
  expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();expect(api).not.toHaveBeenCalled();
},15000);
it('lädt Demodaten lokal über die Einstellungen',async()=>{
  const app=await settings();await fileAction(app,'s');await frameReady(app,'3 Mandanten angelegt');
  expect(await listMandanten()).toHaveLength(3);expect(api).not.toHaveBeenCalled();
},15000);
