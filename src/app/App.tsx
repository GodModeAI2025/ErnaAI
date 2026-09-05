import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { DEFAULT_CONFIG, NAVIGATION, PRIVACY_NOTICE, THEME } from './constants.js';
import type { AiAction, Akte, AppContextValue, Entscheidung, ErnaConfig, ErnaIndex, Mandant, Notiz, Screen, Termin } from './types.js';
import { errorMessage, terminalText } from '../utils/format.js';
import { functionKey, isReservedInput } from '../utils/keyboard.js';
import { listMandanten } from '../data/mandanten.js';
import { loadAkte, loadAllTermine, rebuildIndex } from '../data/index.js';
import { loadConfig, saveConfig } from '../data/filesystem.js';
import { seedDemoData } from '../data/seed.js';
import { getNotiz, listNotizen } from '../data/notizen.js';
import { AiResponseError, assertAiAllowed, hasApiKey } from '../ai/client.js';
import { strukturierenNotiz, verarbeiteDokument } from '../ai/strukturieren.js';
import { dokumentiereEntscheidung } from '../ai/entscheidung.js';
import { erstelleTagesbrief } from '../ai/tagesbrief.js';
import { TextEditor } from '../components/shared/TextEditor.js';
import { erkenneFristen } from '../ai/fristen.js';
import { StatusBar } from '../components/layout/StatusBar.js';
import { Sidebar } from '../components/layout/Sidebar.js';
import { ActionBar } from '../components/layout/ActionBar.js';
import { ContentPane, ScrollableText } from '../components/layout/ContentPane.js';
import { ErrorBanner } from '../components/shared/ErrorBanner.js';
import { AiLoadingSpinner } from '../components/shared/AiLoadingSpinner.js';
import { MandantPicker } from '../components/shared/MandantPicker.js';
import { NotizenScreen } from '../components/screens/NotizenScreen.js';
import { TermineScreen } from '../components/screens/TermineScreen.js';
import { EntscheidungenScreen } from '../components/screens/EntscheidungenScreen.js';
import { FristenScreen } from '../components/screens/FristenScreen.js';
import { SucheScreen } from '../components/screens/SucheScreen.js';
import { EinstellungenScreen } from '../components/screens/EinstellungenScreen.js';
import { MandantScreen } from '../components/screens/MandantScreen.js';
import { HomeScreen } from '../components/screens/HomeScreen.js';
const ErnaContext = createContext<AppContextValue | null>(null);
export function useErna(): AppContextValue { const context = useContext(ErnaContext); if (!context) throw new Error('ERNA-Kontext ist nicht verfügbar.'); return context; }
const SCREENS: Record<Screen, ComponentType> = { home: HomeScreen, notizen: NotizenScreen, termine: TermineScreen, entscheidungen: EntscheidungenScreen, fristen: FristenScreen, suche: SucheScreen, mandant: MandantScreen, einstellungen: EinstellungenScreen };
export function App({ initialConfig }: { initialConfig: ErnaConfig | null }) {
  const [configured,setConfigured]=useState(initialConfig);
  return configured?<WorkspaceApp initialConfig={configured}/>:<SetupWizard onComplete={setConfigured}/>;
}

