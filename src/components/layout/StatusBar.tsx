import { Box, Text } from 'ink';
import type { Mandant } from '../../app/types.js';
import { THEME } from '../../app/constants.js';
import { displayDate, displayTime } from '../../utils/dates.js';
import { terminalText } from '../../utils/format.js';
export function StatusBar({ mandant, now, aiAvailable, width }: { mandant: Mandant | null; now: Date; aiAvailable: boolean; width: number }) {
  return <Box height={1} width={width} backgroundColor={THEME.statusBar} paddingX={1}>
    <Text bold color={THEME.statusBarFg}>ERNA-AI 1.0</Text>
    <Box flexGrow={1} flexShrink={1} minWidth={0} marginX={1}><Text color={THEME.statusBarFg} wrap="truncate-end">│ {mandant ? `${terminalText(mandant.name)} (${mandant.id})` : 'Kein Mandant'}</Text></Box>
    <Box flexShrink={0}><Text color={THEME.statusBarFg}>│ {displayDate(now)} {displayTime(now)} │ KI {aiAvailable ? 'an' : 'aus'}</Text></Box>
  </Box>;
}
