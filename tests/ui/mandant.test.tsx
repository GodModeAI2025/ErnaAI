import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { Akte, ErnaConfig, Mandant } from '../../src/app/types.js';
import { DEFAULT_CONFIG } from '../../src/app/constants.js';
import { MandantScreen } from '../../src/components/screens/MandantScreen.js';
import { getMandant, listMandanten, saveMandant } from '../../src/data/mandanten.js';
import { listNotizen, saveNotiz } from '../../src/data/notizen.js';
import { loadAkte } from '../../src/data/index.js';
import { timestamp, today } from '../../src/utils/dates.js';

const { context } = vi.hoisted(() => {
  const context = {
    mandanten: [] as Mandant[], mandant: null as Mandant | null, akte: null as Akte | null,
    config: {} as ErnaConfig, width: 88, height: 25, focus: 'content',
    busy: false, overlayOpen: false, editorOpen: false,
    setFocus: vi.fn((focus: string) => { context.focus = focus; }),
    setEditorOpen: vi.fn((open: boolean) => { context.editorOpen = open; }),
    setMessage: vi.fn(),
    run: vi.fn(async (operation: () => Promise<void>) => {
      try { await operation(); return true; }
      catch (cause) { context.setMessage(cause instanceof Error ? cause.message : 'Unbekannter Fehler.', true); return false; }
    }),
    refresh: vi.fn<() => Promise<void>>(),
    selectMandant: vi.fn<(id: string) => Promise<void>>(),
  };
  return { context };
});
vi.mock('../../src/app/App.js', () => ({ useErna: () => context }));

let directory: string;
let original: Mandant;
let selectedId: string | null;
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 40));
async function press(ui: ReturnType<typeof render>, ...keys: string[]): Promise<void> {
  for (const key of keys) { ui.stdin.write(key); await settle(); }
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'erna-ui-mandant-'));
  vi.stubEnv('ERNA_DATA_PATH', directory);
  original = {
    id: `M-${new Date().getFullYear()}-0001`, name: 'Original GmbH', rechtsform: 'GmbH',
    ansprechpartner: 'Anja Beispiel', telefon: '030 123456', email: 'kanzlei@example.test',
    steuer_id: 'DE123456789', finanzamt: 'Berlin', wirtschaftsjahr_ende: '12-31',
    mandant_seit: '2020-06-15', bearbeiter: 'Testberater', kategorie: 'Bestand', branchen_code: '62',
    aktiv: true, ai_features_aktiv: false, notizen: 'Vorhandene Profilnotiz bleibt erhalten.',
  };
  await saveMandant(original);
  selectedId = original.id;
  context.config = structuredClone(DEFAULT_CONFIG);
  context.config.kanzlei.standardBearbeiter = 'Testberater';
  context.focus = 'content';
  context.busy = false;
  context.overlayOpen = false;
  context.editorOpen = false;
  context.refresh.mockImplementation(async () => {
    context.mandanten = await listMandanten();
    context.mandant = context.mandanten.find(mandant => mandant.id === selectedId) ?? null;
    context.akte = context.mandant ? await loadAkte(context.mandant.id) : null;
  });
  context.selectMandant.mockImplementation(async id => { selectedId = id; await context.refresh(); });
  await context.refresh();
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it('legt ohne Auswahl die nächste freie Jahres-ID an und erhält bestehende Profile bytegenau', async () => {
  const existingFile = path.join(directory, 'mandanten', original.id, 'profil.json');
  const previousBytes = await readFile(existingFile);
  selectedId = null;
  context.mandant = null;
  context.akte = null;
  const ui = render(<MandantScreen/>);
  await settle();
  await press(ui, '\ue102');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ctrl+S Speichern'));
  await press(ui, 'Neuer Mandant', '\x13');
  await vi.waitFor(async () => expect(await listMandanten()).toHaveLength(2));
  const expectedId = `M-${new Date().getFullYear()}-0002`;
  await vi.waitFor(() => expect(context.selectMandant).toHaveBeenCalledWith(expectedId));
  const created = await getMandant(expectedId);
  expect(created).toMatchObject({ name: 'Neuer Mandant', wirtschaftsjahr_ende: '12-31', aktiv: true, ai_features_aktiv: true });
  expect(created.mandant_seit).toBe(today());
  expect(await readFile(existingFile)).toEqual(previousBytes);
  await vi.waitFor(() => expect(context.mandant?.id).toBe(expectedId));
  ui.rerender(<MandantScreen/>);
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Neuer Mandant'));
  expect(ui.lastFrame()).not.toContain('Ctrl+S Speichern');
});