function SetupWizard({onComplete}:{onComplete(config:ErnaConfig):void}) {
  const {exit}=useApp(),{stdout}=useStdout();
  const [step,setStep]=useState(0),[values,setValues]=useState(['','','']),[accepted,setAccepted]=useState(false);
  const [confirmExit,setConfirmExit]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  const complete=async(demo:boolean):Promise<void>=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    const next=structuredClone(DEFAULT_CONFIG);
    next.kanzlei.name=values[0]?.trim()||'Meine Kanzlei';next.kanzlei.standardBearbeiter=values[1]?.trim()||'';
    next.ai.datenschutzAkzeptiert=accepted;next.ai.aktiviert=accepted;
    try{
      if(demo)await seedDemoData();
      await saveConfig(next);
      if(values[2]?.trim())process.env.ANTHROPIC_API_KEY=values[2].trim();
      onComplete(next);
    }catch(cause){setError(errorMessage(cause));}
    finally{pending.current=false;setBusy(false);}
  };
  const advance=()=>{
    if(step===0&&!values[0]?.trim()){setError('Bitte einen Kanzleinamen eingeben.');return;}
    setError('');setStep(current=>Math.min(4,current+1));
  };
  useInput((input,key)=>{
    if(key.eventType==='release')return;
    if(functionKey(input,key)===10||key.ctrl&&input==='c'){if(!pending.current)setConfirmExit(true);return;}
    if(pending.current)return;
    if(confirmExit){if(input.toLowerCase()==='j')exit();else if(input.toLowerCase()==='n'||key.escape)setConfirmExit(false);return;}
    if(key.escape){setError('');if(step>0)setStep(current=>current-1);else setConfirmExit(true);return;}
    if(key.ctrl||key.meta)return;
    if(step===3&&/^[jn]$/i.test(input)){setAccepted(input.toLowerCase()==='j');setStep(4);}
    else if(step===4&&/^[jn]$/i.test(input))void complete(input.toLowerCase()==='j');
  });
  const labels=['Kanzleiname','Name des Bearbeiters','API-Schlüssel (optional)'];
  return <Box flexDirection="column" width={stdout.columns||100} height={stdout.rows||30} padding={1} backgroundColor={THEME.bg}>
    <Text bold color={THEME.accent}>ERNA-AI · ERSTE EINRICHTUNG · {step+1}/5</Text>
    <Box height={1}/>
    {confirmExit?<><Text color={THEME.accentYellow}>Einrichtung verlassen? Eingaben werden verworfen.</Text><Text>[J] Beenden · [N / ESC] Zurück</Text></>:<>
      {step<3?<><Text color={THEME.fgPrimary}>{labels[step]}</Text><Box><Text color={THEME.accent}>› </Text><TextInput key={step} value={values[step]??''} mask={step===2?'•':undefined} focus={!busy} onChange={value=>{if(!isReservedInput(value))setValues(previous=>previous.map((old,index)=>index===step?terminalText(value).replace(/\n/g,' '):old));}} onSubmit={advance}/></Box>
        {step===2&&<Text color={THEME.fgSecondary}>{hasApiKey()?'Ein Schlüssel aus der Umgebung ist bereits verfügbar. Enter übernimmt ihn.':'Enter überspringt die Eingabe; alle lokalen Funktionen bleiben nutzbar.'}{'\n'}Ein hier eingegebener Schlüssel gilt für diese Sitzung. Dauerhaft in .env hinterlegen.</Text>}
        <Text color={THEME.fgSecondary}>Enter weiter · ESC zurück · F10 beenden</Text></>:step===3?<>
          <Text color={THEME.fgPrimary}>{PRIVACY_NOTICE}</Text><Box height={1}/>
          <Text color={THEME.accentYellow}>[J] Ich bestätige und aktiviere KI-Features</Text>
          <Text color={THEME.fgPrimary}>[N] KI-Features deaktiviert lassen</Text>
        </>:<><Text color={THEME.fgPrimary}>Demodaten laden? [J / N]</Text><Text color={THEME.fgSecondary}>Drei fiktive Mandanten mit Notizen, Terminen und Entscheidungen.{ '\n' }Vorhandene Akten werden übersprungen.</Text></>}
      {busy&&<AiLoadingSpinner label="Einrichtung wird gespeichert …"/>}
      {error&&<ErrorBanner message={error}/>}
    </>}
  </Box>;
}

