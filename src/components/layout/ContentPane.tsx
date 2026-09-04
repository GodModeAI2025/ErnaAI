import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import { THEME } from '../../app/constants.js';
import { terminalText } from '../../utils/format.js';
export function ContentPane({ children, title, focused }: { children: ReactNode; title: string; focused: boolean }) { return <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column" borderStyle="single" borderColor={focused ? THEME.borderActive : THEME.border} paddingX={1} overflow="hidden" backgroundColor={THEME.bg}><Text bold color={THEME.fgSelected}>{title}</Text><Box height={1}/>{children}</Box>; }
export function ScrollableText({ text, width, height, active = true }: { text: string; width: number; height: number; active?: boolean }) {
  const lines = useMemo(() => terminalText(text).split('\n').flatMap(line => { const parts: string[] = []; const chars = Array.from(line); const size = Math.max(8, width); for (let i = 0; i < chars.length; i += size) parts.push(chars.slice(i, i + size).join('')); return parts.length ? parts : ['']; }), [text,width]);
  const [offset, setOffset] = useState(0), visible = Math.max(1, height - 1), maximum = Math.max(0, lines.length - visible);
  useEffect(() => setOffset(0), [text]);
  useInput((_input,key) => { if (key.pageDown) setOffset(o => Math.min(maximum,o + visible)); if (key.pageUp) setOffset(o => Math.max(0,o - visible)); }, { isActive: active });
  const start = Math.min(offset,maximum);
  return <Box flexDirection="column" height={Math.max(1,height)} overflow="hidden"><Text color={THEME.fgPrimary}>{lines.slice(start,start+visible).join('\n')}</Text>{lines.length > visible && <Text color={THEME.fgSecondary}>Bild↑↓ {start + 1}–{Math.min(lines.length,start+visible)}/{lines.length}</Text>}</Box>;
}
