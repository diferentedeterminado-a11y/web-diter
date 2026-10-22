import { type RemotePaymentView } from '../lecturas/return-status.ts';

export type RemoteLookupResult =
  | { availability: 'unavailable' }
  | { availability: 'ok'; payments: RemotePaymentView[] };

const CHECKOUT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function lookupRemotePayment(
  externalReference: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteLookupResult> {
  if (!CHECKOUT_UUID.test(externalReference) || !accessToken) {
    return { availability: 'unavailable' };
  }

  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('external_reference', externalReference);
  url.searchParams.set('limit', '10');

  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { availability: 'unavailable' };
    }

    const body: unknown = await response.json();
    const results = body && typeof body === 'object' && 'results' in body && Array.isArray(body.results)
      ? body.results
      : [];
    const payments = results.flatMap((payment): RemotePaymentView[] => {
      if (!payment || typeof payment !== 'object' || !('status' in payment) || typeof payment.status !== 'string') {
        return [];
      }

      const record = payment as Record<string, unknown>;
      return [{
        status: payment.status,
        amount: typeof record.transaction_amount === 'number' ? record.transaction_amount : null,
        currency: typeof record.currency_id === 'string' ? record.currency_id : null,
        externalReference: typeof record.external_reference === 'string' ? record.external_reference : null,
      }];
    });

    return { availability: 'ok', payments };
  } catch {
    return { availability: 'unavailable' };
  }
}