function WorkspaceApp({ initialConfig }: { initialConfig: ErnaConfig }) {
  const { exit } = useApp(), { stdout } = useStdout();
  const [size,setSize] = useState({ width: stdout.columns || 100, height: stdout.rows || 30 });
  const [config,setConfig] = useState(initialConfig ?? structuredClone(DEFAULT_CONFIG));
  const [mandanten,setMandanten] = useState<Mandant[]>([]), [akte,setAkte] = useState<Akte|null>(null), [index,setIndex] = useState<ErnaIndex|null>(null);
  const [recentMandantIds,setRecentMandantIds] = useState<string[]>([]);
  const [allTermine,setAllTermine] = useState<(Termin & {mandant_name:string})[]>([]);
  const [screen,setScreen] = useState<Screen>('home'), [focus,setFocus] = useState<'navigation'|'content'>('content');
  const [overlay,setOverlay] = useState<'help'|'picker'|'ai'|'output'|'exit'|'decision-input'|null>(null), [editorOpen,setEditorOpen] = useState(false);
  const exitReturnTo=useRef<typeof overlay>(null);
  const [aiInputOpen,setAiInputOpen]=useState(false),[decisionDraftTitle,setDecisionDraftTitle]=useState('');
  const [selectedNotiz,setSelectedNotiz] = useState<Notiz|null>(null), [decisionDraft,setDecisionDraft] = useState<string|null>(null), [searchMode,setSearchMode] = useState<'volltext'|'ki'>('volltext');
  const [aiPending,setAiPending]=useState(0),[aiOutput,setAiOutput]=useState(''),[outputTitle,setOutputTitle]=useState('KI-ERGEBNIS');
  const aiQueue=useRef<Promise<void>>(Promise.resolve()), aiControllers=useRef(new Set<AbortController>()), mounted=useRef(true);
  const [indexWarning,setIndexWarning]=useState('');
  const [message,setNotice] = useState({ text: '', error: false }), [pending,setPending] = useState(0), [now,setNow] = useState(new Date());
  const selectedId = useRef<string|null>(null), refreshEpoch = useRef(0);
  const setMessage = useCallback((text:string,error=false) => setNotice({text,error}),[]);
  const refresh = useCallback(async () => {
    const epoch = ++refreshEpoch.current;
    const [clients,indexResult,appointments] = await Promise.all([listMandanten(),rebuildIndex().then(value=>({value,warning:''})).catch((error:unknown)=>({value:null,warning:`Akten verfügbar; Indexcache konnte nicht aktualisiert werden: ${errorMessage(error)}`})),loadAllTermine()]);
    const id = clients.some(m => m.id === selectedId.current) ? selectedId.current : clients.find(m => m.aktiv)?.id ?? null;
    const nextAkte = id ? await loadAkte(id) : null;
    if (epoch !== refreshEpoch.current) return;
    selectedId.current = id; setMandanten(clients); setIndex(indexResult.value); setIndexWarning(indexResult.warning); setAllTermine(appointments); setAkte(nextAkte);
    setSelectedNotiz(old => old ? nextAkte?.notizen.find(n => n.id === old.id) ?? null : null);
  },[]);
  const run = useCallback(async (operation:()=>Promise<void>) => { setPending(p=>p+1); try { await operation(); return true; } catch(error) { setMessage(errorMessage(error),true); return false; } finally { setPending(p=>p-1); } },[setMessage]);
  const selectMandant = useCallback(async (id:string) => { selectedId.current=id; setRecentMandantIds(ids=>[id,...ids.filter(other=>other!==id)].slice(0,5)); setSelectedNotiz(null); await refresh(); setOverlay(null); setFocus('content'); },[refresh]);
  const updateConfig = useCallback(async (next:ErnaConfig) => { await saveConfig(next); if(!next.ai.aktiviert||!next.ai.datenschutzAkzeptiert)for(const controller of aiControllers.current)controller.abort(); setConfig(next); setMessage('Einstellungen gespeichert.'); },[setMessage]);
  const setSessionApiKey=useCallback((key:string)=>{
    for(const controller of aiControllers.current)controller.abort();
    if(key.trim())process.env.ANTHROPIC_API_KEY=key.trim();else delete process.env.ANTHROPIC_API_KEY;
    setMessage(hasApiKey()?'API-Schlüssel für diese Sitzung gesetzt.':'API-Schlüssel aus dieser Sitzung entfernt · KI deaktiviert.');
  },[setMessage]);
  const navigate = useCallback((next:Screen) => { setScreen(next); setFocus('content'); },[]);
  const reportAiError=useCallback((error:unknown)=>{
    setMessage(errorMessage(error),true);
    if(error instanceof AiResponseError){setOutputTitle('UNGÜLTIGE KI-ANTWORT');setAiOutput(`${error.message}\n\nROHTEXT\n${error.rawText}`);setOverlay('output');}
  },[setMessage]);
  const queueAi=useCallback((operation:(signal:AbortSignal)=>Promise<void>):Promise<void>=>{
    const controller=new AbortController();aiControllers.current.add(controller);setAiPending(count=>count+1);
    const job=aiQueue.current.then(async()=>{if(controller.signal.aborted)return;await operation(controller.signal);}).catch((error:unknown)=>{if(mounted.current&&!controller.signal.aborted)reportAiError(error);}).finally(()=>{aiControllers.current.delete(controller);if(mounted.current)setAiPending(count=>count-1);});
    aiQueue.current=job;return job;
  },[reportAiError]);
  const runAi=useCallback(async(action:AiAction)=>{
    if(action==='tagesbrief'){
      await queueAi(async signal=>{
        setOutputTitle('TAGESBRIEF · ALLE FREIGEGEBENEN MANDANTEN');setAiOutput('');setOverlay('output');
        const result=await erstelleTagesbrief(text=>setAiOutput(text),{signal});
        setAiOutput(result);setMessage('Tagesbrief erstellt. KI-Empfehlungen bitte fachlich prüfen.');
      });return;
    }
    const id=selectedId.current;
    if(!id){setMessage('Bitte zuerst Mandant auswählen (F2).',true);return;}
    if(action==='suche'||action==='entscheidung'){
      try{await assertAiAllowed([id]);if(action==='suche'){setSearchMode('ki');navigate('suche');}else{setAiInputOpen(true);setOverlay('decision-input');}}
      catch(error){reportAiError(error);}return;
    }
    await queueAi(async signal=>{
      await assertAiAllowed([id]);
      if(action==='strukturieren'||action==='fristen'){
        if(!selectedNotiz||selectedNotiz.mandant_id!==id)throw new Error('Bitte zuerst eine Notiz im Bereich Notizen auswählen.');
        const current=await getNotiz(id,selectedNotiz.id);
        const result=action==='strukturieren'?await strukturierenNotiz(current,{signal}):await erkenneFristen(current,{signal});
        await refresh();setMessage(`KI-Ergebnis übernommen: ${result.termine.length} neue Termine, ${result.skipped} übersprungen.`);
      }else if(action==='alle'){
        const notes=await listNotizen(id),failures:string[]=[];let completed=0;
        for(const [i,note] of notes.entries()){
          if(signal.aborted)return;setMessage(`KI analysiert Notiz ${i+1}/${notes.length}: ${note.titel}`);
          try{await verarbeiteDokument(await getNotiz(id,note.id),{strukturieren:true,fristen:true},{signal});completed++;}
          catch(error){if(signal.aborted)return;failures.push(`${note.titel}: ${errorMessage(error)}${error instanceof AiResponseError?`\n${error.rawText}`:''}`);}
        }
        await refresh();
        if(failures.length){setOutputTitle('KI-ANALYSE · FEHLER');setAiOutput(`${completed}/${notes.length} Notizen analysiert.\n\n${failures.join('\n\n')}`);setOverlay('output');setMessage(`${failures.length} Notizen konnten nicht verarbeitet werden.`,true);}
        else setMessage(`${completed} Notizen analysiert.`);
      }
    });
  },[queueAi,selectedNotiz,refresh,setMessage,navigate,reportAiError]);
  const afterSave=useCallback((document:Notiz|Entscheidung,isNew:boolean)=>{
    if(!hasApiKey()||!config.ai.aktiviert||!config.ai.datenschutzAkzeptiert||!mandanten.find(m=>m.id===document.mandant_id)?.ai_features_aktiv)return;
    const snapshot=structuredClone(document);
    const shouldStructure=snapshot.typ==='notiz'&&isNew&&config.ai.autoStrukturierungBeiSave;
    const shouldDetect=config.ai.autoFristenerkennung;
    if(!shouldStructure&&!shouldDetect)return;
    void queueAi(async signal=>{
      const current=await loadConfig();
      const features={strukturieren:shouldStructure&&Boolean(current?.ai.autoStrukturierungBeiSave),fristen:shouldDetect&&Boolean(current?.ai.autoFristenerkennung)};
      if(!features.strukturieren&&!features.fristen)return;
      await verarbeiteDokument(snapshot,features,{signal});await refresh();setMessage(`${snapshot.typ==='notiz'?'Notiz':'Entscheidung'} gespeichert · automatische KI-Verarbeitung abgeschlossen.`);
    });
  },[config,mandanten,queueAi,refresh,setMessage]);
  useEffect(()=>{mounted.current=true;const controllers=aiControllers.current;return()=>{mounted.current=false;for(const controller of controllers)controller.abort();};},[]);
  useEffect(() => { void run(refresh); },[run,refresh]);
  useEffect(() => { const resize=()=>setSize({width:stdout.columns || 100,height:stdout.rows || 30}); stdout.on('resize',resize); const timer=setInterval(()=>setNow(new Date()),1000); return ()=>{stdout.off('resize',resize);clearInterval(timer);}; },[stdout]);
  const aiAvailable = Boolean(hasApiKey() && config.ai.aktiviert && config.ai.datenschutzAkzeptiert && akte?.mandant.ai_features_aktiv);
  useInput((input,key) => {
    const fn=functionKey(input,key);
    if (fn===10 || key.ctrl && input==='c') { if(editorOpen || pending || aiPending){exitReturnTo.current=overlay;setOverlay('exit');} else exit(); return; }
    if(overlay) { if(key.escape && overlay!=='decision-input') setOverlay(overlay==='exit'?exitReturnTo.current:aiInputOpen?'decision-input':null); if(overlay==='exit' && input.toLowerCase()==='j') exit(); if(overlay==='exit' && input.toLowerCase()==='n') setOverlay(exitReturnTo.current); return; }
    if(editorOpen) return;
    if(fn===1) setOverlay('help');
    else if(fn===2) setOverlay('picker');
    else if(fn===5) navigate('suche');
    else if(fn===6) navigate('fristen');
    else if(fn===7) navigate('mandant');
    else if(fn===9) setOverlay('ai');
    else if(key.tab && (screen!=='suche'||key.shift||focus==='navigation')) setFocus(f=>f==='content'?'navigation':'content');
    else if(key.escape) navigate('home');
    else if(focus==='navigation' && (key.upArrow || key.downArrow)) { const i=NAVIGATION.findIndex(n=>n.screen===screen); const next=NAVIGATION[(i+(key.downArrow?1:-1)+NAVIGATION.length)%NAVIGATION.length]; if(next) setScreen(next.screen); }
    else if(focus==='navigation' && (key.return || key.rightArrow)) setFocus('content');
  });
  const context:AppContextValue={config,mandanten,recentMandantIds,mandant:akte?.mandant??null,akte,allTermine,index,screen,focus,overlayOpen:overlay!==null,editorOpen,width:Math.max(20,size.width-(editorOpen||overlay?0:20)-4),height:Math.max(4,size.height-8),busy:pending>0,aiBusy:aiPending>0,aiAvailable,selectedNotiz,decisionDraft,decisionDraftTitle,searchMode,navigate,setFocus,selectMandant,setEditorOpen,setSelectedNotiz,setDecisionDraft,setDecisionDraftTitle,setSearchMode,setMessage,updateConfig,setSessionApiKey,refresh,run,runAi,afterSave};
  const CurrentScreen=SCREENS[screen];
  return <ErnaContext.Provider value={context}><Box flexDirection="column" width={size.width} height={size.height} backgroundColor={THEME.bg}>
    <StatusBar mandant={akte?.mandant??null} now={now} aiAvailable={aiAvailable} width={size.width}/>
    <Box flexGrow={1} minHeight={0}>{!editorOpen && !overlay && <Sidebar screen={screen} focused={focus==='navigation'} akte={akte}/>}
      <ContentPane title={overlay==='output'?outputTitle:overlay==='decision-input'?'KI-ENTSCHEIDUNG':overlay==='help'?'HILFE':overlay==='picker'?'MANDANT WECHSELN':overlay==='ai'?'KI-AKTIONEN':overlay==='exit'?'BEENDEN':NAVIGATION.find(n=>n.screen===screen)?.label.toLocaleUpperCase('de')??'ERNA-AI'} focused={focus==='content'}>
        {overlay==='output'?<ScrollableText text={aiOutput||(aiPending?'Claude antwortet …':'Keine vollständige KI-Antwort erhalten. Fehlermeldung unten beachten.')} width={size.width-4} height={context.height}/>:overlay==='ai'?<AiMenu onChoose={action=>{setOverlay(null);void runAi(action);}}/>:overlay==='picker'?<MandantPicker onClose={()=>setOverlay(null)}/>:overlay==='exit'?<Text color={THEME.accentYellow}>Ungespeicherte Eingaben oder laufende Arbeit verwerfen? [J] Beenden [N] Zurück</Text>:overlay==='help'?<ScrollableText text={'F1 Hilfe · F2 Mandant wechseln · F3 Neu · F4 Bearbeiten\nF5 Suche · F6 Fristen aller Mandanten · F7 Mandantenakte\nF8 Löschen/Archiv · F9 KI-Aktionen · F10 Beenden\nTab/Shift+Tab: Bereich wechseln · ↑↓ auswählen · Enter öffnen\nEditor: Ctrl+S speichern, ESC abbrechen, Enter neue Zeile\nBild↑/Bild↓: Dokument scrollen · Leertaste: Termin erledigen\nmacOS: ggf. Fn+F-Taste; alternativ Alt+1 bis Alt+0\nKI überträgt Daten erst nach deiner Freigabe in den Einstellungen.'} width={size.width-4} height={context.height}/>:null}
        {aiInputOpen&&<Box display={overlay==='decision-input'?'flex':'none'} flexDirection="column" flexGrow={1}>
          <ErnaContext.Provider value={{...context,overlayOpen:overlay!=='decision-input'}}>
            <TextEditor title="KI-ENTSCHEIDUNG · Freitext des Beraters" initialTitle="" initialText="" saveLabel="KI-Entwurf erstellen" onCancel={()=>{setAiInputOpen(false);setOverlay(null);}} onSave={async(title,text)=>{
              const id=selectedId.current;if(!id)throw new Error('Bitte zuerst Mandant auswählen (F2).');
              await queueAi(async signal=>{const draft=await dokumentiereEntscheidung(id,`${title}\n\n${text}`,{signal});setDecisionDraftTitle(title);setDecisionDraft(draft);setAiInputOpen(false);setOverlay(null);navigate('entscheidungen');setMessage('KI-Entwurf erstellt. Bitte prüfen und mit Ctrl+S speichern.');});
            }}/>
          </ErnaContext.Provider>
        </Box>}
        <Box display={overlay?'none':'flex'} flexDirection="column" flexGrow={1} minHeight={0}>{CurrentScreen?<CurrentScreen/>:null}</Box>
      </ContentPane>
    </Box>
    {pending>0?<Box paddingX={1}><AiLoadingSpinner label="Dateien werden verarbeitet …"/></Box>:aiPending>0?<Box paddingX={1}><AiLoadingSpinner label={`KI arbeitet · ${aiPending} Auftrag/Aufträge · lokale Erfassung bleibt verfügbar`}/></Box>:message.error&&message.text?<ErrorBanner message={message.text}/>:indexWarning?<ErrorBanner message={indexWarning}/>:message.text?<ErrorBanner message={message.text} error={message.error}/>:<Box paddingX={1}><Text color={THEME.fgSecondary}>{!hasApiKey()?'ANTHROPIC_API_KEY nicht gesetzt · lokale Funktionen verfügbar':!config.ai.datenschutzAkzeptiert?'KI deaktiviert · Datenschutzfreigabe in Einstellungen':'Bereit'}</Text></Box>}
    <ActionBar screen={screen} editorOpen={editorOpen} overlayOpen={overlay!==null}/>
  </Box></ErnaContext.Provider>;
}

