import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { createElement } from 'react';
import { render, Text, useInput } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardInput, functionKey, isCancel, isReservedInput, isSave } from '../../src/utils/keyboard.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup());
  vi.useRealTimers();
});

function fixture(collect = true) {
  const source = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode: vi.fn(function (enabled: boolean) { source.isRaw = enabled; return source; }),
    ref: vi.fn(() => source),
    unref: vi.fn(() => source),
  });
  const adapter = createKeyboardInput(source as unknown as NodeJS.ReadStream);
  const output: string[] = [];
  if (collect) {
    adapter.stdin.setEncoding('utf8');
    adapter.stdin.on('data', (chunk: string) => output.push(chunk));
  }
  cleanups.push(() => { adapter.dispose(); source.destroy(); });
  return { source, adapter, output };
}

const sequences = ['\u001bOP', '\u001bOQ', '\u001bOR', '\u001bOS', '\u001b[15~', '\u001b[17~', '\u001b[18~', '\u001b[19~', '\u001b[20~', '\u001b[21~'];

describe('Funktionstastenadapter', () => {
  it.each(sequences.map((sequence, index) => [index + 1, sequence] as const))(
    'übersetzt F%i in ein getrenntes Unicode-Ereignis', (number, sequence) => {
      const { source, output } = fixture();
      source.write(sequence);
      expect(output.join('')).toBe(`\u001b[${0xe100 + number - 1}u`);
    },
  );

  it('erkennt weitere klassische Terminalvarianten', () => {
    const { source, output } = fixture();
    source.write('\u001b[P\u001b[11~\u001b[[A\u001b[[E');
    expect(output.join('')).toBe('\u001b[57600u\u001b[57600u\u001b[57600u\u001b[57604u');
  });

  it('setzt geteilte Escape-Sequenzen zusammen', () => {
    const { source, output } = fixture();
    for (const byte of Buffer.from('\u001b[21~')) source.write(Buffer.from([byte]));
    expect(output.join('')).toBe('\u001b[57609u');
  });

  it('reicht Pfeile, Alt-Ziffern und andere Steuersequenzen unverändert durch', () => {
    const { source, output } = fixture();
    const original = '\u001b[A\u001b[B\u001b[C\u001b[D\u001b[1;5A\u001b[23~\u001b1\r\t\u0013';
    for (const character of original) source.write(character);
    expect(output.join('')).toBe(original);
  });

  it('erhält UTF-8 auch bei einer Byte-Grenze mitten im Zeichen', () => {
    const { source, output } = fixture();
    const original = 'Rückfrage, € 850 – München 📝\nzweite Zeile';
    for (const byte of Buffer.from(original)) source.write(Buffer.from([byte]));
    expect(output.join('')).toBe(original);
  });

  it('verändert keine Funktionstastensequenzen innerhalb von Bracketed Paste', () => {
    const { source, output } = fixture();
    const paste = '\u001b[200~Mehrzeilig\n\u001bOP\u001b[21~Ä📝\u001b[201~';
    for (const byte of Buffer.from(paste)) source.write(Buffer.from([byte]));
    source.write('\u001bOQ');
    expect(output.join('')).toBe(`${paste}\u001b[57601u`);
  });

  it('gibt alleinstehendes Escape nach kurzer Wartezeit frei', () => {
    vi.useFakeTimers();
    const { source, output } = fixture();
    source.write('\u001b');
    expect(output).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(output.join('')).toBe('\u001b');
  });

  it('gibt einen unvollständigen Rest am Streamende frei', async () => {
    const { source, adapter, output } = fixture();
    const ended = once(adapter.stdin, 'end');
    source.end('Text\u001b[2');
    await ended;
    expect(output.join('')).toBe('Text\u001b[2');
  });

  it('leitet TTY-Methoden weiter und räumt idempotent auf', () => {
    vi.useFakeTimers();
    const { source, adapter, output } = fixture();
    const unpipe = vi.spyOn(source, 'unpipe');
    adapter.stdin.setRawMode(true);
    adapter.stdin.ref();
    adapter.stdin.unref();
    expect(source.setRawMode).toHaveBeenCalledWith(true);
    expect(adapter.stdin.isRaw).toBe(true);
    expect(source.ref).toHaveBeenCalledOnce();
    expect(source.unref).toHaveBeenCalledOnce();
    source.write('\u001b');
    adapter.dispose();
    adapter.dispose();
    vi.advanceTimersByTime(100);
    expect(unpipe).toHaveBeenCalledOnce();
    expect(source.isPaused()).toBe(true);
    expect(source.isRaw).toBe(false);
    expect(adapter.stdin.destroyed).toBe(true);
    expect(source.destroyed).toBe(false);
    expect(source.listenerCount('data')).toBe(0);
    expect(output).toEqual([]);
  });

  it('liefert useInput getrennte F-Tasten auch zusammen mit normalen Eingaben', async () => {
    const { source, adapter } = fixture(false);
    const events: (string | number)[] = [];
    function Probe() {
      useInput((input, key) => events.push(functionKey(input, key) ?? (key.upArrow ? 'auf' : input)));
      return createElement(Text, null, 'Tastaturtest');
    }
    const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 24, isTTY: false });
    stdout.resume();
    const instance = render(createElement(Probe), {
      stdin: adapter.stdin,
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      interactive: false,
      patchConsole: false,
      exitOnCtrlC: false,
    });
    cleanups.push(() => { instance.unmount(); instance.cleanup(); stdout.destroy(); });
    await vi.waitFor(() => expect(source.setRawMode).toHaveBeenCalledWith(true));
    source.write(`Text${sequences.join('')}\u001b[A`);
    await vi.waitFor(() => expect(events).toEqual(['Text', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'auf']));
  });
});

describe('Tastaturhelfer', () => {
  it('erkennt private Tokens und Alt+1 bis Alt+0', () => {
    for (let number = 1; number <= 10; number++) {
      expect(functionKey(String.fromCodePoint(0xe100 + number - 1))).toBe(number);
      expect(functionKey(String(number % 10), { meta: true })).toBe(number);
    }
    expect(functionKey('1')).toBeNull();
    expect(functionKey('1', { meta: true, ctrl: true })).toBeNull();
    expect(functionKey('\ue100', { eventType: 'release' })).toBeNull();
    expect(functionKey('Text\ue100')).toBeNull();
  });

  it('filtert reservierte Tokens auch innerhalb eines Texteingabewertes', () => {
    expect(isReservedInput('Titel\ue100Fortsetzung')).toBe(true);
    expect(isReservedInput('\ue109')).toBe(true);
    expect(isReservedInput('Notiz mit Umlaut ä und Emoji 📝')).toBe(false);
  });

  it('erkennt Speichern und Abbrechen ausschließlich als Tastenkombination', () => {
    expect(isSave('s', { ctrl: true })).toBe(true);
    expect(isSave('S', { ctrl: true })).toBe(true);
    expect(isSave('s')).toBe(false);
    expect(isSave('s', { ctrl: true, eventType: 'release' })).toBe(false);
    expect(isCancel('', { escape: true })).toBe(true);
    expect(isCancel('escape')).toBe(false);
  });
});
