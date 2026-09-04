import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import { useErna } from '../../app/App.js';
import { THEME } from '../../app/constants.js';
import type { FormField } from '../../app/types.js';
import { errorMessage, terminalText } from '../../utils/format.js';
import { isReservedInput, isSave } from '../../utils/keyboard.js';
import { ConfirmDialog } from './ConfirmDialog.js';

interface BufferState { text: string; cursor: number; preferredColumn: number | null }
const characters = (text: string): string[] => Array.from(new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text), item => item.segment);
const createBuffer = (text: string): BufferState => ({ text, cursor: characters(text).length, preferredColumn: null });

/** Der Cursor zählt vollständige Zeichen, damit Löschen auch Umlaute und Emoji erhält. */
function editBuffer(previous: BufferState, input: string, key: Key, multiline: boolean, pageSize: number): BufferState {
  const chars = characters(previous.text);
  const cursor = Math.min(previous.cursor, chars.length);
  const move = (next: number, preferredColumn: number | null = null): BufferState => ({ ...previous, cursor: Math.max(0, Math.min(chars.length, next)), preferredColumn });
  const replace = (start: number, count: number, inserted = ''): BufferState => {
    const added = characters(inserted);
    chars.splice(start, count, ...added);
    return { text: chars.join(''), cursor: start + added.length, preferredColumn: null };
  };
  const lineStart = cursor === 0 ? 0 : chars.lastIndexOf('\n', cursor - 1) + 1;
  const nextBreak = chars.indexOf('\n', cursor);
  const lineEnd = nextBreak < 0 ? chars.length : nextBreak;
  if (key.home || key.ctrl && input === 'a') return move(key.ctrl && key.home ? 0 : lineStart);
  if (key.end || key.ctrl && input === 'e') return move(key.ctrl && key.end ? chars.length : lineEnd);
  if (key.leftArrow) return move(cursor - 1);
  if (key.rightArrow) return move(cursor + 1);
  if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
    if (!multiline) return previous;
    const starts = [0, ...chars.flatMap((char, index) => char === '\n' ? [index + 1] : [])];
    const row = starts.reduce((current, start, index) => start <= cursor ? index : current, 0);
    const direction = key.upArrow || key.pageUp ? -1 : 1;
    const distance = key.pageUp || key.pageDown ? pageSize : 1;
    const target = Math.max(0, Math.min(starts.length - 1, row + direction * distance));
    const column = previous.preferredColumn ?? cursor - lineStart;
    const start = starts[target] ?? 0;
    const end = target + 1 < starts.length ? (starts[target + 1] ?? chars.length + 1) - 1 : chars.length;
    return move(start + Math.min(column, end - start), column);
  }
  if (key.backspace) return cursor > 0 ? replace(cursor - 1, 1) : previous;
  if (key.delete) return replace(cursor, 1);
  if (key.return) return multiline ? replace(cursor, 0, '\n') : previous;
  if (key.ctrl || key.meta || key.super || key.hyper || key.escape || key.tab || isReservedInput(input)) return previous;
  const clean = terminalText(input.replace(/\r\n?/g, '\n')).replace(/\t/g, '    ');
  return clean ? replace(cursor, 0, multiline ? clean : clean.replace(/\n/g, ' ')) : previous;
}

function EditorLine({ text, cursor, width, secret = false }: { text: string; cursor?: number; width: number; secret?: boolean }) {
  const chars = characters(terminalText(text));
  const available = Math.max(2, width);
  const offset = cursor === undefined ? 0 : Math.max(0, cursor - available + 2);
  const visible = chars.slice(offset, offset + available - 1);
  const position = cursor === undefined ? -1 : cursor - offset;
  const content = (items: string[]): string => secret ? '•'.repeat(items.length) : items.join('');
  return <Text color={THEME.fgPrimary} wrap="truncate-end">
    {offset > 0 ? '‹' : ''}
    {position < 0 ? content(visible) : <>
      {content(visible.slice(0, position))}
      <Text color={THEME.fgSelected} backgroundColor={THEME.bgSelected}>{content(visible.slice(position, position + 1)) || ' '}</Text>
      {content(visible.slice(position + 1))}
    </>}
    {offset + visible.length < chars.length ? '›' : ''}
  </Text>;
}

function useEditorMode(): ReturnType<typeof useErna> {
  const context = useErna();
  const { setEditorOpen } = context;
  useEffect(() => {
    setEditorOpen(true);
    return () => setEditorOpen(false);
  }, [setEditorOpen]);
  return context;
}

