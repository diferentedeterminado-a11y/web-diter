import { MercadoPagoConfig, Preference } from 'mercadopago';

import { getPreferenceTitle, type CatalogService } from '@/lib/mercadopago/catalog';

const SITE_URL = 'https://web-diter.vercel.app';

export async function createServicePreference(input: {
  accessToken: string;
  checkoutId: string;
  service: CatalogService;
  name: string;
  email: string;
  eventId: string;
}): Promise<{ preferenceId: string; initPoint: string }> {
  const preference = new Preference(new MercadoPagoConfig({ accessToken: input.accessToken }));
  const result = await preference.create({
    body: {
      items: [
        {
          id: input.service.id,
          title: getPreferenceTitle(input.service),
          quantity: 1,
          unit_price: input.service.unitPrice,
          currency_id: input.service.currency,
        },
      ],
      payer: {
        name: input.name,
        email: input.email,
      },
      back_urls: {
        success: `${SITE_URL}/?status=success`,
        failure: `${SITE_URL}/?status=failure`,
        pending: `${SITE_URL}/?status=pending`,
      },
      auto_return: 'approved',
      external_reference: input.checkoutId,
      metadata: {
        service_id: input.service.id,
        checkout_id: input.checkoutId,
        ...(input.eventId ? { initiate_checkout_event_id: input.eventId } : {}),
      },
    },
  });

  if (!result.id || !result.init_point) {
    throw new Error('Mercado Pago no devolvió una preferencia válida.');
  }

  return {
    preferenceId: result.id,
    initPoint: result.init_point,
  };
}
