export const ART_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export function artDateKeyFromDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ART_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function artWeekdayIndex(year: number, month: number, day: number): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ART_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day, 15)));

  return WEEKDAY_INDEX[weekday] ?? 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return false;
  }

  return true;
}

/** Convierte un inicio en hora Argentina (UTC-3, sin horario de verano) a un instante UTC. */
export function slotStartUtc(dateKey: string, hour: number): Date {
  if (!isDateKey(dateKey) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Horario inválido.');
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, 0, 0));
}

export function isPastSlot(dateKey: string, hour: number, now = new Date()): boolean {
  return slotStartUtc(dateKey, hour).getTime() <= now.getTime();
}

export function artSlotFromUtc(date: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ART_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
  };
}

export function formatLongArtDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ART_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 15)));
}

export function formatArtMonthTitle(year: number, month: number): string {
  const title = new Intl.DateTimeFormat('es-AR', {
    timeZone: ART_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1, 15)));

  return title.charAt(0).toUpperCase() + title.slice(1);
}