export interface TextEditorProps {
  title: string;
  initialTitle: string;
  initialText: string;
  onSave(title: string, text: string): Promise<void>;
  onCancel(): void;
  active?: boolean;
  initialUnsaved?: boolean;
  saveLabel?: string;
  status?: { value: string; options: string[]; onChange(value: string): void };
}

export function TextEditor({ title, initialTitle, initialText, onSave, onCancel, active = true, initialUnsaved = false, saveLabel = 'Speichern', status }: TextEditorProps) {
  const { width, height, overlayOpen } = useEditorMode();
  const [heading, setHeading] = useState(() => createBuffer(initialTitle));
  const [body, setBody] = useState(() => createBuffer(initialText));
  const [field, setField] = useState<'title' | 'body' | 'status'>(initialTitle ? 'body' : 'title');
  const initialStatus = useRef(status?.value);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const dirty = initialUnsaved || heading.text !== initialTitle || body.text !== initialText || status?.value !== initialStatus.current;
  const pageSize = Math.max(1, height - (status ? 9 : 8));
  const chars = characters(body.text);
  const row = chars.slice(0, body.cursor).filter(char => char === '\n').length;
  const column = body.cursor - (body.cursor === 0 ? 0 : chars.lastIndexOf('\n', body.cursor - 1) + 1);
  const lines = body.text.split('\n');
  const start = Math.max(0, Math.min(row - pageSize + 1, lines.length - pageSize));

  const save = async (): Promise<void> => {
    if (pending.current) return;
    if (!heading.text.trim()) { setError('Bitte einen Titel eingeben.'); setField('title'); return; }
    if (!body.text.trim()) { setError('Bitte einen Text eingeben.'); setField('body'); return; }
    if (status && !status.options.includes(status.value)) { setError('Bitte einen gültigen Status auswählen.'); setField('status'); return; }
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onSave(heading.text.trim(), body.text); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  };

  useInput((input, key) => {
    if (key.eventType === 'release' || pending.current) return;
    if (isSave(input, key)) { void save(); return; }
    if (key.escape) { if (dirty) setConfirming(true); else onCancel(); return; }
    if (key.tab || field !== 'body' && key.return) {
      const sequence: ('title' | 'status' | 'body')[] = status ? ['title', 'status', 'body'] : ['title', 'body'];
      setField(current => sequence[(sequence.indexOf(current) + (key.shift && key.tab ? -1 : 1) + sequence.length) % sequence.length] ?? 'title');
      return;
    }
    if (field === 'status' && status) {
      if ((key.leftArrow || key.rightArrow || input === ' ') && status.options.length) {
        const index = status.options.indexOf(status.value);
        status.onChange(status.options[(index + (key.leftArrow ? -1 : 1) + status.options.length) % status.options.length] ?? status.value);
      }
      return;
    }
    if (field === 'title') setHeading(previous => editBuffer(previous, input, key, false, pageSize));
    else setBody(previous => editBuffer(previous, input, key, true, pageSize));
  }, { isActive: active && !overlayOpen && !confirming });

  if (confirming) return <ConfirmDialog message="Ungespeicherte Änderungen verwerfen?" onConfirm={onCancel} onCancel={() => setConfirming(false)} active={active} manageEditorMode={false}/>;

  return <Box flexDirection="column">
    <Text bold color={THEME.accent}>{terminalText(title)}{dirty ? ' *' : ''}</Text>
    <Box><Text color={field === 'title' ? THEME.accent : THEME.fgSecondary}>Titel: </Text><EditorLine text={heading.text} cursor={field === 'title' && !confirming ? heading.cursor : undefined} width={width - 7}/></Box>
    {status && <Text color={field === 'status' ? THEME.fgSelected : THEME.fgSecondary} backgroundColor={field === 'status' ? THEME.bgSelected : undefined}>Status: ‹ {terminalText(status.value)} › · ←→ / Leer ändern</Text>}
    <Text color={field === 'body' ? THEME.accent : THEME.fgSecondary}>Text:</Text>
    <Box flexDirection="column" height={pageSize}>
      {lines.slice(start, start + pageSize).map((line, index) => <Box key={start + index}>
        <Text color={THEME.fgDimmed}>{String(start + index + 1).padStart(3)} │ </Text>
        <EditorLine text={line} cursor={field === 'body' && !confirming && start + index === row ? column : undefined} width={width - 7}/>
      </Box>)}
    </Box>
    <Text color={THEME.fgSecondary}>Zeile {row + 1}/{lines.length} · Spalte {column + 1} · Tab {status ? 'Titel/Status/Text' : 'Titel/Text'} · Pos1/Ende · Bild↑↓</Text>
    <Text color={THEME.fgSecondary}>Ctrl+S {terminalText(saveLabel)} · ESC Zurück</Text>
    {busy && <Text color={THEME.accentYellow}>Wird gespeichert …</Text>}
    {error && <Text color={THEME.accentRed}>{terminalText(error)}</Text>}
  </Box>;
}

