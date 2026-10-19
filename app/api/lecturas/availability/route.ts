import { connection } from 'next/server';

import { listOccupiedSlots } from '@/lib/lecturas/store';
import { isDateKey, slotStartUtc } from '@/lib/lecturas/time';

export async function GET(request: Request) {
  await connection();

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'El calendario no está disponible.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';

  if (!isDateKey(from) || !isDateKey(to) || from > to) {
    return Response.json({ error: 'El rango de fechas no es válido.' }, { status: 400 });
  }

  try {
    const occupied = await listOccupiedSlots(slotStartUtc(from, 0), slotStartUtc(to, 0));
    return Response.json({ occupied });
  } catch (error) {
    console.error(
      'Error al consultar disponibilidad:',
      error instanceof Error ? error.message : 'Error desconocido'
    );
    return Response.json({ error: 'No pudimos cargar los horarios.' }, { status: 500 });
  }
}
