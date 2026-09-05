import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { v4 as uuid } from 'uuid';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import type { FormField, Termin } from '../../app/types.js';
import { saveTermin } from '../../data/termine.js';
import { dateGroup, displayDate, parseGermanDate, timestamp, today, type DateGroup } from '../../utils/dates.js';
import { terminalText } from '../../utils/format.js';
import { functionKey } from '../../utils/keyboard.js';
import { FormEditor } from '../shared/TextEditor.js';
export const TERMIN_FIELDS: FormField[] = [{key:'titel',label:'Titel',required:true},{key:'datum',label:'Datum (TT.MM.JJJJ)',required:true},{key:'uhrzeit',label:'Uhrzeit (HH:mm)'},{key:'prioritaet',label:'Priorität',kind:'choice',options:['hoch','mittel','niedrig']},{key:'typ',label:'Typ',kind:'choice',options:['frist','termin','erinnerung']},{key:'notiz',label:'Notiz'}];
export function TerminEditor({ termin, mandantId, onDone, onCancel }: { termin?: Termin; mandantId: string; onDone(termin: Termin): void; onCancel(): void }) {
  const context=useErna();
  return <FormEditor title={termin?'TERMIN BEARBEITEN':'NEUER TERMIN'} fields={TERMIN_FIELDS} initialValues={{titel:termin?.titel??'',datum:displayDate(termin?.datum??today()),uhrzeit:termin?.uhrzeit??'',prioritaet:termin?.prioritaet??'mittel',typ:termin?.typ??'termin',notiz:termin?.notiz??''}} onCancel={onCancel} onSave={async values=>{
    const datum=parseGermanDate(values.datum?.trim()??'');if(!datum)throw new Error('Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.');
    const uhrzeit=values.uhrzeit?.trim()||null;if(uhrzeit&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit))throw new Error('Bitte eine gültige Uhrzeit im Format HH:mm eingeben.');
    const prioritaet=values.prioritaet,typ=values.typ;if(prioritaet!=='hoch'&&prioritaet!=='mittel'&&prioritaet!=='niedrig')throw new Error('Ungültige Priorität.');if(typ!=='frist'&&typ!=='termin'&&typ!=='erinnerung')throw new Error('Ungültiger Termintyp.');
    const saved=await saveTermin({...termin,id:termin?.id??uuid(),mandant_id:termin?.mandant_id??mandantId,titel:values.titel?.trim()??'',datum,uhrzeit,prioritaet,typ,notiz:values.notiz??'',erledigt:termin?.erledigt??false,erstellt:termin?.erstellt??timestamp(),quelle_notiz_id:termin?.quelle_notiz_id??null,ai_erkannt:termin?.ai_erkannt??false});
    onDone(saved);context.setMessage('Termin gespeichert.');if(!await context.run(context.refresh))context.setMessage('Termin gespeichert. Die Ansicht konnte nicht aktualisiert werden.',true);
  }}/>;
}
export const TERMINGRUPPEN: DateGroup[]=['Überfällig','Heute','Diese Woche','Nächste Woche','Später','Erledigt'];
export function groupColor(group: DateGroup): string {return group==='Überfällig'?THEME.accentRed:group==='Heute'?THEME.accentYellow:THEME.fgPrimary;}
export type TerminRow<T extends Termin>={kind:'header';label:DateGroup;count:number}|{kind:'termin';value:T};
export function terminRows<T extends Termin>(termine:T[]):TerminRow<T>[] {return TERMINGRUPPEN.flatMap(group=>{const entries=termine.filter(t=>dateGroup(t.datum,t.erledigt)===group);return entries.length?[{kind:'header' as const,label:group,count:entries.length},...entries.map(value=>({kind:'termin' as const,value}))]:[];});}
export function TermineScreen() {
  const context=useErna(),[archive,setArchive]=useState(false),[selectedId,setSelectedId]=useState<string|null>(null),[editing,setEditing]=useState<Termin|'new'|null>(null);
  const termine=(context.akte?.termine??[]).filter(t=>t.erledigt===archive),cursor=Math.max(0,termine.findIndex(t=>t.id===selectedId)),selected=termine[cursor];
  const active=!context.overlayOpen&&!context.editorOpen&&!editing&&!context.busy;
  useInput((input,key)=>{
    const fn=functionKey(input,key);
    if(fn===3&&context.mandant){context.setFocus('content');setEditing('new');return;}
    if(fn===4&&selected){context.setFocus('content');setEditing(selected);return;}
    if(fn===8){context.setFocus('content');setArchive(a=>!a);setSelectedId(null);return;}
    if(context.focus!=='content')return;
    if(key.return&&selected)setEditing(selected);
    else if(input===' '&&selected)void context.run(async()=>{await saveTermin({...selected,erledigt:!selected.erledigt});await context.refresh();context.setMessage(selected.erledigt?'Termin wieder geöffnet.':'Termin erledigt.');});
    else if(key.upArrow||key.downArrow){const next=termine[Math.max(0,Math.min(termine.length-1,cursor+(key.downArrow?1:-1)))];if(next)setSelectedId(next.id);}
  },{isActive:active});
  if(!context.mandant)return <Text color={THEME.fgSecondary}>Bitte zuerst Mandant auswählen (F2).</Text>;
  if(editing)return <TerminEditor termin={editing==='new'?undefined:editing} mandantId={context.mandant.id} onDone={saved=>{setEditing(null);setArchive(saved.erledigt);setSelectedId(saved.id);}} onCancel={()=>setEditing(null)}/>;
  const rows=terminRows(termine),selectedRow=rows.findIndex(row=>row.kind==='termin'&&row.value.id===selected?.id),visible=Math.max(1,context.height-5),start=Math.max(0,selectedRow-visible+1);
  return <Box flexDirection="column" height={context.height}><Text bold color={THEME.fgSelected}>{archive?'ERLEDIGTE TERMINE':'OFFENE TERMINE'} ({termine.length})</Text><Text color={THEME.fgSecondary}>F3 Neu · F4 Bearbeiten · Leer {archive?'Wieder öffnen':'Erledigt'} · F8 {archive?'Offene':'Archiv'}</Text>{rows.slice(start,start+visible).map(row=>row.kind==='header'?<Text key={row.label} bold color={groupColor(row.label)}>{row.label.toLocaleUpperCase('de')} ({row.count})</Text>:<Text key={row.value.id} color={row.value.id===selected?.id?THEME.fgSelected:groupColor(dateGroup(row.value.datum,row.value.erledigt))} backgroundColor={row.value.id===selected?.id?THEME.bgSelected:undefined} wrap="truncate-end">{row.value.id===selected?.id?'▸':' '} {displayDate(row.value.datum)} {row.value.uhrzeit??'     '} {row.value.unsicher?'[?] ':''}{terminalText(row.value.titel)}</Text>)}{!termine.length&&<Text color={THEME.fgSecondary}>{archive?'Keine erledigten Termine.':'Keine offenen Termine. F3: Termin anlegen.'}</Text>}{selected&&<><Text color={THEME.fgSecondary} wrap="truncate-end">{selected.typ} · Priorität {selected.prioritaet}{selected.ai_erkannt?' · KI erkannt':''}{selected.unsicher?' · Unsicher: prüfen':''}</Text><Text color={THEME.fgSecondary} wrap="truncate-end">{terminalText(selected.notiz)}</Text></>}</Box>;
}
