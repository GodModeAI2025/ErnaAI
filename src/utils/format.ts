export const slugify = (value: string): string => value.toLocaleLowerCase('de').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'eintrag';
export const truncate = (value: string, length: number): string => value.length > length ? value.slice(0, Math.max(0, length - 1)) + '…' : value;
// Dateiinhalte und API-Antworten dürfen keine Terminal-Steuersequenzen ausführen.
export const terminalText = (value: string): string => value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    const messages: Record<string,string> = { ENOENT:'Datei oder Verzeichnis nicht gefunden', EACCES:'Keine Zugriffsberechtigung', EPERM:'Zugriff nicht erlaubt', EISDIR:'Anstelle einer Datei wurde ein Verzeichnis gefunden', ENOTDIR:'Anstelle eines Verzeichnisses wurde eine Datei gefunden', ENOSPC:'Kein freier Speicherplatz', EROFS:'Das Dateisystem ist schreibgeschützt', EEXIST:'Datei oder Verzeichnis existiert bereits' };
    const message=messages[error.code];
    if(message)return `${message} (${error.code})${'path' in error && typeof error.path === 'string' ? `: ${error.path}` : ''}`;
  }
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
}
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Ungültiges Datenformat: Objekt erwartet.');
  return value as Record<string, unknown>;
}
export function stringField(object: Record<string, unknown>, key: string): string {
  const value = object[key]; if (typeof value !== 'string') throw new Error(`Ungültiges Textfeld: ${key}`); return value;
}
export function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
