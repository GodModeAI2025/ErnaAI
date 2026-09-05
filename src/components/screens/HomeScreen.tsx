import { Box, Text } from 'ink';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import { displayDate, displayTime, displayWeekday, isOverdue } from '../../utils/dates.js';
import { terminalText, truncate } from '../../utils/format.js';
export function HomeScreen() {
  const { mandant,akte,allTermine,mandanten,width,height }=useErna();
  const open=akte?.termine.filter(t=>!t.erledigt)??[], next=allTermine.filter(t=>!t.erledigt&&t.typ==='frist').slice(0,3);
  const activities=[...(akte?.notizen??[]).map(n=>({datum:n.geaendert,titel:n.titel,typ:'Notiz'})),...(akte?.entscheidungen??[]).map(e=>({datum:e.geaendert,titel:e.titel,typ:'Entscheidung'})),...(akte?.termine??[]).map(t=>({datum:t.erstellt,titel:t.titel,typ:'Termin'}))].sort((a,b)=>b.datum.localeCompare(a.datum)).slice(0,5);
  const now=new Date();
  return <Box flexDirection="column" height={height} overflow="hidden"><Text bold color={THEME.accent}>{displayWeekday(now)}, {displayDate(now)} · {displayTime(now)}</Text><Text color={THEME.fgPrimary}>{mandant?`${terminalText(mandant.name)} · ${mandant.id}`:'Willkommen bei ERNA-AI'}</Text><Box height={1}/>{!mandanten.length?<><Text color={THEME.fgPrimary}>Dein lokaler Kanzleiarbeitsplatz ist bereit.</Text><Text color={THEME.fgSecondary}>F7 → F3: ersten Mandanten anlegen.{ '\n' }Mit --seed oder in den Einstellungen Demodaten laden.</Text></>:<><Text color={THEME.fgPrimary}>{akte?.notizen.length??0} Notizen · {open.length} offene Termine · <Text color={THEME.accentRed}>{open.filter(t=>t.typ==='frist'&&isOverdue(t.datum)).length} überfällige Fristen</Text></Text><Box height={1}/><Text bold color={THEME.fgSelected}>NÄCHSTE FRISTEN · ALLE MANDANTEN</Text>{next.length?next.map(t=><Text key={t.id} color={isOverdue(t.datum)?THEME.accentRed:THEME.accentYellow} wrap="truncate-end">{displayDate(t.datum)}  {terminalText(t.mandant_name)} · {terminalText(t.titel)}</Text>):<Text color={THEME.fgSecondary}>Keine offenen Fristen.</Text>}<Box height={1}/><Text bold color={THEME.fgSelected}>LETZTE AKTIVITÄTEN</Text>{activities.map((a,i)=><Text key={`${a.datum}-${i}`} color={THEME.fgSecondary}>{displayDate(a.datum)} {a.datum.slice(11,16)}  {truncate(terminalText(a.titel),Math.max(12,width-20))}</Text>)}</>}</Box>;
}
