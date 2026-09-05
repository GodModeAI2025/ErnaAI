import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import { errorMessage, terminalText } from '../../utils/format.js';

export interface ConfirmDialogProps {
  message: string;
  onConfirm(): void | Promise<void>;
  onCancel(): void;
  active?: boolean;
  /** Ein eingebetteter Editor besitzt die Navigationssperre bereits selbst. */
  manageEditorMode?: boolean;
}

export function ConfirmDialog({ message, onConfirm, onCancel, active = true, manageEditorMode = true }: ConfirmDialogProps) {
  const { setEditorOpen, overlayOpen } = useErna();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!manageEditorMode) return;
    setEditorOpen(true);
    return () => setEditorOpen(false);
  }, [setEditorOpen, manageEditorMode]);

  const confirm = async (): Promise<void> => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  useInput((input, key) => {
    if (key.eventType === 'release' || key.ctrl || key.meta || pending.current) return;
    if (key.escape || input.toLocaleLowerCase('de') === 'n') onCancel();
    else if (key.return || input.toLocaleLowerCase('de') === 'j') void confirm();
  }, { isActive: active && !overlayOpen });

  return <Box flexDirection="column" borderStyle="single" borderColor={THEME.accentYellow} paddingX={1}>
    <Text color={THEME.fgPrimary}>{terminalText(message)}</Text>
    <Text color={THEME.fgSecondary}>[J / Enter] Ja · [N / ESC] Nein</Text>
    {busy && <Text color={THEME.accentYellow}>Wird ausgeführt …</Text>}
    {error && <Text color={THEME.accentRed}>{terminalText(error)}</Text>}
  </Box>;
}
