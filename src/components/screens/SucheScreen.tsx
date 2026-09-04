import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import { AiResponseError } from '../../ai/client.js';
import { sucheMitAi, volltextSuche } from '../../ai/suche.js';
import { displayDate } from '../../utils/dates.js';
import { errorMessage, terminalText } from '../../utils/format.js';
import { isReservedInput } from '../../utils/keyboard.js';
import { ScrollableText } from '../layout/ContentPane.js';
import { AiLoadingSpinner } from '../shared/AiLoadingSpinner.js';
export function SucheScreen() {
  const context=useErna(),{searchMode,setSearchMode}=context;
  const [query,setQuery]=useState(''),[output,setOutput]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const controller=useRef<AbortController|null>(null),epoch=useRef(0);
  const mandantId=context.mandant?.id,active=context.focus==='content'&&!context.overlayOpen;
  useEffect(()=>{epoch.current++;controller.current?.abort();setOutput('');setError('');setBusy(false);return()=>{epoch.current++;controller.current?.abort();};},[mandantId]);
  useInput((_input,key)=>{if(key.tab&&!key.shift){epoch.current++;controller.current?.abort();setSearchMode(searchMode==='ki'?'volltext':'ki');setOutput('');setError('');setBusy(false);}},{isActive:active});
  const search=async():Promise<void>=>{
    if(!mandantId){setError('Bitte zuerst Mandant auswählen (F2).');return;}
    if(!query.trim()){setError('Bitte einen Suchbegriff eingeben.');return;}
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const request=++epoch.current;
    setBusy(true);setError('');setOutput('');
    try{
      if(searchMode==='volltext'){
        const results=await volltextSuche(mandantId,query.trim());
        if(request!==epoch.current)return;
        setOutput(results.length?`${results.length} Treffer\n\n${results.map((result,i)=>`${i+1}. ${result.titel}\nQuelle: ${result.pfad} · ${displayDate(result.datum)}\n${result.auszug}`).join('\n\n')}`:'Keine passenden Informationen in dieser Mandantenakte gefunden.');
      }else{
        if(!context.aiAvailable)throw new Error('KI-Suche ist deaktiviert. API-Schlüssel und Datenschutzfreigabe in den Einstellungen prüfen.');
        const result=await sucheMitAi(mandantId,query.trim(),text=>{if(request===epoch.current&&!abort.signal.aborted)setOutput(text);},{signal:abort.signal});
        if(request!==epoch.current||abort.signal.aborted)return;
        setOutput(`${result.antwort}\n\nQUELLEN DER ÜBERGEBENEN AKTE\n${result.quellen.map(source=>`${source.pfad} · ${displayDate(source.datum)}`).join('\n')}${result.ausgelassen?`\n[${result.ausgelassen} Dateien ausgelassen]`:''}`);
      }
    }catch(cause){if(request===epoch.current&&!abort.signal.aborted){setError(errorMessage(cause));if(cause instanceof AiResponseError)setOutput(`ROHTEXT\n${cause.rawText}`);}}
    finally{if(request===epoch.current)setBusy(false);}
  };
  return <Box flexDirection="column" height={context.height}>
    <Text color={THEME.fgSecondary}><Text bold color={searchMode==='volltext'?THEME.accent:THEME.fgSecondary}>[1 Volltext]</Text>  <Text bold color={searchMode==='ki'?THEME.accent:THEME.fgSecondary}>[2 KI-Suche]</Text> · Tab wechseln · Shift+Tab Navigation</Text>
    <Box><Text color={THEME.accent}>Suche: </Text><TextInput value={query} focus={active&&!busy} onChange={value=>{if(!isReservedInput(value))setQuery(value);}} onSubmit={()=>void search()}/></Box>
    {busy?<AiLoadingSpinner label={searchMode==='ki'?'Claude durchsucht die Akte …':'Dateien werden durchsucht …'}/>:<Text color={error?THEME.accentRed:THEME.fgSecondary}>{error?terminalText(error):'Enter suchen · Bild↑↓ Ergebnisse lesen · ESC zurück'}</Text>}
    <ScrollableText text={output||'Suchbegriff eingeben. Die Volltextsuche arbeitet vollständig lokal.'} width={context.width} height={Math.max(2,context.height-4)} active={active}/>
  </Box>;
}
