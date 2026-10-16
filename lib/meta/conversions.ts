
type PurchaseEvent = {
    paymentId: string;
    amount: number;
    currency: string;
    emailSha256?: string | null;
  };
  
  const META_GRAPH_API_VERSION = 'v25.0';
  const SITE_URL = 'https://web-diter.vercel.app/';
  
  export async function sendMetaPurchase({
    paymentId,
    amount,
    currency,
    emailSha256,
  }: PurchaseEvent): Promise<void> {
    const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  
    if (!accessToken || !pixelId) {
      throw new Error(
        'Meta Conversions API no está configurada.'
      );
    }
  
    // Evitar enviar eventos sin datos de identificación suficientes.
    if (
      !emailSha256 ||
      !/^[a-f0-9]{64}$/i.test(emailSha256)
    ) {
      throw new Error(
        'Purchase requiere un email SHA-256 válido y consentimiento.'
      );
    }
  
    if (
      !paymentId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !currency
    ) {
      throw new Error(
        'Los datos del evento Purchase no son válidos.'
      );
    }
  
    // Identificador estable para evitar duplicaciones en Meta.
    const eventId = `mp_purchase_${paymentId}`;
  
    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: SITE_URL,
  
          user_data: {
            em: [emailSha256.toLowerCase()],
          },
  
          custom_data: {
            currency,
            value: amount,
            order_id: paymentId,
          },
        },
      ],
    };
  
    const response = await fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );
  
    if (!response.ok) {
      throw new Error(
        `Meta CAPI respondió HTTP ${response.status}`
      );
    }
  
    const result: unknown = await response.json();
  
    if (
      !result ||
      typeof result !== 'object' ||
      !('events_received' in result) ||
      result.events_received !== 1
    ) {
      throw new Error(
        'Meta no confirmó la recepción del evento Purchase.'
      );
    }
  }
  