
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getServiceById } from '@/lib/mercadopago/catalog';
import { getDatabase } from '@/lib/neon';


function verifySignature(request: Request, paymentId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const signature = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');

  if (!secret || !signature || !requestId || !paymentId) {
    return false;
  }

  const ts = signature.match(/(?:^|,)\s*ts=([^,]+)/)?.[1]?.trim();
  const hash = signature.match(/(?:^|,)\s*v1=([a-fA-F0-9]+)/)?.[1]?.trim();

  if (!ts || !hash || !/^\d+$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(hash)) {
    return false;
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;

  const expected = createHmac('sha256', secret)
    .update(manifest)
    .digest();

  const received = Buffer.from(hash, 'hex');

  return received.length === expected.length &&
    timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  try {
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
    
    const client = new MercadoPagoConfig({ accessToken });
    const paymentClient = new Payment(client);
    
    const payment = await paymentClient.get({ id: paymentId });
    
    if (payment.status !== 'approved') {
      return NextResponse.json({
        received: true,
        approved: false
      });
    }
    
    const service = getServiceById(payment.external_reference);

    if (
      !service ||
      payment.transaction_amount !== service.unitPrice ||
      payment.currency_id !== service.currency
    ) {
      return NextResponse.json(
        { error: 'El pago no coincide con el catálogo oficial.' },
        { status: 422 }
      );
    }
    
    
    // Pago aprobado y validado contra el catálogo.
    // Registrar en Neon sin duplicar el mismo payment_id.
    const sql = getDatabase();

    const result = await sql`
      INSERT INTO mercadopago_payments (
        payment_id,
        service_id,
        amount,
        currency,
        status
      )
      VALUES (
        ${String(payment.id)},
        ${service.id},
        ${payment.transaction_amount},
        ${service.currency},
        'approved'
      )
      ON CONFLICT (payment_id) DO NOTHING
      RETURNING payment_id
    `;

    return NextResponse.json({
      received: true,
      approved: true,
      registered: result.length > 0,
    });


    
  } catch {
    return NextResponse.json(
      { error: 'Error al procesar la notificación.' },
      { status: 400 }
    );
  }
}
