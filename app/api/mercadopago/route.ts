
import { randomUUID, createHash } from 'node:crypto';
import { getServiceById } from '@/lib/mercadopago/catalog';
import { createServicePreference } from '@/lib/mercadopago/preference';
import { isLecturaServiceId } from '@/lib/lecturas/services';

import { getDatabase } from '@/lib/neon';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Error al crear la preferencia en Mercado Pago.';
}

export async function POST(request: Request) {
  try {
    // 1. Verificar la configuración del servidor.
    const accessToken = process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      console.error('MP_ACCESS_TOKEN no está configurado.');

      return Response.json(
        { error: 'El sistema de pagos no está disponible.' },
        { status: 503 },
      );
    }

    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL no está configurada.');

      return Response.json(
        { error: 'El sistema de pagos no está disponible.' },
        { status: 503 },
      );
    }

    // 2. Leer y validar los datos de la solicitud.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'La solicitud contiene un JSON inválido.' },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Los datos de la solicitud no son válidos.' },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;

    const serviceId =
      typeof data.serviceId === 'string'
        ? data.serviceId
        : '';

    if (isLecturaServiceId(serviceId)) {
      return Response.json(
        { error: 'Las lecturas se inician desde su checkout.' },
        { status: 400 },
      );
    }

    const name =
      typeof data.name === 'string'
        ? data.name.trim()
        : '';

    const email =
      typeof data.email === 'string'
        ? data.email.trim()
        : '';

    const eventId =
      typeof data.eventId === 'string'
        ? data.eventId.trim()
        : '';

    const metaConsent = data.metaConsent === true;

    const service = getServiceById(serviceId);

    if (!service) {
      return Response.json(
        { error: 'Servicio no válido.' },
        { status: 400 },
      );
    }

    if (!name || !email) {
      return Response.json(
        { error: 'Nombre y correo electrónico son requeridos.' },
        { status: 400 },
      );
    }

    if (
      name.length > 200 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return Response.json(
        { error: 'Nombre o correo electrónico no válido.' },
        { status: 400 },
      );
    }

    if (eventId.length > 200) {
      return Response.json(
        { error: 'Identificador del evento no válido.' },
        { status: 400 },
      );
    }

    // 3. Generar un identificador único del checkout.
    const checkoutId = randomUUID();

    // 4. Preparar el email para Meta CAPI.
    // No almacenar el email hasheado si no hay consentimiento.
    const emailSha256 = metaConsent
      ? createHash('sha256')
          .update(email.toLowerCase())
          .digest('hex')
      : null;

    // 5. Crear la preferencia en Mercado Pago.
    // El precio sale del catálogo del servidor, no del cliente.
    const result = await createServicePreference({
      accessToken,
      checkoutId,
      service,
      name,
      email,
      eventId,
    });

    // 7. Registrar el checkout en Neon.
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
        ${result.preferenceId},
        ${service.id},
        ${emailSha256},
        ${metaConsent},
        ${eventId || null}
      )
    `;

    // 8. Devolver la URL del checkout al frontend.
    return Response.json({
      init_point: result.initPoint,
    });
  } catch (error) {
    console.error(
      'Error al crear el checkout de Mercado Pago:',
      getErrorMessage(error),
    );

    return Response.json(
      {
        error: 'No pudimos iniciar el pago. Intentá nuevamente.',
      },
      { status: 500 },
    );
  }
}
