import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { TextEditor, FormEditor } from '../../src/components/shared/TextEditor.js';
import { ConfirmDialog } from '../../src/components/shared/ConfirmDialog.js';

const { context } = vi.hoisted(() => {
  const context = {
    width: 78, height: 16, overlayOpen: false, editorOpen: false,
    setEditorOpen: vi.fn((value: boolean) => { context.editorOpen = value; }),
  };
  return { context };
});
vi.mock('../../src/app/App.js', () => ({ useErna: () => context }));
beforeEach(() => { context.overlayOpen = false; context.editorOpen = false; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 30));
async function press(ui: ReturnType<typeof render>, ...keys: string[]): Promise<void> {
  for (const key of keys) { ui.stdin.write(key); await settle(); }
}

it('fügt am mehrzeiligen Cursor ein, übernimmt Paste und speichert mit Ctrl+S', async () => {
  const save = vi.fn(async () => undefined);
  const ui = render(<TextEditor title="Notiz bearbeiten" initialTitle="Testnotiz" initialText={'abc\ndef'} onSave={save} onCancel={vi.fn()}/>);
  await settle();
  await press(ui, '\x1b[H', '\x1b[A', '\x1b[C', 'X', '\r', 'eins\nzwei', '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Testnotiz', 'aX\neins\nzweibc\ndef'));
  expect(context.editorOpen).toBe(true);
  ui.unmount();
  expect(context.editorOpen).toBe(false);
});

it('erhält den Entwurf nach abgelehnter Verwerfen-Abfrage und sperrt die Navigation weiter', async () => {
  const save = vi.fn(async () => undefined), cancel = vi.fn();
  const ui = render(<TextEditor title="Notiz bearbeiten" initialTitle="Entwurf" initialText="Original" onSave={save} onCancel={cancel}/>);
  await settle();
  await press(ui, ' ergänzt', '\x1b');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  expect(ui.lastFrame()).toContain('[N / ESC] Nein');
  await press(ui, 'n');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Original ergänzt'));
  expect(context.editorOpen).toBe(true);
  expect(cancel).not.toHaveBeenCalled();
  await press(ui, '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Entwurf', 'Original ergänzt'));
});

it('schützt einen unveränderten vorbefüllten Entwurf und erhält ihn nach ESC und Nein', async () => {
  const save = vi.fn(async () => undefined), cancel = vi.fn();
  const ui = render(<TextEditor title="Entscheidung dokumentieren" initialTitle="Vorbereiteter Entwurf" initialText={'## Sachverhalt\nVorbereiteter Inhalt'} initialUnsaved onSave={save} onCancel={cancel}/>);
  await settle();
  await press(ui, '\x1b');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  await press(ui, 'n');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Vorbereiteter Inhalt'));
  expect(ui.lastFrame()).toContain('Vorbereiteter Entwurf');
  expect(cancel).not.toHaveBeenCalled();
  await press(ui, '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Vorbereiteter Entwurf', '## Sachverhalt\nVorbereiteter Inhalt'));
});

it('zeigt eine eigene Speicherbeschriftung und verwendet denselben Ctrl+S-Speicherablauf', async () => {
  const save = vi.fn(async () => undefined);
  const ui = render(<TextEditor title="Entscheidung dokumentieren" initialTitle="Titel" initialText="Sachverhalt" saveLabel="Entwurf übernehmen" onSave={save} onCancel={vi.fn()}/>);
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ctrl+S Entwurf übernehmen · ESC Zurück'));
  await press(ui, '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Titel', 'Sachverhalt'));
});

it('gibt die Navigation beim bestätigten Schließen des gesamten Editors wieder frei', async () => {
  function EditorLifecycle() {
    const [open, setOpen] = useState(true);
    return open ? <TextEditor title="Entwurf" initialTitle="Titel" initialText="Text" onSave={vi.fn(async () => undefined)} onCancel={() => setOpen(false)}/> : null;
  }
  const ui = render(<EditorLifecycle/>);
  await settle();
  await press(ui, ' ergänzt', '\x1b');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  await press(ui, 'j');
  await vi.waitFor(() => expect(context.editorOpen).toBe(false));
});

