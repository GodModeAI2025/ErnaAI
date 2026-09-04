import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { v4 as uuid } from 'uuid';
import { useErna } from '../../app/App.js';
import type { Notiz } from '../../app/types.js';
import { THEME } from '../../app/constants.js';
import { deleteNotiz, saveNotiz } from '../../data/notizen.js';
import { displayDate, timestamp } from '../../utils/dates.js';
import { terminalText, truncate } from '../../utils/format.js';
import { functionKey } from '../../utils/keyboard.js';
import { ScrollableText } from '../layout/ContentPane.js';
import { TextEditor } from '../shared/TextEditor.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
export function NotizenScreen() {
  const context=useErna(), {setSelectedNotiz}=context;
  const [selectedId,setSelectedId]=useState<string|null>(null),[editing,setEditing]=useState<Notiz|'new'|null>(null),[deleting,setDeleting]=useState<Notiz|null>(null);
  const notes=context.akte?.notizen??[], cursor=Math.max(0,notes.findIndex(note=>note.id===selectedId)),selected=notes[cursor]??null;
  const active=!context.overlayOpen&&!context.editorOpen&&!editing&&!deleting&&!context.busy;
  useEffect(()=>{setSelectedNotiz(selected);},[selected,setSelectedNotiz]);
  useInput((input,key)=>{
    const fn=functionKey(input,key);
    if(fn===3&&context.mandant){context.setFocus('content');setEditing('new');return;}
    if(fn===4&&selected){context.setFocus('content');setEditing(selected);return;}
    if(fn===8&&selected){context.setFocus('content');setDeleting(selected);return;}
    if(context.focus!=='content')return;
    if(key.return&&selected)setEditing(selected);
    else if(key.upArrow||key.downArrow){const next=notes[Math.max(0,Math.min(notes.length-1,cursor+(key.downArrow?1:-1)))];if(next)setSelectedId(next.id);}
  },{isActive:active});
  if(!context.mandant)return <Text color={THEME.fgSecondary}>Bitte zuerst Mandant auswählen (F2).</Text>;
  if(deleting)return <ConfirmDialog message={`Notiz „${terminalText(deleting.titel)}“ endgültig löschen?`} onCancel={()=>setDeleting(null)} onConfirm={async()=>{await deleteNotiz(deleting.mandant_id,deleting.id);await context.refresh();setDeleting(null);context.setMessage('Notiz gelöscht.');}}/>;
  if(editing){const source=editing==='new'?null:editing;return <TextEditor title={source?'NOTIZ BEARBEITEN':'NEUE NOTIZ'} initialTitle={source?.titel??''} initialText={source?.inhalt??''} onCancel={()=>setEditing(null)} onSave={async(titel,inhalt)=>{const now=timestamp();const saved=await saveNotiz(source?{...source,titel,inhalt,ai_verarbeitet:false,ai_zusammenfassung:'',ai_folgeaktionen:[]}:{id:uuid(),mandant_id:context.mandant!.id,typ:'notiz',titel,inhalt,erstellt:now,geaendert:now,autor:context.config.kanzlei.standardBearbeiter||context.mandant!.bearbeiter,tags:[],ai_zusammenfassung:'',ai_folgeaktionen:[],ai_verarbeitet:false});setSelectedId(saved.id);setEditing(null);context.setMessage('Notiz gespeichert.');context.afterSave(saved,!source);if(!await context.run(context.refresh))context.setMessage('Notiz gespeichert. Die Ansicht konnte nicht aktualisiert werden.',true);}}/>;}
  const listWidth=Math.max(20,Math.floor(context.width*.42)), previewWidth=Math.max(16,context.width-listWidth-2), visible=Math.max(1,Math.floor((context.height-2)/2)),start=Math.max(0,cursor-visible+1);
  return <Box height={context.height}><Box flexDirection="column" width={listWidth} flexShrink={0} paddingRight={1}><Text bold color={THEME.fgSelected}>NOTIZEN ({notes.length})</Text>{notes.slice(start,start+visible).map((note,index)=><Box key={note.id} flexDirection="column"><Text color={start+index===cursor?THEME.fgSelected:THEME.fgPrimary} backgroundColor={start+index===cursor?THEME.bgSelected:undefined} wrap="truncate-end">{start+index===cursor?'▸':' '} {terminalText(note.titel)}</Text><Text color={THEME.fgSecondary}>  {displayDate(note.erstellt)}</Text></Box>)}{!notes.length&&<Text color={THEME.fgSecondary}>F3: erste Notiz erfassen.</Text>}{notes.length>visible&&<Text color={THEME.fgSecondary}>{cursor+1}/{notes.length} · ↑↓</Text>}</Box><Box flexDirection="column" width={previewWidth} paddingLeft={1} borderLeft borderStyle="single" borderColor={THEME.border}>{selected?<><Text bold color={THEME.fgSelected} wrap="truncate-end">{terminalText(selected.titel)}</Text>{selected.ai_zusammenfassung&&<Text color={THEME.fgDimmed} wrap="truncate-end">{truncate(terminalText(selected.ai_zusammenfassung),previewWidth-2)}</Text>}<Text color={THEME.accentOrange} wrap="truncate-end">{selected.tags.map(tag=>`[${terminalText(tag)}]`).join(' ')}</Text><ScrollableText text={selected.inhalt} width={previewWidth-3} height={Math.max(2,context.height-5)} active={active&&context.focus==='content'}/></>:<Text color={THEME.fgSecondary}>Notiz auswählen oder mit F3 anlegen.</Text>}</Box></Box>;
}
