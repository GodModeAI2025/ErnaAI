import { Text } from 'ink';
import { THEME } from '../../app/constants.js';
export function KeyHint({ label, hint }: { label: string; hint: string }) { return <Text><Text bold color={THEME.fgSelected}>{label}</Text><Text color={THEME.fgSecondary}> {hint}  </Text></Text>; }
