import { createHash, randomUUID } from 'node:crypto';
import { connection } from 'next/server';

import { getServiceById } from '@/lib/mercadopago/catalog';
import { getDatabase } from '@/lib/neon';
import { createServicePreference } from '@/lib/mercadopago/preference';
import {
  isCallServiceId,
  isLecturaServiceId,
  parseCompletedQuestions,
  questionRejectionMessage,
} from '@/lib/lecturas/services';
import { checkoutRateSubject } from '@/lib/lecturas/rate';
import {
  cancelPendingLectura,
  RateLimitError,
  registerCheckoutAttempt,
  reserveCallSlot,
  saveQuestionOrder,
  SlotLimitError,
  SlotTakenError,
} from '@/lib/lecturas/store';
import { isPastSlot, slotStartUtc } from '@/lib/lecturas/time';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos iniciar la solicitud.';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  await connection();
  const checkoutId = randomUUID();
  let persisted = false;

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!process.env.DATABASE_URL) {
      return Response.json({ error: 'El sistema de reservas no está disponible.' }, { status: 503 });
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
    const serviceId = readString(data.serviceId);
    const name = readString(data.name);
    const email = readString(data.email).toLowerCase();
    const phone = readString(data.phone);
    const eventId = readString(data.eventId);
    const paymentMethod = data.paymentMethod === 'transfer' ? 'transfer' : data.paymentMethod === 'mercadopago' ? 'mercadopago' : '';
    const metaConsent = data.metaConsent === true;

    if (!isLecturaServiceId(serviceId)) {
      return Response.json({ error: 'Servicio no válido.' }, { status: 400 });
    }

    const service = getServiceById(serviceId);
    if (!service) {
      return Response.json({ error: 'Servicio no válido.' }, { status: 400 });
    }

    if (!name || !email || !phone || !paymentMethod) {
      return Response.json({ error: 'Completá tus datos de contacto.' }, { status: 400 });
    }

    if (name.length > 200 || email.length > 254 || !EMAIL_PATTERN.test(email) || phone.replace(/\D/g, '').length < 8 || phone.length > 30) {
      return Response.json({ error: 'Revisá tu nombre, correo o WhatsApp.' }, { status: 400 });
    }

    if (eventId.length > 200) {
      return Response.json({ error: 'Identificador del evento no válido.' }, { status: 400 });
    }

    if (paymentMethod === 'mercadopago' && !accessToken) {
      return Response.json({ error: 'El sistema de pagos no está disponible.' }, { status: 503 });
    }

    await registerCheckoutAttempt(checkoutRateSubject(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    ));

    if (isCallServiceId(serviceId)) {
      const date = readString(data.date);
      const hour = data.hour;
      if (!Number.isInteger(hour) || typeof hour !== 'number') {
        return Response.json({ error: 'Elegí un horario.' }, { status: 400 });
      }

      let startsAt: Date;
      try {
        startsAt = slotStartUtc(date, hour);
      } catch {
        return Response.json({ error: 'Elegí una fecha y un horario válidos.' }, { status: 400 });
      }

      if (isPastSlot(date, hour)) {
        return Response.json({ error: 'Ese horario ya pasó.' }, { status: 400 });
      }

      persisted = true;
      await reserveCallSlot({
        checkoutId,
        name,
        email,
        phone,
        startsAt,
        paymentMethod,
      });
    } else {
      const parsed = parseCompletedQuestions(serviceId, data.questions);
      if (!parsed.ok) {
        return Response.json({ error: questionRejectionMessage(parsed) }, { status: 400 });
      }

      persisted = true;
      await saveQuestionOrder({
        checkoutId,
        serviceId,
        name,
        email,
        phone,
        questions: parsed.questions,
        amountArs: service.unitPrice,
        paymentMethod,
      });
    }

    if (paymentMethod === 'transfer') {
      return Response.json({ checkoutId, status: 'pending' });
    }

    const emailSha256 = metaConsent
      ? createHash('sha256').update(email.toLowerCase()).digest('hex')
      : null;

    const preference = await createServicePreference({
      accessToken: accessToken as string,
      checkoutId,
      service,
      name,
      email,
      eventId,
    });

    const sql = getDatabase();
    await sql`
      INSERT INTO mercadopago_checkouts (
        checkout_id,
        preference_id,
        service_id,
        email_sha256,
        meta_consent,
        checkout_event_id
      )
      VALUES (
        ${checkoutId},
        ${preference.preferenceId},
        ${service.id},
        ${emailSha256},
        ${metaConsent},
        ${eventId || null}
      )
    `;

    return Response.json({ init_point: preference.initPoint, checkoutId });
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return Response.json({ error: 'Ese horario acaba de ocuparse. Elegí otro.' }, { status: 409 });
    }

    if (error instanceof SlotLimitError) {
      return Response.json({ error: 'Ya tenés una solicitud de horario en curso.' }, { status: 429 });
    }

    if (error instanceof RateLimitError) {
      return Response.json({ error: 'Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.' }, { status: 429 });
    }

    if (persisted) {
      try {
        await cancelPendingLectura(checkoutId);
      } catch {
        // La orden puede no haberse guardado por completo.
      }
    }

    console.error('Error al crear el checkout de lectura:', errorMessage(error));
    return Response.json({ error: 'No pudimos iniciar la solicitud. Intentá nuevamente.' }, { status: 500 });
  }
}