export interface FormEditorProps {
  title: string;
  fields: FormField[];
  initialValues: Record<string, string>;
  onSave(values: Record<string, string>): Promise<void>;
  onCancel(): void;
  active?: boolean;
}

export function FormEditor({ title, fields, initialValues, onSave, onCancel, active = true }: FormEditorProps) {
  const { width, height, overlayOpen } = useEditorMode();
  const [baseline] = useState(() => Object.fromEntries(fields.map(field => [field.key, initialValues[field.key] ?? (field.kind === 'choice' ? field.options?.[0] : '') ?? ''])));
  const [buffers, setBuffers] = useState<Record<string, BufferState>>(() => Object.fromEntries(Object.entries(baseline).map(([key, value]) => [key, createBuffer(value)])));
  const [selected, setSelected] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const values = Object.fromEntries(Object.entries(buffers).map(([key, buffer]) => [key, buffer.text]));
  const dirty = fields.some(field => values[field.key] !== baseline[field.key]);
  const visible = Math.max(1, height - 6);
  const start = Math.max(0, selected - visible + 1);

  const save = async (): Promise<void> => {
    if (pending.current) return;
    const invalid = fields.findIndex(field => field.required && !values[field.key]?.trim() || field.kind === 'choice' && field.options?.length && !field.options.includes(values[field.key] ?? ''));
    if (invalid >= 0) { setSelected(invalid); setError(`Bitte das Feld „${fields[invalid]?.label ?? ''}“ gültig ausfüllen.`); return; }
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onSave({ ...initialValues, ...values }); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  };

  useInput((input, key) => {
    if (key.eventType === 'release' || pending.current) return;
    if (isSave(input, key)) { void save(); return; }
    if (key.escape) { if (dirty) setConfirming(true); else onCancel(); return; }
    if (key.tab || key.return || key.upArrow || key.downArrow) {
      const direction = key.upArrow || key.tab && key.shift ? -1 : 1;
      setSelected(current => fields.length ? (current + direction + fields.length) % fields.length : 0);
      return;
    }
    const field = fields[selected];
    if (!field) return;
    if (field.kind === 'choice') {
      if ((key.leftArrow || key.rightArrow || input === ' ') && field.options?.length) {
        const options = field.options;
        const direction = key.leftArrow ? -1 : 1;
        setBuffers(previous => {
          const index = options.indexOf(previous[field.key]?.text ?? '');
          const text = options[(index + direction + options.length) % options.length] ?? '';
          return { ...previous, [field.key]: createBuffer(text) };
        });
      }
    } else setBuffers(previous => ({ ...previous, [field.key]: editBuffer(previous[field.key] ?? createBuffer(''), input, key, false, 1) }));
  }, { isActive: active && !overlayOpen && !confirming });

  if (confirming) return <ConfirmDialog message="Ungespeicherte Änderungen verwerfen?" onConfirm={onCancel} onCancel={() => setConfirming(false)} active={active} manageEditorMode={false}/>;

  return <Box flexDirection="column">
    <Text bold color={THEME.accent}>{terminalText(title)}{dirty ? ' *' : ''}</Text>
    {fields.slice(start, start + visible).map((field, index) => {
      const focused = start + index === selected && !confirming;
      const buffer = buffers[field.key] ?? createBuffer('');
      const label = `${focused ? '▸' : ' '} ${terminalText(field.label)}${field.required ? '*' : ''}: `;
      return <Box key={field.key}>
        <Text color={focused ? THEME.accent : THEME.fgSecondary}>{label}</Text>
        {field.kind === 'choice'
          ? <Text color={focused ? THEME.fgSelected : THEME.fgPrimary} backgroundColor={focused ? THEME.bgSelected : undefined}>‹ {terminalText(buffer.text)} ›</Text>
          : <EditorLine text={buffer.text} cursor={focused ? buffer.cursor : undefined} width={width - characters(label).length - 1} secret={field.kind === 'secret'}/>}
      </Box>;
    })}
    <Text color={THEME.fgSecondary}>Tab / Shift+Tab Feld · ←→ / Leer Auswahl · * Pflichtfeld</Text>
    <Text color={THEME.fgSecondary}>Ctrl+S Speichern · ESC Zurück</Text>
    {busy && <Text color={THEME.accentYellow}>Wird gespeichert …</Text>}
    {error && <Text color={THEME.accentRed}>{terminalText(error)}</Text>}
  </Box>;
}
