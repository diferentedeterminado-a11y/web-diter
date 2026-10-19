import { connection } from 'next/server';

import { cronRequestAuthorized } from '@/lib/lecturas/cron-auth';
import { dispatchLecturaNotices } from '@/lib/lecturas/notifications';
import { isUndefinedLecturaSchema } from '@/lib/lecturas/store';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  await connection();

  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'El reproceso de avisos no está configurado.' }, { status: 503, headers: PRIVATE_HEADERS });
  }

  if (!cronRequestAuthorized(request)) {
    return Response.json({ error: 'No autorizado.' }, { status: 401, headers: PRIVATE_HEADERS });
  }

  try {
    const dispatch = await dispatchLecturaNotices();
    return Response.json(
      {
        skipped: dispatch.skipped,
        sent: dispatch.sent,
        retry: dispatch.retry,
        failed: dispatch.failed,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    if (isUndefinedLecturaSchema(error)) {
      return Response.json({ error: 'La cola de notificaciones todavía no está disponible.' }, { status: 503, headers: PRIVATE_HEADERS });
    }

    console.error('lectura_question_notice_failed', 'dispatch_error');
    return Response.json({ error: 'No pudimos procesar la cola.' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
