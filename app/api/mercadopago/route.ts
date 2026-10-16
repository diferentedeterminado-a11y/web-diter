import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getPreferenceTitle, getServiceById } from '@/lib/mercadopago/catalog';

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Error al crear preferencia en Mercado Pago.';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const service = getServiceById(body?.serviceId);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';

    if (!service) {
      return Response.json({ error: 'Servicio no válido.' }, { status: 400 });
    }

    if (!name || !email) {
      return Response.json(
        { error: 'Nombre y correo electrónico son requeridos.' },
        { status: 400 },
      );
    }

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: service.id,
            title: getPreferenceTitle(service),
            quantity: 1,
            unit_price: service.unitPrice,
            currency_id: service.currency,
          },
        ],
        payer: {
          name,
          email,
        },
        back_urls: {
          success: 'https://grupo-diter.vercel.app?status=success',
          failure: 'https://grupo-diter.vercel.app?status=failure',
          pending: 'https://grupo-diter.vercel.app?status=pending',
        },
        auto_return: 'approved',
        // Listo para tracking: asocia el pago al servicio oficial.
        // notification_url se agregará cuando exista el webhook.
        external_reference: service.id,
        metadata: {
          service_id: service.id,
          ...(eventId ? { initiate_checkout_event_id: eventId } : {}),
        },
      },
    });

    return Response.json({ init_point: result.init_point });
  } catch (error) {
    console.error('Error al crear preferencia en MP:', error);
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
