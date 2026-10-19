export type DemoSlotKind = 'reservation' | 'admin_block';

export type DemoSlot = {
  dayOffset: number;
  hour: number;
  kind: DemoSlotKind;
};

/**
 * Horarios ficticios para la previsualización.
 * `reservation` y `admin_block` se muestran igual al cliente (Ocupado)
 * y se distinguen solo en los datos internos.
 */
export const DEMO_SLOTS: DemoSlot[] = [
  { dayOffset: 0, hour: 9, kind: 'reservation' },
  { dayOffset: 0, hour: 21, kind: 'admin_block' },
  { dayOffset: 1, hour: 0, kind: 'admin_block' },
  { dayOffset: 1, hour: 14, kind: 'reservation' },
  { dayOffset: 2, hour: 18, kind: 'reservation' },
  { dayOffset: 3, hour: 11, kind: 'admin_block' },
  { dayOffset: 5, hour: 23, kind: 'reservation' },
  { dayOffset: 7, hour: 8, kind: 'admin_block' },
];

const ART_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function artDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ART_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addArtDays(dateKey: string, offset: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day + offset, 15));
  return artDateKey(instant);
}

export function resolveDemoSlots(todayKey: string) {
  return DEMO_SLOTS.map((slot) => ({
    ...slot,
    dateKey: addArtDays(todayKey, slot.dayOffset),
  }));
}

export function artWeekdayIndex(year: number, month: number, day: number): number {
  const instant = new Date(Date.UTC(year, month - 1, day, 15));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ART_TIME_ZONE,
    weekday: 'short',
  }).format(instant);

  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
