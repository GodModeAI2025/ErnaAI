import { Box, Text } from 'ink';
import { NAVIGATION, THEME } from '../../app/constants.js';
import type { Akte, Screen } from '../../app/types.js';
import { isOverdue } from '../../utils/dates.js';
export function Sidebar({ screen, focused, akte }: { screen: Screen; focused: boolean; akte: Akte | null }) {
  const open = akte?.termine.filter(t => !t.erledigt) ?? [];
  const count = (s: Screen) => s === 'notizen' ? `(${akte?.notizen.length ?? 0})` : s === 'entscheidungen' ? `(${akte?.entscheidungen.length ?? 0})` : s === 'termine' ? `(${open.length}${open.some(t => t.prioritaet === 'hoch' || isOverdue(t.datum)) ? '!' : ''})` : '';
  return <Box width={20} flexShrink={0} flexDirection="column" backgroundColor={THEME.bgSidebar} paddingTop={1}><Text color={focused ? THEME.accentYellow : THEME.fgSecondary}>  NAVIGATION</Text><Text color={THEME.border}>  ────────────────</Text>{NAVIGATION.map(item => <Box key={item.screen} backgroundColor={screen === item.screen ? THEME.bgSelected : THEME.bgSidebar}><Text color={screen === item.screen ? THEME.fgSelected : THEME.fgPrimary} wrap="truncate-end">{screen === item.screen ? ' ▸' : '  '}{item.label} {count(item.screen)}</Text></Box>)}<Box marginTop={1} paddingX={1}><Text color={THEME.fgSecondary}>Tab: Bereich{ '\n' }↑↓: Navigation</Text></Box></Box>;
}
