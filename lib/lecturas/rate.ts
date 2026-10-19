import { createHash } from 'node:crypto';

export function checkoutRateSubject(forwardedFor: string | null, realIp: string | null): string {
  const forwarded = forwardedFor?.split(',')[0]?.trim() ?? '';
  const address = forwarded || realIp?.trim() || 'unknown';

  return createHash('sha256').update(`lectura-checkout:${address}`).digest('hex');
}
