import { connection } from 'next/server';

import { classifyLecturaFulfillment } from '@/lib/lecturas/return-status';
import { isUndefinedLecturaSchema, readLecturaFulfillment } from '@/lib/lecturas/store';

const CHECKOUT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  await connection();
  const checkoutId = new URL(request.url).searchParams.get('checkoutId')?.trim() ?? '';
  if (!CHECKOUT_UUID.test(checkoutId)) {
    return Response.json({ error: 'La solicitud no es válida.' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json(classifyLecturaFulfillment(null), { headers: PRIVATE_HEADERS });
  }

  try {
    const row = await readLecturaFulfillment(checkoutId);
    return Response.json(classifyLecturaFulfillment(row), { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (!isUndefinedLecturaSchema(error)) {
      console.error('lectura_fulfillment_failed');
    }

    return Response.json(classifyLecturaFulfillment(null), { headers: PRIVATE_HEADERS });
  }
}
