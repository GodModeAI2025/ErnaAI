import { Box, Text } from 'ink';
import { THEME } from '../../app/constants.js';
import { terminalText } from '../../utils/format.js';
export function ErrorBanner({ message, error = true }: { message: string; error?: boolean }) { return message ? <Box paddingX={1}><Text color={error ? THEME.accentRed : THEME.accentGreen} wrap="truncate-end">{error ? '⚠ ' : '✓ '}{terminalText(message)}</Text></Box> : null; }
