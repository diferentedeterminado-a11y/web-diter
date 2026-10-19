
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

import { getServiceById } from '@/lib/mercadopago/catalog';
import { getDatabase } from '@/lib/neon';
import { sendMetaPurchase } from '@/lib/meta/conversions';
import { scheduleLecturaQuestionNotice } from '@/lib/lecturas/notifications';
import { applyLecturaPayment, isUndefinedLecturaSchema } from '@/lib/lecturas/store';

function verifySignature(
  request: Request,
  paymentId: string
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const signature = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');

  if (!secret || !signature || !requestId || !paymentId) {
    return false;
  }

  const ts = signature
    .match(/(?:^|,)\s*ts=([^,]+)/)?.[1]
    ?.trim();

  const hash = signature
    .match(/(?:^|,)\s*v1=([a-fA-F0-9]+)/)?.[1]
    ?.trim();

  if (
    !ts ||
    !hash ||
    !/^\d+$/.test(ts) ||
    !/^[a-fA-F0-9]{64}$/.test(hash)
  ) {
    return false;
  }

  const manifest =
    `id:${paymentId};request-id:${requestId};ts:${ts};`;

  const expected = createHmac('sha256', secret)
    .update(manifest)
    .digest();

  const received = Buffer.from(hash, 'hex');

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

const CHECKOUT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function syncLecturaPayment(checkoutId: string, mpStatus: string, paymentId: string): Promise<void> {
  if (!CHECKOUT_UUID.test(checkoutId) || !/^[A-Za-z0-9_-]{1,80}$/.test(paymentId)) {
    return;
  }

  try {
    const result = await applyLecturaPayment(checkoutId, mpStatus, paymentId);
    if (result === 'incident') {
      console.error('Pago de lectura aprobado sin horario disponible:', checkoutId);
    }
    if (result === 'approved' || result === 'confirmed' || result === 'incident') {
      await scheduleLecturaQuestionNotice(checkoutId, result);
    }
  } catch (error) {
    if (isUndefinedLecturaSchema(error)) {
      console.error('Tablas de lecturas todavía no migradas.');
      return;
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    // 1. Verificar autenticidad de Mercado Pago.
    const url = new URL(request.url);
    const paymentId = url.searchParams.get('data.id') ?? '';

    if (!verifySignature(request, paymentId)) {
      return NextResponse.json(
        { error: 'Firma inválida.' },
        { status: 401 }
      );
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago no está configurado.' },
        { status: 503 }
      );
    }

    // 2. Consultar el pago directamente en Mercado Pago.
    const client = new MercadoPagoConfig({ accessToken });
    const paymentClient = new Payment(client);

    const payment = await paymentClient.get({
      id: paymentId,
    });

    if (payment.status !== 'approved') {
      if (payment.external_reference && payment.id) {
        await syncLecturaPayment(
          String(payment.external_reference),
          payment.status ?? 'pending',
          String(payment.id),
        );
      }

      return NextResponse.json({
        received: true,
        approved: false,
      });
    }

    // 3. Recuperar el checkout desde Neon.
    const checkoutId = payment.external_reference;

    if (!checkoutId) {
      return NextResponse.json(
        { error: 'El pago no tiene referencia de checkout.' },
        { status: 422 }
      );
    }

    const sql = getDatabase();

    const checkouts = await sql`
      SELECT
        checkout_id,
        preference_id,
        service_id,
        email_sha256,
        meta_consent,
        checkout_event_id
      FROM mercadopago_checkouts
      WHERE checkout_id = ${checkoutId}
      LIMIT 1
    `;

    if (checkouts.length === 0) {
      return NextResponse.json(
        { error: 'Checkout no encontrado en Neon.' },
        { status: 422 }
      );
    }

    const checkout = checkouts[0];

    // 4. Validar que el pago corresponde al checkout.
    if (
      !payment.order?.id &&
      !payment.metadata?.checkout_id
    ) {
      // La ausencia de estos campos no invalida por sí sola
      // un pago: external_reference es la referencia principal.
    }

    const service = getServiceById(checkout.service_id);

    if (
      !service ||
      payment.transaction_amount !== service.unitPrice ||
      payment.currency_id !== service.currency
    ) {
      return NextResponse.json(
        {
          error:
            'El pago no coincide con el catálogo oficial.',
        },
        { status: 422 }
      );
    }

    const confirmedPaymentId = String(payment.id);

    // 5. Registrar el pago sin duplicaciones.
    await sql`
      INSERT INTO mercadopago_payments (
        payment_id,
        service_id,
        amount,
        currency,
        status
      )
      VALUES (
        ${confirmedPaymentId},
        ${service.id},
        ${payment.transaction_amount},
        ${service.currency},
        'approved'
      )
      ON CONFLICT (payment_id) DO NOTHING
    `;

    if (checkout.checkout_id && payment.id) {
      await syncLecturaPayment(String(checkout.checkout_id), 'approved', String(payment.id));
    }

    // 6. Respetar el consentimiento del cliente.
    if (checkout.meta_consent !== true) {
      return NextResponse.json({
        received: true,
        approved: true,
        registered: true,
        meta: 'skipped_no_consent',
      });
    }

    // 7. Reclamar el envío para evitar duplicados.
    const claimed = await sql`
      UPDATE mercadopago_payments
      SET
        status = 'sending_meta',
        updated_at = NOW()
      WHERE payment_id = ${confirmedPaymentId}
        AND meta_purchase_sent_at IS NULL
        AND (
          status = 'approved'
          OR (
            status = 'sending_meta'
            AND updated_at < NOW() - INTERVAL '5 minutes'
          )
        )
      RETURNING payment_id
    `;

    if (claimed.length === 0) {
      return NextResponse.json({
        received: true,
        approved: true,
        meta: 'already_sent_or_processing',
      });
    }

    // 8. Enviar Purchase mediante Meta Conversions API.
    try {
      await sendMetaPurchase({
        paymentId: confirmedPaymentId,
        amount: payment.transaction_amount,
        currency: service.currency,
        emailSha256: checkout.email_sha256 ?? undefined,
      });

      // 9. Marcar el evento como enviado.
      await sql`
        UPDATE mercadopago_payments
        SET
          status = 'approved',
          meta_purchase_sent_at = NOW(),
          updated_at = NOW()
        WHERE payment_id = ${confirmedPaymentId}
      `;

      return NextResponse.json({
        received: true,
        approved: true,
        meta: 'sent',
      });
    } catch (error) {
      console.error(
        'Error al enviar Purchase a Meta:',
        error instanceof Error
          ? error.message
          : 'Error desconocido'
      );

      await sql`
        UPDATE mercadopago_payments
        SET
          status = 'approved',
          updated_at = NOW()
        WHERE payment_id = ${confirmedPaymentId}
          AND meta_purchase_sent_at IS NULL
      `;

      return NextResponse.json(
        {
          error:
            'Pago registrado. Purchase pendiente de reintento.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(
      'Error en webhook de Mercado Pago:',
      error instanceof Error
        ? error.message
        : 'Error desconocido'
    );

    return NextResponse.json(
      { error: 'Error al procesar la notificación.' },
      { status: 500 }
    );
  }
}
