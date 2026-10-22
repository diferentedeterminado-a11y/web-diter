import { connection } from 'next/server';

import { getServiceById } from '@/lib/mercadopago/catalog';
import { lookupRemotePayment } from '@/lib/mercadopago/remote-payment';
import {
  assessRemotePayments,
  classifyCheckoutReturn,
  returnServiceKind,
  type CheckoutReturnInput,
} from '@/lib/lecturas/return-status';
import {
  isUndefinedLecturaSchema,
  readCheckoutServiceId,
  readLecturaFulfillment,
} from '@/lib/lecturas/store';

const CHECKOUT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

const SETTLED = new Set(['approved', 'reschedule', 'rejected', 'cancelled']);

export async function GET(request: Request) {
  await connection();
  const checkoutId = new URL(request.url).searchParams.get('checkoutId')?.trim() ?? '';
  if (!CHECKOUT_UUID.test(checkoutId)) {
    return Response.json({ error: 'La solicitud no es válida.' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ state: 'unavailable', service: null }, { headers: PRIVATE_HEADERS });
  }

  try {
    const lectura = await readLecturaFulfillment(checkoutId);
    const checkoutServiceId = lectura ? null : await readCheckoutServiceId(checkoutId);
    const serviceId = lectura?.serviceId ?? checkoutServiceId;

    if (!serviceId) {
      return Response.json(classifyCheckoutReturn(null), { headers: PRIVATE_HEADERS });
    }

    const localInput: CheckoutReturnInput = {
      service: returnServiceKind(serviceId),
      paymentStatus: lectura?.paymentStatus ?? null,
      reservationStatus: lectura?.reservationStatus ?? null,
      openIncident: lectura?.openIncident ?? false,
      paymentEventStatus: lectura?.paymentEventStatus ?? null,
      remoteStatus: null,
    };
    const local = classifyCheckoutReturn(localInput);

    if (SETTLED.has(local.state)) {
      return Response.json(local, { headers: PRIVATE_HEADERS });
    }

    const canQueryPayment = lectura?.paymentMethod === 'mercadopago' || checkoutServiceId !== null;
    const accessToken = process.env.MP_ACCESS_TOKEN;
    let remoteStatus: CheckoutReturnInput['remoteStatus'] = null;
    if (canQueryPayment && accessToken) {
      const remote = await lookupRemotePayment(checkoutId, accessToken);
      const service = getServiceById(serviceId);
      remoteStatus = remote.availability === 'unavailable'
        ? 'unavailable'
        : assessRemotePayments(remote.payments, {
          checkoutId,
          amount: service?.unitPrice ?? null,
          currency: service?.currency ?? null,
        });
    }

    return Response.json(
      classifyCheckoutReturn({ ...localInput, remoteStatus }),
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    if (!isUndefinedLecturaSchema(error)) {
      console.error('checkout_return_status_failed');
    }

    return Response.json({ state: 'unavailable', service: null }, { headers: PRIVATE_HEADERS });
  }
}
