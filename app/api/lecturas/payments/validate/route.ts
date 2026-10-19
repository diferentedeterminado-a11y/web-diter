import { connection } from 'next/server';

import { scheduleLecturaQuestionNotice } from '@/lib/lecturas/notifications';
import { validationKeysMatch } from '@/lib/lecturas/secret';
import { validatePendingLectura } from '@/lib/lecturas/store';

export async function POST(request: Request) {
  await connection();
  const expected = process.env.LECTURAS_VALIDATION_KEY;
  const provided = request.headers.get('x-lecturas-validation-key') ?? '';

  if (!expected) {
    return Response.json({ error: 'La validación de transferencias no está configurada.' }, { status: 503 });
  }

  if (!validationKeysMatch(provided, expected)) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'La base de datos no está disponible.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'La solicitud contiene un JSON inválido.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Los datos de la solicitud no son válidos.' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const checkoutId = typeof data.checkoutId === 'string' ? data.checkoutId.trim() : '';
  const decision = data.decision === 'approved' || data.decision === 'rejected' ? data.decision : '';

  if (!/^[0-9a-f-]{36}$/i.test(checkoutId) || !decision) {
    return Response.json({ error: 'La solicitud de validación no es válida.' }, { status: 400 });
  }

  try {
    const result = await validatePendingLectura(checkoutId, decision);
    if (result === 'approved' || result === 'confirmed' || result === 'incident') {
      await scheduleLecturaQuestionNotice(checkoutId, result);
    }
    if (result === 'missing') {
      return Response.json({ error: 'No encontramos esa solicitud.' }, { status: 404 });
    }

    if (result === 'not_transfer' || result === 'not_pending') {
      return Response.json({ error: 'Esa solicitud no se puede validar.' }, { status: 409 });
    }

    if (result === 'incident') {
      return Response.json({
        checkoutId,
        paymentStatus: 'approved',
        fulfillment: 'incident',
      });
    }

    if (result === 'rejected') {
      return Response.json({
        checkoutId,
        paymentStatus: 'rejected',
        fulfillment: 'released',
      });
    }

    return Response.json({
      checkoutId,
      paymentStatus: 'approved',
      fulfillment: result === 'confirmed' ? 'confirmed' : 'approved',
    });
  } catch (error) {
    console.error(
      'Error al validar una transferencia:',
      error instanceof Error ? error.message : 'Error desconocido'
    );
    return Response.json({ error: 'No pudimos validar la solicitud.' }, { status: 500 });
  }
}
