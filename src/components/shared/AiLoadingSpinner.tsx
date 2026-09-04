import { useEffect, useState } from 'react';
import { Text } from 'ink';
import { THEME } from '../../app/constants.js';
export function AiLoadingSpinner({ label = 'KI arbeitet …' }: { label?: string }) { const [frame, setFrame] = useState(0); useEffect(() => { const timer = setInterval(() => setFrame(f => (f + 1) % 4), 150); return () => clearInterval(timer); }, []); return <Text color={THEME.accentYellow}>{['◐', '◓', '◑', '◒'][frame]} {label}</Text>; }
