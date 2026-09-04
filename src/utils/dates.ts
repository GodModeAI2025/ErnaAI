import { addDays, differenceInCalendarDays, endOfWeek, format, isValid, parse, parseISO, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
export const timestamp = (date = new Date()): string => format(date, "yyyy-MM-dd'T'HH:mm:ssxxx");
export const today = (date = new Date()): string => format(date, 'yyyy-MM-dd');
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && today(parseISO(value)) === value;
}
export function displayDate(value: string | Date): string {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, 'dd.MM.yyyy', { locale: de }) : 'Datum ungültig';
}
export const displayTime = (date = new Date()): string => format(date, 'HH:mm', { locale: de });
export const displayWeekday = (date = new Date()): string => format(date, 'EEEE', { locale: de });
export const daysBetween = (a: string, b: string): number => differenceInCalendarDays(parseISO(a), parseISO(b));
export const isOverdue = (datum: string, reference = new Date()): boolean => datum < today(reference);
export function parseGermanDate(value: string): string | null {
  if (isIsoDate(value)) return value;
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) return null;
  const parsed = parse(value, 'dd.MM.yyyy', new Date());
  return isValid(parsed) && displayDate(parsed) === value ? today(parsed) : null;
}
export type DateGroup = 'Überfällig' | 'Heute' | 'Diese Woche' | 'Nächste Woche' | 'Später' | 'Erledigt';
export function dateGroup(datum: string, erledigt = false, reference = new Date()): DateGroup {
  if (erledigt) return 'Erledigt';
  const date = parseISO(datum), now = startOfDay(reference);
  if (date < now) return 'Überfällig';
  if (datum === today(now)) return 'Heute';
  if (date <= endOfWeek(now, { weekStartsOn: 1 })) return 'Diese Woche';
  if (date <= endOfWeek(addDays(now, 7), { weekStartsOn: 1 })) return 'Nächste Woche';
  return 'Später';
}
