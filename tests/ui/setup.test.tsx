import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { App } from '../../src/app/App.js';
import { loadConfig } from '../../src/data/filesystem.js';
import { listMandanten } from '../../src/data/mandanten.js';

const api=vi.hoisted(()=>vi.fn(()=>{throw new Error('Die Einrichtung darf keine API-Anfrage auslösen.');}));
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
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'erna-setup-'));vi.stubEnv('ERNA_DATA_PATH',root);vi.stubEnv('ANTHROPIC_API_KEY','');api.mockClear();},10000);
afterEach(async()=>{cleanup();await drainFileJobs();expect(io.pending.size).toBe(0);io.onStart.clear();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});},10000);
const frameReady=(app:ReturnType<typeof render>,text:string)=>vi.waitFor(()=>expect(app.lastFrame()).toContain(text),{timeout:5000,interval:20});
// Ink-Eingaben brauchen einen UI-Takt für passive Effekte; Dateiabschlüsse werden separat verfolgt.
async function key(app:ReturnType<typeof render>,value:string){await nextTurn();app.stdin.write(value);await new Promise(resolve=>setTimeout(resolve,35));}
async function finishSetup(app:ReturnType<typeof render>,value:string){
  const started=io.started;await key(app,value);
  await vi.waitFor(()=>expect(io.started).toBeGreaterThan(started),{timeout:5000,interval:20});
  await drainFileJobs();
}

it('richtet eine lokale Kanzlei ohne Schlüssel oder KI-Freigabe ein',async()=>{
  const app=render(<App initialConfig={null}/>);
  // Der Wizard startet beim Mount keine Dateizugriffe; nur auf seine Eingabe warten.
  await frameReady(app,'Kanzleiname');
  await key(app,'Kanzlei Test');await key(app,'\r');
  await frameReady(app,'Name des Bearbeiters');
  await key(app,'Dr. Test');await key(app,'\r');
  await frameReady(app,'API-Schlüssel');
  await key(app,'\r');
  await frameReady(app,'Mandantendaten an die Anthropic Claude API');
  await key(app,'n');
  await frameReady(app,'Demodaten laden');
  await finishSetup(app,'n');
  await frameReady(app,'ANTHROPIC_API_KEY nicht gesetzt');await drainFileJobs();
  expect(await loadConfig()).toMatchObject({kanzlei:{name:'Kanzlei Test',standardBearbeiter:'Dr. Test'},ai:{aktiviert:false,datenschutzAkzeptiert:false}});
  expect(await listMandanten()).toHaveLength(0);expect(api).not.toHaveBeenCalled();
},15000);

it('maskiert einen Sitzungsschlüssel, speichert ihn nicht und lädt Demodaten erst nach Auswahl',async()=>{
  const app=render(<App initialConfig={null}/>);
  await frameReady(app,'Kanzleiname');
  await key(app,'Kanzlei Demo');await key(app,'\r');await frameReady(app,'Name des Bearbeiters');
  await key(app,'Bearbeiter');await key(app,'\r');await frameReady(app,'API-Schlüssel');
  await key(app,'nur-fuer-diesen-test');
  await frameReady(app,'••••');
  expect(app.lastFrame()).not.toContain('nur-fuer-diesen-test');
  await key(app,'\r');await frameReady(app,'Mandantendaten an die Anthropic Claude API');
  await key(app,'j');await frameReady(app,'Demodaten laden');await finishSetup(app,'j');
  await frameReady(app,'NÄCHSTE FRISTEN');await drainFileJobs();
  expect(await listMandanten()).toHaveLength(3);
  expect(process.env.ANTHROPIC_API_KEY).toBe('nur-fuer-diesen-test');
  expect(await loadConfig()).toMatchObject({ai:{aktiviert:true,datenschutzAkzeptiert:true}});
  const configText=await readFile(path.join(root,'erna-config.json'),'utf8');
  expect(configText).not.toContain('nur-fuer-diesen-test');
  expect(await readdir(root)).not.toContain('.env');expect(api).not.toHaveBeenCalled();
},15000);

it('bewahrt Einrichtungseingaben, wenn Beenden abgebrochen wird',async()=>{
  const app=render(<App initialConfig={null}/>);
  await frameReady(app,'Kanzleiname');
  await key(app,'Erhalten');await key(app,'\ue109');
  await frameReady(app,'Einrichtung verlassen');
  await key(app,'n');await frameReady(app,'Erhalten');
  await key(app,'\r');await frameReady(app,'Name des Bearbeiters');
  expect(await loadConfig()).toBeNull();
},15000);
