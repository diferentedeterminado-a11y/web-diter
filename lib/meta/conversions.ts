
import { createHash } from 'node:crypto';

type PurchaseEvent = {
  paymentId: string;
  amount: number;
  currency: string;
};

export async function sendMetaPurchase({
  paymentId,
  amount,
  currency,
}: PurchaseEvent): Promise<void> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  if (!accessToken || !pixelId) {
    throw new Error('Meta Conversions API no está configurada.');
  }

  const eventId = `mp_purchase_${paymentId}`;

  const response = await fetch(
    `https://graph.facebook.com/v25.0/${pixelId}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            action_source: 'website',
            event_source_url: 'https://web-diter.vercel.app/',
            user_data: {
              external_id: [
                createHash('sha256')
                  .update(paymentId)
                  .digest('hex'),
              ],
            },
            custom_data: {
              currency,
              value: amount,
            },
          },
        ],
        access_token: accessToken,
      }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`Meta CAPI respondió HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.events_received !== 1) {
    throw new Error('Meta no confirmó la recepción del evento Purchase.');
  }
}
