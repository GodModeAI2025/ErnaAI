import { describe, expect, it } from 'vitest';
import { dateGroup, displayDate, isIsoDate, parseGermanDate, timestamp } from '../../src/utils/dates.js';
describe('Deutsche Datumsverarbeitung', () => {
  it('validiert Kalenderdaten statt nur Zeichenfolgen', () => { expect(isIsoDate('2024-02-29')).toBe(true); expect(isIsoDate('2025-02-29')).toBe(false); expect(isIsoDate('2025-13-01')).toBe(false); });
  it('verarbeitet deutsches Datum verlustfrei', () => { expect(parseGermanDate('04.09.2026')).toBe('2026-09-04'); expect(parseGermanDate('31.02.2026')).toBeNull(); expect(displayDate('2026-09-04')).toBe('04.09.2026'); });
  it('verwendet einen expliziten Zeitzonenoffset', () => { expect(timestamp()).toMatch(/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/); });
  it('gruppiert Montag bis Sonntag auch über Jahresgrenzen', () => { const now = new Date(2026, 11, 31, 12); expect(dateGroup('2026-12-30', false, now)).toBe('Überfällig'); expect(dateGroup('2026-12-31', false, now)).toBe('Heute'); expect(dateGroup('2027-01-03', false, now)).toBe('Diese Woche'); expect(dateGroup('2027-01-04', false, now)).toBe('Nächste Woche'); });
});
