import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { v4 as uuid } from 'uuid';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import type { Entscheidung, EntscheidungsStatus } from '../../app/types.js';
import { deleteEntscheidung, saveEntscheidung } from '../../data/entscheidungen.js';
import { displayDate, timestamp } from '../../utils/dates.js';
import { terminalText } from '../../utils/format.js';
import { functionKey } from '../../utils/keyboard.js';
import { ScrollableText } from '../layout/ContentPane.js';
import { TextEditor } from '../shared/TextEditor.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
interface EditingDecision { source: Entscheidung|null; text: string; title: string; status: EntscheidungsStatus }
const EMPTY_DECISION='## Sachverhalt\n\n\n## Relevante Rechtsgrundlagen\n\n[PRÜFEN]\n\n## Entscheidung\n\n\n## Begründung\n\n\n## Offene Punkte\n\n- [ ] ';
export function EntscheidungenScreen() {
  const context=useErna(),[selectedId,setSelectedId]=useState<string|null>(null),[editing,setEditing]=useState<EditingDecision|null>(null),[deleting,setDeleting]=useState<Entscheidung|null>(null);
  const decisions=context.akte?.entscheidungen??[],cursor=Math.max(0,decisions.findIndex(d=>d.id===selectedId)),selected=decisions[cursor];
  const active=!context.overlayOpen&&!context.editorOpen&&!editing&&!deleting&&!context.busy;
  useEffect(()=>{if(context.decisionDraft!==null&&!editing&&context.mandant)setEditing({source:null,text:context.decisionDraft,title:context.decisionDraftTitle||'KI-Entscheidungsentwurf',status:'entwurf'});},[context.decisionDraft,context.decisionDraftTitle,context.mandant,editing]);
  useInput((input,key)=>{
    const fn=functionKey(input,key);
    if(fn===3&&context.mandant){context.setFocus('content');setEditing({source:null,text:EMPTY_DECISION,title:'',status:'entwurf'});return;}
    if(fn===4&&selected){context.setFocus('content');setEditing({source:selected,text:selected.inhalt,title:selected.titel,status:selected.status});return;}
    if(fn===8&&selected){context.setFocus('content');setDeleting(selected);return;}
    if(context.focus!=='content')return;
    if(key.return&&selected)setEditing({source:selected,text:selected.inhalt,title:selected.titel,status:selected.status});
    else if(key.upArrow||key.downArrow){const next=decisions[Math.max(0,Math.min(decisions.length-1,cursor+(key.downArrow?1:-1)))];if(next)setSelectedId(next.id);}
  },{isActive:active});
  const mandant=context.mandant;if(!mandant)return <Text color={THEME.fgSecondary}>Bitte zuerst Mandant auswählen (F2).</Text>;
  if(deleting)return <ConfirmDialog message={`Entscheidung „${terminalText(deleting.titel)}“ mit Audit-Trail endgültig löschen?`} onCancel={()=>setDeleting(null)} onConfirm={async()=>{await deleteEntscheidung(deleting.mandant_id,deleting.id);await context.refresh();setDeleting(null);context.setMessage('Entscheidung gelöscht.');}}/>;
  if(editing)return <TextEditor title={editing.source?'ENTSCHEIDUNG BEARBEITEN':'NEUE ENTSCHEIDUNG'} initialTitle={editing.title} initialText={editing.text} initialUnsaved={!editing.source} status={{value:editing.status,options:['entwurf','final','widerrufen'],onChange:value=>{if(value==='entwurf'||value==='final'||value==='widerrufen')setEditing(previous=>previous?{...previous,status:value}:null);}}} onCancel={()=>{context.setDecisionDraft(null);setEditing(null);}} onSave={async(titel,inhalt)=>{const now=timestamp(),source=editing.source,saved=await saveEntscheidung(source?{...source,titel,inhalt,status:editing.status}:{id:uuid(),mandant_id:mandant.id,typ:'entscheidung',titel,inhalt,erstellt:now,geaendert:now,entschieden_von:context.config.kanzlei.standardBearbeiter||mandant.bearbeiter,status:editing.status,tags:[],audit_trail:[]});context.setDecisionDraft(null);setEditing(null);setSelectedId(saved.id);context.setMessage('Entscheidung gespeichert; Audit-Trail ergänzt.');context.afterSave(saved,!source);if(!await context.run(context.refresh))context.setMessage('Entscheidung gespeichert. Die Ansicht konnte nicht aktualisiert werden.',true);}}/>;
  const listWidth=Math.max(20,Math.floor(context.width*.42)),previewWidth=Math.max(16,context.width-listWidth-2),visible=Math.max(1,Math.floor((context.height-2)/2)),start=Math.max(0,cursor-visible+1);
  const preview=selected?`${selected.inhalt}\n\nAUDIT-TRAIL\nDatum | Aktion | Benutzer\n${selected.audit_trail.map(item=>`${displayDate(item.datum)} ${item.datum.slice(11,16)} | ${item.aktion} | ${item.benutzer}`).join('\n')}`:'';
  return <Box height={context.height}><Box flexDirection="column" width={listWidth} flexShrink={0} paddingRight={1}><Text bold color={THEME.fgSelected}>ENTSCHEIDUNGEN ({decisions.length})</Text>{decisions.slice(start,start+visible).map((decision,index)=><Box key={decision.id} flexDirection="column"><Text color={start+index===cursor?THEME.fgSelected:THEME.fgPrimary} backgroundColor={start+index===cursor?THEME.bgSelected:undefined} wrap="truncate-end">{start+index===cursor?'▸':' '} {terminalText(decision.titel)}</Text><Text color={decision.status==='final'?THEME.accentGreen:decision.status==='widerrufen'?THEME.accentRed:THEME.accentYellow} wrap="truncate-end">[{decision.status.toLocaleUpperCase('de')}] {displayDate(decision.erstellt)}</Text></Box>)}{!decisions.length&&<Text color={THEME.fgSecondary}>F3: Entscheidung erfassen.{ '\n' }F9: KI-Dokumentation.</Text>}{decisions.length>visible&&<Text color={THEME.fgSecondary}>{cursor+1}/{decisions.length} · ↑↓</Text>}</Box><Box flexDirection="column" width={previewWidth} paddingLeft={1} borderLeft borderTop={false} borderRight={false} borderBottom={false} borderStyle="single" borderColor={THEME.border}>{selected?<><Text bold color={THEME.fgSelected} wrap="truncate-end">{terminalText(selected.titel)}</Text><Text color={THEME.accentOrange} wrap="truncate-end">{selected.tags.map(tag=>`[${terminalText(tag)}]`).join(' ')}</Text><ScrollableText text={preview} width={previewWidth-3} height={Math.max(2,context.height-3)} active={active&&context.focus==='content'}/></>:<Text color={THEME.fgSecondary}>Entscheidung auswählen oder mit F3 anlegen.</Text>}</Box></Box>;
}
