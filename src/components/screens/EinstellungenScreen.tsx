import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useErna } from '../../app/App.js';
import { PRIVACY_NOTICE, THEME } from '../../app/constants.js';
import type { ErnaConfig, FormField } from '../../app/types.js';
import { hasApiKey } from '../../ai/client.js';
import { getDataPath } from '../../data/filesystem.js';
import { seedDemoData } from '../../data/seed.js';
import { functionKey } from '../../utils/keyboard.js';
import { ScrollableText } from '../layout/ContentPane.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { FormEditor } from '../shared/TextEditor.js';

const fields:FormField[]=[
  {key:'name',label:'Kanzleiname',required:true},
  {key:'bearbeiter',label:'Standardbearbeiter'},
  {key:'aktiviert',label:'KI aktiviert',kind:'choice',options:['Nein','Ja']},
  {key:'strukturieren',label:'Neue Notizen automatisch strukturieren',kind:'choice',options:['Nein','Ja']},
  {key:'fristen',label:'Fristen beim Speichern erkennen',kind:'choice',options:['Nein','Ja']},
  {key:'model',label:'KI-Modell',required:true},
];
const yes=(value:boolean)=>value?'Ja':'Nein';

export function EinstellungenScreen(){
  const context=useErna(),{config}=context;
  const [editing,setEditing]=useState<'config'|'key'|null>(null);
  const [consent,setConsent]=useState<ErnaConfig|null>(null),[revoke,setRevoke]=useState(false);
  const active=!context.overlayOpen&&!context.editorOpen&&!context.busy&&!editing&&!consent&&!revoke;
  const persist=async(next:ErnaConfig):Promise<void>=>{await context.updateConfig(next);setEditing(null);setConsent(null);setRevoke(false);};
  useInput((input,key)=>{
    if(functionKey(input,key)===4){context.setFocus('content');setEditing('config');return;}
    if(context.focus!=='content'||key.ctrl||key.meta)return;
    if(key.return)setEditing('config');
    else if(input.toLowerCase()==='k')setEditing('key');
    else if(input.toLowerCase()==='d'){
      if(config.ai.datenschutzAkzeptiert)setRevoke(true);
      else setConsent({...config,ai:{...config.ai,aktiviert:true,datenschutzAkzeptiert:true}});
    }else if(input.toLowerCase()==='s')void context.run(async()=>{
      const result=await seedDemoData();await context.refresh();context.setMessage(`Demodaten: ${result.created} Mandanten angelegt, ${result.skipped} vorhandene Akten übersprungen.`);
    });
  },{isActive:active});
  if(consent)return <ConfirmDialog message={`${PRIVACY_NOTICE}\nIch bestätige und aktiviere KI-Features.`} onConfirm={()=>persist({...consent,ai:{...consent.ai,datenschutzAkzeptiert:true}})} onCancel={()=>{setConsent(null);setEditing(null);context.setMessage('KI-Features bleiben deaktiviert.');}}/>;
  if(revoke)return <ConfirmDialog message="Datenschutzfreigabe widerrufen und KI deaktivieren? Laufende KI-Aufträge werden abgebrochen." onConfirm={()=>persist({...config,ai:{...config.ai,aktiviert:false,datenschutzAkzeptiert:false}})} onCancel={()=>setRevoke(false)}/>;
  if(editing==='key')return <FormEditor title="API-SCHLÜSSEL · NUR DIESE SITZUNG · Leer speichern entfernt den Schlüssel" fields={[{key:'key',label:'API-Schlüssel',kind:'secret'}]} initialValues={{key:''}} onCancel={()=>setEditing(null)} onSave={async values=>{context.setSessionApiKey(values.key??'');setEditing(null);}}/>;
  if(editing==='config')return <FormEditor title="EINSTELLUNGEN BEARBEITEN" fields={fields} initialValues={{name:config.kanzlei.name,bearbeiter:config.kanzlei.standardBearbeiter,aktiviert:yes(config.ai.aktiviert),strukturieren:yes(config.ai.autoStrukturierungBeiSave),fristen:yes(config.ai.autoFristenerkennung),model:config.ai.model}} onCancel={()=>setEditing(null)} onSave={async values=>{
    const next:ErnaConfig={...config,kanzlei:{...config.kanzlei,name:values.name?.trim()??'',standardBearbeiter:values.bearbeiter?.trim()??''},ai:{...config.ai,aktiviert:values.aktiviert==='Ja',autoStrukturierungBeiSave:values.strukturieren==='Ja',autoFristenerkennung:values.fristen==='Ja',model:values.model?.trim()??''}};
    if(next.ai.aktiviert&&!next.ai.datenschutzAkzeptiert){setConsent(next);return;}
    await persist(next);
  }}/>;
  const text=`Kanzlei: ${config.kanzlei.name}\nBearbeiter: ${config.kanzlei.standardBearbeiter||'Noch nicht hinterlegt'}\nDatenpfad: ${getDataPath()}\n\nKI aktiviert: ${yes(config.ai.aktiviert)}\nAPI-Schlüssel verfügbar: ${yes(hasApiKey())}\nDatenschutzfreigabe: ${yes(config.ai.datenschutzAkzeptiert)}\nAutomatische Strukturierung neuer Notizen: ${yes(config.ai.autoStrukturierungBeiSave)}\nAutomatische Fristenerkennung: ${yes(config.ai.autoFristenerkennung)}\nModell: ${process.env.ERNA_AI_MODEL?.trim()||config.ai.model}${process.env.ERNA_AI_MODEL?.trim()?' (Vorgabe aus ERNA_AI_MODEL)':''}\n\n${PRIVACY_NOTICE}\n\nAPI-Schlüssel werden nicht in erna-config.json gespeichert. Dauerhafte Schlüssel in .env setzen.\nDarstellung: Dunkel · DD.MM.YYYY · HH:mm`;
  return <Box flexDirection="column"><ScrollableText text={text} width={context.width} height={Math.max(3,context.height-4)} active={active&&context.focus==='content'}/><Text color={THEME.fgSecondary}>F4 / Enter Einstellungen bearbeiten</Text><Text color={THEME.fgSecondary}>D Datenschutzfreigabe · K Sitzungsschlüssel</Text><Text color={THEME.fgSecondary}>S Demodaten laden · Bild↑↓ lesen</Text></Box>;
}
