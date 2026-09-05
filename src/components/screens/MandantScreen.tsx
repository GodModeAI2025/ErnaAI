import path from 'node:path';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import type { FormField, Mandant } from '../../app/types.js';
import { deleteMandant, saveMandant, validateMandant } from '../../data/mandanten.js';
import { dataPath, exists, listDirectories, withDataLock, writeJson } from '../../data/filesystem.js';
import { displayDate, isIsoDate, parseGermanDate, today } from '../../utils/dates.js';
import { terminalText } from '../../utils/format.js';
import { functionKey } from '../../utils/keyboard.js';
import { ScrollableText } from '../layout/ContentPane.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { FormEditor } from '../shared/TextEditor.js';
const FIELDS:FormField[]=[
  {key:'name',label:'Name',required:true},{key:'rechtsform',label:'Rechtsform'},{key:'ansprechpartner',label:'Ansprechpartner'},
  {key:'telefon',label:'Telefon'},{key:'email',label:'E-Mail'},{key:'steuer_id',label:'Steuer-ID'},{key:'finanzamt',label:'Finanzamt'},
  {key:'wirtschaftsjahr_ende',label:'WJ-Ende (TT.MM.)',required:true},{key:'mandant_seit',label:'Mandant seit (TT.MM.JJJJ)',required:true},
  {key:'bearbeiter',label:'Bearbeiter'},{key:'kategorie',label:'Kategorie'},{key:'branchen_code',label:'Branchencode'},
  {key:'aktiv',label:'Mandant aktiv',kind:'choice',options:['ja','nein']},{key:'ai_features_aktiv',label:'KI für Mandant',kind:'choice',options:['ja','nein']},
  {key:'notizen',label:'Profilnotizen'},
];
const yearEndDisplay=(value:string):string=>`${value.slice(3,5)}.${value.slice(0,2)}.`;
function valuesFor(mandant:Mandant|null,bearbeiter:string):Record<string,string>{return {name:mandant?.name??'',rechtsform:mandant?.rechtsform??'',ansprechpartner:mandant?.ansprechpartner??'',telefon:mandant?.telefon??'',email:mandant?.email??'',steuer_id:mandant?.steuer_id??'',finanzamt:mandant?.finanzamt??'',wirtschaftsjahr_ende:yearEndDisplay(mandant?.wirtschaftsjahr_ende??'12-31'),mandant_seit:displayDate(mandant?.mandant_seit??today()),bearbeiter:mandant?.bearbeiter??bearbeiter,kategorie:mandant?.kategorie??'',branchen_code:mandant?.branchen_code??'',aktiv:mandant?.aktiv===false?'nein':'ja',ai_features_aktiv:mandant?.ai_features_aktiv===false?'nein':'ja',notizen:mandant?.notizen??''};}
function profileFrom(values:Record<string,string>,id:string):Mandant{
  const seit=parseGermanDate(values.mandant_seit?.trim()??''),end=/^(\d{2})\.(\d{2})\.?$/.exec(values.wirtschaftsjahr_ende?.trim()??'');
  if(!seit)throw new Error('Bitte „Mandant seit“ als gültiges Datum TT.MM.JJJJ eingeben.');
  const wirtschaftsjahr_ende=end?`${end[2]}-${end[1]}`:'';
  if(!isIsoDate(`2000-${wirtschaftsjahr_ende}`))throw new Error('Bitte das Wirtschaftsjahresende als gültiges Datum TT.MM. eingeben.');
  if(!['ja','nein'].includes(values.aktiv??'')||!['ja','nein'].includes(values.ai_features_aktiv??''))throw new Error('Bitte gültige Aktivierungseinstellungen wählen.');
  return validateMandant({id,name:values.name?.trim()??'',rechtsform:values.rechtsform??'',ansprechpartner:values.ansprechpartner??'',telefon:values.telefon??'',email:values.email??'',steuer_id:values.steuer_id??'',finanzamt:values.finanzamt??'',wirtschaftsjahr_ende,mandant_seit:seit,bearbeiter:values.bearbeiter??'',kategorie:values.kategorie??'',branchen_code:values.branchen_code??'',aktiv:values.aktiv==='ja',ai_features_aktiv:values.ai_features_aktiv==='ja',notizen:values.notizen??''});
}
// Die ID wird erst beim tatsächlichen Anlegen unter der CRUD-Sperre vergeben.
// Auch vorhandene Aktenordner ohne lesbares Profil bleiben dabei unangetastet.
async function createProfile(values:Record<string,string>):Promise<Mandant>{
  return withDataLock(async()=>{
    const year=new Date().getFullYear(),prefix=`M-${year}-`;
    const existing=(await listDirectories(dataPath('mandanten'))).map(directory=>path.basename(directory)).filter(id=>id.startsWith(prefix));
    let number=existing.reduce((maximum,id)=>/^\d{4,}$/.test(id.slice(prefix.length))?Math.max(maximum,Number(id.slice(prefix.length))):maximum,0)+1;
    if(!Number.isSafeInteger(number))throw new Error('Keine weitere sichere Mandanten-ID für dieses Jahr verfügbar.');
    let id=`${prefix}${String(number).padStart(4,'0')}`;
    while(await exists(dataPath('mandanten',id))){number++;if(!Number.isSafeInteger(number))throw new Error('Keine weitere sichere Mandanten-ID verfügbar.');id=`${prefix}${String(number).padStart(4,'0')}`;}
    const profile=profileFrom(values,id);await writeJson(dataPath('mandanten',id,'profil.json'),profile);return profile;
  });
}
export function MandantScreen(){
  const context=useErna(),[editing,setEditing]=useState<Mandant|'new'|null>(null),[deleting,setDeleting]=useState<Mandant|null>(null);
  const mandant=context.mandant,active=!context.overlayOpen&&!context.editorOpen&&!context.busy&&!editing&&!deleting;
  useInput((input,key)=>{
    const fn=functionKey(input,key);
    if(fn===3){context.setFocus('content');setEditing('new');return;}
    if(fn===4&&mandant){context.setFocus('content');setEditing(mandant);return;}
    if(fn===8&&mandant){context.setFocus('content');if(context.akte&&(context.akte.notizen.length||context.akte.termine.length||context.akte.entscheidungen.length)){context.setMessage('Die Akte enthält Dokumente und kann nicht gelöscht werden. Zum Archivieren mit F4 „Mandant aktiv“ auf „nein“ setzen.',true);}else setDeleting(mandant);return;}
    if(context.focus==='content'&&key.return&&mandant)setEditing(mandant);
  },{isActive:active});
  if(editing){const source=editing==='new'?null:editing;return <FormEditor title={source?`MANDANT BEARBEITEN · ${source.id}`:'NEUER MANDANT · ID wird beim Speichern vergeben'} fields={FIELDS} initialValues={valuesFor(source,context.config.kanzlei.standardBearbeiter)} onCancel={()=>setEditing(null)} onSave={async values=>{const saved=source?await saveMandant(profileFrom(values,source.id)):await createProfile(values);setEditing(null);context.setMessage(`Mandant ${saved.id} gespeichert.`);if(!await context.run(()=>context.selectMandant(saved.id)))context.setMessage(`Mandant ${saved.id} gespeichert. Die Akte konnte nicht aktualisiert werden.`,true);}}/>;}
  if(deleting)return <ConfirmDialog message={`Leere Akte „${terminalText(deleting.name)}“ (${deleting.id}) endgültig löschen? Zum Archivieren stattdessen F4 → „Mandant aktiv: nein“ verwenden.`} onCancel={()=>setDeleting(null)} onConfirm={async()=>{await deleteMandant(deleting.id);setDeleting(null);context.setMessage('Leere Mandantenakte gelöscht.');if(!await context.run(context.refresh))context.setMessage('Mandantenakte gelöscht. Die Ansicht konnte nicht aktualisiert werden.',true);}}/>;
  if(!mandant)return <Box flexDirection="column"><Text color={THEME.fgSecondary}>Bitte zuerst Mandant auswählen (F2).</Text><Text color={THEME.accent}>F3: neuen Mandanten anlegen.</Text></Box>;
  const text=[
    `${mandant.name} · ${mandant.id}`,`Status: ${mandant.aktiv?'aktiv':'archiviert'} · KI: ${mandant.ai_features_aktiv?'freigegeben':'deaktiviert'}`,
    '',`Rechtsform: ${mandant.rechtsform}`,`Ansprechpartner: ${mandant.ansprechpartner}`,`Telefon: ${mandant.telefon}`,`E-Mail: ${mandant.email}`,
    `Steuer-ID: ${mandant.steuer_id}`,`Finanzamt: ${mandant.finanzamt}`,`Wirtschaftsjahresende: ${yearEndDisplay(mandant.wirtschaftsjahr_ende)}`,
    `Mandant seit: ${displayDate(mandant.mandant_seit)}`,`Bearbeiter: ${mandant.bearbeiter}`,`Kategorie: ${mandant.kategorie}`,`Branchencode: ${mandant.branchen_code}`,
    '',`AKTENINHALT: ${context.akte?.notizen.length??0} Notizen · ${context.akte?.termine.length??0} Termine · ${context.akte?.entscheidungen.length??0} Entscheidungen`,
    '',`PROFILNOTIZEN\n${mandant.notizen||'Keine Profilnotizen.'}`,'','Archivieren: F4 → „Mandant aktiv“ auf „nein“ setzen.',
  ].join('\n');
  return <Box flexDirection="column"><Text bold color={THEME.fgSelected} wrap="truncate-end">MANDANTENAKTE · F3 Neu · F4 Bearbeiten · F8 Leere Akte löschen</Text><ScrollableText text={text} width={context.width} height={Math.max(2,context.height-1)} active={active&&context.focus==='content'}/></Box>;
}
