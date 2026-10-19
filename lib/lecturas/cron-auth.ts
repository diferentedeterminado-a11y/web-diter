import { validationKeysMatch } from '@/lib/lecturas/secret';

export function cronBearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/.exec(header.trim());
  return match?.[1] ?? '';
}

export function cronRequestAuthorized(request: Request): boolean {
  return validationKeysMatch(cronBearer(request), process.env.CRON_SECRET ?? '');
}
