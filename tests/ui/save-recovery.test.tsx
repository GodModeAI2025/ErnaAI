import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Akte, Mandant } from '../../src/app/types.js';
import { NotizenScreen } from '../../src/components/screens/NotizenScreen.js';
import { TermineScreen } from '../../src/components/screens/TermineScreen.js';
import { EntscheidungenScreen } from '../../src/components/screens/EntscheidungenScreen.js';
import { saveMandant } from '../../src/data/mandanten.js';
import { listNotizen } from '../../src/data/notizen.js';
import { listTermine } from '../../src/data/termine.js';
import { listEntscheidungen } from '../../src/data/entscheidungen.js';
import { loadAkte } from '../../src/data/index.js';
const { context } = vi.hoisted(() => {
  const context = {
    mandant: null as Mandant|null, akte: null as Akte|null, config: {kanzlei:{standardBearbeiter:'Test'}},
    width:76,height:20,focus:'content',busy:false,overlayOpen:false,editorOpen:false,decisionDraft:null as string|null,
    setFocus:vi.fn(),setEditorOpen:vi.fn(),setSelectedNotiz:vi.fn(),setMessage:vi.fn(),afterSave:vi.fn(),
    setDecisionDraft:vi.fn((value:string|null)=>{context.decisionDraft=value;}),
    run:vi.fn(async(operation:()=>Promise<void>)=>{try{await operation();return true;}catch{return false;}}),
    refresh:vi.fn<()=>Promise<void>>(),
  };
  return {context};
});
vi.mock('../../src/app/App.js',()=>({useErna:()=>context}));
let directory:string;
const mandant:Mandant={id:'M-2024-0001',name:'Testmandant',rechtsform:'GmbH',ansprechpartner:'Test',telefon:'',email:'',steuer_id:'',finanzamt:'',wirtschaftsjahr_ende:'12-31',mandant_seit:'2024-01-01',bearbeiter:'Test',kategorie:'GmbH',branchen_code:'',aktiv:true,ai_features_aktiv:false,notizen:''};
beforeEach(async()=>{directory=await mkdtemp(path.join(os.tmpdir(),'erna-ui-save-'));vi.stubEnv('ERNA_DATA_PATH',directory);await saveMandant(mandant);context.mandant=mandant;context.akte=await loadAkte(mandant.id);context.decisionDraft=null;context.refresh.mockImplementation(async()=>{context.akte=await loadAkte(mandant.id);});});
afterEach(async()=>{cleanup();vi.clearAllMocks();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
async function press(ui:ReturnType<typeof render>,...keys:string[]):Promise<void>{for(const key of keys){ui.stdin.write(key);await settle();}}

it.each([
  {Screen:NotizenScreen,label:'NEUE NOTIZ',type:'notiz',count:()=>listNotizen(mandant.id)},
  {Screen:TermineScreen,label:'NEUER TERMIN',type:'termin',count:()=>listTermine(mandant.id)},
  {Screen:EntscheidungenScreen,label:'NEUE ENTSCHEIDUNG',type:'entscheidung',count:()=>listEntscheidungen(mandant.id)},
])('schließt den $type-Editor nach Dateiwrite trotz Refreshfehler und erzeugt keine Duplikate',async({Screen,label,type,count})=>{
  context.refresh.mockRejectedValueOnce(new Error('Ansicht konnte nicht gelesen werden.'));
  const ui=render(<Screen/>);await settle();await press(ui,'\ue102');
  await vi.waitFor(()=>expect(ui.lastFrame()).toContain(label));
  await press(ui,'Gespeicherter Eintrag');
  if(type==='notiz')await press(ui,'\t','Erfasster Inhalt');
  await press(ui,'\x13');
  await vi.waitFor(()=>expect(context.setMessage).toHaveBeenCalledWith(expect.stringContaining('Die Ansicht konnte nicht aktualisiert werden.'),true));
  expect(ui.lastFrame()).not.toContain(label);
  expect(await count()).toHaveLength(1);
  await press(ui,'\x13','\x13');
  expect(await count()).toHaveLength(1);
  expect(context.afterSave).toHaveBeenCalledTimes(type==='termin'?0:1);
});

it('zeigt einen im Archiv neu angelegten Termin nach dem Speichern in den offenen Terminen',async()=>{
  const ui=render(<TermineScreen/>);await settle();await press(ui,'\ue107');
  expect(ui.lastFrame()).toContain('ERLEDIGTE TERMINE');
  await press(ui,'\ue102','Neuer offener Termin','\x13');
  await vi.waitFor(async()=>expect(await listTermine(mandant.id)).toHaveLength(1));
  await vi.waitFor(()=>expect(context.refresh).toHaveBeenCalled());
  await settle();ui.rerender(<TermineScreen/>);
  await vi.waitFor(()=>expect(ui.lastFrame()).toContain('OFFENE TERMINE'));
  expect(ui.lastFrame()).toContain('Neuer offener Termin');
});

it('verwirft einen vorbefüllten KI-Entscheidungsentwurf erst nach Bestätigung',async()=>{
  context.decisionDraft='## Sachverhalt\nBereits erzeugter Entwurf';
  const ui=render(<EntscheidungenScreen/>);
  await vi.waitFor(()=>expect(ui.lastFrame()).toContain('Bereits erzeugter Entwurf'));
  await press(ui,'\x1b');
  await vi.waitFor(()=>expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  expect(context.setDecisionDraft).not.toHaveBeenCalled();
  await press(ui,'n');expect(ui.lastFrame()).toContain('Bereits erzeugter Entwurf');
  await press(ui,'\x1b','j');
  await vi.waitFor(()=>expect(context.setDecisionDraft).toHaveBeenCalledWith(null));
});