const AI_ACTIONS: {label:string;value:AiAction}[] = [
  {label:'1  Aktuelle Notiz strukturieren',value:'strukturieren'},
  {label:'2  Fristen aus aktueller Notiz erkennen',value:'fristen'},
  {label:'3  Neue Entscheidung dokumentieren (KI-gestützt)',value:'entscheidung'},
  {label:'4  Mandantenakte durchsuchen',value:'suche'},
  {label:'5  Tagesbrief erstellen',value:'tagesbrief'},
  {label:'6  Alle Notizen re-analysieren (Mandant)',value:'alle'},
];
function AiMenu({onChoose}:{onChoose(action:AiAction):void}) {
  const {aiAvailable,aiBusy}=useErna();
  return <Box flexDirection="column"><Text color={THEME.fgSecondary}>{aiAvailable?'Claude unterstützt Strukturierung und Recherche.':'KI benötigt einen API-Schlüssel und deine Datenschutzfreigabe.'}</Text><Box height={1}/><SelectInput items={AI_ACTIONS} isFocused={!aiBusy} onSelect={item=>onChoose(item.value)} indicatorComponent={({isSelected})=><Text color={THEME.accent}>{isSelected?'▸':' '}</Text>} itemComponent={({isSelected,label})=><Text color={isSelected?THEME.fgSelected:THEME.fgPrimary} backgroundColor={isSelected?THEME.bgSelected:undefined}>{label}</Text>}/>{aiBusy&&<AiLoadingSpinner/>}</Box>;
}
