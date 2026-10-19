import { connection } from 'next/server';

import { validationKeysMatch } from '@/lib/lecturas/secret';
import { listOpenIncidents } from '@/lib/lecturas/store';

export async function GET(request: Request) {
  await connection();
  const expected = process.env.LECTURAS_VALIDATION_KEY;
  const provided = request.headers.get('x-lecturas-validation-key') ?? '';

  if (!expected) {
    return Response.json({ error: 'La validación de transferencias no está configurada.' }, { status: 503 });
  }

  if (!validationKeysMatch(provided, expected)) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const incidents = await listOpenIncidents();
    return Response.json(
      { incidents },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      'Error al listar incidencias de lecturas:',
      error instanceof Error ? error.message : 'Error desconocido',
    );
    return Response.json({ error: 'No pudimos consultar las incidencias.' }, { status: 500 });
  }
}