it('überspringt belegte Aktenordner ohne gültiges Profil und erhält deren Dateien', async () => {
  const reservedId = `M-${new Date().getFullYear()}-0002`;
  const reservedDirectory = path.join(directory, 'mandanten', reservedId);
  const retainedFile = path.join(reservedDirectory, 'vorhandene-akte.txt');
  await mkdir(reservedDirectory, { recursive: true });
  await writeFile(retainedFile, 'Diese vorhandene Datei bleibt unverändert.\n');
  const previousBytes = await readFile(retainedFile);
  // Fehlendes Profil ist hier die absichtliche Testkonstellation.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const ui = render(<MandantScreen/>);
  await settle();
  await press(ui, '\ue102');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ctrl+S Speichern'));
  await press(ui, 'Weitere neue Akte', '\x13');
  const expectedId = `M-${new Date().getFullYear()}-0003`;
  await vi.waitFor(async () => expect((await getMandant(expectedId)).name).toBe('Weitere neue Akte'));
  expect(await readFile(retainedFile)).toEqual(previousBytes);
  await expect(readFile(path.join(reservedDirectory, 'profil.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await getMandant(original.id)).toEqual(original);
});

it('bearbeitet den Profilnamen per F4 und erhält alle anderen Profilfelder', async () => {
  const ui = render(<MandantScreen/>);
  await settle();
  await press(ui, '\ue103');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ctrl+S Speichern'));
  await press(ui, '\x1b[F', ' & Partner', '\x13');
  await vi.waitFor(async () => expect((await getMandant(original.id)).name).toBe('Original GmbH & Partner'));
  expect(await getMandant(original.id)).toEqual({ ...original, name: 'Original GmbH & Partner' });
  await vi.waitFor(() => expect(context.refresh).toHaveBeenCalled());
  ui.rerender(<MandantScreen/>);
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Original GmbH & Partner'));
  expect(ui.lastFrame()).not.toContain('Ctrl+S Speichern');
});

it('löscht eine Akte mit vorhandener Notiz auch nach F8 und Bestätigung nicht', async () => {
  const now = timestamp();
  await saveNotiz({
    id: randomUUID(), mandant_id: original.id, typ: 'notiz', titel: 'Unverzichtbare Aktennotiz',
    erstellt: now, geaendert: now, autor: 'Testberater', tags: [], ai_zusammenfassung: '',
    ai_folgeaktionen: [], ai_verarbeitet: false, inhalt: 'Diese Akteninformation muss erhalten bleiben.',
  });
  await context.refresh();
  const previousNotes = await listNotizen(original.id);
  const previousProfile = await readFile(path.join(directory, 'mandanten', original.id, 'profil.json'));
  const ui = render(<MandantScreen/>);
  await settle();
  await press(ui, '\ue107', 'j');
  await vi.waitFor(() => expect(`${ui.lastFrame()}\n${JSON.stringify(context.setMessage.mock.calls)}`).toMatch(/leer|archivier/i));
  expect(await readFile(path.join(directory, 'mandanten', original.id, 'profil.json'))).toEqual(previousProfile);
  expect(await listNotizen(original.id)).toEqual(previousNotes);
  expect(await listMandanten()).toHaveLength(1);
});

it('schließt den Editor nach gespeichertem Profil trotz Refreshfehler ohne weitere Akten anzulegen', async () => {
  const ui = render(<MandantScreen/>);
  await settle();
  await press(ui, '\ue102');
  await vi.waitFor(() => expect(ui.lastFrame()).toContain('Ctrl+S Speichern'));
  context.refresh.mockRejectedValueOnce(new Error('Ansicht konnte nicht gelesen werden.'));
  await press(ui, 'Gespeicherter Mandant', '\x13');
  await vi.waitFor(async () => expect(await listMandanten()).toHaveLength(2));
  await vi.waitFor(() => expect(context.setMessage).toHaveBeenCalledWith(expect.stringMatching(/gespeichert\. Die Akte konnte nicht aktualisiert werden\./), true));
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain('Ctrl+S Speichern'));
  await press(ui, '\x13', '\x13');
  const clients = await listMandanten();
  expect(clients).toHaveLength(2);
  expect(clients.filter(mandant => mandant.name === 'Gespeicherter Mandant')).toHaveLength(1);
  expect(await getMandant(original.id)).toEqual(original);
});
