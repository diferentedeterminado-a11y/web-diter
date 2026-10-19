import { connection } from 'next/server';

import {
  dispatchLecturaQuestionNotices,
  requeuePaidQuestionNotice,
} from '@/lib/lecturas/notifications';
import { isUndefinedLecturaSchema } from '@/lib/lecturas/store';
import { validationKeysMatch } from '@/lib/lecturas/secret';

const CHECKOUT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let action: 'dispatch' | 'requeue' = 'dispatch';
  let checkoutId = '';
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const body = JSON.parse(raw) as unknown;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json({ error: 'La solicitud no es válida.' }, { status: 400 });
      }
      const data = body as Record<string, unknown>;
      if (data.action === 'requeue') {
        action = 'requeue';
      }
      checkoutId = typeof data.checkoutId === 'string' ? data.checkoutId.trim() : '';
    } catch {
      return Response.json({ error: 'La solicitud contiene un JSON inválido.' }, { status: 400 });
    }
  }

  if (action === 'requeue' && !CHECKOUT_UUID.test(checkoutId)) {
    return Response.json({ error: 'La solicitud de reintento no es válida.' }, { status: 400 });
  }

  try {
    const requeue = action === 'requeue' ? await requeuePaidQuestionNotice(checkoutId) : null;
    const dispatch = await dispatchLecturaQuestionNotices();
    return Response.json(
      {
        requeue,
        skipped: dispatch.skipped,
        sent: dispatch.sent,
        retry: dispatch.retry,
        failed: dispatch.failed,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (isUndefinedLecturaSchema(error)) {
      return Response.json({ error: 'La cola de notificaciones todavía no está disponible.' }, { status: 503 });
    }

    console.error('lectura_question_notice_failed', 'dispatch_error');
    return Response.json({ error: 'No pudimos procesar la cola.' }, { status: 500 });
  }
}
