export function createMetaEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `diter-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
