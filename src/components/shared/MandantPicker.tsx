import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import { displayDate } from '../../utils/dates.js';
import { errorMessage, terminalText, truncate } from '../../utils/format.js';
import { isReservedInput } from '../../utils/keyboard.js';
export function MandantPicker({ onClose }: { onClose(): void }) {
  const context = useErna(), [query,setQuery] = useState(''), [selected,setSelected] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const clients = useMemo(() => context.mandanten.filter(m => `${m.name} ${m.id}`.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de'))),[context.mandanten,query]);
  const activity = [...(context.index?.mandanten ?? [])].sort((a,b)=>b.letzte_aktivitaet.localeCompare(a.letzte_aktivitaet));
  const lastActivity = (id:string):string => { const item=activity.find(client=>client.id===id); return item ? displayDate(item.letzte_aktivitaet) : '—'; };
  const recent = context.recentMandantIds?.length ? context.recentMandantIds.flatMap(id => activity.filter(client => client.id === id)).slice(0,3) : activity.slice(0,3);
  const visible = Math.max(2,context.height-9), cursor = Math.min(selected,Math.max(0,clients.length-1)), start = Math.max(0,cursor-visible+1);
  const choose = async () => { const client=clients[cursor]; if(!client || busy)return; setBusy(true); try { await context.selectMandant(client.id); onClose(); } catch(cause) { setError(errorMessage(cause)); setBusy(false); } };
  useInput((_input,key)=>{if(key.escape)onClose();if(key.upArrow)setSelected(s=>Math.max(0,s-1));if(key.downArrow)setSelected(s=>Math.min(clients.length-1,s+1));},{isActive:!busy});
  return <Box flexDirection="column"><Box><Text color={THEME.accent}>Suche: </Text><TextInput value={query} focus={!busy} onChange={value=>{if(!isReservedInput(value)){setQuery(value);setSelected(0);}}} onSubmit={()=>void choose()}/></Box><Text color={THEME.fgSecondary}>↑↓ auswählen · Enter öffnen · ESC abbrechen</Text>{clients.slice(start,start+visible).map((client,index)=><Text key={client.id} color={start+index===cursor?THEME.fgSelected:THEME.fgPrimary} backgroundColor={start+index===cursor?THEME.bgSelected:undefined} wrap="truncate-end">{start+index===cursor?'▸':' '} {truncate(terminalText(client.name),Math.max(12,context.width-40))} · {client.id} · {client.aktiv?'aktiv':'Archiv'} · {lastActivity(client.id)}</Text>)}{!clients.length&&<Text color={THEME.fgSecondary}>Keine passenden Mandanten.</Text>}<Text color={THEME.fgSecondary}>Letzte Mandanten:</Text>{recent.map(client=><Text key={client.id} color={THEME.fgSecondary} wrap="truncate-end">{terminalText(client.name)} · {displayDate(client.letzte_aktivitaet)}</Text>)}{busy&&<Text color={THEME.accentYellow}>Mandantenakte wird geladen …</Text>}{error&&<Text color={THEME.accentRed}>{terminalText(error)}</Text>}</Box>;
}
