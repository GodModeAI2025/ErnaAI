import { Box } from 'ink';
import { THEME } from '../../app/constants.js';
import type { Screen } from '../../app/types.js';
import { KeyHint } from '../shared/KeyHint.js';
export function ActionBar({ screen, editorOpen, overlayOpen }: { screen: Screen; editorOpen: boolean; overlayOpen: boolean }) {
  const hints = editorOpen ? [['Ctrl+S','Speichern'],['Tab','Feldwechsel'],['ESC','Abbrechen']] : overlayOpen ? [['↑↓','Auswahl'],['Enter','Bestätigen'],['ESC','Zurück']] : [['F1','Hilfe'],['F2','Mandant'], ...(['notizen','termine','entscheidungen','mandant'].includes(screen) ? [['F3','Neu'],['F4','Bearbeiten'],['F8',screen === 'termine' ? 'Archiv' : 'Löschen']] : []),['F5','Suche'],['F6','Fristen'],['F7','Akte'],['F9','KI'],['F10','Beenden'],['Tab','Navigation']];
  return <Box minHeight={2} flexWrap="wrap" backgroundColor={THEME.bgPanel} paddingX={1}>{hints.map(([label,hint]) => <KeyHint key={label} label={label ?? ''} hint={hint ?? ''}/>)}</Box>;
}
