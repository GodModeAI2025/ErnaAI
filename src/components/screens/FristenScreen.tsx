import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import type { Termin } from '../../app/types.js';
import { saveTermin } from '../../data/termine.js';
import { dateGroup, daysBetween, displayDate, today } from '../../utils/dates.js';
import { terminalText, truncate } from '../../utils/format.js';
import { functionKey } from '../../utils/keyboard.js';
import { groupColor, TerminEditor, TERMINGRUPPEN, type TerminRow } from './TermineScreen.js';
type GlobalTermin=Termin&{mandant_name:string};
export function FristenScreen() {
  const context=useErna(),[selectedId,setSelectedId]=useState<string|null>(null),[editing,setEditing]=useState<Termin|null>(null);
  const termine=context.allTermine.filter(t=>!t.erledigt),cursor=Math.max(0,termine.findIndex(t=>t.id===selectedId)),selected=termine[cursor],visible=Math.max(1,context.height-5);
  const active=!context.overlayOpen&&!context.editorOpen&&!editing&&!context.busy;
  useInput((input,key)=>{
    const fn=functionKey(input,key);
    if(fn===4&&selected){context.setFocus('content');setEditing(selected);return;}
    if(context.focus!=='content')return;
    if(key.return&&selected)setEditing(selected);
    else if(input===' '&&selected)void context.run(async()=>{await saveTermin({...selected,erledigt:true});await context.refresh();context.setMessage(`Termin von ${selected.mandant_name} erledigt.`);});
    else if(key.upArrow||key.downArrow||key.pageUp||key.pageDown){const next=termine[Math.max(0,Math.min(termine.length-1,cursor+(key.downArrow||key.pageDown?1:-1)*(key.pageUp||key.pageDown?visible:1)))];if(next)setSelectedId(next.id);}
  },{isActive:active});
  if(editing)return <TerminEditor termin={editing} mandantId={editing.mandant_id} onDone={saved=>{setEditing(null);setSelectedId(saved.id);}} onCancel={()=>setEditing(null)}/>;
  const rows:TerminRow<GlobalTermin>[]=TERMINGRUPPEN.filter(group=>group!=='Erledigt').flatMap(group=>{const entries=termine.filter(t=>dateGroup(t.datum)===group);return [{kind:'header' as const,label:group,count:entries.length},...entries.map(value=>({kind:'termin' as const,value}))];});
  const selectedRow=rows.findIndex(row=>row.kind==='termin'&&row.value.id===selected?.id),start=Math.max(0,selectedRow-visible+1),clientWidth=Math.max(10,Math.min(22,Math.floor(context.width*.28)));
  return <Box flexDirection="column" height={context.height}><Text bold color={THEME.fgSelected}>FRISTEN · ALLE MANDANTEN · {displayDate(new Date())}</Text><Text color={THEME.fgSecondary}>F4 Bearbeiten · Leer Erledigt · F9 KI · Bild↑↓</Text>{rows.slice(start,start+visible).map(row=>row.kind==='header'?<Text key={row.label} bold color={groupColor(row.label)}>{row.label.toLocaleUpperCase('de')} ({row.count})</Text>:<Text key={row.value.id} color={row.value.id===selected?.id?THEME.fgSelected:groupColor(dateGroup(row.value.datum))} backgroundColor={row.value.id===selected?.id?THEME.bgSelected:undefined} wrap="truncate-end">{row.value.id===selected?.id?'▸':' '} {displayDate(row.value.datum)} {truncate(terminalText(row.value.mandant_name),clientWidth).padEnd(clientWidth)} {row.value.unsicher?'[?] ':''}{terminalText(row.value.titel)}</Text>)}{!termine.length&&<Text color={THEME.accentGreen}>Keine offenen Fristen oder Termine.</Text>}{selected&&<><Text color={THEME.fgSecondary} wrap="truncate-end">{terminalText(selected.mandant_name)} · {selected.typ} · {selected.prioritaet}{selected.datum<today()?` · ${daysBetween(today(),selected.datum)} Tage überfällig`:''}{selected.unsicher?' · Unsicher: prüfen':''}</Text><Text color={THEME.fgSecondary} wrap="truncate-end">{terminalText(selected.notiz)}</Text></>}</Box>;
}