it('löscht vollständige Unicode-Zeichen und behandelt Pos1/Entf korrekt', async () => {
  const save = vi.fn(async () => undefined);
  const ui = render(<TextEditor title="Notiz bearbeiten" initialTitle="Unicode" initialText={'Ä🙂e\u0301\nZeile'} onSave={save} onCancel={vi.fn()}/>);
  await settle();
  await press(ui, '\x1b[H', '\x1b[A', '\x1b[C', '\x1b[3~', '\x1b[F', '\x7f', '\ue108', '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Unicode', 'Ä\nZeile'));
});

it('prüft Pflichtfelder, wechselt Auswahlwerte und erhält Formulardaten bei Speicherfehlern', async () => {
  const save = vi.fn<(values: Record<string, string>) => Promise<void>>()
    .mockRejectedValueOnce(new Error('Datum ist ungültig.')).mockResolvedValue(undefined);
  const ui = render(<FormEditor title="Termin" fields={[
    { key: 'titel', label: 'Titel', required: true },
    { key: 'prioritaet', label: 'Priorität', kind: 'choice', options: ['niedrig', 'mittel', 'hoch'] },
  ]} initialValues={{ titel: '', prioritaet: 'mittel' }} onSave={save} onCancel={vi.fn()}/>);
  await settle();
  await press(ui, '\x13');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Bitte das Feld „Titel“ gültig ausfüllen.'));
  expect(save).not.toHaveBeenCalled();
  await press(ui, 'Rückfrage', '\t', '\x1b[C', '\x1b[Z', '\x1b[H', 'Neue ', '\x13');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Datum ist ungültig.'));
  expect(save).toHaveBeenCalledWith({ titel: 'Neue Rückfrage', prioritaet: 'hoch' });
  await press(ui, '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith({ titel: 'Neue Rückfrage', prioritaet: 'hoch' });
});

it('fordert einen leeren Text an und blockiert Eingaben während einer übergeordneten Abfrage', async () => {
  const save = vi.fn(async () => undefined);
  const props = { title: 'Neue Notiz', initialTitle: '', initialText: '', onSave: save, onCancel: vi.fn() };
  const ui = render(<TextEditor {...props}/>);
  await settle();
  await press(ui, 'Titel', '\x13');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Bitte einen Text eingeben.'));
  context.overlayOpen = true;
  ui.rerender(<TextEditor {...props}/>);
  await settle();
  await press(ui, 'Gesperrt', '\x13');
  expect(save).not.toHaveBeenCalled();
  context.overlayOpen = false;
  ui.rerender(<TextEditor {...props}/>);
  await settle();
  await press(ui, 'Inhalt', '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Titel', 'Inhalt'));
});

it('speichert den Entscheidungsstatus gemeinsam und schützt reine Statusänderungen', async () => {
  const save = vi.fn(async (_title: string, _text: string, _status: string) => undefined), cancel = vi.fn();
  function DecisionEditor() {
    const [status, setStatus] = useState('entwurf');
    return <TextEditor title="Entscheidung" initialTitle="Begründung" initialText="Sachverhalt" onSave={(title, text) => save(title, text, status)} onCancel={cancel} status={{ value: status, options: ['entwurf', 'final', 'widerrufen'], onChange: setStatus }}/>;
  }
  const ui = render(<DecisionEditor/>);
  await settle();
  await press(ui, '\x1b[Z', ' ', '\x1b');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ungespeicherte Änderungen verwerfen?'));
  await press(ui, 'n', '\x13');
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith('Begründung', 'Sachverhalt', 'final'));
  expect(cancel).not.toHaveBeenCalled();
});

it('zeigt Fehler einer Bestätigung und verhindert paralleles Ausführen', async () => {
  let rejectOperation: (cause: Error) => void = () => undefined;
  const confirm = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectOperation = reject; }));
  const cancel = vi.fn();
  const ui = render(<ConfirmDialog message="Eintrag löschen?" onConfirm={confirm} onCancel={cancel}/>);
  await settle();
  await press(ui, 'j', '\r');
  expect(confirm).toHaveBeenCalledTimes(1);
  rejectOperation(new Error('Datei ist geschützt.'));
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Datei ist geschützt.'));
  await press(ui, '\x1b');
  expect(cancel).toHaveBeenCalledOnce();
});
