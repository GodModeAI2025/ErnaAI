import { describe, expect, it } from 'vitest';
import { verbrauchText } from '../../src/utils/format.js';

describe('Tokenzahlen einer KI-Antwort', () => {
  it('weist einen Cache-Treffer aus und zählt die gesamte Eingabe zusammen', () => {
    expect(verbrauchText({ eingabeNeu: 40, cacheGelesen: 102_988, cacheGeschrieben: 0, ausgabe: 12 }))
      .toBe('TOKENS: 103.028 Eingabe (102.988 aus dem Cache) · 12 Ausgabe');
  });
  it('nennt die erste Anfrage als Cache-Aufbau', () => {
    expect(verbrauchText({ eingabeNeu: 40, cacheGelesen: 0, cacheGeschrieben: 102_988, ausgabe: 12 }))
      .toBe('TOKENS: 103.028 Eingabe (102.988 neu zwischengespeichert) · 12 Ausgabe');
  });
  it('macht kenntlich, wenn gar nicht gecacht wurde', () => {
    expect(verbrauchText({ eingabeNeu: 1_200, cacheGelesen: 0, cacheGeschrieben: 0, ausgabe: 300 }))
      .toBe('TOKENS: 1.200 Eingabe (ohne Cache-Treffer) · 300 Ausgabe');
  });
});
