import { Transform, type TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import type { Key } from 'ink';

const ESC = '\u001b';
const TOKEN_START = 0xe100;
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;
const ESCAPE_DELAY_MS = 50;
const FUNCTION_SEQUENCES = new Map<string, number>([
  ...['P', 'Q', 'R', 'S'].flatMap((letter, index): [string, number][] => [
    [`${ESC}O${letter}`, index + 1], [`${ESC}[${letter}`, index + 1],
  ]),
  ...[11, 12, 13, 14, 15, 17, 18, 19, 20, 21].map(
    (code, index): [string, number] => [`${ESC}[${code}~`, index + 1],
  ),
  ...['A', 'B', 'C', 'D', 'E'].map(
    (letter, index): [string, number] => [`${ESC}[[${letter}`, index + 1],
  ),
]);
const PREFIXES = [...FUNCTION_SEQUENCES.keys(), PASTE_START];

/** Ink unterdrückt klassische F-Tasten. CSI-u rahmt ein privates Unicode-Zeichen
 * als einzelnes Ereignis, damit zusammen eintreffende Tasten getrennt bleiben.
 * Fachliche Aktionen verarbeiten ausschließlich die useInput-Handler. */
export function createKeyboardInput(source: NodeJS.ReadStream): {
  stdin: NodeJS.ReadStream;
  dispose: () => void;
} {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let pasting = false;
  let disposed = false;
  let rawModeChanged = false;
  const initialRawMode = source.isRaw;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearTimeoutIfPending = (): void => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
  };
  const emit = (text: string): void => {
    if (text) stream.push(text);
  };
  const drain = (final = false): void => {
    clearTimeoutIfPending();
    while (pending) {
      if (pasting) {
        const end = pending.indexOf(PASTE_END);
        if (end >= 0) {
          emit(pending.slice(0, end + PASTE_END.length));
          pending = pending.slice(end + PASTE_END.length);
          pasting = false;
          continue;
        }
        // Nur einen möglicherweise geteilten Endmarker zurückhalten.
        let suffixLength = 0;
        for (let length = 1; length < PASTE_END.length; length++) {
          if (pending.endsWith(PASTE_END.slice(0, length))) suffixLength = length;
        }
        const cut = final ? pending.length : pending.length - suffixLength;
        emit(pending.slice(0, cut));
        pending = pending.slice(cut);
        break;
      }
      const escapeIndex = pending.indexOf(ESC);
      if (escapeIndex !== 0) {
        const cut = escapeIndex < 0 ? pending.length : escapeIndex;
        emit(pending.slice(0, cut));
        pending = pending.slice(cut);
        continue;
      }
      if (pending.startsWith(PASTE_START)) {
        emit(PASTE_START);
        pending = pending.slice(PASTE_START.length);
        pasting = true;
        continue;
      }
      const match = [...FUNCTION_SEQUENCES].find(([sequence]) => pending.startsWith(sequence));
      if (match) {
        emit(`${ESC}[${TOKEN_START + match[1] - 1}u`);
        pending = pending.slice(match[0].length);
        continue;
      }
      if (!final && PREFIXES.some(sequence => sequence.startsWith(pending))) break;
      emit(ESC);
      pending = pending.slice(1);
    }
    // Ein einzelnes ESC muss auch ohne nachfolgenden Tastendruck weiterlaufen.
    if (pending && !pasting && !final) {
      timeout = setTimeout(() => {
        timeout = undefined;
        emit(pending);
        pending = '';
      }, ESCAPE_DELAY_MS);
      timeout.unref();
    }
  };

  const stream = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      pending += decoder.write(chunk);
      drain();
      callback();
    },
    flush(callback: TransformCallback) {
      pending += decoder.end();
      drain(true);
      callback();
    },
  });
  // Ink verwendet die Readable-API und diese TTY-Methoden. Der Adapter besitzt
  // keinen zweiten Dateideskriptor; Raw-Modus und Lebensdauer gehören der Quelle.
  Object.defineProperties(stream, {
    isTTY: { get: () => source.isTTY },
    isRaw: { get: () => source.isRaw },
  });
  const stdin = Object.assign(stream, {
    setRawMode(enabled: boolean) {
      source.setRawMode(enabled);
      rawModeChanged = true;
      return stdin;
    },
    ref() { source.ref(); return stdin; },
    unref() { source.unref(); return stdin; },
  }) as unknown as NodeJS.ReadStream;
  source.pipe(stream);

  return {
    stdin,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeoutIfPending();
      source.unpipe(stream);
      source.pause();
      if (rawModeChanged && source.isRaw !== initialRawMode) source.setRawMode(initialRawMode);
      stream.destroy();
    },
  };
}

export function functionKey(input: string, key: Partial<Key> = {}): number | null {
  if (key.eventType === 'release') return null;
  const code = input.codePointAt(0);
  if (input.length === 1 && code !== undefined && code >= TOKEN_START && code < TOKEN_START + 10) {
    return code - TOKEN_START + 1;
  }
  if (key.meta && !key.ctrl && /^[0-9]$/.test(input)) return input === '0' ? 10 : Number(input);
  return null;
}

export function isSave(input: string, key: Partial<Key> = {}): boolean {
  return key.eventType !== 'release' && Boolean(key.ctrl) && input.toLowerCase() === 's';
}

export function isCancel(_input: string, key: Partial<Key> = {}): boolean {
  return key.eventType !== 'release' && Boolean(key.escape);
}

export function isReservedInput(input: string): boolean {
  return /[\ue100-\ue109]/u.test(input);
}
